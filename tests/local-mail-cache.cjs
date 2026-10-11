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
  let syncIdentity;
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
      syncIdentity=body.accountId;
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
    await page.getByTestId('compose-modal').getByRole('textbox', { name: 'İleti', exact: true }).fill('Private draft body');
    await page.getByTestId('compose-modal').locator('input[type=file]').setInputFiles({ name: 'private.txt', mimeType: 'text/plain', buffer: Buffer.from('Private attachment') });
    await expect(page.getByText('private.txt')).toBeVisible();
    await page.getByTestId('compose-modal').getByRole('button', { name: 'Kapat' }).click();
    await expect.poll(async () => {
      const response = await page.evaluate(async () => { const {token}=await(await fetch('/api/auth/session')).json();return await(await fetch('/api/local/mail-cache',{headers:{'x-sift-key':token}})).json(); });
      return response.snapshot?.composeDraft?.attachments?.[0]?.filename === 'private.txt' ? response.snapshot.composeDraft.body : null;
    }).toBe('Private draft body');
    const cipher = fs.readFileSync(path.join(directory, 'mail-store.sqlite'));
    if (cipher.includes(Buffer.from('Private')) || cipher.includes(Buffer.from('fixture-secret-password')) || cipher.includes(Buffer.from('fixture@gmail.com'))) throw new Error('Mail database contains unencrypted private content or credentials');
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('sift_accounts_meta_v1'))).toBe(null);
    if (process.platform === 'win32' && (!fs.existsSync(path.join(directory, '.vault_key.dpapi')) || fs.existsSync(path.join(directory, '.vault_key')))) throw new Error('Windows vault key is not DPAPI-protected');
    await page.reload();
    await expect(page.getByRole('button', { name: /Private cached subject/ })).toBeVisible();
    await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
    await expect(page.getByTestId('compose-modal').getByRole('textbox', { name: 'İleti', exact: true })).toHaveText('Private draft body');
    await expect(page.getByText('private.txt')).toBeVisible();
    await page.getByTestId('compose-modal').getByRole('button', { name: 'Kapat' }).click();
    await page.getByRole('button', { name: /Private cached subject/ }).click();
    await page.getByRole('button', { name: 'Yanıtla' }).click();
    await page.getByPlaceholder('Yanıtınızı buraya yazın veya AI Asistan\'ın hazırladığı taslağı düzenleyin...').fill('Private reply draft');
    await expect.poll(async () => {
      const response = await page.evaluate(async () => { const {token}=await(await fetch('/api/auth/session')).json();return await(await fetch('/api/local/mail-cache',{headers:{'x-sift-key':token}})).json(); });
      return response.snapshot?.replyDrafts?.['cached-message']?.body;
    }).toBe('Private reply draft');
    await page.reload();
    await page.getByRole('button', { name: /Private cached subject/ }).click();
    await page.getByRole('button', { name: 'Yanıtla' }).click();
    await expect(page.getByPlaceholder('Yanıtınızı buraya yazın veya AI Asistan\'ın hazırladığı taslağı düzenleyin...')).toHaveValue('Private reply draft');
    await page.getByRole('button',{name:'Vazgeç',exact:true}).click();
    await page.keyboard.press('Escape');
    await page.getByTitle('Ayarlar',{exact:true}).click();
    await page.getByRole('button',{name:'Yerel veriler',exact:true}).click();
    const backupSettings=page.getByTestId('local-data-settings');
    fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/local-data-settings.png'});
    const password='synthetic-backup-password';
    await backupSettings.getByLabel('Yedek parolası',{exact:true}).fill(password);
    const downloading=page.waitForEvent('download');
    await backupSettings.getByRole('button',{name:'Şifreli yedeği indir'}).click();
    const download=await downloading,archivePath=path.join(directory,'synthetic.siftbackup');await download.saveAs(archivePath);
    if(fs.readFileSync(archivePath,'utf8').includes('Private'))throw new Error('Portable backup is plaintext');
    const snapshot=await page.evaluate(async()=>{const {token}=await(await fetch('/api/auth/session')).json();return(await(await fetch('/api/local/mail-cache',{headers:{'x-sift-key':token}})).json()).snapshot;});
    if(!snapshot.accounts?.length)throw new Error('Account metadata missing from encrypted store');
    if(!snapshot.syncStates?.some(state=>state.folder==='INBOX'))throw new Error('Folder checkpoint missing from encrypted store');
    snapshot.messages[0].subject='Changed local fixture';
    await page.evaluate(async snapshot=>{const {token}=await(await fetch('/api/auth/session')).json();await fetch('/api/local/mail-cache',{method:'POST',headers:{'Content-Type':'application/json','x-sift-key':token},body:JSON.stringify({snapshot})});},snapshot);
    await page.reload();await expect(page.getByRole('button',{name:/Changed local fixture/})).toBeVisible();
    await page.getByTitle('Ayarlar',{exact:true}).click();await page.getByRole('button',{name:'Yerel veriler',exact:true}).click();
    await backupSettings.getByLabel('Yedek parolası',{exact:true}).fill(password);
    await backupSettings.locator('input[type=file]').setInputFiles(archivePath);
    page.once('dialog',dialog=>dialog.dismiss());await backupSettings.getByRole('button',{name:'Yedeği geri yükle',exact:true}).click();
    await expect(backupSettings).toBeVisible();
    await backupSettings.getByLabel('Yedek parolası',{exact:true}).fill('wrong-synthetic-password');
    page.once('dialog',dialog=>dialog.accept());await backupSettings.getByRole('button',{name:'Yedeği geri yükle',exact:true}).click();
    await expect(backupSettings.getByRole('status')).toContainText('Yedek işlemi başarısız');
    await backupSettings.getByLabel('Yedek parolası',{exact:true}).fill(password);
    page.once('dialog',dialog=>dialog.accept());await backupSettings.getByRole('button',{name:'Yedeği geri yükle',exact:true}).click();
    await expect(page.getByRole('button',{name:/Private cached subject/})).toBeVisible();
    await expect(page.getByRole('button',{name:/Changed local fixture/})).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('sift_accounts_meta_v1'))).toBe(null);
    // Login clicked before encrypted account hydration must reuse the restored account, not fabricate a duplicate.
    const originalIdentity=syncIdentity;let delayed=true;
    await page.route('**/api/local/mail-cache',async route=>{if(delayed&&route.request().method()==='GET'){delayed=false;await new Promise(resolve=>setTimeout(resolve,1500));}await route.continue();});
    syncIdentity=null;await page.reload();
    await page.locator('input[type=email]').fill('fixture@gmail.com');await page.locator('input[type=password]').fill('fixture-secret-password');
    await page.getByRole('button',{name:'Oturum Aç ve Mailleri Senkronize Et'}).click();
    await expect.poll(()=>syncIdentity).toBe(originalIdentity);
    console.log('Local cache PASS: encrypted mail/drafts/accounts/cursors, portable backup, restore confirmation/cancel/wrong password and delayed-startup account identity.');
  } finally {
    if (browser) await browser.close();
    child.kill();
    if (directory.startsWith(path.join(os.tmpdir(), 'sift-mail-cache-test-'))) fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
