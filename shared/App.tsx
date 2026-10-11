/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { syncEmailsFromBackend } from './services/mailSyncService';
import { ensureFreshAccountCredentials, prepareAccountConnection, invalidateAccountSession, reconnectAccount } from './services/accountService';
import { clearOfflineAnalysis } from './services/emailAnalyzer';
import { safeUnsubscribeTarget } from './services/unsubscribeSafety';
import {
  CATEGORIES_META,
  DEFAULT_AUTO_RULES,
  evaluateAutoRules,
  extractDomain,
} from '../core/rules/categoryManager';
import {
  EmailMessage,
  FilterTab,
  ScanStats,
  SafeCategory,
  AutoRule,
  ConfirmationModalProps,
  ConnectedAccount,
  MailProvider,
  UserLabel,
} from './types';
import {
  INITIAL_ACCOUNTS,
  PROVIDERS_META,
  detectMailProvider,
} from '../core/mail/providerManager';
import {
  DynamicEmailLoginCard,
  DynamicLoginCredentials,
} from './components/DynamicEmailLoginCard';
import { Header, AppTheme } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { FilterBar } from './components/FilterBar';
import { EmailCard } from './components/EmailCard';
import { EmailDetailModal } from './components/EmailDetailModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { AutoRuleModal } from './components/AutoRuleModal';
import { MultiAccountModal } from './components/MultiAccountModal';
import { DesktopSetupModal } from './components/DesktopSetupModal';
import { VaultModal } from './components/VaultModal';
import { BottomNavigationBar } from './components/BottomNavigationBar';
import { SettingsModal } from './components/SettingsModal';
import { AIActionModal } from './components/AIActionModal';
import { AIAssistantDrawer } from './components/AIAssistantDrawer';
import { EmailReplyModal } from './components/EmailReplyModal';
import { ComposeModal } from './components/ComposeModal';
import { AI_CONNECTION_CHANGED, refreshAIConnections } from './services/aiConnections';
import { safeFetchJson } from './services/apiClient';
import { MailViewRequestGuard } from './services/mailViewGuard';
import { executeConfirmedMailBatch, selectSenderHistory } from './services/mailActionSafety';
import { buildMailActionRequest } from './services/mailActionIdentity';
import { mergeMailRefresh } from './services/mailMerge';
import { BackgroundMailScheduler, nextKnownUidBatch, reconcileFolderDelta } from './services/backgroundMailSync';
import {relatedThread,matchesMailSearch,mailAddresses,relocateVerifiedMessage} from '../core/mail/workflows';
import {providerMessageConfig} from './services/providerMail';
import { ComposeDraft, ReplyDraft, mailSnapshot, loadLocalMailSnapshot, saveLocalMailSnapshot, blockAccountCache, unblockAccountCache, forgetLocalAccount } from './services/localMailStore';
import { motion, AnimatePresence } from 'motion/react';
import { useSettingsStore } from './stores/useSettingsStore';
import { ProposedAIAction, generateSmartAIAction } from './services/ai/langchainTools';
import { analyzeEmailWithProvider } from './services/ai/aiFactory';
import { useTranslation } from 'react-i18next';
import {
  initCapacitorStatusBar,
  requestNotificationPermission,
  sendLocalNotification,
} from './services/capacitorService';
import {
  ShieldCheck,
  Sparkles,
  Inbox,
  AlertCircle,
  CheckCircle2,
  Lock,
  ExternalLink,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Briefcase,
  CreditCard,
  ShoppingBag,
  Landmark,
  UserCheck,
  Plane,
  Tag,
} from 'lucide-react';

