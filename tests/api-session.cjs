const { buildSync } = require('esbuild');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function client(base = '') {
  const code = buildSync({ entryPoints: ['shared/services/apiClient.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: base }) } }).outputFiles[0].text;
  const mod = new Module(path.resolve('api-session-test.cjs'), module); mod.filename = path.resolve('api-session-test.cjs'); mod.paths = module.paths; mod._compile(code, mod.filename); return mod.exports;
}
function mock(t, fetcher) {
  const original = global.fetch, oldLocation = global.location;
  global.location = { origin: 'http://localhost:3000' }; global.fetch = fetcher;
  t.after(() => { global.fetch = original; global.location = oldLocation; });
}
test('failed startup handshake is retried on the next request', async t => {
  let handshake = 0;
  mock(t, async (request, init) => {
    if (String(request).includes('/api/auth/session')) { if (++handshake === 1) throw Error('offline'); return json({ token: 'new-session' }); }
    if (handshake === 1) throw Error('offline');
    assert.equal(init.headers.get('x-sift-key'), 'new-session'); return json({ success: true });
  });
  const api = client(); await assert.rejects(api.safeFetchJson('/api/plugins'));
  assert.equal((await api.safeFetchJson('/api/plugins')).success, true); assert.equal(handshake, 2);
});
test('concurrent requests share one handshake', async t => {
  let handshake = 0;
  mock(t, async request => { if (typeof request === 'string') { handshake++; await new Promise(resolve => setTimeout(resolve, 10)); return json({ token: 'session' }); } return json({ success: true }); });
  const api = client(); await Promise.all([1, 2, 3].map(() => api.safeFetchJson('/api/plugins'))); assert.equal(handshake, 1);
});
test('backend restart replays only a rejected pre-action request, preserving its body', async t => {
  let handshake = 0, requests = 0, actions = 0; const bodies = [];
  mock(t, async (request, init) => {
    if (typeof request === 'string') return json({ token: ++handshake === 1 ? 'old' : 'fresh' });
    requests++; bodies.push(await request.text());
    if (init.headers.get('x-sift-key') === 'old') return json({ code: 'SESSION_INVALID' }, 401);
    actions++; assert.equal(init.headers.get('authorization'), 'Bearer fresh'); return json({ success: true });
  });
  const api = client(); await api.getClientApiToken();
  await api.safeFetchJson('/api/smtp/send', { method: 'POST', headers: new Headers({ 'Content-Type': 'application/json' }), body: '{"mail":"fixture"}' });
  assert.equal(requests, 2); assert.equal(actions, 1); assert.deepEqual(bodies, ['{"mail":"fixture"}', '{"mail":"fixture"}']);
});
test('provider-authentication rejection and ambiguous network/send errors are never replayed', async t => {
  let requests = 0;
  mock(t, async request => { if (typeof request === 'string') return json({ token: 'session' }); requests++; return json({ error: 'provider rejection' }, 401); });
  const api = client(); await assert.rejects(api.safeFetchJson('/api/smtp/send', { method: 'POST', body: '{}' })); assert.equal(requests, 1);
  global.fetch = async () => { requests++; throw Error('connection lost after send'); };
  await assert.rejects(api.safeFetchJson('/api/smtp/send', { method: 'POST', body: '{}' })); assert.equal(requests, 2);
});
test('session token is never attached to foreign API URLs or redirects', async t => {
  let handshake = 0;
  mock(t, async (request, init) => { if (typeof request === 'string') { handshake++; return json({ token: 'private' }); } assert.equal(init.headers.get('x-sift-key'), null); assert.equal(init.headers.get('authorization'), null); return json({ success: true }); });
  await client().safeFetchJson('https://untrusted.example/api/mail'); assert.equal(handshake, 0);
});
test('explicit case-insensitive authorization headers are preserved', async t => {
  mock(t, async (request, init) => { assert.ok(request instanceof Request); assert.equal(init.headers.get('authorization'), 'Bearer explicit'); return json({ success: true }); });
  await client().safeFetchJson(new Request('http://localhost:3000/api/plugins', { headers: [['authorization', 'Bearer explicit']] }));
});
test('configured API origin is used for handshake and protected requests', async t => {
  mock(t, async (request, init) => { if (typeof request === 'string') { assert.equal(request, 'http://127.0.0.1:3456/api/auth/session'); return json({ token: 'session' }); } assert.equal(request.url, 'http://127.0.0.1:3456/api/plugins'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.get('x-sift-key'), 'session'); return json({ success: true }); });
  await client('http://127.0.0.1:3456').safeFetchJson('/api/plugins');
});
