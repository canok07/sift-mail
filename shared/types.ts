export type Classification = 'safe' | 'newsletter' | 'spam' | 'phishing';
export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type SuggestedAction = 'keep_safe' | 'reply' | 'unsubscribe' | 'trash' | 'block_spam';

export type MailProvider = 'gmail' | 'outlook' | 'yandex' | 'yahoo' | 'icloud' | 'imap';

export type FolderType = 'inbox' | 'spam' | 'sent' | 'drafts' | 'trash' | 'archive' | 'other';

export interface MailboxFolder {
  path: string;
  name: string;
  type: FolderType;
  totalMessages?: number;
  unreadMessages?: number;
}

export interface OrderShippingInfo {
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
}

export interface FinanceBillingInfo {
  dueAmount?: string;
  dueDate?: string;
}

export interface ConnectedAccount {
  id: string;
  provider: MailProvider;
  email: string;
  displayName: string;
  status: 'connected' | 'syncing' | 'error';
  isPrimary?: boolean;
  lastSyncAt?: string;
  totalCount?: number;
  unreadCount?: number;
  mailboxes?: MailboxFolder[];
  imapConfig?: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    smtpHost?: string;
    smtpPort?: number;
  };
}

export type SafeCategory =
  | 'work'
  | 'finance'
  | 'shopping'
  | 'official'
  | 'personal'
  | 'travel'
  | 'other';

export interface AutoRule {
  id: string;
  category: SafeCategory;
  patternType: 'from' | 'subject' | 'domain';
  patternValue: string;
  isActive: boolean;
  matchCount: number;
  createdAt: string;
  description?: string;
}

export interface EmailAnalysis {
  summary?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  phishingRisk?: 'safe' | 'suspicious' | 'dangerous';
  classification: Classification;
  isSafe: boolean;
  safetyScore: number; // 0 to 100
  threatLevel: ThreatLevel;
  safeCategory?: SafeCategory;
  categoryConfidence?: number;
  isSubscription: boolean;
  unsubscribeUrl: string;
  reasoning: string;
  keyFindings: string[];
  suggestedAction: SuggestedAction;
  draftReply?: string;
  suggestedFilterRule?: {
    patternType: 'from' | 'subject' | 'domain';
    patternValue: string;
    description: string;
  };
  orderShippingInfo?: OrderShippingInfo;
  financeBillingInfo?: FinanceBillingInfo;
  analyzedAt?: string;
}

export interface EmailMessage {
  id: string;
  threadId?: string;
  messageId?: string;
  uid?: number;
  accountId?: string;
  provider?: MailProvider;
  folder?: string;
  folderType?: FolderType;
  from: string;
  fromName?: string;
  fromEmail?: string;
  to?: string[];
  subject: string;
  date: string;
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  listUnsubscribe?: string;
  listUnsubscribePost?: string;
  labels?: string[];
  isRead?: boolean;
  safeCategory?: SafeCategory;
  appliedGmailLabels?: string[];
  analysis?: EmailAnalysis;
  isAnalyzing?: boolean;
}

export interface UserLabel {
  id: string;
  name: string;
  color: string;
}

export type FilterTab =
  | 'all'
  | 'safe_only'
  | 'subscriptions'
  | 'threats'
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'trash'
  | 'archive';

export interface ScanStats {
  total: number;
  safe: number;
  newsletters: number;
  spam: number;
  phishing: number;
  folderCounts?: Record<FolderType, number>;
  categoryCounts: Record<SafeCategory, number>;
  unsubscribedCount: number;
  trashedCount: number;
}

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  itemCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface VaultEntry {
  key: string;
  label: string;
  category: 'imap_password' | 'gemini_api_key' | 'smtp_password' | 'custom_token';
  maskedValue: string;
  updatedAt: string;
}

export interface VaultSummary {
  isConfigured: boolean;
  algorithm: 'AES-256-GCM';
  totalKeys: number;
  storagePath: string;
  lastUpdated: string;
  keys: VaultEntry[];
}
