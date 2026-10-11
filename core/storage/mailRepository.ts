import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { decryptData, encryptData, getVaultKey } from '../security/vault';
import { matchesMailSearch } from '../mail/workflows';

const directory = process.env.SIFT_DATA_DIR || path.join(process.cwd(), 'data');
const file = path.join(directory, 'mail-store.sqlite');
const legacyFile = path.join(directory, 'mail-cache.enc');
const maxBytes = 40 * 1024 * 1024;
const tables = ['messages', 'drafts', 'labels', 'sync_state', 'accounts', 'rules'] as const;
type Table = typeof tables[number];
type Item = Record<string, any>;
export interface LocalMailSnapshot {
  version: 1; messages: unknown[]; composeDraft: Item | null; replyDrafts: Record<string, unknown>;
  labels?: Item[]; syncStates?: Item[]; accounts?: Item[]; rules?: Item[];
}
const forbidden = new Set(['password','pass','accessToken','refreshToken','apiKey','clientSecret','credentials','auth']);
function noCredentials(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error('Credentials cannot be saved in the mail store.');
    noCredentials(nested);
  }
}
export function validateSnapshot(value: unknown): asserts value is LocalMailSnapshot {
  const s = value as LocalMailSnapshot;
  if (!s || s.version !== 1 || !Array.isArray(s.messages) || s.messages.length > 100000 ||
      !s.replyDrafts || typeof s.replyDrafts !== 'object' || Array.isArray(s.replyDrafts) ||
      !(s.composeDraft === null || (s.composeDraft && typeof s.composeDraft === 'object' && !Array.isArray(s.composeDraft)))) throw new Error('Invalid mail snapshot.');
  for (const message of s.messages as Item[]) if (!message || typeof message.id !== 'string' || !message.id || typeof message.accountId !== 'string' || !message.accountId) throw new Error('Invalid message identity.');
  for (const key of ['labels','syncStates','accounts','rules'] as const) {
    if (s[key] === undefined) continue;
    if (!Array.isArray(s[key]) || s[key].length > 100000) throw new Error('Invalid mail collection.');
    for (const item of s[key]) {
      if (!item || typeof item !== 'object' || (key === 'syncStates' ? typeof item.accountId !== 'string' || typeof item.folder !== 'string' : typeof item.id !== 'string' || !item.id)) throw new Error('Invalid mail metadata identity.');
      if(key==='accounts'&&(typeof item.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)||typeof item.displayName!=='string'||!['gmail','outlook','yandex','yahoo','icloud','imap'].includes(item.provider)))throw new Error('Invalid account metadata.');
      if(key==='accounts'&&item.mailboxes!==undefined&&(!Array.isArray(item.mailboxes)||item.mailboxes.some(m=>!m||typeof m.path!=='string'||typeof m.name!=='string'||!['inbox','spam','sent','drafts','trash','archive','other'].includes(m.type))))throw new Error('Invalid folder metadata.');
      if(key==='accounts'&&item.imapConfig!==undefined&&(!item.imapConfig||typeof item.imapConfig.host!=='string'||!Number.isInteger(item.imapConfig.port)||item.imapConfig.port<1||item.imapConfig.port>65535||typeof item.imapConfig.secure!=='boolean'||typeof item.imapConfig.username!=='string'))throw new Error('Invalid server configuration.');
      if(key==='labels'&&(typeof item.name!=='string'||(item.color!==undefined&&typeof item.color!=='string')))throw new Error('Invalid label metadata.');
      if(key==='rules'&&((item.patternValue!==undefined&&typeof item.patternValue!=='string')||(item.patternType!==undefined&&!['from','subject','domain'].includes(item.patternType))))throw new Error('Invalid mail rule.');
    }
  }
  noCredentials(s);
  if (Buffer.byteLength(JSON.stringify(s),'utf8') > maxBytes) throw new Error('Mail snapshot exceeds the 40 MB transfer limit.');
}
function regular(filePath: string): void {
  try {
    const entry = fs.lstatSync(filePath);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Mail storage must contain regular files.');
    if (process.platform !== 'win32') fs.chmodSync(filePath,0o600);
  } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
}
type Store = { db: DatabaseSync; index: (kind: string,value: string) => string; seal: (id: string,value: unknown) => string; open: (id: string,value: string) => any };
function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function withStore<T>(action: (s: Store) => T): T {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw new Error('Invalid mail directory.');
  if (process.platform !== 'win32') fs.chmodSync(directory,0o700);
  for (const name of [file,`${file}-journal`,`${file}-wal`,`${file}-shm`,legacyFile]) regular(name);
  // One vault derivation per operation, not per row. Domain-separated mail and index keys.
  const vaultKey = getVaultKey();
  const key = Buffer.from(crypto.hkdfSync('sha256',vaultKey,Buffer.alloc(0),'sift-mail-records-v1',32));
  const indexKey = Buffer.from(crypto.hkdfSync('sha256',vaultKey,Buffer.alloc(0),'sift-mail-index-v1',32));
  vaultKey.fill(0);
  let db: DatabaseSync;
  const index = (kind: string,value: string) => crypto.createHmac('sha256',indexKey).update(JSON.stringify([kind,value])).digest('hex');
  const seal = (id: string,value: unknown) => {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm',key,iv); c.setAAD(Buffer.from(id));
    const data = Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);
    return [iv,c.getAuthTag(),data].map(v=>v.toString('base64')).join('.');
  };
  const open = (id: string,value: string) => {
    const parts = value.split('.'); if(parts.length!==3) throw new Error('Invalid encrypted mail record.');
    const [iv,tag,data] = parts.map(v=>Buffer.from(v,'base64'));
    const c = crypto.createDecipheriv('aes-256-gcm',key,iv); c.setAAD(Buffer.from(id)); c.setAuthTag(tag);
    return JSON.parse(Buffer.concat([c.update(data),c.final()]).toString('utf8'));
  };
  try {
    db = new DatabaseSync(file); regular(file);
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
    const version = Number((db.prepare('PRAGMA user_version').get() as any).user_version);
    if(version>1) throw new Error('Mail schema is newer than this app.');
    db.exec('CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY,payload TEXT NOT NULL) STRICT');
    const check = db.prepare("SELECT payload FROM meta WHERE id='key-check'").get() as any;
    if(check && open('key-check',check.payload)!=='sift-mail-store-v1') throw new Error('Wrong mail store key.');
    if(!check && version!==0) throw new Error('Mail key check is missing.');
    transaction(db,()=>{
      for(const table of tables) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,account TEXT NOT NULL,folder TEXT NOT NULL,position INTEGER NOT NULL,date INTEGER NOT NULL,digest TEXT NOT NULL,payload TEXT NOT NULL
      ) STRICT; CREATE INDEX IF NOT EXISTS ${table}_account_folder_date ON ${table}(account,folder,date DESC,id);`);
      if(!check) db.prepare("INSERT INTO meta VALUES ('key-check',?)").run(seal('key-check','sift-mail-store-v1'));
      db.exec('PRAGMA user_version=1');
    });
    const s = {db,index,seal,open};
    if(!db.prepare("SELECT id FROM meta WHERE id='snapshot'").get() && fs.existsSync(legacyFile)) {
      const old = JSON.parse(decryptData(fs.readFileSync(legacyFile,'utf8'))); validateSnapshot(old); writeSnapshot(s,old);
    }
    return action(s);
  } finally { db?.close(); key.fill(0); indexKey.fill(0); }
}
function collection(s: Store,table: Table,items: Array<{key:string;value:Item;account?:string;folder?:string}>): void {
  const old = new Map(s.db.prepare(`SELECT id,digest FROM ${table}`).all().map((r:any)=>[r.id,r.digest]));
  const seen = new Set<string>();
  const insert = s.db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET account=excluded.account,folder=excluded.folder,position=excluded.position,date=excluded.date,digest=excluded.digest,payload=excluded.payload`);
  const reorder = s.db.prepare(`UPDATE ${table} SET position=? WHERE id=? AND position<>?`);
  for(const [position,item] of items.entries()) {
    const id = s.index(table,item.key),digest = s.index('digest',JSON.stringify(item.value));
    if(seen.has(id)) throw new Error('Duplicate mail identity.'); seen.add(id);
    if(old.get(id)===digest) { reorder.run(position,id,position); continue; }
    const date = Date.parse(String(item.value.date||''));
    insert.run(id,s.index('account',item.account||''),s.index('folder',item.folder||''),position,Number.isFinite(date)?date:0,digest,s.seal(`${table}:${id}`,item.value));
  }
  const remove = s.db.prepare(`DELETE FROM ${table} WHERE id=?`);
  for(const id of old.keys()) if(!seen.has(id)) remove.run(id);
}
function writeSnapshot(s: Store,snapshot: LocalMailSnapshot): void {
  validateSnapshot(snapshot);
  transaction(s.db,()=>{
    collection(s,'messages',(snapshot.messages as Item[]).map(value=>({key:JSON.stringify([value.accountId,value.id]),value,account:value.accountId,folder:value.folder})));
    const drafts = Object.entries(snapshot.replyDrafts).map(([key,value]:[string,Item])=>({key:`reply:${key}`,value:{key,draft:value},account:value?.accountId}));
    if(snapshot.composeDraft) drafts.push({key:'compose',value:{key:'',draft:snapshot.composeDraft},account:snapshot.composeDraft.accountId});
    collection(s,'drafts',drafts);
    for(const [field,table] of [['labels','labels'],['accounts','accounts'],['rules','rules'],['syncStates','sync_state']] as const) {
      // Missing optional fields from older clients never erase newer metadata.
      if(snapshot[field]!==undefined) collection(s,table,snapshot[field].map(value=>({key:table==='sync_state'?JSON.stringify([value.accountId,value.folder]):value.id,value,account:value.accountId||(table==='accounts'?value.id:''),folder:value.folder})));
    }
    const marker = s.db.prepare("SELECT payload FROM meta WHERE id='snapshot'").get() as any;
    const fields = ['labels','accounts','rules','syncStates'].filter(field=>snapshot[field]!==undefined);
    const previous: string[] = marker?s.open('snapshot',marker.payload):[];
    s.db.prepare("INSERT INTO meta VALUES ('snapshot',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(s.seal('snapshot',[...new Set([...previous,...fields])]));
  });
}
function readCollection(s: Store,table: Table): any[] {
  return s.db.prepare(`SELECT id,payload FROM ${table} ORDER BY position,id`).all().map((r:any)=>s.open(`${table}:${r.id}`,r.payload));
}
function readSnapshot(s: Store): LocalMailSnapshot|null {
  const marker = s.db.prepare("SELECT payload FROM meta WHERE id='snapshot'").get() as any; if(!marker) return null;
  const fields: string[] = s.open('snapshot',marker.payload);
  const snapshot:LocalMailSnapshot = {version:1,messages:readCollection(s,'messages'),composeDraft:null,replyDrafts:{}};
  for(const r of s.db.prepare('SELECT id,payload FROM drafts ORDER BY position').all() as any[]) {
    const v = s.open(`drafts:${r.id}`,r.payload);
    if(r.id===s.index('drafts','compose')) snapshot.composeDraft=v.draft;
    else Object.defineProperty(snapshot.replyDrafts,v.key,{value:v.draft,enumerable:true,configurable:true,writable:true});
  }
  for(const [field,table] of [['labels','labels'],['accounts','accounts'],['rules','rules'],['syncStates','sync_state']] as const) if(fields.includes(field)) snapshot[field]=readCollection(s,table);
  return snapshot;
}
export function loadLocalMailSnapshot():LocalMailSnapshot|null {return withStore(readSnapshot);}
export function saveLocalMailSnapshot(snapshot:LocalMailSnapshot):void {validateSnapshot(snapshot);withStore(s=>writeSnapshot(s,snapshot));}
export function listLocalMessages(options:{accountId?:string;folder?:string;query?:string;limit?:number;offset?:number}={}):{messages:unknown[];total:number} {
  const limit=options.limit??50,offset=options.offset??0;
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000) throw new Error('Invalid mail page.');
  return withStore(s=>{
    const clauses:string[]=[],args:string[]=[];
    if(options.accountId){clauses.push('account=?');args.push(s.index('account',options.accountId));}
    if(options.folder){clauses.push('folder=?');args.push(s.index('folder',options.folder));}
    const where=clauses.length?` WHERE ${clauses.join(' AND ')}`:'';
    if(options.query?.trim()) {
      if(options.query.length>500)throw new Error('Invalid search.');
      // Scan scoped encrypted records in memory: no plaintext body/search index on disk.
      const matching=s.db.prepare(`SELECT id,payload FROM messages${where} ORDER BY date DESC,id`).all(...args).map((row:any)=>{
        const message=s.open(`messages:${row.id}`,row.payload);
        if((options.accountId && message.accountId!==options.accountId)||(options.folder && message.folder!==options.folder))throw new Error('Mail index identity mismatch.');
        return message;
      }).filter(message=>matchesMailSearch(message,options.query!));
      return {messages:matching.slice(offset,offset+limit),total:matching.length};
    }
    const total=Number((s.db.prepare(`SELECT COUNT(*) AS total FROM messages${where}`).get(...args) as any).total);
    const messages=s.db.prepare(`SELECT id,payload FROM messages${where} ORDER BY date DESC,id LIMIT ? OFFSET ?`).all(...args,limit,offset).map((r:any)=>{
      const message=s.open(`messages:${r.id}`,r.payload);
      if((options.accountId&&message.accountId!==options.accountId)||(options.folder&&message.folder!==options.folder))throw new Error('Mail index identity mismatch.');
      return message;
    });
    return {messages,total};
  });
}
function withoutAccount(s:LocalMailSnapshot,id:string):LocalMailSnapshot {
  return {...s,messages:(s.messages as Item[]).filter(m=>m.accountId!==id),composeDraft:s.composeDraft?.accountId===id?null:s.composeDraft,
    replyDrafts:Object.fromEntries(Object.entries(s.replyDrafts).filter(([,v]:[string,Item])=>v?.accountId!==id)),
    ...(s.accounts?{accounts:s.accounts.filter(v=>v.id!==id)}:{}),...(s.syncStates?{syncStates:s.syncStates.filter(v=>v.accountId!==id)}:{})};
}
export function removeStoredAccount(id:string):void {
  withStore(s=>{
    // Prune recovery data too; failures are visible and retryable, never claimed as atomic across vault/DB.
    if(fs.existsSync(legacyFile)) {
      const old=JSON.parse(decryptData(fs.readFileSync(legacyFile,'utf8')));validateSnapshot(old);
      const temporary=`${legacyFile}.${process.pid}.tmp`;
      try{fs.writeFileSync(temporary,encryptData(JSON.stringify(withoutAccount(old,id))),{mode:0o600,flag:'wx'});fs.renameSync(temporary,legacyFile);}
      finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    }
    transaction(s.db,()=>{for(const table of ['messages','drafts','accounts','sync_state'] as const)s.db.prepare(`DELETE FROM ${table} WHERE account=?`).run(s.index('account',id));});
  });
}
/** Portable, password-encrypted data only; never includes vault/DPAPI keys or login credentials. */
export function exportLocalMailArchive(password:string):string {
  if(password.length<12||password.length>1024)throw new Error('Backup password needs 12 characters.');
  const snapshot=loadLocalMailSnapshot()||{version:1 as const,messages:[],composeDraft:null,replyDrafts:{}};validateSnapshot(snapshot);
  const salt=crypto.randomBytes(32),iv=crypto.randomBytes(12),key=crypto.scryptSync(password,salt,32);
  try{const c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('sift-mail-backup-v1'));
    const data=Buffer.concat([c.update(JSON.stringify(snapshot),'utf8'),c.final()]);
    return JSON.stringify({format:'sift-mail-backup',version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')});
  }finally{key.fill(0);}
}
export function importLocalMailArchive(archive:string,password:string):void {
  if(archive.length>55*1024*1024||password.length<12||password.length>1024)throw new Error('Invalid mail backup.');
  const a=JSON.parse(archive);
  if(a.format!=='sift-mail-backup'||a.version!==1||![a.salt,a.iv,a.tag,a.data].every(v=>typeof v==='string'))throw new Error('Invalid mail backup.');
  const salt=Buffer.from(a.salt,'base64'),iv=Buffer.from(a.iv,'base64'),tag=Buffer.from(a.tag,'base64');
  if(salt.length!==32||iv.length!==12||tag.length!==16)throw new Error('Invalid mail backup.');
  const key=crypto.scryptSync(password,salt,32);
  try{const c=crypto.createDecipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('sift-mail-backup-v1'));c.setAuthTag(tag);
    const data=Buffer.concat([c.update(Buffer.from(a.data,'base64')),c.final()]);if(data.length>maxBytes)throw new Error('Backup exceeds transfer limit.');
    const snapshot=JSON.parse(data.toString('utf8'));validateSnapshot(snapshot);saveLocalMailSnapshot(snapshot);
  }finally{key.fill(0);}
}
