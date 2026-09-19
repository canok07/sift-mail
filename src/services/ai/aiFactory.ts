import { EmailAnalysis, EmailMessage } from '../../types';
import { AIProvider } from '../../stores/useSettingsStore';
import { safeFetchJson } from '../apiClient';
import {
  parseListUnsubscribe,
  extractOrderShippingInfo,
  extractFinanceBillingInfo,
  getOfflineAnalysis,
  saveOfflineAnalysis,
} from '../emailAnalyzer';

export interface IEmailAnalyzer {
  analyze(
    email: EmailMessage,
    config: { provider: AIProvider; ollamaEndpoint?: string }
  ): Promise<EmailAnalysis>;
}

// 1. Unified Dispatcher using Backend Multi-Model Service
class UnifiedMultiModelAnalyzer implements IEmailAnalyzer {
  async analyze(
    email: EmailMessage,
    config: { provider: AIProvider; ollamaEndpoint?: string }
  ): Promise<EmailAnalysis> {
    // If offline, attempt cache return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = getOfflineAnalysis(email.id);
      if (cached) return cached;
    }

    const headersCombined = [
      email.listUnsubscribe ? `List-Unsubscribe: ${email.listUnsubscribe}` : '',
      email.listUnsubscribePost ? `List-Unsubscribe-Post: ${email.listUnsubscribePost}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const result = await safeFetchJson<EmailAnalysis>('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: email.from,
          subject: email.subject,
          snippet: email.snippet,
          bodyText: email.bodyText || email.snippet,
          headers: headersCombined,
          provider: config.provider,
          ollamaEndpoint: config.ollamaEndpoint || 'http://localhost:11434',
        }),
      });

      // Post-process metadata
      if (!result.unsubscribeUrl && email.listUnsubscribe) {
        result.unsubscribeUrl = parseListUnsubscribe(email.listUnsubscribe);
        if (result.unsubscribeUrl) {
          result.isSubscription = true;
        }
      }

      if (!result.safeCategory) {
        result.safeCategory = result.isSafe ? 'other' : undefined;
      }

      const combinedContent = `${email.subject} ${email.snippet} ${email.bodyText || ''}`;
      if (result.safeCategory === 'shopping' && !result.orderShippingInfo) {
        result.orderShippingInfo = extractOrderShippingInfo(combinedContent);
      }
      if (result.safeCategory === 'finance' && !result.financeBillingInfo) {
        result.financeBillingInfo = extractFinanceBillingInfo(combinedContent);
      }

      result.analyzedAt = new Date().toISOString();
      saveOfflineAnalysis(email.id, result);
      return result;
    } catch (err: any) {
      // Offline / fallback handling
      const cached = getOfflineAnalysis(email.id);
      if (cached) return cached;

      console.warn(`[AIFactory] ${config.provider} isteği yerel motora aktarıldı:`, err.message);

      const combined = `${email.subject} ${email.snippet} ${email.bodyText || ''}`.toLowerCase();
      const isShopping =
        combined.includes('sipariş') || combined.includes('kargo') || combined.includes('order');
      const isFinance =
        combined.includes('fatura') || combined.includes('ekstre') || combined.includes('ödeme');

      throw new Error('AI analizi tamamlanamadı. Sağlayıcı bağlantısını ve API anahtarını kontrol edin.');
    }
  }
}

// 2. Factory Pattern Implementation
export class EmailAnalyzerFactory {
  private static instanceMap: Partial<Record<AIProvider, IEmailAnalyzer>> = {};

  public static getAnalyzer(provider: AIProvider): IEmailAnalyzer {
    if (!this.instanceMap[provider]) {
      this.instanceMap[provider] = new UnifiedMultiModelAnalyzer();
    }
    return this.instanceMap[provider]!;
  }
}

// Global invocation helper
export async function analyzeEmailWithProvider(
  email: EmailMessage,
  provider: AIProvider = 'gemini',
  ollamaEndpoint?: string
): Promise<EmailAnalysis> {
  const analyzer = EmailAnalyzerFactory.getAnalyzer(provider);
  return analyzer.analyze(email, { provider, ollamaEndpoint });
}
