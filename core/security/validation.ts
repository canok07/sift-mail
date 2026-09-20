import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ==========================================
// Zod Schemas for Critical Endpoints
// ==========================================

export const VaultSaveSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Anahtar adı boş olamaz.')
    .max(128, 'Anahtar adı çok uzun.')
    .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Anahtar yalnızca harf, rakam, altçizgi, tire veya nokta içerebilir.'),
  value: z.string().min(1, 'Değer boş olamaz.').max(10000, 'Değer boyutu çok büyük.'),
  label: z.string().trim().max(128).optional(),
  category: z
    .enum(['imap_password', 'gemini_api_key', 'smtp_password', 'custom_token', 'telegram'])
    .or(z.string().max(64))
    .optional(),
});

export const ImapConnectSchema = z.object({
  host: z.string().trim().min(1, 'IMAP sunucu adresi zorunludur.').max(255),
  port: z.coerce.number().int().min(1).max(65535, 'Geçersiz port numarası.'),
  secure: z.boolean().default(true),
  auth: z
    .object({
      user: z.string().trim().min(1, 'IMAP kullanıcı adı/e-posta adresi zorunludur.'),
      pass: z.string().optional(),
      accessToken: z.string().optional(),
    })
    .refine((data) => Boolean(data.pass || data.accessToken), {
      message: 'IMAP bağlantısı için şifre veya OAuth erişim belirteci (accessToken) gereklidir.',
    }),
  folder: z.string().max(255).optional(),
  folders: z.array(z.string().max(255)).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  syncAllFolders: z.boolean().optional(),
  accountId: z.string().max(100).optional(),
  provider: z.string().max(50).optional(),
});

export const ImapFetchSchema = ImapConnectSchema.extend({
  maxResults: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const ImapActionSchema = ImapConnectSchema.omit({ folder: true, folders: true, offset: true, syncAllFolders: true }).extend({
  uid: z.coerce.number().int().positive(),
  sourceFolder: z.string().trim().min(1).max(255),
  action: z.enum(['mark_read', 'mark_unread', 'trash', 'archive', 'move']),
  destination: z.string().trim().min(1).max(255).optional(),
});

export const EmailSyncSchema = z.object({
  offset: z.coerce.number().int().min(0).optional(),
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.').optional().or(z.literal('')),
  password: z.string().optional().or(z.literal('')),
  accessToken: z.string().optional(),
  host: z.string().trim().max(255).optional().or(z.literal('')),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  folder: z.string().max(255).optional(),
  accountId: z.string().max(100).optional(),
  provider: z.string().max(50).optional(),
  maxResults: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const SmtpConnectSchema = z.object({
  host: z.string().trim().min(1, 'SMTP sunucu adresi zorunludur.').max(255),
  port: z.coerce.number().int().min(1).max(65535, 'Geçersiz port numarası.'),
  secure: z.boolean().default(true),
  auth: z
    .object({
      user: z.string().trim().min(1, 'SMTP kullanıcı adı/e-posta adresi zorunludur.'),
      pass: z.string().optional(),
      accessToken: z.string().optional(),
      type: z.string().optional(),
    })
    .refine((data) => Boolean(data.pass || data.accessToken), {
      message: 'SMTP bağlantısı için şifre veya OAuth erişim belirteci zorunludur.',
    }),
});

export const SmtpSendSchema = z
  .object({
    config: SmtpConnectSchema.optional(),
    smtp: SmtpConnectSchema.optional(),
    mail: z.object({
      to: z.string().trim().min(1, 'Alıcı e-posta adresi zorunludur.').max(500),
      cc: z.string().trim().max(500).optional(),
      bcc: z.string().trim().max(500).optional(),
      subject: z.string().trim().min(1, 'Konu başlığı boş olamaz.').max(500),
      text: z.string().min(1, 'Mesaj içeriği boş olamaz.').max(200000),
      html: z.string().max(500000).optional(),
      replyTo: z.string().trim().max(500).optional(),
      inReplyTo: z.string().trim().max(500).optional(),
      attachments: z.array(z.object({
        filename: z.string().trim().min(1).max(255),
        content: z.string().min(1).max(40_000_000),
        encoding: z.literal('base64').optional(),
        contentType: z.string().trim().max(200).optional(),
      })).max(20).optional(),
    }),
  })
  .refine((data) => Boolean(data.config || data.smtp), {
    message: 'SMTP sunucu ayarları (config veya smtp) zorunludur.',
  });

// Microsoft OAuth schemas
export const MicrosoftAuthUrlSchema = z.object({
  redirectUri: z.string().min(1, 'redirectUri zorunludur.'),
  customClientId: z.string().trim().max(200).optional(),
});

export const MicrosoftCallbackSchema = z.object({
  code: z.string().min(1, 'Yetkilendirme kodu (code) zorunludur.'),
  redirectUri: z.string().min(1, 'redirectUri zorunludur.'),
  state: z.string().optional(),
  codeVerifier: z.string().optional(),
  customClientId: z.string().trim().max(200).optional(),
});

export const MicrosoftRefreshSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi gereklidir.'),
  customClientId: z.string().trim().max(200).optional(),
});

// AI Configuration and Testing schemas
export const AiTestConnectionSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']),
  apiKey: z.string().trim().max(500).optional(),
  endpoint: z.string().trim().max(500).optional(),
  model: z.string().trim().max(100).optional(),
});

