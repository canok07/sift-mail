const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const code = buildSync({ entryPoints: ['core/sync/imap.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, alias: { imapflow: path.resolve('tests/fixtures/raw-imap-client.cjs') } }).outputFiles[0].text;
const mod = new Module(path.resolve('mail-operations-runtime.cjs'), module); mod.paths = module.paths;
let transport, message, closed, responseInfo={messageId:'test-id'};
mod.require = name => name === 'nodemailer' ? { createTransport(config) { transport = config; return { async sendMail(mail) { message = mail; return responseInfo; }, close() { closed = true; } }; } } : require(name);
mod._compile(code, path.resolve('mail-operations-runtime.cjs')); const api = mod.exports;
const options = { host: 'imap.gmail.com', port: 993, secure: true, auth: { user: 'fixture@gmail.com', accessToken: 'synthetic-token' }, uid: 7, folder: 'INBOX', expectedUidValidity: '42', messageId: '<original@example.com>', index: 0 };
const raw = Buffer.from('Message-ID: <original@example.com>\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nHello\r\n--b\r\nContent-Type: application/octet-stream; name="fixture.bin"\r\nContent-Disposition: attachment; filename="fixture.bin"\r\nContent-Transfer-Encoding: base64\r\n\r\nAP8BAg==\r\n--b--\r\n');
function fixture(extra = {}) { return global.__siftRawImapFixture = { raw, fetches: [], ...extra }; }
test('SMTP partial delivery returns accepted/rejected recipients without classifying delivery as retryable failure',async()=>{
 try{responseInfo={messageId:'<partial@example.com>',accepted:['accepted@example.com'],rejected:['rejected@example.com']};
 const result=await api.sendSmtpMessage({host:'smtp.example.com',port:587,secure:false,auth:options.auth},{to:'accepted@example.com, rejected@example.com',subject:'Partial fixture',text:'Body',references:['<root@example.com>']});
 assert.equal(result.success,true);assert.equal(result.partial,true);assert.deepEqual(result.accepted,['accepted@example.com']);assert.deepEqual(result.rejected,['rejected@example.com']);assert.deepEqual(message.references,['<root@example.com>']);
 responseInfo={messageId:'<none@example.com>',accepted:[],rejected:['rejected@example.com']};const none=await api.sendSmtpMessage({host:'smtp.example.com',port:587,secure:false,auth:options.auth},{to:'rejected@example.com',subject:'None',text:'Body'});assert.equal(none.success,false);
 }finally{responseInfo={messageId:'test-id'};}
});
test('Attachment MIME bytes and filename survive download without changing read state', async () => {
  const f = fixture(); const result = await api.fetchImapAttachment(options);
  assert.equal(result.filename, 'fixture.bin'); assert.deepEqual(Buffer.from(result.content, 'base64'), Buffer.from([0, 255, 1, 2]));
  assert.equal(f.released, true); assert.equal(f.loggedOut, true); assert.ok(f.fetches.every(x => x.options.uid === true));
});
test('Attachments reject wrong generation, missing identity, changed Message-ID and oversize before source', async () => {
  for (const [extra, request, pattern] of [[{ uidValidity: '43' }, options, /UIDVALIDITY_CHANGED/], [{}, { ...options, expectedUidValidity: undefined, messageId: undefined }, /IDENTITY_REQUIRED/], [{ messageId: '<other>' }, options, /IDENTITY_CHANGED/], [{ size: 26 * 1024 * 1024 }, options, /TOO_LARGE/]]) {
    const f = fixture(extra); await assert.rejects(api.fetchImapAttachment(request), pattern); assert.ok(!f.fetches.some(x => x.query.source)); assert.equal(f.loggedOut, true);
  }
});
test('Gmail/Outlook send and reply preserve recipients, MIME attachments and threading with TLS/XOAUTH2', async () => {
  for (const host of ['smtp.gmail.com', 'smtp.office365.com']) {
    closed = false;
    const request = { to: 'receiver@example.com', cc: 'cc@example.com', bcc: 'bcc@example.com', subject: 'Re: Test', text: 'Reply', html: '<p>Reply</p>', inReplyTo: '<original@example.com>', replyTo: 'reply@example.com', attachments: [{ filename: 'fixture.bin', content: 'AP8BAg==', encoding: 'base64' }] };
    const result = await api.sendSmtpMessage({ host, port: 587, secure: false, auth: options.auth }, request);
    assert.equal(result.success, true); assert.equal(transport.requireTLS, true); assert.equal(transport.auth.type, 'OAuth2'); assert.equal(transport.auth.pass, undefined);
    assert.equal(message.from, options.auth.user); assert.equal(message.inReplyTo, request.inReplyTo); assert.equal(message.bcc, request.bcc); assert.deepEqual(message.attachments, request.attachments); assert.equal(closed, true);
  }
});
test('Real Nodemailer/mailparser round-trip preserves reply, unicode and attachment bytes without network', async () => {
  let bytes, envelope;
  const actual = require('nodemailer'), parser = require('mailparser');
  const instance = new Module(path.resolve('mail-mime-runtime.cjs'), module); instance.paths = module.paths;
  instance.require = name => name === 'nodemailer' ? { createTransport() {
    // StreamTransport intentionally includes Bcc in its diagnostic output. Use a
    // no-network transport plugin that preserves normal SMTP MIME semantics.
    const stream = actual.createTransport({ name: 'OfflineMimeTest', version: '1', send(mail, done) {
      mail.message.build((error, content) => done(error, { message: content, envelope: mail.message.getEnvelope(), messageId: mail.message.messageId() }));
    } });
    return { async sendMail(mail) { const info = await stream.sendMail(mail); bytes = info.message; envelope = info.envelope; return info; }, close() { stream.close(); } };
  } } : require(name);
  instance._compile(code, path.resolve('mail-mime-runtime.cjs'));
  const result = await instance.exports.sendSmtpMessage({ host: 'smtp.gmail.com', port: 465, secure: true, auth: options.auth }, {
    to: 'receiver@example.com', bcc: 'hidden@example.com', subject: 'Yanıt – Grüße', text: 'İçerik: teşekkürler, Grüße', inReplyTo: '<original@example.com>',
    attachments: [{ filename: 'fixture.bin', content: 'AP8BAg==', encoding: 'base64', contentType: 'application/octet-stream' }],
  });
  assert.equal(result.success, true); const mail = await parser.simpleParser(bytes);
  assert.equal(mail.subject, 'Yanıt – Grüße'); assert.match(mail.text, /teşekkürler, Grüße/); assert.equal(mail.inReplyTo, '<original@example.com>');
  assert.deepEqual(mail.attachments[0].content, Buffer.from([0, 255, 1, 2])); assert.ok(envelope.to.includes('hidden@example.com')); assert.equal(mail.bcc, undefined);
});
