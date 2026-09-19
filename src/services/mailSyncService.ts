import { EmailMessage, FolderType, MailProvider, MailboxFolder } from '../types';
import { getApiUrl } from './apiConfig';
import { safeFetchJson } from './apiClient';

export interface DynamicSyncCredentials {
  email: string;
  password: string; // 16-character Google App Password or IMAP password
  accessToken?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  maxResults?: number;
  folder?: string;
  offset?: number;
  accountId?: string;
}

export interface BackendSyncMessage {
  id: string;
  uid: number;
  accountId?: string;
  subject: string;
  from: string;
  fromName?: string;
  fromEmail?: string;
  date: string;
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
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
}

/**
 * Dynamically synchronizes emails from the backend IMAP endpoint.
 * Credentials (email + App Password) are sent in the POST request body in-memory,
 * never written to disk or static configuration.
 */
export async function syncEmailsFromBackend(
  credentials: DynamicSyncCredentials
): Promise<{ messages: EmailMessage[]; accountEmail: string; provider: MailProvider; mailboxes: MailboxFolder[] }> {
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
  };

  try {
    const data = await safeFetchJson<BackendSyncResponse>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

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
        uid: m.uid,
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
    };
  } catch (err: any) {
    console.error('MailSyncService hatası:', err);
    throw err;
  }
}
