import React, { useMemo, useState } from 'react';
import { ShieldCheck, EyeOff, AlertCircle, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { filterEmailTrackingPixels } from '../services/antiTracker';
import { useSettingsStore } from '../stores/useSettingsStore';

interface SafeEmailBodyProps {
  htmlContent?: string;
  plainText?: string;
  isOled?: boolean;
}

export const SafeEmailBody: React.FC<SafeEmailBodyProps> = ({
  htmlContent,
  plainText,
  isOled = false,
}) => {
  const { t } = useTranslation();
  const [showTrackerDetails, setShowTrackerDetails] = useState(false);
  const { blockTrackers } = useSettingsStore();

  // Filter HTML and strip spy pixels
  const { sanitizedHtml, blockedTrackers, totalTrackersBlocked } = useMemo(() => {
    if (htmlContent && blockTrackers) {
      return filterEmailTrackingPixels(htmlContent);
    }
    return {
      sanitizedHtml: htmlContent || '',
      blockedTrackers: [],
      totalTrackersBlocked: 0,
      isShieldActive: blockTrackers,
    };
  }, [htmlContent, blockTrackers]);

  return (
    <div className="space-y-3">
      {/* Privacy Shield & Tracker Status Banner */}
      <div
        className={`p-3.5 rounded-2xl transition-all ${
          totalTrackersBlocked > 0
            ? isOled
              ? 'bg-[#141414] text-emerald-400'
              : 'bg-emerald-50 text-emerald-900'
            : isOled
            ? 'bg-[#141414] text-slate-400'
            : 'bg-slate-100 text-slate-700'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                totalTrackersBlocked > 0
                  ? 'bg-emerald-500 text-black'
                  : 'bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {totalTrackersBlocked > 0 ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-tight">
                  {totalTrackersBlocked > 0
                    ? t('security.trackersBlocked', { count: totalTrackersBlocked })
                    : t('security.noTrackersDetected')}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    totalTrackersBlocked > 0
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t('security.privacyShield')}
                </span>
              </div>
              <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">
                {t('security.trackerExplanation')}
              </p>
            </div>
          </div>

          {totalTrackersBlocked > 0 && (
            <button
              onClick={() => setShowTrackerDetails(!showTrackerDetails)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/10 hover:bg-black/10 transition-colors shrink-0"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>{showTrackerDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</span>
            </button>
          )}
        </div>

        {/* Expandable list of blocked tracker URLs */}
        {showTrackerDetails && totalTrackersBlocked > 0 && (
          <div className="mt-3 pt-3 border-t border-emerald-200/40 dark:border-emerald-900/40 space-y-1.5">
            <span className="text-[11px] font-bold block opacity-90">
              {t('security.blockedList')}
            </span>
            <ul className="space-y-1">
              {blockedTrackers.map((tracker) => (
                <li
                  key={tracker.id}
                  className="text-[11px] font-mono p-1.5 rounded-lg bg-black/5 dark:bg-black/40 break-all flex items-start gap-2"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold opacity-100">{tracker.domain}</span>
                    <span className="opacity-70 ml-1 block truncate max-w-full">
                      {tracker.originalSrc}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Rendered Email Content with Sandboxed Styling */}
      <div
        className={`p-6 rounded-2xl min-h-[140px] max-h-[420px] overflow-y-auto leading-relaxed text-sm transition-colors ${
          isOled
            ? 'bg-[#121212] text-zinc-200'
            : 'bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100'
        }`}
      >
        {sanitizedHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none break-words"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <div className="whitespace-pre-wrap font-sans">
            {plainText || 'İleti içeriği bulunamadı.'}
          </div>
        )}
      </div>
    </div>
  );
};
