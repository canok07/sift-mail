const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const code = buildSync({ entryPoints: ['shared/services/mailActionSafety.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module(path.resolve('mail-action-safety.cjs'), module);
mod._compile(code, path.resolve('mail-action-safety.cjs'));
const { selectSenderHistory, executeConfirmedMailBatch } = mod.exports;
const make = (id, accountId = 'account-a', fromEmail = 'one@gmail.com', folderType = 'inbox') => ({ id, accountId, from: 'Sender', fromEmail, folderType });

test('sender cleanup never includes another Gmail sender or another account', () => {
  const anchor = make('one');
  assert.deepEqual(selectSenderHistory(anchor, [anchor, make('other-sender', 'account-a', 'two@gmail.com'), make('other-account', 'account-b'), make('archive', 'account-a', 'ONE@GMAIL.COM', 'archive')]).map(m => m.id), ['one', 'archive']);
});
test('cleanup fails closed for missing account or invalid sender', () => {
  assert.deepEqual(selectSenderHistory(make('one', undefined), []), []);
  const noAccount = { ...make('one'), accountId: undefined };
  assert.deepEqual(selectSenderHistory(noAccount, [noAccount]), []);
  const invalid = make('one', 'account-a', 'Display name');
  assert.deepEqual(selectSenderHistory(invalid, [invalid]), []);
});
test('cleanup excludes sent, drafts, trash and duplicate identities', () => {
  const anchor = make('one');
  assert.deepEqual(selectSenderHistory(anchor, [anchor, anchor, ...['sent', 'drafts', 'trash'].map(folder => make(folder, 'account-a', 'one@gmail.com', folder))]).map(m => m.id), ['one']);
});
test('batch commits successful UI updates before stopping at remote failure', async () => {
  const attempted = [], visible = [];
  const result = await executeConfirmedMailBatch([make('one'), make('two'), make('three')], async mail => {
    attempted.push(mail.id);
    if (mail.id === 'two') throw new Error('fixture failure');
  }, mail => visible.push(mail.id));
  assert.deepEqual(attempted, ['one', 'two']);
  assert.deepEqual(visible, ['one']);
  assert.deepEqual(result, { completed: ['one'], remaining: ['two', 'three'] });
});
test('batch does not execute duplicate IDs twice', async () => {
  const attempted = [];
  assert.deepEqual(await executeConfirmedMailBatch([make('one'), make('one')], async mail => { attempted.push(mail.id); }, () => {}), { completed: ['one'], remaining: [] });
  assert.deepEqual(attempted, ['one']);
});
