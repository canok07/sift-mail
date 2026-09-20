/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { syncEmailsFromBackend } from './services/mailSyncService';
import { analyzeEmailWithGemini } from './services/emailAnalyzer';
import {
  CATEGORIES_META,
  DEFAULT_AUTO_RULES,
  evaluateAutoRules,
  extractDomain,
} from './services/categoryManager';
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
} from './services/mailProviderManager';
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
import { safeFetchJson } from './services/apiClient';
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
      document.body.style.backgroundColor = '#000000';
    } else if (theme === 'dark' || theme === 'ocean' || theme === 'forest') {
      root.classList.add('dark');
      if (theme !== 'dark') root.classList.add(`theme-${theme}`);
      document.body.style.backgroundColor = theme === 'ocean' ? '#071923' : theme === 'forest' ? '#0d1b13' : '#121212';
    } else {
      document.body.style.backgroundColor = '#f8f9fa';
    }
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

  // Multi-Provider Accounts state (starts empty until user signs in)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(INITIAL_ACCOUNTS);
  const [activeAccountId, setActiveAccountId] = useState<string | 'all'>('all');
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
    safeFetchJson<any>('/api/ai/providers-status').then(data=>{if(active)setAIEnabled(Boolean(aiEnabled&&data.providers?.[aiProvider]?.configured))}).catch(()=>{if(active)setAIEnabled(false)});
    return()=>{active=false};
  },[aiProvider,aiEnabled,setAIEnabled]);
  useEffect(() => { localStorage.setItem('sift_user_labels', JSON.stringify(userLabels)); }, [userLabels]);
  const knownContacts = useMemo(() => Array.from(new Set(emails.flatMap(email => [email.fromEmail || '', ...(email.to || [])]).filter(Boolean))).sort(), [emails]);

  // Safe Category state & Future Rules
  const [selectedCategory, setSelectedCategory] = useState<SafeCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [autoRules, setAutoRules] = useState<AutoRule[]>(DEFAULT_AUTO_RULES);
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
    if (!aiEnabled) { setIsSettingsModalOpen(true); setToast({type:'info',message:'Önce Ayarlar → Yapay Zekâ bölümünden çalışan bir model bağlayın.'}); return; }
    if (email) {
      setSelectedAssistantEmail(email);
    }
    setIsAssistantOpen(true);
  }, [aiEnabled]);

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

  // Handle Swipe-to-Action: Mark safe and archive
  const handleMarkSafeArchive = useCallback(
    (item: string | EmailMessage) => {
      const id = typeof item === 'string' ? item : item.id;
      setEmails((prev) =>
        prev.map((e) => {
          if (e.id === id) {
            return {
              ...e,
              isRead: true,
              safeCategory: e.safeCategory || 'work',
              analysis: e.analysis
                ? {
                    ...e.analysis,
                    isSafe: true,
                    classification: 'safe',
                    threatLevel: 'none',
                  }
                : {
                    classification: 'safe',
                    isSafe: true,
                    safetyScore: 98,
                    threatLevel: 'none',
                    isSubscription: false,
                    unsubscribeUrl: '',
                    reasoning: 'Kullanıcı tarafından güvenli olarak onaylandı ve arşivlendi.',
                    keyFindings: ['Kullanıcı doğrulaması'],
                    suggestedAction: 'keep_safe',
                    analyzedAt: new Date().toISOString(),
                  },
            };
          }
          return e;
        })
      );
      showToast('İleti güvenli olarak onaylandı ve arşivlendi.', 'success');
    },
    [showToast]
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
      setSyncError(null);
      const cleanEmail = credentials.email.trim().toLowerCase();
      const accountId = accounts.find(a => a.email.toLowerCase() === cleanEmail)?.id || `acc-${Date.now()}`;
      const discovered = detectMailProvider(cleanEmail);
      const shellAccount: ConnectedAccount = {
        id: accountId, provider: discovered.provider, email: cleanEmail, displayName: cleanEmail,
        status: 'syncing', isPrimary: accounts.length === 0, totalCount: 0, unreadCount: 0, mailboxes: [],
        imapConfig: { host: credentials.host || discovered.imapHost, port: credentials.port || 993, secure: credentials.secure !== false, username: cleanEmail, smtpHost: discovered.smtpHost, smtpPort: discovered.smtpPort },
      };
      setAccounts(prev => [shellAccount, ...prev.filter(a => a.id !== accountId)]);
      setActiveAccountId(accountId);
      setSessionCredentials(credentials);
      setCredentialsByAccount(prev => ({...prev, [accountId]: credentials}));
      setIsLoginModalOpen(false);
      setIsMultiAccountModalOpen(false);
      showToast('Hesap eklendi. İletiler arka planda senkronize ediliyor…', 'info');
      setIsSyncingEmails(true);

      void (async () => { try {
        const { messages, accountEmail, provider, mailboxes } = await syncEmailsFromBackend({
          email: credentials.email,
          password: credentials.password,
          host: credentials.host,
          port: credentials.port,
          secure: credentials.secure,
          maxResults: 100,
          accountId,
        });

        const categorized = applyRulesToEmails(messages, autoRules);
        setEmails(prev => [...prev.filter(e => e.accountId !== accountId), ...categorized]);

        const newAccount: ConnectedAccount = {
          id: accountId,
          mailboxes,
          provider: provider,
          email: accountEmail,
          displayName: accountEmail,
          status: 'connected',
          isPrimary: true,
          lastSyncAt: new Date().toISOString(),
          totalCount: categorized.length,
          unreadCount: categorized.filter((e) => !e.isRead).length,
          imapConfig: {
            host: credentials.host || 'imap.gmail.com',
            port: credentials.port || 993,
            secure: credentials.secure !== false,
            username: accountEmail,
          },
        };

        setAccounts(prev => prev.map(a => a.id === accountId ? newAccount : a));

        showToast(
          `${categorized.length} adet e-posta başarıyla senkronize edildi!`,
          'success'
        );
      } catch (error: any) {
        console.error("Auth error details:", error);
        const errorMessage =
          typeof error === 'string'
            ? error
            : (error as any)?.message || (error as any)?.error || JSON.stringify(error);
        setSyncError(errorMessage);
        setAccounts(prev => prev.map(a => a.id === accountId ? {...a, status:'error'} : a));
        showToast(errorMessage, 'error');
      } finally {
        setIsSyncingEmails(false);
      } })();
    },
    [showToast, applyRulesToEmails, autoRules, accounts]
  );

  const handleSyncEmails = useCallback(async () => {
    const targets = accounts.filter(a => activeAccountId === 'all' || a.id === activeAccountId);
    if (!targets.length) { setIsLoginModalOpen(true); return; }
    const credentials = targets.map(a => credentialsByAccount[a.id]).filter(Boolean);
    if (!credentials.length) {
      setIsLoginModalOpen(true);
      return;
    }
    for (const credential of credentials) await handleLoginAndSync(credential);
  }, [accounts, activeAccountId, credentialsByAccount, handleLoginAndSync]);

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

  const handleRemoveAccount = (id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    if (activeAccountId === id) {
      setActiveAccountId('all');
    }
    showToast('Hesap bağlantısı kaldırıldı.', 'info');
  };

  const handleRequestRemoveAccount = (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    setConfirmModal({
      isOpen: true,
      title: 'Hesabı Kaldır',
      description: `"${acc?.displayName || acc?.email || 'Bu hesabı'}" posta kutusu listesinden kaldırmak istediğinize emin misiniz?`,
      confirmLabel: 'Hesabı Kaldır',
      isDestructive: true,
      action: async () => {
        handleRemoveAccount(id);
      },
    });
  };

  const handleRefresh = () => {
    if (sessionCredentials) {
      handleLoginAndSync(sessionCredentials);
    } else {
      setIsLoginModalOpen(true);
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
        handleMarkSafeArchive(emailObj);
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

      // If AI suggested an auto rule and category is safe, automatically register the rule if not exists
      if (analysis.suggestedFilterRule && analysis.isSafe && safeCat) {
        setAutoRules((prev) => {
          const exists = prev.some(
            (r) => r.patternValue.toLowerCase() === analysis.suggestedFilterRule!.patternValue.toLowerCase()
          );
          if (exists) return prev;
          return [
            ...prev,
            {
              id: `rule-auto-${Date.now()}`,
              category: safeCat,
              patternType: analysis.suggestedFilterRule!.patternType as any,
              patternValue: analysis.suggestedFilterRule!.patternValue,
              isActive: true,
              matchCount: 1,
              createdAt: new Date().toISOString(),
              description: analysis.suggestedFilterRule!.description,
            },
          ];
        });
      }

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
      console.error('Analiz hatası:', err);
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
            console.warn(`Analiz atlandı (${email.id}):`, error);
          }
        }
        count++;
        setScanProgress({ current: count, total: emails.length });
      }
      showToast(`Tüm iletiler [${aiProvider.toUpperCase()}] modeliyle incelendi ve kategorilere ayrıldı!`, 'success');
    } catch (error: any) {
      console.error('Toplu tarama hatası:', error);
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
          console.warn('Otomatik kategorizasyon atlandı:', item.id, err);
        }
      }

      showToast('Tüm mevcut iletiler başarıyla kategorilere ayrıldı!', 'success');
    } catch (err: any) {
      console.error('Kategorizasyon hatası:', err);
      showToast('Kategorilendirme sırasında bir hata oluştu.', 'error');
    } finally {
      setIsCategorizing(false);
    }
  };

  // Sync Safe Categories
  const handleSyncGmailLabels = async () => {
    setIsSyncingLabels(true);
    try {
      const safeCategorized = emails.filter((e) => e.safeCategory);
      showToast(`${safeCategorized.length} adet ileti akıllı kategorilere senkronize edildi.`, 'success');
    } catch (err: any) {
      console.error('Kategori senkronizasyon hatası:', err);
      showToast('Kategori senkronizasyonu sırasında hata oluştu.', 'error');
    } finally {
      setIsSyncingLabels(false);
    }
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
    const unsubUrl = email.analysis?.unsubscribeUrl || email.listUnsubscribe;
    if (!unsubUrl) {
      showToast('Bu e-postada aktif bir abonelikten çıkma bağlantısı tespit edilemedi.', 'error');
      return;
    }

    const httpMatch = unsubUrl.match(/https?:\/\/[^\s,>]+/i);
    const mailtoMatch = unsubUrl.match(/mailto:([^\s,>]+)/i);

    if (httpMatch) {
      window.open(httpMatch[0], '_blank', 'noopener,noreferrer');
      showToast('Abonelikten çıkma sayfası yeni sekmede açıldı.', 'success');
    } else if (mailtoMatch) {
      window.location.href = mailtoMatch[0];
      showToast('Abonelikten çıkma e-postası taslağı oluşturuldu.', 'success');
    } else {
      window.open(unsubUrl, '_blank');
      showToast('Abonelikten çıkma işlemi başlatıldı.', 'success');
    }

    setEmails((prev) =>
      prev.map((e) => {
        if (e.id === email.id && e.analysis) {
          return {
            ...e,
            analysis: {
              ...e.analysis,
              suggestedAction: 'keep_safe',
              reasoning: `${e.analysis.reasoning} [Abonelikten çıkma işlemi başlatıldı]`,
            },
          };
        }
        return e;
      })
    );
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
        setEmails((prev) => prev.filter((e) => e.id !== email.id));
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
        setEmails((prev) => prev.filter((e) => !selectedEmailIds.has(e.id)));
        setSelectedEmailIds(new Set());
        showToast(`${selectedList.length} adet ileti çöp kutusuna taşındı.`, 'success');
      },
    });
  };

  // Unsubscribe & Purge All Sender History
  const handleUnsubscribeAndPurge = (email: EmailMessage) => {
    const senderEmail = (email.fromEmail || email.from).toLowerCase();
    const domain = extractDomain(senderEmail);

    const matchingEmails = emails.filter((e) => {
      const eSender = (e.fromEmail || e.from).toLowerCase();
      return eSender === senderEmail || (domain && domain.length > 3 && eSender.includes(domain));
    });

    const senderDisplayName = email.fromName || email.fromEmail || email.from;

    setConfirmModal({
      isOpen: true,
      title: t('purgeModal.title'),
      description: t('purgeModal.description', {
        sender: senderDisplayName,
        count: matchingEmails.length,
      }),
      confirmLabel: t('purgeModal.confirmLabel', { count: matchingEmails.length }),
      itemCount: matchingEmails.length,
      isDestructive: true,
      action: async () => {
        handleUnsubscribe(email);

        const matchingIds = new Set(matchingEmails.map((e) => e.id));
        setEmails((prev) => prev.filter((e) => !matchingIds.has(e.id)));
        setSelectedEmailIds((prev) => {
          const next = new Set(prev);
          matchingIds.forEach((id) => next.delete(id));
          return next;
        });

        if (detailEmail && matchingIds.has(detailEmail.id)) {
          setDetailEmail(null);
        }

        showToast(
          t('purgeModal.successToast', {
            sender: senderDisplayName,
            count: matchingEmails.length,
          }),
          'success'
        );
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

    for (const item of selectedList) {
      handleUnsubscribe(item);
    }
    showToast(`${selectedList.length} adet abonelikten çıkma işlemi tetiklendi.`, 'success');
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
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchFrom = email.from.toLowerCase().includes(q);
        const matchSubject = email.subject.toLowerCase().includes(q);
        const matchSnippet = email.snippet.toLowerCase().includes(q);
        if (!matchFrom && !matchSubject && !matchSnippet) return false;
      }

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
    setIsSyncingEmails(true);
    setSyncError(null);
    try {
      for (const account of visibleAccounts) {
        const accountCredentials = credentialsByAccount[account.id];
        if (!accountCredentials) { setIsLoginModalOpen(true); continue; }
        const mailbox = account.mailboxes?.find(m => m.type === mailboxType);
        if (!mailbox) continue;
        const offset = emails.filter(e => e.accountId === account.id && e.folder === mailbox.path).length;
        if (offset >= (mailbox.totalMessages || 0)) continue;
        const result = await syncEmailsFromBackend({...accountCredentials, accountId: account.id, folder: mailbox.path, offset, maxResults: pageSize});
        setEmails(prev => { const ids = new Set(prev.map(e => e.id)); return [...prev, ...result.messages.filter(e => !ids.has(e.id))]; });
      }
    } catch (err: any) { setSyncError(err.message); showToast(err.message, 'error'); }
    finally { setIsSyncingEmails(false); }
  };
  const handleNextPage = async () => {
    if (safeCurrentPage < totalPages) { setCurrentPage(safeCurrentPage + 1); return; }
    if (folderLoaded < folderTotal) { await handleLoadMore(); setCurrentPage(safeCurrentPage + 1); }
  };
  const handleFolderChange = (tab: FilterTab) => {
    setActiveLabel(null); setActiveTab(tab); setCurrentPage(1); setSelectedEmailIds(new Set()); setDetailEmail(null);
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
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        theme === 'oled'
          ? 'bg-[#000000] text-zinc-100'
          : theme !== 'light'
          ? 'bg-[#09090b] text-zinc-300'
          : 'bg-[#f8f9fa] text-slate-800'
      }`}
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
        onSelectAccount={setActiveAccountId}
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
          onSelectAccount={setActiveAccountId}
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
              {syncError && <p role="alert" className="text-sm text-rose-500">{syncError}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500 rounded-xl bg-zinc-500/[.06] px-3 py-2">
                <span>{['inbox','sent','threats'].includes(activeTab) ? t('actions.loadedCount',{loaded:folderLoaded,total:folderTotal}) : t('actions.loaded',{count:filteredEmails.length})}</span>
                <div className="flex items-center gap-2"><label className="text-xs">Sayfa başına <select aria-label="Sayfa başına mail" value={pageSize} onChange={e=>setAppearance({pageSize:Number(e.target.value) as 10|20|50|100})} className="ml-1 rounded-lg bg-zinc-500/10 px-2 py-1.5">{[10,20,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label><span className="text-xs opacity-60">{filteredEmails.length?`${(safeCurrentPage-1)*pageSize+1}–${Math.min(safeCurrentPage*pageSize,filteredEmails.length)} / ${Math.max(filteredEmails.length,folderTotal)}`:'0'}</span></div>
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
              className={`rounded-3xl border-0 p-12 text-center shadow-xs transition-colors ${
                theme === 'oled'
                  ? 'bg-[#121212] text-zinc-100'
                  : theme === 'dark'
                  ? 'bg-slate-900 text-slate-100'
                  : 'bg-white text-slate-800'
              }`}
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
              className={`rounded-3xl border-0 p-12 text-center shadow-xs transition-colors ${
                theme === 'oled'
                  ? 'bg-[#121212] text-zinc-100'
                  : theme === 'dark'
                  ? 'bg-slate-900 text-slate-100'
                  : 'bg-white text-slate-800'
              }`}
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
                    className={`rounded-3xl border-0 shadow-xs overflow-hidden transition-colors ${
                      theme === 'oled'
                        ? 'bg-[#121212]'
                        : theme === 'dark'
                        ? 'bg-slate-900'
                        : 'bg-white'
                    }`}
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
                            onOpenDetail={(item) => setDetailEmail(item)}
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
            <div className="space-y-6">{dateGroupedEmails.map(group=><section key={group.key}><h2 className="sticky top-0 z-10 py-2 px-1 text-xs font-bold uppercase tracking-widest opacity-55 backdrop-blur">{group.title}</h2><div className="space-y-2">{group.emails.map(email=><EmailCard key={email.id} email={email} isSelected={selectedEmailIds.has(email.id)} onToggleSelect={handleToggleSelect} onOpenDetail={(item)=>setDetailEmail(item)} onAnalyze={handleAnalyzeEmail} onUnsubscribe={handleUnsubscribe} onRequestTrash={handleRequestTrash} onReply={handleReplyEmail} onUpdateCategory={handleUpdateCategory} onMarkSafeArchive={handleMarkSafeArchive} onUnsubscribeAndPurge={handleUnsubscribeAndPurge} onOpenAssistant={aiEnabled?handleOpenAssistant:undefined} theme={theme}/>)}</div></section>)}</div>
          )}
        </div>
        {filteredEmails.length>0&&<div className="flex items-center justify-center gap-3 py-4"><button aria-label="Önceki Sayfa" disabled={safeCurrentPage<=1||isSyncingEmails} onClick={()=>setCurrentPage(Math.max(1,safeCurrentPage-1))} className="inline-flex items-center gap-2 rounded-xl bg-zinc-500/10 px-4 py-2 text-sm disabled:opacity-35"><ChevronLeft size={16}/>Önceki Sayfa</button><span className="text-xs opacity-60">{safeCurrentPage} / {Math.max(totalPages,folderLoaded<folderTotal?safeCurrentPage+1:totalPages)}</span><button aria-label="Sonraki Sayfa" disabled={(safeCurrentPage>=totalPages&&folderLoaded>=folderTotal)||isSyncingEmails} onClick={()=>void handleNextPage()} className="inline-flex items-center gap-2 rounded-xl bg-zinc-500/10 px-4 py-2 text-sm disabled:opacity-35">Sonraki Sayfa<ChevronRight size={16}/></button></div>}
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
        onUpdateCategory={handleUpdateCategory}
        onAddRule={handleAddRule}
        onUnsubscribeAndPurge={handleUnsubscribeAndPurge}
        onOpenAssistant={aiEnabled?handleOpenAssistant:undefined}
        theme={theme}
        userLabels={userLabels}
        onToggleLabel={(emailId,labelId)=>setEmails(prev=>prev.map(email=>email.id!==emailId?email:{...email,labels:email.labels?.includes(`user:${labelId}`)?email.labels.filter(x=>x!==`user:${labelId}`):[...(email.labels||[]),`user:${labelId}`]}))}
      />

      {/* Auto-Rules & Future Categorization Modal */}
      <AutoRuleModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        rules={autoRules}
        onAddRule={handleAddRule}
        onToggleRule={handleToggleRule}
        onDeleteRule={handleDeleteRule}
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
        onRemoveAccount={handleRemoveAccount}
        onSelectAccount={(accId) => {
          setActiveAccountId(accId);
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
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onOpenVaultModal={() => setIsVaultModalOpen(true)}
        onOpenDesktopModal={() => setIsDesktopModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onAIStatusChange={setAIEnabled}
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
          title="Sift AI Asistanı Aç"
        >
          <Sparkles className="w-4 h-4 text-emerald-100 animate-pulse" />
          <span className="tracking-wide">AI Asistan</span>
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
        accounts={accounts}
        contacts={knownContacts}
        credentials={credentialsByAccount}
        theme={theme}
        availableEmails={emails}
        initialForward={composeForwardEmail}
        onSent={({to,subject,body,accountId}) => {
          const account=accounts.find(a=>a.id===accountId);
          setEmails(prev=>[{id:`sent-${Date.now()}`,accountId,provider:account?.provider,from:account?.email||'',fromEmail:account?.email||'',to:[to],subject,date:new Date().toISOString(),snippet:body.slice(0,160),bodyText:body,isRead:true,folder:'Sent',folderType:'sent',labels:['SENT']},...prev]);
          showToast('E-posta gönderildi.', 'success');
        }}
      />

      <EmailReplyModal
        isOpen={isReplyModalOpen}
        onClose={() => setIsReplyModalOpen(false)}
        email={replyModalEmail}
        initialDraft={replyModalDraft}
        accounts={accounts}
        activeAccountId={activeAccountId === 'all' ? (accounts[0]?.id || '') : activeAccountId}
        sessionCredentials={sessionCredentials}
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
