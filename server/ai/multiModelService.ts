import { GoogleGenAI, Type } from '@google/genai';
import { getVaultSecret, saveVaultSecret } from '../vault';
import { AiAnalysisResultSchema } from '../validation';

export interface MultiModelEmailPayload {
  from: string;
  subject: string;
  snippet?: string;
  bodyText?: string;
  headers?: string;
  provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
  ollamaEndpoint?: string;
  modelName?: string;
  customApiKey?: string;
}

const SYSTEM_PROMPT = `Sen e-posta güvenliği, kimlik avı/spam tespiti, otomatik kategorizasyon, öncelik belirleme ve yanıt taslağı hazırlama konusunda uzmanlaşmış Sift Akıllı Posta Motorusun.
Cevaplarını HER ZAMAN geçerli ve saf bir JSON nesnesi olarak ver.

İstenen JSON Yapısı:
{
  "summary": "İletinin Türkçe 1-2 cümlelik net ve bilgilendirici özeti",
  "category": "work" | "finance" | "shopping" | "official" | "personal" | "travel" | "other",
  "priority": "low" | "medium" | "high" | "urgent",
  "phishingRisk": "safe" | "suspicious" | "dangerous",
  "classification": "safe" | "newsletter" | "spam" | "phishing",
  "isSafe": boolean,
  "safetyScore": number (0-100),
  "threatLevel": "none" | "low" | "medium" | "high" | "critical",
  "safeCategory": "work" | "finance" | "shopping" | "official" | "personal" | "travel" | "other",
  "categoryConfidence": number (0-100),
  "isSubscription": boolean,
  "unsubscribeUrl": string (varsa bağlantı veya mailto),
  "reasoning": string (analiz gerekçesi),
  "keyFindings": string[] (tespit edilen 2-4 önemli nokta),
  "suggestedAction": "keep_safe" | "reply" | "unsubscribe" | "trash" | "block_spam",
  "draftReply": string (kullanıcının gönderebileceği nazik ve profesyonel Türkçe yanıt taslağı, gerek yoksa boş string)
}`;

/**
 * Normalizes and validates AI output against AiAnalysisResultSchema
 */
export function normalizeAiResult(raw: any, fallbackSubject: string = ''): any {
  const safeData: any = {
    summary: raw.summary || (raw.reasoning ? raw.reasoning.slice(0, 150) : fallbackSubject || 'E-posta incelendi.'),
    category: raw.category || raw.safeCategory || 'other',
    priority: ['low', 'medium', 'high', 'urgent'].includes(raw.priority) ? raw.priority : 'medium',
    phishingRisk: ['safe', 'suspicious', 'dangerous'].includes(raw.phishingRisk)
      ? raw.phishingRisk
      : raw.classification === 'phishing'
      ? 'dangerous'
      : raw.classification === 'spam'
      ? 'suspicious'
      : 'safe',
    classification: ['safe', 'newsletter', 'spam', 'phishing'].includes(raw.classification)
      ? raw.classification
      : raw.isSafe === false
      ? 'spam'
      : 'safe',
    isSafe: typeof raw.isSafe === 'boolean' ? raw.isSafe : true,
    safetyScore: typeof raw.safetyScore === 'number' ? Math.max(0, Math.min(100, raw.safetyScore)) : 85,
    threatLevel: ['none', 'low', 'medium', 'high', 'critical'].includes(raw.threatLevel)
      ? raw.threatLevel
      : 'none',
    safeCategory: ['work', 'finance', 'shopping', 'official', 'personal', 'travel', 'other'].includes(
      raw.safeCategory || raw.category
    )
      ? raw.safeCategory || raw.category
      : 'other',
    categoryConfidence: typeof raw.categoryConfidence === 'number' ? raw.categoryConfidence : 85,
    isSubscription: Boolean(raw.isSubscription),
    unsubscribeUrl: typeof raw.unsubscribeUrl === 'string' ? raw.unsubscribeUrl : '',
    reasoning: raw.reasoning || 'Kural motoru ve dil modeli tarafından analiz tamamlandı.',
    keyFindings: Array.isArray(raw.keyFindings) ? raw.keyFindings : ['İleti tarandı'],
    suggestedAction: ['keep_safe', 'reply', 'unsubscribe', 'trash', 'block_spam'].includes(raw.suggestedAction)
      ? raw.suggestedAction
      : 'keep_safe',
    draftReply: typeof raw.draftReply === 'string' ? raw.draftReply : '',
  };

  const parsed = AiAnalysisResultSchema.safeParse(safeData);
  if (parsed.success) {
    return parsed.data;
  }
  return safeData;
}