export default function App() {
  const { t } = useTranslation();

  // Global Settings via Zustand store
  const {
    theme,
    setTheme,
    aiProvider,
    ollamaEndpoint,
    autoDeleteUnsubscribed,
    backgroundImage,
    accentColor,
    fontFamily,
    fontSize,
    pageSize,
    aiEnabled,
    setAIEnabled,
    setAppearance,
  } = useSettingsStore();

  const handleThemeChange = (newTheme: AppTheme) => {
    setTheme(newTheme);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-oled', 'theme-ocean', 'theme-forest');
    if (theme === 'oled') {
      root.classList.add('dark', 'theme-oled');
    } else if (theme === 'dark' || theme === 'ocean' || theme === 'forest') {
      root.classList.add('dark');
      if (theme !== 'dark') root.classList.add(`theme-${theme}`);
    }
    document.body.style.backgroundColor = 'var(--bg-canvas)';
    root.style.setProperty('--sift-accent', accentColor);
    root.style.setProperty('--sift-font-size', `${fontSize}px`);
    document.body.style.fontFamily = fontFamily;
    document.body.style.backgroundImage = backgroundImage ? `linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)),url(${backgroundImage})` : '';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
  }, [theme, accentColor, fontFamily, fontSize, backgroundImage]);

  // Modals & HITL AI Actions
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [proposedAIAction, setProposedAIAction] = useState<ProposedAIAction | null>(null);
  const [isAIActionModalOpen, setIsAIActionModalOpen] = useState(false);

  // Dynamic Session Credentials (transient in-memory, never stored on disk or server)
  const [sessionCredentials, setSessionCredentials] = useState<DynamicLoginCredentials | null>(null);
  const [credentialsByAccount, setCredentialsByAccount] = useState<Record<string, DynamicLoginCredentials>>({});
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncingEmails, setIsSyncingEmails] = useState(false);

  // Remember account addresses and server settings; passwords and tokens stay in memory.
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sift_accounts_meta_v1') || '[]');
      if (!Array.isArray(saved)) return INITIAL_ACCOUNTS;
      return saved.filter(account => account && typeof account.id === 'string' && typeof account.email === 'string')
        .map(account => ({...account, status: 'error' as const, totalCount: 0, unreadCount: 0, mailboxes: []}));
    } catch { return INITIAL_ACCOUNTS; }
  });
  const [activeAccountId, setActiveAccountId] = useState<string | 'all'>('all');
  const accountsRef = useRef(accounts);
  useEffect(()=>{accountsRef.current=accounts;},[accounts]);
  const mailRestoreRef = useRef<Promise<void>>(Promise.resolve());
  const mailViewGuardRef = useRef(new MailViewRequestGuard());
  const accountSyncGenerationRef = useRef<Record<string, number>>({});
  const removingAccountsRef = useRef(new Set<string>());
  const knownUidCheckRef = useRef<Record<string, number>>({});
  const mailMutationRevisionRef = useRef<Record<string, number>>({});
  const [isDesktopModalOpen, setIsDesktopModalOpen] = useState(false);
  const [isMultiAccountModalOpen, setIsMultiAccountModalOpen] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);

  // Initialize native mobile capacitor plugins on startup
  useEffect(() => {
    initCapacitorStatusBar();
    requestNotificationPermission();
  }, []);

  // Emails & UI state (starts completely clean & empty, prompting login)
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, ReplyDraft>>({});
  const [mailCacheLoaded, setMailCacheLoaded] = useState(false);
  const mailCacheWriteRef = useRef<Promise<void>>(Promise.resolve());
  const mailDataTransferRef = useRef(false);
  const [mailPersistenceRevision,setMailPersistenceRevision] = useState(0);
  const emailsRef = useRef<EmailMessage[]>([]);
  useEffect(() => { emailsRef.current = emails; }, [emails]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isSyncingLabels, setIsSyncingLabels] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [detailEmail, setDetailEmail] = useState<EmailMessage | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeForwardEmail, setComposeForwardEmail] = useState<EmailMessage | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [userLabels, setUserLabels] = useState<UserLabel[]>(() => {
    try { return JSON.parse(localStorage.getItem('sift_user_labels') || '[]'); } catch { return []; }
  });

  useEffect(() => { setCurrentPage(1); setSelectedEmailIds(new Set()); setDetailEmail(null); }, [pageSize, activeTab, activeAccountId, searchQuery, activeLabel]);
  useEffect(() => {
    let active=true;
    const refresh=()=>{if(active)void refreshAIConnections().catch(()=>{if(active)setAIEnabled(false)})};
    refresh(); window.addEventListener(AI_CONNECTION_CHANGED,refresh);
    return()=>{active=false;window.removeEventListener(AI_CONNECTION_CHANGED,refresh)};
  },[aiProvider,setAIEnabled]);
  const knownContacts = useMemo(() => Array.from(new Set(
    emails
      .filter(email => activeAccountId === 'all' || email.accountId === activeAccountId)
      .flatMap(email => mailAddresses([email.fromEmail || '', ...(email.to || []),...(email.cc || [])]))
      .filter(Boolean)
  )).sort(), [emails, activeAccountId]);

  // Safe Category state & Future Rules
  const [selectedCategory, setSelectedCategory] = useState<SafeCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [autoRules, setAutoRules] = useState<AutoRule[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sift_auto_rules') || 'null');
      return Array.isArray(saved) && saved.every(rule => rule && typeof rule.id === 'string' && typeof rule.patternValue === 'string' && typeof rule.isActive === 'boolean') ? saved : DEFAULT_AUTO_RULES;
    } catch { return DEFAULT_AUTO_RULES; }
  });
  const [autoWatcherEnabled, setAutoWatcherEnabled] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Toast / notification
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Sift AI Assistant & Email Reply Modals
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [selectedAssistantEmail, setSelectedAssistantEmail] = useState<EmailMessage | null>(null);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [replyModalEmail, setReplyModalEmail] = useState<EmailMessage | null>(null);
  const [replyModalDraft, setReplyModalDraft] = useState<string>('');

  const handleOpenAssistant = useCallback((email?: EmailMessage) => {
    if (!aiEnabled) { setIsSettingsModalOpen(true); setToast({type:'info',message:t('ui.assistant.connectFirst')}); return; }
    if (email) {
      setSelectedAssistantEmail(email);
    }
    setIsAssistantOpen(true);
  }, [aiEnabled, t]);

  const handleSelectEmailForReply = useCallback((email: EmailMessage, initialDraft?: string) => {
    setReplyModalEmail(email);
    setReplyModalDraft(initialDraft || '');
    setIsReplyModalOpen(true);
  }, []);

  // Confirmation Modal state for destructive operations (Workspace skill mandatory requirement)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    itemCount?: number;
    isDestructive?: boolean;
    action?: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
  });

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  useEffect(() => {
    let mounted = true;
    const restoring = loadLocalMailSnapshot().then(snapshot => {
      if (!mounted) return;
      if (!snapshot) { setMailCacheLoaded(true); return; }
      const restoredAccounts = snapshot.accounts || accounts;
      const knownAccounts = new Set(restoredAccounts.map(account => account.id));
      if (snapshot.messages.some(email => !knownAccounts.has(email.accountId))) {
        showToast('Bazı hesap kayıtları eksik; mevcut şifreli posta dosyası korunuyor.', 'error');
        return;
      }
      const cached = snapshot.messages.filter(email => email && typeof email.id === 'string' && knownAccounts.has(email.accountId));
      setEmails(prev => {
        const ids = new Set(prev.map(email => email.id));
        return [...prev, ...cached.filter(email => !ids.has(email.id))];
      });
      setComposeDraft(prev => prev || snapshot.composeDraft);
      setReplyDrafts(prev => ({ ...snapshot.replyDrafts, ...prev }));
      if(snapshot.accounts) {
        const restored=snapshot.accounts.map(account=>({...account,status:'error' as const}));
        accountsRef.current=restored;setAccounts(restored);
      }
      if(snapshot.labels) setUserLabels(snapshot.labels);
      if(snapshot.rules) setAutoRules(snapshot.rules);
      setMailCacheLoaded(true);
    }).catch(() => {
      if (mounted) showToast('Yerel posta verisi açılamadı; mevcut şifreli dosya korunuyor.', 'error');
    });
    mailRestoreRef.current=restoring;
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!mailCacheLoaded) return;
    const snapshot = mailSnapshot(emails,composeDraft,replyDrafts,accounts,userLabels,autoRules);
    const timer = window.setTimeout(() => {
      if(mailDataTransferRef.current) return;
      mailCacheWriteRef.current = mailCacheWriteRef.current.catch(() => {}).then(async () => {
        await saveLocalMailSnapshot(snapshot);
        // Remove legacy plaintext metadata only after the encrypted DB acknowledges persistence.
        for(const key of ['sift_accounts_meta_v1','sift_user_labels','sift_auto_rules']) localStorage.removeItem(key);
      });
      void mailCacheWriteRef.current.catch(() => showToast('Yerel posta verisi kaydedilemedi.', 'error'));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [mailCacheLoaded, emails, composeDraft, replyDrafts, accounts, userLabels, autoRules, mailPersistenceRevision, showToast]);

  const updateAccountCredentials = useCallback((accountId: string, credentials: DynamicLoginCredentials) => {
    if (removingAccountsRef.current.has(accountId)) return;
    setCredentialsByAccount(prev => ({...prev, [accountId]: credentials}));
    setSessionCredentials(prev => prev?.email.toLowerCase() === credentials.email.toLowerCase() ? credentials : prev);
  }, []);

  const handleReplyDraftChange = useCallback((emailId: string, draft: ReplyDraft | null) => {
    setReplyDrafts(prev => {
      const next = { ...prev };
      if (draft) next[emailId] = draft;
      else delete next[emailId];
      return next;
    });
  }, []);

  const performRemoteMailAction = useCallback(async (email: EmailMessage, action: 'mark_read' | 'mark_unread' | 'trash' | 'archive') => {
    if (!email.uid || !email.folder || !email.accountId) throw new Error(t('mailActions.missingIdentity'));
    const credentials = credentialsByAccount[email.accountId];
    if (!credentials) throw new Error('Bu işlem için hesaba yeniden giriş yapın.');
    if (removingAccountsRef.current.has(email.accountId)) throw new Error('Hesap kaldırılıyor.');
    const account = accounts.find(item => item.id === email.accountId);
    buildMailActionRequest(email, account, credentials, action);
    const activeCredentials = await ensureFreshAccountCredentials(credentials);
    if (removingAccountsRef.current.has(email.accountId)) throw new Error('Hesap kaldırılıyor.');
    if (activeCredentials !== credentials) updateAccountCredentials(email.accountId, activeCredentials);
    mailMutationRevisionRef.current[email.accountId] = (mailMutationRevisionRef.current[email.accountId] || 0) + 1;
    const result = await safeFetchJson<{success:boolean;verified:boolean;destination?:string}>('/api/imap/action', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(buildMailActionRequest(email, account, activeCredentials, action)),
    }).finally(() => { mailMutationRevisionRef.current[email.accountId] = (mailMutationRevisionRef.current[email.accountId] || 0) + 1; });
    if (!result.success || !result.verified) throw new Error('Posta sunucusu işlemi doğrulamadı.');
    return result;
  }, [accounts, credentialsByAccount, updateAccountCredentials, t]);

  const handleOpenDetail = useCallback((item: EmailMessage) => {
    setDetailEmail(item);
    if (item.isRead) return;
    void (async () => {
      try {
        if (item.uid && item.folder && item.accountId) await performRemoteMailAction(item, 'mark_read');
        setEmails(prev => prev.map(email => email.id === item.id ? {...email, isRead: true} : email));
        setDetailEmail(prev => prev?.id === item.id ? {...prev, isRead: true} : prev);
        if (item.accountId) setAccounts(prev => prev.map(account => account.id === item.accountId ? {...account, unreadCount: Math.max(0, (account.unreadCount || 0) - 1)} : account));
      } catch (error: any) { showToast(error.message || 'İleti okundu olarak işaretlenemedi.', 'error'); }
    })();
  }, [performRemoteMailAction, showToast]);

  const handleDownloadAttachment = useCallback((email: EmailMessage, index: number) => {
    void (async () => {
      try {
        if (!email.accountId || !email.uid || !email.folder) throw new Error('Ek için posta sunucusu bilgisi bulunamadı.');
        const credentials = credentialsByAccount[email.accountId];
        if (!credentials) throw new Error('Eki indirmek için hesaba yeniden giriş yapın.');
        if (removingAccountsRef.current.has(email.accountId)) throw new Error('Hesap kaldırılıyor.');
        buildMailActionRequest(email, accounts.find(account => account.id === email.accountId), credentials, 'mark_read');
        const activeCredentials = await ensureFreshAccountCredentials(credentials);
        if (removingAccountsRef.current.has(email.accountId)) throw new Error('Hesap kaldırılıyor.');
        if (activeCredentials !== credentials) updateAccountCredentials(email.accountId, activeCredentials);
        const result = await safeFetchJson<{ success: boolean; filename: string; contentType: string; content: string }>('/api/imap/attachment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            host: activeCredentials.host, port: activeCredentials.port || 993, secure: activeCredentials.secure !== false,
            auth: { user: activeCredentials.email, pass: activeCredentials.password || undefined, accessToken: activeCredentials.accessToken },
            folder: email.folder, uid: email.uid, index, expectedUidValidity: email.uidValidity, messageId: email.messageId,
          }),
        });
        if (!result.success || !result.content) throw new Error('Ek indirilemedi.');
        const bytes = Uint8Array.from(atob(result.content), character => character.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType || 'application/octet-stream' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename || `attachment-${index + 1}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (error: any) { showToast(error.message || 'Ek indirilemedi.', 'error'); }
    })();
  }, [accounts, credentialsByAccount, updateAccountCredentials, showToast]);

  // Handle Swipe-to-Action: Mark safe and archive
  const handleMarkSafeArchive = useCallback(
    async (item: string | EmailMessage) => {
      const id = typeof item === 'string' ? item : item.id;
      const email = typeof item === 'string' ? emails.find(entry => entry.id === item) : item;
      if(!email)return;
      let destination='';
      try { destination=(await performRemoteMailAction(email, 'archive')).destination || ''; }
      catch (error: any) { showToast(error.message || 'İleti arşivlenemedi.', 'error'); return; }
      // A verified MOVE invalidates the source UID. Never reuse it in the destination.
      setEmails(prev=>relocateVerifiedMessage(prev,{...email,safeCategory:email.safeCategory || 'work'},destination,'archive'));
      showToast('İleti güvenli olarak onaylandı ve arşivlendi.', 'success');
    },
    [emails, performRemoteMailAction, showToast]
  );

  // Process incoming or unassigned emails through auto-rules and smart categorization
  const applyRulesToEmails = useCallback(
    (inputEmails: EmailMessage[], rules: AutoRule[]): EmailMessage[] => {
      return inputEmails.map((email) => {
        // If already has a category and is safe, keep it
        if (email.safeCategory) return email;

        // Try evaluating against active AutoRules
        const match = evaluateAutoRules(email, rules);
        if (match) {
          return {
            ...email,
            safeCategory: match.category,
          };
        }

        // Heuristic fallback for unassigned safe items
        const sub = email.subject.toLowerCase();
        const from = email.from.toLowerCase();

        let inferredCategory: SafeCategory | undefined;
        if (from.includes('gov.tr') || sub.includes('e-devlet') || sub.includes('belge') || sub.includes('resmi')) {
          inferredCategory = 'official';
        } else if (sub.includes('fatura') || sub.includes('ekstre') || sub.includes('dekont') || from.includes('billing') || from.includes('banka')) {
          inferredCategory = 'finance';
        } else if (sub.includes('sipariş') || sub.includes('kargo') || sub.includes('teslimat') || from.includes('hepsiburada') || from.includes('amazon')) {
          inferredCategory = 'shopping';
        } else if (sub.includes('bilet') || sub.includes('rezervasyon') || sub.includes('uçuş') || from.includes('turkishairlines') || from.includes('booking')) {
          inferredCategory = 'travel';
        } else if (sub.includes('sprint') || sub.includes('proje') || sub.includes('toplantı') || from.includes('github') || from.includes('jira')) {
          inferredCategory = 'work';
        } else if (from.includes('gmail.com') && !from.includes('info') && !from.includes('noreply')) {
          inferredCategory = 'personal';
        } else if (email.analysis?.isSafe) {
          inferredCategory = 'other';
        }

        return inferredCategory ? { ...email, safeCategory: inferredCategory } : email;
      });
    },
    []
  );

  // Central Direct IMAP Mail Synchronization Handler (Dynamic In-Memory)
  const handleLoginAndSync = useCallback(
    async (credentials: DynamicLoginCredentials) => {
      // Do not create a second account or overwrite a live session while async disk restoration finishes.
      await mailRestoreRef.current;
      const currentAccounts=accountsRef.current;
      setSyncError(null);
      const cleanEmail = credentials.email.trim().toLowerCase();
      const accountId = currentAccounts.find(a => a.email.toLowerCase() === cleanEmail)?.id || `acc-${Date.now()}`;
      if (removingAccountsRef.current.has(accountId)) throw new Error('Hesap kaldırılıyor. İşlemin tamamlanmasını bekleyin.');
      unblockAccountCache(accountId);
      const syncGeneration = (accountSyncGenerationRef.current[accountId] || 0) + 1;
      accountSyncGenerationRef.current[accountId] = syncGeneration;
      const discovered = detectMailProvider(cleanEmail);
      const existingAccount = currentAccounts.find(account => account.id === accountId);
      const normalizedCredentials = prepareAccountConnection(credentials, existingAccount);
      const { host: imapHost, port: imapPort, smtpHost, smtpPort, smtpSecure } = normalizedCredentials;
      const shellAccount: ConnectedAccount = {
        ...existingAccount,
        id: accountId, provider: discovered.provider, email: cleanEmail, displayName: existingAccount?.displayName || cleanEmail,
        status: 'syncing', isPrimary: existingAccount?.isPrimary ?? currentAccounts.length === 0, totalCount: existingAccount?.totalCount || 0, unreadCount: existingAccount?.unreadCount || 0, mailboxes: existingAccount?.mailboxes || [],
        imapConfig: { host: imapHost!, port: imapPort!, secure: normalizedCredentials.secure !== false, username: cleanEmail, smtpHost, smtpPort, smtpSecure, oauthProvider: credentials.oauthProvider },
      };
      setAccounts(prev => [shellAccount, ...prev.filter(a => a.id !== accountId)]);
      setActiveAccountId(accountId);
      setSessionCredentials(normalizedCredentials);
      setCredentialsByAccount(prev => ({...prev, [accountId]: normalizedCredentials}));
      showToast('Hesap bağlanıyor ve iletiler senkronize ediliyor…', 'info');
      setIsSyncingEmails(true);

      try {
        const activeCredentials = await ensureFreshAccountCredentials(normalizedCredentials);
        if (accountSyncGenerationRef.current[accountId] !== syncGeneration) return;
        if (activeCredentials !== normalizedCredentials) updateAccountCredentials(accountId, activeCredentials);
        // Enter the mail UI before downloading messages; auth lifecycle is not tied to the modal.
        setIsLoginModalOpen(false);
        setIsMultiAccountModalOpen(false);
        const { messages, accountEmail, provider, mailboxes } = await syncEmailsFromBackend({
          email: activeCredentials.email,
          password: activeCredentials.password,
          accessToken: activeCredentials.accessToken,
          host: imapHost,
          port: imapPort,
          secure: activeCredentials.secure ?? existingAccount?.imapConfig?.secure ?? discovered.imapSecure,
          maxResults: 100,
          accountId,
        });
        if (accountSyncGenerationRef.current[accountId] !== syncGeneration) return;

        const categorized = applyRulesToEmails(messages, autoRules);
        const refreshedFolders = mailboxes.filter(mailbox => ['inbox', 'spam', 'sent'].includes(mailbox.type)).map(mailbox => mailbox.path);
        setEmails(prev => mergeMailRefresh(prev, categorized, accountId, refreshedFolders).messages);

        // A reconnect's recent window must not jump over a pending backlog in the previous generation.
        for (const mailbox of mailboxes) {
          if (!mailbox.uidValidity) continue;
          const previous = existingAccount?.mailboxes?.find(item => item.path === mailbox.path && item.uidValidity === mailbox.uidValidity);
          const loaded = messages.filter(item => item.folder === mailbox.path).reduce((n,item) => Math.max(n,item.uid || 0),0);
          const priorLoaded = emailsRef.current.filter(item => item.accountId === accountId && item.folder === mailbox.path && item.uidValidity === mailbox.uidValidity)
            .reduce((n,item) => Math.max(n,item.uid || 0),0);
          mailbox.syncCursor = previous?.syncCursor ?? (previous ? priorLoaded : loaded);
        }
        const newAccount: ConnectedAccount = {
          id: accountId,
          mailboxes,
          provider: provider,
          email: accountEmail,
          displayName: existingAccount?.displayName || accountEmail,
          status: 'connected',
          isPrimary: shellAccount.isPrimary,
          lastSyncAt: new Date().toISOString(),
          totalCount: mailboxes.reduce((sum, mailbox) => sum + (mailbox.totalMessages || 0), 0),
          unreadCount: categorized.filter((e) => !e.isRead).length,
          imapConfig: {
            host: imapHost!,
            port: imapPort!,
            secure: credentials.secure ?? existingAccount?.imapConfig?.secure ?? discovered.imapSecure,
            username: accountEmail,
            smtpHost,
            smtpPort,
            smtpSecure,
            oauthProvider: credentials.oauthProvider,
          },
        };

        setAccounts(prev => prev.map(a => a.id === accountId ? newAccount : a));
        setIsLoginModalOpen(false);
        setIsMultiAccountModalOpen(false);

        showToast(
          `${categorized.length} adet e-posta başarıyla senkronize edildi!`,
          'success'
        );
      } catch (error: any) {
        if (accountSyncGenerationRef.current[accountId] !== syncGeneration) return;
        console.error('[Sift Mail] ACCOUNT_LOGIN_FAILED');
        const errorMessage =
          typeof error === 'string'
            ? error
            : (error as any)?.message || 'Posta hesabına bağlanılamadı.';
        setSyncError(errorMessage);
        setAccounts(prev => prev.map(a => a.id === accountId ? {...a, status:'error'} : a));
        showToast(errorMessage, 'error');
        throw error;
      } finally {
        if (accountSyncGenerationRef.current[accountId] === syncGeneration) setIsSyncingEmails(false);
      }
    },
    [showToast, applyRulesToEmails, autoRules, accounts, updateAccountCredentials]
  );

  const handleSyncEmails = useCallback(async () => {
    const targets = accounts.filter(a => activeAccountId === 'all' || a.id === activeAccountId);
    if (!targets.length) { setIsLoginModalOpen(true); return; }
    for (const account of targets) {
      if (removingAccountsRef.current.has(account.id)) continue;
      const generation = accountSyncGenerationRef.current[account.id];
      try {
        const credential = credentialsByAccount[account.id] || await reconnectAccount(account);
        if (removingAccountsRef.current.has(account.id) || accountSyncGenerationRef.current[account.id] !== generation) continue;
        await handleLoginAndSync(credential);
      } catch (error: any) {
        if (error.code === 'MANUAL_LOGIN_REQUIRED') setIsLoginModalOpen(true);
        else if (error.code === 'REAUTH_REQUIRED') { showToast(error.message, 'error'); setIsMultiAccountModalOpen(true); }
        else showToast(error.message || 'Hesap bağlantısı yenilenemedi.', 'error');
      }
    }
  }, [accounts, activeAccountId, credentialsByAccount, handleLoginAndSync, showToast]);

  // Keep one scheduler alive across React renders; a result must not restart polling or create overlapping cycles.
  const backgroundStateRef = useRef({ accounts, credentialsByAccount, autoRules, isSyncingEmails, mailCacheLoaded });
  const registerBackgroundRef = useRef<() => void>(() => {});
  backgroundStateRef.current = { accounts, credentialsByAccount, autoRules, isSyncingEmails, mailCacheLoaded };
  useEffect(() => {
    if (!autoWatcherEnabled) return;
    const scheduler = new BackgroundMailScheduler();
    const pollFolders = async (immediate = false) => {
      const state = backgroundStateRef.current;
      if (!navigator.onLine || state.isSyncingEmails || !state.mailCacheLoaded || mailDataTransferRef.current) return;
      const jobs = state.accounts.filter(a => a.status === 'connected' && state.credentialsByAccount[a.id] && !removingAccountsRef.current.has(a.id))
        .flatMap(account => (account.mailboxes || []).map(mailbox => ({ key: JSON.stringify([account.id,mailbox.path]), generation: accountSyncGenerationRef.current[account.id] || 0 })));
      await scheduler.tick(jobs,async (job,signal) => {
        const [accountId,folder] = JSON.parse(job.key) as [string,string];
        const current = backgroundStateRef.current;
        const account = current.accounts.find(a => a.id === accountId);
        const mailbox = account?.mailboxes?.find(m => m.path === folder);
        const credentials = current.credentialsByAccount[accountId];
        const mutationRevision = mailMutationRevisionRef.current[accountId] || 0;
        const valid = () => !signal.aborted && !mailDataTransferRef.current && !backgroundStateRef.current.isSyncingEmails &&
          !removingAccountsRef.current.has(accountId) && accountSyncGenerationRef.current[accountId] === job.generation && (mailMutationRevisionRef.current[accountId] || 0) === mutationRevision;
        if (!account || account.status !== 'connected' || !mailbox || !credentials || !valid()) throw new Error('SYNC_CANCELLED');
        try {
          const activeCredentials = await ensureFreshAccountCredentials(credentials);
          if (!valid()) throw new Error('SYNC_CANCELLED');
          if (activeCredentials !== credentials) updateAccountCredentials(accountId,activeCredentials);
          const knownUids = nextKnownUidBatch(emailsRef.current,accountId,folder,mailbox.uidValidity,knownUidCheckRef.current[job.key] || 0);
          const loaded = emailsRef.current.filter(m => m.accountId === accountId && m.folder === folder && m.uidValidity === mailbox.uidValidity)
            .reduce((n,m) => Math.max(n,m.uid || 0),0);
          const result = await syncEmailsFromBackend({ ...activeCredentials,accountId,folder,maxResults:25,knownUids,
            sinceUid: mailbox.uidValidity ? mailbox.syncCursor ?? loaded : undefined, expectedUidValidity:mailbox.uidValidity },{signal});
          if (!valid()) throw new Error('SYNC_CANCELLED');
          if (!result.delta || (result.incremental && result.delta.nextUid < (mailbox.syncCursor ?? loaded))) throw new Error('INVALID_FOLDER_DELTA');
          const folderPaths = new Set(result.mailboxes.map(m => m.path));
          if (!folderPaths.has(folder) || folderPaths.size !== result.mailboxes.length) throw new Error('INVALID_FOLDER_DELTA');
          const categorized = applyRulesToEmails(result.messages,backgroundStateRef.current.autoRules);
          const merged = reconcileFolderDelta(emailsRef.current,categorized,accountId,folder,mailbox.uidValidity,knownUids,result.delta);
          // LIST is authoritative only after a successful folder response. A network failure never clears folders.
          merged.messages = merged.messages.filter(m => m.accountId !== accountId || !m.uid || !m.folder || folderPaths.has(m.folder));
          emailsRef.current = merged.messages;
          setEmails(merged.messages);
          // Update open detail only if it still belongs to this exact mailbox; never resurrect removed mail.
          setDetailEmail(prev => prev?.accountId === accountId && prev.folder === folder ? merged.messages.find(m => m.id === prev.id) || null : prev);
          knownUidCheckRef.current[job.key] = result.delta.reset ? 0 : knownUids.at(-1) || 0;
          setAccounts(prev => prev.map(a => {
            if (a.id !== accountId) return a;
            const boxes = result.mailboxes.map(m => ({ ...a.mailboxes?.find(old => old.path === m.path),...m,
              ...(m.path === folder ? {syncCursor:result.delta!.nextUid} : {}) }));
            return { ...a,lastSyncAt:new Date().toISOString(),mailboxes:boxes,totalCount:boxes.reduce((n,m) => n + (m.totalMessages || 0),0),
              unreadCount:merged.messages.filter(m => m.accountId === accountId && !m.isRead).length };
          }));
          if (mailbox.type === 'inbox' && merged.added.length) void sendLocalNotification('Sift Mail',`${account.email}: ${merged.added.length} ${t('sync.newMessages')}`);
          return {hasMore:result.delta.hasMore};
        } catch (error: any) {
          if (valid() && (error.code === 'REAUTH_REQUIRED' || error.data?.code === 'REAUTH_REQUIRED')) {
            setAccounts(prev => prev.map(a => a.id === accountId ? {...a,status:'error'} : a));
            showToast(t('sync.reauthRequired'),'error');
          }
          // Fixed diagnostic only: never log provider responses, credentials or mail bodies.
          if (!signal.aborted) console.warn('[Sift Mail] BACKGROUND_SYNC_FAILED');
          throw error;
        }
      },Date.now(),immediate);
    };
    registerBackgroundRef.current = () => { void pollFolders(); };
    void pollFolders(); // Register due times only; mail startup does not wait on network.
    const timer = window.setInterval(() => { void pollFolders(); },15_000);
    const online = () => { void pollFolders(true); };
    window.addEventListener('online',online);
    return () => { registerBackgroundRef.current = () => {}; scheduler.dispose(); window.clearInterval(timer); window.removeEventListener('online',online); };
  }, [autoWatcherEnabled, applyRulesToEmails, updateAccountCredentials, showToast, t]);
  useEffect(() => { registerBackgroundRef.current(); },[accounts,credentialsByAccount,isSyncingEmails,mailCacheLoaded,mailPersistenceRevision]);

  // Account management handlers
  const handleAddAccount = (
    accountData: Omit<ConnectedAccount, 'id' | 'lastSyncAt' | 'totalCount' | 'unreadCount'>
  ) => {
    const newId = `acc-${Date.now()}`;
    const newAccount: ConnectedAccount = {
      ...accountData,
      id: newId,
      lastSyncAt: new Date().toISOString(),
      totalCount: 1,
      unreadCount: 0,
    };

    setAccounts((prev) => [...prev, newAccount]);
    setActiveAccountId(newId);

    // Create a welcome / synced message for this newly connected provider
    const sampleMsg: EmailMessage = {
      id: `msg-${Date.now()}`,
      accountId: newId,
      provider: accountData.provider,
      from: `${PROVIDERS_META[accountData.provider].name} Güvenlik <support@${accountData.email.split('@')[1] || 'mail.com'}>`,
      fromName: `${PROVIDERS_META[accountData.provider].shortName} Güvenlik`,
      fromEmail: `support@${accountData.email.split('@')[1] || 'mail.com'}`,
      subject: `${accountData.displayName} Başarıyla Bağlandı ve Eşitlendi`,
      date: 'Az önce',
      snippet: `${accountData.email} hesabı Akıllı E-posta ve Spam Filtresi yapay zeka korumasına bağlandı. Gelen iletiler filtrelenecek.`,
      bodyText: `Tebrikler!\n\n${accountData.displayName} (${accountData.email}) hesabı başarıyla sisteme bağlandı.\n\nArtık bu hesaba gelen tüm iletiler Gemini NLP ve özel kural motorunuz tarafından tek tek taranacak, spam ve zararlı iletiler ayırt edilecektir.`,
      isRead: false,
      safeCategory: 'work',
      analysis: {
        classification: 'safe',
        isSafe: true,
        safetyScore: 100,
        threatLevel: 'none',
        safeCategory: 'work',
        categoryConfidence: 99,
        isSubscription: false,
        unsubscribeUrl: '',
        reasoning: 'Yeni bağlanan posta kutusu için sistem doğrulama iletisi. Tamamen güvenli.',
        keyFindings: ['Doğrulanmış sistem iletisi', 'Güvenli bağlantı'],
        suggestedAction: 'keep_safe',
      },
    };

    setEmails((prev) => [sampleMsg, ...prev]);
    showToast(`${accountData.displayName} hesabı başarıyla bağlandı ve senkronize edildi!`, 'success');
  };

  const handleRemoveAccount = async (id: string) => {
    await mailRestoreRef.current;
    const account = accountsRef.current.find(item => item.id === id);
    if (!account || removingAccountsRef.current.has(id)) return;
    removingAccountsRef.current.add(id);
    invalidateAccountSession(account.email);
    blockAccountCache(id);
    accountSyncGenerationRef.current[id] = (accountSyncGenerationRef.current[id] || 0) + 1;
    mailViewGuardRef.current.invalidate();
    try {
      // Drain already submitted writes before backend cleanup; later queued writes
      // are filtered by blockAccountCache and cannot restore the removed account.
      await mailCacheWriteRef.current.catch(() => {});
      await forgetLocalAccount(id, account.email);
    } catch {
      removingAccountsRef.current.delete(id);
      unblockAccountCache(id);
      showToast('Hesabın yerel verileri temizlenemedi. Kaldırma işlemini yeniden deneyin.', 'error');
      return;
    }
    clearOfflineAnalysis();
    const removedEmail = accounts.find(account => account.id === id)?.email.toLowerCase();
    emailsRef.current = emailsRef.current.filter(email => email.accountId !== id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setEmails((prev) => prev.filter((email) => email.accountId !== id));
    setComposeDraft(prev => prev?.accountId === id ? null : prev);
    if (composeDraft?.accountId === id || composeForwardEmail?.accountId === id) {
      setIsComposeOpen(false); setComposeForwardEmail(null);
    }
    setReplyDrafts(prev => Object.fromEntries(Object.entries(prev).filter(([, draft]) => draft.accountId !== id)));
    setDetailEmail(prev => prev?.accountId === id ? null : prev);
    setReplyModalEmail(prev => prev?.accountId === id ? null : prev);
    if (replyModalEmail?.accountId === id) { setIsReplyModalOpen(false); setReplyModalDraft(''); }
    setCredentialsByAccount((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (removedEmail) setSessionCredentials(prev => prev?.email.toLowerCase() === removedEmail ? null : prev);
    if (activeAccountId === id) {
      setActiveAccountId('all');
    }
    setIsSyncingEmails(false);
    showToast('Hesap bağlantısı kaldırıldı.', 'info');
  };

  const handleRequestRemoveAccount = (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;
    setIsMultiAccountModalOpen(false);
    setConfirmModal({
      isOpen: true,
      title: 'Hesabı Kaldır',
      description: `"${acc?.displayName || acc?.email || 'Bu hesabı'}" posta kutusu listesinden kaldırmak istediğinize emin misiniz?`,
      confirmLabel: 'Hesabı Kaldır',
      isDestructive: true,
      action: async () => {
        await handleRemoveAccount(id);
      },
    });
  };

  const handleRefresh = () => {
    if (sessionCredentials) {
      void handleLoginAndSync(sessionCredentials).catch(() => {});
    } else {
      void handleSyncEmails();
    }
  };

  // Trigger smart AI action proposal (Human-in-the-Loop)
  const handleTriggerAIAction = async (
    email: EmailMessage,
    actionHint: 'reply' | 'trash' | 'archive' = 'reply'
  ) => {
    try {
      showToast('Yapay zeka eylem önerisi oluşturuluyor...', 'info');
      const proposal = await generateSmartAIAction(email, actionHint);
      setProposedAIAction(proposal);
      setIsAIActionModalOpen(true);
    } catch (err: any) {
      showToast(err.message || 'Yapay zeka önerisi hazırlanamadı.', 'error');
    }
  };

  const handleReplyEmail = (email: EmailMessage) => {
    setReplyModalEmail(email);
    setReplyModalDraft('');
    setIsReplyModalOpen(true);
  };

  const handleExecuteAIAction = async (action: ProposedAIAction) => {
    if (action.actionType === 'trash_email') {
      const emailObj = emails.find((e) => e.id === action.emailId);
      if (emailObj) {
        handleRequestTrash(emailObj);
      }
    } else if (action.actionType === 'draft_reply') {
      const emailObj = emails.find((e) => e.id === action.emailId);
      if (emailObj) {
        setReplyModalEmail(emailObj);
        setReplyModalDraft(action.payload?.replyBody || '');
        setIsReplyModalOpen(true);
      }
      showToast(`Yanıt taslağı oluşturuldu ve gönderim ekranı açıldı.`, 'success');
    } else if (action.actionType === 'archive_email') {
      const emailObj = emails.find((e) => e.id === action.emailId);
      if (emailObj) {
        await handleMarkSafeArchive(emailObj);
      }
    }
    setIsAIActionModalOpen(false);
    setProposedAIAction(null);
  };

  // Analyze single email using Multi-Model AI Provider (Factory pattern)
  const handleAnalyzeEmail = async (emailToAnalyze: EmailMessage) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === emailToAnalyze.id ? { ...e, isAnalyzing: true } : e))
    );

    try {
      const analysis = await analyzeEmailWithProvider(
        emailToAnalyze,
        aiProvider,
        ollamaEndpoint
      );
      const safeCat = analysis.safeCategory || emailToAnalyze.safeCategory || (analysis.isSafe ? 'other' : undefined);

      setEmails((prev) =>
        prev.map((e) =>
          e.id === emailToAnalyze.id
            ? { ...e, isAnalyzing: false, analysis, safeCategory: safeCat }
            : e
        )
      );

      // AI rule suggestions remain suggestions. Rules are activated only in the user's rule editor.

      if (detailEmail && detailEmail.id === emailToAnalyze.id) {
        setDetailEmail((prev) =>
          prev
            ? {
                ...prev,
                isAnalyzing: false,
                analysis,
                safeCategory: safeCat,
              }
            : null
        );
      }
      showToast(`"${emailToAnalyze.subject.slice(0, 30)}..." [${aiProvider.toUpperCase()}] ile analiz edildi.`, 'success');
    } catch (err: any) {
      console.error('[Sift AI] ANALYSIS_FAILED');
      setEmails((prev) =>
        prev.map((e) => (e.id === emailToAnalyze.id ? { ...e, isAnalyzing: false } : e))
      );
      showToast(err.message || 'İleti analiz edilirken hata oluştu.', 'error');
    }
  };

  // Scan all emails one by one with active AI model
  const handleScanAll = async () => {
    if (emails.length === 0 || isScanning) return;
    setIsScanning(true);
    setScanProgress({ current: 0, total: emails.length });

    try {
      let count = 0;
      for (const email of emails) {
        if (!email.analysis) {
          try {
            const analysis = await analyzeEmailWithProvider(
              email,
              aiProvider,
              ollamaEndpoint
            );
            const safeCat = analysis.safeCategory || email.safeCategory || (analysis.isSafe ? 'other' : undefined);
            setEmails((prev) =>
              prev.map((e) => (e.id === email.id ? { ...e, analysis, safeCategory: safeCat } : e))
            );
          } catch (error) {
            console.warn('[Sift AI] ANALYSIS_SKIPPED');
          }
        }
        count++;
        setScanProgress({ current: count, total: emails.length });
      }
      showToast(`Tüm iletiler [${aiProvider.toUpperCase()}] modeliyle incelendi ve kategorilere ayrıldı!`, 'success');
    } catch (error: any) {
      console.error('[Sift AI] BATCH_ANALYSIS_FAILED');
      showToast('Tarama sırasında bir hata oluştu.', 'error');
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  // Categorize All Safe Emails with AI & Rule Matcher
  const handleAutoCategorizeAll = async () => {
    setIsCategorizing(true);
    showToast('Tüm mevcut güvenli iletiler kurallar ve NLP ile kategorize ediliyor...', 'info');

    try {
      // First apply active rules
      const ruleApplied = applyRulesToEmails(emails, autoRules);
      setEmails(ruleApplied);

      // For unanalyzed or unassigned safe items, run deep NLP
      const unassigned = ruleApplied.filter(
        (e) => !e.safeCategory && (!e.labels?.includes('SPAM') || e.analysis?.isSafe)
      );

      for (const item of unassigned.slice(0, 5)) {
        try {
          const analysis = await analyzeEmailWithProvider(
            item,
            aiProvider,
            ollamaEndpoint
          );
          const safeCat = analysis.safeCategory || (analysis.isSafe ? 'other' : undefined);
          setEmails((prev) =>
            prev.map((e) => (e.id === item.id ? { ...e, analysis, safeCategory: safeCat } : e))
          );
        } catch (err) {
          console.warn('[Sift AI] CLASSIFICATION_SKIPPED');
        }
      }

      showToast('Tüm mevcut iletiler başarıyla kategorilere ayrıldı!', 'success');
    } catch (err: any) {
      console.error('[Sift AI] CLASSIFICATION_FAILED');
      showToast('Kategorilendirme sırasında bir hata oluştu.', 'error');
    } finally {
      setIsCategorizing(false);
    }
  };

  // Sync Safe Categories
  const continueProviderDraft=async(email:EmailMessage)=>{
    const open=async()=>{
      const account=accounts.find(item=>item.id===email.accountId),credentials=credentialsByAccount[email.accountId || ''];
      if(!account || !credentials || removingAccountsRef.current.has(account.id)){showToast(t('compose.loginRequired'),'error');return;}
      const generation=accountSyncGenerationRef.current[account.id];
      try{
        const active=await ensureFreshAccountCredentials(credentials);
        if(removingAccountsRef.current.has(account.id) || generation!==accountSyncGenerationRef.current[account.id])return;
        if(active!==credentials)updateAccountCredentials(account.id,active);
        const result=await safeFetchJson<{success:boolean;draft:ComposeDraft}>('/api/mail/provider/draft/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(providerMessageConfig(account,active,email))});
        if(!result.success || result.draft.accountId!==account.id)throw new Error('DRAFT_UNAVAILABLE');
        if(removingAccountsRef.current.has(account.id) || generation!==accountSyncGenerationRef.current[account.id])return;
        setComposeDraft(result.draft);setComposeForwardEmail(null);setDetailEmail(null);setIsComposeOpen(true);
      }catch{showToast(t('workflow.draftFailed'),'error');}
    };
    if(composeDraft)setConfirmModal({isOpen:true,title:t('workflow.continueDraft'),description:t('compose.discard'),confirmLabel:t('workflow.continueDraft'),action:open});
    else await open();
  };

  const applyProviderLabel=async(email:EmailMessage,label:string,remove:boolean)=>{
    const account=accounts.find(item=>item.id===email.accountId),credential=credentialsByAccount[email.accountId || ''];
    if(!account || !credential || removingAccountsRef.current.has(account.id))throw new Error('ACCOUNT_UNAVAILABLE');
    const generation=accountSyncGenerationRef.current[account.id];
    const active=await ensureFreshAccountCredentials(credential);
    if(removingAccountsRef.current.has(account.id) || generation!==accountSyncGenerationRef.current[account.id])throw new Error('ACCOUNT_CHANGED');
    if(active!==credential)updateAccountCredentials(account.id,active);
    mailMutationRevisionRef.current[account.id]=(mailMutationRevisionRef.current[account.id] || 0)+1;
    const result=await safeFetchJson<{success:boolean;verified:boolean;labels:string[]}>('/api/mail/provider/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:providerMessageConfig(account,active,email),label,remove,confirm:true})})
      .finally(()=>{mailMutationRevisionRef.current[account.id]=(mailMutationRevisionRef.current[account.id] || 0)+1;});
    if(!result.success || !result.verified || !Array.isArray(result.labels))throw new Error('LABEL_UNCONFIRMED');
    if(removingAccountsRef.current.has(account.id) || generation!==accountSyncGenerationRef.current[account.id])return;
    setEmails(prev=>prev.map(item=>item.accountId===account.id && item.id===email.id?{...item,providerLabels:result.labels}:item));
    setDetailEmail(prev=>prev?.accountId===account.id && prev.id===email.id?{...prev,providerLabels:result.labels}:prev);
  };
  const handleProviderLabel=(email:EmailMessage,label:string,remove:boolean)=>setConfirmModal({isOpen:true,title:t(remove?'workflow.removeProviderLabel':'workflow.addProviderLabel'),
    description:`${accounts.find(account=>account.id===email.accountId)?.email || ''} · ${email.folder} · ${email.subject} → ${label}`,confirmLabel:t('workflow.labelConfirm'),itemCount:1,
    action:()=>applyProviderLabel(email,label,remove)});
  const handleSyncGmailLabels = async () => {
    if(isSyncingLabels)return;
    const targets=filteredEmails.filter(email=>email.safeCategory && email.uid && !['drafts','trash','sent'].includes(email.folderType || ''));
    if(!targets.length){showToast(t('workflow.noLabelTargets'),'info');return;}
    setConfirmModal({isOpen:true,title:t('workflow.providerLabels'),description:t('workflow.labelPreview',{count:targets.length}),confirmLabel:t('workflow.labelConfirm'),itemCount:targets.length,
      action:async()=>{
        setIsSyncingLabels(true);
        try{
          const result=await executeConfirmedMailBatch(targets,email=>applyProviderLabel(email,email.provider==='gmail'?`Sift/${email.safeCategory}`:`Sift_${email.safeCategory}`,false),()=>{});
          showToast(t('workflow.labelBatch',{completed:result.completed.length,remaining:result.remaining.length}),result.remaining.length?'error':'success');
        }finally{setIsSyncingLabels(false);}
      }});
  };

  // Manual category update for an email
  const handleUpdateCategory = (emailId: string, category: SafeCategory) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, safeCategory: category } : e))
    );
    if (detailEmail?.id === emailId) {
      setDetailEmail((prev) => (prev ? { ...prev, safeCategory: category } : null));
    }
    showToast(`İleti kategorisi "${CATEGORIES_META[category]?.name}" olarak güncellendi.`, 'success');
  };

  // Add a new auto rule
  const handleAddRule = (newRule: Omit<AutoRule, 'id' | 'createdAt' | 'matchCount'>) => {
    const created: AutoRule = {
      ...newRule,
      id: `rule-${Date.now()}`,
      createdAt: new Date().toISOString(),
      matchCount: 0,
    };
    const updatedRules = [created, ...autoRules];
    setAutoRules(updatedRules);

    // Immediately evaluate existing emails against this new rule
    setEmails((prev) => applyRulesToEmails(prev, updatedRules));
    showToast(`"${created.patternValue}" kuralı eklendi ve mevcut iletilere uygulandı.`, 'success');
  };

  const handleToggleRule = (id: string) => {
    setAutoRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  const handleDeleteRule = (id: string) => {
    setAutoRules((prev) => prev.filter((r) => r.id !== id));
    showToast('Kural silindi.', 'info');
  };

  // Toggle category section collapse
  const toggleCategoryCollapse = (catKey: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catKey]: !prev[catKey],
    }));
  };

  // Unsubscribe from email
  const handleUnsubscribe = (email: EmailMessage) => {
    const unsubUrl = safeUnsubscribeTarget(email.listUnsubscribe) || safeUnsubscribeTarget(email.analysis?.unsubscribeUrl);
    if (!unsubUrl) {
      showToast(t('mailActions.invalidUnsubscribe'), 'error');
      return false;
    }

    if (unsubUrl.startsWith('mailto:')) {
      window.location.href = unsubUrl;
      showToast(t('mailActions.unsubscribeDraft'), 'info');
    } else {
      window.open(unsubUrl, '_blank', 'noopener,noreferrer');
      showToast(t('mailActions.unsubscribeOpened'), 'info');
    }

    setEmails((prev) =>
      prev.map((e) => {
        if (e.id === email.id && e.analysis) {
          return {
            ...e,
            analysis: {
              ...e.analysis,
              suggestedAction: 'keep_safe',
              reasoning: e.analysis.reasoning,
            },
          };
        }
        return e;
      })
    );
    return true;
  };

  // Request Trash with Mandatory User Confirmation Dialog
  const handleRequestTrash = (email: EmailMessage) => {
    setConfirmModal({
      isOpen: true,
      title: 'İletiyi Çöp Kutusuna Taşı',
      description: `"${email.subject}" başlıklı e-postayı silmek ve Çöp Kutusuna taşımak istediğinizden emin misiniz?`,
      confirmLabel: 'Çöpe Taşı',
      itemCount: 1,
      action: async () => {
        const moved=await performRemoteMailAction(email, 'trash');
        // MOVE changes folder identity/UID. Remove the verified source; background sync loads the destination.
        setEmails((prev) => relocateVerifiedMessage(prev,email,moved.destination || '','trash'));
        setSelectedEmailIds((prev) => {
          const next = new Set(prev);
          next.delete(email.id);
          return next;
        });
        if (detailEmail?.id === email.id) {
          setDetailEmail(null);
        }
        showToast('İleti çöp kutusuna taşındı.', 'success');
      },
    });
  };

  // Batch Trash
  const trashConfirmedBatch = async (messages: EmailMessage[]) => {
    const destinations=new Map<string,string>();
    const result = await executeConfirmedMailBatch(messages, async email => {const result=await performRemoteMailAction(email, 'trash');destinations.set(JSON.stringify([email.accountId,email.id]),result.destination || '');}, email => {
      setEmails(prev => relocateVerifiedMessage(prev,email,destinations.get(JSON.stringify([email.accountId,email.id])) || '','trash'));
      setSelectedEmailIds(prev => { const next = new Set(prev); next.delete(email.id); return next; });
      setDetailEmail(prev => prev?.id === email.id ? null : prev);
    });
    showToast(t(result.remaining.length ? 'mailActions.partial' : 'mailActions.completed', {
      completed: result.completed.length, remaining: result.remaining.length,
    }), result.remaining.length ? 'error' : 'success');
  };

  const handleBatchTrash = () => {
    const selectedList = emails.filter((e) => selectedEmailIds.has(e.id));
    if (selectedList.length === 0) return;

    setConfirmModal({
      isOpen: true,
      title: 'Seçilen İletileri Çöpe Taşı',
      description: `Seçili olan ${selectedList.length} adet e-postayı Çöp Kutusuna taşımak istediğinizi onaylıyor musunuz?`,
      confirmLabel: `${selectedList.length} İletiyi Çöpe Taşı`,
      itemCount: selectedList.length,
      action: async () => {
        await trashConfirmedBatch(selectedList);
      },
    });
  };

  // Unsubscribe & Purge All Sender History
  const handleUnsubscribeAndPurge = (email: EmailMessage) => {
    const matchingEmails = selectSenderHistory(email, emails);
    if (!matchingEmails.length) { showToast(t('mailActions.noSenderHistory'), 'info'); return; }

    const senderDisplayName = email.fromName || email.fromEmail || email.from;

    setConfirmModal({
      isOpen: true,
      title: t('purgeModal.title'),
      description: t('mailActions.senderPreview', {
        sender: senderDisplayName,
        account: accounts.find(account => account.id === email.accountId)?.email || email.accountId,
        count: matchingEmails.length,
      }),
      confirmLabel: t('purgeModal.confirmLabel', { count: matchingEmails.length }),
      itemCount: matchingEmails.length,
      isDestructive: true,
      action: async () => {
        if (!handleUnsubscribe(email)) return;

        await trashConfirmedBatch(matchingEmails);
      },
    });
  };

  // Batch Unsubscribe
  const handleBatchUnsubscribe = () => {
    const selectedList = emails.filter(
      (e) => selectedEmailIds.has(e.id) && (e.analysis?.unsubscribeUrl || e.listUnsubscribe)
    );

    if (selectedList.length === 0) {
      showToast('Seçilen iletiler arasında abonelikten çıkma bağlantısı olan bulunamadı.', 'info');
      return;
    }

    setConfirmModal({isOpen:true,title:t('actions.unsubscribe'),description:t('workflow.unsubscribePreview',{count:selectedList.length}),confirmLabel:t('actions.unsubscribe'),itemCount:selectedList.length,
      action:async()=>{const opened=selectedList.filter(item=>handleUnsubscribe(item)).length;showToast(t('mailActions.unsubscribeBatch',{count:opened}),'info');}});
  };

  // Mark as safe override
  const handleMarkSafe = (email: EmailMessage) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id === email.id) {
          return {
            ...e,
            safeCategory: e.safeCategory || 'other',
            analysis: {
              classification: 'safe',
              isSafe: true,
              safetyScore: 98,
              threatLevel: 'none',
              safeCategory: e.safeCategory || 'other',
              isSubscription: false,
              unsubscribeUrl: '',
              reasoning: 'Kullanıcı tarafından güvenli ve meşru ileti olarak manuel doğrulandı.',
              keyFindings: ['Kullanıcı onayıyla güvenli işaretlendi', 'Şüpheli aktivite yok'],
              suggestedAction: 'keep_safe',
              analyzedAt: new Date().toISOString(),
            },
          };
        }
        return e;
      })
    );
    if (detailEmail?.id === email.id) {
      setDetailEmail((prev) =>
        prev
          ? {
              ...prev,
              safeCategory: prev.safeCategory || 'other',
              analysis: {
                classification: 'safe',
                isSafe: true,
                safetyScore: 98,
                threatLevel: 'none',
                safeCategory: prev.safeCategory || 'other',
                isSubscription: false,
                unsubscribeUrl: '',
                reasoning: 'Kullanıcı tarafından güvenli ve meşru ileti olarak manuel doğrulandı.',
                keyFindings: ['Kullanıcı onayıyla güvenli işaretlendi', 'Şüpheli aktivite yok'],
                suggestedAction: 'keep_safe',
                analyzedAt: new Date().toISOString(),
              },
            }
          : null
      );
    }
    showToast('İleti güvenli olarak güncellendi.', 'success');
  };

  // Multi-select handlers
  const handleToggleSelect = (id: string) => {
    setSelectedEmailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Stats calculation
  const stats: ScanStats = useMemo(() => {
    let safe = 0;
    let newsletters = 0;
    let spam = 0;
    let phishing = 0;
    const categoryCounts: Record<SafeCategory, number> = {
      work: 0,
      finance: 0,
      shopping: 0,
      official: 0,
      personal: 0,
      travel: 0,
      other: 0,
    };

    for (const email of emails) {
      const isSafe =
        (email.analysis && email.analysis.isSafe && email.analysis.classification === 'safe') ||
        Boolean(email.safeCategory) ||
        (!email.labels?.includes('SPAM') && !email.from.toLowerCase().includes('bot') && !email.listUnsubscribe);

      if (email.analysis) {
        if (email.analysis.classification === 'safe') safe++;
        else if (email.analysis.classification === 'newsletter') newsletters++;
        else if (email.analysis.classification === 'spam') spam++;
        else if (email.analysis.classification === 'phishing') phishing++;
      } else {
        if (email.folderType === 'spam' || email.labels?.includes('SPAM')) spam++;
        else if (email.listUnsubscribe) newsletters++;
        else safe++;
      }

      if (isSafe && email.safeCategory && categoryCounts[email.safeCategory] !== undefined) {
        categoryCounts[email.safeCategory]++;
      }
    }

    return {
      total: emails.length,
      safe,
      newsletters,
      spam,
      phishing,
      categoryCounts,
      unsubscribedCount: 0,
      trashedCount: 0,
    };
  }, [emails]);

  // Filtered emails based on account, search, active tab and safe category
  const filteredEmails = useMemo(() => {
    return emails.filter((email) => {
      // Account filter
      if (activeAccountId !== 'all') {
        const itemAccId = email.accountId || 'acc-gmail-primary';
        if (itemAccId !== activeAccountId) return false;
      }

      // Search filter
      if (searchQuery.trim() && !matchesMailSearch(email,searchQuery)) return false;

      if (activeLabel && !email.labels?.includes(`user:${activeLabel}`)) return false;

      // Klasörler kesin olarak ayrılır; önceki klasörün iletileri asla yeni görünüme sızmaz.
      const strictFolder: Partial<Record<FilterTab, string>> = { inbox:'inbox', sent:'sent', drafts:'drafts', trash:'trash', archive:'archive', threats:'spam' };
      if (strictFolder[activeTab]) return email.folderType === strictFolder[activeTab];
      if (activeTab !== 'all' && email.folderType !== 'inbox') return false;
      if (activeTab === 'safe_only') {
        const isSafe =
          (email.analysis && email.analysis.isSafe && email.analysis.classification === 'safe') ||
          Boolean(email.safeCategory) ||
          (!email.labels?.includes('SPAM') && !email.from.toLowerCase().includes('bot'));

        if (!isSafe) return false;

        // Sub-filter by safeCategory if selected
        if (selectedCategory !== 'all') {
          return email.safeCategory === selectedCategory;
        }
        return true;
      }

      if (activeTab === 'subscriptions') {
        return (
          email.analysis?.classification === 'newsletter' ||
          email.analysis?.isSubscription ||
          Boolean(email.listUnsubscribe)
        );
      }

      return true; // 'all'
    }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [emails, activeAccountId, activeTab, searchQuery, selectedCategory, activeLabel]);

  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEmails = useMemo(() => filteredEmails.slice((safeCurrentPage-1)*pageSize, safeCurrentPage*pageSize), [filteredEmails, safeCurrentPage, pageSize]);
  const dateGroupedEmails = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startWeek = startToday - ((now.getDay() + 6) % 7) * 86400000;
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const groups = [
      {key:'today', title:t('dateGroups.today'), emails:[] as EmailMessage[]},
      {key:'week', title:t('dateGroups.week'), emails:[] as EmailMessage[]},
      {key:'month', title:t('dateGroups.month'), emails:[] as EmailMessage[]},
      {key:'older', title:t('dateGroups.older'), emails:[] as EmailMessage[]},
    ];
    for (const email of paginatedEmails) {
      const time = Date.parse(email.date);
      (time >= startToday ? groups[0] : time >= startWeek ? groups[1] : time >= startMonth ? groups[2] : groups[3]).emails.push(email);
    }
    return groups.filter(group => group.emails.length);
  }, [paginatedEmails, t]);

  const handleSelectAll = () => {
    setSelectedEmailIds(new Set(filteredEmails.map((e) => e.id)));
  };

  const mailboxType = activeTab === 'threats' ? 'spam' : activeTab;
  const visibleAccounts = accounts.filter(a => activeAccountId === 'all' || a.id === activeAccountId);
  const folderTotal = visibleAccounts.reduce((sum, account) => sum + (account.mailboxes || []).filter(m => m.type === mailboxType).reduce((n,m) => n + (m.totalMessages || 0), 0), 0);
  const folderLoaded = emails.filter(e => visibleAccounts.some(a => a.id === e.accountId) && e.folderType === mailboxType).length;
  const handleLoadMore = async () => {
    const generation = mailViewGuardRef.current.begin();
    const requestedAccountId = activeAccountId;
    const requestedMailboxType = mailboxType;
    const requestedAccounts = [...visibleAccounts];
    setIsSyncingEmails(true);
    setSyncError(null);
    try {
      for (const account of requestedAccounts) {
        const accountCredentials = credentialsByAccount[account.id];
        if (!accountCredentials) { setIsLoginModalOpen(true); continue; }
        const mailbox = account.mailboxes?.find(m => m.type === requestedMailboxType);
        if (!mailbox) continue;
        const offset = emails.filter(e => e.accountId === account.id && e.folder === mailbox.path).length;
        if (offset >= (mailbox.totalMessages || 0)) continue;
        const activeCredentials = await ensureFreshAccountCredentials(accountCredentials);
        if (activeCredentials !== accountCredentials) updateAccountCredentials(account.id, activeCredentials);
        const result = await syncEmailsFromBackend({...activeCredentials, accountId: account.id, folder: mailbox.path, offset, maxResults: pageSize});
        if (!mailViewGuardRef.current.isCurrent(generation) || activeAccountId !== requestedAccountId || mailboxType !== requestedMailboxType) return false;
        setEmails(prev => { const ids = new Set(prev.map(e => e.id)); return [...prev, ...result.messages.filter(e => !ids.has(e.id))]; });
      }
      return true;
    } catch (err: any) { setSyncError(err.message); showToast(err.message, 'error'); return false; }
    finally { if (mailViewGuardRef.current.isCurrent(generation)) setIsSyncingEmails(false); }
  };
  const handleNextPage = async () => {
    if (safeCurrentPage < totalPages) { setCurrentPage(safeCurrentPage + 1); return; }
    if (folderLoaded < folderTotal && await handleLoadMore()) setCurrentPage(safeCurrentPage + 1);
  };
  const handleFolderChange = (tab: FilterTab) => {
    mailViewGuardRef.current.invalidate();
    setActiveLabel(null); setActiveTab(tab); setCurrentPage(1); setSelectedEmailIds(new Set()); setDetailEmail(null);
  };
  const handleAccountChange = (id: string | 'all') => {
    mailViewGuardRef.current.invalidate();
    setActiveAccountId(id); setCurrentPage(1); setSelectedEmailIds(new Set()); setDetailEmail(null);
  };

  const handleDeselectAll = () => {
    setSelectedEmailIds(new Set());
  };

  // Group emails by category for the grouped view mode
  const groupedSafeEmails = useMemo(() => {
    const groups: { category: SafeCategory; emails: EmailMessage[] }[] = [
      { category: 'work', emails: [] },
      { category: 'finance', emails: [] },
      { category: 'shopping', emails: [] },
      { category: 'official', emails: [] },
      { category: 'personal', emails: [] },
      { category: 'travel', emails: [] },
      { category: 'other', emails: [] },
    ];

    for (const email of paginatedEmails) {
      const cat = email.safeCategory || 'other';
      const target = groups.find((g) => g.category === cat) || groups[groups.length - 1];
      target.emails.push(email);
    }

    return groups.filter((g) => g.emails.length > 0 || selectedCategory === g.category);
  }, [paginatedEmails, selectedCategory]);

  const getCategoryIcon = (catId: SafeCategory) => {
    switch (catId) {
      case 'work':
        return <Briefcase className="w-4 h-4 text-emerald-600" />;
      case 'finance':
        return <CreditCard className="w-4 h-4 text-blue-600" />;
      case 'shopping':
        return <ShoppingBag className="w-4 h-4 text-amber-600" />;
      case 'official':
        return <Landmark className="w-4 h-4 text-purple-600" />;
      case 'personal':
        return <UserCheck className="w-4 h-4 text-teal-600" />;
      case 'travel':
        return <Plane className="w-4 h-4 text-rose-600" />;
      case 'other':
      default:
        return <Tag className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div
      className="app-shell min-h-screen flex flex-col font-sans transition-colors duration-200"
    >
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-bounce-in max-w-md">
          <div
            className={`px-5 py-3.5 rounded-2xl shadow-xl border-0 text-xs font-semibold flex items-center gap-3 ${
              toast.type === 'success'
                ? 'bg-zinc-800 text-white'
                : toast.type === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-900 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-white shrink-0" />
            ) : (
              <Sparkles className="w-5 h-5 text-white shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 1. Thin Single-Row Header */}
      <Header
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={handleAccountChange}
        onOpenAccountModal={() => setIsMultiAccountModalOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={handleSyncEmails}
        isLoading={isLoading || isSyncingEmails}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onCompose={() => { setComposeForwardEmail(null); setIsComposeOpen(true); }}
        theme={theme}
      />

      {/* 2. Modern Desktop Layout: Left Sidebar + Right Main Workspace */}
      <div className="flex-1 flex overflow-hidden w-full max-w-full">
        {/* Sol Kenar Çubuğu (Sidebar) */}
        <Sidebar
          accounts={accounts}
          activeAccountId={activeAccountId}
          onSelectAccount={handleAccountChange}
          onRemoveAccount={handleRequestRemoveAccount}
          activeTab={activeTab}
          onTabChange={handleFolderChange}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          stats={stats}
          onOpenAccountModal={() => setIsMultiAccountModalOpen(true)}
          onOpenRulesModal={() => setIsRulesModalOpen(true)}
          onAutoCategorizeAll={handleAutoCategorizeAll}
          isCategorizing={isCategorizing}
          activeRulesCount={autoRules.filter((r) => r.isActive).length}
          onToggleAssistant={() => setIsAssistantOpen((prev) => !prev)}
          aiEnabled={aiEnabled}
          isAssistantOpen={isAssistantOpen}
          theme={theme}
          onCompose={() => { setComposeForwardEmail(null); setIsComposeOpen(true); }}
          labels={userLabels}
          activeLabel={activeLabel}
          onSelectLabel={(id) => { setActiveLabel(id); if (id) setActiveTab('all'); }}
          onCreateLabel={(name,color) => setUserLabels(prev => [...prev, {id:`label-${Date.now()}`,name,color}])}
          onDeleteLabel={(id) => { setUserLabels(prev=>prev.filter(x=>x.id!==id)); setEmails(prev=>prev.map(e=>({...e,labels:e.labels?.filter(x=>x!==`user:${id}`)}))); if(activeLabel===id)setActiveLabel(null); }}
        />

        {/* Sağ Ana İçerik Alanı: E-posta Listesi & Okuma Alanı */}
        <main className="flex-1 h-[calc(100vh-50px)] overflow-y-auto px-3 sm:px-6 py-4 pb-24 md:pb-6 space-y-4">
          {accounts.length === 0 ? (
            /* Empty State: Zero dummy data, direct prompt for user credentials */
            <div className="py-6 sm:py-10 max-w-xl mx-auto w-full flex flex-col items-center">
              <DynamicEmailLoginCard
                onLoginAndSync={handleLoginAndSync}
                isLoading={isSyncingEmails}
                theme={theme}
                errorMessage={syncError}
                onClearError={() => setSyncError(null)}
              />
            </div>
          ) : (
            <>
              {accounts.some(account => !credentialsByAccount[account.id]) && (
                <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3">
                  <span>Kayıtlı hesapların iletilerini görmek için yeniden oturum açın.</span>
                  <button type="button" onClick={() => setIsMultiAccountModalOpen(true)} className="font-semibold underline">Hesap bağla</button>
                </div>
              )}
              {syncError && <p role="alert" className="text-sm text-rose-500">{syncError}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500 rounded-xl bg-zinc-500/[.06] px-3 py-2">
                <span title={t('workflow.searchScope')}>{searchQuery.trim()?t('workflow.searchScope'):['inbox','sent','threats','drafts','trash','archive'].includes(activeTab) ? t('actions.loadedCount',{loaded:folderLoaded,total:folderTotal}) : t('actions.loaded',{count:filteredEmails.length})}</span>
                {filteredEmails.some(email=>email.safeCategory && email.uid) && <button disabled={isSyncingLabels} onClick={()=>void handleSyncGmailLabels()} className="text-xs px-2 py-1 theme-hover rounded">{t('workflow.syncProviderLabels')}</button>}
                <div className="flex items-center gap-2"><label className="text-xs">{t('pagination.perPage')} <select aria-label={t('pagination.perPage')} value={pageSize} onChange={e=>setAppearance({pageSize:Number(e.target.value) as 10|20|50|100})} className="ml-1 rounded-lg bg-zinc-500/10 px-2 py-1.5">{[10,20,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label><span className="text-xs opacity-60">{filteredEmails.length?`${(safeCurrentPage-1)*pageSize+1}–${Math.min(safeCurrentPage*pageSize,filteredEmails.length)} / ${Math.max(filteredEmails.length,folderTotal)}`:'0'}</span></div>
              </div>
              {/* Action Toolbar */}
              <FilterBar
                selectedCount={selectedEmailIds.size}
                totalCount={filteredEmails.length}
                isScanning={isScanning}
                onScanAll={handleScanAll}
                onBatchTrash={handleBatchTrash}
                onBatchUnsubscribe={handleBatchUnsubscribe}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onSyncEmails={handleSyncEmails}
                isSyncingEmails={isSyncingEmails}
                theme={theme}
                aiEnabled={aiEnabled}
              />

              {/* Email Cards List */}
              <div className="space-y-2">
          {isLoading ? (
            <div
              className="theme-panel rounded-3xl border theme-border p-12 text-center shadow-xs transition-colors"
            >
              <Sparkles className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-3" />
              <p className="text-sm font-bold tracking-tight">
                Gmail iletileri ve güvenlik başlıkları taranıyor...
              </p>
              <p className="text-xs opacity-70 mt-1">
                İçerikler doğal dil modeliyle analiz edilmeye ve kategorilerine ayrıştırılmaya hazırlanıyor.
              </p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div
              className="theme-panel rounded-3xl border theme-border p-12 text-center shadow-xs transition-colors"
            >
              <div className="w-14 h-14 rounded-2xl bg-black/5 dark:bg-white/5 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Inbox className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold tracking-tight">
                {activeTab === 'safe_only'
                  ? selectedCategory !== 'all'
                    ? `"${CATEGORIES_META[selectedCategory]?.name}" kategorisinde henüz güvenli ileti yok.`
                    : 'Şu anda güvenli olarak filtrelenmiş ileti bulunmuyor.'
                  : 'Bu filtre kriterine uygun ileti bulunamadı.'}
              </p>
              <p className="text-xs opacity-70 mt-1">
                {activeTab === 'safe_only'
                  ? 'İletileri tek tek analiz edip kategorilendirmek için "Tümünü Tek Tek NLP ile Tara" butonunu çalıştırabilirsiniz.'
                  : 'Filtreleri veya arama terimini değiştirmeyi deneyebilirsiniz.'}
              </p>
            </div>
          ) : activeTab === 'safe_only' && viewMode === 'grouped' ? (
            /* GROUPED VIEW: Categorized Accordion Sections for Safe Emails */
            <div className="space-y-4">
              {groupedSafeEmails.map(({ category, emails: catEmails }) => {
                const meta = CATEGORIES_META[category];
                const isCollapsed = collapsedCategories[category];

                return (
                  <div
                    key={category}
                    className="theme-panel rounded-3xl border theme-border shadow-xs overflow-hidden transition-colors"
                  >
                    {/* Category Group Header */}
                    <div
                      onClick={() => toggleCategoryCollapse(category)}
                      className="p-5 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10 shadow-xs">
                          {getCategoryIcon(category)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold tracking-tight">{meta.name}</h3>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${meta.color.badge}`}
                            >
                              {catEmails.length} İleti
                            </span>
                          </div>
                          <p className="text-xs opacity-60 mt-0.5">{meta.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold opacity-50 hidden sm:inline">
                          {isCollapsed ? 'Genişlet' : 'Daralt'}
                        </span>
                        {isCollapsed ? (
                          <ChevronRight className="w-5 h-5 opacity-60" />
                        ) : (
                          <ChevronDown className="w-5 h-5 opacity-60" />
                        )}
                      </div>
                    </div>

                    {/* Email items in this category */}
                    {!isCollapsed && (
                      <div className="p-3 sm:p-4 space-y-2 bg-black/[0.02] dark:bg-white/[0.02]">
                        {catEmails.map((email) => (
                          <EmailCard
                            key={email.id}
                            email={email}
                            isSelected={selectedEmailIds.has(email.id)}
                            onToggleSelect={handleToggleSelect}
                            onOpenDetail={handleOpenDetail}
                            onAnalyze={handleAnalyzeEmail}
                            onUnsubscribe={handleUnsubscribe}
                            onRequestTrash={handleRequestTrash}
                            onReply={handleReplyEmail}
                            onUpdateCategory={handleUpdateCategory}
                            onMarkSafeArchive={handleMarkSafeArchive}
                            onUnsubscribeAndPurge={handleUnsubscribeAndPurge}
                            onOpenAssistant={aiEnabled?handleOpenAssistant:undefined}
                            theme={theme}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* FLAT LIST VIEW */
            <div className="space-y-6">{dateGroupedEmails.map(group=><section key={group.key}><h2 className="sticky top-0 z-10 py-2 px-1 text-xs font-bold uppercase tracking-widest opacity-55 backdrop-blur">{group.title}</h2><div className="space-y-2">{group.emails.map(email=><EmailCard key={email.id} email={email} isSelected={selectedEmailIds.has(email.id)} onToggleSelect={handleToggleSelect} onOpenDetail={handleOpenDetail} onAnalyze={handleAnalyzeEmail} onUnsubscribe={handleUnsubscribe} onRequestTrash={handleRequestTrash} onReply={handleReplyEmail} onUpdateCategory={handleUpdateCategory} onMarkSafeArchive={handleMarkSafeArchive} onUnsubscribeAndPurge={handleUnsubscribeAndPurge} onOpenAssistant={aiEnabled?handleOpenAssistant:undefined} theme={theme}/>)}</div></section>)}</div>
          )}
        </div>
        {filteredEmails.length>0&&<div className="flex items-center justify-center gap-3 py-4"><button aria-label={t('pagination.previous')} disabled={safeCurrentPage<=1||isSyncingEmails} onClick={()=>setCurrentPage(Math.max(1,safeCurrentPage-1))} className="inline-flex items-center gap-2 rounded-xl bg-zinc-500/10 px-4 py-2 text-sm disabled:opacity-35"><ChevronLeft size={16}/>{t('pagination.previous')}</button><span className="text-xs opacity-60">{safeCurrentPage} / {Math.max(totalPages,folderLoaded<folderTotal?safeCurrentPage+1:totalPages)}</span><button aria-label={t('pagination.next')} disabled={(safeCurrentPage>=totalPages&&folderLoaded>=folderTotal)||isSyncingEmails} onClick={()=>void handleNextPage()} className="inline-flex items-center gap-2 rounded-xl bg-zinc-500/10 px-4 py-2 text-sm disabled:opacity-35">{t('pagination.next')}<ChevronRight size={16}/></button></div>}
        </>
      )}
      </main>
    </div>

      {/* Email Detail / Deep NLP Inspector Modal */}
      <EmailDetailModal
        email={detailEmail}
        onClose={() => setDetailEmail(null)}
        onAnalyze={handleAnalyzeEmail}
        onUnsubscribe={handleUnsubscribe}
        onRequestTrash={handleRequestTrash}
        onMarkSafe={handleMarkSafe}
        onReply={handleReplyEmail}
        onForward={(email)=>{setComposeForwardEmail(email);setIsComposeOpen(true)}}
        threadMessages={detailEmail?relatedThread(detailEmail,emails):[]}
        onSelectThread={handleOpenDetail}
        onContinueDraft={email=>void continueProviderDraft(email)}
        onProviderLabel={handleProviderLabel}
        onUpdateCategory={handleUpdateCategory}
        onAddRule={handleAddRule}
        onUnsubscribeAndPurge={handleUnsubscribeAndPurge}
        onOpenAssistant={aiEnabled?handleOpenAssistant:undefined}
        theme={theme}
        userLabels={userLabels}
        onToggleLabel={(emailId,labelId)=>setEmails(prev=>prev.map(email=>email.id!==emailId?email:{...email,labels:email.labels?.includes(`user:${labelId}`)?email.labels.filter(x=>x!==`user:${labelId}`):[...(email.labels||[]),`user:${labelId}`]}))}
        onDownloadAttachment={handleDownloadAttachment}
      />

      {/* Auto-Rules & Future Categorization Modal */}
      <AutoRuleModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        rules={autoRules}
        accounts={accounts}
        onAddRule={handleAddRule}
        onToggleRule={handleToggleRule}
        onDeleteRule={handleDeleteRule}
        onScopeChange={(id,accountIds,folderTypes)=>setAutoRules(prev=>prev.map(rule=>rule.id===id?{...rule,accountIds,folderTypes}:rule))}
        autoWatcherEnabled={autoWatcherEnabled}
        onToggleAutoWatcher={setAutoWatcherEnabled}
      />

      {/* Workspace Skill Mandatory Confirmation Modal for Destructive Operations */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmLabel={confirmModal.confirmLabel}
        itemCount={confirmModal.itemCount}
        isDestructive={true}
        onConfirm={async () => {
          if (confirmModal.action) {
            await confirmModal.action();
          }
          setConfirmModal({ isOpen: false, title: '', description: '' });
        }}
        onCancel={() => {
          setConfirmModal({ isOpen: false, title: '', description: '' });
        }}
        theme={theme}
      />

      {/* Multi-Account Manager Modal (Smart Auto-Discovery) */}
      <MultiAccountModal
        isOpen={isMultiAccountModalOpen}
        onClose={() => setIsMultiAccountModalOpen(false)}
        accounts={accounts}
        onConnect={handleLoginAndSync}
        onRemoveAccount={handleRequestRemoveAccount}
        onSelectAccount={(accId) => {
          handleAccountChange(accId);
          setIsMultiAccountModalOpen(false);
        }}
        activeAccountId={activeAccountId}
        onLoginGmail={() => {
          setIsMultiAccountModalOpen(false);
          setIsLoginModalOpen(true);
        }}
        theme={theme}
      />

      {/* Desktop Setup (.exe / .bat / Mac / Linux / Web PWA) Modal */}
      <DesktopSetupModal
        isOpen={isDesktopModalOpen}
        onClose={() => setIsDesktopModalOpen(false)}
        theme={theme}
      />

      {/* Local Encrypted Vault (AES-256-CBC) Modal */}
      <VaultModal
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
        theme={theme}
      />

      {/* Global Settings Modal (Appearance, Privacy, Vault, Automation, Desktop, General) */}
      <SettingsModal
        onPrepareDataTransfer={async()=>{
          if(!mailCacheLoaded||isSyncingEmails||removingAccountsRef.current.size) throw new Error('Mail data is not ready for backup.');
          mailDataTransferRef.current=true;
          await mailCacheWriteRef.current;
          await saveLocalMailSnapshot(mailSnapshot(emailsRef.current,composeDraft,replyDrafts,accounts,userLabels,autoRules));
        }}
        onCompleteDataTransfer={()=>{mailDataTransferRef.current=false;setMailPersistenceRevision(v=>v+1);}}
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onOpenVaultModal={() => setIsVaultModalOpen(true)}
        onOpenDesktopModal={() => setIsDesktopModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onAIStatusChange={setAIEnabled}
        onOpenAIHelp={() => {
          if (!aiEnabled) return;
          setSelectedAssistantEmail(null);
          setIsSettingsModalOpen(false);
          setIsAssistantOpen(true);
        }}
      />

      {/* Dynamic In-Memory IMAP Connection Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl">
            <DynamicEmailLoginCard
              onLoginAndSync={handleLoginAndSync}
              isLoading={isSyncingEmails}
              theme={theme}
              errorMessage={syncError}
              onClearError={() => setSyncError(null)}
              isModal={true}
              onClose={() => setIsLoginModalOpen(false)}
              initialEmail={sessionCredentials?.email || ''}
            />
          </div>
        </div>
      )}

      {/* Human-in-the-Loop AI Action Confirmation Modal */}
      <AIActionModal
        isOpen={isAIActionModalOpen}
        action={proposedAIAction}
        onConfirm={handleExecuteAIAction}
        onClose={() => {
          setIsAIActionModalOpen(false);
          setProposedAIAction(null);
        }}
        theme={theme}
      />

      {/* Mobile Bottom Navigation Bar (md:hidden) */}
      <BottomNavigationBar
        activeTab={activeTab}
        onSelectTab={handleFolderChange}
        stats={stats}
        onOpenAccounts={() => setIsMultiAccountModalOpen(true)}
        onOpenVault={() => setIsVaultModalOpen(true)}
        theme={theme}
      />

      {/* Floating AI Assistant Trigger Button (Bottom Right) */}
      {aiEnabled && !isAssistantOpen && (
        <motion.button
          id="floating-ai-assistant-btn"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsAssistantOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-5 z-30 flex items-center gap-2 px-4 py-3 rounded-full bg-linear-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs shadow-xl shadow-emerald-500/25 transition-all border border-emerald-400/30"
          title={t('ui.assistant.open')}
        >
          <Sparkles className="w-4 h-4 text-emerald-100 animate-pulse" />
          <span className="tracking-wide">{t('ai.assistant')}</span>
        </motion.button>
      )}

      {/* Sift AI Assistant Side Drawer */}
      <AnimatePresence>
        {aiEnabled && isAssistantOpen && (
          <AIAssistantDrawer
            isOpen={isAssistantOpen}
            onClose={() => setIsAssistantOpen(false)}
            selectedEmail={selectedAssistantEmail}
            onSelectEmailForReply={handleSelectEmailForReply}
            theme={theme}
          />
        )}
      </AnimatePresence>

      {/* Direct Send Email Reply Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        draft={composeDraft}
        onDraftChange={setComposeDraft}
        accounts={accounts}
        contacts={knownContacts}
        credentials={credentialsByAccount}
        onCredentialsUpdated={updateAccountCredentials}
        theme={theme}
        availableEmails={emails}
        initialForward={composeForwardEmail}
        onSent={({to,cc,subject,body,bodyHtml,accountId,messageId}) => {
          const account=accountsRef.current.find(a=>a.id===accountId);
          if(!account || removingAccountsRef.current.has(accountId))return;
          setEmails(prev=>[{id:`sent-${crypto.randomUUID()}`,accountId,provider:account?.provider,from:account?.email||'',fromEmail:account?.email||'',to:mailAddresses([to]),cc:mailAddresses([cc || '']),messageId,pendingSent:true,subject,date:new Date().toISOString(),snippet:body.slice(0,160),bodyText:body,bodyHtml,isRead:true,folder:'Sent',folderType:'sent',labels:['SENT']},...prev]);
          showToast(t('ui.compose.sent'), 'success');
        }}
      />

      <EmailReplyModal
        isOpen={isReplyModalOpen}
        onClose={() => setIsReplyModalOpen(false)}
        email={replyModalEmail}
        initialDraft={replyModalDraft}
        savedDraft={replyModalEmail ? replyDrafts[replyModalEmail.id] : undefined}
        onDraftChange={handleReplyDraftChange}
        accounts={accounts}
        activeAccountId={activeAccountId === 'all' ? (accounts[0]?.id || '') : activeAccountId}
        credentialsByAccount={credentialsByAccount}
        onCredentialsUpdated={updateAccountCredentials}
        onSent={({accountId,to,cc,subject,body,messageId,references,inReplyTo})=>{
          const account=accountsRef.current.find(item=>item.id===accountId);
          if(!account || removingAccountsRef.current.has(accountId))return;
          setEmails(prev=>[{id:`sent-${crypto.randomUUID()}`,accountId,messageId,pendingSent:true,provider:account.provider,
            from:account.email,fromEmail:account.email,to:mailAddresses([to]),cc:mailAddresses([cc]),subject,bodyText:body,snippet:body.slice(0,160),
            references,inReplyTo,date:new Date().toISOString(),isRead:true,folder:'Sent',folderType:'sent',labels:['SENT']},...prev]);
        }}
        onOpenAssistantForPolish={(draftText) => {
          setIsReplyModalOpen(false);
          if (replyModalEmail) {
            handleOpenAssistant(replyModalEmail);
          }
        }}
        onSuccess={(sentId) => {
          showToast(`Yanıt başarıyla gönderildi (ID: ${sentId.slice(0, 10)}...)`, 'success');
        }}
        theme={theme}
      />
    </div>
  );
}
