import React from 'react';
import {
  Plus,
  Inbox,
  ShieldCheck,
  Newspaper,
  AlertTriangle,
  Briefcase,
  CreditCard,
  ShoppingBag,
  Landmark,
  UserCheck,
  Plane,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Lock,
  Trash2,
} from 'lucide-react';
import { FilterTab, SafeCategory, ScanStats, ConnectedAccount } from '../types';
import { PROVIDERS_META } from '../services/mailProviderManager';
import { AppTheme } from './Header';

interface SidebarProps {
  accounts?: ConnectedAccount[];
  activeAccountId?: string | 'all';
  onSelectAccount: (accountId: string | 'all') => void;
  onRemoveAccount?: (accountId: string) => void;
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  selectedCategory: SafeCategory | 'all';
  onSelectCategory: (category: SafeCategory | 'all') => void;
  stats: ScanStats;
  onOpenAccountModal: () => void;
  onOpenRulesModal: () => void;
  onAutoCategorizeAll: () => void;
  isCategorizing: boolean;
  activeRulesCount: number;
  onToggleAssistant?: () => void;
  isAssistantOpen?: boolean;
  theme?: AppTheme;
}

export const Sidebar: React.FC<SidebarProps> = ({
  accounts = [],
  activeAccountId = 'all',
  onSelectAccount = () => {},
  onRemoveAccount,
  activeTab,
  onTabChange,
  selectedCategory,
  onSelectCategory,
  stats,
  onOpenAccountModal,
  onOpenRulesModal,
  onAutoCategorizeAll,
  isCategorizing,
  activeRulesCount = 0,
  onToggleAssistant,
  isAssistantOpen = false,
  theme = 'light',
}) => {
  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  // Safe accounts list
  const safeAccounts = accounts || [];

  const sidebarBg = isOled
    ? 'bg-[#000000] border-r border-white/10 text-zinc-300'
    : isDark
    ? 'bg-[#111113] border-r border-white/10 text-zinc-300'
    : 'bg-[#fafafa] border-r border-zinc-200/80 text-zinc-700';

  const getItemClass = (isActive: boolean) => {
    if (isActive) {
      return isOled
        ? 'bg-zinc-800/90 text-white font-bold ring-1 ring-emerald-400/40 shadow-xs'
        : isDark
        ? 'bg-zinc-800 text-white font-bold shadow-xs'
        : 'bg-zinc-900 text-white font-bold shadow-xs';
    }
    return isOled
      ? 'hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200'
      : isDark
      ? 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
      : 'hover:bg-zinc-200/60 text-zinc-600 hover:text-zinc-900';
  };

  const getSubItemClass = (isActive: boolean) => {
    if (isActive) {
      return isOled
        ? 'bg-emerald-500/20 text-emerald-300 font-bold'
        : isDark
        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
        : 'bg-emerald-50 text-emerald-800 font-bold';
    }
    return isOled
      ? 'hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200'
      : isDark
      ? 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
      : 'hover:bg-zinc-200/50 text-zinc-600 hover:text-zinc-900';
  };

  const inboxItems = [
    {
      id: 'all' as FilterTab,
      label: 'Tüm İletiler',
      icon: Inbox,
      count: stats?.total || 0,
      badgeColor: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300',
    },
    {
      id: 'safe_only' as FilterTab,
      label: 'Güvenli İletiler',
      icon: ShieldCheck,
      count: stats?.safe || 0,
      badgeColor: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'subscriptions' as FilterTab,
      label: 'Bülten & Tanıtım',
      icon: Newspaper,
      count: stats?.newsletters || 0,
      badgeColor: 'bg-sky-500/20 text-sky-600 dark:text-sky-400',
    },
    {
      id: 'spam_phishing' as FilterTab,
      label: 'Spam & Tehdit',
      icon: AlertTriangle,
      count: (stats?.spam || 0) + (stats?.phishing || 0),
      badgeColor: 'bg-rose-500/20 text-rose-600 dark:text-rose-400',
    },
  ];

  const categories = [
    {
      id: 'all' as const,
      label: 'Tüm Kategoriler',
      icon: Layers,
      count: stats?.safe || 0,
      color: 'text-zinc-400',
    },
    {
      id: 'work' as const,
      label: 'İş & Projeler',
      icon: Briefcase,
      count: stats?.categoryCounts?.work || 0,
      color: 'text-emerald-500',
    },
    {
      id: 'finance' as const,
      label: 'Finans & Fatura',
      icon: CreditCard,
      count: stats?.categoryCounts?.finance || 0,
      color: 'text-blue-500',
    },
    {
      id: 'shopping' as const,
      label: 'Sipariş & Kargo',
      icon: ShoppingBag,
      count: stats?.categoryCounts?.shopping || 0,
      color: 'text-amber-500',
    },
    {
      id: 'official' as const,
      label: 'Resmi & Bildirim',
      icon: Landmark,
      count: stats?.categoryCounts?.official || 0,
      color: 'text-purple-500',
    },
    {
      id: 'personal' as const,
      label: 'Kişisel & Sosyal',
      icon: UserCheck,
      count: stats?.categoryCounts?.personal || 0,
      color: 'text-teal-500',
    },
    {
      id: 'travel' as const,
      label: 'Seyahat & Bilet',
      icon: Plane,
      count: stats?.categoryCounts?.travel || 0,
      color: 'text-rose-500',
    },
  ];

  return (
    <aside
      className={`w-64 shrink-0 hidden md:flex flex-col h-[calc(100vh-50px)] transition-colors ${sidebarBg} select-none`}
    >
      {/* 1. Üst Aksiyon: "Sift AI Asistanı" */}
      {onToggleAssistant && (
        <div className="p-3 border-b border-black/5 dark:border-white/5">
          <button
            onClick={onToggleAssistant}
            className={`w-full py-2 px-3 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-between border ${
              isAssistantOpen
                ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 ring-1 ring-emerald-500/30'
                : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-200 border-black/5 dark:border-white/10'
            }`}
            title="Sift Yapay Zeka Asistanını Aç/Kapat"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span>Sift AI Asistanı</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              Gemini
            </span>
          </button>
        </div>
      )}

      {/* 2. Scroll edilebilir Menü Öğeleri */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-5 no-scrollbar">
        {/* BÖLÜM 1: POSTA KUTULARI (MAILBOXES) - Dikey Menü */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Posta Kutuları
            </span>
            <button
              onClick={onOpenAccountModal}
              title="Yeni Hesap Ekle / Yönet"
              className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400 hover:text-emerald-500 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {/* 1. Tüm Kutular (Birleşik Kutu / Unified Inbox) */}
            <button
              onClick={() => onSelectAccount('all')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all ${getItemClass(
                activeAccountId === 'all'
              )}`}
              title="Tüm Kutular (Birleşik Görünüm)"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers className="w-4 h-4 shrink-0 text-emerald-500" />
                <span className="font-semibold truncate">Tüm Kutular</span>
              </div>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                  activeAccountId === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                {safeAccounts.length}
              </span>
            </button>

            {/* 2. Tekil Bağlı Hesaplar (Renkli Noktalar & Logolar) */}
            {safeAccounts.map((acc) => {
              const isSelected = activeAccountId === acc.id;
              const meta =
                PROVIDERS_META && acc?.provider && PROVIDERS_META[acc.provider]
                  ? PROVIDERS_META[acc.provider]
                  : PROVIDERS_META?.imap || {
                      accentColor: '#10b981',
                      name: 'IMAP',
                      shortName: 'IMAP',
                    };

              return (
                <div
                  key={acc.id}
                  className={`group/acc relative w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all ${getItemClass(
                    isSelected
                  )}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectAccount(acc.id)}
                    className="flex-1 flex items-center gap-2.5 min-w-0 text-left outline-hidden cursor-pointer"
                    title={`${acc.displayName} (${acc.email})`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs ring-1 ring-black/10 dark:ring-white/10"
                      style={{ backgroundColor: meta.accentColor }}
                    />
                    <div className="flex flex-col items-start text-left min-w-0 leading-tight">
                      <span className="truncate max-w-[130px] font-medium">
                        {(acc.displayName || acc.email || 'Hesap').replace(
                          /\s*\(.*?\)/,
                          ''
                        )}
                      </span>
                      <span className="text-[10px] opacity-60 truncate max-w-[130px] font-mono">
                        {acc.email}
                      </span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {acc.isPrimary && (
                      <span className="text-[9px] px-1 rounded-sm bg-black/10 dark:bg-white/10 opacity-70 font-medium group-hover/acc:hidden">
                        Ana
                      </span>
                    )}
                    {onRemoveAccount && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveAccount(acc.id);
                        }}
                        className="p-1 rounded-lg opacity-0 group-hover/acc:opacity-100 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-500 transition-all cursor-pointer"
                        title="Hesabı Kaldır"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 3. Şık "+ Hesap Ekle" Butonu (Tek + ikonu ile) */}
            <button
              onClick={onOpenAccountModal}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 mt-1.5 rounded-xl border border-dashed border-black/10 dark:border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all group"
              title="Yeni E-posta Hesabı Ekle"
            >
              <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
              <span>Hesap Ekle</span>
            </button>
          </div>
        </div>

        {/* BÖLÜM 2: Gelen Kutusu & Güvenlik Filtreleri */}
        <div>
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Gelen Kutusu
          </span>
          <div className="mt-1.5 space-y-0.5">
            {inboxItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all ${getItemClass(
                    isActive
                  )}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : item.badgeColor
                    }`}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* BÖLÜM 3: Akıllı Kategoriler (Gemini NLP) */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Akıllı Kategoriler
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenRulesModal}
                title={`Kural Yöneticisi (${activeRulesCount} aktif)`}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onAutoCategorizeAll}
                disabled={isCategorizing}
                title="Tüm postaları Gemini AI ile kategorilere ayır"
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-emerald-500 transition-colors disabled:opacity-50"
              >
                <Sparkles
                  className={`w-3.5 h-3.5 ${isCategorizing ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          <div className="space-y-0.5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    if (activeTab !== 'safe_only' && cat.id !== 'all') {
                      onTabChange('safe_only');
                    }
                    onSelectCategory(cat.id);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all ${getSubItemClass(
                    isActive
                  )}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${cat.color}`} />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  {(cat.count || 0) > 0 && (
                    <span className="text-[10px] font-mono text-zinc-400 font-semibold shrink-0">
                      {cat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Alt Durum Çubuğu */}
      <div className="p-3 border-t border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01]">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate">AES-256 & Gemini</span>
          </div>
          <span
            id="sidebar-version-badge"
            className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border border-black/5 dark:border-white/5 shrink-0"
            title="Sürüm 0.5.1"
          >
            v0.5.1
          </span>
        </div>
      </div>
    </aside>
  );
};
