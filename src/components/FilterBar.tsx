import React from 'react';
import {
  Sparkles,
  Trash2,
  CheckSquare,
  Square,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { AppTheme } from './Header';

interface FilterBarProps {
  selectedCount: number;
  totalCount: number;
  isScanning: boolean;
  onScanAll: () => void;
  onBatchTrash: () => void;
  onBatchUnsubscribe: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSyncEmails?: () => void;
  isSyncingEmails?: boolean;
  theme?: AppTheme;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedCount,
  totalCount,
  isScanning,
  onScanAll,
  onBatchTrash,
  onBatchUnsubscribe,
  onSelectAll,
  onDeselectAll,
  onSyncEmails,
  isSyncingEmails = false,
  theme = 'light',
}) => {
  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const barBg = isOled
    ? 'bg-[#000000] border-b border-white/10 text-zinc-300'
    : isDark
    ? 'bg-[#121214] border-b border-white/10 text-zinc-300'
    : 'bg-white border-b border-zinc-200/80 text-zinc-700';

  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <div
      className={`px-3 sm:px-4 py-2 flex items-center justify-between gap-3 text-xs transition-colors shrink-0 rounded-2xl ${barBg}`}
    >
      {/* Sol: Seçim Kontrolleri & Toplu İşlemler */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={isAllSelected ? onDeselectAll : onSelectAll}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 font-semibold text-zinc-700 dark:text-zinc-300 transition-colors"
          title={isAllSelected ? 'Tüm seçimleri kaldır' : 'Tüm iletileri seç'}
        >
          {isAllSelected ? (
            <CheckSquare className="w-4 h-4 text-emerald-500" />
          ) : selectedCount > 0 ? (
            <CheckSquare className="w-4 h-4 text-emerald-500/70" />
          ) : (
            <Square className="w-4 h-4 opacity-50" />
          )}
          <span>{isAllSelected ? 'Tümü Seçili' : 'Tümünü Seç'}</span>
        </button>

        {selectedCount > 0 && (
          <div className="flex items-center gap-2 animate-fade-in pl-2 border-l border-black/10 dark:border-white/10">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              {selectedCount} seçildi
            </span>

            {/* Toplu Çöpe At */}
            <button
              onClick={onBatchTrash}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 font-semibold text-[11px] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Çöpe At</span>
            </button>

            {/* Toplu Abonelikten Çık */}
            <button
              onClick={onBatchUnsubscribe}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-600 dark:text-sky-400 font-semibold text-[11px] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abonelikten Çık</span>
            </button>
          </div>
        )}
      </div>

      {/* Sağ: Toplam Sayı, Mailleri Senkronize Et & Tümünü AI ile Tara */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
          {totalCount} ileti
        </span>

        {/* Mailleri Senkronize Et Butonu */}
        {onSyncEmails && (
          <button
            onClick={onSyncEmails}
            disabled={isSyncingEmails}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
            title="IMAP gelen kutusundaki güncel ve eski e-postaları senkronize et"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncingEmails ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">
              {isSyncingEmails ? 'Senkronize Ediliyor...' : 'Mailleri Senkronize Et'}
            </span>
            <span className="sm:hidden">
              {isSyncingEmails ? 'Yükleniyor...' : 'Senkronize Et'}
            </span>
          </button>
        )}

        {/* AI ile Tara Butonu */}
        <button
          onClick={onScanAll}
          disabled={isScanning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
          title="Tüm postaları Gemini AI güvenlik ve phishing taramasından geçir"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{isScanning ? 'Taranıyor...' : 'AI ile Tara'}</span>
        </button>
      </div>
    </div>
  );
};
