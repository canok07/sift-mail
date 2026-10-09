import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import {
  saveVaultSecret,
  getVaultSecret,
  deleteVaultSecret,
  getVaultSummary,
} from "./security/vault";
import { loadLocalMailSnapshot, saveLocalMailSnapshot } from "./security/mailStore";
import {
  testImapConnection,
  fetchImapMessages,
  performImapAction,
  fetchImapAttachment,
  fetchRawImapMessage,
  formatImapError,
  testSmtpConnection,
  sendSmtpMessage,
} from "./sync/imap";
import {
  testAiProviderConnection,
  getAiProvidersStatus,
} from "./ai/multiModelService";
import {
  generateMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftToken,
} from "./auth/microsoft";
import {
  setupTelegramBot,
  getTelegramStatus,
  processTelegramNaturalLanguageCommand,
} from "./integrations/telegramBot";
import {
  generalApiLimiter,
  sensitiveApiLimiter,
  requireApiToken,
  getActiveSessionToken,
  isLocalSessionRequest,
  isOriginAllowed,
} from "./security";
import {
  validateBody,
  VaultSaveSchema,
  LocalMailSnapshotSchema,
  ImapConnectSchema,
  ImapFetchSchema,
  ImapActionSchema,
  ImapAttachmentSchema,
  ImapRawMessageSchema,
  EmailSyncSchema,
  SmtpConnectSchema,
  SmtpSendSchema,
  MicrosoftAuthUrlSchema,
  MicrosoftCallbackSchema,
  MicrosoftRefreshSchema,
  AiTestConnectionSchema,
  AiSaveConfigSchema,
  PluginConfigureSchema,
  DecisionRequestSchema,
  TelegramConfigSchema,
  TelegramSimulateSchema,
} from "./security/validation";
import { createPluginManager } from "./plugins";
import { createAiRouter } from "./routes/ai";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const pluginManager = createPluginManager();

// ==========================================
// Strict & Explicit CORS Configuration
// ==========================================
// Security mandate:
// 1. Explicitly allow localhost / 127.0.0.1 on any port
// 2. Allow non-browser requests (Electron, Capacitor, mobile native, server-to-server) where origin is undefined
// 3. Private LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x) are ONLY allowed if ENABLE_LAN_ACCESS='true'
// 4. Custom origins explicitly configured via CORS_ORIGIN or ALLOWED_ORIGINS
// 5. Cloud Run / AI Studio preview domain (*.run.app)
// 6. STRICT: Reject any unauthorized origin (permissive fallback removed)
const allowedCustomOrigins = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const isLanAccessEnabled = process.env.ENABLE_LAN_ACCESS === "true";

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (
      isOriginAllowed(origin, {
        isLanAccessEnabled,
        allowedCustomOrigins,
        appUrl: process.env.APP_URL,
      })
    ) {
      return callback(null, true);
    }

    // STRICT: Reject all unauthorized origins (no permissive fallback)
    console.warn(`[Sift CORS Security] Yetkisiz origin engellendi: ${origin}`);
    return callback(new Error("CORS isteği engellendi: Yetkisiz origin adresi."));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "x-sift-key",
  ],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "55mb" }));

// Apply general rate limiting across all API endpoints
app.use("/api", generalApiLimiter);

// Handshake endpoint for local frontend / Electron clients to receive session authorization token
app.get("/api/auth/session", (req, res) => {
  if (!isLocalSessionRequest(req.socket.remoteAddress, req.headers.host)) {
    return res.status(403).json({ success: false, error: 'Yerel oturum anahtarı yalnızca bu cihazda kullanılabilir.' });
  }
  res.json({
    token: getActiveSessionToken(),
    timestamp: new Date().toISOString(),
  });
});

