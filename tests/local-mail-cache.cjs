const { chromium, expect } = require('@playwright/test');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-mail-cache-test-'));
  const port = '47839';
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
    await page.route('**/api/emails/sync', route => {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { success: true, messages: [{ id: 'cached-message', uid: 1, accountId: body.accountId, folder: 'INBOX', folderType: 'inbox', from: 'Sender', fromEmail: 'sender@example.com', subject: 'Private cached subject', date: '2026-09-27T12:00:00Z', snippet: 'Private preview', bodyText: 'Private body', isRead: false }], mailboxes: [{ path: 'INBOX', name: 'INBOX', type: 'inbox', totalMessages: 1 }], account: { email: body.email, provider: 'gmail' } } });
    });
    await page.goto(`http://127.0.0.1:${port}`);
    const session = await page.evaluate(() => fetch('/api/auth/session').then(response => response.json()));
    const forbiddenStatus = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: Number(port), path: '/api/local/mail-cache', headers: { Host: 'evil.example', 'x-sift-key': session.token } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    if (forbiddenStatus !== 403) throw new Error('Remote Host could read local mail cache');
    await page.locator('input[type=email]').fill('fixture@gmail.com');
    await page.locator('input[type=password]').fill('fixture-secret-password');
    await page.getByRole('button', { name: 'Oturum Aç ve Mailleri Senkronize Et' }).click();
    await expect(page.getByRole('button', { name: /Private cached subject/ })).toBeVisible();
    await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
    await page.getByTestId('compose-modal').getByPlaceholder('İleti', { exact: true }).fill('Private draft body');
    await page.getByTestId('compose-modal').locator('input[type=file]').setInputFiles({ name: 'private.txt', mimeType: 'text/plain', buffer: Buffer.from('Private attachment') });
    await expect(page.getByText('private.txt')).toBeVisible();
    await page.getByTestId('compose-modal').getByRole('button', { name: 'Kapat' }).click();
    await expect.poll(async () => {
      const response = await page.evaluate(() => fetch('/api/local/mail-cache').then(result => result.json()));
      return response.snapshot?.composeDraft?.attachments?.[0]?.filename === 'private.txt' ? response.snapshot.composeDraft.body : null;
    }).toBe('Private draft body');
    const cipher = fs.readFileSync(path.join(directory, 'mail-cache.enc'), 'utf8');
    if (!cipher.startsWith('gcm:v1:') || cipher.includes('Private') || cipher.includes('fixture-secret-password')) throw new Error('Mail cache is not encrypted or contains credentials');
    if (process.platform === 'win32' && (!fs.existsSync(path.join(directory, '.vault_key.dpapi')) || fs.existsSync(path.join(directory, '.vault_key')))) throw new Error('Windows vault key is not DPAPI-protected');
    await page.reload();
    await expect(page.getByRole('button', { name: /Private cached subject/ })).toBeVisible();
    await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
    await expect(page.getByTestId('compose-modal').getByPlaceholder('İleti', { exact: true })).toHaveValue('Private draft body');
    await expect(page.getByText('private.txt')).toBeVisible();
    await page.getByTestId('compose-modal').getByRole('button', { name: 'Kapat' }).click();
    await page.getByRole('button', { name: /Private cached subject/ }).click();
    await page.getByRole('button', { name: 'Yanıtla' }).click();
    await page.getByPlaceholder('Yanıtınızı buraya yazın veya AI Asistan\'ın hazırladığı taslağı düzenleyin...').fill('Private reply draft');
    await expect.poll(async () => {
      const response = await page.evaluate(() => fetch('/api/local/mail-cache').then(result => result.json()));
      return response.snapshot?.replyDrafts?.['cached-message']?.body;
    }).toBe('Private reply draft');
    await page.reload();
    await page.getByRole('button', { name: /Private cached subject/ }).click();
    await page.getByRole('button', { name: 'Yanıtla' }).click();
    await expect(page.getByPlaceholder('Yanıtınızı buraya yazın veya AI Asistan\'ın hazırladığı taslağı düzenleyin...')).toHaveValue('Private reply draft');
    console.log('Local cache PASS: encrypted mail, compose draft and reply draft survive reload without persisting login secret.');
  } finally {
    if (browser) await browser.close();
    child.kill();
    if (directory.startsWith(path.join(os.tmpdir(), 'sift-mail-cache-test-'))) fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
