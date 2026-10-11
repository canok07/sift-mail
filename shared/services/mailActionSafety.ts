import type { EmailMessage } from '../types';

type MailIdentity = Pick<EmailMessage, 'id' | 'accountId' | 'from' | 'fromEmail' | 'folderType'>;

function senderAddress(mail: MailIdentity): string | null {
  const value = (mail.fromEmail || mail.from || '').trim();
  const address = (value.match(/<([^<>]+)>/)?.[1] || value).trim().toLowerCase();
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) ? address : null;
}

/** Never expand a sender cleanup to its domain or to another account. */
export function selectSenderHistory<T extends MailIdentity>(anchor: T, messages: readonly T[]): T[] {
  const sender = senderAddress(anchor);
  if (!anchor.accountId || !sender) return [];
  const seen = new Set<string>();
  return messages.filter(mail => {
    if (mail.accountId !== anchor.accountId || senderAddress(mail) !== sender ||
        ['sent', 'drafts', 'trash'].includes(mail.folderType || '') || !mail.id || seen.has(mail.id)) return false;
    seen.add(mail.id);
    return true;
  });
}

/** Stop at the first failure; report only actions actually completed remotely. */
export async function executeConfirmedMailBatch<T extends { id: string;accountId?:string }>(
  messages: readonly T[],
  perform: (mail: T) => Promise<unknown>,
  onCompleted: (mail: T) => void,
): Promise<{ completed: string[]; remaining: string[] }> {
  const unique = [...new Map(messages.map(mail => [JSON.stringify([mail.accountId,mail.id]), mail])).values()];
  const completed: string[] = [];
  for (let index = 0; index < unique.length; index++) {
    try { await perform(unique[index]); }
    catch { return { completed, remaining: unique.slice(index).map(mail => mail.id) }; }
    completed.push(unique[index].id);
    try{onCompleted(unique[index]);}
    catch{return {completed,remaining:unique.slice(index+1).map(mail=>mail.id)};}
  }
  return { completed, remaining: [] };
}
