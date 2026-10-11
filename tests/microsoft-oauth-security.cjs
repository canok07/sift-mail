const {build}=require('esbuild');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const client='11111111-2222-3333-4444-555555555555';
const redirect='http://localhost:3000/oauth/microsoft/callback';
async function runtime(){
 const secrets=new Map();global.__siftMicrosoftVault=secrets;
 const code=(await build({entryPoints:['core/auth/microsoft.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'test-vault',setup(build){build.onLoad({filter:/security[\\/]vault\.ts$/},()=>({contents:`export const getVaultSecret=k=>globalThis.__siftMicrosoftVault.get(k);export const saveVaultSecret=(k,v)=>globalThis.__siftMicrosoftVault.set(k,v);`,loader:'js'}));}}]})).outputFiles[0].text;
 const mod=new Module(path.resolve('microsoft-security-runtime.cjs'),module);mod.paths=module.paths;mod._compile(code,path.resolve('microsoft-security-runtime.cjs'));
 return {...mod.exports,secrets};
}
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('authorization binds PKCE state and never exposes verifier',async()=>{
 const api=await runtime(),auth=api.generateMicrosoftAuthUrl(redirect,client),url=new URL(auth.authUrl);
 assert.equal(auth.verifier,undefined);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.match(url.searchParams.get('scope'),/graph\.microsoft\.com\/User.Read/);
 assert.notEqual(auth.state,api.generateMicrosoftAuthUrl(redirect,client).state);
 for(const bad of ['http://evil.test/oauth/microsoft/callback','http://localhost.evil.test/oauth/microsoft/callback','http://user:pass@localhost/oauth/microsoft/callback',redirect+'?next=x',redirect+'#x','http://localhost/other'])assert.throws(()=>api.generateMicrosoftAuthUrl(bad,client));
});
test('unknown state cannot be bypassed by a caller-provided verifier',async()=>{
 const api=await runtime(),old=global.fetch;let requests=0;global.fetch=async()=>{requests++;throw Error('unexpected network')};
 try{assert.equal((await api.exchangeMicrosoftCode({code:'fixture',state:'unknown',codeVerifier:'provided-verifier',redirectUri:redirect})).success,false);assert.equal(requests,0);}finally{global.fetch=old;}
});
test('expired state, changed redirect and changed client fail before network',async()=>{
 const api=await runtime(),oldFetch=global.fetch,oldNow=Date.now;let requests=0;global.fetch=async()=>{requests++;throw Error('unexpected network')};
 try{
  const auth=api.generateMicrosoftAuthUrl(redirect,client);
  assert.equal((await api.exchangeMicrosoftCode({code:'x',state:auth.state,redirectUri:'http://localhost:3001/oauth/microsoft/callback'})).success,false);
  assert.equal((await api.exchangeMicrosoftCode({code:'x',state:auth.state,redirectUri:redirect,customClientId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'})).success,false);
  Date.now=()=>oldNow()+10*60*1000;
  assert.equal((await api.exchangeMicrosoftCode({code:'x',state:auth.state,redirectUri:redirect})).success,false);assert.equal(requests,0);
 }finally{global.fetch=oldFetch;Date.now=oldNow;}
});
test('mail and Graph use separate tokens; rotated refresh remains in vault only',async()=>{
 const api=await runtime(),auth=api.generateMicrosoftAuthUrl(redirect,client),old=global.fetch;let requests=0;
 global.fetch=async(url,init)=>{
  requests++;assert.equal(init.redirect,'error');assert.ok(init.signal);
  if(requests===1){const b=new URLSearchParams(init.body);assert.equal(b.get('scope'),`offline_access ${api.MS_MAIL_SCOPES}`);assert.equal(b.get('code_verifier').length,64);return json({access_token:'mail-token',refresh_token:'first-refresh',expires_in:3600});}
  if(requests===2){const b=new URLSearchParams(init.body);assert.equal(b.get('scope'),api.MS_GRAPH_SCOPES);assert.equal(b.get('refresh_token'),'first-refresh');return json({access_token:'graph-token',refresh_token:'rotated-refresh'});}
  assert.match(url,/^https:\/\/graph\.microsoft\.com\/v1\.0\/me/);assert.equal(init.headers.Authorization,'Bearer graph-token');return json({mail:'Fixture@Outlook.com',displayName:'Fixture'});
 };
 try{
  const result=await api.exchangeMicrosoftCode({code:'fixture',state:auth.state,redirectUri:redirect});
  assert.equal(result.success,true);assert.equal(result.email,'fixture@outlook.com');assert.equal(result.accessToken,'mail-token');
  assert.equal(api.secrets.get('ms_refresh_fixture@outlook.com'),'rotated-refresh');assert.equal(api.secrets.get('ms_client_fixture@outlook.com'),client);
  assert.ok(!JSON.stringify(result).includes('refresh'));assert.equal((await api.exchangeMicrosoftCode({code:'fixture',state:auth.state,redirectUri:redirect})).success,false);assert.equal(requests,3);
 }finally{global.fetch=old;}
});
test('concurrent callback cannot redeem the same state twice',async()=>{
 const api=await runtime(),auth=api.generateMicrosoftAuthUrl(redirect,client),old=global.fetch;let requests=0;
 global.fetch=async()=>{requests++;return new Response(JSON.stringify({error:'invalid_grant'}),{status:400});};
 try{const results=await Promise.all([1,2].map(()=>api.exchangeMicrosoftCode({code:'fixture',state:auth.state,redirectUri:redirect})));assert.ok(results.every(x=>!x.success));assert.equal(requests,1);}finally{global.fetch=old;}
});
test('provider failures do not log or return provider secrets',async()=>{
 const api=await runtime(),auth=api.generateMicrosoftAuthUrl(redirect,client),oldFetch=global.fetch,oldError=console.error;const logged=[];
 global.fetch=async()=>new Response(JSON.stringify({error:'invalid_grant',error_description:'fixture-provider-secret'}),{status:400});console.error=(...args)=>logged.push(args);
 try{const result=await api.exchangeMicrosoftCode({code:'fixture',state:auth.state,redirectUri:redirect});assert.equal(result.success,false);assert.ok(!JSON.stringify(result).includes('fixture-provider-secret'));assert.deepEqual(logged,[]);assert.equal(api.secrets.size,0);}finally{global.fetch=oldFetch;console.error=oldError;}
});
test('refresh remains bound to the original client and only requests Outlook scopes',async()=>{
 const api=await runtime(),old=global.fetch;api.secrets.set('ms_refresh_fixture@outlook.com','saved-refresh');api.secrets.set('ms_client_fixture@outlook.com',client);let requests=0;
 global.fetch=async(_url,init)=>{requests++;const b=new URLSearchParams(init.body);assert.equal(b.get('client_id'),client);assert.equal(b.get('scope'),api.MS_MAIL_SCOPES);return json({access_token:'new-mail-token',refresh_token:'new-refresh',expires_in:3600});};
 try{assert.equal((await api.refreshMicrosoftToken('fixture@outlook.com','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).success,false);assert.equal(requests,0);assert.equal((await api.refreshMicrosoftToken('fixture@outlook.com')).accessToken,'new-mail-token');assert.equal(api.secrets.get('ms_refresh_fixture@outlook.com'),'new-refresh');}finally{global.fetch=old;}
});
test('removal during an in-flight refresh cannot recreate credentials or return a token',async()=>{
 const api=await runtime(),old=global.fetch;api.secrets.set('ms_refresh_fixture@outlook.com','saved-refresh');api.secrets.set('ms_client_fixture@outlook.com',client);
 let resolve;global.fetch=()=>new Promise(done=>{resolve=done});
 try{
  const pending=api.refreshMicrosoftToken('fixture@outlook.com');
  api.invalidateMicrosoftAccount('FIXTURE@outlook.com');api.secrets.clear();
  resolve(json({access_token:'late-token',refresh_token:'late-refresh',expires_in:3600}));
  const result=await pending;assert.equal(result.success,false);assert.equal(result.accessToken,'');assert.equal(api.secrets.size,0);
 }finally{global.fetch=old;}
});
test('removal during an OAuth callback prevents late refresh token storage',async()=>{
 const api=await runtime(),old=global.fetch,auth=api.generateMicrosoftAuthUrl(redirect,client);let count=0,resolveProfile,profileStarted;
 const started=new Promise(resolve=>{profileStarted=resolve});
 global.fetch=async()=>{
  count++;if(count===1)return json({access_token:'mail',refresh_token:'refresh'});
  if(count===2)return json({access_token:'profile'});
  profileStarted();return new Promise(resolve=>{resolveProfile=resolve});
 };
 try{
  const pending=api.exchangeMicrosoftCode({code:'fixture',state:auth.state,redirectUri:redirect});await started;
  api.invalidateMicrosoftAccount('fixture@outlook.com');resolveProfile(json({mail:'fixture@outlook.com'}));
  const result=await pending;assert.equal(result.success,false);assert.equal(result.accessToken,'');assert.equal(api.secrets.size,0);
 }finally{global.fetch=old;}
});
test('cancelled Microsoft callback cannot persist new refresh credentials',async()=>{
 const api=await runtime(),old=global.fetch,auth=api.generateMicrosoftAuthUrl(redirect,client);let count=0;
 global.fetch=async()=>{count++;if(count===1)return json({access_token:'mail',refresh_token:'refresh'});if(count===2)return json({access_token:'profile'});return json({mail:'cancelled@outlook.com'});};
 try{const result=await api.exchangeMicrosoftCode({code:'fixture',state:auth.state,redirectUri:redirect,isCancelled:()=>true});assert.equal(result.success,false);assert.equal(api.secrets.size,0);}finally{global.fetch=old;}
});
