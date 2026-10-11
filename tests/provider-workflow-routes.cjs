const{test}=require('node:test');const assert=require('node:assert/strict');const{buildSync}=require('esbuild');const Module=require('node:module');const path=require('node:path');const express=require('express');
const code=buildSync({stdin:{contents:"export {createProviderMailRouter} from './core/routes/providerMail'; export {getActiveSessionToken} from './core/security';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',alias:{imapflow:path.resolve('tests/fixtures/provider-workflow-errors.cjs')},write:false}).outputFiles[0].text;
const mod=new Module(path.resolve('workflow-route-test.cjs'),module);mod.paths=module.paths;mod._compile(code,path.resolve('workflow-route-test.cjs'));const api=mod.exports;
test('Provider routes require real session, explicit confirmations, bounded exact identities and sanitized failures',async()=>{
 const app=express();app.use(express.json());app.use(api.createProviderMailRouter());const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port,token=api.getActiveSessionToken();const config={accountId:'one',accountEmail:'own@example.com',host:'imap.example.com',port:993,secure:true,auth:{user:'own@example.com',pass:'synthetic'}};
 const post=(suffix,body,auth=true)=>fetch(base+'/api/mail/provider/'+suffix,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'x-sift-key':token}:{})},body:JSON.stringify(body)});
 try{
  const draft={config,mail:{to:'',subject:'Draft',text:'Fixture'}};
  assert.equal((await post('draft',draft,false)).status,401);assert.equal((await post('draft',draft)).status,400);
  assert.equal((await post('draft',{...draft,confirmSaveCopy:true,config:{...config,accountEmail:'other@example.com'}})).status,400);
  const failure=await post('draft',{...draft,confirmSaveCopy:true});assert.equal(failure.status,409);assert.match(failure.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await failure.text(),/SYNTHETIC_PRIVATE_CREDENTIAL/);
  const label={config:{...config,folder:'INBOX',uid:1,expectedUidValidity:'42'},label:'Sift/Test'};
  assert.equal((await post('label',label)).status,400);assert.equal((await post('label',{...label,confirm:true,config:{...label.config,expectedUidValidity:'0'}})).status,400);
  const response=await post('label',{...label,confirm:true});assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/SYNTHETIC_PRIVATE_CREDENTIAL/);
  assert.equal((await post('draft/open',config)).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
