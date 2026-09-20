import React from 'react';
import {
  Briefcase,
  CreditCard,
  ShoppingBag,
  Landmark,
  UserCheck,
  Plane,
  Tag,
  Sparkles,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Layers,
  CheckCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SafeCategory } from '../types';
import { CATEGORIES_META } from '../../core/rules/categoryManager';
import { AppTheme } from './Header';

interface CategoryFilterBarProps {
  selectedCategory: SafeCategory | 'all';
  onSelectCategory: (category: SafeCategory | 'all') => void;
  categoryCounts: Record<SafeCategory, number>;
  totalSafeCount: number;
  viewMode: 'flat' | 'grouped';
  onToggleViewMode: (mode: 'flat' | 'grouped') => void;
  onOpenRulesModal: () => void;
  onAutoCategorizeAll: () => void;
  onSyncGmailLabels?: () => void;
  isCategorizing: boolean;
  isSyncingLabels?: boolean;
  activeRulesCount: number;
  hasGmailAccess: boolean;
  theme?: AppTheme;
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  totalSafeCount,
  viewMode,
  onToggleViewMode,
  onOpenRulesModal,
  onAutoCategorizeAll,
  onSyncGmailLabels,
  isCategorizing,
  isSyncingLabels,
  activeRulesCount,
  hasGmailAccess,
  theme = 'light',
}) => {
  const { t } = useTranslation();

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const getCategoryIcon = (catId: SafeCategory) => {
    switch (catId) {
      case 'work':
        return <Briefcase className="w-4 h-4" />;
      case 'finance':
        return <CreditCard className="w-4 h-4" />;
      case 'shopping':
        return <ShoppingBag className="w-4 h-4" />;
      case 'official':
        return <Landmark className="w-4 h-4" />;
      case 'personal':
        return <UserCheck className="w-4 h-4" />;
      case 'travel':
        return <Plane className="w-4 h-4" />;
      case 'other':
      default:
        return <Tag className="w-4 h-4" />;
    }
  };

  const categoriesList: SafeCategory[] = [
    'work',
    'finance',
    'shopping',
    'official',
    'personal',
    'travel',
    'other',
  ];

  return (
    <div
      className={`rounded-3xl p-5 sm:p-6 space-y-4 border-0 transition-colors ${
        isOled ? 'bg-[#121212] text-zinc-100' : 'bg-slate-900 text-white shadow-xs'
      }`}
    >
      {/* Top Header: Title & Auto Rule & Sync Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">Güvenli İletileri Akıllı Gruplandırma</h2>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400">
                NLP & Kural Motoru
              </span>
            </div>
            <p className="text-xs opacity-70 mt-0.5">
              Hem mevcut eski iletileri hem de bundan sonra gelenleri otomatik olarak ait oldukları kategoriye ayırır.
            </p>
          </div>
        </div>

        {/* Action buttons - Large single-handed friendly touch targets */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Categorize All with AI */}
          <button
            id="auto-categorize-btn"
            onClick={onAutoCategorizeAll}
            disabled={isCategorizing || totalSafeCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-xs transition-colors disabled:opacity-50 min-h-[44px]"
            title="Tüm güvenli e-postaları NLP ve kurallarla anında kategorize et"
          >
            <Sparkles className={`w-4 h-4 ${isCategorizing ? 'animate-spin' : ''}`} />
            {isCategorizing ? 'Kategorize Ediliyor...' : 'Tümünü Kategorize Et'}
          </button>

          {/* Sync to Gmail Labels if user is connected */}
          {hasGmailAccess && onSyncGmailLabels && (
            <button
              id="sync-gmail-labels-btn"
              onClick={onSyncGmailLabels}
              disabled={isSyncingLabels}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors disabled:opacity-50 min-h-[44px]"
              title="Kategorileri Gmail'de etiket olarak oluştur ve iletileri etiketle"
            >
              <CheckCheck className={`w-4 h-4 text-emerald-400 ${isSyncingLabels ? 'animate-spin' : ''}`} />
              {isSyncingLabels ? 'Senkronize Ediliyor...' : 'Gmail ile Eşitle'}
            </button>
          )}

          {/* Rules & Future Automations Modal Trigger */}
          <button
            id="open-rules-modal-btn"
            onClick={onOpenRulesModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors min-h-[44px]"
          >
            <SlidersHorizontal className="w-4 h-4 text-blue-400" />
            <span>Gelecek İletiler İçin Kurallar</span>
            <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-300 text-[10px] font-bold flex items-center justify-center">
              {activeRulesCount}
            </span>
          </button>
        </div>
      </div>

      {/* Category Pills & View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-1">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* All Safe Pill */}
          <button
            onClick={() => onSelectCategory('all')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[42px] ${
              selectedCategory === 'all'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'bg-white/10 hover:bg-white/15 text-white'
            }`}
          >
            <span>Tüm Güvenli</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-black/20">
              {totalSafeCount}
            </span>
          </button>

          {/* Individual Categories */}
          {categoriesList.map((catKey) => {
            const count = categoryCounts[catKey] || 0;
            const isSelected = selectedCategory === catKey;

            return (
              <button
                key={catKey}
                onClick={() => onSelectCategory(catKey)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[42px] ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'bg-white/10 hover:bg-white/15 text-white'
                }`}
              >
                {getCategoryIcon(catKey)}
                <span>{t(`categories.${catKey}`)}</span>
                {count > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-black/20">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View Mode Toggle: Flat vs Grouped */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-black/30 self-start md:self-auto">
          <button
            onClick={() => onToggleViewMode('flat')}
            className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[38px] ${
              viewMode === 'flat' ? 'bg-white/20 text-white font-bold' : 'opacity-60 hover:opacity-100'
            }`}
            title="Düz Liste Görünümü"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Düz Liste</span>
          </button>
          <button
            onClick={() => onToggleViewMode('grouped')}
            className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[38px] ${
              viewMode === 'grouped' ? 'bg-white/20 text-white font-bold' : 'opacity-60 hover:opacity-100'
            }`}
            title="Kategoriye Göre Gruplandırılmış Görünüm"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Gruplu Klasörler</span>
          </button>
        </div>
      </div>
    </div>
  );
};
