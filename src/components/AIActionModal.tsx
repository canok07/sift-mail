import React, { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  Mail,
  Send,
  Trash2,
  Tag,
  Archive,
  Check,
  X,
  UserCheck,
  Cpu,
} from 'lucide-react';
import { ProposedAIAction } from '../services/ai/langchainTools';
import { AppTheme } from '../stores/useSettingsStore';

interface AIActionModalProps {
  action: ProposedAIAction | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (modifiedAction: ProposedAIAction) => Promise<void> | void;
  theme?: AppTheme;
}

export const AIActionModal: React.FC<AIActionModalProps> = ({
  action,
  isOpen,
  onClose,
  onConfirm,
  theme = 'dark',
}) => {
  if (!isOpen || !action) return null;

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  // Editable draft reply state for Human-in-the-Loop review
  const [draftSubject, setDraftSubject] = useState(action.payload.replySubject || '');
  const [draftBody, setDraftBody] = useState(action.payload.replyBody || '');
  const [isExecuting, setIsExecuting] = useState(false);

  const handleConfirm = async () => {
    setIsExecuting(true);
    try {
      const finalAction: ProposedAIAction = {
        ...action,
        payload: {
          ...action.payload,
          replySubject: draftSubject,
          replyBody: draftBody,
        },
      };
      await onConfirm(finalAction);
      onClose();
    } finally {
      setIsExecuting(false);
    }
  };

  const getActionIcon = () => {
    switch (action.actionType) {
      case 'draft_reply':
        return <Send className="w-5 h-5 text-blue-400" />;
      case 'trash_email':
        return <Trash2 className="w-5 h-5 text-rose-400" />;
      case 'label_email':
        return <Tag className="w-5 h-5 text-purple-400" />;
      case 'archive_email':
        return <Archive className="w-5 h-5 text-emerald-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Container */}
      <div
        className={`relative w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl transition-all border-0 z-10 ${
          isOled
            ? 'bg-[#0e0e10] text-zinc-300'
            : isDark
            ? 'bg-[#18181b] text-zinc-300'
            : 'bg-white text-zinc-800'
        }`}
      >
        {/* Human-in-the-Loop Security Banner */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  Human-in-the-Loop
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-500/10 text-blue-300">
                  Güvenlik Denetimi
                </span>
              </div>
              <p className="text-[11px] opacity-60 mt-0.5">
                Yapay zeka hiçbir işlemi sizin doğrudan onayınız olmadan gerçekleştiremez.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Proposed Action Header */}
        <div className="pt-5 pb-3">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 shrink-0">
              {getActionIcon()}
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {action.title}
              </h2>
              <p className="text-xs opacity-75 mt-1">{action.description}</p>
            </div>
          </div>
        </div>

        {/* Target Email Summary */}
        <div className="my-3 p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="opacity-50 text-[11px]">Hedef İleti:</span>
            <span className="font-semibold truncate max-w-[280px]">
              {action.emailSubject}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="opacity-50 text-[11px]">Gönderici:</span>
            <span className="font-medium text-blue-400 truncate max-w-[280px]">
              {action.sender}
            </span>
          </div>
        </div>

        {/* AI Reasoning Box */}
        <div className="my-3 p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] text-xs">
          <span className="font-semibold text-[11px] opacity-60 uppercase tracking-wider block mb-1">
            Yapay Zeka Mantıksal Gerekçesi (Reasoning):
          </span>
          <p className="opacity-80 leading-relaxed italic">
            "{action.reasoning}"
          </p>
        </div>

        {/* Action Specific Editable Content */}
        {action.actionType === 'draft_reply' && (
          <div className="my-4 space-y-3">
            <div>
              <label className="block text-[11px] font-semibold opacity-60 mb-1">
                Yanıt Başlığı (Düzenlenebilir)
              </label>
              <input
                type="text"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border-0 text-xs font-medium focus:ring-1 focus:ring-blue-400 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold opacity-60 mb-1">
                Hazırlanan Yanıt Metni (Düzenleyebilirsiniz)
              </label>
              <textarea
                rows={5}
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border-0 text-xs font-normal focus:ring-1 focus:ring-blue-400 outline-hidden leading-relaxed resize-none"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-black/5 dark:border-white/5">
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors min-h-[44px]"
          >
            Reddet ve İptal Et
          </button>

          <button
            onClick={handleConfirm}
            disabled={isExecuting}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all min-h-[44px] ${
              action.actionType === 'trash_email'
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white'
            }`}
          >
            {isExecuting ? (
              <span className="animate-pulse">İşlem Uygulanıyor...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Onayla ve Uygula</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
