const { chromium, expect } = require('@playwright/test');
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

(async () => {
  const port = '47837';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-poll-test-'));
  const child = fork('dist/server.cjs', [], { env: { ...process.env, NODE_ENV: 'production', PORT: port, HOST: '127.0.0.1', SIFT_DATA_DIR: directory }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server timeout')), 20000);
      child.on('message', message => { if (message.type === 'sift-ready') { clearTimeout(timer); resolve(); } });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`server exited ${code}`)));
    });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ locale: 'tr-TR' });
    await page.clock.install();
    let inboxPolls = 0;
    let lastPollPayload = null;
    const make = uid => ({ id: `imap-acc-INBOX-1-${uid}`, uid, folder: 'INBOX', folderType: 'inbox', from: 'Sender', fromEmail: 'sender@example.com', subject: `Inbox ${uid}`, date: new Date(Date.UTC(2026, 8, 25, 12, uid)).toISOString(), snippet: 'Fixture', bodyText: 'Fixture', isRead: false });
    await page.route('**/api/emails/sync', route => {
      const body = route.request().postDataJSON();
      if (body.folder === 'INBOX') { inboxPolls++; lastPollPayload = body; }
      return route.fulfill({ json: { success: true, incremental: Boolean(body.sinceUid), messages: body.sinceUid ? [make(2)] : [make(1)], mailboxes: [{ path: 'INBOX', type: 'inbox', name: 'INBOX', totalMessages: inboxPolls ? 2 : 1, uidValidity: '1', highestUid: inboxPolls ? 2 : 1 }], account: { email: body.email, provider: 'gmail' } } });
    });
    await page.goto(`http://127.0.0.1:${port}`);
    await page.locator('input[type=email]').fill('fixture@gmail.com');
    await page.locator('input[type=password]').fill('abcdefghijklmnop');
    await page.getByRole('button', { name: 'Oturum Aç ve Mailleri Senkronize Et' }).click();
    await expect(page.getByRole('button', { name: /Inbox 1/ })).toBeVisible();
    await page.clock.fastForward(120_100);
    await expect.poll(() => inboxPolls).toBe(1);
    if (lastPollPayload.sinceUid !== 1 || lastPollPayload.expectedUidValidity !== '1') throw new Error('Inbox poll did not use the incremental UID cursor');
    await expect(page.getByRole('button', { name: /Inbox 2/ })).toBeVisible();
    console.log('Background sync PASS: new inbox message appears after polling interval.');
  } finally {
    if (browser) await browser.close();
    child.kill();
    if (directory.startsWith(path.join(os.tmpdir(), 'sift-poll-test-'))) fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
