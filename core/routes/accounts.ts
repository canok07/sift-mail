import { Router } from 'express';
import { z } from 'zod';
import { requireApiToken, sensitiveApiLimiter, isLocalSessionRequest } from '../security';
import { saveVaultSecret, deleteVaultSecret } from '../security/vault';
import { validateBody } from '../security/validation';
import { accountLoginStatus, cancelAccountLogin, finishAccountLogin, startAccountLogin, oauthConfiguration, type OAuthProvider } from '../auth/accountService';

export function createAccountRouter() {
  const router = Router();
  const localOnly: import('express').RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isLocalSessionRequest(req.socket.remoteAddress, req.headers.host)) { res.status(403).json({ success: false, error: 'OAuth kurulumu yalnızca yerel uygulamada kullanılabilir.' }); return; }
    next();
  };
  router.get('/api/oauth/config', requireApiToken, localOnly, (_req, res) => res.json(oauthConfiguration()));
  const config = z.object({ provider: z.enum(['google', 'microsoft']), clientId: z.string().trim().min(1).max(200), clientSecret: z.string().trim().max(500).optional() });
  router.post('/api/oauth/config', sensitiveApiLimiter, requireApiToken, localOnly, validateBody(config), (req, res) => {
    const { provider, clientId, clientSecret } = req.body;
    const valid = provider === 'google' ? /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) : /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(clientId);
    if (!valid || (provider === 'microsoft' && clientSecret)) { res.status(400).json({ success: false, error: 'Geçerli bir Desktop/Public client uygulama kaydı girin.' }); return; }
    try {
      // Replace optional Google secret together with its client binding; never reuse another client's secret.
      if (provider === 'google') {
        if (clientSecret) saveVaultSecret('google_client_secret', JSON.stringify({ clientId, secret: clientSecret }), 'custom_token', 'Google OAuth client secret');
        else deleteVaultSecret('google_client_secret');
      }
      saveVaultSecret(provider === 'google' ? 'google_client_id' : 'microsoft_client_id', clientId, 'custom_token', `${provider} OAuth client ID`);
      res.json({ success: true });
    } catch { res.status(500).json({ success: false, error: 'OAuth uygulama kaydı güvenli kasaya kaydedilemedi.' }); }
  });
  for (const provider of ['google', 'microsoft'] as OAuthProvider[]) {
    router.post(`/api/oauth/${provider}/start`, sensitiveApiLimiter, requireApiToken, localOnly, (req, res) => {
      try {
        const origin = new URL(`http://${req.get('host')}`);
        if (provider === 'google' && origin.hostname === 'localhost') origin.hostname = '127.0.0.1';
        res.json({ success: true, ...startAccountLogin(provider, origin.origin) });
      }
      catch { res.status(400).json({ success: false, code: 'OAUTH_NOT_CONFIGURED', error: `${provider === 'google' ? 'Google Desktop' : 'Microsoft Public client'} OAuth uygulama kaydını hesap ekleme bölümünden yapılandırın.` }); }
    });
    const poll = z.object({ requestId: z.string().regex(/^[a-zA-Z0-9_-]{43}$/) });
    router.post(`/api/oauth/${provider}/status`, requireApiToken, localOnly, validateBody(poll), (req, res) => res.json(accountLoginStatus(provider, req.body.requestId)));
    router.post(`/api/oauth/${provider}/cancel`, requireApiToken, localOnly, validateBody(poll), (req, res) => { cancelAccountLogin(provider, req.body.requestId); res.json({ success: true }); });
    router.get(`/oauth/${provider}/callback`, sensitiveApiLimiter, localOnly, async (req, res) => {
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      let success = false;
      try { if (state.length <= 200 && (!code || code.length <= 10_000)) success = await finishAccountLogin(provider, { state, code, denied: Boolean(req.query.error) }); } catch {}
      // No code, state, provider errors or tokens are reflected into HTML or scripts.
      res.type('html').send(`<!doctype html><html lang="tr"><meta charset="utf-8"><title>Sift Mail</title><style>body{font:16px system-ui;background:#18181b;color:#fafafa;padding:3rem;line-height:1.7}</style><h1>${success ? 'Giriş tamamlandı' : 'Giriş tamamlanamadı'}</h1><p>Sift Mail uygulamasına dönün. Bu sekmeyi kapatabilirsiniz.</p></html>`);
    });
  }
  return router;
}
