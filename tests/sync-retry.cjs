const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const code = buildSync({ entryPoints: ['shared/services/mailSyncService.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module(path.resolve('sync-retry-bundle.cjs'), module);
mod._compile(code, path.resolve('sync-retry-bundle.cjs'));
const { syncEmailsFromBackend } = mod.exports;
const credentials = { email: 'fixture@example.com', password: 'secret', host: 'imap.example.com', port: 993, secure: true, folder: 'INBOX' };

test('transient server failure reconnects with bounded retry', async () => {
  let syncAttempts = 0;
  global.fetch = async input => {
    if (String(input).includes('/api/auth/session')) return new Response(JSON.stringify({ token: 'fixture-token' }), { status: 200 });
    syncAttempts++;
    if (syncAttempts === 1) return new Response(JSON.stringify({ success: false, error: 'Connection temporarily unavailable', retryable: true }), { status: 503 });
    return new Response(JSON.stringify({ success: true, incremental: true, messages: [], mailboxes: [], account: { email: credentials.email, provider: 'imap' } }), { status: 200 });
  };
  const result = await syncEmailsFromBackend(credentials, { retries: 2, retryDelayMs: 1 });
  assert.equal(syncAttempts, 2);
  assert.equal(result.incremental, true);
});

test('credential failure is not retried', async () => {
  let syncAttempts = 0;
  global.fetch = async input => {
    if (String(input).includes('/api/auth/session')) return new Response(JSON.stringify({ token: 'fixture-token' }), { status: 200 });
    syncAttempts++;
    return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 200 });
  };
  await assert.rejects(() => syncEmailsFromBackend(credentials, { retries: 2, retryDelayMs: 1 }), /Invalid credentials/);
  assert.equal(syncAttempts, 1);
});
