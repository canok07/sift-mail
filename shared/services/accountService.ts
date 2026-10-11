import type { ConnectedAccount } from '../types';
import { detectMailProvider } from '../../core/mail/providerManager';
import { safeFetchJson } from './apiClient';

export type OAuthProvider = 'google' | 'microsoft';
export interface DynamicSyncCredentials {
  email: string; password: string;
  accessToken?: string; accessTokenExpiresAt?: number; oauthProvider?: OAuthProvider;
  host?: string; port?: number; secure?: boolean;
  smtpHost?: string; smtpPort?: number; smtpSecure?: boolean;
  maxResults?: number; folder?: string; offset?: number; sinceUid?: number;
  expectedUidValidity?: string; accountId?: string;
  knownUids?: number[];
}
const generations = new Map<string, number>();
const refreshes = new Map<string, Promise<{ accessToken: string; expiresAt: number }>>();
const emailKey = (email: string) => email.trim().toLowerCase();
export function invalidateAccountSession(email: string) {
  const key = emailKey(email); generations.set(key, (generations.get(key) || 0) + 1);
}
export class AccountSessionError extends Error {
  constructor(message: string, public readonly code: string) { super(message); this.name = 'AccountSessionError'; }
}
export function prepareAccountConnection(credentials: DynamicSyncCredentials, existing?: ConnectedAccount): DynamicSyncCredentials {
  const email = emailKey(credentials.email), provider = detectMailProvider(email), saved = existing?.imapConfig;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (existing && emailKey(existing.email) !== email)) throw new AccountSessionError('Hesap bilgileri eşleşmiyor.', 'ACCOUNT_MISMATCH');
  return { ...credentials, email, host: credentials.host || saved?.host || provider.imapHost,
    port: credentials.port || saved?.port || provider.imapPort, secure: credentials.secure ?? saved?.secure ?? provider.imapSecure,
    smtpHost: credentials.smtpHost || saved?.smtpHost || provider.smtpHost,
    smtpPort: credentials.smtpPort || saved?.smtpPort || provider.smtpPort,
    smtpSecure: credentials.smtpSecure ?? saved?.smtpSecure ?? provider.smtpSecure };
}
export async function ensureFreshAccountCredentials<T extends DynamicSyncCredentials>(credentials: T): Promise<T> {
  const provider = credentials.oauthProvider || (credentials.accessToken && credentials.host?.toLowerCase() === 'outlook.office365.com' ? 'microsoft' : credentials.accessToken && credentials.host?.toLowerCase() === 'imap.gmail.com' ? 'google' : undefined);
  if (!provider) return credentials;
  if (credentials.accessToken && credentials.accessTokenExpiresAt && credentials.accessTokenExpiresAt > Date.now() + 60_000) return credentials;
  const email = emailKey(credentials.email), generation = generations.get(email) || 0, key = `${provider}:${email}:${generation}`;
  let pending = refreshes.get(key);
  if (!pending) {
    pending = (async () => {
      const result = await safeFetchJson<{ success: boolean; accessToken?: string; expiresIn?: number; error?: string; code?: string }>(`/api/oauth/${provider}/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(20_000),
      });
      if (!result.success || typeof result.accessToken !== 'string' || !result.accessToken) throw new AccountSessionError(result.error || 'Oturum yenilenemedi. Yeniden giriş yapın.', result.code || 'REAUTH_REQUIRED');
      const duration = typeof result.expiresIn === 'number' && Number.isFinite(result.expiresIn) && result.expiresIn > 0 && result.expiresIn <= 86400 ? result.expiresIn : 3600;
      return { accessToken: result.accessToken, expiresAt: Date.now() + duration * 1000 };
    })();
    refreshes.set(key, pending);
    void pending.finally(() => { if (refreshes.get(key) === pending) refreshes.delete(key); }).catch(() => {});
  }
  const fresh = await pending;
  if ((generations.get(email) || 0) !== generation) throw new AccountSessionError('Hesap kaldırıldı; oturum yenileme iptal edildi.', 'ACCOUNT_REMOVED');
  return { ...credentials, accessToken: fresh.accessToken, accessTokenExpiresAt: fresh.expiresAt };
}
export function reconnectAccount(account: ConnectedAccount): Promise<DynamicSyncCredentials> {
  const oauthProvider = account.imapConfig?.oauthProvider;
  if (!oauthProvider) return Promise.reject(new AccountSessionError('Bu hesaba uygulama parolasıyla yeniden giriş yapın.', 'MANUAL_LOGIN_REQUIRED'));
  return ensureFreshAccountCredentials(prepareAccountConnection({ email: account.email, password: '', oauthProvider }, account));
}
export async function loginWithProvider(provider: OAuthProvider, signal: AbortSignal, openBrowser: (url: string) => void): Promise<DynamicSyncCredentials> {
  const start = await safeFetchJson<{ success: boolean; authUrl: string; requestId: string }>(`/api/oauth/${provider}/start`, { method: 'POST', signal });
  const url = new URL(start.authUrl);
  if (!start.success || url.protocol !== 'https:' || url.hostname !== (provider === 'google' ? 'accounts.google.com' : 'login.microsoftonline.com') || !/^[a-zA-Z0-9_-]{43}$/.test(start.requestId)) throw new AccountSessionError('Güvenli OAuth giriş adresi alınamadı.', 'OAUTH_INVALID');
  try {
    signal.throwIfAborted(); openBrowser(start.authUrl);
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const result = await safeFetchJson<{ status: string; email?: string; accessToken?: string; expiresIn?: number; error?: string }>(`/api/oauth/${provider}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: start.requestId }), signal,
      });
      if (result.status === 'complete' && result.email && result.accessToken) return prepareAccountConnection({ email: result.email, password: '', oauthProvider: provider,
        accessToken: result.accessToken, accessTokenExpiresAt: Date.now() + (result.expiresIn || 3600) * 1000,
        host: provider === 'google' ? 'imap.gmail.com' : 'outlook.office365.com',
        smtpHost: provider === 'google' ? 'smtp.gmail.com' : 'smtp.office365.com', smtpPort: provider === 'google' ? 465 : 587, smtpSecure: provider === 'google' });
      if (result.status !== 'pending') throw new AccountSessionError(result.error || 'Giriş tamamlanamadı. Yeniden deneyin.', 'REAUTH_REQUIRED');
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason || new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    throw new AccountSessionError('Giriş süresi doldu. Yeniden deneyin.', 'OAUTH_EXPIRED');
  } finally {
    // Cleanup has its own short deadline, independent of the cancelled UI signal.
    void safeFetchJson(`/api/oauth/${provider}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: start.requestId }), signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
}
