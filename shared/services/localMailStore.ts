import type { EmailMessage, UserLabel, ConnectedAccount, AutoRule } from '../types';
import { safeFetchJson } from './apiClient';
const blockedAccounts = new Set<string>();
export function blockAccountCache(accountId: string): void { blockedAccounts.add(accountId); }
export function unblockAccountCache(accountId: string): void { blockedAccounts.delete(accountId); }

export async function forgetLocalAccount(accountId: string, email: string): Promise<void> {
  const result = await safeFetchJson<{ success: boolean }>('/api/local/accounts/remove', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, email }),
  });
  if (!result.success) throw new Error('Hesap verileri temizlenemedi.');
}

export interface ComposeDraft {
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  inReplyTo?:string;
  references?:string[];
  attachments: Array<{ filename: string; content: string; encoding: 'base64'; contentType?: string; size: number; source: 'file' | 'email' }>;
}

export interface ReplyDraft {
  accountId: string;
  to: string;
  cc?: string;
  replyAll?: boolean;
  subject: string;
  body: string;
}

export interface LocalMailSnapshot {
  version: 1;
  messages: EmailMessage[];
  composeDraft: ComposeDraft | null;
  replyDrafts: Record<string, ReplyDraft>;
  labels?: UserLabel[];
  accounts?: ConnectedAccount[];
  rules?: AutoRule[];
  syncStates?: Array<{ accountId: string; folder: string; uidValidity?: string; highestUid?: number; syncCursor?: number; lastSyncAt?: string }>;
}

/** Whitelist account configuration; never copy runtime password/token/session state. */
export function mailSnapshot(messages: EmailMessage[],composeDraft: ComposeDraft|null,replyDrafts: Record<string,ReplyDraft>,accounts: ConnectedAccount[],labels: UserLabel[],rules: AutoRule[]): LocalMailSnapshot {
  return {version:1,messages,composeDraft,replyDrafts,labels,rules,
    accounts:accounts.map(a=>({id:a.id,email:a.email,displayName:a.displayName,provider:a.provider,status:'error',isPrimary:a.isPrimary,
      lastSyncAt:a.lastSyncAt,totalCount:a.totalCount,unreadCount:a.unreadCount,mailboxes:a.mailboxes,
      imapConfig:a.imapConfig?{host:a.imapConfig.host,port:a.imapConfig.port,secure:a.imapConfig.secure,username:a.imapConfig.username,
        smtpHost:a.imapConfig.smtpHost,smtpPort:a.imapConfig.smtpPort,smtpSecure:a.imapConfig.smtpSecure,oauthProvider:a.imapConfig.oauthProvider}:undefined})),
    syncStates:accounts.flatMap(a=>(a.mailboxes||[]).map(m=>({accountId:a.id,folder:m.path,uidValidity:m.uidValidity,highestUid:m.highestUid,syncCursor:m.syncCursor,lastSyncAt:a.lastSyncAt}))),
  };
}

export async function loadLocalMailSnapshot(): Promise<LocalMailSnapshot | null> {
  const result = await safeFetchJson<{ success: boolean; snapshot: LocalMailSnapshot | null }>('/api/local/mail-cache');
  return result.snapshot ? filterBlockedAccounts(result.snapshot) : null;
}

function filterBlockedAccounts(snapshot: LocalMailSnapshot): LocalMailSnapshot {
  return { ...snapshot,
    messages: snapshot.messages.filter(message => !blockedAccounts.has(message.accountId)),
    composeDraft: snapshot.composeDraft && blockedAccounts.has(snapshot.composeDraft.accountId) ? null : snapshot.composeDraft,
    replyDrafts: Object.fromEntries(Object.entries(snapshot.replyDrafts).filter(([, draft]) => !blockedAccounts.has(draft.accountId))),
    ...(snapshot.accounts?{accounts:snapshot.accounts.filter(account=>!blockedAccounts.has(account.id))}:{}),
    ...(snapshot.syncStates?{syncStates:snapshot.syncStates.filter(state=>!blockedAccounts.has(state.accountId))}:{}),
  };
}

export async function saveLocalMailSnapshot(snapshot: LocalMailSnapshot): Promise<void> {
  const safeSnapshot = filterBlockedAccounts(snapshot);
  await safeFetchJson('/api/local/mail-cache', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot: safeSnapshot }),
  });
}
