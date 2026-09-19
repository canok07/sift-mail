const {chromium,expect}=require('@playwright/test');
const {fork}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const child=fork('dist/server.cjs',[],{env:{...process.env,NODE_ENV:'production',PORT:'47835',HOST:'127.0.0.1',SIFT_DATA_DIR:path.resolve('.test-data')},stdio:['ignore','ignore','pipe','ipc']});
 let browser, page;
 try {
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('server timeout')),20000);child.on('message',m=>{if(m.type==='sift-ready'){clearTimeout(t);resolve();}});child.on('error',reject);});
  browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage({viewport:{width:1280,height:900},locale:'tr-TR'});
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/emails/sync',async route=>{
   const body=route.request().postDataJSON();
   const make=(type,id)=>({id,uid:1,accountId:body.accountId,folder:type==='inbox'?'INBOX':type,folderType:type,from:'Fixture Sender',fromName:'Fixture Sender',fromEmail:'sender@example.com',subject:'Fixture '+type,bodyText:'Vielen Dank für Ihre Nachricht. '+ 'Full content '.repeat(50),bodyHtml:'<p>Vielen Dank für Ihre Nachricht.</p><script>parent.hacked=true</script>',snippet:'Vielen Dank für Ihre Nachricht.',date:'2026-09-18T12:00:00Z',isRead:false});
   await route.fulfill({json:{success:true,messages:body.offset?[{...make('inbox','older'),subject:'Older fixture'}]:[make('inbox','in'),make('sent','sent'),make('spam','spam')],mailboxes:[{path:'INBOX',type:'inbox',name:'INBOX',totalMessages:2},{path:'sent',type:'sent',name:'Sent',totalMessages:1},{path:'spam',type:'spam',name:'Spam',totalMessages:1}],account:{email:body.email,provider:'gmail'}}});
  });
  await page.goto('http://127.0.0.1:47835');
  await page.locator('input[type=email]').fill('fixture@gmail.com');
  await page.locator('input[type=password]').fill('abcdefghijklmnop');
  await page.getByRole('button',{name:'Oturum Aç ve Mailleri Senkronize Et'}).click();
  await expect(page.getByText('Fixture inbox',{exact:true})).toBeVisible();
  await expect(page.getByText('Fixture sent',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Daha fazla yükle'}).click();
  await expect(page.getByText('Older fixture',{exact:true})).toBeVisible();
  await expect(page.getByText('2 / 2 ileti yüklendi')).toBeVisible();
  await page.locator('aside nav button').nth(1).click();
  await expect(page.getByText('Fixture sent',{exact:true})).toBeVisible();
  await expect(page.getByText('Fixture inbox',{exact:true})).toHaveCount(0);
  await page.locator('aside nav button').nth(2).click();
  await expect(page.getByText('Fixture spam',{exact:true})).toBeVisible();
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/mailbox.png'});
  await page.getByText('Fixture spam',{exact:true}).click();
  await expect(page.frameLocator('iframe[title="E-posta içeriği"]').getByText('Vielen Dank für Ihre Nachricht.')).toBeVisible();
  if(await page.evaluate(()=>Boolean(window.hacked)))throw new Error('Email script escaped sandbox');
  await page.screenshot({path:'test-results/message.png'});
  await page.getByRole('button',{name:/^(Kapat|Close)$/}).first().click();
  await page.getByTitle('Ayarlar',{exact:true}).click();
  await page.getByRole('button',{name:'Otomasyon',exact:true}).click();
  await expect(page.getByText('Telegram bağla (isteğe bağlı)',{exact:true})).toBeVisible();
  await expect(page.getByPlaceholder('Örn: 987654321')).not.toBeVisible();
  await expect(page.getByText('Doğal Dil Komut Testi (NLP Simülatörü)')).toHaveCount(0);
  await page.screenshot({path:'test-results/settings.png'});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('UI PASS: login, folder isolation, pagination, MIME display, sandbox, optional Telegram.');
 } catch(error) { if(page) { console.error((await page.locator('body').innerText()).slice(0,5000)); fs.mkdirSync('test-results',{recursive:true}); await page.screenshot({path:'test-results/failure.png'}); } throw error; }
 finally {if(browser)await browser.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
