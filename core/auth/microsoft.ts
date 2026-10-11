import crypto from 'crypto';
import { saveVaultSecret, getVaultSecret } from '../security/vault';
import { accountGeneration, accountGenerationSnapshot, invalidateAccount } from './accountLifecycle';

const MS_AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_ME = 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName';
export const MS_MAIL_SCOPES = 'https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send';
export const MS_GRAPH_SCOPES = 'https://graph.microsoft.com/User.Read';
// Consent can cover multiple resources. Each token redemption must target one.
export const MS_SCOPES = `offline_access ${MS_MAIL_SCOPES} ${MS_GRAPH_SCOPES}`;
const SESSION_TTL = 10 * 60 * 1000;
interface PkceSession { verifier: string; redirectUri: string; clientId: string; createdAt: number }
const pkceStates = new Map<string, PkceSession>();
export const invalidateMicrosoftAccount = invalidateAccount;
function expireStates() {
  for (const [state, session] of pkceStates) if (Date.now() - session.createdAt >= SESSION_TTL) pkceStates.delete(state);
}
setInterval(expireStates, 5 * 60 * 1000).unref();

export function generatePkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}
export function getEffectiveClientId(customClientId?: string): string {
  const id = (customClientId?.trim() || getVaultSecret('microsoft_client_id') || process.env.MICROSOFT_CLIENT_ID || '').trim();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new Error('Microsoft OAuth için geçerli bir MICROSOFT_CLIENT_ID uygulama kaydı gereklidir.');
  return id;
}
function validateRedirect(redirectUri: string) {
  const url = new URL(redirectUri);
  const loopback = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const configuredOrigin = process.env.APP_URL && new URL(process.env.APP_URL).origin;
  const configuredHttps = url.protocol === 'https:' && url.origin === configuredOrigin;
  if ((!loopback && !configuredHttps) || url.username || url.password || url.search || url.hash || url.pathname !== '/oauth/microsoft/callback') throw new Error('Microsoft OAuth dönüş adresi geçersiz.');
}
export function generateMicrosoftAuthUrl(redirectUri: string, customClientId?: string) {
  validateRedirect(redirectUri); expireStates();
  if (pkceStates.size >= 1000) throw new Error('Çok fazla bekleyen Microsoft giriş işlemi var.');
  const clientId = getEffectiveClientId(customClientId), { verifier, challenge } = generatePkcePair();
  const state = crypto.randomBytes(24).toString('base64url');
  pkceStates.set(state, { verifier, redirectUri, clientId, createdAt: Date.now() });
  const query = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
    response_mode: 'query', scope: MS_SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
  // PKCE verifier is server-only; never return it to the renderer.
  return { authUrl: `${MS_AUTH_ENDPOINT}?${query}`, state, clientId };
}
const request = (url: string, init: RequestInit) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
async function tokenRequest(params: Record<string, string>) {
  const response = await request(MS_TOKEN_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const data = await response.json();
  if (!response.ok || data.error || typeof data.access_token !== 'string' || !data.access_token || (data.token_type && String(data.token_type).toLowerCase() !== 'bearer')) throw new Error(data.error === 'invalid_grant' || data.error === 'interaction_required' ? 'REAUTH_REQUIRED' : 'MS_TOKEN_REJECTED');
  if (typeof data.scope === 'string' && params.scope.includes('IMAP.AccessAsUser.All') && (!data.scope.includes('IMAP.AccessAsUser.All') || !data.scope.includes('SMTP.Send'))) throw new Error('REAUTH_REQUIRED');
  return data;
}
const expiresIn = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 86400 ? value : 3600;
const exchangeFailure = (error: string) => ({ success: false, email: '', displayName: '', accessToken: '', expiresIn: 0, error });

export async function exchangeMicrosoftCode(params: { code: string; state?: string; redirectUri: string; codeVerifier?: string; customClientId?: string; isCancelled?: () => boolean }) {
  const session = params.state ? pkceStates.get(params.state) : undefined;
  if (!session || Date.now() - session.createdAt >= SESSION_TTL) {
    if (params.state) pkceStates.delete(params.state);
    return exchangeFailure('Microsoft giriş oturumu geçersiz veya süresi doldu. Girişi yeniden başlatın.');
  }
  if (params.redirectUri !== session.redirectUri || (params.customClientId && params.customClientId.trim() !== session.clientId) ||
      (params.codeVerifier && params.codeVerifier !== session.verifier) || !params.code) return exchangeFailure('Microsoft giriş oturumu bilgileri eşleşmiyor.');
  // Consume before asynchronous work: one state can redeem only one code.
  pkceStates.delete(params.state!);
  const generationsAtStart = accountGenerationSnapshot();
  try {
    const mail = await tokenRequest({ client_id: session.clientId, grant_type: 'authorization_code', code: params.code,
      redirect_uri: session.redirectUri, code_verifier: session.verifier, scope: `offline_access ${MS_MAIL_SCOPES}` });
    if (typeof mail.refresh_token !== 'string' || !mail.refresh_token) return exchangeFailure('Microsoft çevrimdışı erişim izni alınamadı. Yeniden giriş yapın.');
    // An Outlook access token cannot call Graph. Acquire a separate short-lived
    // profile token using already-consented User.Read, never an unverified JWT.
    const graph = await tokenRequest({ client_id: session.clientId, grant_type: 'refresh_token', refresh_token: mail.refresh_token, scope: MS_GRAPH_SCOPES });
    const response = await request(MS_GRAPH_ME, { headers: { Authorization: `Bearer ${graph.access_token}` } });
    if (!response.ok) throw new Error('MS_PROFILE_REJECTED');
    const profile = await response.json();
    const candidate = profile.mail || profile.userPrincipalName || '';
    const email = typeof candidate === 'string' ? candidate.toLowerCase().trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return exchangeFailure('Microsoft hesabından geçerli e-posta adresi alınamadı.');
    if (accountGeneration(email) !== (generationsAtStart.get(email) || 0)) return exchangeFailure('Hesap kaldırıldı; giriş işlemi iptal edildi.');
    if (params.isCancelled?.()) return exchangeFailure('Giriş işlemi iptal edildi.');
    const refreshToken = typeof graph.refresh_token === 'string' && graph.refresh_token ? graph.refresh_token : mail.refresh_token;
    saveVaultSecret(`ms_client_${email}`, session.clientId, 'custom_token', 'Microsoft OAuth client binding');
    saveVaultSecret(`ms_refresh_${email}`, refreshToken, 'custom_token', 'Microsoft OAuth Refresh Token');
    return { success: true, email, displayName: typeof profile.displayName === 'string' ? profile.displayName : email.split('@')[0], accessToken: mail.access_token as string, expiresIn: expiresIn(mail.expires_in) };
  } catch {
    // Never log provider responses, tokens, authorization codes or exceptions.
    return exchangeFailure('Microsoft girişi tamamlanamadı. Uygulama izinlerini ve bağlantıyı kontrol edip yeniden giriş yapın.');
  }
}

export async function refreshMicrosoftToken(email: string, customClientId?: string) {
  const cleanEmail = email.toLowerCase().trim(), refreshToken = getVaultSecret(`ms_refresh_${cleanEmail}`);
  const generation = accountGeneration(cleanEmail);
  const failure = (error: string, code = 'REAUTH_REQUIRED') => ({ success: false, accessToken: '', expiresIn: 0, error, code });
  if (!refreshToken) return failure('Bu hesap için kayıtlı Microsoft oturumu yok. Yeniden giriş yapın.');
  try {
    const boundClientId = getVaultSecret(`ms_client_${cleanEmail}`);
    if (boundClientId && customClientId && customClientId.trim() !== boundClientId) return failure('Microsoft hesabının uygulama kaydı değişti. Yeniden giriş yapın.');
    const clientId = boundClientId || getEffectiveClientId(customClientId);
    const data = await tokenRequest({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken, scope: MS_MAIL_SCOPES });
    if (accountGeneration(cleanEmail) !== generation) return failure('Hesap kaldırıldı; oturum yenileme iptal edildi.', 'ACCOUNT_REMOVED');
    if (typeof data.refresh_token === 'string' && data.refresh_token) saveVaultSecret(`ms_refresh_${cleanEmail}`, data.refresh_token, 'custom_token', 'Microsoft OAuth Refresh Token');
    return { success: true, accessToken: data.access_token as string, expiresIn: expiresIn(data.expires_in) };
  } catch (error) { return failure('Microsoft oturumu yenilenemedi. Bağlantıyı kontrol edin veya yeniden giriş yapın.', error instanceof Error && error.message === 'REAUTH_REQUIRED' ? 'REAUTH_REQUIRED' : 'CONNECTION_FAILED'); }
}
