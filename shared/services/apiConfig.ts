/// <reference types="vite/client" />

/**
 * Dynamic API Base URL resolver.
 * 
 * Works seamlessly across:
 * 1. Local development (localhost, 127.0.0.1)
 * 2. Local network IP access (e.g. 192.168.x.x from mobile/tablet)
 * 3. Remote / Production cloud deployments (Cloud Run, VPS, custom domain)
 *
 * If VITE_API_URL is configured in .env, it takes precedence.
 * Otherwise, it defaults to window.location.origin in the browser,
 * or empty string '' so relative endpoints (/api/...) work natively.
 */
export const getApiBaseUrl = (): string => {
  const envUrl = (import.meta as any)?.env?.VITE_API_URL || '';
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // In browser runtime, if no explicit VITE_API_URL is set, relative paths will use current origin
  return '';
};

export const getApiUrl = (endpoint: string): string => {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
};
