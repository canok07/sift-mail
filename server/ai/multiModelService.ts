import { GoogleGenAI, Type } from '@google/genai';
import { getVaultSecret } from '../vault';

export interface MultiModelEmailPayload {
  from: string;
  subject: string;
  snippet?: string;
  bodyText?: string;
  headers?: string;
  provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama';
  ollamaEndpoint?: string;
  modelName?: string;
}

const SYSTEM_PROMPT = `Sen e-posta güvenliği, kimlik avı/spam tespiti, otomatik kategorizasyon, kargo takip ve fatura metadata çıkarımı konusunda uzmanlaşmış Sift NLP motorusun.
Cevaplarını her zaman geçerli bir JSON nesnesi olarak ver.

JSON şeması:
{
  "classification": "safe" | "newsletter" | "spam" | "phishing",
  "isSafe": boolean,
  "safetyScore": number (0-100),
  "threatLevel": "none" | "low" | "medium" | "high" | "critical",
  "safeCategory": "work" | "finance" | "shopping" | "official" | "personal" | "travel" | "other",
  "categoryConfidence": number (0-100),
  "isSubscription": boolean,
  "unsubscribeUrl": string (varsa link veya mailto),
  "reasoning": string (Türkçe açıklama),
  "keyFindings": string[] (2-4 madde),
  "suggestedAction": "keep_safe" | "unsubscribe" | "trash" | "block_spam",
  "orderShippingInfo": { "trackingNumber": string, "carrier": string, "estimatedDelivery": string } (varsa),
  "financeBillingInfo": { "dueAmount": string, "dueDate": string } (varsa)
}`;

export async function analyzeWithMultiModel(payload: MultiModelEmailPayload): Promise<any> {
  const provider = payload.provider || 'gemini';

  const userContent = `
E-posta İncelemesi:
Gönderici: ${payload.from || 'Bilinmiyor'}
Konu: ${payload.subject || 'Konusuz'}
Özet/Snippet: ${payload.snippet || ''}
Başlıklar: ${payload.headers || ''}
Gövde Metni: ${(payload.bodyText || payload.snippet || '').slice(0, 3500)}
`;

  switch (provider) {
    case 'openai':
      return analyzeWithOpenAI(userContent);
    case 'anthropic':
      return analyzeWithAnthropic(userContent);
    case 'ollama':
      return analyzeWithOllama(userContent, payload.ollamaEndpoint || 'http://localhost:11434', payload.modelName);
    case 'gemini':
    default:
      return analyzeWithGemini(payload);
  }
}

// 1. Gemini Implementation
async function analyzeWithGemini(payload: MultiModelEmailPayload): Promise<any> {
  const apiKey = getVaultSecret('gemini_custom_api_key') || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
${SYSTEM_PROMPT}

${payload.from ? `Gönderici (From): ${payload.from}` : ''}
${payload.subject ? `Konu (Subject): ${payload.subject}` : ''}
${payload.snippet ? `Snippet: ${payload.snippet}` : ''}
${payload.headers ? `Headers: ${payload.headers}` : ''}
${payload.bodyText ? `Gövde: ${payload.bodyText.slice(0, 3500)}` : ''}
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
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
        required: ['classification', 'isSafe', 'safetyScore', 'safeCategory', 'reasoning', 'suggestedAction'],
      },
    },
  });

  return JSON.parse(response.text || '{}');
}

// 2. OpenAI Implementation
async function analyzeWithOpenAI(userContent: string): Promise<any> {
  const apiKey = getVaultSecret('openai_api_key') || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API anahtarı bulunamadı. Lütfen Ayarlar veya Kasa üzerinden OpenAI API anahtarınızı girin.');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API Hatası (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(rawContent);
}

// 3. Anthropic Implementation
async function analyzeWithAnthropic(userContent: string): Promise<any> {
  const apiKey = getVaultSecret('anthropic_api_key') || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API anahtarı bulunamadı. Lütfen Ayarlar veya Kasa üzerinden Anthropic Claude anahtarınızı girin.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userContent + '\n\nLütfen sadece saf JSON nesnesi olarak yanıt ver, ek metin veya markdown bloğu yazma.',
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API Hatası (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const textContent = data.content?.[0]?.text || '{}';
  const cleanJson = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJson);
}

// 4. Ollama Local REST API Implementation (Default localhost:11434)
async function analyzeWithOllama(userContent: string, endpoint: string, modelName?: string): Promise<any> {
  const targetUrl = `${endpoint.replace(/\/$/, '')}/api/chat`;
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
      throw new Error(`Ollama servisi yanıt vermedi (${res.status}). Model yüklü mü? (örn: 'ollama run ${model}')`);
    }

    const data = await res.json();
    const content = data.message?.content || '{}';
    return JSON.parse(content);
  } catch (err: any) {
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed')) {
      throw new Error(`Ollama yerel servisine bağlanılamadı (${endpoint}). Lütfen terminalinizde 'ollama serve' komutunun çalıştığından emin olun.`);
    }
    throw err;
  }
}
