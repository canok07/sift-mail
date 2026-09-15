import React from 'react';
import { ShieldCheck, RefreshCw, Settings, Search, X, Users } from 'lucide-react';
import { ConnectedAccount } from '../types';

export type AppTheme = 'light' | 'dark' | 'oled';

interface HeaderProps {
  accounts?: ConnectedAccount[];
  activeAccountId?: string | 'all';
  onSelectAccount?: (accountId: string | 'all') => void;
  onOpenAccountModal?: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  onOpenSettingsModal: () => void;
  theme?: AppTheme;
}

export const Header: React.FC<HeaderProps> = ({
  accounts = [],
  activeAccountId = 'all',
  onOpenAccountModal,
  searchQuery,
  onSearchChange,
  onRefresh,
  isLoading,
  onOpenSettingsModal,
  theme = 'light',
}) => {
  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const headerBg = isOled
    ? 'bg-[#000000] text-zinc-100 border-b border-white/10'
    : isDark
    ? 'bg-[#111113] text-zinc-100 border-b border-white/10'
    : 'bg-white text-zinc-800 border-b border-zinc-200/80';

  const btnBg = isOled
    ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
    : isDark
    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700';

  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  return (
    <header className={`sticky top-0 z-30 transition-colors ${headerBg} shrink-0`}>
      <div className="w-full px-3 sm:px-5 py-2.5 flex items-center justify-between gap-3 sm:gap-6 min-h-[50px]">
        {/* 1. Logo (Sol) */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
              isDark ? 'bg-zinc-800 text-emerald-400' : 'bg-zinc-900 text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-black tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">
              Sift
            </span>
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest hidden sm:inline">
              Mail
            </span>
          </div>
        </div>

        {/* 2. Merkez: Geniş Arama Çubuğu */}
        <div className="relative flex-1 max-w-md md:max-w-lg lg:max-w-xl">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="E-postalarda ara (gönderen, konu, içerik)..."
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-hidden focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 3. Hızlı Araçlar: Hesap Seçici, Yenile, Ayarlar */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenAccountModal && (
            <button
              onClick={onOpenAccountModal}
              title="Hesapları Yönet veya Değiştir"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors text-xs font-semibold ${btnBg}`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="hidden sm:inline max-w-[110px] truncate">
                {activeAccountId === 'all'
                  ? `Tüm Kutular (${accounts.length})`
                  : activeAccount?.displayName?.replace(/\s*\(.*?\)/, '') || activeAccount?.email || 'Hesap'}
              </span>
            </button>
          )}

          {/* Yenile İkonu */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Gelen Kutusunu Yenile"
            className={`p-2 rounded-xl transition-colors disabled:opacity-50 ${btnBg}`}
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-500' : ''}`}
            />
          </button>

          {/* Ayarlar İkonu */}
          <button
            onClick={onOpenSettingsModal}
            title="Ayarlar"
            className={`p-2 rounded-xl transition-colors ${btnBg}`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
