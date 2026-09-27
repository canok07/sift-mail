const { chromium, expect } = require('@playwright/test');
const { fork } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');

(async () => {
  const port = '47836';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-oauth-test-'));
  const child = fork('dist/server.cjs', [], {
    env: { ...process.env, NODE_ENV: 'production', PORT: port, HOST: '127.0.0.1', SIFT_DATA_DIR: directory },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
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
    const base = `http://127.0.0.1:${port}`;
    const deniedStatus = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/api/auth/session', headers: { Host: 'public.example.com' } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      }).on('error', reject);
    });
    assert.equal(deniedStatus, 403, 'public Host must not receive a local session token');
    let syncPayload;
    let smtpPayload;
    await page.route('**/api/oauth/microsoft/auth-url**', route => route.fulfill({ json: {
      success: true, authUrl: `${base}/oauth/microsoft/callback?code=fixture-code&state=fixture-state`,
    } }));
    await page.route('**/api/oauth/microsoft/callback', route => route.fulfill({ json: {
      success: true, email: 'fixture@outlook.com', accessToken: 'fixture-oauth-token', expiresIn: 3600,
    } }));
    await page.route('**/api/emails/sync', route => {
      syncPayload = route.request().postDataJSON();
      return route.fulfill({ json: { success: true, messages: [], mailboxes: [], account: { email: syncPayload.email, provider: syncPayload.email.endsWith('@outlook.com') ? 'outlook' : 'imap' } } });
    });
    await page.route('**/api/smtp/send', route => {
      smtpPayload = route.request().postDataJSON();
      return route.fulfill({ json: { success: true, messageId: 'fixture-sent' } });
    });
    await page.goto(base);
    await page.getByTitle('Hesaplar').click();
    await page.getByRole('button', { name: 'Microsoft / Outlook' }).click();
    await expect.poll(() => syncPayload?.accessToken).toBe('fixture-oauth-token');
    assert.equal(syncPayload.email, 'fixture@outlook.com');
    assert.equal(syncPayload.password, '');

    await page.getByTitle('Hesaplar').click();
    await page.getByPlaceholder('ornek@yandex.com, isim@sirket.com...').fill('fixture@custom.test');
    await page.getByPlaceholder('••••••••••••••••').fill('fixture-password');
    await page.getByPlaceholder('smtp.sirketiniz.com').fill('smtp.custom.test');
    await page.getByText('Port & TLS').locator('..').locator('input[type=number]').fill('587');
    await page.getByText('Port & TLS').locator('..').locator('input[type=checkbox]').uncheck();
    await page.getByRole('button', { name: 'Oturum Aç', exact: true }).click();
    await expect.poll(() => syncPayload?.email).toBe('fixture@custom.test');
    await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
    await page.getByPlaceholder('ad@example.com').fill('receiver@example.com');
    await page.getByTestId('compose-modal').getByPlaceholder('Konu', { exact: true }).fill('SMTP ayar testi');
    await page.getByTestId('compose-modal').getByPlaceholder('İleti', { exact: true }).fill('Test iletisi');
    await page.getByRole('button', { name: 'Gönder', exact: true }).click();
    await expect.poll(() => smtpPayload?.config?.host).toBe('smtp.custom.test');
    assert.equal(smtpPayload.config.port, 587);
    assert.equal(smtpPayload.config.secure, false);

    const stored = await page.evaluate(() => localStorage.getItem('sift_accounts_meta_v1'));
    assert(stored.includes('fixture@custom.test'));
    assert(!stored.includes('fixture-password') && !stored.includes('fixture-oauth-token'), 'account metadata must not contain credentials');
    await page.reload();
    await expect(page.getByText('Kayıtlı hesapların iletilerini görmek için yeniden oturum açın.')).toBeVisible();

    const html = await page.evaluate(async baseUrl => (await fetch(`${baseUrl}/oauth/microsoft/callback?code=${encodeURIComponent('</script><script>window.hacked=true</script>')}&state=x`)).text(), base);
    assert(!html.includes('</script><script>window.hacked=true</script>'), 'OAuth callback script injection was not escaped');
    console.log('Mail setup PASS: OAuth popup, first token sync, callback escaping, SMTP settings, safe account metadata.');
  } finally {
    if (browser) await browser.close();
    child.kill();
    if (directory.startsWith(path.join(os.tmpdir(), 'sift-oauth-test-'))) fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