// Mail bodies and drafts are device-local, encrypted at rest and never served to remote clients.
app.get('/api/local/mail-cache', sensitiveApiLimiter, requireApiToken, (req, res) => {
  if (!isLocalSessionRequest(req.socket.remoteAddress, req.headers.host)) return res.status(403).json({ success: false, error: 'Yerel posta verisi yalnızca bu cihazda açılabilir.' });
  try { res.json({ success: true, snapshot: loadLocalMailSnapshot() }); }
  catch { res.status(500).json({ success: false, error: 'Yerel posta verisi açılamadı; mevcut dosya korunuyor.' }); }
});
app.post('/api/local/mail-cache', sensitiveApiLimiter, requireApiToken, validateBody(LocalMailSnapshotSchema), (req, res) => {
  if (!isLocalSessionRequest(req.socket.remoteAddress, req.headers.host)) return res.status(403).json({ success: false, error: 'Yerel posta verisi yalnızca bu cihazda kaydedilebilir.' });
  try { saveLocalMailSnapshot(req.body.snapshot); res.json({ success: true }); }
  catch { res.status(500).json({ success: false, error: 'Yerel posta verisi kaydedilemedi; önceki dosya korunuyor.' }); }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==========================================
// Encrypted Local Vault (AES-256-GCM Authenticated) Routes
// ==========================================

app.get("/api/vault", sensitiveApiLimiter, requireApiToken, (req, res) => {
  try {
    const summary = getVaultSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: "Kasa bilgileri okunamadı", details: err.message });
  }
});

app.post("/api/vault/save", sensitiveApiLimiter, requireApiToken, validateBody(VaultSaveSchema), (req, res) => {
  try {
    const { key, value, category, label } = req.body;
    saveVaultSecret(key, value, category, label);
    res.json({ success: true, message: "Veri AES-256-GCM ile yerel diske güvenle kaydedildi" });
  } catch (err: any) {
    res.status(500).json({ error: "Kasa kaydetme hatası", details: err.message });
  }
});

app.delete("/api/vault/:key", sensitiveApiLimiter, requireApiToken, (req, res) => {
  try {
    const { key } = req.params;
    const removed = deleteVaultSecret(key);
    res.json({ success: removed });
  } catch (err: any) {
    res.status(500).json({ error: "Kasa silme hatası", details: err.message });
  }
});

// ==========================================
// Universal IMAP & SMTP Service Routes
// ==========================================

app.post("/api/imap/test", sensitiveApiLimiter, requireApiToken, validateBody(ImapConnectSchema), async (req, res) => {
  try {
    const { host, port, secure, auth } = req.body;
    const result = await testImapConnection({ host, port: Number(port) || 993, secure: secure ?? true, auth });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || "IMAP testi başarısız" });
  }
});

app.post("/api/imap/fetch", sensitiveApiLimiter, requireApiToken, validateBody(ImapFetchSchema), async (req, res) => {
  try {
    const { host, port, secure, auth, maxResults } = req.body;
    const result = await fetchImapMessages(
      { host, port: Number(port) || 993, secure: secure ?? true, auth },
      maxResults || 15
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "IMAP iletileri alınamadı" });
  }
});
app.post("/api/imap/action", sensitiveApiLimiter, requireApiToken, validateBody(ImapActionSchema), async (req, res) => {
  try { res.json(await performImapAction(req.body)); }
  catch (error: any) { res.status(500).json({ success: false, verified: false, error: formatImapError(error, req.body.host) }); }
});
app.post("/api/imap/attachment", sensitiveApiLimiter, requireApiToken, validateBody(ImapAttachmentSchema), async (req, res) => {
  try { res.json({ success: true, ...(await fetchImapAttachment(req.body)) }); }
  catch (error: any) { res.status(400).json({ success: false, error: formatImapError(error, req.body.host) }); }
});
app.post("/api/imap/raw-message", sensitiveApiLimiter, requireApiToken, validateBody(ImapRawMessageSchema), async (req, res) => {
  try { res.json({ success: true, ...(await fetchRawImapMessage(req.body)) }); }
  catch (error: any) { res.status(400).json({ success: false, error: formatImapError(error, req.body.host) }); }
});

