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
 await assert.rejects(()=>manager.enable('missing-plugin'));
 const local=await manager.decide('sift-local',{subject:'Kargo teslimat bilgisi'});
 assert.equal(local.decision.category,'shopping');
});
