import MailComposer from 'nodemailer/lib/mail-composer';
import { buildImapClient, classifyMailbox, type ImapConnectOptions } from '../sync/imap';
import { mailAddresses, messageReferences } from './workflows';

export interface ProviderMailContent {
  to: string; cc?: string; bcc?: string; subject: string; text: string; html?: string;
  inReplyTo?: string; references?: string[];
  attachments?: Array<{filename:string;content:string;encoding?:'base64';contentType?:string}>;
}
export function assertProviderAccount(options: ImapConnectOptions & {accountId:string;accountEmail:string}) {
  if (!options.accountId || options.accountEmail.trim().toLowerCase() !== options.auth.user.trim().toLowerCase()) throw new Error('ACCOUNT_MISMATCH');
}

/** Optional copy for standard SMTP servers that do not maintain Sent automatically. No retry after SMTP delivery. */
export async function saveProviderSentCopy(options:ImapConnectOptions & {accountId:string;accountEmail:string},mail:ProviderMailContent,messageId:string) {
  assertProviderAccount(options);
  if(messageReferences([messageId])[0]!==messageId)throw new Error('SENT_ID_REQUIRED');
  const mime=new MailComposer({...mail,bcc:undefined,from:options.auth.user,messageId,references:messageReferences(mail.references)}).compile();
  mime.keepBcc=false;
  const bytes=await new Promise<Buffer>((resolve,reject)=>mime.build((error,buffer)=>error?reject(error):resolve(buffer)));
  if(bytes.length>25*1024*1024)throw new Error('SENT_TOO_LARGE');
  const client=buildImapClient(options);let lock:any;
  try{
    await client.connect();
    const folder=(await client.list()).find(box=>!box.flags?.has('\\Noselect') && classifyMailbox(box).type==='sent')?.path;
    if(!folder)throw new Error('SENT_UNAVAILABLE');
    lock=await client.getMailboxLock(folder);
    const matches=await client.search({header:{'message-id':messageId}},{uid:true});
    if(!Array.isArray(matches))throw new Error('SENT_SEARCH_UNCONFIRMED');
    if(matches.length)return {success:true,folder};
    const result=await client.append(folder,bytes,['\\Seen']);
    if(!result)throw new Error('SENT_SAVE_UNCONFIRMED');
    return {success:true,folder};
  }finally{try{lock?.release();}catch{}try{await client.logout();}catch{try{client.close();}catch{}}}
}

/** APPEND is explicit and non-destructive: preserve existing remote drafts. */
export async function saveProviderDraft(options: ImapConnectOptions & {accountId:string;accountEmail:string}, mail:ProviderMailContent) {
  assertProviderAccount(options);
  const mime=new MailComposer({ ...mail, from:options.auth.user,references:messageReferences(mail.references) }).compile();
  mime.keepBcc=true;
  const bytes = await new Promise<Buffer>((resolve,reject) => mime.build((error,buffer) => error ? reject(error) : resolve(buffer)));
  if (bytes.length > 25*1024*1024) throw new Error('DRAFT_TOO_LARGE');
  const client = buildImapClient(options);
  try {
    await client.connect();
    const folder = (await client.list()).find(box => !box.flags?.has('\\Noselect') && classifyMailbox(box).type === 'drafts')?.path;
    if (!folder) throw new Error('DRAFTS_UNAVAILABLE');
    const result = await client.append(folder,bytes,['\\Draft']);
    if (!result) throw new Error('DRAFT_SAVE_UNCONFIRMED');
    return {success:true,folder,uid:result.uid || undefined,uidValidity:result.uidValidity ? String(result.uidValidity) : undefined};
  } finally { try { await client.logout(); } catch { try { client.close(); } catch {} } }
}

