import { EmailAnalysis, EmailMessage } from '../../types';
import { AIProvider, useSettingsStore } from '../../stores/useSettingsStore';
import { safeFetchJson } from '../apiClient';
import { emailBodyForAI } from '../aiPrivacy';
import {
  parseListUnsubscribe,
  extractOrderShippingInfo,
  extractFinanceBillingInfo,
  getOfflineAnalysis,
  saveOfflineAnalysis,
  getAnalysisCacheVersion,
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
    const settings = useSettingsStore.getState();
    if (!settings.aiEnabled) throw new Error('AI_UNAVAILABLE');
    const cacheVersion = getAnalysisCacheVersion();
    const endpoint = config.ollamaEndpoint || settings.ollamaEndpoint;
    const cacheKey = JSON.stringify([email.accountId, email.id, config.provider, endpoint, settings.allowCloudEmailBody]);
    // If offline, attempt cache return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = getOfflineAnalysis(cacheKey);
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
          bodyText: emailBodyForAI(email.bodyText || email.snippet, config.provider, settings.allowCloudEmailBody, endpoint),
          allowCloudEmailBody: settings.allowCloudEmailBody,
          headers: headersCombined,
          provider: config.provider,
          ollamaEndpoint: endpoint,
        }),
      });

      // A request started before consent/account/provider changed cannot repopulate memory.
      if (getAnalysisCacheVersion() !== cacheVersion) throw new Error('AI_REQUEST_SUPERSEDED');

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
      saveOfflineAnalysis(cacheKey, result);
      return result;
    } catch (err: any) {
      // Offline / fallback handling
      if (getAnalysisCacheVersion() !== cacheVersion) throw new Error('AI_REQUEST_SUPERSEDED');
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = getOfflineAnalysis(cacheKey);
        if (cached) return cached;
      }

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
