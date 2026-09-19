import React, { useState } from 'react';
import {
  X,
  Mail,
  SlidersHorizontal,
  Plus,
  Sparkles,
  ExternalLink,
  Trash2,
  UserCheck,
  RotateCcw,
  Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmailMessage, SafeCategory, AutoRule } from '../types';
import { CATEGORIES_META, extractDomain } from '../services/categoryManager';
import { PROVIDERS_META } from '../services/mailProviderManager';
import { SafeEmailBody } from './SafeEmailBody';
import { AppTheme } from './Header';

interface EmailDetailModalProps {
  email: EmailMessage | null;
  onClose: () => void;
  onAnalyze: (email: EmailMessage) => void;
  onUnsubscribe: (email: EmailMessage) => void;
  onRequestTrash: (email: EmailMessage) => void;
  onMarkSafe: (email: EmailMessage) => void;
  onReply?: (email: EmailMessage) => void;
  onUpdateCategory?: (emailId: string, category: SafeCategory) => void;
  onAddRule?: (rule: Omit<AutoRule, 'id' | 'createdAt' | 'matchCount'>) => void;
  onUnsubscribeAndPurge?: (email: EmailMessage) => void;
  onOpenAssistant?: (email: EmailMessage) => void;
  theme?: AppTheme;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  onClose,
  onAnalyze,
  onUnsubscribe,
  onRequestTrash,
  onMarkSafe,
  onReply,
  onUpdateCategory,
  onAddRule,
  onUnsubscribeAndPurge,
  onOpenAssistant,
  theme = 'light',
}) => {
  const { t, i18n } = useTranslation();
  const [ruleCreated, setRuleCreated] = useState(false);

  if (!email) return null;

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const analysis = email.analysis;
  const currentCategory: SafeCategory | undefined =
    email.safeCategory || analysis?.safeCategory;

  const getBadgeStyle = () => {
    if (!analysis) return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
    switch (analysis.classification) {
      case 'safe':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'newsletter':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      case 'spam':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'phishing':
        return 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
    }
  };

  const getBadgeTitle = () => {
    if (!analysis) return t('security.unscanned');
    switch (analysis.classification) {
      case 'safe':
        return t('security.scoreSafe');
      case 'newsletter':
        return t('security.scoreNewsletter');
      case 'spam':
        return t('security.scoreRisk');
      case 'phishing':
        return t('metrics.riskyEmails');
    }
  };

  const handleQuickCreateRule = () => {
    if (!onAddRule || !currentCategory) return;
    const domain = extractDomain(email.fromEmail || email.from);

    if (analysis?.suggestedFilterRule) {
      onAddRule({
        category: currentCategory,
        patternType: analysis.suggestedFilterRule.patternType as any,
        patternValue: analysis.suggestedFilterRule.patternValue,
        isActive: true,
        description: analysis.suggestedFilterRule.description,
      });
    } else if (domain) {
      onAddRule({
        category: currentCategory,
        patternType: 'domain',
        patternValue: domain,
        isActive: true,
        description: `${domain} → ${t(`categories.${currentCategory}`)}`,
      });
    } else {
      onAddRule({
        category: currentCategory,
        patternType: 'from',
        patternValue: email.fromEmail || email.from,
        isActive: true,
        description: `${email.fromName || email.from} → ${t(`categories.${currentCategory}`)}`,
      });
    }

    setRuleCreated(true);
    setTimeout(() => setRuleCreated(false), 3000);
  };

  const hasUnsubscribe = Boolean(analysis?.unsubscribeUrl || email.listUnsubscribe);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div
        className={`rounded-3xl max-w-3xl w-full my-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-colors ${
          isOled
            ? 'bg-[#0a0a0a] text-zinc-100'
            : isDark
            ? 'bg-slate-900 text-slate-100'
            : 'bg-white text-slate-900'
        }`}
      >
        {/* Header - Minimalist & Spacious */}
        <div
          className={`p-6 sm:p-7 flex items-center justify-between gap-4 transition-colors ${
            isOled ? 'bg-[#121212]' : isDark ? 'bg-slate-950/70' : 'bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-2xl shrink-0 ${
                isOled
                  ? 'bg-[#1e1e1e] text-emerald-400'
                  : isDark
                  ? 'bg-slate-800 text-emerald-400'
                  : 'bg-white text-slate-800 shadow-xs'
              }`}
            >
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {email.provider && PROVIDERS_META[email.provider] && (
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${PROVIDERS_META[email.provider].badgeClass}`}
                  >
                    {PROVIDERS_META[email.provider].name}
                  </span>
                )}
                <span className={`px-3 py-0.5 rounded-full text-xs font-semibold ${getBadgeStyle()}`}>
                  {getBadgeTitle()}
                </span>
                {analysis && (
                  <span className="text-xs font-semibold opacity-80">
                    {t('security.safetyScore')}:{' '}
                    <strong className={analysis.safetyScore >= 70 ? 'text-emerald-500' : 'text-rose-500'}>
                      %{analysis.safetyScore}
                    </strong>
                  </span>
                )}
                {currentCategory && (
                  <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    {t(`categories.${currentCategory}`)}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold tracking-tight line-clamp-1">
                {email.subject}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title={t('actions.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
          {/* Sender & Date Info */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs p-5 rounded-2xl ${
              isOled ? 'bg-[#121212]' : isDark ? 'bg-slate-800/60' : 'bg-slate-50'
            }`}
          >
            <div>
              <span className="opacity-60 block font-medium mb-0.5">{t('detail.sender')}:</span>
              <span className="font-bold text-sm block">{email.fromName || email.from}</span>
              {email.fromEmail && (
                <span className="opacity-75 block font-mono text-xs mt-0.5">{email.fromEmail}</span>
              )}
            </div>
            <div>
              <span className="opacity-60 block font-medium mb-0.5">{t('detail.dateAndLabels')}:</span>
              <span className="text-xs font-medium block">{Number.isNaN(Date.parse(email.date)) ? email.date : new Date(email.date).toLocaleString(i18n.language)}</span>
              {email.labels && email.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {email.labels.map((lbl) => (
                    <span
                      key={lbl}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-mono bg-black/5 dark:bg-white/10"
                    >
                      {lbl}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Anti-Tracker Shield & Email Body */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2.5">
              {t('detail.contentTitle')}
            </h3>
            <SafeEmailBody
              htmlContent={email.bodyHtml}
              plainText={email.bodyText || email.snippet}
              isOled={isOled}
            />
          </div>

          <details className="space-y-3"><summary className="cursor-pointer text-sm text-zinc-500">AI analizi ve gelişmiş işlemler</summary>
          {/* Gemini AI NLP Reasoning Block */}
          <div
            className={`p-6 rounded-2xl space-y-3 transition-colors ${
              isOled ? 'bg-[#141414] text-zinc-100' : 'bg-slate-900 text-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  AI analizi
                </h3>
              </div>
              {!analysis && (
                <button
                  onClick={() => onAnalyze(email)}
                  disabled={email.isAnalyzing}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  <Sparkles className="w-4 h-4" />
                  {email.isAnalyzing ? t('actions.scanning') : t('actions.checkSingle')}
                </button>
              )}
            </div>

            {analysis ? (
              <>
                <p className="text-sm leading-relaxed opacity-90">
                  {analysis.reasoning}
                </p>

                {analysis.keyFindings && analysis.keyFindings.length > 0 && (
                  <div className="pt-3 border-t border-white/10">
                    <span className="text-xs font-bold opacity-75 uppercase tracking-wide block mb-2">
                      {t('detail.findingsHeading')}
                    </span>
                    <ul className="space-y-1.5">
                      {analysis.keyFindings.map((finding, idx) => (
                        <li key={idx} className="text-xs opacity-90 flex items-start gap-2">
                          <span className="text-emerald-400 text-lg leading-none">•</span>
                          <span>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs opacity-70">
                Seçtiğiniz AI sağlayıcısıyla bu iletiyi analiz edebilirsiniz.
              </p>
            )}
          </div>

          {/* Unsubscribe & Purge Action Card */}
          {hasUnsubscribe && (
            <div
              className={`p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isOled ? 'bg-[#141414]' : 'bg-blue-50/70 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100'
              }`}
            >
              <div>
                <h4 className="text-sm font-bold">
                  {t('detail.unsubBannerTitle')}
                </h4>
                <p className="text-xs opacity-80 mt-0.5">
                  {t('detail.unsubBannerDesc')}
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-2 shrink-0">
                <button
                  onClick={() => onUnsubscribe(email)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors min-h-[44px]"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('actions.unsubscribe')}
                </button>

                {onUnsubscribeAndPurge && (
                  <button
                    onClick={() => onUnsubscribeAndPurge(email)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors min-h-[44px]"
                    title="Abonelikten çık ve bu göndericinin tüm eski iletilerini topluca çöpe taşı"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('actions.unsubscribeAndPurge')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Category Assignment & Automation Rule Generator */}
          <div
            className={`p-5 rounded-2xl space-y-3 ${
              isOled ? 'bg-[#121212]' : isDark ? 'bg-slate-800/50' : 'bg-slate-50'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide opacity-70">
                  {t('detail.categoryAndRule')}
                </h3>
                <p className="text-xs opacity-80 mt-0.5">
                  {t('detail.categoryDesc')}
                </p>
              </div>

              {onUpdateCategory && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold opacity-80">{t('detail.categoryLabel')}:</span>
                  <select
                    value={currentCategory || 'other'}
                    onChange={(e) => onUpdateCategory(email.id, e.target.value as SafeCategory)}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border-0 shadow-xs min-h-[42px]"
                  >
                    {Object.entries(CATEGORIES_META).map(([catKey]) => (
                      <option key={catKey} value={catKey}>
                        {t(`categories.${catKey}`)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {onAddRule && currentCategory && (
              <div
                className={`p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
                  isOled ? 'bg-[#181818]' : 'bg-white dark:bg-slate-900 shadow-xs'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    <strong>{extractDomain(email.fromEmail || email.from) || email.from}</strong> →{' '}
                    <strong className="text-emerald-500">{t(`categories.${currentCategory}`)}</strong>
                  </span>
                </div>
                <button
                  onClick={handleQuickCreateRule}
                  disabled={ruleCreated}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-colors disabled:opacity-50 min-h-[42px]"
                >
                  <Plus className="w-4 h-4" />
                  {ruleCreated ? t('detail.ruleCreated') : t('detail.createRuleForDomain')}
                </button>
              </div>
            )}
          </div>
          </details>
        </div>

        {/* Footer Actions - Single-handed friendly button sizing */}
        <div
          className={`p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3 ${
            isOled ? 'bg-[#121212]' : isDark ? 'bg-slate-950/70' : 'bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onRequestTrash(email)}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-rose-500 hover:bg-rose-500/10 text-xs font-bold transition-colors min-h-[48px]"
            >
              <Trash2 className="w-4 h-4" />
              {t('actions.trash')}
            </button>

            {hasUnsubscribe && onUnsubscribeAndPurge && (
              <button
                onClick={() => onUnsubscribeAndPurge(email)}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-xs min-h-[48px]"
              >
                <RotateCcw className="w-4 h-4" />
                {t('actions.unsubscribeAndPurge')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {onReply && (
              <button
                onClick={() => {
                  onClose();
                  onReply(email);
                }}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors min-h-[48px] shadow-xs"
              >
                <Send className="w-4 h-4" />
                <span>Yanıtla</span>
              </button>
            )}
            {onOpenAssistant && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAssistant(email);
                }}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors min-h-[48px] shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>AI Asistan ile İncele</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition-colors min-h-[48px]"
            >
              {t('actions.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
