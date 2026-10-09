const { buildSync } = require('esbuild');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const code = buildSync({ entryPoints: ['core/sync/imap.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, alias: { imapflow: path.resolve('tests/fixtures/raw-imap-client.cjs') } }).outputFiles[0].text;
const mod = new Module(path.resolve('raw-message-test.cjs'), module); mod.filename = path.resolve('raw-message-test.cjs'); mod.paths = module.paths; mod._compile(code, mod.filename);
const { fetchRawImapMessage } = mod.exports;
const options = { host: 'imap.example.com', port: 993, secure: true, auth: { user: 'fixture@example.com', pass: 'test-only' }, uid: 7, folder: 'Sent', expectedUidValidity: '42', messageId: '<original@example.com>' };
function fixture(t, extra = {}) {
  const raw = Buffer.from('Message-ID: <original@example.com>\r\nContent-Type: multipart/mixed; boundary="b"\r\nX-Original: untouched\r\n\r\n--b\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<strong>Gr=C3=BC=C3=9Fe</strong>\r\n--b\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\nAP8BAg==\r\n--b--\r\n');
  global.__siftRawImapFixture = { raw, fetches: [], ...extra };
  t.after(() => { delete global.__siftRawImapFixture; }); return global.__siftRawImapFixture;
}
test('EML preserves original MIME bytes, HTML, headers and nested attachments', async t => {
  const f = fixture(t); const result = await fetchRawImapMessage(options);
  assert.deepEqual(Buffer.from(result.content, 'base64'), f.raw); assert.equal(result.size, f.raw.length); assert.equal(result.contentType, 'message/rfc822');
  assert.equal(result.filename, 'Original _ message.eml'); assert.equal(f.folder, 'Sent'); assert.equal(f.released, true); assert.equal(f.loggedOut, true);
  assert.deepEqual(f.fetches.map(x => x.query), [{ size: true, envelope: true }, { source: true }]); assert.ok(f.fetches.every(x => x.uid === 7 && x.options.uid === true));
});
test('UIDVALIDITY changes reject before downloading another message', async t => {
  const f = fixture(t, { uidValidity: '99' }); await assert.rejects(fetchRawImapMessage(options), /UIDVALIDITY_CHANGED/); assert.equal(f.fetches.length, 0); assert.equal(f.released, true);
});
test('Message-ID mismatch rejects without downloading source', async t => {
  const f = fixture(t, { messageId: '<different@example.com>' }); await assert.rejects(fetchRawImapMessage(options), /IDENTITY_CHANGED/); assert.equal(f.fetches.length, 1); assert.equal(f.loggedOut, true);
});
test('oversized source is refused before downloading and respects remaining attachment budget', async t => {
  const f = fixture(t); await assert.rejects(fetchRawImapMessage({ ...options, maxBytes: 2 }), /TOO_LARGE/); assert.equal(f.fetches.length, 1);
});
test('missing identity or missing message cannot produce fabricated EML', async t => {
  const f = fixture(t); await assert.rejects(fetchRawImapMessage({ ...options, expectedUidValidity: undefined, messageId: undefined }), /IDENTITY_REQUIRED/);
  f.missing = true; await assert.rejects(fetchRawImapMessage(options), /MESSAGE_NOT_FOUND/); assert.equal(f.loggedOut, true);
});
