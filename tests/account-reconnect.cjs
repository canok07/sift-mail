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
    await page.addInitScript(() => { if (sessionStorage.getItem('fixture_initialized')) return; sessionStorage.setItem('fixture_initialized','true'); localStorage.setItem('sift_accounts_meta_v1', JSON.stringify([{
      id: 'saved-account', email: 'fixture@example.com', displayName: 'Saved', provider: 'imap', isPrimary: true,
      imapConfig: { host: 'imap.saved.test', port: 993, secure: true, username: 'fixture@example.com', smtpHost: 'smtp.saved.test', smtpPort: 2525, smtpSecure: false },
    }])); });
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
    await page.evaluate(async () => {
      const {token}=await(await fetch('/api/auth/session')).json();
      for (const entry of [
        {key:'fixture_imap',value:'synthetic-owned-password',category:'imap_password',accountEmail:'fixture@example.com'},
        {key:'other_imap',value:'synthetic-other-password',category:'imap_password',accountEmail:'other@example.com'},
        {key:'gemini_custom_api_key',value:'synthetic-shared-ai-key',category:'gemini_api_key'},
      ]) {
        const response=await fetch('/api/vault/save',{method:'POST',headers:{'Content-Type':'application/json','x-sift-key':token},body:JSON.stringify(entry)});
        if(!response.ok)throw new Error('Fixture vault setup failed');
      }
    });
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
    await page.getByTestId('compose-modal').getByRole('textbox', { name: 'İleti', exact: true }).fill('Test body');
    await page.getByRole('button', { name: 'Gönder', exact: true }).click();
    await expect.poll(() => sendPayload?.config?.host).toBe('smtp.saved.test');
    await expect(page.getByTestId('compose-modal')).toHaveCount(0);
    if (sendPayload.config.port !== 2525 || sendPayload.config.secure !== false) throw new Error('Saved SMTP port/TLS was lost');
    await page.getByRole('button', { name: 'Hesap ekle' }).click();
    await page.getByRole('button', { name: 'Bağlı Hesapları Yönet (1)' }).click();
    await page.getByTitle('Hesabı Kaldır').click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toBeVisible();
    const storedAccounts = () => page.evaluate(async () => {const {token}=await(await fetch('/api/auth/session')).json();return (await(await fetch('/api/local/mail-cache',{headers:{'x-sift-key':token}})).json()).snapshot?.accounts||[];});
    await expect.poll(async () => (await storedAccounts()).some(account => account.email === 'fixture@example.com')).toBe(true);
    await confirmation.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect.poll(async () => (await storedAccounts()).some(account => account.email === 'fixture@example.com')).toBe(true);
    await page.getByRole('button', { name: 'Hesap ekle' }).click();
    // The reopened manager retains its expanded account list after cancelling.
    await page.getByTitle('Hesabı Kaldır').click();
    await page.route('**/api/local/accounts/remove',route=>route.fulfill({status:500,json:{success:false,error:'Synthetic cleanup failure'}}));
    await confirmation.getByRole('button', { name: 'Hesabı Kaldır', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect.poll(async () => (await storedAccounts()).some(account => account.email === 'fixture@example.com')).toBe(true);
    await expect(page.getByText('Hesabın yerel verileri temizlenemedi. Kaldırma işlemini yeniden deneyin.')).toBeVisible();
    await page.getByRole('button',{name:'Etiket oluştur'}).click();
    await page.getByPlaceholder('Etiket adı').fill('Cleanup failure label');await page.keyboard.press('Enter');
    await expect.poll(()=>page.evaluate(async()=>{const {token}=await(await fetch('/api/auth/session')).json();return(await(await fetch('/api/local/mail-cache',{headers:{'x-sift-key':token}})).json()).snapshot?.labels?.some(label=>label.name==='Cleanup failure label');})).toBe(true);
    if(!(await storedAccounts()).some(account=>account.email==='fixture@example.com'))throw new Error('A subsequent metadata save erased an account after failed removal');
    await page.unroute('**/api/local/accounts/remove');
    await page.getByRole('button', { name: 'Hesap ekle' }).click();
    await page.getByTitle('Hesabı Kaldır').click();
    await confirmation.getByRole('button', { name: 'Hesabı Kaldır', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect.poll(async () => (await storedAccounts()).some(account => account.email === 'fixture@example.com')).toBe(false);
    await expect(page.getByText('Kayıtlı hesapların iletilerini görmek için yeniden oturum açın.')).toHaveCount(0);
    await expect.poll(async () => {
      const response = await page.evaluate(async () => { const {token}=await(await fetch('/api/auth/session')).json();return await(await fetch('/api/local/mail-cache',{headers:{'x-sift-key':token}})).json(); });
      return response.snapshot?.messages?.length;
    }).toBe(0);
    const keys=await page.evaluate(async()=>{const {token}=await(await fetch('/api/auth/session')).json();return(await(await fetch('/api/vault',{headers:{'x-sift-key':token}})).json()).keys.map(item=>item.key)});
    if(keys.includes('fixture_imap')||!keys.includes('other_imap')||!keys.includes('gemini_custom_api_key'))throw new Error('Account secret isolation failed');
    await page.reload();
    await expect.poll(async () => (await storedAccounts()).some(account => account.email === 'fixture@example.com')).toBe(false);
    await page.getByTitle('Yenile').click();
    await page.waitForTimeout(150);
    if (syncCalls !== 1) throw new Error('Removed account was reconnected by stale session credentials');
    console.log('Account reconnect PASS: cancel and cleanup failure preserve account; successful removal forgets owned credentials/cache, preserves other secrets and stays removed after reload.');
  } finally {
    if (browser) await browser.close();
    child.kill();
    if (directory.startsWith(path.join(os.tmpdir(), 'sift-reconnect-test-'))) fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
