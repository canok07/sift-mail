const {buildSync}=require('esbuild');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const path=require('node:path');

const code=buildSync({entryPoints:['shared/services/mailViewGuard.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const mod=new Module(path.resolve('mail-view-guard.cjs'),module);mod._compile(code,path.resolve('mail-view-guard.cjs'));
const {MailViewRequestGuard}=mod.exports;

test('late folder request is invalid after account or folder changes',()=>{
 const guard=new MailViewRequestGuard();
 const inboxRequest=guard.begin();
 assert.equal(guard.isCurrent(inboxRequest),true);
 guard.invalidate();
 assert.equal(guard.isCurrent(inboxRequest),false);
 const spamRequest=guard.begin();
 assert.equal(guard.isCurrent(spamRequest),true);
});
