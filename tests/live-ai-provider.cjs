// Opt-in live synthetic connection/generation check. Never reads mail or saves keys.
const {buildSync}=require('esbuild');
const Module=require('node:module');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const provider=process.env.SIFT_LIVE_AI_PROVIDER;
const model=process.env.SIFT_LIVE_AI_MODEL?.trim();
const key=process.env.SIFT_LIVE_AI_KEY;
const endpoint=process.env.SIFT_LIVE_AI_ENDPOINT || 'http://127.0.0.1:11434';
if(!['gemini','openai','anthropic','ollama'].includes(provider) || !model || (provider!=='ollama'&&!key)){
 console.error('BLOCKED: supply SIFT_LIVE_AI_PROVIDER, SIFT_LIVE_AI_MODEL and a fresh SIFT_LIVE_AI_KEY for cloud providers. No provider was contacted.');process.exit(2);
}
if(provider==='ollama'){
 try{const url=new URL(endpoint);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error();
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&process.env.SIFT_LIVE_AI_ALLOW_REMOTE!=='true')throw Error();
 }catch{console.error('BLOCKED: remote Ollama requires explicit SIFT_LIVE_AI_ALLOW_REMOTE=true and a valid HTTP(S) endpoint.');process.exit(2);}
}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sift-live-ai-test-'));
process.env.SIFT_DATA_DIR=directory;
const envKey={gemini:'GEMINI_API_KEY',openai:'OPENAI_API_KEY',anthropic:'ANTHROPIC_API_KEY'}[provider];
if(envKey)process.env[envKey]=key;
(async()=>{
 const code=buildSync({entryPoints:['core/ai/multiModelService.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text;
 const mod=new Module(path.resolve('live-ai-runtime.cjs'),module);mod.filename=path.resolve('live-ai-runtime.cjs');mod.paths=module.paths;mod._compile(code,mod.filename);
 const api=mod.exports;
 const tested=await api.testAiProviderConnection({provider,apiKey:key,model,endpoint:provider==='ollama'?endpoint:undefined});
 if(!tested.success)throw Error('LIVE_AI_CONNECTION_FAILED');
 const result=await api.generateAssistantText({provider,modelName:model,ollamaEndpoint:provider==='ollama'?endpoint:undefined,
  systemInstruction:'This is a synthetic connection test. Reply briefly; no tools or mail actions.',prompt:'Say hello in one short sentence.'});
 if(typeof result!=='string'||!result.trim())throw Error('LIVE_AI_GENERATION_FAILED');
 if(fs.existsSync(path.join(directory,'vault.enc')))throw Error('LIVE_AI_UNEXPECTED_PERSISTENCE');
 console.log(`PASS: real ${provider} connection and synthetic generation. No mail, key storage or mail action was used.`);
})().catch(()=>{console.error('LIVE_AI_CHECK_FAILED: inspect provider configuration privately. Provider output and secrets are intentionally omitted.');process.exitCode=1;})
.finally(()=>{if(directory.startsWith(path.join(os.tmpdir(),'sift-live-ai-test-')))fs.rmSync(directory,{recursive:true,force:true});});
