import crypto from 'node:crypto';
import { generateGoogleAuthUrl, exchangeGoogleCode, refreshGoogleToken, getGoogleClientId } from './google';
import { generateMicrosoftAuthUrl, exchangeMicrosoftCode, refreshMicrosoftToken, getEffectiveClientId } from './microsoft';
import { accountGeneration } from './accountLifecycle';

export type OAuthProvider = 'google' | 'microsoft';
type Result = Awaited<ReturnType<typeof exchangeGoogleCode>> | Awaited<ReturnType<typeof exchangeMicrosoftCode>>;
interface Login { provider: OAuthProvider; state: string; redirectUri: string; createdAt: number; working: boolean; result?: Result; generation?: number }
const logins = new Map<string, Login>();
const TTL = 10 * 60_000;
function expire() { for (const [id, login] of logins) if (Date.now() - login.createdAt >= TTL) logins.delete(id); }
setInterval(expire, 60_000).unref();
export function oauthConfiguration() {
  const configured = (get: () => string) => { try { get(); return true; } catch { return false; } };
  return { google: configured(() => getGoogleClientId()), microsoft: configured(() => getEffectiveClientId()) };
}
export function startAccountLogin(provider: OAuthProvider, origin: string) {
  expire();
  if (logins.size >= 100) throw new Error('Çok fazla bekleyen giriş işlemi var.');
  const redirectUri = `${origin}/oauth/${provider}/callback`;
  const auth = provider === 'google' ? generateGoogleAuthUrl(redirectUri) : generateMicrosoftAuthUrl(redirectUri);
  // Separate private polling capability: OAuth state in a browser URL is not a token retrieval capability.
  const requestId = crypto.randomBytes(32).toString('base64url');
  logins.set(requestId, { provider, state: auth.state, redirectUri, createdAt: Date.now(), working: false });
  return { authUrl: auth.authUrl, requestId };
}
export async function finishAccountLogin(provider: OAuthProvider, params: { state: string; code?: string; denied?: boolean }) {
  expire();
  const entry = [...logins.entries()].find(([, value]) => value.provider === provider && value.state === params.state);
  const login = entry?.[1];
  if (!login || login.working || login.result) return false;
  login.working = true;
  if (params.denied || !params.code) {
    login.result = { success: false, email: '', displayName: '', accessToken: '', expiresIn: 0, error: 'Giriş iptal edildi veya izin verilmedi.' };
  } else {
    const isCancelled = () => logins.get(entry![0]) !== login || Date.now() - login.createdAt >= TTL;
    login.result = provider === 'google'
      ? await exchangeGoogleCode({ code: params.code, state: params.state, redirectUri: login.redirectUri, isCancelled })
      : await exchangeMicrosoftCode({ code: params.code, state: params.state, redirectUri: login.redirectUri, isCancelled });
    if (login.result.success) login.generation = accountGeneration(login.result.email);
  }
  return login.result.success;
}
export function accountLoginStatus(provider: OAuthProvider, requestId: string) {
  expire(); const login = logins.get(requestId);
  if (!login || login.provider !== provider) return { status: 'expired' as const, error: 'Giriş oturumu bulunamadı veya süresi doldu.' };
  if (!login.result) return { status: 'pending' as const };
  logins.delete(requestId);
  if (login.result.success && login.generation !== accountGeneration(login.result.email)) return { status: 'failed' as const, error: 'Hesap kaldırıldı; giriş iptal edildi.' };
  return { status: login.result.success ? 'complete' as const : 'failed' as const, ...login.result };
}
export function cancelAccountLogin(provider: OAuthProvider, requestId: string) {
  if (logins.get(requestId)?.provider === provider) logins.delete(requestId);
}
// Backend deduplication also covers clients outside the React renderer.
const refreshes = new Map<string, Promise<Awaited<ReturnType<typeof refreshGoogleToken>> | Awaited<ReturnType<typeof refreshMicrosoftToken>>>>();
export function refreshAccountToken(provider: OAuthProvider, email: string) {
  const clean = email.trim().toLowerCase(), key = `${provider}:${clean}:${accountGeneration(clean)}`;
  let pending = refreshes.get(key);
  if (!pending) {
    pending = provider === 'google' ? refreshGoogleToken(clean) : refreshMicrosoftToken(clean);
    refreshes.set(key, pending);
    void pending.finally(() => { if (refreshes.get(key) === pending) refreshes.delete(key); }).catch(() => {});
  }
  return pending;
}
