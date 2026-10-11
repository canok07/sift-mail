const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function runtime(entry) {
  const code = buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false }).outputFiles[0].text;
  const mod = new Module(path.resolve('account-cleanup-runtime.cjs'), module); mod.paths = module.paths;
  mod._compile(code, path.resolve('account-cleanup-runtime.cjs')); return mod.exports;
}
test('confirmed account cleanup removes only owned encrypted credentials and cached data; retry is safe', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-account-cleanup-'));
  const previous = process.env.SIFT_DATA_DIR; process.env.SIFT_DATA_DIR = directory;
  try {
    const vault = runtime('core/security/vault.ts'), cache = runtime('core/security/mailStore.ts'), cleanup = runtime('core/security/accountCleanup.ts');
    vault.saveVaultSecret('ms_refresh_owner@test.com', 'synthetic-refresh', 'custom_token');
    vault.saveVaultSecret('ms_client_owner@test.com', 'synthetic-client', 'custom_token');
    vault.saveVaultSecret('google_refresh_owner@test.com', 'synthetic-google-refresh', 'custom_token');
    vault.saveVaultSecret('google_client_owner@test.com', 'synthetic-google-client', 'custom_token');
    vault.saveVaultSecret('google_secret_owner@test.com', 'synthetic-google-secret', 'custom_token');
    vault.saveVaultSecret('google_client_id', 'shared-oauth-registration', 'custom_token');
    vault.saveVaultSecret('owned-password', 'synthetic-password', 'imap_password', 'Mail password', 'OWNER@test.com');
    vault.saveVaultSecret('owned-smtp', 'synthetic-smtp', 'smtp_password', 'SMTP password', 'owner@test.com');
    vault.saveVaultSecret('imap_password_owner@test.com', 'legacy-password', 'imap_password');
    vault.saveVaultSecret('other-password', 'other-secret', 'imap_password', 'Other', 'other@test.com');
    vault.saveVaultSecret('gemini_custom_api_key', 'shared-ai-secret', 'gemini_api_key');
    vault.saveVaultSecret('unbound-password', 'unbound-secret', 'imap_password', 'Cannot infer account');
    vault.saveVaultSecret('ms_refresh_owner@test.com.extra', 'similar-but-unrelated', 'custom_token');
    cache.saveLocalMailSnapshot({ version: 1, messages: [{ id: 'a', accountId: 'account-1' }, { id: 'b', accountId: 'account-2' }],
      composeDraft: { accountId: 'account-1', body: 'private' }, replyDrafts: { a: { accountId: 'account-1' }, b: { accountId: 'account-2' } } });
    cleanup.removeLocalAccount('account-1', 'OWNER@test.com');
    for (const key of ['ms_refresh_owner@test.com', 'ms_client_owner@test.com', 'google_refresh_owner@test.com', 'google_client_owner@test.com', 'google_secret_owner@test.com', 'owned-password', 'owned-smtp', 'imap_password_owner@test.com']) assert.equal(vault.getVaultSecret(key), null);
    assert.equal(vault.getVaultSecret('google_client_id'), 'shared-oauth-registration');
    for (const key of ['other-password', 'gemini_custom_api_key', 'unbound-password', 'ms_refresh_owner@test.com.extra']) assert.ok(vault.getVaultSecret(key));
    const snapshot = cache.loadLocalMailSnapshot(); assert.deepEqual(snapshot.messages, [{ id: 'b', accountId: 'account-2' }]);
    assert.equal(snapshot.composeDraft, null); assert.deepEqual(snapshot.replyDrafts, { b: { accountId: 'account-2' } });
    const cipher = fs.readFileSync(path.join(directory, 'vault.enc'), 'utf8'); assert.ok(cipher.startsWith('gcm:v1:')); assert.ok(!cipher.includes('synthetic'));
    cleanup.removeLocalAccount('account-1', 'owner@test.com'); assert.ok(vault.getVaultSecret('other-password'));
    assert.ok(vault.getVaultSummary().keys.every(item => item.maskedValue === '••••••••'));
  } finally { if (previous === undefined) delete process.env.SIFT_DATA_DIR; else process.env.SIFT_DATA_DIR = previous; fs.rmSync(directory, { recursive: true, force: true }); }
});
test('corrupted cache fails visibly instead of reporting a completed cleanup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-cleanup-corrupt-'));
  const previous = process.env.SIFT_DATA_DIR; process.env.SIFT_DATA_DIR = directory;
  try {
    const cleanup = runtime('core/security/accountCleanup.ts');
    fs.writeFileSync(path.join(directory, 'mail-cache.enc'), 'corrupt-fixture');
    assert.throws(() => cleanup.removeLocalAccount('account-1', 'owner@test.com'));
    assert.equal(fs.readFileSync(path.join(directory, 'mail-cache.enc'), 'utf8'), 'corrupt-fixture');
  } finally { if (previous === undefined) delete process.env.SIFT_DATA_DIR; else process.env.SIFT_DATA_DIR = previous; fs.rmSync(directory, { recursive: true, force: true }); }
});
test('queued renderer cache writes cannot resurrect an account blocked for removal', async () => {
  const api = runtime('shared/services/localMailStore.ts');
  const oldFetch = global.fetch, oldWindow = global.window; const bodies = [];
  global.window = { location: { origin: 'http://localhost:3000' }, sessionStorage: { getItem: () => 'fixture-session', setItem() {}, removeItem() {} } };
  global.fetch = async (url, init) => {
    const address = url instanceof Request ? url.url : String(url);
    if (address.includes('/api/auth/session')) return new Response(JSON.stringify({ token: 'fixture-session' }));
    bodies.push(url instanceof Request ? await url.json() : JSON.parse(init.body)); return new Response(JSON.stringify({ success: true }));
  };
  try {
    api.blockAccountCache('account-1');
    await api.saveLocalMailSnapshot({ version: 1, messages: [{ accountId: 'account-1' }, { accountId: 'account-2' }], composeDraft: { accountId: 'account-1' }, replyDrafts: { a: { accountId: 'account-1' }, b: { accountId: 'account-2' } } });
    assert.deepEqual(bodies.at(-1).snapshot.messages, [{ accountId: 'account-2' }]);
    assert.equal(bodies.at(-1).snapshot.composeDraft, null); assert.deepEqual(Object.keys(bodies.at(-1).snapshot.replyDrafts), ['b']);
    await api.forgetLocalAccount('account-1', 'owner@test.com'); assert.deepEqual(bodies.at(-1), { accountId: 'account-1', email: 'owner@test.com' });
  } finally { global.fetch = oldFetch; global.window = oldWindow; }
});
test('local cleanup API requires authentication, valid identity and a loopback Host', async () => {
  const { fork } = require('node:child_process');
  const http = require('node:http');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-cleanup-api-'));
  const child = fork('dist/server.cjs', [], { env: { ...process.env, NODE_ENV: 'production', PORT: '0', HOST: '127.0.0.1', SIFT_DATA_DIR: directory }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cleanup API startup timeout')), 20000);
      child.on('message', message => { if (message.type === 'sift-ready') { clearTimeout(timer); resolve(message.port); } });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', () => { clearTimeout(timer); reject(new Error('Cleanup API exited')); });
    });
    const base = `http://127.0.0.1:${port}`;
    const { token } = await (await fetch(base + '/api/auth/session')).json();
    const request = (endpoint, body, authenticated = true) => fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'x-sift-key': token } : {}) }, body: JSON.stringify(body) });
    const removal = { accountId: 'account-1', email: 'owner@test.com' };
    assert.equal((await request('/api/local/accounts/remove', removal, false)).status, 401);
    assert.equal((await request('/api/local/accounts/remove', { ...removal, email: 'invalid' })).status, 400);
    const remoteStatus = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/local/accounts/remove', method: 'POST', headers: { Host: 'remote.example', 'Content-Type': 'application/json', 'x-sift-key': token } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end(JSON.stringify(removal));
    });
    assert.equal(remoteStatus, 403);
    assert.equal((await request('/api/imap/action', { host: '127.0.0.1', port: 1, secure: true, auth: { user: removal.email, pass: 'synthetic-only' }, accountId: removal.accountId, accountEmail: removal.email, uid: 7, sourceFolder: 'INBOX', action: 'trash' })).status, 400);
    assert.equal((await request('/api/vault/save', { key: 'owned', value: 'synthetic-only', category: 'imap_password', accountEmail: removal.email })).status, 200);
    assert.equal((await request('/api/local/mail-cache', { snapshot: { version: 1, messages: [{ id: 'a', accountId: 'account-1' }, { id: 'b', accountId: 'account-2' }], composeDraft: null, replyDrafts: {} } })).status, 200);
    assert.equal((await request('/api/local/accounts/remove', removal)).status, 200);
    const options = { headers: { 'x-sift-key': token } };
    const vault = await (await fetch(base + '/api/vault', options)).json(); assert.ok(!vault.keys.some(item => item.key === 'owned'));
    const cache = await (await fetch(base + '/api/local/mail-cache', options)).json(); assert.deepEqual(cache.snapshot.messages, [{ id: 'b', accountId: 'account-2' }]);
  } finally {
    if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