export async function analyzeWithMultiModel(payload: MultiModelEmailPayload): Promise<any> {
  const provider = payload.provider || 'gemini';

  const userContent = `
E-posta Analiz Talebi:
Gönderici: ${payload.from || 'Bilinmiyor'}
Konu: ${payload.subject || 'Konusuz'}
Özet / Snippet: ${payload.snippet || ''}
Başlıklar (Headers): ${payload.headers || ''}
Gövde Metni: ${(payload.bodyText || payload.snippet || '').slice(0, 3500)}
`;

  let rawResult: any = {};

  switch (provider) {
    case 'openai':
      rawResult = await analyzeWithOpenAI(userContent, payload.customApiKey, payload.modelName);
      break;
    case 'anthropic':
      rawResult = await analyzeWithAnthropic(userContent, payload.customApiKey, payload.modelName);
      break;
    case 'ollama':
      rawResult = await analyzeWithOllama(
        userContent,
        payload.ollamaEndpoint || 'http://localhost:11434',
        payload.modelName
      );
      break;
    case 'gemini':
    default:
      rawResult = await analyzeWithGemini(payload);
      break;
  }

  return normalizeAiResult(rawResult, payload.subject);
}

// 1. Gemini Implementation
async function analyzeWithGemini(payload: MultiModelEmailPayload): Promise<any> {
  const apiKey =
    payload.customApiKey ||
    getVaultSecret('gemini_custom_api_key') ||
    process.env.GEMINI_API_KEY ||
    '';

  if (!apiKey) {
    throw new Error('Gemini API anahtarı bulunamadı. Lütfen Ayarlar üzerinden Gemini API anahtarınızı girin.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = payload.modelName || 'gemini-2.5-flash';

  const prompt = `
${SYSTEM_PROMPT}

${payload.from ? `Gönderici: ${payload.from}` : ''}
${payload.subject ? `Konu: ${payload.subject}` : ''}
${payload.snippet ? `Snippet: ${payload.snippet}` : ''}
${payload.headers ? `Headers: ${payload.headers}` : ''}
${payload.bodyText ? `Gövde: ${payload.bodyText.slice(0, 3500)}` : ''}
`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          category: { type: Type.STRING },
          priority: { type: Type.STRING },
          phishingRisk: { type: Type.STRING },
          classification: { type: Type.STRING },
          isSafe: { type: Type.BOOLEAN },
          safetyScore: { type: Type.INTEGER },
          threatLevel: { type: Type.STRING },
          safeCategory: { type: Type.STRING },
          categoryConfidence: { type: Type.INTEGER },
          isSubscription: { type: Type.BOOLEAN },
          unsubscribeUrl: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          keyFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedAction: { type: Type.STRING },
          draftReply: { type: Type.STRING },
        },
        required: [
          'summary',
          'category',
          'priority',
          'phishingRisk',
          'classification',
          'isSafe',
          'safetyScore',
          'safeCategory',
          'reasoning',
          'suggestedAction',
        ],
      },
    },
  });

  return JSON.parse(response.text || '{}');
}

