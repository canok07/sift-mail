const {buildSync}=require('esbuild');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');
process.env.SIFT_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'sift-plugin-test-'));
const code=buildSync({entryPoints:['core/plugins/index.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text;
const mod=new Module(path.resolve('plugin-system.cjs'),module);mod.filename=path.resolve('plugin-system.cjs');mod.paths=module.paths;mod._compile(code,mod.filename);
const {PluginManager,createPluginManager,DecisionOutputSchema}=mod.exports;
process.on('exit',()=>fs.rmSync(process.env.SIFT_DATA_DIR,{recursive:true,force:true}));

test('zero-plugin manager is valid and has no startup work',()=>{assert.deepEqual(new PluginManager().list(),[])});
test('Jev remains unavailable and falls back to validated Sift Local output',async()=>{
 const manager=createPluginManager();
 assert.equal(manager.get('jev').describe().status,'NOT_CONFIGURED');
 const result=await manager.decide('jev',{subject:'Acil: hesabınız kapatılacak, şifreni doğrula'});
 assert.equal(result.provider,'sift-local');assert.equal(result.fallback,true);assert.equal(DecisionOutputSchema.safeParse(result.decision).success,true);
 assert.equal(result.decision.needsReview,true);
});
test('strict decision output rejects arbitrary fields and invalid probability',()=>{
 assert.equal(DecisionOutputSchema.safeParse({category:'other',priority:'normal',phishingRisk:2,promotionProbability:0,needsReview:false}).success,false);
 assert.equal(DecisionOutputSchema.safeParse({category:'other',priority:'normal',phishingRisk:0,promotionProbability:0,needsReview:false,action:'delete'}).success,false);
});
test('configuration never exposes API keys and plugin failure does not damage manager',async()=>{
 const manager=createPluginManager();const secret='unit-test-secret-not-for-output';
 const configured=await manager.configure('gemini',{apiKey:secret,model:'test-model'});
 assert.equal(JSON.stringify(configured).includes(secret),false);
 assert.equal(configured.enabled,false);assert.equal(configured.status,'CONFIGURED');
 await assert.rejects(()=>manager.enable('gemini'),/PLUGIN_TEST_REQUIRED/);
 await assert.rejects(()=>manager.enable('missing-plugin'));
 const local=await manager.decide('sift-local',{subject:'Kargo teslimat bilgisi'});
 assert.equal(local.decision.category,'shopping');
});
test('saved Ollama configuration shares verified enable/disable state and rejects missing models',async t=>{
 const originalFetch=global.fetch;
 t.after(()=>{global.fetch=originalFetch});
 const manager=createPluginManager();
 global.fetch=async()=>new Response(JSON.stringify({models:[{name:'llama3:latest'}]}),{status:200});
 await manager.configure('ollama',{endpoint:'http://localhost:11434',model:'llama3'});
 assert.equal((await manager.test('ollama')).status,'DISABLED');
 assert.equal((await manager.enable('ollama')).status,'CONNECTED');
 assert.equal((await manager.disable('ollama')).status,'DISABLED');
 await manager.enable('ollama');
 global.fetch=async()=>new Response(JSON.stringify({models:[]}),{status:200});
 assert.equal((await manager.test('ollama')).status,'ERROR');assert.equal(manager.get('ollama').describe().enabled,false);
 await assert.rejects(()=>manager.enable('ollama'),/PLUGIN_TEST_REQUIRED/);
});
test('testing edited configuration never writes its API key, model or verified status',async t=>{
 const originalFetch=global.fetch;
 t.after(()=>{global.fetch=originalFetch});
 const manager=createPluginManager(), before=manager.get('openai').describe();
 global.fetch=async()=>new Response(JSON.stringify({data:[{id:'test-dry-run-model'}]}),{status:200});
 const result=await manager.test('openai',{apiKey:'temporary-test-secret',model:'test-dry-run-model'});
 assert.equal(result.status,'CONNECTED');assert.deepEqual(manager.get('openai').describe(),before);
 assert.equal(JSON.stringify(manager.getRuns()).includes('temporary-test-secret'),false);
});
test('plugin history records only fixed error codes, never exception secrets',async()=>{
 const manager=new PluginManager();
 manager.register({id:'broken',configure:async()=>{throw new Error('PRIVATE_MAIL_BODY_AND_API_KEY')}});
 await assert.rejects(()=>manager.configure('broken',{}));
 assert.equal(manager.getRuns()[0].errorCode,'PLUGIN_FAILED');
 assert.equal(JSON.stringify(manager.getRuns()).includes('PRIVATE_MAIL_BODY'),false);
});
