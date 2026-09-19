import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Send,
  Sparkles,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Mail,
  User,
} from 'lucide-react';
import { EmailMessage, ConnectedAccount } from '../types';
import { AppTheme } from './Header';
import { safeFetchJson, extractErrorMessage } from '../services/apiClient';
import { detectMailProvider } from '../services/mailProviderManager';

interface EmailReplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: EmailMessage | null;
  accounts: ConnectedAccount[];
  activeAccountId: string;
  initialDraft?: string;
  sessionCredentials?: { email: string; password?: string; host?: string; port?: number } | null;
  accessToken?: string | null;
  onSuccess?: (sentEmailId: string) => void;
  onSuccessSent?: (sentEmailId: string) => void;
  onOpenAssistantForPolish?: (draftText?: string) => void;
  theme?: AppTheme;
}

export const EmailReplyModal: React.FC<EmailReplyModalProps> = ({
  isOpen,
  onClose,
  email,
  accounts,
  activeAccountId,
  initialDraft = '',
  sessionCredentials,
  accessToken,
  onSuccess,
  onSuccessSent,
  onOpenAssistantForPolish,
  theme = 'light',
}) => {
  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const [toAddress, setToAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccountId);
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (email) {
      setToAddress(email.fromEmail || email.from || '');
      setSubject(email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`);
      setBodyText(initialDraft || '');
      setStatusMessage(null);
    }
  }, [email, initialDraft]);

  if (!isOpen || !email) return null;

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  const handleSend = async () => {
    if (!toAddress.trim() || !bodyText.trim()) {
      setStatusMessage({ type: 'error', text: 'Alıcı adresi ve yanıt metni zorunludur.' });
      return;
    }

    setIsSending(true);
    setStatusMessage(null);

    try {
      // Direct SMTP send using account configuration, session credentials, or standard defaults
      const imapCfg = (activeAccount?.imapConfig || {}) as any;
      if (!sessionCredentials?.password || sessionCredentials.email !== activeAccount?.email) throw new Error('Gönderen hesaba yeniden giriş yapın.');
      const discovered = detectMailProvider(activeAccount.email);
      const smtpHost = imapCfg.smtpHost || discovered.smtpHost;
      const smtpPort = imapCfg.smtpPort || discovered.smtpPort || 465;
      const userAuth = imapCfg.username || imapCfg.auth?.user || sessionCredentials?.email || activeAccount?.email || '';
      const passAuth = imapCfg.password || imapCfg.auth?.pass || sessionCredentials?.password || 'VAULT_CREDENTIAL';

      await safeFetchJson('/api/smtp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: userAuth,
              pass: passAuth,
            },
          },
          mail: {
            to: toAddress,
            subject: subject,
            text: bodyText,
          },
        }),
      });

      setStatusMessage({ type: 'success', text: 'E-posta yanıtı başarıyla gönderildi!' });
      if (onSuccess) onSuccess(email.id);
      if (onSuccessSent) onSuccessSent(email.id);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Email send error:', err);
      setStatusMessage({
        type: 'error',
        text: extractErrorMessage(err, 'E-posta gönderilirken bir sorun oluştu.'),
      });
    } finally {
      setIsSending(false);
    }
  };

  const modalBg = isOled
    ? 'bg-[#111113] text-zinc-100 border border-zinc-800'
    : isDark
    ? 'bg-[#18181b] text-zinc-100 border border-zinc-700'
    : 'bg-white text-zinc-900 border border-zinc-200';

  const inputBg = isDark ? 'bg-zinc-800/60 text-zinc-100 border-zinc-700' : 'bg-zinc-50 text-zinc-900 border-zinc-200';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${modalBg}`}
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">E-postayı Yanıtla</h3>
                <p className="text-[11px] opacity-60">Sift Akıllı Posta Gönderici</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-5 space-y-3.5 overflow-y-auto flex-1">
            {/* Account Selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 font-semibold opacity-60 shrink-0">Gönderen:</span>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${inputBg}`}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName || acc.email} ({acc.email}) — [{acc.provider.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>

            {/* To Address */}
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 font-semibold opacity-60 shrink-0">Alıcı:</span>
              <div className="flex-1 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium font-mono">
                <User className="w-3.5 h-3.5 opacity-50 shrink-0" />
                <input
                  type="email"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none"
                  placeholder="alici@ornek.com"
                />
              </div>
            </div>

            {/* Subject */}
            <div className="flex items-center gap-2 text-xs">
              <span className="w-16 font-semibold opacity-60 shrink-0">Konu:</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${inputBg}`}
                placeholder="Konu başlığı"
              />
            </div>

            {/* Body Textarea */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold opacity-70">Yanıt İçeriği:</span>
                {onOpenAssistantForPolish && (
                  <button
                    type="button"
                    onClick={() => onOpenAssistantForPolish(bodyText)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 hover:text-emerald-400 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Asistan ile Düzenle / Revize Et</span>
                  </button>
                )}
              </div>
              <textarea
                rows={10}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Yanıtınızı buraya yazın veya AI Asistan'ın hazırladığı taslağı düzenleyin..."
                className={`w-full p-3 rounded-xl border text-xs leading-relaxed font-sans resize-none focus:ring-1 focus:ring-emerald-500 outline-none ${inputBg}`}
              />
            </div>

            {/* Status notification */}
            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-3 bg-black/5 dark:bg-white/5">
            <div className="text-[11px] opacity-50 flex items-center gap-1">
              <span>Sift Güvenli Gönderim Koruması Aktif</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !bodyText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50 min-h-[36px]"
              >
                <Send className={`w-3.5 h-3.5 ${isSending ? 'animate-pulse' : ''}`} />
                <span>{isSending ? 'Gönderiliyor...' : 'Yanıtı Gönder'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
