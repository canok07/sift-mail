const {chromium,expect}=require('@playwright/test');
const {fork}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sift-ui-test-'));
 const child=fork('dist/server.cjs',[],{env:{...process.env,NODE_ENV:'production',PORT:'47835',HOST:'127.0.0.1',SIFT_DATA_DIR:directory},stdio:['ignore','ignore','pipe','ipc']});
 let browser, page;
 try {
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('server timeout')),20000);child.on('message',m=>{if(m.type==='sift-ready'){clearTimeout(t);resolve();}});child.on('error',reject);});
  browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage({viewport:{width:1280,height:900},locale:'tr-TR'});
  page.setDefaultTimeout(15000);
  const errors=[];let sentPayload=null,markReadPayload=null;page.on('pageerror',e=>errors.push(e.message));
  const plugins=['gemini','openai','anthropic','ollama','jev'].map(id=>({id,name:id,kind:id==='jev'?'decision-provider':'ai-provider',capabilities:['classify'],enabled:false,status:'NOT_CONFIGURED',configuration:{model:'fixture-model'}}));
  let configuredCount=0;
  await page.route('**/api/plugins',route=>route.fulfill({json:{success:true,plugins}}));
  await page.route('**/api/plugins/*/*',async route=>{
   const [,id,action]=new URL(route.request().url()).pathname.match(/\/api\/plugins\/([^/]+)\/([^/]+)/);
   const plugin=plugins.find(p=>p.id===id),body=route.request().postDataJSON()||{};
   let result={...plugin};
   if(action==='configure'){configuredCount++;plugin.status='CONFIGURED';plugin.enabled=false;}
   if(action==='test'){
    if(!Object.values(body).some(Boolean))plugin.status='DISABLED';
    result={...plugin,status:'CONNECTED',message:'Fixture connection verified'};
   }else if(action==='enable'){plugin.status='CONNECTED';plugin.enabled=true;result={...plugin};}
   else if(action==='disable'){plugin.status='DISABLED';plugin.enabled=false;result={...plugin};}
   else result={...plugin};
   await route.fulfill({json:{success:true,plugin:result}});
  });
  await page.route('**/api/smtp/send',async route=>{sentPayload=route.request().postDataJSON();await route.fulfill({json:{success:true,messageId:'fixture-message'}})});
  await page.route('**/api/imap/action',async route=>{markReadPayload=route.request().postDataJSON();assertFixture(markReadPayload.expectedUidValidity==='123'&&markReadPayload.accountEmail==='fixture@gmail.com','Mail action must include account and mailbox generation');await route.fulfill({json:{success:true,verified:true}})});
  await page.route('**/api/imap/attachment',async route=>route.fulfill({json:{success:true,filename:'fixture.txt',contentType:'text/plain',content:Buffer.from('attachment fixture').toString('base64')}}));
  const rawMessage=Buffer.from('From: sender@example.com\r\nTo: fixture@gmail.com\r\nSubject: Fixture spam\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nOriginal fixture message\r\n');
  await page.route('**/api/imap/raw-message',async route=>{
   const body=route.request().postDataJSON();
   assertFixture(body.expectedUidValidity==='123' && body.folder==='spam','Original MIME request must preserve mailbox identity');
   await route.fulfill({json:{success:true,filename:'Fixture spam.eml',contentType:'message/rfc822',content:rawMessage.toString('base64'),size:rawMessage.length}});
  });
  await page.route('**/api/emails/sync',async route=>{
   const body=route.request().postDataJSON();
   const make=(type,id)=>({id,uid:1,uidValidity:'123',accountId:body.accountId,folder:type==='inbox'?'INBOX':type,folderType:type,from:'Fixture Sender',fromName:'Fixture Sender',fromEmail:'sender@example.com',subject:'Fixture '+type,bodyText:'Vielen Dank für Ihre Nachricht. '+ 'Full content '.repeat(50),bodyHtml:'<p>Vielen Dank für Ihre Nachricht.</p><script>parent.hacked=true</script>',snippet:'Vielen Dank für Ihre Nachricht.',date:'2026-09-18T12:00:00Z',isRead:false,attachments:type==='spam'?[{index:0,filename:'fixture.txt',contentType:'text/plain',size:18}]:[]});
   const inbox=Array.from({length:12},(_,index)=>({...make('inbox',`in-${index+1}`),uid:index+1,subject:`Fixture inbox ${String(index+1).padStart(2,'0')}`,date:new Date(Date.UTC(2026,8,18,12,index)).toISOString()}));
   await route.fulfill({json:{success:true,messages:body.offset?[]:[...inbox,make('sent','sent'),make('spam','spam')],mailboxes:[{path:'INBOX',type:'inbox',name:'INBOX',totalMessages:12},{path:'sent',type:'sent',name:'Sent',totalMessages:1},{path:'spam',type:'spam',name:'Spam',totalMessages:1}],account:{email:body.email,provider:'gmail'}}});
  });
  await page.goto('http://127.0.0.1:47835');
  const stylesheetSizes=await page.locator('link[rel="stylesheet"]').evaluateAll(async links=>Promise.all(links.map(async link=>(await fetch(link.href)).text().then(css=>css.length))));
  if(!stylesheetSizes.some(size=>size>50000))throw new Error('Tailwind utility stylesheet is missing or incomplete');
  await page.locator('input[type=email]').fill('fixture@gmail.com');
  await page.locator('input[type=password]').fill('abcdefghijklmnop');
  await page.getByRole('button',{name:'Oturum Aç ve Mailleri Senkronize Et'}).click();
  const inboxCard=()=>page.getByRole('button',{name:/Fixture Sender.*Fixture inbox 12/});
  await expect(inboxCard()).toBeVisible();
  await expect(page.getByText('Fixture sent',{exact:true})).toHaveCount(0);
  await page.getByLabel('Sayfa başına').selectOption('10');
  await expect(page.getByText('Fixture inbox 02',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Sonraki Sayfa'}).click();
  await expect(page.getByRole('button',{name:/Fixture inbox 02/})).toBeVisible();
  await page.getByRole('button',{name:'Önceki Sayfa'}).click();
  await expect(inboxCard()).toBeVisible();
  await page.locator('aside nav button').nth(2).click();
  await expect(page.getByRole('button',{name:/Fixture sent/})).toBeVisible();
  await expect(page.getByText('Fixture inbox',{exact:true})).toHaveCount(0);
  await page.locator('aside nav button').nth(3).click();
  await expect(page.getByRole('button',{name:/Fixture spam/})).toBeVisible();
  await expect(page.getByText(/Fixture inbox/)).toHaveCount(0);
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/mailbox.png'});
  await page.getByRole('button',{name:/Fixture spam/}).click();
  await expect.poll(()=>markReadPayload?.action).toBe('mark_read');
  const attachmentDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:/fixture.txt/}).click();
  if((await attachmentDownload).suggestedFilename()!=='fixture.txt')throw new Error('Incoming attachment filename mismatch');
  await expect(page.frameLocator('iframe[title="E-posta içeriği"]').getByText('Vielen Dank für Ihre Nachricht.')).toBeVisible();
  if(await page.evaluate(()=>Boolean(window.hacked)))throw new Error('Email script escaped sandbox');
  await page.screenshot({path:'test-results/message.png'});
  await page.keyboard.press('Escape');
  await expect(page.frameLocator('iframe[title="E-posta içeriği"]').getByText('Vielen Dank für Ihre Nachricht.')).toHaveCount(0);
  await page.getByRole('button',{name:'Oluştur',exact:true}).click();
  await page.getByPlaceholder('ad@example.com').fill('receiver@example.com');
  await page.getByTestId('compose-modal').getByPlaceholder('Konu',{exact:true}).fill('Ekli test iletisi');
  await page.getByTestId('compose-modal').getByRole('textbox',{name:'İleti',exact:true}).fill('Merhaba, bu bir test iletisidir.');
  await page.getByRole('button',{name:'Cc / Bcc'}).click();
  await expect(page.getByText('Bcc',{exact:true})).toBeVisible();
  await page.getByTitle('E-posta ekle').click();
  await page.getByTestId('compose-modal').getByRole('button',{name:/Fixture spam/}).click();
  await expect(page.getByText(/Fixture spam.eml/)).toBeVisible();
  await page.getByRole('button',{name:'Gönder',exact:true}).click();
  await expect(page.getByTestId('compose-modal')).toHaveCount(0);
  if(!sentPayload?.mail?.attachments?.[0]?.content||sentPayload.mail.attachments[0].contentType!=='message/rfc822')throw new Error('Attached email was not sent as .eml');
  assertFixture(Buffer.from(sentPayload.mail.attachments[0].content,'base64').equals(rawMessage),'Attached EML must match original MIME bytes');
  await page.getByRole('button',{name:'Etiket oluştur'}).click();
  await page.getByPlaceholder('Etiket adı').fill('Önemli');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Önemli',{exact:true})).toBeVisible();
  await page.getByTitle('Ayarlar',{exact:true}).click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await page.getByRole('button',{name:'Arayüz',exact:true}).click();
  await expect(page.getByText('Ekrandaki mail sayısı',{exact:true})).toHaveCount(0);
  const themes=[['Yumuşak açık','#f3f6f9','light'],['Koyu','#0f1115','dark'],['OLED','#000','oled'],['Okyanus','#07141c','ocean'],['Orman','#0b1510','forest']];
  for(const [label,expectedCanvas,file] of themes){
   await page.getByRole('button',{name:label,exact:true}).click();
   const colors=await page.evaluate(()=>{const style=getComputedStyle(document.documentElement);return {canvas:style.getPropertyValue('--bg-canvas').trim(),text:style.getPropertyValue('--text-primary').trim()}});
   if(colors.canvas.toLowerCase()!==expectedCanvas)throw new Error(`${label} theme canvas mismatch: ${colors.canvas}`);
   const rgb=hex=>{const full=hex.length===4?`#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`:hex;return [1,3,5].map(i=>parseInt(full.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4))};
   const luminance=hex=>{const [r,g,b]=rgb(hex);return .2126*r+.7152*g+.0722*b};
   const contrast=(Math.max(luminance(colors.canvas),luminance(colors.text))+.05)/(Math.min(luminance(colors.canvas),luminance(colors.text))+.05);
   if(contrast<4.5)throw new Error(`${label} theme contrast is too low: ${contrast}`);
   await page.screenshot({path:`test-results/theme-${file}.png`});
  }
  await page.getByRole('button',{name:'Yumuşak açık',exact:true}).click();
  await page.getByRole('button',{name:'Kapat',exact:true}).click();
  await page.waitForTimeout(350);
  await expect(page.getByText('Tüm hesaplar',{exact:true})).toBeVisible();
  const sidebarStyle=await page.locator('aside').evaluate(element=>{const style=getComputedStyle(element);const item=getComputedStyle(element.querySelector('button'));return {background:style.backgroundColor,color:style.color,opacity:style.opacity,itemBackground:item.backgroundColor,itemColor:item.color,itemOpacity:item.opacity}});
  if(sidebarStyle.opacity==='0'||sidebarStyle.itemOpacity==='0'||sidebarStyle.color===sidebarStyle.background||sidebarStyle.itemColor===sidebarStyle.itemBackground)throw new Error(`Light theme sidebar contrast failure: ${JSON.stringify(sidebarStyle)}`);
  await page.screenshot({path:'test-results/theme-light-mailbox.png'});
  await page.getByRole('button',{name:/Fixture spam/}).click();
  const lightMailBackground=await page.frameLocator('iframe[title="E-posta içeriği"]').locator('body').evaluate(element=>getComputedStyle(element).backgroundColor);
  if(lightMailBackground!=='rgb(255, 255, 255)')throw new Error(`Light email body kept a legacy color: ${lightMailBackground}`);
  await page.screenshot({path:'test-results/theme-light-message.png'});
  await page.keyboard.press('Escape');
  await page.getByTitle('Ayarlar',{exact:true}).click();
  await page.getByRole('button',{name:'Yapay Zekâ',exact:true}).click();
  const gemini=page.getByTestId('plugin-gemini');
  await gemini.getByRole('button',{name:'Yapılandır',exact:true}).click();
  await gemini.getByPlaceholder('API anahtarı').fill('fixture-api-key');
  await gemini.getByRole('button',{name:'Test et',exact:true}).click();
  await expect(page.getByText('Fixture connection verified')).toBeVisible();
  assertFixture(configuredCount===0 && !plugins[0].enabled,'Dry-run test must not save credentials or enable AI');
  await gemini.getByRole('button',{name:/Bağla ve güvenli kaydet/}).click();
  await expect(gemini.getByRole('button',{name:'Devre dışı bırak',exact:true})).toBeVisible();
  assertFixture(configuredCount===1 && plugins[0].enabled,'Explicit connection must save and enable the provider');
  await page.getByRole('button',{name:'Entegrasyonlar',exact:true}).click();
  await expect(page.getByTestId('plugin-jev')).toBeVisible();
  await expect(page.getByTestId('plugin-gemini')).toBeVisible();
  await page.getByRole('button',{name:'Genel',exact:true}).click();
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await expect(page.getByRole('button',{name:'Interface',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({path:'test-results/settings.png'});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('UI PASS: complete styling, five accessible theme palettes, folder isolation, pagination, MIME sandbox, compose, AI gate, labels, settings and language.');
 } catch(error) { if(page) { console.error((await page.locator('body').innerText()).slice(0,5000)); fs.mkdirSync('test-results',{recursive:true}); await page.screenshot({path:'test-results/failure.png'}); } throw error; }
 finally {if(browser)await browser.close();if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
function assertFixture(condition,message){if(!condition)throw new Error(message);}
