const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const code = buildSync({ entryPoints: ['shared/services/mailMerge.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = new Module(path.resolve('mail-merge.cjs'), module);
mod._compile(code, path.resolve('mail-merge.cjs'));
const { mergeMailRefresh } = mod.exports;
const email = (uid, folder = 'INBOX', generation = 1) => ({ id: `imap-acc-${folder}-${generation}-${uid}`, uid, folder, folderType: 'inbox', accountId: 'acc', subject: `Message ${uid}`, from: 'Sender', date: '2026-09-25', snippet: '', isRead: false, labels: [] });

test('refresh keeps older pages and local labels but removes deleted recent messages', () => {
  const old = [email(1), email(101), { ...email(99), labels: ['user:important'], safeCategory: 'work' }, email(5, 'Sent')];
  const fresh = [{ ...email(99), isRead: true }, email(100)];
  const result = mergeMailRefresh(old, fresh, 'acc', ['INBOX']);
  assert.deepEqual(result.messages.map(message => message.uid).sort((a,b) => a-b), [1, 5, 99, 100]);
  assert.equal(result.messages.find(message => message.uid === 99).isRead, true);
  assert.deepEqual(result.messages.find(message => message.uid === 99).labels, ['user:important']);
  assert.equal(result.messages.find(message => message.uid === 99).safeCategory, 'work');
  assert.deepEqual(result.added.map(message => message.uid), [100]);
});

test('UIDVALIDITY change does not retain old mailbox generation', () => {
  const result = mergeMailRefresh([email(1, 'INBOX', 1)], [email(100, 'INBOX', 2)], 'acc', ['INBOX']);
  assert.deepEqual(result.messages.map(message => message.uid), [100]);
});
