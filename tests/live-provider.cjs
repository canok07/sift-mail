// Opt-in authentication/transport check. Never sends, moves or deletes mail.
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const email = process.env.SIFT_LIVE_EMAIL?.trim();
const password = process.env.SIFT_LIVE_PASSWORD;
const accessToken = process.env.SIFT_LIVE_ACCESS_TOKEN;
if (!email || (!password && !accessToken)) {
  console.error('BLOCKED: provide SIFT_LIVE_EMAIL and a fresh SIFT_LIVE_PASSWORD or SIFT_LIVE_ACCESS_TOKEN in the process environment. No account was contacted.');
  process.exit(2);
}
function load(entry) {
  const code = buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false }).outputFiles[0].text;
  const mod = new Module(path.resolve('live-provider-runtime.cjs'), module); mod.filename = path.resolve('live-provider-runtime.cjs'); mod.paths = module.paths; mod._compile(code, mod.filename); return mod.exports;
}
(async () => {
  const provider = load('core/mail/providerManager.ts').detectMailProvider(email);
  const auth = { user: email, ...(accessToken ? { accessToken } : { pass: password }) };
  const { testImapConnection, testSmtpConnection } = load('core/sync/imap.ts');
  const imap = await testImapConnection({ host: process.env.SIFT_LIVE_IMAP_HOST || provider.imapHost, port: Number(process.env.SIFT_LIVE_IMAP_PORT || provider.imapPort), secure: true, auth });
  if (!imap.success) throw Error('IMAP_AUTH_OR_FOLDER_CHECK_FAILED');
  console.log(`PASS: real ${provider.provider} IMAP authentication and folder discovery.`);
  const port = Number(process.env.SIFT_LIVE_SMTP_PORT || provider.smtpPort);
  const smtp = await testSmtpConnection({ host: process.env.SIFT_LIVE_SMTP_HOST || provider.smtpHost, port, secure: port === 465, auth });
  if (!smtp.success) throw Error('SMTP_AUTH_OR_TRANSPORT_CHECK_FAILED');
  console.log(`PASS: real ${provider.provider} SMTP authentication/transport. No mail was sent. This does not prove end-to-end delivery.`);
})().catch(error => {
  // Never print credentials, email addresses, protocol logs or raw provider exceptions.
  console.error(['IMAP_AUTH_OR_FOLDER_CHECK_FAILED', 'SMTP_AUTH_OR_TRANSPORT_CHECK_FAILED'].includes(error.message) ? error.message : 'LIVE_PROVIDER_CHECK_FAILED');
  process.exitCode = 1;
});
