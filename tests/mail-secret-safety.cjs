const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const secret = 'synthetic-provider-secret-DO-NOT-LOG';
class FailedImap { async connect() { throw new Error(secret); } async logout() {} }
const code = buildSync({ entryPoints: ['core/sync/imap.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false }).outputFiles[0].text;
const mod = new Module(path.resolve('secret-safety-runtime.cjs'), module); mod.paths = module.paths;
mod.require = name => name === 'imapflow' ? { ImapFlow: FailedImap } : name === 'nodemailer' ? { createTransport: () => ({ async verify() { throw new Error(secret); }, async sendMail() { throw new Error(secret); }, close() {} }) } : require(name);
mod._compile(code, path.resolve('secret-safety-runtime.cjs'));
const api = mod.exports;
const config = { host: 'imap.test', port: 993, secure: true, auth: { user: 'fixture@test.com', pass: secret } };
test('provider exceptions never leak secrets into transport results or logs', async () => {
  const oldError = console.error, logged = []; console.error = (...args) => logged.push(args);
  try {
    const outputs = [api.formatImapError(new Error(secret)), await api.testImapConnection(config), await api.fetchImapMessages(config),
      await api.testSmtpConnection(config), await api.sendSmtpMessage(config, { to: 'recipient@test.com', subject: 'Synthetic test', text: 'No real message sent' })];
    assert.ok(!JSON.stringify(outputs).includes(secret)); assert.ok(!JSON.stringify(logged).includes(secret));
    assert.deepEqual(logged, [['[Sift Mail] IMAP_FETCH_FAILED'], ['[Sift Mail] SMTP_SEND_FAILED']]);
  } finally { console.error = oldError; }
});
test('known identity errors stay actionable without provider exception text', () => {
  assert.match(api.formatImapError(new Error('IMAP_UIDVALIDITY_CHANGED')), /İşlem yapılmadı/);
  assert.ok(!api.formatImapError(Object.assign(new Error('IMAP_FOLDER_FETCH_FAILED'), { folderType: 'spam', cause: new Error(secret) })).includes(secret));
});
