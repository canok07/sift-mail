const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const code = buildSync({ entryPoints: ['shared/services/accountService.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module(path.resolve('account-service-runtime.cjs'), module); mod.paths = module.paths; mod._compile(code, path.resolve('account-service-runtime.cjs'));
const api = mod.exports;
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
test('Account connection normalization is UI-independent and preserves manual SMTP overrides', () => {
  const result = api.prepareAccountConnection({ email: ' Fixture@Gmail.com ', password: 'test', smtpHost: 'smtp.custom.test', smtpPort: 587, smtpSecure: false });
  assert.equal(result.email, 'fixture@gmail.com'); assert.equal(result.host, 'imap.gmail.com'); assert.equal(result.smtpPort, 587); assert.equal(result.smtpSecure, false);
  assert.throws(() => api.prepareAccountConnection(result, { email: 'other@gmail.com' }), /eşleşmiyor/);
});
test('Shared refresh deduplicates each provider without changing manual accounts', async () => {
  const old = global.fetch, calls = [];
  global.fetch = async (url, init) => {
    const pathname = new URL(url instanceof Request ? url.url : String(url), 'http://localhost').pathname;
    if (pathname === '/api/auth/session') return json({ token: 'test-session' });
    calls.push(pathname); return json({ success: true, accessToken: 'fresh-token', expiresIn: 3600 });
  };
  try {
    const google = { email: 'fixture@gmail.com', password: '', host: 'imap.gmail.com', accessToken: 'old', accessTokenExpiresAt: 0 };
    const [a, b] = await Promise.all([api.ensureFreshAccountCredentials(google), api.ensureFreshAccountCredentials(google)]);
    assert.equal(a.accessToken, 'fresh-token'); assert.equal(b.accessToken, 'fresh-token'); assert.deepEqual(calls, ['/api/oauth/google/refresh']);
    assert.equal(await api.ensureFreshAccountCredentials(a), a);
    const manual = { email: 'manual@gmail.com', password: 'test', host: 'imap.gmail.com' }; assert.equal(await api.ensureFreshAccountCredentials(manual), manual);
  } finally { global.fetch = old; }
});
test('Refresh cancellation prevents late renderer token resurrection', async () => {
  const old = global.fetch; let release, started; const ready = new Promise(resolve => { started = resolve; });
  global.fetch = async url => {
    if (new URL(url instanceof Request ? url.url : String(url), 'http://localhost').pathname === '/api/auth/session') return json({ token: 'test-session' });
    started(); return new Promise(resolve => { release = resolve; });
  };
  try {
    const pending = api.ensureFreshAccountCredentials({ email: 'removed@gmail.com', password: '', oauthProvider: 'google' }); await ready;
    api.invalidateAccountSession('REMOVED@gmail.com'); release(json({ success: true, accessToken: 'late-token' }));
    await assert.rejects(pending, error => error.code === 'ACCOUNT_REMOVED');
  } finally { global.fetch = old; }
});
test('Reconnect only uses explicitly remembered OAuth and exposes reauthentication failure', async () => {
  const old = global.fetch;
  global.fetch = async () => json({ success: false, code: 'REAUTH_REQUIRED', error: 'Sign in again' });
  try {
    await assert.rejects(api.reconnectAccount({ email: 'fixture@outlook.com', imapConfig: { host: 'outlook.office365.com', oauthProvider: 'microsoft' } }), error => error.code === 'REAUTH_REQUIRED');
    await assert.rejects(api.reconnectAccount({ email: 'manual@outlook.com' }), error => error.code === 'MANUAL_LOGIN_REQUIRED');
  } finally { global.fetch = old; }
});
test('System-browser login polls only the authenticated backend; refresh secrets never appear in credentials', async () => {
  const old = global.fetch; const opened = [], calls = [], requestId = 'x'.repeat(43);
  global.fetch = async url => {
    const pathname = new URL(url instanceof Request ? url.url : String(url), 'http://localhost').pathname; calls.push(pathname);
    if (pathname.endsWith('/start')) return json({ success: true, authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=public-state', requestId });
    if (pathname.endsWith('/status')) return json({ status: 'complete', email: 'fixture@gmail.com', accessToken: 'short-lived-token', expiresIn: 3600 });
    return json({ success: true });
  };
  try {
    const result = await api.loginWithProvider('google', new AbortController().signal, url => opened.push(url));
    assert.equal(opened.length, 1); assert.equal(result.oauthProvider, 'google'); assert.equal(result.password, ''); assert.equal(result.smtpHost, 'smtp.gmail.com');
    assert.ok(!JSON.stringify(result).includes('refresh')); assert.ok(calls.includes('/api/oauth/google/status'));
    await assert.rejects(api.loginWithProvider('microsoft', new AbortController().signal, () => {}), error => error.code === 'OAUTH_INVALID');
  } finally { global.fetch = old; }
});
test('Cancelled OAuth cleans up pending login and never calls onConnect', async () => {
  const old = global.fetch, controller = new AbortController(), requestId = 'y'.repeat(43); let cancelled = false;
  global.fetch = async url => {
    const pathname = new URL(url instanceof Request ? url.url : String(url), 'http://localhost').pathname;
    if (pathname.endsWith('/start')) return json({ success: true, authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', requestId });
    if (pathname.endsWith('/cancel')) cancelled = true;
    return json({ status: 'pending' });
  };
  try {
    await assert.rejects(api.loginWithProvider('google', controller.signal, () => controller.abort()));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, true);
  } finally { global.fetch = old; }
});
