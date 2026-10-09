/**
 * Safe API Client & Response Parser for Sift
 *
 * Prevents:
 *   SyntaxError: Unexpected token 'T', "The page c"... is not valid JSON
 *   SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * When Vercel, Cloud Run, nginx or a CDN returns a 404/500 HTML error page
 * (e.g. "The page could not be found" or "<!DOCTYPE html>"), standard
 * response.json() crashes with an unhelpful SyntaxError.
 *
 * This client inspects the response text safely before parsing, ensuring
 * helpful and user-friendly error messages are provided.
 */

import { getApiBaseUrl, getApiUrl } from './apiConfig';

export class ApiError extends Error {
  status: number;
  data: any;
  rawText?: string;

  constructor(message: string, status: number = 0, data?: any, rawText?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.rawText = rawText;
  }
}

/**
 * Safely reads and parses a Fetch Response object into JSON.
 * Rejects with user-friendly error if the response is HTML, empty, or invalid JSON.
 */
export async function parseResponseSafe<T = any>(response: Response): Promise<T> {
  let text = '';
  try {
    text = await response.text();
  } catch (readErr: any) {
    throw new ApiError(
      'Sunucu yanıtı okunamadı veya ağ bağlantısı koptu.',
      response.status
    );
  }

  const trimmed = (text || '').trim();

  // 1. Check for empty body
  if (!trimmed) {
    if (!response.ok) {
      throw new ApiError(
        `Sunucu yanıtı geçersiz veya API adresi hatalı (HTTP ${response.status})`,
        response.status
      );
    }
    return {} as T;
  }

  // 2. Check if response is HTML or Vercel / server error page
  // Common patterns: "The page could not be found", "<!DOCTYPE html>", "<html>", "<html "
  const isHtmlOrTextPage =
    trimmed.startsWith('<') ||
    trimmed.startsWith('The page');

  if (isHtmlOrTextPage) {
    const errorMsg = !response.ok
      ? `Sunucu yanıtı geçersiz veya API adresi hatalı (HTTP ${response.status}): İstenen API rotası bulunamadı veya sunucu HTML döndürdü.`
      : 'Sunucu yanıtı geçersiz veya API adresi hatalı: JSON verisi yerine HTML sayfası döndürüldü.';
    throw new ApiError(errorMsg, response.status, null, trimmed);
  }

  // 3. Attempt JSON parse
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch (parseErr: any) {
    throw new ApiError(
      `Sunucu yanıtı geçersiz veya API adresi hatalı: Beklenen JSON formatı alınamadı (${parseErr.message})`,
      response.status,
      null,
      trimmed
    );
  }

  // 4. Handle HTTP error status codes (e.g. 400, 401, 403, 404, 500)
  if (!response.ok) {
    const serverMessage =
      parsed?.error ||
      parsed?.message ||
      parsed?.hint ||
      parsed?.details ||
      `Sunucu hatası: HTTP ${response.status}`;
    throw new ApiError(serverMessage, response.status, parsed, trimmed);
  }

  return parsed as T;
}

let cachedSessionToken: string | null = null;
let sessionTokenPromise: Promise<string | null> | null = null;

/**
 * Retrieves the local API authorization token for secure communication with the backend.
 * Uses the short-lived in-memory token returned by the local backend handshake.
 * Secrets are deliberately never read from localStorage or renderer build variables.
 */
export async function getClientApiToken(): Promise<string | null> {
  if (cachedSessionToken) return cachedSessionToken;

  if (!sessionTokenPromise) {
    sessionTokenPromise = (async () => {
      try {
        const res = await fetch(getApiUrl('/api/auth/session'), {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.token === 'string' && data.token.trim()) {
            cachedSessionToken = data.token;
            return data.token;
          }
        }
      } catch {
        // Fallback gracefully in case backend is offline or static preview
      }
      return null;
    })().finally(() => { sessionTokenPromise = null; });
  }

  return sessionTokenPromise;
}

/**
 * Enhanced fetch wrapper that safely parses JSON responses, injects authentication tokens,
 * and handles server/network failures gracefully.
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost';
  const inputUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(inputUrl.startsWith('/api/') ? getApiUrl(inputUrl) : inputUrl, origin);
  const apiOrigin = new URL(getApiBaseUrl() || origin, origin).origin;
  const trustedApi = url.origin === apiOrigin && url.pathname.startsWith('/api/');
  const request = new Request(input instanceof Request ? input : url, init);
  const headers = new Headers(request.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const automaticAuth = trustedApi && url.pathname !== '/api/auth/session'
    && !headers.has('Authorization') && !headers.has('x-sift-key');
  let token = automaticAuth ? await getClientApiToken() : null;
  const send = async () => {
    const nextHeaders = new Headers(headers);
    if (token) { nextHeaders.set('x-sift-key', token); nextHeaders.set('Authorization', `Bearer ${token}`); }
    // Clone before sending: an authentication rejection may safely replay the body once.
    return fetch(request.clone(), { headers: nextHeaders, redirect: trustedApi ? 'error' : request.redirect });
  };
  try {
    let response = await send();
    if (automaticAuth && response.status === 401) {
      const rejected = await response.clone().json().catch(() => null);
      // Only the pre-action auth middleware can authorize a replay. Never retry
      // mail sends on timeouts, network failures or provider-authentication errors.
      if (rejected?.code === 'SESSION_INVALID') {
        if (cachedSessionToken === token) cachedSessionToken = null;
        token = await getClientApiToken();
        if (token) response = await send();
      }
    }
    return await parseResponseSafe<T>(response);
  } catch (networkErr: any) {
    if (networkErr instanceof ApiError || networkErr?.name === 'AbortError') throw networkErr;
    throw new ApiError(
      networkErr?.message
        ? `Ağ bağlantı hatası: ${networkErr.message}`
        : 'Sunucuya ulaşılamadı. Lütfen internet ve sunucu bağlantınızı kontrol edin.',
      0
    );
  }

}

/**
 * Safely extracts a readable string from any unknown error or exception.
 */
export function extractErrorMessage(err: unknown, fallback: string = 'Bağlantı sağlanamadı'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof ApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const anyErr = err as any;
    return (
      anyErr?.response?.data?.message ||
      anyErr?.response?.data?.error ||
      anyErr?.error ||
      anyErr?.message ||
      fallback
    );
  }
  return fallback;
}
