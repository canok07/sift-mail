const { buildSync } = require('esbuild');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');

const code = buildSync({ entryPoints: ['shared/services/mailSyncService.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module(path.resolve('mail-sync-service.cjs'), module);
mod._compile(code, path.resolve('mail-sync-service.cjs'));
const { ensureFreshMicrosoftCredentials } = mod.exports;

test('expired Microsoft token refreshes once for concurrent actions', async () => {
  const previousFetch = global.fetch;
  let refreshCount = 0;
  global.fetch = async (url, options) => {
    if (String(url) === '/api/auth/session') return new Response(JSON.stringify({ token: 'local-test-token' }), { status: 200 });
    if (String(url) === '/api/oauth/microsoft/refresh') {
      refreshCount++;
      assert.equal(JSON.parse(options.body).email, 'fixture@outlook.com');
      return new Response(JSON.stringify({ success: true, accessToken: 'fresh-token', expiresIn: 3600 }), { status: 200 });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  try {
    const stale = { email: 'fixture@outlook.com', password: '', host: 'outlook.office365.com', accessToken: 'old-token', accessTokenExpiresAt: Date.now() - 1 };
    const [first, second] = await Promise.all([ensureFreshMicrosoftCredentials(stale), ensureFreshMicrosoftCredentials(stale)]);
    assert.equal(first.accessToken, 'fresh-token');
    assert.equal(second.accessToken, 'fresh-token');
    assert.equal(refreshCount, 1);
    assert.equal((await ensureFreshMicrosoftCredentials(first)).accessToken, 'fresh-token');
    assert.equal(refreshCount, 1);
  } finally { global.fetch = previousFetch; }
});
