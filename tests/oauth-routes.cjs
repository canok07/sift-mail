const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const express = require('express');

test('Desktop OAuth routes authenticate config/polling, protect secret bindings and complete backend callbacks', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-oauth-routes-'));
  const previous = process.env.SIFT_DATA_DIR, originalFetch = global.fetch; process.env.SIFT_DATA_DIR = directory;
  let server;
  try {
    const code = buildSync({ stdin: { contents: "export * from './core/routes/accounts';export {getActiveSessionToken} from './core/security';export {getVaultSecret,getVaultSummary} from './core/security/vault';export {invalidateAccount} from './core/auth/accountLifecycle';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false }).outputFiles[0].text;
    const mod = new Module(path.resolve('oauth-routes-runtime.cjs'), module); mod.paths = module.paths; mod._compile(code, path.resolve('oauth-routes-runtime.cjs')); const api = mod.exports;
    const app = express(); app.use(express.json()); app.use(api.createAccountRouter());
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const port = server.address().port, origin = `http://127.0.0.1:${port}`, token = api.getActiveSessionToken();
    const request = (route, body, auth = true) => originalFetch(origin + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal((await request('/api/oauth/config', undefined, false)).status, 401);
    const hostile = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/api/oauth/config', headers: { Host: 'evil.test', Authorization: `Bearer ${token}` } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    }); assert.equal(hostile, 403);
    assert.equal((await request('/api/oauth/config', { provider: 'google', clientId: 'an-ai-key' })).status, 400);
    const clientId = '123456-fixture.apps.googleusercontent.com', secret = 'synthetic-private-client-secret';
    assert.equal((await request('/api/oauth/config', { provider: 'google', clientId, clientSecret: secret })).status, 200);
    const configResponse = await request('/api/oauth/config'); assert.equal(configResponse.headers.get('cache-control'), 'no-store');
    const configText = await configResponse.text(); assert.ok(!configText.includes(secret)); assert.ok(!JSON.stringify(api.getVaultSummary()).includes(secret));
    const authResponse = await request('/api/oauth/google/start', {}), login = await authResponse.json(); assert.equal(authResponse.status, 200);
    const state = new URL(login.authUrl).searchParams.get('state'); assert.ok(!JSON.stringify(login).includes(secret));
    assert.equal((await request('/api/oauth/google/status', { requestId: login.requestId }, false)).status, 401);
    assert.equal((await request('/api/oauth/google/status', { requestId: state })).status, 400);
    assert.equal((await (await request('/api/oauth/google/status', { requestId: login.requestId })).json()).status, 'pending');
    global.fetch = async (url, init) => {
      if (String(url).endsWith('/token')) { assert.equal(new URLSearchParams(init.body).get('client_secret'), secret); return new Response(JSON.stringify({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'Bearer', scope: 'https://mail.google.com/', expires_in: 3600 })); }
      assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo'); return new Response(JSON.stringify({ email: 'fixture@gmail.com', email_verified: true }));
    };
    const callback = await request(`/oauth/google/callback?state=${state}&code=fixture-code`), html = await callback.text();
    assert.ok(html.includes('Giriş tamamlandı')); assert.ok(!html.includes('fixture-code')); assert.ok(!html.includes('fixture-access')); assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
    const completed = await (await request('/api/oauth/google/status', { requestId: login.requestId })).json(); assert.equal(completed.status, 'complete'); assert.equal(completed.accessToken, 'fixture-access'); assert.ok(!JSON.stringify(completed).includes('fixture-refresh'));
    assert.equal((await (await request('/api/oauth/google/status', { requestId: login.requestId })).json()).status, 'expired');
    const cipher = fs.readFileSync(path.join(directory, 'vault.enc'), 'utf8'); assert.ok(!cipher.includes(secret)); assert.ok(!cipher.includes('fixture-refresh'));
    const next = await (await request('/api/oauth/google/start', {})).json();
    await request(`/oauth/google/callback?state=${new URL(next.authUrl).searchParams.get('state')}&code=fixture-code`);
    api.invalidateAccount('fixture@gmail.com'); assert.equal((await (await request('/api/oauth/google/status', { requestId: next.requestId })).json()).status, 'failed');
    const malformed = await (await request('/oauth/google/callback?code=%3Cscript%3Ebad%3C%2Fscript%3E&state=unknown')).text(); assert.ok(!malformed.includes('<script>bad'));
  } finally {
    global.fetch = originalFetch; if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (previous === undefined) delete process.env.SIFT_DATA_DIR; else process.env.SIFT_DATA_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
