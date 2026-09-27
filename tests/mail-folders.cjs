const {buildSync} = require('esbuild');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const Module = require('node:module');
const path = require('node:path');

const raw = Buffer.from('From: Alice <alice@example.com>\r\nTo: Bob <bob@example.com>\r\nSubject: MIME test\r\nDate: Fri, 18 Sep 2026 12:00:00 +0000\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="fixture"\r\n\r\n--fixture\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nVielen Dank f=C3=BCr Ihre Nachricht.\r\n' + 'Full message. '.repeat(80) + '\r\n--fixture\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from('<html><body><p>Vielen Dank für Ihre Nachricht.</p></body></html>').toString('base64') + '\r\n--fixture--\r\n');
const attachmentRaw=Buffer.from('From: Alice <alice@example.com>\r\nSubject: Attachment test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="att"\r\n\r\n--att\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nSee attachment.\r\n--att\r\nContent-Type: application/pdf; name="report.pdf"\r\nContent-Disposition: attachment; filename="report.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from('PDF fixture').toString('base64') + '\r\n--att--\r\n');
let scenario = {}, queries = [];
class FakeImap {
 async connect() {}
 async logout() {}
 async list() {return [{path:'INBOX',name:'INBOX'},{path:'[Gmail]/Gönderilmiş Postalar',name:'Gönderilmiş Postalar',specialUse:'\\Sent'},{path:'[Gmail]/Spam',name:'Spam',specialUse:'\\Junk'},{path:'[Gmail]/Çöp Kutusu',name:'Çöp Kutusu',specialUse:'\\Trash'},{path:'[Gmail]/Tüm Postalar',name:'Tüm Postalar',specialUse:'\\All'}];}
 async getMailboxLock(folder) {
  if (scenario.failure === folder) throw new Error('Folder failed');
  const exists=folder.endsWith('/Spam') ? (scenario.emptySpam ? 0 : 3) : 205;
  this.folder = folder; this.mailbox = {exists,uidValidity:scenario.uidValidity || 1,uidNext:exists+1};
  return {release(){}};
 }
 async search(query) { const start=Number(String(query.uid).split(':')[0]); return start<=205?Array.from({length:206-start},(_,index)=>start+index):[]; }
 async *fetch(range,options,fetchOptions={}) {
  assert.equal(options.source,true);
  queries.push({folder:this.folder,range});
  const values=fetchOptions.uid?range.split(',').map(Number):null;
  const [start,end]=values?[values[0],values.at(-1)]:range.split(':').map(Number);
  const date=this.folder==='INBOX'?'19':this.folder.endsWith('/Spam')?'17':'18';
  for(let uid=start;uid<=end;uid++) yield {uid,source:scenario.attachmentRaw?attachmentRaw:Buffer.from(raw.toString().replace('18 Sep',date+' Sep')),envelope:{from:[{address:'alice@example.com',name:'Alice'}],subject:'MIME test',date:new Date()},flags:new Set()};
 }
 async messageFlagsAdd(){this.flags=new Set(['\\Seen']);}
 async messageFlagsRemove(){this.flags=new Set();}
 async messageMove(uid,destination){this.moved={uid,destination};}
 async fetchOne(uid,options){return this.moved?false:{uid,flags:this.flags||new Set(),...(options?.source?{source:scenario.attachmentRaw?attachmentRaw:raw}:{})};}
}
const compiled=buildSync({entryPoints:['core/sync/imap.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text;
const instance=new Module(path.resolve('core/sync/test-module.cjs'),module);
instance.filename=path.resolve('core/sync/test-module.cjs');instance.paths=module.paths;
instance.require=(name)=>name==='imapflow'?{ImapFlow:FakeImap}:require(name);
instance._compile(compiled,instance.filename);
const {fetchImapMessages,fetchImapAttachment,classifyMailbox,performImapAction}=instance.exports;
const options={host:'imap.example.com',port:993,secure:true,auth:{user:'test@example.com',pass:'fixture'},accountId:'test'};

test('IMAP folders and decoded complete MIME bodies remain separate',async()=>{
 scenario={};queries=[];
 const result=await fetchImapMessages(options,100);
 assert.equal(result.success,true);
 assert.equal(result.messages.filter(m=>m.folderType==='inbox').length,100);
 assert.equal(result.messages.filter(m=>m.folderType==='sent').length,100);
 assert.equal(result.messages.filter(m=>m.folderType==='spam').length,3);
 assert.equal(result.mailboxes.find(m=>m.type==='inbox').totalMessages,205);
 const message=result.messages[0];
 assert.equal(message.folderType,'inbox');
 assert.equal(result.messages.at(-1).folderType,'spam');
 assert.match(message.bodyText,/für Ihre Nachricht/);
 assert.ok(message.bodyText.length>180);
 assert.ok(message.snippet.length<=180);
 assert.match(message.bodyHtml,/<html>/);
 assert.doesNotMatch(message.bodyText,/Content-Transfer-Encoding|=C3/);
 assert.equal(new Set(result.messages.map(m=>m.id)).size,203);
 assert.equal(classifyMailbox({path:'[Gmail]/Gesendet',name:'Gesendet',specialUse:'\\Sent'}).type,'sent');
});
test('incremental sync fetches only UIDs newer than the saved cursor',async()=>{
 scenario={uidValidity:1};queries=[];
 const result=await fetchImapMessages({...options,folder:'INBOX',sinceUid:202,expectedUidValidity:'1'},25);
 assert.equal(result.success,true);assert.equal(result.incremental,true);
 assert.deepEqual(result.messages.map(message=>message.uid),[203,204,205]);
 assert.equal(queries[0].range,'203,204,205');
 assert.equal(result.mailboxes.find(mailbox=>mailbox.type==='inbox').highestUid,205);
});
test('UIDVALIDITY mismatch falls back to a safe recent-window refresh',async()=>{
 scenario={uidValidity:2};queries=[];
 const result=await fetchImapMessages({...options,folder:'INBOX',sinceUid:202,expectedUidValidity:'1'},25);
 assert.equal(result.incremental,false);assert.equal(queries[0].range,'181:205');
});
test('next page fetches the older sequence range',async()=>{
 scenario={};queries=[];
 const result=await fetchImapMessages({...options,folder:'INBOX',offset:100},100);
 assert.equal(result.success,true);assert.equal(queries[0].range,'6:105');
 assert.equal(result.messages.length,100);
});
test('message identity changes when mailbox UIDVALIDITY changes',async()=>{
 scenario={uidValidity:1};
 const first=await fetchImapMessages({...options,folder:'INBOX'},1);
 scenario={uidValidity:2};
 const second=await fetchImapMessages({...options,folder:'INBOX'},1);
 assert.notEqual(first.messages[0].id,second.messages[0].id);
});
test('incoming attachment metadata can be downloaded by UID',async()=>{
 scenario={attachmentRaw:true};
 const result=await fetchImapMessages({...options,folder:'INBOX'},1);
 assert.deepEqual(result.messages[0].attachments,[{index:0,filename:'report.pdf',contentType:'application/pdf',size:11}]);
 const attachment=await fetchImapAttachment({...options,folder:'INBOX',uid:result.messages[0].uid,index:0});
 assert.equal(Buffer.from(attachment.content,'base64').toString(),'PDF fixture');
 assert.equal(attachment.filename,'report.pdf');
});
test('empty spam is distinct from a folder failure',async()=>{
 scenario={emptySpam:true};
 let result=await fetchImapMessages(options,1);
 assert.equal(result.success,true);assert.equal(result.mailboxes.find(m=>m.type==='spam').totalMessages,0);
 scenario={failure:'[Gmail]/Spam'};
 result=await fetchImapMessages(options,1);
 assert.equal(result.success,false);assert.match(result.error,/spam/);
});
test('JSON containing an HTML email is valid API data',async()=>{
 const code=buildSync({entryPoints:['shared/services/apiClient.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
 const parser=new Module(path.resolve('parser.cjs'),module);parser._compile(code,path.resolve('parser.cjs'));
 const value={success:true,bodyHtml:'<!doctype html><html><body>Hello</body></html>'};
 assert.deepEqual(await parser.exports.parseResponseSafe(new Response(JSON.stringify(value))),value);
 await assert.rejects(()=>parser.exports.parseResponseSafe(new Response('<html>404</html>',{status:404})));
});
test('real IMAP actions are independently verified',async()=>{
 const read=await performImapAction({...options,uid:1,sourceFolder:'INBOX',action:'mark_read'});
 assert.deepEqual(read,{success:true,verified:true});
 const trash=await performImapAction({...options,uid:1,sourceFolder:'INBOX',action:'trash'});
 assert.equal(trash.success,true);assert.equal(trash.verified,true);assert.equal(trash.destination,'[Gmail]/Çöp Kutusu');
});
