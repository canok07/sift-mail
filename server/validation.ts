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
  auth: z.object({
    user: z.string().trim().min(1, 'IMAP kullanıcı adı/e-posta adresi zorunludur.'),
    pass: z.string().min(1, 'IMAP şifresi zorunludur.'),
  }),
});

export const ImapFetchSchema = ImapConnectSchema.extend({
  maxResults: z.coerce.number().int().min(1).max(100).optional().default(15),
});

export const EmailSyncSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.').optional().or(z.literal('')),
  password: z.string().optional().or(z.literal('')),
  host: z.string().trim().max(255).optional().or(z.literal('')),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  maxResults: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const SmtpConnectSchema = z.object({
  host: z.string().trim().min(1, 'SMTP sunucu adresi zorunludur.').max(255),
  port: z.coerce.number().int().min(1).max(65535, 'Geçersiz port numarası.'),
  secure: z.boolean().default(true),
  auth: z.object({
    user: z.string().trim().min(1, 'SMTP kullanıcı adı/e-posta adresi zorunludur.'),
    pass: z.string().min(1, 'SMTP şifresi zorunludur.'),
  }),
});

export const SmtpSendSchema = z.object({
  config: SmtpConnectSchema.optional(),
  smtp: SmtpConnectSchema.optional(),
  mail: z.object({
    to: z.string().trim().min(1, 'Alıcı e-posta adresi zorunludur.').max(500),
    subject: z.string().trim().min(1, 'Konu başlığı boş olamaz.').max(500),
    text: z.string().min(1, 'Mesaj içeriği boş olamaz.').max(200000),
    html: z.string().max(500000).optional(),
    replyTo: z.string().trim().max(500).optional(),
    inReplyTo: z.string().trim().max(500).optional(),
  }),
}).refine(data => Boolean(data.config || data.smtp), {
  message: 'SMTP sunucu ayarları (config veya smtp) zorunludur.',
});

export const EmailItemSchema = z.object({
  id: z.string().or(z.number()).transform(v => String(v)),
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
  emails: z.array(EmailItemSchema).min(1, 'En az 1 e-posta iletilmelidir.').max(50, 'Maksimum 50 e-posta aynı anda analiz edilebilir.'),
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
});

export const TelegramConfigSchema = z.object({
  token: z.string().trim().max(200).optional().default(''),
  chatId: z.string().trim().max(100).optional().default(''),
  ownerChatId: z.string().trim().max(100).optional().default(''),
});

export const TelegramSimulateSchema = z.object({
  command: z.string().trim().max(2000).optional(),
  text: z.string().trim().max(2000).optional(),
}).refine(data => Boolean(data.command || data.text), {
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
      const errorMessage = issue ? `${issue.path.join('.') || 'Girdi'}: ${issue.message}` : 'İstek gövdesi doğrulanamadı.';
      return res.status(400).json({
        success: false,
        error: errorMessage,
        validationErrors: result.error.issues.map(i => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}
