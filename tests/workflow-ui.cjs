const {chromium,expect}=require('@playwright/test');const {fork}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sift-workflow-ui-'));
 const child=fork('dist/server.cjs',[],{env:{...process.env,NODE_ENV:'production',PORT:'47839',HOST:'127.0.0.1',SIFT_DATA_DIR:directory},stdio:['ignore','ignore','pipe','ipc']});
 let browser,page;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture server timeout')),20000);child.on('message',m=>{if(m.type==='sift-ready'){clearTimeout(timer);resolve();}});child.on('error',reject);child.on('exit',()=>{clearTimeout(timer);reject(Error('Fixture server exit'));});});
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1280,height:900},locale:'tr-TR'});page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let sendPayload,draftPayload,labelPayload,accountId,partial=false,actionCount=0;
  await page.route('**/api/plugins',route=>route.fulfill({json:{success:true,plugins:[]}}));
  await page.route('**/api/imap/action',async route=>{actionCount++;await route.fulfill({json:{success:true,verified:true,destination:'Trash'}});});
  await page.route('**/api/smtp/send',async route=>{sendPayload=route.request().postDataJSON();await route.fulfill({json:{success:true,messageId:'<delivered@example.com>',...(partial?{partial:true,rejected:['cc@example.com'],accepted:['reply@example.com','other@example.com']}: {})}});});
  await page.route('**/api/mail/provider/draft',async route=>{draftPayload=route.request().postDataJSON();await route.fulfill({json:{success:true,folder:'Drafts',uid:12,uidValidity:'123'}});});
  await page.route('**/api/mail/provider/draft/open',async route=>{const body=route.request().postDataJSON();if(body.expectedUidValidity!=='123' || body.folder!=='Drafts')throw Error('Unsafe draft identity');await route.fulfill({json:{success:true,draft:{accountId,to:'draft-recipient@example.com',cc:'',bcc:'',subject:'Resumed provider draft',body:'Saved provider content',attachments:[{filename:'restored.txt',content:Buffer.from('restored').toString('base64'),size:8,encoding:'base64',source:'file'}]}}});});
  await page.route('**/api/mail/provider/label',async route=>{labelPayload=route.request().postDataJSON();await route.fulfill({json:{success:true,verified:true,labels:labelPayload.remove?[]:[labelPayload.label]}});});
  await page.route('**/api/emails/sync',async route=>{
   const req=route.request().postDataJSON();accountId=req.accountId;
   const base={accountId,uidValidity:'123',from:'Fixture Sender',fromName:'Fixture Sender',fromEmail:'sender@example.com',to:['fixture@gmail.com','other@example.com'],cc:['cc@example.com'],replyTo:['reply@example.com'],date:'2026-10-11T08:00:00Z',isRead:true,providerLabels:[],attachments:[]};
   const anchor={...base,id:'anchor',uid:1,folder:'INBOX',folderType:'inbox',messageId:'<original@example.com>',references:['<root@example.com>'],subject:'Workflow original',snippet:'Short preview',bodyText:'Short preview '+ 'ordinary '.repeat(40)+'DeepSearchNeedle'};
   const reply={...base,id:'thread-reply',uid:2,folder:'Sent',folderType:'sent',messageId:'<reply@example.com>',inReplyTo:anchor.messageId,subject:'Workflow reply',snippet:'Reply',bodyText:'Reply'};
   const draft={...base,id:'provider-draft',uid:3,folder:'Drafts',folderType:'drafts',messageId:'<draft@example.com>',subject:'Provider draft',snippet:'Draft',bodyText:'Draft'};
   await route.fulfill({json:{success:true,messages:[anchor,reply,draft],mailboxes:[{path:'INBOX',name:'INBOX',type:'inbox',totalMessages:1},{path:'Sent',name:'Sent',type:'sent',totalMessages:1},{path:'Drafts',name:'Drafts',type:'drafts',totalMessages:1}],account:{email:req.email,provider:'gmail'}}});
  });
  await page.goto('http://127.0.0.1:47839');await page.locator('input[type=email]').fill('fixture@gmail.com');await page.locator('input[type=password]').fill('abcdefghijklmnop');await page.getByRole('button',{name:'Oturum Aç ve Mailleri Senkronize Et'}).click();
  const card=()=>page.getByRole('button',{name:/Fixture Sender.*Workflow original/});await expect(card()).toBeVisible();
  const search=page.getByPlaceholder('Gönderici, konu veya içerikte ara...');await search.fill('DeepSearchNeedle');await expect(card()).toBeVisible();await search.fill('missing needle');await expect(card()).toHaveCount(0);await search.fill('');
  await card().click();await expect(page.locator('summary').filter({hasText:'Konuşma (2)'})).toBeVisible();
  await page.getByLabel('Sağlayıcı etiketi ekle').fill('Sift/Test');await page.getByRole('button',{name:'Sağlayıcı etiketi ekle',exact:true}).click();
  if(labelPayload)throw Error('Provider label changed without confirmation');await page.getByRole('button',{name:'Etiketleri uygula',exact:true}).click();await expect.poll(()=>labelPayload?.confirm).toBe(true);await expect(page.getByText('Sift/Test',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Yanıtla',exact:true}).click();await page.getByRole('checkbox',{name:'Tümünü yanıtla'}).check();await expect(page.getByPlaceholder('alici@ornek.com')).toHaveValue('reply@example.com, other@example.com');await expect(page.getByLabel('Cc',{exact:true})).toHaveValue('cc@example.com');
  await page.getByPlaceholder(/Yanıtınızı buraya/).fill('Fixture reply');partial=true;await page.getByRole('button',{name:'Yanıtı Gönder',exact:true}).click();await expect(page.getByPlaceholder('alici@ornek.com')).toHaveValue('cc@example.com');
  if(sendPayload.mail.inReplyTo!=='<original@example.com>' || !sendPayload.mail.references.includes('<root@example.com>'))throw Error('Reply headers missing');await page.keyboard.press('Escape');partial=false;
  await page.getByRole('button',{name:'Oluştur',exact:true}).click();await page.getByPlaceholder('ad@example.com').fill('new@example.com');await page.getByTestId('compose-modal').getByPlaceholder('Konu',{exact:true}).fill('Fixture copy');await page.getByTestId('compose-modal').getByRole('textbox',{name:'İleti',exact:true}).fill('New draft content');
  const beforeSend=sendPayload;await page.getByRole('button',{name:'Sağlayıcının Taslaklar klasörüne kopya kaydet',exact:true}).click();await expect.poll(()=>draftPayload?.confirmSaveCopy).toBe(true);if(sendPayload!==beforeSend)throw Error('Draft save sent mail');await expect(page.getByRole('alert')).toContainText('Taslak kopyası');
  await page.getByTitle('Taslağı sil').click();await page.keyboard.press('Escape');
  await page.locator('aside nav button').filter({hasText:'Taslaklar'}).click();await page.getByRole('button',{name:/Fixture Sender.*Provider draft/}).click();await page.getByRole('button',{name:'Taslağa devam et (orijinali korunur)',exact:true}).click();await expect(page.getByPlaceholder('ad@example.com')).toHaveValue('draft-recipient@example.com');await expect(page.getByText('restored.txt',{exact:false})).toBeVisible();
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/workflow-compose.png'});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Mail kuralları',exact:true}).click();
  const form=page.locator('form');await expect(form.getByLabel('Klasör kapsamı')).toHaveValue('inbox');await form.getByLabel('Hesap kapsamı').selectOption(accountId);
  await form.getByPlaceholder('örnek: github.com').fill('example.com');await form.getByRole('button',{name:'Kuralı Kaydet',exact:true}).click();
  await expect.poll(async()=>page.evaluate(async()=>{const {token}=await(await fetch('/api/auth/session')).json();const data=await(await fetch('/api/local/mail-cache',{headers:{'x-sift-key':token}})).json();return data.snapshot?.rules?.find(rule=>rule.patternValue==='example.com')?.folderTypes?.[0];})).toBe('inbox');
  await page.screenshot({path:'test-results/workflow-rules.png'});
  if(actionCount!==0)throw Error('Read-only fixtures must not trigger unrelated mail mutations');if(errors.length)throw Error(errors.join('\n'));
  console.log('WORKFLOW UI PASS: full-body search, header-linked thread, confirmed provider labels, reply-all, partial send, provider draft copy/resume with attachments, no AI configuration.');
 }catch(error){if(page){fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/workflow-failure.png'});}throw error;}
 finally{if(browser)await browser.close();if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
