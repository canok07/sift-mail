const {buildSync}=require('esbuild');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const code=buildSync({entryPoints:['core/security/index.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const mod=new Module(path.resolve('local-auth-runtime.cjs'),module);mod._compile(code,path.resolve('local-auth-runtime.cjs'));
const api=mod.exports;
function call(headers){let status,body,allowed=false;api.requireApiToken({headers:{host:'localhost:3000',...headers},socket:{remoteAddress:'127.0.0.1'}},{status(n){status=n;return this;},json(data){body=data;return this;}},()=>{allowed=true;});return {status,body,allowed};}
test('loopback without token is not authenticated',()=>{assert.equal(call({}).status,401);assert.equal(call({origin:'http://localhost:3000'}).allowed,false);assert.equal(call({'x-sift-key':'bad'}).allowed,false);});
test('valid runtime token permits protected requests',()=>{assert.equal(call({'x-sift-key':api.getActiveSessionToken()}).allowed,true);assert.equal(call({authorization:`Bearer ${api.getActiveSessionToken()}`}).allowed,true);});
test('malformed token headers fail closed without exceptions',()=>{assert.equal(api.isValidToken(['x','y']),false);assert.equal(call({'x-sift-key':['x','y']}).status,401);});
