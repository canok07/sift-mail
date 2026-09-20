import React from 'react';
import { ShieldCheck, MailWarning, Newspaper, CheckCircle2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScanStats } from '../types';
import { AppTheme } from './Header';

interface MetricsBarProps {
  stats: ScanStats;
  isScanning: boolean;
  scanProgress: { current: number; total: number } | null;
  onFilterClick: (tab: 'all' | 'safe_only' | 'subscriptions' | 'threats') => void;
  activeTab: 'all' | 'safe_only' | 'subscriptions' | 'threats';
  theme?: AppTheme;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({
  stats,
  isScanning,
  scanProgress,
  onFilterClick,
  activeTab,
  theme = 'light',
}) => {
  const { t } = useTranslation();

  const isOled = theme === 'oled';
  const isDark = theme !== 'light';

  const safePercentage = stats.total > 0 ? Math.round((stats.safe / stats.total) * 100) : 0;

  const getCardBg = (tabKey: string) => {
    const isActive = activeTab === tabKey;
    if (isOled) {
      return isActive
        ? 'bg-[#1e1e1e] ring-2 ring-emerald-500/50 text-white'
        : 'bg-[#121212] hover:bg-[#181818] text-zinc-200';
    }
    if (isDark) {
      return isActive
        ? 'bg-slate-800 ring-2 ring-emerald-500/50 text-white'
        : 'bg-slate-900 hover:bg-slate-850 text-slate-200';
    }
    return isActive
      ? 'bg-white ring-2 ring-emerald-600/30 shadow-md text-slate-900'
      : 'bg-white hover:bg-slate-50 text-slate-800 shadow-xs';
  };

  return (
    <div className="space-y-4">
      {/* Live Scan Progress Bar */}
      {isScanning && scanProgress && (
        <div
          className={`p-5 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-0 transition-colors ${
            isOled ? 'bg-[#141414] text-white' : 'bg-slate-900 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-emerald-400 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">
                {t('metrics.scanningProgress')}
              </p>
              <p className="text-xs text-slate-300 mt-0.5">
                {t('metrics.scanProgressDesc', {
                  current: scanProgress.current,
                  total: scanProgress.total,
                })}
              </p>
            </div>
          </div>
          <div className="w-full sm:w-56 bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-emerald-400 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Metrics Cards Grid - Borderless Zen Mode with Generous Padding */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Emails */}
        <button
          onClick={() => onFilterClick('all')}
          className={`text-left p-5 sm:p-6 rounded-3xl border-0 transition-all ${getCardBg('all')}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold opacity-75">{t('metrics.totalEmails')}</span>
            <span className="p-2 rounded-xl bg-black/5 dark:bg-white/10 text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">{stats.total}</span>
            <span className="text-[11px] font-medium opacity-60">
              {stats.safe + stats.newsletters + stats.spam + stats.phishing} {t('metrics.examined')}
            </span>
          </div>
        </button>

        {/* Safe Emails */}
        <button
          onClick={() => onFilterClick('safe_only')}
          className={`text-left p-5 sm:p-6 rounded-3xl border-0 transition-all ${getCardBg('safe_only')}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {t('metrics.safeEmails')}
            </span>
            <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {stats.safe}
            </span>
            <span className="text-[11px] font-bold text-emerald-600/80 dark:text-emerald-400/80">
              %{safePercentage} {t('metrics.verified')}
            </span>
          </div>
        </button>

        {/* Newsletters & Subscriptions */}
        <button
          onClick={() => onFilterClick('subscriptions')}
          className={`text-left p-5 sm:p-6 rounded-3xl border-0 transition-all ${getCardBg('subscriptions')}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
              {t('metrics.newsletters')}
            </span>
            <span className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
              <Newspaper className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-600 dark:text-blue-400">
              {stats.newsletters}
            </span>
            <span className="text-[11px] font-medium opacity-60">
              {t('metrics.canUnsubscribe')}
            </span>
          </div>
        </button>

        {/* Threats & Risky */}
        <button
          onClick={() => onFilterClick('threats')}
          className={`text-left p-5 sm:p-6 rounded-3xl border-0 transition-all ${getCardBg('threats')}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
              {t('metrics.riskyEmails')}
            </span>
            <span className="p-2 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <MailWarning className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-rose-600 dark:text-rose-400">
              {stats.spam + stats.phishing}
            </span>
            <span className="text-[11px] font-bold text-rose-600/80 dark:text-rose-400/80">
              {t('metrics.threats')}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
