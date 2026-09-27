import { EmailMessage, FolderType, MailProvider, MailboxFolder } from '../types';
import { getApiUrl } from './apiConfig';
import { safeFetchJson } from './apiClient';
import { ApiError } from './apiClient';

export interface DynamicSyncCredentials {
  email: string;
  password: string; // 16-character Google App Password or IMAP password
  accessToken?: string;
  accessTokenExpiresAt?: number;
  host?: string;
  port?: number;
  secure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  maxResults?: number;
  folder?: string;
  offset?: number;
  sinceUid?: number;
  expectedUidValidity?: string;
  accountId?: string;
}

export interface BackendSyncMessage {
  id: string;
  uid: number;
  messageId?: string;
  accountId?: string;
  subject: string;
  from: string;
  fromName?: string;
  fromEmail?: string;
  date: string;
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Array<{ index: number; filename: string; contentType: string; size: number }>;
  headers?: string;
  listUnsubscribe?: string;
  isRead: boolean;
  folder?: string;
  folderType?: FolderType;
}

export interface BackendSyncResponse {
  success: boolean;
  count?: number;
  messages?: BackendSyncMessage[];
  mailboxes?: MailboxFolder[];
  account?: {
    email?: string;
    provider?: string;
    host?: string;
    port?: number;
  };
  error?: string;
  hint?: string;
  incremental?: boolean;
  retryable?: boolean;
}

const microsoftRefreshes = new Map<string, Promise<{ accessToken: string; expiresAt: number }>>();

export async function ensureFreshMicrosoftCredentials<T extends DynamicSyncCredentials>(credentials: T): Promise<T> {
  if (!credentials.accessToken || credentials.host?.toLowerCase() !== 'outlook.office365.com') return credentials;
  if (credentials.accessTokenExpiresAt && credentials.accessTokenExpiresAt > Date.now() + 60_000) return credentials;

  const email = credentials.email.trim().toLowerCase();
  let pending = microsoftRefreshes.get(email);
  if (!pending) {
    pending = (async () => {
      const result = await safeFetchJson<{ success: boolean; accessToken?: string; expiresIn?: number; error?: string }>('/api/oauth/microsoft/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      if (!result.success || !result.accessToken) throw new Error(result.error || 'Microsoft oturumu yenilenemedi. Yeniden giriş yapın.');
      return { accessToken: result.accessToken, expiresAt: Date.now() + Math.max(60, result.expiresIn || 3600) * 1000 };
    })();
    microsoftRefreshes.set(email, pending);
    void pending.finally(() => microsoftRefreshes.delete(email)).catch(() => {});
  }
  const fresh = await pending;
  return { ...credentials, accessToken: fresh.accessToken, accessTokenExpiresAt: fresh.expiresAt };
}

/**
 * Dynamically synchronizes emails from the backend IMAP endpoint.
 * Credentials (email + App Password) are sent in the POST request body in-memory,
 * never written to disk or static configuration.
 */
export async function syncEmailsFromBackend(
  credentials: DynamicSyncCredentials,
  options: { retries?: number; retryDelayMs?: number } = {},
): Promise<{ messages: EmailMessage[]; accountEmail: string; provider: MailProvider; mailboxes: MailboxFolder[]; incremental: boolean }> {
  const url = getApiUrl('/api/emails/sync');

  const payload = {
    email: credentials.email.trim(),
    password: credentials.password,
    accessToken: credentials.accessToken,
    host: credentials.host?.trim() || undefined,
    port: credentials.port || 993,
    secure: credentials.secure !== false,
    maxResults: credentials.maxResults || 35,
    accountId: credentials.accountId,
    folder: credentials.folder,
    offset: credentials.offset,
    sinceUid: credentials.sinceUid,
    expectedUidValidity: credentials.expectedUidValidity,
  };

  try {
    let data: BackendSyncResponse | undefined;
    const retries = Math.max(0, Math.min(3, options.retries || 0));
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        data = await safeFetchJson<BackendSyncResponse>(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        break;
      } catch (error) {
        const retryable = error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500);
        if (!retryable || attempt === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, (options.retryDelayMs || 500) * (2 ** attempt)));
      }
    }
    if (!data) throw new Error('IMAP senkronizasyon yanıtı alınamadı.');

    if (!data.success) {
      const errorMsg = data.error || data.hint || 'IMAP senkronizasyonu başarısız oldu.';
      throw new Error(errorMsg);
    }

    const rawList = data.messages || [];
    const accountEmail = data.account?.email || credentials.email;
    const provider: MailProvider = (data.account?.provider as MailProvider) || 'gmail';

    const mappedEmails: EmailMessage[] = rawList.map((m) => {
      const emailId = m.id || `imap-${m.uid}`;
      return {
        id: emailId,
        accountId: m.accountId || credentials.accountId || `acc-${provider}-primary`,
        provider: provider,
        from: m.from || 'Bilinmeyen Gönderici',
        fromName: m.fromName || (m.fromEmail ? m.fromEmail.split('@')[0] : 'Gönderici'),
        fromEmail: m.fromEmail || '',
        subject: m.subject || '(Konusuz)',
        date: m.date || new Date().toLocaleString('tr-TR'),
        snippet: m.snippet || m.subject || '',
        bodyText: m.bodyText || m.snippet || '',
        bodyHtml: m.bodyHtml,
        attachments: m.attachments || [],
        uid: m.uid,
        messageId: m.messageId,
        listUnsubscribe: m.listUnsubscribe || '',
        isRead: Boolean(m.isRead),
        folder: m.folder || 'INBOX',
        folderType: m.folderType || 'inbox',
        labels: [m.folderType === 'spam' ? 'SPAM' : m.folder || 'INBOX'],
      };
    });

    return {
      messages: mappedEmails,
      mailboxes: data.mailboxes || [],
      accountEmail,
      provider,
      incremental: Boolean(data.incremental),
    };
  } catch (err: any) {
    console.error('MailSyncService hatası:', err);
    throw err;
  }
}
