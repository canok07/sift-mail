const { build } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const client = '123456-fixture.apps.googleusercontent.com';
const redirect = 'http://127.0.0.1:47831/oauth/google/callback';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
async function runtime(entry = 'core/auth/google.ts') {
  const secrets = new Map([['google_client_id', client]]); global.__siftGoogleVault = secrets;
  const code = (await build({ stdin: { contents: `export * from './${entry}';export * from './core/auth/accountLifecycle';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'vault', setup(b) {
    b.onLoad({ filter: /security[\\/]vault\.ts$/ }, () => ({ loader: 'js', contents: 'export const getVaultSecret=k=>globalThis.__siftGoogleVault.get(k);export const saveVaultSecret=(k,v)=>globalThis.__siftGoogleVault.set(k,v);' }));
  } }] })).outputFiles[0].text;
  const mod = new Module(path.resolve('google-test-runtime.cjs'), module); mod.paths = module.paths; mod._compile(code, path.resolve('google-test-runtime.cjs'));
  return { ...mod.exports, secrets };
}
test('Google Desktop PKCE uses official endpoints, offline consent and no verifier/secret in URL', async () => {
  const api = await runtime(); api.secrets.set('google_client_secret', JSON.stringify({ clientId: client, secret: 'private-fixture' }));
  const result = api.generateGoogleAuthUrl(redirect), url = new URL(result.authUrl);
  assert.equal(url.origin, 'https://accounts.google.com'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline'); assert.match(url.searchParams.get('scope'), /https:\/\/mail.google.com\//);
  assert.equal(result.verifier, undefined); assert.ok(!JSON.stringify(result).includes('private-fixture'));
  for (const bad of ['http://localhost.evil.test/oauth/google/callback', 'https://example.test/oauth/google/callback', redirect + '?x=y', redirect + '#x', redirect.replace('127.0.0.1', 'user:pass@127.0.0.1')]) assert.throws(() => api.generateGoogleAuthUrl(bad));
  assert.throws(() => api.generateGoogleAuthUrl(redirect, 'an-api-key'));
});
test('Google state is single-use, expiring and redirect-bound before network', async () => {
  const api = await runtime(), old = global.fetch, oldNow = Date.now; let calls = 0;
  global.fetch = async () => { calls++; return json({ error: 'invalid_grant' }, 400); };
  try {
    const auth = api.generateGoogleAuthUrl(redirect);
    assert.equal((await api.exchangeGoogleCode({ code: 'x', state: 'unknown', redirectUri: redirect })).success, false);
    assert.equal((await api.exchangeGoogleCode({ code: 'x', state: auth.state, redirectUri: redirect + '/' })).success, false);
    assert.equal(calls, 0);
    await Promise.all([1, 2].map(() => api.exchangeGoogleCode({ code: 'x', state: auth.state, redirectUri: redirect }))); assert.equal(calls, 1);
    const expired = api.generateGoogleAuthUrl(redirect); Date.now = () => oldNow() + 600001;
    assert.equal((await api.exchangeGoogleCode({ code: 'x', state: expired.state, redirectUri: redirect })).success, false); assert.equal(calls, 1);
  } finally { global.fetch = old; Date.now = oldNow; }
});
test('Google verified profile, PKCE and refresh/client secret remain server-side', async () => {
  const api = await runtime(); api.secrets.set('google_client_secret', JSON.stringify({ clientId: client, secret: 'private-fixture' }));
  const auth = api.generateGoogleAuthUrl(redirect), old = global.fetch; let calls = 0;
  global.fetch = async (url, init) => {
    assert.equal(init.redirect, 'error'); assert.ok(init.signal); calls++;
    if (calls === 1) { const body = new URLSearchParams(init.body); assert.equal(body.get('client_secret'), 'private-fixture'); assert.equal(body.get('code_verifier').length, 64);
      return json({ access_token: 'mail-token', refresh_token: 'private-refresh', token_type: 'Bearer', scope: api.GOOGLE_MAIL_SCOPE, expires_in: 3600 }); }
    assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo'); assert.equal(init.headers.Authorization, 'Bearer mail-token');
    return json({ email: 'Fixture@Gmail.com', email_verified: true, name: 'Fixture' });
  };
  try {
    const result = await api.exchangeGoogleCode({ code: 'code', state: auth.state, redirectUri: redirect });
    assert.equal(result.success, true); assert.equal(result.email, 'fixture@gmail.com');
    assert.equal(api.secrets.get('google_refresh_fixture@gmail.com'), 'private-refresh'); assert.equal(api.secrets.get('google_client_fixture@gmail.com'), client);
    assert.ok(!JSON.stringify(result).includes('private')); assert.equal(calls, 2);
  } finally { global.fetch = old; }
});
test('Google rejects unverified profile, missing offline consent and narrowed mail scope', async () => {
  const api = await runtime(), old = global.fetch;
  try {
    for (const scenario of ['unverified', 'missing-refresh', 'narrow-scope']) {
      global.fetch = async url => String(url).endsWith('/token')
        ? json({ access_token: 'mail', ...(scenario === 'missing-refresh' ? {} : { refresh_token: 'refresh' }), token_type: 'Bearer', scope: scenario === 'narrow-scope' ? 'openid email' : api.GOOGLE_MAIL_SCOPE })
        : json({ email: 'fixture@gmail.com', email_verified: scenario !== 'unverified' });
      const auth = api.generateGoogleAuthUrl(redirect); assert.equal((await api.exchangeGoogleCode({ code: 'code', state: auth.state, redirectUri: redirect })).success, false);
      assert.equal(api.secrets.has('google_refresh_fixture@gmail.com'), false);
    }
  } finally { global.fetch = old; }
});
test('Google refresh stays bound to original client and distinguishes revocation from network failure', async () => {
  const api = await runtime(), old = global.fetch;
  api.secrets.set('google_client_fixture@gmail.com', client); api.secrets.set('google_refresh_fixture@gmail.com', 'old-refresh');
  global.fetch = async (_url, init) => { const body = new URLSearchParams(init.body); assert.equal(body.get('client_id'), client); assert.equal(body.get('refresh_token'), 'old-refresh'); return json({ access_token: 'new-mail', refresh_token: 'new-refresh', token_type: 'Bearer' }); };
  try {
    assert.equal((await api.refreshGoogleToken('fixture@gmail.com')).accessToken, 'new-mail'); assert.equal(api.secrets.get('google_refresh_fixture@gmail.com'), 'new-refresh');
    global.fetch = async () => json({ error: 'invalid_grant', error_description: 'private-fixture' }, 400);
    const revoked = await api.refreshGoogleToken('fixture@gmail.com'); assert.equal(revoked.code, 'REAUTH_REQUIRED'); assert.ok(!JSON.stringify(revoked).includes('private-fixture'));
    global.fetch = async () => { throw Error('private-fixture'); }; assert.equal((await api.refreshGoogleToken('fixture@gmail.com')).code, 'CONNECTION_FAILED');
  } finally { global.fetch = old; }
});
test('Google secret from another client is never sent', async () => {
  const api = await runtime(), old = global.fetch;
  api.secrets.set('google_client_secret', JSON.stringify({ clientId: 'other.apps.googleusercontent.com', secret: 'wrong-secret' }));
  const auth = api.generateGoogleAuthUrl(redirect);
  global.fetch = async (_url, init) => { assert.equal(new URLSearchParams(init.body).has('client_secret'), false); return json({ error: 'invalid_grant' }, 400); };
  try { await api.exchangeGoogleCode({ code: 'code', state: auth.state, redirectUri: redirect }); } finally { global.fetch = old; }
});
test('Removing Google account during refresh or callback cannot recreate its credentials', async () => {
  const api = await runtime(), old = global.fetch;
  api.secrets.set('google_client_fixture@gmail.com', client); api.secrets.set('google_refresh_fixture@gmail.com', 'refresh');
  let release; global.fetch = () => new Promise(resolve => { release = resolve; });
  try {
    const pending = api.refreshGoogleToken('fixture@gmail.com'); api.invalidateAccount('fixture@gmail.com'); api.secrets.delete('google_refresh_fixture@gmail.com');
    release(json({ access_token: 'late', refresh_token: 'late-refresh', token_type: 'Bearer' }));
    assert.equal((await pending).success, false); assert.equal(api.secrets.has('google_refresh_fixture@gmail.com'), false);
    const auth = api.generateGoogleAuthUrl(redirect); let profileStarted;
    const started = new Promise(resolve => { profileStarted = resolve; });
    global.fetch = async url => {
      if (String(url).endsWith('/token')) return json({ access_token: 'late', refresh_token: 'late-refresh', token_type: 'Bearer' });
      profileStarted(); return new Promise(resolve => { release = resolve; });
    };
    const callback = api.exchangeGoogleCode({ code: 'code', state: auth.state, redirectUri: redirect }); await started;
    api.invalidateAccount('fixture@gmail.com'); release(json({ email: 'fixture@gmail.com', email_verified: true }));
    assert.equal((await callback).success, false); assert.equal(api.secrets.has('google_refresh_fixture@gmail.com'), false);
  } finally { global.fetch = old; }
});
test('Account broker needs a private polling capability, consumes results, isolates providers and handles denial', async () => {
  const api = await runtime('core/auth/accountService.ts');
  const login = api.startAccountLogin('google', 'http://127.0.0.1:47831'); const state = new URL(login.authUrl).searchParams.get('state');
  assert.notEqual(login.requestId, state); assert.equal(api.accountLoginStatus('google', state).status, 'expired');
  assert.equal(api.accountLoginStatus('microsoft', login.requestId).status, 'expired');
  assert.equal(api.accountLoginStatus('google', login.requestId).status, 'pending');
  assert.equal(await api.finishAccountLogin('microsoft', { state, denied: true }), false);
  assert.equal(await api.finishAccountLogin('google', { state, denied: true }), false);
  assert.equal(api.accountLoginStatus('google', login.requestId).status, 'failed');
  assert.equal(api.accountLoginStatus('google', login.requestId).status, 'expired');
  const cancelled = api.startAccountLogin('google', 'http://127.0.0.1:47831'); api.cancelAccountLogin('google', cancelled.requestId);
  assert.equal(api.accountLoginStatus('google', cancelled.requestId).status, 'expired');
});
test('Cancel during broker callback cannot leave new Google credentials in the vault', async () => {
  const api = await runtime('core/auth/accountService.ts'), old = global.fetch;
  const login = api.startAccountLogin('google', 'http://127.0.0.1:47831'), state = new URL(login.authUrl).searchParams.get('state');
  let release, profileStarted; const started = new Promise(resolve => { profileStarted = resolve; });
  global.fetch = async url => {
    if (String(url).endsWith('/token')) return json({ access_token: 'mail', refresh_token: 'refresh', token_type: 'Bearer' });
    profileStarted(); return new Promise(resolve => { release = resolve; });
  };
  try {
    const pending = api.finishAccountLogin('google', { state, code: 'code' }); await started; api.cancelAccountLogin('google', login.requestId);
    release(json({ email: 'cancelled@gmail.com', email_verified: true }));
    assert.equal(await pending, false); assert.equal(api.secrets.has('google_refresh_cancelled@gmail.com'), false);
    assert.equal(api.accountLoginStatus('google', login.requestId).status, 'expired');
  } finally { global.fetch = old; }
});
