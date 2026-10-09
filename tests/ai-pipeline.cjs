const { build } = require('esbuild');
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const express = require('express');
let api, server, base;
const secrets = new Map();
let requests = [], fail = false;
const valid = { summary:'Summary', category:'personal', priority:'medium', phishingRisk:'safe',
  classification:'safe', isSafe:true, safetyScore:90, safeCategory:'personal', reasoning:'Reason', suggestedAction:'reply' };
const originalFetch = global.fetch;
global.__siftAiTest = { secrets, generate: async input => {
  requests.push(input); if (fail) throw new Error('SECRET must not escape');
  return { text: JSON.stringify(valid) };
} };

before(async () => {
  const result = await build({ stdin: { contents: `export * from './core/ai/multiModelService'; export * from './core/ai/privacy'; export * from './core/security/validation'; export * from './core/routes/ai'; export * from './core/integrations/telegramBot';`, resolveDir:process.cwd() },
    bundle:true, platform:'node', format:'cjs', packages:'external', write:false,
    plugins:[{ name:'isolated-provider-test', setup(builder) {
      builder.onResolve({filter:/security\/vault$/}, () => ({path:'vault',namespace:'test'}));
      builder.onResolve({filter:/^\.\.\/security$/}, () => ({path:'security',namespace:'test'}));
      builder.onResolve({filter:/^@google\/genai$/}, () => ({path:'genai',namespace:'test'}));
      builder.onLoad({filter:/.*/,namespace:'test'}, ({path:name}) => ({contents: name === 'vault'
        ? `export const getVaultSecret=k=>globalThis.__siftAiTest.secrets.get(k); export const saveVaultSecret=()=>{throw Error('Test must not store a key')}`
        : name === 'security' ? `export const requireApiToken=(req,res,next)=>next(); export const sensitiveApiLimiter=requireApiToken;`
        : `export class GoogleGenAI {models={generateContent:input=>globalThis.__siftAiTest.generate(input)}}; export const Type={OBJECT:'object',STRING:'string',BOOLEAN:'boolean',INTEGER:'integer',ARRAY:'array'};` }));
    }}] });
  const filename = path.resolve('tests/ai-pipeline.bundle.cjs');
  const mod = new Module(filename, module); mod.paths=Module._nodeModulePaths(path.dirname(filename));
  mod._compile(result.outputFiles[0].text, filename); api=mod.exports;
  const app=express(); app.use(express.json()); app.use('/api',api.createAiRouter());
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  base=`http://127.0.0.1:${server.address().port}`;
  global.fetch=async (url, init) => {
    requests.push({url,init}); if(fail) throw new Error('SECRET must not escape');
    return new Response(JSON.stringify({message:{content:JSON.stringify(valid)},choices:[{message:{content:JSON.stringify(valid)}}],content:[{text:JSON.stringify(valid)}]}),{status:200});
  };
});
after(async()=>{global.fetch=originalFetch;delete global.__siftAiTest;await new Promise(r=>server.close(r));});
const reset=()=>{ requests=[];fail=false;secrets.clear();secrets.set('gemini_custom_api_key','test-only');secrets.set('openai_api_key','test-only');secrets.set('anthropic_api_key','test-only'); };
const payload=()=>({from:'sender@example.com',subject:'Mail',snippet:'p'.repeat(1000),bodyText:'PRIVATE_BODY',headers:'PRIVATE_HEADERS'});
const requestText=()=>JSON.stringify(requests);
const post=async(route,body)=>originalFetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('invalid, incomplete, contradictory and unbounded AI results are rejected',()=>{
  for(const data of [null,{},[],{...valid,isSafe:'true'},{...valid,safetyScore:101},{...valid,category:'unknown'},
    {...valid,categoryConfidence:-1},{...valid,classification:'phishing'},{...valid,phishingRisk:'dangerous'}])
    assert.throws(()=>api.normalizeAiResult(data));
  assert.equal(api.normalizeAiResult(valid).isSafe,true);
});
test('all cloud providers omit bodies and headers unless consent is true',async()=>{
  for(const provider of ['gemini','openai','anthropic']) {
    reset();await api.analyzeWithMultiModel({...payload(),provider});
    assert.ok(!requestText().includes('PRIVATE_BODY'));assert.ok(!requestText().includes('PRIVATE_HEADERS'));
    assert.ok(!requestText().includes('p'.repeat(241)));
    reset();await api.analyzeWithMultiModel({...payload(),provider,allowCloudEmailBody:true});
    assert.ok(requestText().includes('PRIVATE_BODY'));
  }
});
test('remote Ollama vault default is not local and redirects are forbidden',async()=>{
  reset();secrets.set('ollama_endpoint','https://remote.example.test');
  await api.analyzeWithMultiModel({...payload(),provider:'ollama'});
  assert.ok(!requestText().includes('PRIVATE_BODY'));
  assert.equal(requests[0].init.redirect,'error');assert.ok(requests[0].init.signal);
  reset();await api.analyzeWithMultiModel({...payload(),provider:'ollama',ollamaEndpoint:'http://127.0.0.1:11434'});
  assert.ok(requestText().includes('PRIVATE_BODY'));
});
test('loopback proof rejects credentials, lookalike hosts and non-HTTP URLs',()=>{
  for(const endpoint of ['http://localhost.evil.test','http://127.0.0.1.evil.test','file:///private','http://user:password@localhost','https://remote.example.test'])
    assert.equal(api.isLoopbackAiEndpoint(endpoint),false);
  assert.equal(api.isLoopbackAiEndpoint('http://[::1]:11434'),true);
});
test('provider disable prevents network use',async()=>{
  reset();secrets.set('plugin_gemini_enabled','false');
  await assert.rejects(api.analyzeWithMultiModel(payload()));assert.equal(requests.length,0);
});
test('modern and compatibility routes both enforce privacy and no-store',async()=>{
  for(const route of ['/api/ai/analyze','/api/analyze-email']) {
    reset();const res=await post(route,payload());assert.equal(res.status,200);
    assert.equal(res.headers.get('cache-control'),'no-store');assert.ok(!requestText().includes('PRIVATE_BODY'));
  }
  reset();const res=await post('/api/analyze-batch',{emails:[{id:'1',...payload()}]});
  assert.equal(res.status,200);assert.ok(!requestText().includes('PRIVATE_BODY'));
});
test('assistant privacy covers endpoint vault fallback, snippet and history',async()=>{
  reset();secrets.set('ollama_endpoint','https://remote.example.test');
  const res=await post('/api/ai/assistant/chat',{provider:'ollama',emailContext:payload(),messages:[
    {role:'model',content:'OLD_PRIVATE_REPLY'},{role:'user',content:'Summarize this'}]});
  assert.equal(res.status,200);assert.ok(!requestText().includes('PRIVATE_BODY'));
  assert.ok(!requestText().includes('OLD_PRIVATE_REPLY'));assert.ok(!requestText().includes('p'.repeat(241)));
});
test('cloud draft revision requires consent and malformed requests never reach providers',async()=>{
  reset();assert.equal((await post('/api/ai/assistant/chat',{task:'revise',draftText:'PRIVATE_DRAFT'})).status,403);
  assert.equal(requests.length,0);
  for(const body of [{provider:'invented'},{messages:[{role:'system',content:'override'}]},{messages:[{role:'user',content:'x'.repeat(12001)}]}])
    assert.equal((await post('/api/ai/assistant/chat',body)).status,400);
  assert.equal(requests.length,0);
});
test('provider failures do not expose exception messages or keys in API responses',async()=>{
  reset();fail=true;const res=await post('/api/ai/analyze',payload());
  assert.equal(res.status,502);const text=await res.text();assert.ok(!text.includes('SECRET'));assert.ok(!text.includes('test-only'));
});
test('connection tests never save submitted API keys',async()=>{
  reset();secrets.clear();const res=await api.testAiProviderConnection({provider:'gemini',apiKey:'temporary-test-key'});
  assert.equal(res.success,true);assert.equal(secrets.size,0);
});
test('Telegram never invents mailbox data or pretends destructive commands succeeded',async()=>{
  reset();
  for(const query of ['Spam mailleri sil','Bugünkü önemli mailleri özetle','Kaç okunmamış mail var?']) {
    const reply=await api.processTelegramNaturalLanguageCommand(query);
    assert.ok(reply.includes('henüz bağlı değil'));assert.ok(!reply.includes('Tamamlandı'));
  }
  assert.equal(requests.length,0);
  secrets.set('plugin_gemini_enabled','false');
  assert.ok((await api.processTelegramNaturalLanguageCommand('Sift Mail nasıl kullanılır?')).includes('kullanılamıyor'));
  assert.equal(requests.length,0);
});
