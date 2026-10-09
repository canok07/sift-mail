class ImapFlow {
  constructor() { this.fixture = global.__siftRawImapFixture; this.mailbox = { uidValidity: this.fixture.uidValidity || '42' }; }
  async connect() { this.fixture.connected = true; }
  async getMailboxLock(folder) { this.fixture.folder = folder; return { release: () => { this.fixture.released = true; } }; }
  async fetchOne(uid, query, options) {
    this.fixture.fetches.push({ uid, query, options });
    if (this.fixture.missing) return false;
    if (query.source) return { source: this.fixture.raw };
    return { size: this.fixture.size ?? this.fixture.raw.length, envelope: { subject: 'Original / message', messageId: this.fixture.messageId || '<original@example.com>' } };
  }
  async logout() { this.fixture.loggedOut = true; }
  close() { this.fixture.closed = true; }
}
module.exports = { ImapFlow };