// 2. OpenAI Implementation
async function analyzeWithOpenAI(
  userContent: string,
  customApiKey?: string,
  modelName?: string
): Promise<any> {
  const apiKey = customApiKey || getVaultSecret('openai_api_key') || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API anahtarı bulunamadı. Lütfen Ayarlar üzerinden OpenAI API anahtarınızı girin.');
  }

  const model = modelName || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const msg = errorData?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) {
      throw new Error('OpenAI kimlik doğrulaması başarısız: Geçersiz API anahtarı.');
    }
    if (res.status === 429) {
      throw new Error('OpenAI kullanım kotası veya rate limit aşıldı.');
    }
    throw new Error(`OpenAI API Hatası (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(rawContent);
}

// 3. Anthropic Implementation
async function analyzeWithAnthropic(
  userContent: string,
  customApiKey?: string,
  modelName?: string
): Promise<any> {
  const apiKey = customApiKey || getVaultSecret('anthropic_api_key') || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API anahtarı bulunamadı. Lütfen Ayarlar üzerinden Claude API anahtarınızı girin.');
  }

  const model = modelName || 'claude-3-5-haiku-20241022';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userContent + '\n\nLütfen yalnızca geçerli saf JSON nesnesi döndür.',
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const msg = errorData?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) {
      throw new Error('Anthropic kimlik doğrulaması başarısız: Geçersiz x-api-key.');
    }
    if (res.status === 429) {
      throw new Error('Anthropic kullanım kotası veya rate limit aşıldı.');
    }
    throw new Error(`Anthropic API Hatası (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const textContent = data.content?.[0]?.text || '{}';
  const cleanJson = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJson);
}

// 4. Ollama Implementation
async function analyzeWithOllama(
  userContent: string,
  endpoint: string,
  modelName?: string
): Promise<any> {
  const cleanEndpoint = (endpoint || 'http://localhost:11434').replace(/\/$/, '');
  const targetUrl = `${cleanEndpoint}/api/chat`;
  const model = modelName || 'llama3';

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        format: 'json',
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 404 || errText.includes('not found')) {
        throw new Error(`Ollama model '${model}' bulunamadı. Lütfen terminalde 'ollama pull ${model}' çalıştırın.`);
      }
      throw new Error(`Ollama hatası (${res.status}): ${errText || 'Servis yanıt vermedi'}`);
    }

    const data = await res.json();
    const content = data.message?.content || '{}';
    return JSON.parse(content);
  } catch (err: any) {
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed')) {
      throw new Error(
        `Ollama yerel servisine (${cleanEndpoint}) bağlanılamadı. Lütfen terminalde 'ollama serve' komutunu çalıştırın.`
      );
    }
    throw err;
  }
}

/**
 * Tests connection to a specific AI provider with clear and actionable error messages
 */
