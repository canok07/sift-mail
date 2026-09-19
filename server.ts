import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenAI, Type } from "@google/genai";
import {
  saveVaultSecret,
  getVaultSecret,
  deleteVaultSecret,
  getVaultSummary,
} from "./server/vault";
import {
  testImapConnection,
  fetchImapMessages,
  formatImapError,
  testSmtpConnection,
  sendSmtpMessage,
} from "./server/imap";
import {
  analyzeWithMultiModel,
  testAiProviderConnection,
  getAiProvidersStatus,
} from "./server/ai/multiModelService";
import {
  generateMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftToken,
} from "./server/oauth/microsoft";
import {
  setupTelegramBot,
  getTelegramStatus,
  processTelegramNaturalLanguageCommand,
} from "./server/telegramBot";
import {
  generalApiLimiter,
  sensitiveApiLimiter,
  requireApiToken,
  getActiveSessionToken,
  isOriginAllowed,
} from "./server/security";
import {
  validateBody,
  VaultSaveSchema,
  ImapConnectSchema,
  ImapFetchSchema,
  EmailSyncSchema,
  SmtpConnectSchema,
  SmtpSendSchema,
  MicrosoftAuthUrlSchema,
  MicrosoftCallbackSchema,
  MicrosoftRefreshSchema,
  AiTestConnectionSchema,
  AiSaveConfigSchema,
  AnalyzeEmailSchema,
  AnalyzeBatchSchema,
  AiAnalyzeSchema,
  AssistantChatSchema,
  TelegramConfigSchema,
  TelegramSimulateSchema,
} from "./server/validation";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

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
app.use(express.json({ limit: "15mb" }));

// Apply general rate limiting across all API endpoints
app.use("/api", generalApiLimiter);

// Handshake endpoint for local frontend / Electron clients to receive session authorization token
app.get("/api/auth/session", (req, res) => {
  res.json({
    token: getActiveSessionToken(),
    timestamp: new Date().toISOString(),
  });
});

