class ImapFlow {
 constructor(options){this.f=global.__workflowImap;this.f.options=options;this.capabilities=new Set(this.f.gmail?['X-GM-EXT-1']:[]);this.mailbox={uidValidity:this.f.uidValidity || '42',permanentFlags:new Set(this.f.keywords?['\\*']:[])};}
 async connect(){this.f.connected=true;}
 async list(){return this.f.noDrafts?[]:[{path:'Drafts',name:'Drafts',specialUse:'\\Drafts',flags:new Set()},{path:'Sent',name:'Sent',specialUse:'\\Sent',flags:new Set()}];}
 async search(){return this.f.existingSent?[99]:[];}
 async getMailboxLock(){return{release:()=>this.f.released=true};}
 async fetchOne(uid,query,opts){this.f.fetches.push({uid,query,opts});if(this.f.missing)return false;if(query.source)return{source:this.f.raw};return{uid,size:this.f.raw?.length || 10,envelope:{messageId:this.f.messageId || '<original@example.com>'},labels:new Set(this.f.labels || []),flags:new Set(this.f.labels || [])};}
 async append(folder,bytes,flags){this.f.appended={folder,bytes,flags};if(this.f.appendError)throw new Error('SYNTHETIC_SECRET');return this.f.appendFalse?false:{uid:12,uidValidity:42n};}
 async messageFlagsAdd(uid,labels,opts){this.f.store={uid,labels,opts};if(!this.f.notApplied)this.f.labels=[...(this.f.labels || []),...labels];return true;}
 async messageFlagsRemove(uid,labels,opts){this.f.store={uid,labels,opts};if(!this.f.notApplied)this.f.labels=(this.f.labels || []).filter(x=>!labels.includes(x));return true;}
 async logout(){this.f.loggedOut=true;}
 close(){this.f.closed=true;}
}
module.exports={ImapFlow};
