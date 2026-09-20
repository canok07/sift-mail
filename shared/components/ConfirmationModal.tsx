import React from 'react';
import { AlertTriangle, Trash2, X, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmationModalProps } from '../types';
import { AppTheme } from './Header';

interface ExtendedConfirmationModalProps extends ConfirmationModalProps {
  theme?: AppTheme;
}

export const ConfirmationModal: React.FC<ExtendedConfirmationModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isDestructive = true,
  itemCount,
  onConfirm,
  onCancel,
  theme = 'light',
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className={`rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border-0 transition-colors ${
          isOled
            ? 'bg-[#121212] text-zinc-100'
            : isDark
            ? 'bg-slate-900 text-slate-100'
            : 'bg-white text-slate-900'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-2xl shrink-0 ${
                isDestructive
                  ? 'bg-rose-500/15 text-rose-500'
                  : 'bg-amber-500/15 text-amber-500'
              }`}
            >
              {isDestructive ? <RotateCcw className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">{title}</h3>
              {itemCount !== undefined && (
                <span className="text-xs font-semibold opacity-70 block mt-0.5">
                  {itemCount} {t('metrics.totalEmails')}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="opacity-70 hover:opacity-100 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm opacity-80 leading-relaxed mb-6">
          {description}
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3 text-xs font-bold rounded-2xl opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors min-h-[48px]"
          >
            {cancelLabel || t('actions.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-3 text-xs font-bold text-white rounded-2xl shadow-xs transition-colors min-h-[48px] ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {confirmLabel || t('actions.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