// Lazy initialization for Gemini AI client (supports custom API key from local vault)
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  // Check if user set a custom Gemini API key in local Vault first
  const customKey = getVaultSecret("gemini_custom_api_key");
  const apiKey = customKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set in environment or local vault.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

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
        accountId,
      },
      maxResults
    );

    if (!result.success) {
      console.warn(`[IMAP Sync Failed] ${user}: ${result.error}`);
      return res.status(200).json({
        success: false,
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

app.get("/api/emails/sync", sensitiveApiLimiter, requireApiToken, handleEmailSync);
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
      code: ${JSON.stringify(code)},
      state: ${JSON.stringify(state)},
      error: ${JSON.stringify(error)},
      errorDescription: ${JSON.stringify(errorDescription)}
    };
    if (window.opener) {
      window.opener.postMessage(payload, window.location.origin);
      setTimeout(() => window.close(), 1000);
    } else {
      window.close();
    }
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

app.post(
  "/api/ai/save-config",
  sensitiveApiLimiter,
  requireApiToken,
  validateBody(AiSaveConfigSchema),
  (req, res) => {
    try {
      const { provider, apiKey, endpoint, model } = req.body;
      if (apiKey) {
        const vaultKey = provider === "gemini" ? "gemini_custom_api_key" : `${provider}_api_key`;
        saveVaultSecret(vaultKey, apiKey, "custom_token", `${provider.toUpperCase()} API Key`);
      }
      if (endpoint) {
        saveVaultSecret(`${provider}_endpoint`, endpoint, "custom_token", `${provider.toUpperCase()} Endpoint`);
      }
      if (model) {
        saveVaultSecret(`${provider}_model`, model, "custom_token", `${provider.toUpperCase()} Model`);
      }
      res.json({ success: true, message: `${provider.toUpperCase()} ayarları AES-256-GCM ile kasaya kaydedildi.` });
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

app.post("/api/analyze-email", sensitiveApiLimiter, requireApiToken, async (req, res) => {
  try {
    const { from, subject, snippet, bodyText, headers } = req.body;

    if (!from && !subject && !snippet && !bodyText) {
      return res.status(400).json({ error: "Email content is required" });
    }

    const ai = getAiClient();
    const prompt = `Sen uzman bir siber güvenlik ve doğal dil işleme (NLP) e-posta filtreleme asistanısın.
Aşağıdaki e-posta iletisini derinlemesine analiz et.
Amacın:
1. Bu iletinin GERÇEK ve GÜVENLİ bir e-posta mı, yoksa SPAM, KİMLİK AVI (PHISHING) veya bir BÜLTEN/ABONELİK mi olduğunu tespit etmek.
2. Eğer bir bülten veya reklam aboneliği ise, metinden veya başlıklardan abonelikten çıkma (unsubscribe) linkini/yöntemini tespit et.
3. Kullanıcıya yalnızca güvenli olanları sunmakla kalmayıp, GÜVENLİ E-POSTALARI AKILLI KATEGORİLERE AYIR:
   - 'work': İş, projeler, toplantılar, mesai arkadaşları, GitHub, Jira, yazılım ve kurumsal iş yazışmaları.
   - 'finance': Bankacılık, faturalar, ekstreler, ödeme makbuzları, abonelik ücretleri, vergi, muhasebe.
   - 'shopping': Sipariş onayları, e-ticaret alışverişi, kargo takip, teslimat bildirimleri.
   - 'official': E-Devlet, resmi kurumlar, üniversite, noter, belediye, yasal ve hesap güvenlik teyitleri.
   - 'personal': Aile, arkadaşlar ve kişisel sosyal iletişim.
   - 'travel': Uçak, tren, otel rezervasyonları, tatil, biletler ve yolculuk planları.
   - 'other': Yukarıdakilere uymayan genel güvenli iletiler.
4. ÖZEL METADATA ÇIKARIMI (ÇOK ÖNEMLİ):
   - Eğer kategori 'shopping' (Sipariş & Kargo) ise: Gövde veya başlıklardan 'Kargo Takip Numarası' (trackingNumber), 'Kargo Firması' (carrier: örn. Yurtiçi Kargo, Aras, Trendyol Express, Hepsijet, DHL, FedEx vb.) ve 'Tahmini Teslimat' (estimatedDelivery: örn. '15 Mart Cuma' veya 'Yarın Teslimatta') verilerini tespit edip 'orderShippingInfo' alanına yaz.
   - Eğer kategori 'finance' (Finans & Fatura) ise: Gövdeden 'Ödenecek Tutar' (dueAmount: örn. '₺1.450,00' veya '$89.90') ve 'Son Ödeme Tarihi' (dueDate: örn. '24 Mart 2026') verilerini tespit edip 'financeBillingInfo' alanına yaz.
5. Bu güvenli gönderici ve içerik türünün GELECEKTE GELECEK e-postalarını otomatik ayrıştırmak için bir filtre kuralı (patternType: 'domain'/'from'/'subject', patternValue, description) öner.
6. Türkçe ve profesyonel bir üslupla açıkla.

E-posta Bilgileri:
Gönderici (From): ${from || "Bilinmiyor"}
Konu (Subject): ${subject || "Konusuz"}
Özet/Snippet: ${snippet || ""}
E-posta Başlıkları (Varsa List-Unsubscribe vb.): ${headers || ""}
Gövde Metni (İlk kısım): ${bodyText ? bodyText.slice(0, 3500) : "Gövde metni yok"}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Sen e-posta güvenliği, spam tespiti, otomatik kategorizasyon, kargo takip ve fatura metadata çıkarımı konusunda uzmanlaşmış bir NLP motorusun. Cevaplarını Türkçe ve JSON formatında ver.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            classification: {
              type: Type.STRING,
              description: "Must be one of: 'safe', 'newsletter', 'spam', 'phishing'",
            },
            isSafe: {
              type: Type.BOOLEAN,
              description: "True if authentic and safe to read.",
            },
            safetyScore: {
              type: Type.INTEGER,
              description: "Safety score from 0 to 100",
            },
            threatLevel: {
              type: Type.STRING,
              description: "One of: 'none', 'low', 'medium', 'high', 'critical'",
            },
            safeCategory: {
              type: Type.STRING,
              description: "One of: 'work', 'finance', 'shopping', 'official', 'personal', 'travel', 'other'",
            },
            categoryConfidence: {
              type: Type.INTEGER,
              description: "Confidence percentage in this category classification from 0 to 100.",
            },
            isSubscription: {
              type: Type.BOOLEAN,
              description: "True if newsletter or promotional subscription.",
            },
            unsubscribeUrl: {
              type: Type.STRING,
              description: "HTTP/HTTPS unsubscribe link or mailto unsubscription address if detected, otherwise empty string.",
            },
            reasoning: {
              type: Type.STRING,
              description: "Turkish explanation of classification.",
            },
            keyFindings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "2-4 key indicators in Turkish.",
            },
            suggestedAction: {
              type: Type.STRING,
              description: "'keep_safe', 'unsubscribe', 'trash', 'block_spam'",
            },
            orderShippingInfo: {
              type: Type.OBJECT,
              properties: {
                trackingNumber: { type: Type.STRING, description: "Tracking code e.g. '123456789012' if order/shipping email" },
                carrier: { type: Type.STRING, description: "Carrier company name e.g. 'Yurtiçi Kargo', 'Aras Kargo', 'DHL'" },
                estimatedDelivery: { type: Type.STRING, description: "Estimated delivery date or status e.g. '16 Mart Pazartesi'" },
              },
            },
            financeBillingInfo: {
              type: Type.OBJECT,
              properties: {
                dueAmount: { type: Type.STRING, description: "Total due payment amount e.g. '₺850,50' or '$49.00'" },
                dueDate: { type: Type.STRING, description: "Due date e.g. '28 Mart 2026'" },
              },
            },
            suggestedFilterRule: {
              type: Type.OBJECT,
              properties: {
                patternType: {
                  type: Type.STRING,
                  description: "'domain', 'from', or 'subject'",
                },
                patternValue: {
                  type: Type.STRING,
                  description: "Domain name, sender email, or keyword for future automatic rule matching",
                },
                description: {
                  type: Type.STRING,
                  description: "Turkish explanation of the rule for future incoming emails",
                },
              },
              required: ["patternType", "patternValue", "description"],
            },
          },
          required: [
            "classification",
            "isSafe",
            "safetyScore",
            "threatLevel",
            "safeCategory",
            "isSubscription",
            "unsubscribeUrl",
            "reasoning",
            "keyFindings",
            "suggestedAction",
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Gemini email analysis error:", error);
    res.status(500).json({
      error: "Analiz sırasında hata oluştu",
      details: error.message || String(error),
    });
  }
});

// Batch analyze multiple emails
app.post("/api/analyze-batch", sensitiveApiLimiter, requireApiToken, validateBody(AnalyzeBatchSchema), async (req, res) => {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: "Emails array is required" });
    }

    const ai = getAiClient();
    const prompt = `Aşağıdaki ${emails.length} adet e-postayı tek tek değerlendirip spam filtreleme ve güvenlik analizi yap.
Her biri için güvenli mi, bülten aboneliği mi, yoksa spam/phishing mi olduğunu belirle. Varsa abonelikten çıkma linkini tespit et. Kargo veya fatura bilgilerini çıkar.

E-postalar:
${JSON.stringify(
  emails.map((e: any, idx: number) => ({
    id: e.id || String(idx),
    from: e.from,
    subject: e.subject,
    snippet: e.snippet?.slice(0, 300),
    headers: e.headers || "",
  })),
  null,
  2
)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Sen e-postaları tek tek analiz eden yüksek hassasiyetli bir NLP spam ve güvenlik filtresisin.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              classification: { type: Type.STRING, description: "'safe', 'newsletter', 'spam', 'phishing'" },
              isSafe: { type: Type.BOOLEAN },
              safetyScore: { type: Type.INTEGER },
              threatLevel: { type: Type.STRING },
              safeCategory: { type: Type.STRING, description: "'work', 'finance', 'shopping', 'official', 'personal', 'travel', 'other'" },
              isSubscription: { type: Type.BOOLEAN },
              unsubscribeUrl: { type: Type.STRING },
              reasoning: { type: Type.STRING },
              keyFindings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              suggestedAction: { type: Type.STRING },
              orderShippingInfo: {
                type: Type.OBJECT,
                properties: {
                  trackingNumber: { type: Type.STRING },
                  carrier: { type: Type.STRING },
                  estimatedDelivery: { type: Type.STRING },
                },
              },
              financeBillingInfo: {
                type: Type.OBJECT,
                properties: {
                  dueAmount: { type: Type.STRING },
                  dueDate: { type: Type.STRING },
                },
              },
            },
            required: [
              "id",
              "classification",
              "isSafe",
              "safetyScore",
              "threatLevel",
              "isSubscription",
              "unsubscribeUrl",
              "reasoning",
              "keyFindings",
              "suggestedAction",
            ],
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || "[]");
    res.json({ results: parsed });
  } catch (error: any) {
    console.error("Gemini batch analysis error:", error);
    res.status(500).json({
      error: "Toplu analiz sırasında hata oluştu",
      details: error.message || String(error),
    });
  }
});

// ==========================================
// Multi-Model AI Service Endpoint (Factory)
// ==========================================
app.post("/api/ai/analyze", sensitiveApiLimiter, requireApiToken, validateBody(AiAnalyzeSchema), async (req, res) => {
  try {
    const { from, subject, snippet, bodyText, headers, provider, ollamaEndpoint, modelName } = req.body;
    const result = await analyzeWithMultiModel({
      from,
      subject,
      snippet,
      bodyText,
      headers,
      provider,
      ollamaEndpoint,
      modelName,
    });
    res.json(result);
  } catch (error: any) {
    console.error("Multi-model AI analysis error:", error);
    res.status(500).json({
      error: "Yapay zeka analizi sırasında hata oluştu",
      details: error.message || String(error),
    });
  }
});

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

// ==========================================
// Gemini Email AI Assistant Endpoints
// ==========================================
app.post("/api/ai/assistant/chat", sensitiveApiLimiter, requireApiToken, validateBody(AssistantChatSchema), async (req, res) => {
  try {
    const {
      messages = [],
      emailContext,
      task = "general_chat",
      replyIntent,
      revisionType,
      draftText,
    } = req.body;

    const ai = getAiClient();

    const systemInstruction = `Sen "Sift" akıllı e-posta platformunun entegre Yapay Zeka Asistanısın (Gemini).
Görevlerin:
1. Kullanıcının e-postalarını analiz etmek, özetlemek, görevleri/tarihleri çıkarmak ve iletinin tonunu/niyetini irdelemek.
2. Gelen e-postaya göre profesyonel, amaca uygun ve anında gönderilebilir e-posta yanıt taslakları üretmek.
3. Kullanıcının yazdığı veya üretilen taslakları farklı tonlara (resmi, samimi, öz, detaylı) ve dillere (İngilizce, Almanca, Türkçe) revize etmek.
4. E-posta ile ilgili sorulara Türkçe, net, kibar ve yapılandırılmış yanıtlar vermek.
Yanıt verirken gereksiz gevezelik yapma, amaca odaklan. Markdown formatı kullanabilirsin.`;

    let userPrompt = "";

    if (task === "summarize") {
      userPrompt = `Aşağıdaki e-postayı ana hatlarıyla özetle.
- Önemli noktalar ve kararlar
- Varsa istenen aksiyonlar veya onaylar
- Varsa ekteki belgeler veya bahsedilen konular

E-posta Detayları:
Kimden: ${emailContext?.from || "Bilinmiyor"} (${emailContext?.fromEmail || ""})
Konu: ${emailContext?.subject || "Başlıksız"}
Tarih: ${emailContext?.date || ""}
İçerik:
${emailContext?.bodyText || emailContext?.snippet || "İçerik boş."}`;
    } else if (task === "extract_tasks") {
      userPrompt = `Aşağıdaki e-postadan yapılması gereken eylemleri, görevleri, son teslim tarihlerini ve toplantı/etkinlik zamanlarını çıkar.
- Varsa her görev için aciliyet / öncelik derecesini belirt (Yüksek, Orta, Normal).
- Varsa tarih veya saatleri belirgin biçimde listele.
- Eğer e-postada herhangi bir eylem veya tarih talebi yoksa bunu açıkça belirt.

E-posta:
Kimden: ${emailContext?.from || ""}
Konu: ${emailContext?.subject || ""}
İçerik:
${emailContext?.bodyText || emailContext?.snippet || ""}`;
    } else if (task === "analyze_tone") {
      userPrompt = `Aşağıdaki e-postanın dilini, tonunu ve iletişim niyetini derinlemesine analiz et:
1. **İletişim Tonu**: (örn. Çok resmi, kurumsal, dostane/samimi, telaşlı/acil, talepkar, mesafeli)
2. **Göndericinin Asıl Amacı**: (Ne istiyor, beklenen somut çıktı ne?)
3. **Duygu Durumu & Baskı**: (Aciliyet baskısı, pasif-agresif ifadeler veya şüpheli manipülasyon var mı?)
4. **Tavsiye Edilen Yaklaşım**: (Kullanıcı bu mesaja nasıl bir tutumla dönmeli?)

E-posta:
Kimden: ${emailContext?.from || ""}
Konu: ${emailContext?.subject || ""}
İçerik:
${emailContext?.bodyText || emailContext?.snippet || ""}`;
    } else if (task === "smart_reply") {
      let intentDescription = "profesyonel ve dengeli bir e-posta yanıtı";
      if (replyIntent === "positive") {
        intentDescription = "olumlu, teklifi/talebi kabul eden, memnuniyet belirten ve teşekkür eden net bir yanıt";
      } else if (replyIntent === "decline") {
        intentDescription = "kibar, nazik bir şekilde durumu açıklayan ve teklifi/talebi reddeden profesyonel bir yanıt";
      } else if (replyIntent === "meeting") {
        intentDescription = "toplantı/görüşme teklifini karşılayan, uygun gün ve saat dilimlerini öneren veya teyit isteyen bir yanıt";
      } else if (replyIntent === "more_info") {
        intentDescription = "karar vermeden önce daha detaylı bilgi, ek doküman veya açıklama talep eden yapıcı bir yanıt";
      }

      userPrompt = `Aşağıdaki gelen e-postaya doğrudan gönderilmeye hazır ${intentDescription} hazırla.
Kurallar:
- Hitap ile başla (Sayın [İsim] veya Merhaba [İsim]).
- Gövde metnini net paragraflarla yaz.
- Saygılı ve profesyonel bir kapanış cümlesi ile bitir (örn. Saygılarımla / İyi çalışmalar).
- Fazladan selamlama/açıklama metni ekleme, doğrudan e-posta metnini üret.

Gelen E-posta:
Kimden: ${emailContext?.from || ""} <${emailContext?.fromEmail || ""}>
Konu: ${emailContext?.subject || ""}
İçerik:
${emailContext?.bodyText || emailContext?.snippet || ""}`;
    } else if (task === "revise") {
      let instruction = "Bu taslağı revize et.";
      if (revisionType === "formal") instruction = "Bu taslağı daha kurumsal, resmi, saygın ve mesafeli bir dille yeniden yaz.";
      else if (revisionType === "friendly") instruction = "Bu taslağı daha sıcak, samimi, arkadaş canlısı ve yapıcı bir dille yeniden yaz.";
      else if (revisionType === "shorter") instruction = "Bu taslağı gereksiz dolambaçlı cümlelerden arındırarak kısa, net ve doğrudan sonuca giden öz bir metne dönüştür.";
      else if (revisionType === "longer") instruction = "Bu taslağı daha detaylı, açıklayıcı, nezaket ve bağlam ifadeleriyle genişletilmiş zengin bir metne dönüştür.";
      else if (revisionType === "translate_en") instruction = "Bu e-posta taslağını kusursuz, doğal bir Business English (İngilizce) diline çevir.";
      else if (revisionType === "translate_de") instruction = "Bu e-posta taslağını profesyonel ve akıcı bir Almanca (Deutsch) diline çevir.";
      else if (revisionType === "translate_tr") instruction = "Bu e-posta taslağını doğal ve akıcı bir Türkçe diline çevir.";

      userPrompt = `${instruction}
Önemli: Doğrudan gönderilmeye hazır revize edilmiş e-posta metnini ver.

Mevcut Taslak:
${draftText || ""}

Bağlamdaki E-posta:
Kimden: ${emailContext?.from || ""}
Konu: ${emailContext?.subject || ""}`;
    } else {
      // General Freeform Chat
      let contextNote = "";
      if (emailContext) {
        contextNote = `[Kullanıcının Seçtiği / Baktığı E-posta Bağlamı]:
Kimden: ${emailContext.from || "Bilinmiyor"} (${emailContext.fromEmail || ""})
Konu: ${emailContext.subject || ""}
Tarih: ${emailContext.date || ""}
İçerik / Özet: ${emailContext.bodyText || emailContext.snippet || ""}
Güvenlik: ${emailContext.classification || "Bilinmiyor"} (Skor: %${emailContext.safetyScore || 0})\n\n`;
      }

      const conversation = messages
        .map((m: any) => `${m.role === "user" ? "Kullanıcı" : "Asistan"}: ${m.content}`)
        .join("\n");

      userPrompt = `${contextNote}${conversation}\nAsistan:`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const replyText = response.text || "Asistan yanıt üretemedi.";

    let draftReply: string | undefined = undefined;
    if (task === "smart_reply" || task === "revise") {
      draftReply = replyText.replace(/^```[a-z]*\n/i, "").replace(/\n```$/, "").trim();
    }

    res.json({
      reply: replyText,
      draftReply,
      task,
    });
  } catch (error: any) {
    console.error("Gemini Assistant error:", error);
    res.status(500).json({
      error: "Yapay zeka asistanı yanıt oluştururken hata oluştu",
      details: error.message || String(error),
    });
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
