const {fork}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {_electron,expect}=require('@playwright/test');
(async()=>{
 const app=path.resolve('release/win-unpacked');
 const dist=path.join(app,'resources/app.asar/dist');
 const data=path.resolve('.test-data/package');fs.mkdirSync(data,{recursive:true});
 const child=fork(path.join(dist,'server.cjs'),[],{execPath:path.join(app,'Sift Mail.exe'),cwd:data,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',NODE_ENV:'production',HOST:'127.0.0.1',PORT:'47836',SIFT_DATA_DIR:data,SIFT_DIST_PATH:dist},stdio:['ignore','ignore','pipe','ipc']});
 try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Packaged server startup timeout')),20000);child.on('message',m=>{if(m.type==='sift-ready'){clearTimeout(timer);resolve();}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(new Error('Packaged server exit: '+code));});});
  const base='http://127.0.0.1:47836';
  assert.equal((await(await fetch(base+'/api/health')).json()).status,'ok');
  const html=await(await fetch(base)).text();
  assert.match(html,/<div id="root">/);
  const scripts=[...html.matchAll(/src="([^"]+\.js)"/g)];assert.ok(scripts.length);
  for(const [,url]of scripts){const result=await fetch(base+url);assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/javascript/);}
  console.log('PACKAGE PASS: Electron runtime, packaged server dependencies, health and frontend assets.');
 }finally{child.kill();}
 // Use a disposable profile: never open the installed user's accounts or cache.
 const profile=path.resolve('.test-data/desktop');fs.mkdirSync(profile,{recursive:true});
 const desktopEnv={...process.env};delete desktopEnv.ELECTRON_RUN_AS_NODE;
 const desktop=await _electron.launch({executablePath:path.join(app,'Sift Mail.exe'),args:[`--user-data-dir=${profile}`],env:desktopEnv,timeout:40000});
 try {
  const actualProfile=await desktop.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.resolve(actualProfile).toLowerCase(),profile.toLowerCase(),'Desktop must use the disposable test profile');
  const page=await desktop.firstWindow({timeout:40000});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('input[type=email]')).toBeVisible();
  const sizes=await page.locator('link[rel="stylesheet"]').evaluateAll(async links=>Promise.all(links.map(async link=>(await(await fetch(link.href)).text()).length)));
  assert.ok(sizes.some(size=>size>50000),'Packaged desktop must load complete Tailwind styling');
  assert.ok(await page.locator('aside').evaluate(element=>element.getBoundingClientRect().width)>=200,'Sidebar layout must not collapse');
  const health=await page.evaluate(async()=>await(await fetch('/api/health')).json());assert.equal(health.status,'ok');
  const plugins=await page.evaluate(async()=>{const {token}=await(await fetch('/api/auth/session')).json();return await(await fetch('/api/plugins',{headers:{'x-sift-key':token}})).json();});
  assert.ok(plugins.plugins.filter(p=>p.kind==='ai-provider').every(p=>!p.enabled),'Fresh desktop must not start cloud AI');
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/packaged-desktop.png'});
  // Destroy and re-open the window through the actual second-instance handler. This covers
  // the reported "Object has been destroyed" main-process regression.
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].destroy());
  const nextWindow=desktop.waitForEvent('window',{timeout:15000});
  await desktop.evaluate(({app})=>app.emit('second-instance',{},[]));
  const restored=await nextWindow;await expect(restored.locator('input[type=email]')).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('DESKTOP PASS: isolated profile, real packaged window, styling, local API, AI-off startup and destroyed-window recovery.');
 }finally{await desktop.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