// ==========================================
// Central Direct IMAP Mail Synchronization Endpoint (Dynamic In-Memory)
// ==========================================
// 1. Dinamik İstek Verisi: İstemciden gelen req.body.email ve req.body.password kullanılır.
// 2. OAuth2 Desteği: req.body.accessToken (XOAUTH2) ile Outlook ve Gmail OAuth desteklenir.
// 3. Çoklu Klasör Desteği: req.body.folder veya tüm klasörlerin otomatik senkronizasyonu.
const handleEmailSync = async (req: express.Request, res: express.Response) => {
  try {
    const user = (
      req.body?.email ||
      req.body?.user ||
      req.body?.auth?.user ||
      req.query?.email ||
      req.query?.user ||
      process.env.IMAP_USER ||
      process.env.EMAIL_USER ||
      ""
    ).toString().trim();

    const pass = (
      req.body?.password ||
      req.body?.appPassword ||
      req.body?.pass ||
      req.body?.auth?.pass ||
      req.query?.password ||
      req.query?.pass ||
      process.env.IMAP_PASSWORD ||
      process.env.EMAIL_PASS ||
      ""
    ).toString();

    const accessToken = (
      req.body?.accessToken ||
      req.body?.auth?.accessToken ||
      req.query?.accessToken ||
      ""
    ).toString().trim();

    if (!user || (!pass && !accessToken)) {
      return res.status(200).json({
        success: false,
        error: "IMAP kimlik doğrulaması başarısız. Lütfen e-posta adresinizi ve şifrenizi (veya OAuth oturumunu) kontrol edin.",
        hint: "Outlook/Hotmail için 'Microsoft ile Giriş Yap' butonunu; Google için 16 haneli Uygulama Şifresini kullanın.",
      });
    }

    // 2. IMAP Sunucu ve Port parametreleri (Dinamik veya otomatik tespit)
    let host = (
      req.body?.host ||
      req.query?.host ||
      process.env.IMAP_HOST ||
      ""
    ).toString().trim();

    if (!host) {
      const lowerUser = user.toLowerCase();
      if (lowerUser.includes("@gmail.com") || lowerUser.includes("@googlemail.com")) {
        host = "imap.gmail.com";
      } else if (
        lowerUser.includes("outlook") ||
        lowerUser.includes("hotmail") ||
        lowerUser.includes("live.com") ||
        lowerUser.includes("msn.com")
      ) {
        host = "outlook.office365.com";
      } else if (lowerUser.includes("yahoo.com")) {
        host = "imap.mail.yahoo.com";
      } else if (lowerUser.includes("yandex")) {
        host = "imap.yandex.com";
      } else if (lowerUser.includes("@icloud.com") || lowerUser.includes("@me.com")) {
        host = "imap.mail.me.com";
      } else {
        host = "imap.gmail.com";
      }
    }

    const port = Number(req.body?.port || req.query?.port || process.env.IMAP_PORT) || 993;
    const secure = req.body?.secure !== undefined ? req.body.secure !== false : true;
    const maxResults = Math.min(
      100,
      Math.max(1, Number(req.body?.maxResults || req.query?.maxResults) || 35)
    );

    const folder = req.body?.folder ? String(req.body.folder).trim() : undefined;
    const accountId = req.body?.accountId ? String(req.body.accountId).trim() : undefined;

    console.log(`[Dynamic IMAP Sync] ${user} için ${host}:${port} (${folder || 'Tüm Klasörler'}) senkronize ediliyor...`);

    // 3. IMAP Bağlantısı ve İleti Çekimi
    const result = await fetchImapMessages(
      {
        host,
        port,
        secure,
        auth: { user, pass: host === 'imap.gmail.com' ? pass.replace(/\s+/g, '') : pass, accessToken },
        folder,
        offset: Math.max(0, Math.floor(Number(req.body?.offset) || 0)),
        sinceUid: req.body?.sinceUid ? Math.max(1, Math.floor(Number(req.body.sinceUid))) : undefined,
        expectedUidValidity: req.body?.expectedUidValidity ? String(req.body.expectedUidValidity) : undefined,
        accountId,
      },
      maxResults
    );

    if (!result.success) {
      console.warn(`[IMAP Sync Failed] ${user}: ${result.error}`);
      const retryable = /(?:timeout|timed out|econn|socket|connection (?:closed|lost|reset)|temporar|unavailable|network)/i.test(result.error || '');
      return res.status(retryable ? 503 : 200).json({
        success: false,
        retryable,
        error: result.error || "IMAP kimlik doğrulaması başarısız. Lütfen bilgilerinizi kontrol edin.",
        hint: "Outlook için 'Microsoft ile Giriş Yap', Gmail için 16 haneli Uygulama Şifresi kullanın.",
      });
    }

    const lowerUser = user.toLowerCase();
    const provider = lowerUser.includes("@gmail.com") || lowerUser.includes("@googlemail.com")
      ? "gmail"
      : lowerUser.includes("outlook") || lowerUser.includes("hotmail") || lowerUser.includes("live.com") || lowerUser.includes("msn.com")
      ? "outlook"
      : lowerUser.includes("yahoo")
      ? "yahoo"
      : lowerUser.includes("icloud") || lowerUser.includes("me.com")
      ? "icloud"
      : "imap";

    return res.status(200).json({
      success: true,
      count: result.messages.length,
      messages: result.messages,
      mailboxes: result.mailboxes || [],
      incremental: result.incremental,
      account: {
        email: user,
        provider,
        host,
        port,
      },
    });
  } catch (err: any) {
    console.error("[IMAP Sync Error Catch]", err);
    return res.status(200).json({
      success: false,
      error: formatImapError(err) || "IMAP senkronizasyonu sırasında beklenmeyen hata oluştu.",
    });
  }
};

