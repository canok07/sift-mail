import React, { useState, useMemo } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  Server,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AppTheme } from './Header';
import { detectMailProvider, AutoDiscoveredConfig } from '../services/mailProviderManager';

export interface DynamicLoginCredentials {
  email: string;
  password: string;
  host?: string;
  port?: number;
  secure?: boolean;
}

interface DynamicEmailLoginCardProps {
  onLoginAndSync: (credentials: DynamicLoginCredentials) => Promise<void>;
  isLoading: boolean;
  theme?: AppTheme;
  initialEmail?: string;
  errorMessage?: any;
  onClearError?: () => void;
  isModal?: boolean;
  onClose?: () => void;
}

export const DynamicEmailLoginCard: React.FC<DynamicEmailLoginCardProps> = ({
  onLoginAndSync,
  isLoading,
  theme = 'light',
  initialEmail = '',
  errorMessage = null,
  onClearError,
  isModal = false,
  onClose,
}) => {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Advanced custom server overrides
  const [customHost, setCustomHost] = useState('');
  const [customPort, setCustomPort] = useState('993');
  const [customSecure, setCustomSecure] = useState(true);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Auto-detect provider metadata based on domain
  const discovered: AutoDiscoveredConfig = useMemo(() => {
    return detectMailProvider(email);
  }, [email]);

  // Safe error string parsing (prevents [object Object] and safely extracts message)
  const safeErrorMessage = useMemo(() => {
    if (validationError) return validationError;
    const rawError = localError || errorMessage;
    if (!rawError) return null;
    const errorMessageStr =
      typeof rawError === 'string'
        ? rawError
        : (rawError as any)?.message || (rawError as any)?.error || JSON.stringify(rawError);
    return errorMessageStr;
  }, [validationError, localError, errorMessage]);

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const cardBg = isOled
    ? 'bg-[#121212] border-white/10 text-zinc-100'
    : isDark
    ? 'bg-[#18181b] border-white/10 text-zinc-100'
    : 'bg-white border-zinc-200/80 text-zinc-800 shadow-xl';

  const inputBg = isOled
    ? 'bg-black/60 border-white/10 text-white placeholder-zinc-500 focus:border-emerald-500'
    : isDark
    ? 'bg-zinc-900/80 border-white/10 text-white placeholder-zinc-500 focus:border-emerald-500'
    : 'bg-zinc-50/80 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setLocalError(null);
    if (onClearError) onClearError();

    const cleanEmail = email.trim();
    const cleanPassword = password.trim().replace(/\s+/g, ''); // Remove spaces commonly copied from Google App Password

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setValidationError('Lütfen geçerli bir e-posta adresi girin.');
      return;
    }

    if (!cleanPassword || cleanPassword.length < 4) {
      setValidationError(
        discovered.authType === 'app_password'
          ? `Lütfen 16 haneli ${discovered.providerName} Uygulama Şifrenizi girin.`
          : 'Lütfen e-posta şifrenizi girin.'
      );
      return;
    }

    const effectiveHost = customHost.trim() || discovered.imapHost || 'imap.gmail.com';
    const effectivePort = Number(customPort) || discovered.imapPort || 993;

    try {
      await onLoginAndSync({
        email: cleanEmail,
        password: cleanPassword,
        host: effectiveHost,
        port: effectivePort,
        secure: customSecure,
      });
    } catch (error: any) {
      console.error("Auth error details:", error);
      const errorMessage =
        typeof error === 'string'
          ? error
          : (error as any)?.message || (error as any)?.error || JSON.stringify(error);
      setLocalError(errorMessage);
    }
  };

  return (
    <div
      className={`w-full max-w-xl mx-auto rounded-3xl border p-6 sm:p-8 transition-colors ${cardBg}`}
    >
      {/* Header / Title */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 ring-1 ring-emerald-500/20">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              E-posta Hesabı ile Oturum Aç
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Lütfen E-posta ve Şifreniz ile giriş yapın
            </p>
          </div>
        </div>

        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Error Displays */}
      {safeErrorMessage && (
        <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{safeErrorMessage}</p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div>
          <label className="block text-xs font-semibold mb-1.5 text-zinc-700 dark:text-zinc-300">
            E-posta Adresi
          </label>
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="adiniz@gmail.com"
              disabled={isLoading}
              required
              autoCapitalize="none"
              autoCorrect="off"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-hidden transition-all ${inputBg}`}
            />
          </div>

          {/* Auto-detected Provider Pill */}
          {email.includes('@') && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: discovered.accentColor }}
              />
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {discovered.providerName} (IMAP: {customHost || discovered.imapHost}:
                {customPort || discovered.imapPort})
              </span>
            </div>
          )}
        </div>

        {/* Password / App Password Field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span>
                {discovered.authType === 'app_password'
                  ? `${discovered.providerName} Uygulama Şifresi (16 Haneli)`
                  : 'E-posta Şifresi'}
              </span>
            </label>
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Nasıl alınır?</span>
            </button>
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder={
                discovered.authType === 'app_password'
                  ? 'xxxx xxxx xxxx xxxx'
                  : '••••••••'
              }
              disabled={isLoading}
              required
              autoCapitalize="none"
              autoCorrect="off"
              className={`w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm border font-mono outline-hidden transition-all ${inputBg}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* How to get App Password / Provider Hint Expandable Guide */}
        {showHelp && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 text-xs text-zinc-600 dark:text-zinc-300 space-y-1.5 animate-fadeIn">
            <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{discovered.providerName} Bağlantı Rehberi</span>
            </div>
            <p className="text-[11px] leading-relaxed pl-1 text-zinc-600 dark:text-zinc-400">
              {discovered.hint || 'E-posta adresinize ait şifre veya uygulama parolası ile bağlanabilirsiniz.'}
            </p>
          </div>
        )}

        {/* Advanced IMAP Settings (Collapsible) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Gelişmiş Sunucu Ayarları</span>
            {showAdvanced ? (
              <ChevronUp className="w-3.5 h-3.5 ml-1" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1 opacity-70">
                    IMAP Sunucu Adresi
                  </label>
                  <input
                    type="text"
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                    placeholder={discovered.imapHost || 'imap.gmail.com'}
                    disabled={isLoading}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs border ${inputBg}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1 opacity-70">
                    Port & SSL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customPort}
                      onChange={(e) => setCustomPort(e.target.value)}
                      placeholder="993"
                      disabled={isLoading}
                      className={`w-20 px-3 py-1.5 rounded-lg text-xs border ${inputBg}`}
                    />
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={customSecure}
                        onChange={(e) => setCustomSecure(e.target.checked)}
                        disabled={isLoading}
                        className="rounded accent-emerald-500"
                      />
                      <span className="text-[11px]">SSL/TLS</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Zero-Storage Privacy Guarantee Badge */}
        <div className="p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            <b className="font-semibold text-zinc-700 dark:text-zinc-300">Sıfır Kalıntı Güvencesi:</b>{' '}
            Şifreniz asla sunucuya, .env dosyasına veya veritabanına kaydedilmez. Yalnızca bu
            istek/oturum süresince anlık bellekte tutulur ve TLS ile IMAP sunucusuna iletilir.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Yükleniyor...' : 'Oturum Aç ve Mailleri Senkronize Et'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