export const AiSaveConfigSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']),
  apiKey: z.string().trim().max(500).optional(),
  endpoint: z.string().trim().max(500).optional(),
  model: z.string().trim().max(100).optional(),
  enabled: z.boolean().optional().default(true),
  isDefault: z.boolean().optional(),
});

export const PluginConfigureSchema = z.object({
  apiKey: z.string().trim().max(500).optional(),
  endpoint: z.string().trim().url().max(500).optional(),
  model: z.string().trim().max(100).optional(),
});
export const DecisionRequestSchema = z.object({
  provider: z.enum(['sift-local', 'jev']).default('sift-local'),
  input: z.object({
    senderDomain: z.string().trim().max(255).optional(), subject: z.string().max(1000).optional(),
    snippet: z.string().max(2000).optional(), existingLabels: z.array(z.string().max(100)).max(50).optional(),
  }),
});

export const EmailItemSchema = z.object({
  id: z.string().or(z.number()).transform((v) => String(v)),
  subject: z.string().default('Konusuz'),
  from: z.string().default('Bilinmeyen'),
  fromName: z.string().optional(),
  fromEmail: z.string().optional(),
  date: z.string().optional(),
  snippet: z.string().optional().default(''),
  body: z.string().optional(),
  bodyText: z.string().optional(),
  isPhishing: z.boolean().optional(),
  category: z.string().optional(),
});

export const AnalyzeEmailSchema = z.object({
  email: EmailItemSchema,
  model: z.string().trim().max(100).optional(),
  provider: z.string().trim().max(50).optional(),
  customApiKey: z.string().trim().max(500).optional(),
});

export const AnalyzeBatchSchema = z.object({
  emails: z
    .array(EmailItemSchema)
    .min(1, 'En az 1 e-posta iletilmelidir.')
    .max(50, 'Maksimum 50 e-posta aynı anda analiz edilebilir.'),
  model: z.string().trim().max(100).optional(),
  provider: z.string().trim().max(50).optional(),
  customApiKey: z.string().trim().max(500).optional(),
});

export const AiAnalyzeSchema = z.object({
  subject: z.string().max(1000).optional().default(''),
  from: z.string().max(500).optional().default(''),
  snippet: z.string().max(10000).optional().default(''),
  bodyText: z.string().max(300000).optional().default(''),
  body: z.string().max(300000).optional().default(''),
  headers: z.string().max(20000).optional().default(''),
  provider: z.string().max(100).optional(),
  ollamaEndpoint: z.string().max(500).optional(),
  modelName: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
});

// Common AI Output Validation Schema (Satisfies Requirement 4 & 5)
export const AiAnalysisResultSchema = z.object({
  summary: z.string().default(''),
  category: z.string().default('other'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  phishingRisk: z.enum(['safe', 'suspicious', 'dangerous']).default('safe'),
  classification: z.enum(['safe', 'newsletter', 'spam', 'phishing']).default('safe'),
  isSafe: z.boolean().default(true),
  safetyScore: z.number().min(0).max(100).default(80),
  threatLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']).default('none'),
  safeCategory: z
    .enum(['work', 'finance', 'shopping', 'official', 'personal', 'travel', 'other'])
    .default('other'),
  categoryConfidence: z.number().min(0).max(100).optional().default(85),
  isSubscription: z.boolean().default(false),
  unsubscribeUrl: z.string().default(''),
  reasoning: z.string().default(''),
  keyFindings: z.array(z.string()).default([]),
  suggestedAction: z
    .enum(['keep_safe', 'reply', 'unsubscribe', 'trash', 'block_spam'])
    .default('keep_safe'),
  draftReply: z.string().default(''),
  suggestedFilterRule: z
    .object({
      patternType: z.enum(['from', 'subject', 'domain']),
      patternValue: z.string(),
      description: z.string(),
    })
    .optional(),
});

export const AssistantChatSchema = z.object({
  messages: z.array(z.record(z.string(), z.any())).optional(),
  emailContext: z.record(z.string(), z.any()).optional(),
  task: z.string().optional(),
  replyIntent: z.string().optional(),
  revisionType: z.string().optional(),
  draftText: z.string().optional(),
  message: z.string().optional(),
  context: z.record(z.string(), z.any()).optional(),
  history: z.array(z.record(z.string(), z.any())).optional(),
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']).optional(),
  ollamaEndpoint: z.string().trim().max(500).optional(),
  model: z.string().trim().max(100).optional(),
});

export const TelegramConfigSchema = z.object({
  token: z.string().trim().max(200).optional().default(''),
  chatId: z.string().trim().max(100).optional().default(''),
  ownerChatId: z.string().trim().max(100).optional().default(''),
});

export const TelegramSimulateSchema = z
  .object({
    command: z.string().trim().max(2000).optional(),
    text: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Boolean(data.command || data.text), {
    message: 'Komut gereklidir.',
  });

/**
 * Express middleware helper to validate request body using a Zod schema.
 * Formats validation errors into clear, friendly JSON responses.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const errorMessage = issue
        ? `${issue.path.join('.') || 'Girdi'}: ${issue.message}`
        : 'İstek gövdesi doğrulanamadı.';
      return res.status(400).json({
        success: false,
        error: errorMessage,
        validationErrors: result.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}