app.post("/api/emails/sync", sensitiveApiLimiter, requireApiToken, validateBody(EmailSyncSchema), handleEmailSync);

// ==========================================
// Microsoft Identity Platform OAuth 2.0 / PKCE Routes
// ==========================================

app.get("/api/oauth/microsoft/auth-url", sensitiveApiLimiter, requireApiToken, (req, res) => {
  try {
    const redirectUri =
      (req.query.redirectUri as string) || `http://localhost:${PORT}/oauth/microsoft/callback`;
    const customClientId = req.query.customClientId as string;
    const authData = generateMicrosoftAuthUrl(redirectUri, customClientId);
    res.json({ success: true, ...authData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(
  "/api/oauth/microsoft/callback",
  sensitiveApiLimiter,
  requireApiToken,
  validateBody(MicrosoftCallbackSchema),
  async (req, res) => {
    try {
      const { code, state, redirectUri, codeVerifier, customClientId } = req.body;
      const tokenResult = await exchangeMicrosoftCode({
        code,
        state,
        redirectUri,
        codeVerifier,
        customClientId,
      });
      res.json(tokenResult);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.post(
  "/api/oauth/microsoft/refresh",
  sensitiveApiLimiter,
  requireApiToken,
  validateBody(MicrosoftRefreshSchema),
  async (req, res) => {
    try {
      const { email, customClientId } = req.body;
      const refreshResult = await refreshMicrosoftToken(email, customClientId);
      res.json(refreshResult);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// HTML Callback Handler for Microsoft OAuth Popup
app.get("/oauth/microsoft/callback", (req, res) => {
  const code = req.query.code || "";
  const state = req.query.state || "";
  const error = req.query.error || "";
  const errorDescription = req.query.error_description || "";
  const scriptValue = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Microsoft Girişi Tamamlandı</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
    .box { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); max-width: 420px; }
    h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Microsoft Hesabı Doğrulandı</h2>
    <p>Oturum açma bilgileri güvenle Sift istemcisine aktarılıyor, pencere otomatik kapanacaktır...</p>
  </div>
  <script>
    const payload = {
      type: 'MS_OAUTH_CALLBACK',
      code: ${scriptValue(code)},
      state: ${scriptValue(state)},
      error: ${scriptValue(error)},
      errorDescription: ${scriptValue(errorDescription)}
    };
    const channel = new BroadcastChannel('sift-microsoft-oauth');
    channel.postMessage(payload);
    setTimeout(() => { channel.close(); window.close(); }, 1000);
  </script>
</body>
</html>`);
});

// ==========================================
// AI Provider Configuration & Health Routes
// ==========================================

app.post(
  "/api/ai/test-connection",
  sensitiveApiLimiter,
  requireApiToken,
  validateBody(AiTestConnectionSchema),
  async (req, res) => {
    try {
      const result = await testAiProviderConnection(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

app.get("/api/ai/providers-status", sensitiveApiLimiter, requireApiToken, (req, res) => {
  try {
    const status = getAiProvidersStatus();
    res.json({ success: true, providers: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/plugins", sensitiveApiLimiter, requireApiToken, (_req, res) => res.json({ success: true, plugins: pluginManager.list() }));
app.get("/api/plugins/runs", sensitiveApiLimiter, requireApiToken, (_req, res) => res.json({ success: true, runs: pluginManager.getRuns() }));
app.post("/api/plugins/:id/configure", sensitiveApiLimiter, requireApiToken, validateBody(PluginConfigureSchema), async (req, res) => {
  try { res.json({ success: true, plugin: await pluginManager.configure(req.params.id, req.body) }); }
  catch(error:any){ res.status(400).json({success:false,error:error.message}); }
});
app.post("/api/plugins/:id/test", sensitiveApiLimiter, requireApiToken, validateBody(PluginConfigureSchema), async (req, res) => {
  try { const plugin=await pluginManager.test(req.params.id,req.body);res.status(plugin.status==='ERROR'?400:200).json({success:plugin.status!=='ERROR'&&plugin.status!=='NOT_CONFIGURED',plugin}); }
  catch(error:any){ res.status(400).json({success:false,error:error.message}); }
});
app.post("/api/plugins/:id/enable", sensitiveApiLimiter, requireApiToken, async (req, res) => {
  try { res.json({success:true,plugin:await pluginManager.enable(req.params.id)}); }
  catch(error:any){ res.status(400).json({success:false,error:error.message}); }
});
app.post("/api/plugins/:id/disable", sensitiveApiLimiter, requireApiToken, async (req, res) => {
  try { res.json({success:true,plugin:await pluginManager.disable(req.params.id)}); }
  catch(error:any){ res.status(400).json({success:false,error:error.message}); }
});
app.post("/api/decision", sensitiveApiLimiter, requireApiToken, validateBody(DecisionRequestSchema), async (req, res) => {
  res.json({success:true,...await pluginManager.decide(req.body.provider,req.body.input)});
});

app.post(
  "/api/ai/save-config",
  sensitiveApiLimiter,
  requireApiToken,
  validateBody(AiSaveConfigSchema),
  async (req, res) => {
    try {
      const { provider, apiKey, endpoint, model } = req.body;
      await pluginManager.configure(provider,{apiKey,endpoint,model});
      if(req.body.enabled===false){res.json({success:true,plugin:await pluginManager.disable(provider)});return}
      const tested=await pluginManager.test(provider);
      if(tested.status==='ERROR'||tested.status==='NOT_CONFIGURED'){res.status(400).json({success:false,message:tested.message,plugin:tested});return}
      res.json({ success: true, plugin:await pluginManager.enable(provider), message:tested.message });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.post("/api/smtp/test", sensitiveApiLimiter, requireApiToken, validateBody(SmtpConnectSchema), async (req, res) => {
  try {
    const { host, port, secure, auth } = req.body;
    const result = await testSmtpConnection({ host, port: Number(port) || 465, secure: secure ?? true, auth });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || "SMTP testi başarısız" });
  }
});

// ==========================================
// Deep Gemini NLP Analysis Route with Rich Metadata
// ==========================================

app.use('/api', createAiRouter());

// ==========================================
// Telegram Bot Service (Telegraf) Endpoints
// ==========================================
app.post("/api/telegram/config", sensitiveApiLimiter, requireApiToken, validateBody(TelegramConfigSchema), async (req, res) => {
  try {
    const { token, chatId } = req.body;
    if (token) saveVaultSecret("telegram_bot_token", token, "telegram", "Telegram Bot Token");
    if (chatId) saveVaultSecret("telegram_chat_id", chatId, "telegram", "Telegram Yönetici ID");

    const result = await setupTelegramBot(token || "", chatId || "");
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/telegram/status", sensitiveApiLimiter, requireApiToken, (req, res) => {
  try {
    const status = getTelegramStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ isRunning: false, error: error.message });
  }
});

app.post("/api/telegram/simulate", sensitiveApiLimiter, requireApiToken, validateBody(TelegramSimulateSchema), async (req, res) => {
  try {
    const { command } = req.body;
    const reply = await processTelegramNaturalLanguageCommand(command);
    res.json({ success: true, reply });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SMTP Send Message Endpoint
app.post("/api/smtp/send", sensitiveApiLimiter, requireApiToken, validateBody(SmtpSendSchema), async (req, res) => {
  try {
    const config = req.body.config || req.body.smtp;
    const mail = req.body.mail;

    const result = await sendSmtpMessage(config, mail);
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Catch-all handler for undefined /api/* routes so they return clean JSON 404 rather than HTML fallback
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API uç noktası bulunamadı: ${req.method} ${req.originalUrl || req.url}`,
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite is a development-only dependency and is intentionally absent from
    // the packaged Electron application. Load it only for local development.
    const { createServer: createViteServer } = await import("vite");
    const isHmrDisabled = process.env.DISABLE_HMR === "true" || process.env.DISABLE_HMR === "1";
    const vite = await createViteServer({
      configFile: path.resolve(process.cwd(), "apps/web/vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.SIFT_DIST_PATH || path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Security mandate: Bind strictly to 127.0.0.1 for local desktop execution.
  // Only bind to 0.0.0.0 if explicitly running in a container or if ENABLE_LAN_ACCESS='true'.
  const isContainerEnv = Boolean(
    process.env.K_SERVICE ||
    process.env.CONTAINER ||
    process.env.DOCKER_CONTAINER ||
    (process.env.NODE_ENV === "production" && (process.env.CLOUD_RUN || process.env.K_REVISION))
  );
  const BIND_HOST = process.env.HOST || (isContainerEnv || process.env.ENABLE_LAN_ACCESS === "true" ? "0.0.0.0" : "127.0.0.1");

  const listener = app.listen(PORT, BIND_HOST, () => {
    const address = listener.address();
    if (process.send && address && typeof address !== 'string') {
      process.send({ type: 'sift-ready', port: address.port });
    }
    console.log(`[Sift Server] running on http://${BIND_HOST}:${PORT}`);
  });
}

// Express' default error page is HTML. API callers must always receive JSON,
// including malformed request bodies, CORS errors and unexpected exceptions.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.path.startsWith('/api/')) return next(err);
  const status = err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500;
  res.status(status).json({ success: false, error: status === 400 ? 'Geçersiz JSON isteği.' : 'Sunucu isteği tamamlayamadı.' });
});

// Only launch background HTTP listener if NOT run inside a serverless runtime (e.g. Vercel)
if (process.env.VERCEL !== "1" && !process.env.VERCEL_ENV && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;
export { app, startServer };
