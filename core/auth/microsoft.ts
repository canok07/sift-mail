import crypto from 'crypto';
import { saveVaultSecret, getVaultSecret } from '../security/vault';

// Fallback public client ID for Sift desktop / local email client
// Users can also supply their own Azure app registration client ID in environment or settings
// OAuth requires a real application registration. A placeholder client id leads
// to a misleading Microsoft error page, so fail early with actionable guidance.
const DEFAULT_MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';

const MS_AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_ME = 'https://graph.microsoft.com/v1.0/me';

// Scopes required for IMAP and SMTP XOAUTH2 access with offline refresh
export const MS_SCOPES = [
  'offline_access',
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'https://outlook.office.com/SMTP.Send',
  'User.Read',
].join(' ');

interface PkceSession {
  verifier: string;
  redirectUri: string;
  createdAt: number;
}

// In-memory PKCE state map (expires in 10 minutes)
const pkceStates = new Map<string, PkceSession>();

// Cleanup stale PKCE sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, session] of pkceStates.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      pkceStates.delete(state);
    }
  }
}, 5 * 60 * 1000).unref();

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function getEffectiveClientId(customClientId?: string): string {
  const clientId = (
    customClientId?.trim() ||
    getVaultSecret('microsoft_client_id') ||
    process.env.MICROSOFT_CLIENT_ID ||
    DEFAULT_MICROSOFT_CLIENT_ID
  );
  if (!clientId) {
    throw new Error('Microsoft OAuth için MICROSOFT_CLIENT_ID tanımlanmalı. Microsoft Entra App Registration oluşturup localhost callback adresini ekleyin.');
  }
  return clientId;
}

