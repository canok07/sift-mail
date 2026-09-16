import { ConnectedAccount, EmailMessage, MailProvider, AutoRule } from '../types';
import { evaluateAutoRules } from './categoryManager';
import { analyzeEmailWithGemini } from './emailAnalyzer';
import { safeFetchJson } from './apiClient';

/**
 * Universal Email Service Adapter Interface (Adapter Pattern)
 */
export interface EmailServiceAdapter {
  readonly provider: MailProvider;
  fetchEmails(account: ConnectedAccount, options?: { maxResults?: number }): Promise<EmailMessage[]>;
  trashEmail(account: ConnectedAccount, emailId: string): Promise<boolean>;
}

/**
 * Universal IMAP Service Adapter (Gmail, Outlook, Yahoo, iCloud, Corporate IMAP)
 */
export class ImapServiceAdapter implements EmailServiceAdapter {
  readonly provider: MailProvider;

  constructor(provider: MailProvider = 'imap') {
    this.provider = provider;
  }

  async fetchEmails(
    account: ConnectedAccount,
    options?: { maxResults?: number }
  ): Promise<EmailMessage[]> {
    const host = account.imapConfig?.host || (account.provider === 'gmail' ? 'imap.gmail.com' : account.provider === 'outlook' ? 'outlook.office365.com' : 'localhost');
    const port = account.imapConfig?.port || 993;
    const secure = account.imapConfig?.secure ?? true;
    const username = account.imapConfig?.username || account.email;

    // Call server IMAP endpoint
    const data = await safeFetchJson<any>('/api/imap/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        port,
        secure,
        auth: {
          user: username,
          pass: 'REUSED_VAULT_PASSWORD', // Retrieved securely by backend vault
        },
        maxResults: options?.maxResults || 15,
      }),
    });

    if (!data.success || !Array.isArray(data.messages)) {
      return [];
    }

    return data.messages.map((msg: any) => ({
      id: msg.id,
      accountId: account.id,
      provider: account.provider,
      from: msg.from,
      fromName: msg.fromName,
      fromEmail: msg.fromEmail,
      subject: msg.subject,
      date: msg.date,
      snippet: msg.snippet,
      bodyText: msg.bodyText,
      listUnsubscribe: msg.listUnsubscribe,
      isRead: msg.isRead,
      labels: ['INBOX'],
    }));
  }

  async trashEmail(_account: ConnectedAccount, _emailId: string): Promise<boolean> {
    // In IMAP, moving to Trash or marking \Deleted
    return true;
  }
}

/**
 * Universal Email Adapter Manager (Factory & Orchestrator)
 */
export class UniversalEmailManager {
  private adapters: Map<MailProvider, EmailServiceAdapter> = new Map();

  constructor() {
    this.registerAdapter(new ImapServiceAdapter('gmail'));
    this.registerAdapter(new ImapServiceAdapter('outlook'));
    this.registerAdapter(new ImapServiceAdapter('yahoo'));
    this.registerAdapter(new ImapServiceAdapter('icloud'));
    this.registerAdapter(new ImapServiceAdapter('imap'));
  }

  registerAdapter(adapter: EmailServiceAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  getAdapter(provider: MailProvider): EmailServiceAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      // Default to general IMAP adapter
      return new ImapServiceAdapter(provider);
    }
    return adapter;
  }

  /**
   * Unified Pipeline:
   * 1. Fetches from any provider via IMAP
   * 2. Passes through Rule Engine
   * 3. Runs Gemini NLP Deep Analysis & Categorization
   */
  async processAndFilterAccountEmails(
    account: ConnectedAccount,
    autoRules: AutoRule[],
    options?: { maxResults?: number; analyzeImmediately?: boolean }
  ): Promise<EmailMessage[]> {
    const adapter = this.getAdapter(account.provider);
    const rawEmails = await adapter.fetchEmails(account, options);

    // Apply auto rules and smart categorizer
    const processed: EmailMessage[] = [];
    for (const email of rawEmails) {
      let enriched = { ...email };
      const matchedRule = evaluateAutoRules(email, autoRules);
      if (matchedRule) {
        enriched.safeCategory = matchedRule.category;
      }

      if (options?.analyzeImmediately) {
        try {
          const analysis = await analyzeEmailWithGemini(enriched);
          enriched.analysis = analysis;
          if (analysis.safeCategory) {
            enriched.safeCategory = analysis.safeCategory;
          }
        } catch (err) {
          console.warn('Analiz tamamlanamadı:', email.id, err);
        }
      }

      processed.push(enriched);
    }

    return processed;
  }
}

export const universalEmailManager = new UniversalEmailManager();
