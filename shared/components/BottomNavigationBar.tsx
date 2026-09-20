import React from 'react';
import {
  ShieldCheck,
  Newspaper,
  AlertTriangle,
  Users,
  KeyRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FilterTab, ScanStats } from '../types';
import { AppTheme } from './Header';

interface BottomNavigationBarProps {
  activeTab: FilterTab;
  onSelectTab: (tab: FilterTab) => void;
  stats: ScanStats;
  onOpenAccounts: () => void;
  onOpenVault: () => void;
  theme?: AppTheme;
}

export const BottomNavigationBar: React.FC<BottomNavigationBarProps> = ({
  activeTab,
  onSelectTab,
  stats,
  onOpenAccounts,
  onOpenVault,
  theme = 'light',
}) => {
  const { t } = useTranslation();

  const isOled = theme === 'oled';
  const isDark = theme !== 'light';

  const getBarBg = () => {
    if (isOled || isDark) return 'theme-panel theme-border';
    return 'theme-panel theme-border shadow-sm';
  };

  return (
    <div className={`md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md px-3 py-2 safe-area-bottom border-t transition-colors ${getBarBg()}`}>
      <div className="grid grid-cols-5 gap-1.5 max-w-md mx-auto">
        {/* Safe / Clean Inbox */}
        <button
          onClick={() => onSelectTab('safe_only')}
          className={`flex flex-col items-center justify-center py-2 rounded-2xl transition-all min-h-[50px] ${
            activeTab === 'safe_only'
              ? 'bg-emerald-500/20 text-emerald-500 font-bold'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <ShieldCheck className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] truncate max-w-[56px]">{t('nav.safeOnly')}</span>
        </button>

        {/* Subscriptions */}
        <button
          onClick={() => onSelectTab('subscriptions')}
          className={`relative flex flex-col items-center justify-center py-2 rounded-2xl transition-all min-h-[50px] ${
            activeTab === 'subscriptions'
              ? 'bg-blue-500/20 text-blue-500 font-bold'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <Newspaper className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] truncate max-w-[56px]">{t('nav.subscriptions')}</span>
          {stats.newsletters > 0 && (
            <span className="absolute top-1 right-2 px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[9px] font-bold">
              {stats.newsletters}
            </span>
          )}
        </button>

        {/* Threats & Spam */}
        <button
          onClick={() => onSelectTab('threats')}
          className={`relative flex flex-col items-center justify-center py-2 rounded-2xl transition-all min-h-[50px] ${
            activeTab === 'threats'
              ? 'bg-rose-500/20 text-rose-500 font-bold'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <AlertTriangle className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] truncate max-w-[56px]">{t('nav.threats')}</span>
          {(stats.spam > 0 || stats.phishing > 0) && (
            <span className="absolute top-1 right-2 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-bold">
              {stats.spam + stats.phishing}
            </span>
          )}
        </button>

        {/* Multi-Accounts */}
        <button
          onClick={onOpenAccounts}
          className="flex flex-col items-center justify-center py-2 rounded-2xl transition-all min-h-[50px] opacity-70 hover:opacity-100"
        >
          <Users className="w-5 h-5 mb-0.5 text-slate-400" />
          <span className="text-[10px] truncate max-w-[56px]">{t('nav.accounts')}</span>
        </button>

        {/* Local Encrypted Vault */}
        <button
          onClick={onOpenVault}
          className="flex flex-col items-center justify-center py-2 rounded-2xl transition-all min-h-[50px] opacity-70 hover:opacity-100"
        >
          <KeyRound className="w-5 h-5 mb-0.5 text-emerald-500" />
          <span className="text-[10px] truncate max-w-[56px]">{t('nav.vault')}</span>
        </button>
      </div>
    </div>
  );
};