/** Load draft attachments only after exact mailbox/UID/message identity verification. */
export async function openProviderDraft(options:ImapConnectOptions & {accountId:string;accountEmail:string;folder:string;uid:number;messageId?:string}) {
  assertProviderAccount(options);
  if (!/^[1-9]\d{0,9}$/.test(options.expectedUidValidity || '')) throw new Error('IDENTITY_REQUIRED');
  const client=buildImapClient(options); let lock:any;
  try {
    await client.connect();
    const listed=await client.list();
    if (!listed.some(box=>box.path===options.folder && classifyMailbox(box).type==='drafts')) throw new Error('NOT_A_DRAFT_FOLDER');
    lock=await client.getMailboxLock(options.folder,{readOnly:true});
    if(String((client.mailbox as any)?.uidValidity)!==options.expectedUidValidity) throw new Error('UIDVALIDITY_CHANGED');
    const metadata=await client.fetchOne(options.uid,{uid:true,envelope:true,size:true},{uid:true});
    if(!metadata || metadata.uid!==options.uid || (options.messageId && metadata.envelope?.messageId!==options.messageId)) throw new Error('IDENTITY_CHANGED');
    if((metadata.size || 0)>25*1024*1024) throw new Error('DRAFT_TOO_LARGE');
    const raw=await client.fetchOne(options.uid,{source:true},{uid:true});
    if(!raw || !raw.source || raw.source.length>25*1024*1024) throw new Error('DRAFT_UNAVAILABLE');
    const {simpleParser}=await import('mailparser');
    const parsed=await simpleParser(raw.source);
    if(parsed.attachments.length>20) throw new Error('TOO_MANY_ATTACHMENTS');
    const addresses=(value:any)=>mailAddresses([value].flat().flatMap(v=>v?.value?.map((a:any)=>a.address || '') || []));
    return {success:true,draft:{accountId:options.accountId,to:addresses(parsed.to).join(', '),cc:addresses(parsed.cc).join(', '),bcc:addresses(parsed.bcc).join(', '),
      subject:parsed.subject || '',body:parsed.text || '',bodyHtml:typeof parsed.html==='string'?parsed.html:undefined,
      inReplyTo:messageReferences([parsed.inReplyTo || ''])[0],references:messageReferences(typeof parsed.references==='string'?[parsed.references]:parsed.references),
      attachments:parsed.attachments.map(a=>({filename:a.filename || 'attachment',content:a.content.toString('base64'),encoding:'base64' as const,
        contentType:a.contentType,size:a.content.length,source:'file' as const}))}};
  } finally { try{lock?.release();}catch{} try{await client.logout();}catch{try{client.close();}catch{}} }
}

export async function changeProviderLabel(options:ImapConnectOptions & {accountId:string;accountEmail:string;folder:string;uid:number;messageId?:string}, label:string, remove=false) {
  assertProviderAccount(options);
  if (!/^[1-9]\d{0,9}$/.test(options.expectedUidValidity || '') || !Number.isInteger(options.uid) || options.uid<1 || !options.folder ||
      !label || label.length>200 || /[\r\n\x00-\x1f]/.test(label) || label.startsWith('\\') || /^\[(?:gmail|googlemail)\]/i.test(label)) throw new Error('INVALID_LABEL_IDENTITY');
  const client=buildImapClient(options);let lock:any;
  try {
    await client.connect();lock=await client.getMailboxLock(options.folder);
    if(String((client.mailbox as any)?.uidValidity)!==options.expectedUidValidity)throw new Error('UIDVALIDITY_CHANGED');
    const original=await client.fetchOne(options.uid,{uid:true,envelope:true},{uid:true});
    if(!original || original.uid!==options.uid || (options.messageId && original.envelope?.messageId!==options.messageId))throw new Error('IDENTITY_CHANGED');
    const gmail=client.capabilities.has('X-GM-EXT-1');
    if(!gmail && (!/^[A-Za-z0-9_-]{1,200}$/.test(label) || !(client.mailbox as any)?.permanentFlags?.has('\\*')))throw new Error('LABELS_NOT_SUPPORTED');
    const ok=remove?await client.messageFlagsRemove(options.uid,[label],{uid:true,useLabels:gmail}):await client.messageFlagsAdd(options.uid,[label],{uid:true,useLabels:gmail});
    if(!ok)throw new Error('LABEL_UPDATE_UNCONFIRMED');
    const current=await client.fetchOne(options.uid,{uid:true,labels:true,flags:true},{uid:true});
    const labels=[...(gmail?(current && current.labels):current && current.flags) || []].filter(value=>!value.startsWith('\\'));
    if(!current || (remove?labels.includes(label):!labels.includes(label)))throw new Error('LABEL_UPDATE_UNCONFIRMED');
    return {success:true,verified:true,labels};
  } finally {try{lock?.release();}catch{}try{await client.logout();}catch{try{client.close();}catch{}}}
}
