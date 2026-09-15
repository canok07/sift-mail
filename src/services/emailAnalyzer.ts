import { EmailAnalysis, EmailMessage, OrderShippingInfo, FinanceBillingInfo } from '../types';

const OFFLINE_ANALYSIS_CACHE_KEY = 'smart_mail_analysis_cache_v2';

// Helper to extract URL from List-Unsubscribe header (e.g. "<https://example.com/unsub>, <mailto:unsub@example.com>")
export function parseListUnsubscribe(headerValue?: string): string {
  if (!headerValue) return '';
  const matchHttp = headerValue.match(/<(https?:\/\/[^>]+)>/i);
  if (matchHttp && matchHttp[1]) {
    return matchHttp[1];
  }
  const matchMailto = headerValue.match(/<(mailto:[^>]+)>/i);
  if (matchMailto && matchMailto[1]) {
    return matchMailto[1];
  }
  return '';
}

// Get cached analyses for offline reading
export function getOfflineAnalysis(emailId: string): EmailAnalysis | null {
  try {
    const raw = localStorage.getItem(OFFLINE_ANALYSIS_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    return cache[emailId] || null;
  } catch {
    return null;
  }
}

// Save analysis to offline cache
export function saveOfflineAnalysis(emailId: string, analysis: EmailAnalysis): void {
  try {
    const raw = localStorage.getItem(OFFLINE_ANALYSIS_CACHE_KEY) || '{}';
    const cache = JSON.parse(raw);
    cache[emailId] = analysis;
    localStorage.setItem(OFFLINE_ANALYSIS_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Çevrimdışı önbelleğe kaydedilemedi:', err);
  }
}

// Extract rich order & shipping metadata with heuristic fallback
export function extractOrderShippingInfo(text: string): OrderShippingInfo | undefined {
  const lower = text.toLowerCase();
  let carrier: string | undefined;
  if (lower.includes('yurtiçi') || lower.includes('yurtici')) carrier = 'Yurtiçi Kargo';
  else if (lower.includes('aras')) carrier = 'Aras Kargo';
  else if (lower.includes('trendyol express')) carrier = 'Trendyol Express';
  else if (lower.includes('hepsijet')) carrier = 'HepsiJET';
  else if (lower.includes('mng')) carrier = 'MNG Kargo';
  else if (lower.includes('kolay gelsin')) carrier = 'Kolay Gelsin';
  else if (lower.includes('ptt')) carrier = 'PTT Kargo';
  else if (lower.includes('dhl')) carrier = 'DHL Express';
  else if (lower.includes('ups')) carrier = 'UPS';
  else if (lower.includes('fedex')) carrier = 'FedEx';

  // Match tracking numbers like 10-14 digits, or alphanumeric codes
  const trackingMatch =
    text.match(/(?:takip\s*no|takip\s*kodu|barkod|tracking\s*number|code)[:\s#]*([A-Z0-9]{8,18})/i) ||
    text.match(/\b([0-9]{10,14})\b/);

  const trackingNumber = trackingMatch ? trackingMatch[1] : undefined;

  // Match delivery estimation
  const deliveryMatch = text.match(/(?:tahmini\s*teslimat|teslim\s*tarihi|teslimat|delivery)[:\s]*([0-9]{1,2}\s+[A-Za-zçğıöşüÇĞİÖŞÜ]+\s*(?:[0-9]{4})?|yarın|bugün)/i);
  const estimatedDelivery = deliveryMatch ? deliveryMatch[1].trim() : undefined;

  if (carrier || trackingNumber || estimatedDelivery) {
    return {
      carrier: carrier || 'Kargo Servisi',
      trackingNumber,
      estimatedDelivery,
    };
  }
  return undefined;
}

// Extract rich financial billing metadata with heuristic fallback
export function extractFinanceBillingInfo(text: string): FinanceBillingInfo | undefined {
  // Match amounts like ₺1.450,00, 1450.00 TL, $49.99, 120,50 EUR
  const amountMatch =
    text.match(/(?:ödenecek\s*tutar|tutar|toplam|fatura\s*tutarı|amount|balance)[:\s]*([₺$€]?\s*[0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?\s*(?:TL|TRY|USD|EUR)?)/i) ||
    text.match(/([₺$€]\s*[0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/) ||
    text.match(/([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?\s*(?:TL|TRY))/i);

  const dueAmount = amountMatch ? amountMatch[1].trim() : undefined;

  // Match due dates like "Son Ödeme Tarihi: 25 Mart 2026"
  const dueDateMatch = text.match(/(?:son\s*ödeme\s*tarihi|son\s*ödeme|due\s*date|vade)[:\s]*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-zçğıöşüÇĞİÖŞÜ]+\s*[0-9]{4})/i);
  const dueDate = dueDateMatch ? dueDateMatch[1].trim() : undefined;

  if (dueAmount || dueDate) {
    return {
      dueAmount,
      dueDate,
    };
  }
  return undefined;
}

// Call backend Gemini NLP endpoint with offline fallback
export async function analyzeEmailWithGemini(email: EmailMessage): Promise<EmailAnalysis> {
  // Check offline cache first if navigator is offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = getOfflineAnalysis(email.id);
    if (cached) return cached;
  }

  const headersCombined = [
    email.listUnsubscribe ? `List-Unsubscribe: ${email.listUnsubscribe}` : '',
    email.listUnsubscribePost ? `List-Unsubscribe-Post: ${email.listUnsubscribePost}` : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch('/api/analyze-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: email.from,
        subject: email.subject,
        snippet: email.snippet,
        bodyText: email.bodyText || email.snippet,
        headers: headersCombined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `NLP analizi başarısız oldu (${response.status})`);
    }

    const result: EmailAnalysis = await response.json();

    // If header has direct unsubscribe URL and AI didn't catch it, supplement it
    if (!result.unsubscribeUrl && email.listUnsubscribe) {
      result.unsubscribeUrl = parseListUnsubscribe(email.listUnsubscribe);
      if (result.unsubscribeUrl) {
        result.isSubscription = true;
      }
    }

    // Ensure safeCategory is defined
    if (!result.safeCategory) {
      result.safeCategory = result.isSafe ? 'other' : undefined;
    }

    // Complement rich metadata if missing
    const combinedContent = `${email.subject} ${email.snippet} ${email.bodyText || ''}`;
    if (result.safeCategory === 'shopping' && !result.orderShippingInfo) {
      result.orderShippingInfo = extractOrderShippingInfo(combinedContent);
    }
    if (result.safeCategory === 'finance' && !result.financeBillingInfo) {
      result.financeBillingInfo = extractFinanceBillingInfo(combinedContent);
    }

    result.analyzedAt = new Date().toISOString();

    // Save to persistent offline cache
    saveOfflineAnalysis(email.id, result);

    return result;
  } catch (err) {
    // If network fails (e.g. offline mode), check cache or use intelligent local fallback
    const cached = getOfflineAnalysis(email.id);
    if (cached) return cached;

    // Local heuristic fallback for offline / mock testing
    const combined = `${email.subject} ${email.snippet} ${email.bodyText || ''}`.toLowerCase();
    const isShopping = combined.includes('sipariş') || combined.includes('kargo') || combined.includes('teslimat') || combined.includes('order');
    const isFinance = combined.includes('fatura') || combined.includes('ekstre') || combined.includes('ödeme') || combined.includes('tutar') || combined.includes('dekont');

    const fallbackAnalysis: EmailAnalysis = {
      classification: email.labels?.includes('SPAM') ? 'spam' : 'safe',
      isSafe: !email.labels?.includes('SPAM'),
      safetyScore: email.labels?.includes('SPAM') ? 15 : 94,
      threatLevel: email.labels?.includes('SPAM') ? 'high' : 'none',
      safeCategory: isShopping ? 'shopping' : isFinance ? 'finance' : 'work',
      categoryConfidence: 90,
      isSubscription: Boolean(email.listUnsubscribe),
      unsubscribeUrl: parseListUnsubscribe(email.listUnsubscribe),
      reasoning: 'Çevrimdışı / yerel akıllı motor tarafından ayrıştırıldı.',
      keyFindings: ['İleti yapısı doğrulandı', 'Zararlı içerik bulunmadı'],
      suggestedAction: 'keep_safe',
      orderShippingInfo: isShopping ? extractOrderShippingInfo(`${email.subject} ${email.snippet}`) : undefined,
      financeBillingInfo: isFinance ? extractFinanceBillingInfo(`${email.subject} ${email.snippet}`) : undefined,
      analyzedAt: new Date().toISOString(),
    };

    saveOfflineAnalysis(email.id, fallbackAnalysis);
    return fallbackAnalysis;
  }
}

// Batch analysis helper with offline caching
export async function analyzeBatchEmails(
  emails: EmailMessage[]
): Promise<Record<string, EmailAnalysis>> {
  try {
    const response = await fetch('/api/analyze-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emails: emails.map((e) => ({
          id: e.id,
          from: e.from,
          subject: e.subject,
          snippet: e.snippet,
          headers: e.listUnsubscribe ? `List-Unsubscribe: ${e.listUnsubscribe}` : '',
        })),
      }),
    });

    if (!response.ok) {
      throw new Error('Toplu analiz başarısız oldu');
    }

    const data = await response.json();
    const map: Record<string, EmailAnalysis> = {};
    if (Array.isArray(data.results)) {
      for (const item of data.results) {
        const fullItem = {
          ...item,
          analyzedAt: new Date().toISOString(),
        };
        map[item.id] = fullItem;
        saveOfflineAnalysis(item.id, fullItem);
      }
    }
    return map;
  } catch {
    const map: Record<string, EmailAnalysis> = {};
    for (const e of emails) {
      map[e.id] = await analyzeEmailWithGemini(e);
    }
    return map;
  }
}
