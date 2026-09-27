const { chromium, expect } = require('@playwright/test');
const { fork } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

(async () => {
  const port = '47838';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-reconnect-test-'));
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
    await page.addInitScript(() => localStorage.setItem('sift_accounts_meta_v1', JSON.stringify([{
      id: 'saved-account', email: 'fixture@example.com', displayName: 'Saved', provider: 'imap', isPrimary: true,
      imapConfig: { host: 'imap.saved.test', port: 993, secure: true, username: 'fixture@example.com', smtpHost: 'smtp.saved.test', smtpPort: 2525, smtpSecure: false },
    }])));
    let syncPayload;
    let sendPayload;
    let syncCalls = 0;
    await page.route('**/api/emails/sync', route => {
      syncPayload = route.request().postDataJSON();
      syncCalls++;
      return route.fulfill({ json: { success: true, messages: [{ id: 'saved-message', uid: 1, accountId: syncPayload.accountId, folder: 'INBOX', folderType: 'inbox', from: 'Sender', fromEmail: 'sender@example.com', subject: 'Saved message', date: '2026-09-27T12:00:00Z', snippet: 'Fixture', bodyText: 'Fixture', isRead: true }], mailboxes: [{ path: 'INBOX', name: 'INBOX', type: 'inbox', totalMessages: 1 }], account: { email: syncPayload.email, provider: 'imap' } } });
    });
    await page.route('**/api/smtp/send', route => { sendPayload = route.request().postDataJSON(); return route.fulfill({ json: { success: true, messageId: 'sent' } }); });
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByRole('button', { name: 'Hesap bağla' }).click();
    await page.getByPlaceholder('ornek@yandex.com, isim@sirket.com...').fill('fixture@example.com');
    await expect(page.getByPlaceholder('imap.sirketiniz.com')).toHaveValue('imap.saved.test');
    await expect(page.getByPlaceholder('smtp.sirketiniz.com')).toHaveValue('smtp.saved.test');
    await page.locator('input[type=password]').fill('fixture-password');
    await page.getByRole('button', { name: 'Oturum Aç', exact: true }).click();
    await expect.poll(() => syncCalls).toBe(1);
    if (syncPayload.host !== 'imap.saved.test') throw new Error('Saved IMAP host was lost');
    await expect(page.getByRole('button', { name: 'Oluştur', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
    await page.getByPlaceholder('ad@example.com').fill('receiver@example.com');
    await page.getByTestId('compose-modal').getByPlaceholder('Konu', { exact: true }).fill('Reconnect test');
    await page.getByTestId('compose-modal').getByPlaceholder('İleti', { exact: true }).fill('Test body');
    await page.getByRole('button', { name: 'Gönder', exact: true }).click();
    await expect.poll(() => sendPayload?.config?.host).toBe('smtp.saved.test');
    if (sendPayload.config.port !== 2525 || sendPayload.config.secure !== false) throw new Error('Saved SMTP port/TLS was lost');
    await page.getByRole('button', { name: 'Hesap ekle' }).click();
    await page.getByRole('button', { name: 'Bağlı Hesapları Yönet (1)' }).click();
    await page.getByTitle('Hesabı Kaldır').click();
    await expect(page.getByText('Kayıtlı hesapların iletilerini görmek için yeniden oturum açın.')).toHaveCount(0);
    await expect.poll(async () => {
      const response = await page.evaluate(() => fetch('/api/local/mail-cache').then(result => result.json()));
      return response.snapshot?.messages?.length;
    }).toBe(0);
    await page.getByTitle('Yenile').click();
    await page.waitForTimeout(150);
    if (syncCalls !== 1) throw new Error('Removed account was reconnected by stale session credentials');
    console.log('Account reconnect PASS: saved server settings survive login; removed account stays removed.');
  } finally {
    if (browser) await browser.close();
    child.kill();
    if (directory.startsWith(path.join(os.tmpdir(), 'sift-reconnect-test-'))) fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
