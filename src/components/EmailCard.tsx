import React, { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import {
  ShieldCheck,
  AlertTriangle,
  MailWarning,
  Newspaper,
  ExternalLink,
  Trash2,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Eye,
  Briefcase,
  CreditCard,
  ShoppingBag,
  Landmark,
  UserCheck,
  Plane,
  Tag,
  Truck,
  Archive,
  RotateCcw,
  Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmailMessage, SafeCategory } from '../types';
import { CATEGORIES_META } from '../services/categoryManager';
import { PROVIDERS_META } from '../services/mailProviderManager';
import { AppTheme } from './Header';

interface EmailCardProps {
  email: EmailMessage;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenDetail: (email: EmailMessage) => void;
  onAnalyze: (email: EmailMessage) => void;
  onUnsubscribe: (email: EmailMessage) => void;
  onRequestTrash: (email: EmailMessage) => void;
  onReply?: (email: EmailMessage) => void;
  onUpdateCategory?: (emailId: string, category: SafeCategory) => void;
  onMarkSafeArchive?: (email: EmailMessage) => void;
  onUnsubscribeAndPurge?: (email: EmailMessage) => void;
  onOpenAssistant?: (email: EmailMessage) => void;
  theme?: AppTheme;
}

export const EmailCard: React.FC<EmailCardProps> = ({
  email,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onAnalyze,
  onUnsubscribe,
  onRequestTrash,
  onReply,
  onUpdateCategory,
  onMarkSafeArchive,
  onUnsubscribeAndPurge,
  onOpenAssistant,
  theme = 'light',
}) => {
  const { t } = useTranslation();
  const x = useMotionValue(0);

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  // Background action opacities based on swipe direction
  const rightActionOpacity = useTransform(x, [20, 90], [0, 1]);
  const leftActionOpacity = useTransform(x, [-90, -20], [1, 0]);

  const analysis = email.analysis;
  const currentCategory: SafeCategory | undefined =
    email.safeCategory || analysis?.safeCategory;

  const getCategoryIcon = (catId?: SafeCategory) => {
    switch (catId) {
      case 'work':
        return <Briefcase className="w-3 h-3 text-emerald-500" />;
      case 'finance':
        return <CreditCard className="w-3 h-3 text-blue-500" />;
      case 'shopping':
        return <ShoppingBag className="w-3 h-3 text-amber-500" />;
      case 'official':
        return <Landmark className="w-3 h-3 text-purple-500" />;
      case 'personal':
        return <UserCheck className="w-3 h-3 text-teal-500" />;
      case 'travel':
        return <Plane className="w-3 h-3 text-rose-500" />;
      default:
        return <Tag className="w-3 h-3 text-slate-500" />;
    }
  };

  const getScoreBadge = () => {
    if (!analysis) {
      return (
        <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-black/5 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 flex items-center gap-1 shrink-0">
          <Sparkles className="w-3 h-3 opacity-60" />
          {t('security.unscanned')}
        </span>
      );
    }

    const score = analysis.safetyScore;
    let colorClass = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
    let icon = <CheckCircle2 className="w-3 h-3" />;

    if (score >= 75) {
      colorClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold';
      icon = <ShieldCheck className="w-3 h-3 text-emerald-500" />;
    } else if (score >= 45) {
      colorClass = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold';
      icon = <Newspaper className="w-3 h-3 text-blue-500" />;
    } else if (score >= 20) {
      colorClass = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold';
      icon = <AlertTriangle className="w-3 h-3 text-amber-500" />;
    } else {
      colorClass = 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold';
      icon = <MailWarning className="w-3 h-3 text-rose-500" />;
    }

    return (
      <span className={`px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1 shrink-0 ${colorClass}`}>
        {icon}
        %{score} {analysis.classification === 'safe' ? t('security.scoreSafe') : analysis.classification === 'newsletter' ? t('security.scoreNewsletter') : t('security.scoreRisk')}
      </span>
    );
  };

  const isSafeItem = analysis?.isSafe || currentCategory !== undefined;
  const hasUnsubscribe = Boolean(analysis?.unsubscribeUrl || email.listUnsubscribe);
  const shipping = analysis?.orderShippingInfo;
  const billing = analysis?.financeBillingInfo;

  const getCardBg = () => {
    if (isOled) return 'bg-[#111113] text-zinc-200 hover:bg-[#161619] shadow-none';
    if (isDark) return 'bg-[#18181b] text-zinc-200 hover:bg-[#202024] shadow-xs';
    return 'bg-white text-zinc-800 hover:bg-zinc-50/80 shadow-xs border border-zinc-100 dark:border-0';
  };

  return (
    <div className="relative overflow-hidden rounded-2xl group transition-all">
      {/* Swipe Action Background: Swipe Right -> Onayla / Arşivle */}
      <motion.div
        style={{ opacity: rightActionOpacity }}
        className="absolute inset-y-0 left-0 w-1/2 bg-emerald-600 text-white flex items-center justify-start pl-6 z-0 rounded-2xl"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onMarkSafeArchive) {
              onMarkSafeArchive(email);
            } else if (onUpdateCategory) {
              onUpdateCategory(email.id, 'work');
            }
          }}
          className="flex items-center gap-2 font-bold text-xs text-white"
        >
          <Archive className="w-4 h-4 text-emerald-100" />
          <span>{t('actions.markSafeArchive')}</span>
        </button>
      </motion.div>

      {/* Swipe Action Background: Swipe Left -> Abonelikten Çık / Sil */}
      <motion.div
        style={{ opacity: leftActionOpacity }}
        className="absolute inset-y-0 right-0 w-1/2 bg-rose-600 text-white flex items-center justify-end pr-6 z-0 rounded-2xl"
      >
        <div className="flex items-center gap-2">
          {hasUnsubscribe && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnsubscribe(email);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-rose-700 font-bold text-xs shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('actions.unsubscribe')}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequestTrash(email);
            }}
            className="flex items-center gap-1.5 font-bold text-xs text-white px-2"
          >
            <Trash2 className="w-4 h-4 text-rose-200" />
            <span>{t('actions.trash')}</span>
          </button>
        </div>
      </motion.div>

      {/* Main Draggable Card Container - Compact Desktop Form Factor */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -140, right: 140 }}
        dragElastic={0.12}
        style={{ x }}
        className={`relative z-10 rounded-2xl p-3 sm:p-3.5 transition-all duration-150 ${getCardBg()} ${
          isSelected ? 'ring-2 ring-emerald-500/50' : ''
        }`}
      >
        <div className="flex items-start gap-2.5 sm:gap-3">
          {/* Checkbox */}
          <div className="pt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(email.id)}
              className="w-4 h-4 rounded-md border-0 bg-black/10 dark:bg-white/15 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          {/* Main Content Area - Tight Vertical Hierarchy */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* 1. Üst Satır: Sağlayıcı, Gönderen, Kategori ve Tarih/Puan */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                {/* Mail Sağlayıcı Etiketi */}
                {email.provider && PROVIDERS_META[email.provider] && (
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold shrink-0 ${PROVIDERS_META[email.provider].badgeClass}`}
                    title={`Sağlayıcı: ${PROVIDERS_META[email.provider].name}`}
                  >
                    {PROVIDERS_META[email.provider].shortName}
                  </span>
                )}

                {/* Gönderen Adı & Adresi */}
                <span className="text-xs font-bold truncate text-zinc-900 dark:text-zinc-100">
                  {email.fromName || email.from}
                </span>
                {email.fromEmail && (
                  <span className="text-[11px] opacity-50 truncate font-mono hidden md:inline">
                    &lt;{email.fromEmail}&gt;
                  </span>
                )}

                {/* Kategori Rozeti / Seçimi */}
                {isSafeItem && currentCategory && (
                  <div className="inline-flex items-center">
                    {onUpdateCategory ? (
                      <select
                        value={currentCategory}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateCategory(email.id, e.target.value as SafeCategory)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 border-0 cursor-pointer text-zinc-700 dark:text-zinc-300"
                      >
                        {Object.entries(CATEGORIES_META).map(([k]) => (
                          <option key={k} value={k}>
                            {t(`categories.${k}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {getCategoryIcon(currentCategory)}
                        {t(`categories.${currentCategory}`)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Sağ: Tarih & Güvenlik Skoru */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-zinc-400 font-mono hidden sm:inline">
                  {email.date}
                </span>
                {getScoreBadge()}
              </div>
            </div>

            {/* 2. Konu Başlığı */}
            <div
              onClick={() => onOpenDetail(email)}
              className="cursor-pointer group/title"
            >
              <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate group-hover/title:text-emerald-500 transition-colors leading-snug">
                {email.subject}
              </h3>
            </div>

            {/* 3. İçerik Özeti (Snippet) - Maksimum 1-2 Satır & Text-Overflow */}
            <p
              onClick={() => onOpenDetail(email)}
              className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 sm:line-clamp-2 cursor-pointer leading-snug"
              title={email.snippet}
            >
              {email.snippet}
            </p>

            {/* 4. Ekstra Etiketler: Kargo / Fatura (Kompakt Tek Satır) */}
            {(shipping || billing) && (
              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                {shipping && shipping.trackingNumber && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                    <Truck className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>
                      Kargo: <strong>{shipping.carrier || 'Kargo'}</strong> — {shipping.trackingNumber}
                    </span>
                  </div>
                )}

                {billing && billing.dueAmount && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">
                    <CreditCard className="w-3 h-3 text-blue-500 shrink-0" />
                    <span>
                      Fatura: <strong>{billing.dueAmount}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 5. Zarif Tek Satır NLP Değerlendirmesi (Kutu yerine ince ve şeffaf satır) */}
            {analysis && analysis.reasoning && (
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate pt-0.5">
                <Sparkles className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">
                  NLP:
                </span>
                <span className="truncate italic">
                  {analysis.reasoning}
                </span>
              </div>
            )}

            {/* 6. Alt Aksiyon Satırı: Çöpe At, Abonelikten Çık, Detaylı İncele */}
            <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-black/5 dark:border-white/5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Abonelikten Çık */}
                {hasUnsubscribe && (
                  <button
                    id={`unsub-${email.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnsubscribe(email);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 transition-colors"
                    title="Listeden abonelikten çık"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>{t('actions.unsubscribe')}</span>
                  </button>
                )}

                {/* Abonelikten Çık ve Geçmişi Temizle */}
                {(hasUnsubscribe || analysis?.classification === 'newsletter') && onUnsubscribeAndPurge && (
                  <button
                    id={`unsub-purge-${email.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnsubscribeAndPurge(email);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors"
                    title="Abonelikten çık ve tüm geçmiş iletileri çöpe taşı"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Abonelik & Temizle</span>
                  </button>
                )}

                {/* Doğrudan Yanıtla */}
                {onReply && (
                  <button
                    id={`reply-${email.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReply(email);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-colors"
                    title="E-postayı Yanıtla"
                  >
                    <Send className="w-3 h-3 text-blue-500" />
                    <span>Yanıtla</span>
                  </button>
                )}

                {/* AI Asistan ile İncele & Yanıtla */}
                {onOpenAssistant && (
                  <button
                    id={`assistant-${email.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAssistant(email);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors"
                    title="Sift AI Asistanı ile İncele veya Yanıt Taslağı Hazırla"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    <span>AI Asistan</span>
                  </button>
                )}

                {/* AI ile Tara (Eğer taranmadıysa) */}
                {!analysis && (
                  <button
                    id={`analyze-${email.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnalyze(email);
                    }}
                    disabled={email.isAnalyzing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white transition-colors disabled:opacity-50"
                  >
                    <Sparkles className={`w-3 h-3 ${email.isAnalyzing ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>{email.isAnalyzing ? t('actions.scanning') : 'AI Analiz'}</span>
                  </button>
                )}

                {/* Çöpe At */}
                <button
                  id={`trash-${email.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestTrash(email);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                  title={t('actions.trash')}
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{t('actions.trash')}</span>
                </button>
              </div>

              {/* Detaylı İncele Butonu */}
              <button
                onClick={() => onOpenDetail(email)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('actions.inspect')}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
