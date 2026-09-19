const {fork}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
const fs=require('node:fs');
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
})().catch(error=>{console.error(error);process.exitCode=1;});
