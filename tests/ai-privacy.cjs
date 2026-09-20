const {buildSync}=require('esbuild');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const path=require('node:path');
const code=buildSync({entryPoints:['shared/services/aiPrivacy.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const mod=new Module(path.resolve('ai-privacy.cjs'),module);mod._compile(code,path.resolve('ai-privacy.cjs'));
const {emailBodyForAI}=mod.exports;
test('cloud AI body is opt-in while local Ollama remains local',()=>{
 assert.equal(emailBodyForAI('secret body','gemini',false),undefined);
 assert.equal(emailBodyForAI('secret body','openai',true),'secret body');
 assert.equal(emailBodyForAI('secret body','ollama',false),'secret body');
});