export function generateMicrosoftAuthUrl(redirectUri: string, customClientId?: string): {
  authUrl: string;
  state: string;
  verifier: string;
  clientId: string;
} {
  const clientId = getEffectiveClientId(customClientId);
  const { verifier, challenge } = generatePkcePair();
  const state = crypto.randomBytes(24).toString('base64url');

  pkceStates.set(state, {
    verifier,
    redirectUri,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: MS_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  return {
    authUrl: `${MS_AUTH_ENDPOINT}?${params.toString()}`,
    state,
    verifier,
    clientId,
  };
}

export async function exchangeMicrosoftCode(params: {
  code: string;
  state?: string;
  redirectUri: string;
  codeVerifier?: string;
  customClientId?: string;
}): Promise<{
  success: boolean;
  email: string;
  displayName: string;
  accessToken: string;
  expiresIn: number;
  error?: string;
}> {
  const clientId = getEffectiveClientId(params.customClientId);

  let verifier = params.codeVerifier;
  if (!verifier && params.state && pkceStates.has(params.state)) {
    verifier = pkceStates.get(params.state)!.verifier;
    pkceStates.delete(params.state);
  }

  if (!verifier) {
    return {
      success: false,
      email: '',
      displayName: '',
      accessToken: '',
      expiresIn: 0,
      error: 'PKCE doğrulama oturumu (code_verifier) bulunamadı. Lütfen giriş işlemini yeniden başlatın.',
    };
  }

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: verifier,
    scope: MS_SCOPES,
  });

  try {
    const response = await fetch(MS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errDesc = data.error_description || data.error || 'Bilinmeyen Microsoft kimlik doğrulama hatası';
      console.error('[Microsoft OAuth Token Error]', data);

      if (errDesc.includes('AADSTS70002') || errDesc.includes('invalid_client')) {
        return {
          success: false,
          email: '',
          displayName: '',
          accessToken: '',
          expiresIn: 0,
          error: 'Microsoft Client ID geçersiz veya kayıt bulunamadı. Lütfen Azure App Registration ayarlarınızı kontrol edin.',
        };
      }

      if (errDesc.includes('AADSTS54005') || errDesc.includes('expired')) {
        return {
          success: false,
          email: '',
          displayName: '',
          accessToken: '',
          expiresIn: 0,
          error: 'Microsoft yetkilendirme kodunun süresi dolmuş. Lütfen yeniden deneyin.',
        };
      }

      return {
        success: false,
        email: '',
        displayName: '',
        accessToken: '',
        expiresIn: 0,
        error: `Microsoft ile oturum açılamadı: ${errDesc}`,
      };
    }

    const { access_token, refresh_token, expires_in } = data;

    // Fetch user profile from Microsoft Graph API
    let email = '';
    let displayName = 'Microsoft Kullanıcısı';

    try {
      const meRes = await fetch(MS_GRAPH_ME, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      if (meRes.ok) {
        const profile = await meRes.json();
        email = (profile.mail || profile.userPrincipalName || '').toLowerCase().trim();
        displayName = profile.displayName || email.split('@')[0] || 'Microsoft Kullanıcısı';
      }
    } catch (profileErr) {
      console.warn('Microsoft Graph profil bilgisi alınamadı:', profileErr);
    }

    if (!email) {
      // Fallback: try decoding id_token if present
      if (data.id_token) {
        try {
          const parts = data.id_token.split('.');
          if (parts[1]) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            email = (payload.email || payload.preferred_username || payload.upn || '').toLowerCase().trim();
            if (payload.name) displayName = payload.name;
          }
        } catch {}
      }
    }

    if (!email) {
      return {
        success: false,
        email: '',
        displayName: '',
        accessToken: '',
        expiresIn: 0,
        error: 'Microsoft hesabınızdan e-posta adresi alınamadı. Lütfen hesabınızın birincil e-posta adresini kontrol edin.',
      };
    }

    // CRITICAL: Securely store refresh_token in encrypted local Vault
    // Never send refresh_token back to client localStorage
    if (refresh_token) {
      saveVaultSecret(
        `ms_refresh_${email}`,
        refresh_token,
        'custom_token',
        `Microsoft OAuth Refresh Token (${email})`
      );
    }

    return {
      success: true,
      email,
      displayName,
      accessToken: access_token,
      expiresIn: expires_in || 3600,
    };
  } catch (err: any) {
    console.error('[Microsoft OAuth Network Error]', err);
    return {
      success: false,
      email: '',
      displayName: '',
      accessToken: '',
      expiresIn: 0,
      error: `Microsoft sunucusuyla iletişim kurulamadı: ${err.message || 'Ağ hatası'}`,
    };
  }
}

export async function refreshMicrosoftToken(email: string, customClientId?: string): Promise<{
  success: boolean;
  accessToken: string;
  expiresIn: number;
  error?: string;
}> {
  const cleanEmail = email.toLowerCase().trim();
  const refreshToken = getVaultSecret(`ms_refresh_${cleanEmail}`);

  if (!refreshToken) {
    return {
      success: false,
      accessToken: '',
      expiresIn: 0,
      error: 'Bu hesap için kasada kayıtlı Microsoft refresh token bulunamadı. Lütfen yeniden giriş yapın.',
    };
  }

  const clientId = getEffectiveClientId(customClientId);

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MS_SCOPES,
  });

  try {
    const response = await fetch(MS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return {
        success: false,
        accessToken: '',
        expiresIn: 0,
        error: `Microsoft oturum tazeleme başarısız: ${data.error_description || data.error}`,
      };
    }

    // If a new refresh token is issued, update it in the vault
    if (data.refresh_token) {
      saveVaultSecret(
        `ms_refresh_${cleanEmail}`,
        data.refresh_token,
        'custom_token',
        `Microsoft OAuth Refresh Token (${cleanEmail})`
      );
    }

    return {
      success: true,
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
    };
  } catch (err: any) {
    return {
      success: false,
      accessToken: '',
      expiresIn: 0,
      error: `Microsoft oturumu yenilenirken bağlantı hatası: ${err.message}`,
    };
  }
}
