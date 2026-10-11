import type { EmailMessage } from '../../shared/types';

export function mailAddresses(values: string[] = []): string[] {
  return [...new Set(values.flatMap(value => value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(value => value.toLowerCase()))];
}
export function messageReferences(values: string[] = []): string[] {
  return [...new Set(values.flatMap(value => value.match(/<[^<>\s\r\n]{1,490}>/g) || []))].slice(-50);
}
export function replyRecipients(email: EmailMessage, ownAddresses: string[], all = false) {
  const own = new Set(mailAddresses(ownAddresses));
  const primary = mailAddresses(email.replyTo?.length ? email.replyTo : [email.fromEmail || email.from]);
  const replyingToOwnMail=primary.length>0 && primary.every(address=>own.has(address));
  const to = mailAddresses([...primary, ...(all || replyingToOwnMail ? email.to || [] : [])]).filter(value => !own.has(value));
  const cc = all ? mailAddresses(email.cc).filter(value => !own.has(value) && !to.includes(value)) : [];
  return { to: to.join(', '), cc: cc.join(', ') };
}
export function replyReferences(email: EmailMessage): string[] {
  return messageReferences([...(email.references || []), email.inReplyTo || '', email.messageId || '']);
}
/** Header-linked threads only, never subject similarity or cross-account matches. */
export function relatedThread(anchor: EmailMessage, messages: EmailMessage[]): EmailMessage[] {
  if (!anchor.accountId) return [anchor];
  const keys=(mail:EmailMessage)=>[...messageReferences([mail.messageId || '',mail.inReplyTo || '',...(mail.references || [])]),...(mail.threadId?[`thread:${mail.threadId}`]:[])];
  const index=new Map<string,EmailMessage[]>();
  for(const mail of messages){if(mail.accountId!==anchor.accountId)continue;for(const key of keys(mail)){const list=index.get(key) || [];list.push(mail);index.set(key,list);}}
  const result=new Map<string,EmailMessage>([[anchor.id,anchor]]),queue=keys(anchor),visited=new Set<string>();
  for(let at=0;at<queue.length;at++){
    const key=queue[at];if(visited.has(key))continue;visited.add(key);
    for(const mail of index.get(key) || []){if(result.has(mail.id))continue;result.set(mail.id,mail);queue.push(...keys(mail));}
  }
  return [...result.values()].sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
}
/** Replace only local pending Sent copies; preserve legitimate IMAP folder identities. */
export function reconcilePendingSent(messages: EmailMessage[]): EmailMessage[] {
  const delivered = new Set(messages.filter(mail => !mail.pendingSent && mail.folderType === 'sent' && mail.messageId && mail.accountId)
    .map(mail => JSON.stringify([mail.accountId,mail.messageId])));
  const moveKey=(mail:EmailMessage)=>JSON.stringify([mail.accountId,mail.folder,mail.messageId]);
  const moves=new Map(messages.filter(mail=>mail.pendingMove && mail.messageId).map(mail=>[moveKey(mail),mail]));
  const arrived=new Set(messages.filter(mail=>!mail.pendingMove && mail.uid && mail.messageId).map(moveKey));
  return messages.filter(mail => (!mail.pendingSent || !mail.messageId || !delivered.has(JSON.stringify([mail.accountId,mail.messageId]))) &&
    (!mail.pendingMove || !arrived.has(moveKey(mail)))).map(mail=>{
      const moved=!mail.pendingMove && mail.uid && moves.get(moveKey(mail));
      return moved?{...mail,safeCategory:moved.safeCategory || mail.safeCategory,analysis:moved.analysis || mail.analysis,
        labels:[...new Set([...(mail.labels || []),...(moved.labels || []).filter(label=>label.startsWith('user:'))])]}:mail;
    });
}
/** Confirmed destination only; old source UID must never authorize another mutation. */
export function relocateVerifiedMessage(messages:EmailMessage[],source:EmailMessage,destination:string,folderType:EmailMessage['folderType']):EmailMessage[] {
  const kept=messages.filter(mail=>mail.accountId!==source.accountId || mail.id!==source.id);
  if(!source.messageId || !destination)return kept;
  return [...kept,{...source,id:`move-${source.id}`,uid:undefined,uidValidity:undefined,folder:destination,folderType,pendingMove:true,
    labels:(source.labels || []).filter(label=>label.startsWith('user:'))}];
}

export function matchesMailSearch(mail: Partial<EmailMessage>, query: string): boolean {
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const text = [mail.from,mail.fromEmail,mail.fromName,mail.subject,mail.snippet,mail.bodyText,
    ...(mail.to || []),...(mail.cc || []),...(mail.providerLabels || []),...(mail.attachments || []).map(file => file.filename)]
    .filter(Boolean).join('\n').normalize('NFKC').toLowerCase();
  return terms.every(term => text.includes(term));
}
