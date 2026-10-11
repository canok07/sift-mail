const {chromium,expect}=require('@playwright/test');
const {fork}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const assert=require('node:assert/strict');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sift-poll-test-'));
 const child=fork('dist/server.cjs',[],{env:{...process.env,NODE_ENV:'production',PORT:'0',HOST:'127.0.0.1',SIFT_DATA_DIR:directory},stdio:['ignore','ignore','pipe','ipc']});
 let browser;
 try{
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),20000);child.on('message',m=>{if(m.type==='sift-ready'){clearTimeout(timer);resolve(m.port);}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error(`server exited ${code}`));});});
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({locale:'tr-TR'});await page.clock.install();
  let accountId,spamAttempts=0,phase=1,fullCalls=0,releaseLate;const polls=[];
  const boxes=[{path:'INBOX',type:'inbox',name:'INBOX',totalMessages:2,uidValidity:'1',highestUid:3},{path:'Sent',type:'sent',name:'Sent',totalMessages:1,uidValidity:'1',highestUid:2},{path:'Spam',type:'spam',name:'Spam',totalMessages:1,uidValidity:'1',highestUid:2},{path:'Custom',type:'other',name:'Custom'}];
  const make=(uid,folder='INBOX',generation='1')=>({id:`imap-${accountId}-${encodeURIComponent(folder)}-${generation}-${uid}`,accountId,uid,uidValidity:generation,folder,folderType:boxes.find(b=>b.path===folder).type,from:'Sender',fromEmail:'fixture@example.com',subject:`${folder} ${uid}`,date:`2026-10-10T08:00:0${uid}Z`,snippet:'Fixture',bodyText:'Fixture',isRead:false});
  await page.route('**/api/emails/sync',async route=>{
   const body=route.request().postDataJSON();accountId=body.accountId;
   if(!body.folder){fullCalls++;return route.fulfill({json:{success:true,messages:phase===3?[make(10,'INBOX','3'),make(1,'Sent'),make(1,'Spam')]:[make(1),make(2),make(1,'Sent'),make(1,'Spam')],mailboxes:boxes.map(b=>b.path==='INBOX'&&phase===3?{...b,uidValidity:'3',highestUid:10}:b),account:{email:body.email,provider:'gmail'}}});}
   polls.push(body);
   if(body.folder==='Spam'&&++spamAttempts===1)return route.fulfill({status:503,json:{success:false,code:'SYNC_FAILED',retryable:true,error:'Synthetic connection unavailable'}});
   const late=phase===3&&body.folder==='INBOX';
   if(late)await new Promise(resolve=>releaseLate=resolve);
   const reset=phase===2&&body.folder==='INBOX';const generation=late?body.expectedUidValidity:reset?'2':'1';const next=late?4:body.folder==='INBOX'?3:body.folder==='Custom'?1:2;
   const checked=reset?[]:body.knownUids||[],deleted=checked.filter(uid=>uid===1),flags=checked.filter(uid=>uid!==1).map(uid=>({uid,isRead:true}));
   const mailboxes=boxes.map(b=>b.path===body.folder?{...b,uidValidity:generation,highestUid:next,totalMessages:body.folder==='INBOX'&&!reset?2:1}:b);
   return route.fulfill({json:{success:true,incremental:!reset&&body.sinceUid!==undefined,messages:[make(next,body.folder,generation)],delta:{folder:body.folder,uidValidity:generation,reset,checkedUids:checked,deletedUids:deleted,flags,nextUid:next,hasMore:false},mailboxes,account:{email:body.email,provider:'gmail'}}});
  });
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('input[type=email]').fill('fixture@gmail.com');await page.locator('input[type=password]').fill('abcdefghijklmnop');await page.getByRole('button',{name:'Oturum Aç ve Mailleri Senkronize Et'}).click();
  await expect(page.getByRole('button',{name:/INBOX 1/})).toBeVisible();
  await page.clock.fastForward(120_100);await expect.poll(()=>polls.length).toBe(4);
  assert.equal(polls.find(b=>b.folder==='INBOX').sinceUid,2);assert.deepEqual(polls.find(b=>b.folder==='INBOX').knownUids,[1,2]);
  await expect(page.getByRole('button',{name:/INBOX 3/})).toBeVisible();await expect(page.getByRole('button',{name:/INBOX 1/})).toHaveCount(0);
  const snapshot=()=>page.evaluate(async()=>{const{token}=await(await fetch('/api/auth/session')).json();return(await(await fetch('/api/local/mail-cache',{headers:{'x-sift-key':token}})).json()).snapshot;});
  await page.clock.fastForward(1000);await expect.poll(async()=>(await snapshot())?.messages.find(m=>m.folder==='INBOX'&&m.uid===2)?.isRead).toBe(true);
  let cached=await snapshot();assert.ok(cached.messages.some(m=>m.folder==='Spam'&&m.uid===1),'failed spam sync must preserve cache');assert.ok(cached.messages.some(m=>m.folder==='Sent'&&m.uid===2));assert.ok(cached.messages.some(m=>m.folder==='Custom'&&m.uid===1));
  assert.equal(cached.accounts[0].mailboxes.find(m=>m.path==='INBOX').syncCursor,3);
  await page.clock.fastForward(15_100);await expect.poll(()=>spamAttempts).toBe(2);await page.clock.fastForward(1000);await expect.poll(async()=>(await snapshot())?.messages.some(m=>m.folder==='Spam'&&m.uid===2)).toBe(true);
  cached=await snapshot();assert.ok(!cached.messages.some(m=>m.folder==='Spam'&&m.uid===1));
  phase=2;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>polls.filter(b=>b.folder==='INBOX').length).toBe(2);await page.clock.fastForward(1000);
  await expect.poll(async()=>(await snapshot())?.messages.filter(m=>m.folder==='INBOX').every(m=>m.uidValidity==='2')).toBe(true);
  cached=await snapshot();assert.equal(new Set(cached.messages.map(m=>m.id)).size,cached.messages.length);assert.ok(cached.messages.some(m=>m.folder==='Sent'));
  phase=3;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>Boolean(releaseLate)).toBe(true);
  await page.getByTitle('Yenile').click();await expect.poll(()=>fullCalls).toBe(2);await expect(page.getByRole('button',{name:/INBOX 10/})).toBeVisible();
  releaseLate();await page.clock.fastForward(1000);await expect(page.getByRole('button',{name:/INBOX 4/})).toHaveCount(0);
  await expect.poll(async()=>(await snapshot())?.messages.filter(m=>m.folder==='INBOX').every(m=>m.uidValidity==='3')).toBe(true);
  console.log('BACKGROUND PASS: every folder, exact UID reconciliation, read flags, expunge, failure recovery, persisted cursor, UIDVALIDITY reset, deduplication and stale-response isolation.');
 }finally{if(browser)await browser.close();if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;}fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
