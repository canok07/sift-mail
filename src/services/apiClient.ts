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
 * Checks localStorage, import.meta.env, and the /api/auth/session handshake endpoint.
 */
export async function getClientApiToken(): Promise<string | null> {
  if (cachedSessionToken) return cachedSessionToken;

  const storedKey = typeof window !== 'undefined' ? localStorage.getItem('SIFT_API_KEY') : null;
  if (storedKey) {
    cachedSessionToken = storedKey;
    return storedKey;
  }

  const envKey = (import.meta as any)?.env?.VITE_API_KEY;
  if (envKey) {
    cachedSessionToken = envKey;
    return envKey;
  }

  if (!sessionTokenPromise) {
    sessionTokenPromise = (async () => {
      try {
        const res = await fetch('/api/auth/session', {
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.token) {
            cachedSessionToken = data.token;
            return data.token;
          }
        }
      } catch {
        // Fallback gracefully in case backend is offline or static preview
      }
      return null;
    })();
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
  const mergedHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  };

  // Automatically attach session/API key to local API routes
  const inputUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  if (inputUrl && (inputUrl.startsWith('/api/') || inputUrl.includes('/api/')) && !inputUrl.includes('/api/auth/session')) {
    if (!mergedHeaders['Authorization'] && !mergedHeaders['x-sift-key']) {
      const token = await getClientApiToken();
      if (token) {
        mergedHeaders['x-sift-key'] = token;
        mergedHeaders['Authorization'] = `Bearer ${token}`;
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: mergedHeaders,
    });
  } catch (networkErr: any) {
    throw new ApiError(
      networkErr?.message
        ? `Ağ bağlantı hatası: ${networkErr.message}`
        : 'Sunucuya ulaşılamadı. Lütfen internet ve sunucu bağlantınızı kontrol edin.',
      0
    );
  }

  return parseResponseSafe<T>(response);
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
