import type { ConnectedAccount, EmailMessage } from '../types';
import type { DynamicLoginCredentials } from '../components/DynamicEmailLoginCard';

export function buildMailActionRequest(email: EmailMessage, account: ConnectedAccount | undefined,
  credentials: DynamicLoginCredentials, action: 'mark_read' | 'mark_unread' | 'trash' | 'archive') {
  if (!account || email.accountId !== account.id || account.email.trim().toLowerCase() !== credentials.email.trim().toLowerCase()) {
    throw new Error('Posta hesabı eşleşmiyor. Hesabı yeniden bağlayın.');
  }
  if (!Number.isInteger(email.uid) || !email.uid || email.uid < 1 || !email.folder ||
      !/^[1-9]\d{0,9}$/.test(email.uidValidity || '') || Number(email.uidValidity) > 4294967295) {
    throw new Error('İleti kimliği güncel değil. İşlemden önce klasörü yenileyin.');
  }
  return {
    host: credentials.host, port: credentials.port || 993, secure: credentials.secure !== false,
    auth: { user: credentials.email, pass: credentials.password || undefined, accessToken: credentials.accessToken },
    accountId: account.id, accountEmail: account.email, uid: email.uid, sourceFolder: email.folder,
    expectedUidValidity: email.uidValidity, messageId: email.messageId || undefined, action,
  };
}
