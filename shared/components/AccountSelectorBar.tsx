import React from 'react';
import {
  Layers,
  Settings2,
  Monitor,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConnectedAccount } from '../types';
import { PROVIDERS_META } from '../../core/mail/providerManager';
import { AppTheme } from './Header';

interface AccountSelectorBarProps {
  accounts: ConnectedAccount[];
  activeAccountId: string | 'all';
  onSelectAccount: (accountId: string | 'all') => void;
  onOpenManageModal: () => void;
  onOpenDesktopModal: () => void;
  theme?: AppTheme;
}

export const AccountSelectorBar: React.FC<AccountSelectorBarProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onOpenManageModal,
  onOpenDesktopModal,
  theme = 'light',
}) => {
  const { t } = useTranslation();

  const isOled = theme === 'oled';
  const isDark = theme !== 'light';

  const getBarBg = () => {
    if (isOled || isDark) return 'theme-panel theme-border';
    return 'theme-panel theme-border shadow-xs';
  };

  const getPillBg = (isSelected: boolean) => {
    if (isSelected) {
      return isOled
        ? 'bg-[#222222] text-white font-bold ring-1 ring-emerald-400/50'
        : 'bg-slate-900 text-white font-bold shadow-xs dark:bg-white dark:text-slate-900';
    }
    return isOled
      ? 'bg-[#141414] hover:bg-[#1a1a1a] text-zinc-300'
      : isDark
      ? 'bg-slate-850 hover:bg-slate-800 text-slate-300'
      : 'bg-slate-100 hover:bg-slate-200 text-slate-700';
  };

  return (
    <div className={`px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 text-xs transition-colors border-0 ${getBarBg()}`}>
      {/* Account Pills */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
        <span className="font-bold uppercase text-[10px] tracking-wider shrink-0 opacity-60 mr-1">
          Posta Kutusu:
        </span>

        {/* All Accounts / Unified Inbox */}
        <button
          onClick={() => onSelectAccount('all')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all shrink-0 min-h-[42px] ${getPillBg(
            activeAccountId === 'all'
          )}`}
        >
          <Layers className="w-4 h-4 text-emerald-400" />
          <span>Tüm Kutular (Birleşik)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-bold">
            {accounts.length}
          </span>
        </button>

        {/* Individual accounts */}
        {accounts.map((acc) => {
          const meta = PROVIDERS_META[acc.provider];
          const isSelected = activeAccountId === acc.id;

          return (
            <button
              key={acc.id}
              onClick={() => onSelectAccount(acc.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all shrink-0 min-h-[42px] ${getPillBg(
                isSelected
              )}`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${meta.badgeClass.split(' ')[0]}`} />
              <span className="font-semibold">{acc.displayName || acc.email}</span>
              <span className="opacity-60 text-[11px] hidden sm:inline">&lt;{acc.email}&gt;</span>
            </button>
          );
        })}
      </div>

      {/* Quick Setup and Account modal trigger */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenManageModal}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors min-h-[42px]"
          title="Tüm Posta Hesaplarını Yönet"
        >
          <Settings2 className="w-4 h-4" />
          <span className="hidden sm:inline">Hesapları Düzenle</span>
        </button>
      </div>
    </div>
  );
};
