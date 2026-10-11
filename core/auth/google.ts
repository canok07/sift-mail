import crypto from 'node:crypto';
import { getVaultSecret, saveVaultSecret } from '../security/vault';
import { accountGeneration, accountGenerationSnapshot } from './accountLifecycle';

export const GOOGLE_MAIL_SCOPE = 'https://mail.google.com/';
const TTL = 10 * 60_000;
interface Session { verifier: string; clientId: string; clientSecret?: string; redirectUri: string; createdAt: number }
const states = new Map<string, Session>();
function expireStates() { for (const [state, session] of states) if (Date.now() - session.createdAt >= TTL) states.delete(state); }
setInterval(expireStates, 60_000).unref();
export function getGoogleClientId(custom?: string): string {
  const id = (custom || getVaultSecret('google_client_id') || process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id) || id.length > 200) throw new Error('Google OAuth için Desktop türünde GOOGLE_CLIENT_ID uygulama kaydı gereklidir.');
  return id;
}
export function generateGoogleAuthUrl(redirectUri: string, customClientId?: string) {
  const url = new URL(redirectUri);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/oauth/google/callback' || url.search || url.hash || url.username || url.password) throw new Error('Google OAuth dönüş adresi geçersiz.');
  expireStates();
  if (states.size >= 1000) throw new Error('Çok fazla bekleyen Google giriş işlemi var.');
  const clientId = getGoogleClientId(customClientId);
  const storedSecret = getVaultSecret('google_client_secret');
  let clientSecret: string | undefined;
  if (storedSecret) {
    try { const binding = JSON.parse(storedSecret); if (binding.clientId === clientId && typeof binding.secret === 'string') clientSecret = binding.secret; } catch {}
  } else if (process.env.GOOGLE_CLIENT_ID?.trim() === clientId) clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const verifier = crypto.randomBytes(48).toString('base64url'), state = crypto.randomBytes(24).toString('base64url');
  states.set(state, { verifier, clientId, clientSecret, redirectUri, createdAt: Date.now() });
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: `${GOOGLE_MAIL_SCOPE} openid email profile`, state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account' });
  return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}`, state, clientId };
}
const failure = (error: string, code = 'REAUTH_REQUIRED') => ({ success: false, email: '', displayName: '', accessToken: '', expiresIn: 0, error, code });
const expiresIn = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 86400 ? value : 3600;
const request = (url: string, init: RequestInit) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
async function tokenRequest(params: Record<string, string>) {
  const response = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const data = await response.json();
  if (!response.ok || data.error || typeof data.access_token !== 'string' || !data.access_token || String(data.token_type || '').toLowerCase() !== 'bearer') throw new Error(data.error === 'invalid_grant' ? 'REAUTH_REQUIRED' : 'CONNECTION_FAILED');
  // Explicitly narrowed consent is unusable for the existing IMAP/SMTP engine.
  if (typeof data.scope === 'string' && !data.scope.split(' ').includes(GOOGLE_MAIL_SCOPE)) throw new Error('REAUTH_REQUIRED');
  return data;
}
export async function exchangeGoogleCode(params: { code: string; state: string; redirectUri: string; isCancelled?: () => boolean }) {
  const session = states.get(params.state);
  if (!session || Date.now() - session.createdAt >= TTL) { states.delete(params.state); return failure('Google giriş oturumu geçersiz veya süresi doldu.'); }
  if (params.redirectUri !== session.redirectUri || !params.code) return failure('Google giriş oturumu bilgileri eşleşmiyor.');
  states.delete(params.state);
  const before = accountGenerationSnapshot();
  try {
    const token = await tokenRequest({ client_id: session.clientId, ...(session.clientSecret ? { client_secret: session.clientSecret } : {}), code: params.code,
      grant_type: 'authorization_code', redirect_uri: session.redirectUri, code_verifier: session.verifier });
    const response = await request('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!response.ok) throw new Error('PROFILE_FAILED');
    const profile = await response.json();
    const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
    if (profile.email_verified !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return failure('Google hesabından doğrulanmış e-posta adresi alınamadı.');
    if (accountGeneration(email) !== (before.get(email) || 0)) return failure('Hesap kaldırıldı; giriş işlemi iptal edildi.', 'ACCOUNT_REMOVED');
    if (params.isCancelled?.()) return failure('Giriş işlemi iptal edildi.', 'OAUTH_CANCELLED');
    if (typeof token.refresh_token !== 'string' || !token.refresh_token) return failure('Google çevrimdışı erişim izni alınamadı. Yeniden giriş yapın.');
    saveVaultSecret(`google_client_${email}`, session.clientId, 'custom_token', 'Google OAuth client binding', email);
    if (session.clientSecret) saveVaultSecret(`google_secret_${email}`, session.clientSecret, 'custom_token', 'Google OAuth client secret', email);
    saveVaultSecret(`google_refresh_${email}`, token.refresh_token, 'custom_token', 'Google OAuth refresh token', email);
    return { success: true, email, displayName: typeof profile.name === 'string' ? profile.name : email, accessToken: token.access_token as string, expiresIn: expiresIn(token.expires_in) };
  } catch { return failure('Google girişi tamamlanamadı. Uygulama kaydını, izinleri ve bağlantıyı kontrol edin.'); }
}
export async function refreshGoogleToken(email: string) {
  const clean = email.trim().toLowerCase(), before = accountGeneration(clean);
  const refresh = getVaultSecret(`google_refresh_${clean}`), client = getVaultSecret(`google_client_${clean}`);
  if (!refresh || !client) return failure('Bu hesap için kayıtlı Google oturumu yok. Yeniden giriş yapın.');
  try {
    const secret = getVaultSecret(`google_secret_${clean}`);
    const token = await tokenRequest({ client_id: client, ...(secret ? { client_secret: secret } : {}), grant_type: 'refresh_token', refresh_token: refresh });
    if (before !== accountGeneration(clean)) return failure('Hesap kaldırıldı; oturum yenileme iptal edildi.', 'ACCOUNT_REMOVED');
    if (typeof token.refresh_token === 'string' && token.refresh_token) saveVaultSecret(`google_refresh_${clean}`, token.refresh_token, 'custom_token', 'Google OAuth refresh token', clean);
    return { success: true, accessToken: token.access_token as string, expiresIn: expiresIn(token.expires_in) };
  } catch (error) { return failure('Google oturumu yenilenemedi. Bağlantıyı kontrol edin veya yeniden giriş yapın.', error instanceof Error && error.message === 'REAUTH_REQUIRED' ? 'REAUTH_REQUIRED' : 'CONNECTION_FAILED'); }
}
