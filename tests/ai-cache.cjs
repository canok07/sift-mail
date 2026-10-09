const {build}=require('esbuild');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
let api, settingsChanged;
const previousStorage=global.localStorage;
const oldCache=new Map([['smart_mail_analysis_cache_v2','PRIVATE_BODY']]);
let writes=0;
before(async()=>{
 global.localStorage={removeItem:key=>oldCache.delete(key),setItem:()=>{writes++},getItem:key=>oldCache.get(key)};
 global.__siftCacheTest={subscribe:callback=>{settingsChanged=callback}};
 const result=await build({entryPoints:['shared/services/emailAnalyzer.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,logLevel:'silent',
  plugins:[{name:'isolated-settings',setup(builder){
   builder.onResolve({filter:/useSettingsStore$/},()=>({path:'settings',namespace:'test'}));
   builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const useSettingsStore={getState:()=>({aiEnabled:false,aiProvider:'gemini'}),subscribe:cb=>globalThis.__siftCacheTest.subscribe(cb)}` }));
  }}]});
 const filename=path.resolve('tests/ai-cache.bundle.cjs');const mod=new Module(filename,module);mod.paths=module.paths;
 mod._compile(result.outputFiles[0].text,filename);api=mod.exports;
});
after(()=>{global.localStorage=previousStorage;delete global.__siftCacheTest;});
test('old plaintext AI cache is purged, new analyses are memory-only and bounded',()=>{
 assert.equal(oldCache.size,0);
 for(let i=0;i<201;i++)api.saveOfflineAnalysis(String(i),{summary:'PRIVATE_SUMMARY'});
 assert.equal(api.getOfflineAnalysis('0'),null);assert.ok(api.getOfflineAnalysis('200'));
 assert.equal(writes,0);
});
test('consent changes clear AI memory, disabled AI does not return an old analysis',async()=>{
 settingsChanged({allowCloudEmailBody:false},{allowCloudEmailBody:true});
 assert.equal(api.getOfflineAnalysis('200'),null);
 await assert.rejects(api.analyzeEmailWithGemini({id:'200',subject:'Test',from:'a@example.com'}),/AI_UNAVAILABLE/);
 assert.equal(writes,0);
});
