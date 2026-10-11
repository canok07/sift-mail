const { buildSync } = require('esbuild');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
let fixture;
class FakeImap {
  constructor() { fixture.constructed = true; this.mailbox = { uidValidity: fixture.validity ?? '42' }; }
  async connect() { fixture.connected = true; }
  async list() { return [{ path: 'Trash', name: 'Trash', specialUse: '\\Trash' }, { path: 'Archive', name: 'Archive', specialUse: '\\Archive' }]; }
  async getMailboxLock(folder) { fixture.folder = folder; return { release() { fixture.released = true; } }; }
  async fetchOne(uid, query) {
    fixture.fetches++;
    if (fixture.moved && fixture.verifyError) throw new Error('provider-secret-verification');
    if (fixture.moved || fixture.missing || (fixture.flagsChanged && fixture.vanished)) return false;
    return { uid: fixture.wrongUid ? uid + 1 : uid, flags: new Set(fixture.read ? ['\\Seen'] : []), envelope: { messageId: fixture.messageId ?? '<original@test>' } };
  }
  async messageFlagsAdd() { fixture.mutations++; fixture.flagsChanged = true; fixture.read = true; }
  async messageFlagsRemove() { fixture.mutations++; fixture.flagsChanged = true; fixture.read = false; }
  async messageMove() { fixture.mutations++; fixture.moved = true; }
  async logout() { fixture.loggedOut = true; }
}
function runtime(entry, requireOverride) {
  const code = buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false }).outputFiles[0].text;
  const mod = new Module(path.resolve('mail-identity-runtime.cjs'), module); mod.paths = module.paths;
  mod.require = name => name === 'imapflow' ? { ImapFlow: FakeImap } : require(name);
  mod._compile(code, path.resolve('mail-identity-runtime.cjs')); return mod.exports;
}
const core = runtime('core/sync/imap.ts');
const { ImapActionSchema } = runtime('core/security/validation.ts');
const { buildMailActionRequest } = runtime('shared/services/mailActionIdentity.ts');
const base = { host: 'imap.test', port: 993, secure: true, auth: { user: 'owner@test.com', pass: 'synthetic-only' }, accountId: 'account-1', accountEmail: 'owner@test.com', expectedUidValidity: '42', uid: 7, sourceFolder: 'INBOX', messageId: '<original@test>' };
function reset(extra = {}) { fixture = { mutations: 0, fetches: 0, ...extra }; }
for (const action of ['mark_read', 'mark_unread', 'trash', 'archive', 'move']) {
  test(`${action}: mailbox generation mismatch rejects before any mutation`, async () => {
    reset({ validity: '99' });
    await assert.rejects(core.performImapAction({ ...base, action, destination: 'Archive' }), /UIDVALIDITY_CHANGED/);
    assert.equal(fixture.mutations, 0); assert.equal(fixture.fetches, 0); assert.ok(fixture.released && fixture.loggedOut);
  });
}
test('missing identity and wrong credentials are rejected before connecting', async () => {
  for (const extra of [{ expectedUidValidity: undefined }, { expectedUidValidity: '0' }, { expectedUidValidity: '4294967296' }, { accountId: '' }, { accountEmail: 'other@test.com' }]) {
    reset(); await assert.rejects(core.performImapAction({ ...base, ...extra, action: 'trash' }), /IDENTITY/);
    assert.equal(fixture.constructed, undefined); assert.equal(fixture.mutations, 0);
  }
});
test('missing message, wrong UID or Message-ID mismatch never mutate mail', async () => {
  for (const extra of [{ missing: true }, { wrongUid: true }, { messageId: '<other@test>' }]) {
    reset(extra); await assert.rejects(core.performImapAction({ ...base, action: 'trash' }), /MESSAGE_/);
    assert.equal(fixture.mutations, 0); assert.ok(fixture.released && fixture.loggedOut);
  }
});
test('verified read, unread and move operations still work', async () => {
  for (const action of ['mark_read', 'mark_unread', 'trash', 'archive', 'move']) {
    reset(); const result = await core.performImapAction({ ...base, action, destination: action === 'move' ? 'Archive' : undefined });
    assert.equal(result.verified, true); assert.equal(fixture.mutations, 1); assert.equal(fixture.folder, 'INBOX');
  }
});
test('disappearance cannot verify unread; connection failure cannot verify a move', async () => {
  reset({ vanished: true }); await assert.rejects(core.performImapAction({ ...base, action: 'mark_unread' }), /VERIFICATION_FAILED/);
  reset({ verifyError: true }); await assert.rejects(core.performImapAction({ ...base, action: 'trash' }), /verification/);
});
test('API action schema requires account binding and mailbox generation', () => {
  const request = { ...base, action: 'trash' }; assert.equal(ImapActionSchema.safeParse(request).success, true);
  for (const field of ['accountId', 'accountEmail', 'expectedUidValidity']) {
    const invalid = { ...request }; delete invalid[field]; assert.equal(ImapActionSchema.safeParse(invalid).success, false);
  }
  assert.equal(ImapActionSchema.safeParse({ ...request, accountEmail: 'other@test.com' }).success, false);
});
test('renderer binds message, selected account and credentials before making a request', () => {
  const email = { accountId: 'account-1', uid: 7, uidValidity: '42', folder: 'INBOX', messageId: '<original@test>' };
  const account = { id: 'account-1', email: 'owner@test.com' };
  const credentials = { host: 'imap.test', email: 'owner@test.com', password: 'synthetic-only' };
  const payload = buildMailActionRequest(email, account, credentials, 'trash');
  assert.equal(payload.expectedUidValidity, '42'); assert.equal(payload.accountEmail, account.email); assert.equal(payload.messageId, email.messageId);
  assert.throws(() => buildMailActionRequest(email, { ...account, id: 'account-2' }, credentials, 'trash'));
  assert.throws(() => buildMailActionRequest(email, account, { ...credentials, email: 'other@test.com' }, 'trash'));
  assert.throws(() => buildMailActionRequest({ ...email, uidValidity: undefined }, account, credentials, 'trash'));
});