export async function testAiProviderConnection(params: {
  provider: 'gemini' | 'openai' | 'anthropic' | 'ollama';
  apiKey?: string;
  endpoint?: string;
  model?: string;
}): Promise<{ success: boolean; message: string; details?: any }> {
  const { provider, apiKey, endpoint, model } = params;

  try {
    switch (provider) {
      case 'gemini': {
        const key = apiKey || getVaultSecret('gemini_custom_api_key') || process.env.GEMINI_API_KEY;
        if (!key) {
          return { success: false, message: 'Gemini API anahtarı boş olamaz.' };
        }
        const ai = new GoogleGenAI({ apiKey: key });
        const res = await ai.models.generateContent({
          model: model || 'gemini-2.5-flash',
          contents: 'Ping',
        });
        if (res.text) {
          return { success: true, message: 'Google Gemini bağlantısı başarılı!' };
        }
        return { success: false, message: 'Gemini yanıtı alınamadı.' };
      }

      case 'openai': {
        const key = apiKey || getVaultSecret('openai_api_key') || process.env.OPENAI_API_KEY;
        if (!key) {
          return { success: false, message: 'OpenAI API anahtarı boş olamaz.' };
        }
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.status === 401) {
          return { success: false, message: 'OpenAI API anahtarı geçersiz (401 Unauthorized).' };
        }
        if (res.status === 429) {
          return { success: false, message: 'OpenAI hesap kotası aşıldı (429 Rate Limit/Quota).' };
        }
        if (!res.ok) {
          return { success: false, message: `OpenAI sunucusu hata verdi (${res.status}).` };
        }
        return { success: true, message: 'OpenAI GPT bağlantısı başarıyla doğrulandı!' };
      }

      case 'anthropic': {
        const key = apiKey || getVaultSecret('anthropic_api_key') || process.env.ANTHROPIC_API_KEY;
        if (!key) {
          return { success: false, message: 'Anthropic API anahtarı boş olamaz.' };
        }
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model || 'claude-3-5-haiku-20241022',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        if (res.status === 401) {
          return { success: false, message: 'Anthropic Claude API anahtarı geçersiz (401).' };
        }
        if (res.status === 429) {
          return { success: false, message: 'Anthropic kota limiti aşıldı (429).' };
        }
        if (!res.ok) {
          return { success: false, message: `Anthropic servisi hata verdi (${res.status}).` };
        }
        return { success: true, message: 'Anthropic Claude bağlantısı başarıyla doğrulandı!' };
      }

      case 'ollama': {
        const cleanEp = (endpoint || 'http://localhost:11434').replace(/\/$/, '');
        const res = await fetch(`${cleanEp}/api/tags`).catch(() => null);
        if (!res) {
          return {
            success: false,
            message: `Ollama servisine (${cleanEp}) erişilemedi. Terminalde 'ollama serve' çalıştırıldığından emin olun.`,
          };
        }
        if (!res.ok) {
          return { success: false, message: `Ollama servisi yanıt vermedi (${res.status}).` };
        }
        const data = await res.json().catch(() => ({ models: [] }));
        const installedModels = (data.models || []).map((m: any) => m.name);
        return {
          success: true,
          message: `Ollama bağlantısı başarılı! Yüklü modeller: ${installedModels.slice(0, 3).join(', ') || 'Yok'}`,
          details: { models: installedModels },
        };
      }
    }
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Sağlayıcıya bağlanırken beklenmeyen hata oluştu.',
    };
  }
}

/**
 * Returns configuration status of all AI providers without leaking any secrets
 */
export function getAiProvidersStatus(): Record<
  string,
  { configured: boolean; source: 'vault' | 'env' | 'none'; defaultModel: string }
> {
  const geminiVault = Boolean(getVaultSecret('gemini_custom_api_key'));
  const geminiEnv = Boolean(process.env.GEMINI_API_KEY);

  const openaiVault = Boolean(getVaultSecret('openai_api_key'));
  const openaiEnv = Boolean(process.env.OPENAI_API_KEY);

  const anthropicVault = Boolean(getVaultSecret('anthropic_api_key'));
  const anthropicEnv = Boolean(process.env.ANTHROPIC_API_KEY);
  const ollamaVault = Boolean(getVaultSecret('ollama_endpoint'));

  return {
    gemini: {
      configured: geminiVault || geminiEnv,
      source: geminiVault ? 'vault' : geminiEnv ? 'env' : 'none',
      defaultModel: 'gemini-2.5-flash',
    },
    openai: {
      configured: openaiVault || openaiEnv,
      source: openaiVault ? 'vault' : openaiEnv ? 'env' : 'none',
      defaultModel: 'gpt-4o-mini',
    },
    anthropic: {
      configured: anthropicVault || anthropicEnv,
      source: anthropicVault ? 'vault' : anthropicEnv ? 'env' : 'none',
      defaultModel: 'claude-3-5-haiku-20241022',
    },
    ollama: {
      configured: ollamaVault,
      source: ollamaVault ? 'vault' : 'none',
      defaultModel: 'llama3',
    },
  };
}
