import { EmailAnalysis, EmailMessage, OrderShippingInfo, FinanceBillingInfo } from '../types';
import { useSettingsStore } from '../stores/useSettingsStore';
import { safeUnsubscribeTarget } from './unsubscribeSafety';

const OFFLINE_ANALYSIS_CACHE_KEY = 'smart_mail_analysis_cache_v2';

// Helper to extract URL from List-Unsubscribe header (e.g. "<https://example.com/unsub>, <mailto:unsub@example.com>")
export function parseListUnsubscribe(headerValue?: string): string {
  return safeUnsubscribeTarget(headerValue) || '';
}

// Analysis is ephemeral. Never retain summaries or drafted replies in browser storage.
const analysisCache = new Map<string, EmailAnalysis>();
let cacheVersion = 0;
export function getAnalysisCacheVersion(): number { return cacheVersion; }
function purgeLegacyAnalysisCache(): void {
  try { globalThis.localStorage?.removeItem(OFFLINE_ANALYSIS_CACHE_KEY); } catch { /* storage unavailable */ }
  try {
    if (typeof caches !== 'undefined') void caches.delete('gemini-nlp-analysis-cache').catch(() => {});
  } catch { /* browser cache unavailable */ }
}
purgeLegacyAnalysisCache();
export function clearOfflineAnalysis(): void {
  cacheVersion += 1;
  analysisCache.clear();
  purgeLegacyAnalysisCache();
}
export function getOfflineAnalysis(key: string): EmailAnalysis | null {
  return analysisCache.get(key) || null;
}
export function saveOfflineAnalysis(key: string, analysis: EmailAnalysis): void {
  analysisCache.delete(key);
  analysisCache.set(key, analysis);
  while (analysisCache.size > 200) analysisCache.delete(analysisCache.keys().next().value!);
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

// Compatibility helpers delegate to the selected provider; there is no second AI pipeline.
export async function analyzeEmailWithGemini(email: EmailMessage): Promise<EmailAnalysis> {
  const { EmailAnalyzerFactory } = await import('./ai/aiFactory');
  const settings = useSettingsStore.getState();
  return EmailAnalyzerFactory.getAnalyzer(settings.aiProvider).analyze(email, {
    provider: settings.aiProvider, ollamaEndpoint: settings.ollamaEndpoint,
  });
}

export async function analyzeBatchEmails(emails: EmailMessage[]): Promise<Record<string, EmailAnalysis>> {
  const result: Record<string, EmailAnalysis> = {};
  for (const email of emails) result[email.id] = await analyzeEmailWithGemini(email);
  return result;
}

// Cache entries must not outlive an account, provider, endpoint or consent change.
useSettingsStore.subscribe((current, previous) => {
  if (current.aiProvider !== previous.aiProvider || current.aiEnabled !== previous.aiEnabled ||
    current.ollamaEndpoint !== previous.ollamaEndpoint ||
    current.allowCloudEmailBody !== previous.allowCloudEmailBody) clearOfflineAnalysis();
});
