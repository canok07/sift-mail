import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// ==========================================
// Cryptographic Session & API Token Management
// ==========================================

// In-memory persistent session token generated on server startup
const runtimeSessionToken = crypto.randomBytes(32).toString('hex');

// Optional static API key defined in environment
const staticApiKey = process.env.SIFT_API_KEY?.trim() || '';

export function getActiveSessionToken(): string {
  return runtimeSessionToken;
}

export function isValidToken(providedToken: string | undefined | null): boolean {
  if (!providedToken) return false;
  const clean = providedToken.replace(/^Bearer\s+/i, '').trim();
  if (!clean) return false;

  // Constant-time comparison helper
  const safeCompare = (a: string, b: string): boolean => {
    if (!a || !b || a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  };

  if (staticApiKey && safeCompare(clean, staticApiKey)) {
    return true;
  }

  if (safeCompare(clean, runtimeSessionToken)) {
    return true;
  }

  return false;
}

/**
 * Middleware to enforce API token or valid session token on sensitive endpoints.
 */
export function requireApiToken(req: Request, res: Response, next: NextFunction) {
  const tokenHeader = (req.headers['x-sift-key'] || req.headers['authorization']) as string | undefined;

  // Check token
  if (tokenHeader && isValidToken(tokenHeader)) {
    return next();
  }

  // Same-origin loopback check: if no static SIFT_API_KEY is configured in .env and the request
  // is directly originating from localhost/127.0.0.1 with standard browser headers, allow it,
  // but if SIFT_API_KEY was explicitly set, enforce it strictly.
  if (!staticApiKey) {
    const isLoopback =
      req.ip === '127.0.0.1' ||
      req.ip === '::1' ||
      req.ip === '::ffff:127.0.0.1' ||
      req.hostname === 'localhost' ||
      req.hostname === '127.0.0.1';

    const origin = req.headers.origin;
    const isSameOrigin = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    if (isLoopback && isSameOrigin) {
      return next();
    }
  }

  return res.status(401).json({
    success: false,
    error: 'Yetkisiz erişim: Geçerli bir Sift API anahtarı (x-sift-key) veya oturum doğrulaması gereklidir.',
  });
}

// ==========================================
// In-Memory Sliding Window Rate Limiter
// ==========================================

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function createRateLimiter(options: { maxRequests: number; windowMs: number; message?: string }) {
  const { maxRequests, windowMs, message } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const routeKey = `${clientIp}:${req.baseUrl || req.path}`;
    const now = Date.now();

    const record = rateLimitMap.get(routeKey);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(routeKey, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        error: message || 'Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyin.',
        retryAfter: retryAfterSeconds,
      });
    }

    record.count += 1;
    return next();
  };
}

// Standard rate limiters
export const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'Genel API istek sınırı aşıldı. Lütfen bir dakika bekleyin.',
});

export const sensitiveApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 45,
  message: 'Hassas işlem istek sınırı aşıldı. Lütfen güvenliğiniz için bir dakika bekleyin.',
});

/**
 * Validates whether an incoming HTTP request Origin is allowed.
 * Strictly enforces localhost/127.0.0.1, app protocols, explicit custom origins, and conditional LAN access.
 */
export function isOriginAllowed(
  origin: string | undefined,
  options?: {
    isLanAccessEnabled?: boolean;
    allowedCustomOrigins?: string[];
    appUrl?: string;
  }
): boolean {
  // 1. Allow non-browser requests (Electron, Capacitor, mobile native, server-to-server)
  if (!origin) return true;

  // 2. Localhost and loopback 127.0.0.1 on any port
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (isLocalhost) return true;

  // 3. Native app client protocol origins
  if (
    origin.startsWith('capacitor://') ||
    origin.startsWith('ionic://') ||
    origin.startsWith('file://')
  ) {
    return true;
  }

  // 4. Conditional LAN access
  if (options?.isLanAccessEnabled) {
    const isPrivateLan = /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);
    if (isPrivateLan) return true;
  }

  // 5. Cloud Platform preview or configured APP_URL
  if (
    (options?.appUrl && origin === options.appUrl.replace(/\/+$/, '')) ||
    origin.endsWith('.run.app')
  ) {
    return true;
  }

  // 6. Explicitly configured custom origins
  const custom = options?.allowedCustomOrigins || [];
  if (custom.includes(origin) || custom.includes('*')) {
    return true;
  }

  return false;
}
