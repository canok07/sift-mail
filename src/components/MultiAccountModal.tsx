import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Mail,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { MailProvider, ConnectedAccount } from '../types';
import {
  PROVIDERS_META,
  detectMailProvider,
  AutoDiscoveredConfig,
} from '../services/mailProviderManager';

interface MultiAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: ConnectedAccount[];
  activeAccountId: string | 'all';
  onSelectAccount: (accountId: string | 'all') => void;
  onAddAccount: (
    account: Omit<ConnectedAccount, 'id' | 'lastSyncAt' | 'totalCount' | 'unreadCount'>
  ) => void;
  onRemoveAccount: (accountId: string) => void;
  onLoginGmail?: () => void;
  theme?: 'light' | 'dark' | 'oled';
}

export const MultiAccountModal: React.FC<MultiAccountModalProps> = ({
  isOpen,
  onClose,
  accounts = [],
  activeAccountId = 'all',
  onSelectAccount,
  onAddAccount,
  onRemoveAccount,
  onLoginGmail,
  theme = 'light',
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');

  // Auto-discovered configuration based on typed email
  const discovered = useMemo<AutoDiscoveredConfig>(() => {
    return detectMailProvider(emailInput);
  }, [emailInput]);

  // Corporate / Manual server fields
  const [hostInput, setHostInput] = useState('');
  const [portInput, setPortInput] = useState(993);
  const [secureSsl, setSecureSsl] = useState(true);
  const [smtpHostInput, setSmtpHostInput] = useState('');
  const [smtpPortInput, setSmtpPortInput] = useState(465);
  const [smtpSecureSsl, setSmtpSecureSsl] = useState(true);

  // Corporate IMAP expansion toggle
  const [showCorporateImap, setShowCorporateImap] = useState(false);
  const [saveToVault, setSaveToVault] = useState(true);

  // Show connected accounts drawer / section
  const [showConnectedList, setShowConnectedList] = useState(false);

  // Testing & Connecting states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Update server fields when auto-discovery changes
  useEffect(() => {
    if (discovered.imapHost) setHostInput(discovered.imapHost);
    if (discovered.imapPort) setPortInput(discovered.imapPort);
    setSecureSsl(discovered.imapSecure);
    if (discovered.smtpHost) setSmtpHostInput(discovered.smtpHost);
    if (discovered.smtpPort) setSmtpPortInput(discovered.smtpPort);
    setSmtpSecureSsl(discovered.smtpSecure);

    // If domain is detected as custom/corporate, automatically show corporate settings
    if (discovered.domain && !discovered.isKnownProvider) {
      setShowCorporateImap(true);
    }
  }, [discovered]);

  if (!isOpen) return null;

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  // Standard Direct IMAP/SMTP Login (Auto-discovery for Gmail, Outlook, Yandex, Yahoo, iCloud, Corporate)
  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const email = emailInput.trim();
    if (!email || !email.includes('@')) {
      setTestResult({
        success: false,
        message: 'Lütfen geçerli bir e-posta adresi girin.',
      });
      return;
    }

    if (!passwordInput.trim()) {
      setTestResult({
        success: false,
        message: 'Lütfen hesap şifrenizi veya uygulama parolanızı girin.',
      });
      return;
    }

    const finalHost = hostInput.trim() || discovered.imapHost || `imap.${discovered.domain || 'mail.com'}`;
    const finalPort = Number(portInput) || discovered.imapPort || 993;

    setIsSubmitting(true);
    setTestResult(null);

    try {
      // Test IMAP connection via backend route
      const res = await fetch('/api/imap/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: finalHost,
          port: finalPort,
          secure: secureSsl,
          auth: {
            user: email,
            pass: passwordInput.trim(),
          },
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setTestResult(data);
        setShowCorporateImap(true);
        setIsSubmitting(false);
        return;
      }

      setTestResult({
        success: true,
        message: 'Giriş başarılı! Hesabınız güvenle bağlanıyor...',
      });

      // Save encrypted password to local AES-256 Vault if opted
      if (saveToVault) {
        try {
          await fetch('/api/vault/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: `imap_${email.replace(/[^a-zA-Z0-9_]/g, '_')}`,
              label: `${displayNameInput.trim() || discovered.providerName} (${email})`,
              category: 'imap_password',
              value: passwordInput.trim(),
            }),
          });
        } catch (vaultErr) {
          console.warn('Kasaya kaydedilirken uyarı:', vaultErr);
        }
      }

      // Add account to state
      onAddAccount({
        provider: discovered.provider,
        email: email,
        displayName:
          displayNameInput.trim() ||
          `${discovered.providerName} (${email.split('@')[0]})`,
        status: 'connected',
        isPrimary: accounts.length === 0,
        imapConfig: {
          host: finalHost,
          port: finalPort,
          secure: secureSsl,
          username: email,
        },
      });

      // Reset and close
      setTimeout(() => {
        setEmailInput('');
        setPasswordInput('');
        setDisplayNameInput('');
        setTestResult(null);
        onClose();
      }, 500);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Sunucuya bağlanılamadı. Lütfen bilgilerinizi kontrol edin.',
      });
      setShowCorporateImap(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div
        className={`w-full max-w-lg rounded-3xl my-6 shadow-2xl transition-all border flex flex-col max-h-[92vh] overflow-hidden ${
          isOled
            ? 'bg-[#000000] border-white/10 text-zinc-200'
            : isDark
            ? 'bg-[#141416] border-white/10 text-zinc-200'
            : 'bg-white border-zinc-200/80 text-zinc-800'
        }`}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 shadow-xs ${
                isDark ? 'bg-zinc-800 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                Yeni Hesap Ekle
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                E-posta sağlayıcınızla oturum açın veya kurumsal hesabınızı bağlayın
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Hızlı Oturum Açma / Eşitleme Seçeneği */}
          {onLoginGmail && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">Tek Seferlik Hızlı Giriş</span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Şifreniz cihazınızdan çıkmadan anlık IMAP oturumu açın</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onLoginGmail}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shrink-0 transition-colors shadow-xs"
              >
                Hızlı Giriş
              </button>
            </div>
          )}

          {/* STANDART DOĞRUDAN E-POSTA (IMAP/SMTP) GİRİŞ FORMU */}
          <form onSubmit={handleSubmitLogin} className="space-y-4">
            {/* E-posta Alanı */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                E-posta Adresi
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="ornek@yandex.com, isim@sirket.com..."
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full pl-4 pr-24 py-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-hidden focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
                />
                {/* Sağda algılanan sağlayıcı rozeti */}
                {discovered.domain && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/10">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: discovered.accentColor }}
                    />
                    <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
                      {discovered.shortName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Şifre Alanı */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Şifre veya Uygulama Parolası
                </label>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  2FA için Uygulama Şifresi
                </span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full pl-4 pr-11 py-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-hidden focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                  title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Hata / Durum Bildirimi */}
            {testResult && (
              <div
                className={`p-3 rounded-2xl text-xs flex items-start gap-2.5 animate-fade-in ${
                  testResult.success
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{testResult.message}</span>
              </div>
            )}

            {/* Oturum Aç Butonu */}
            <button
              type="submit"
              disabled={isSubmitting || !emailInput.trim() || !passwordInput.trim()}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 min-h-[46px]"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Oturum Açılıyor...</span>
                </>
              ) : (
                <>
                  <span>Oturum Aç</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* 2. KURUMSAL HESAP AYRIMI (GELİŞMİŞ IMAP FORMU) */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5">
            <button
              type="button"
              onClick={() => setShowCorporateImap(!showCorporateImap)}
              className="w-full py-2.5 px-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] border border-black/5 dark:border-white/5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-500" />
                <span>Kurumsal (IMAP) Hesap Ekle</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                <span>Özel Sunucu / Port</span>
                {showCorporateImap ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {/* Gelişmiş IMAP / SMTP Alanları */}
            {showCorporateImap && (
              <div className="mt-3 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                      IMAP Sunucu Adresi (Gelen Posta)
                    </label>
                    <input
                      type="text"
                      value={hostInput}
                      onChange={(e) => setHostInput(e.target.value)}
                      placeholder="imap.sirketiniz.com"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-xs font-mono outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                      Port & SSL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={portInput}
                        onChange={(e) => setPortInput(Number(e.target.value))}
                        placeholder="993"
                        className="w-20 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-xs font-mono outline-hidden"
                      />
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={secureSsl}
                          onChange={(e) => setSecureSsl(e.target.checked)}
                          className="rounded text-emerald-500 focus:ring-emerald-500"
                        />
                        <span>SSL</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                      SMTP Sunucu Adresi (Giden Posta)
                    </label>
                    <input
                      type="text"
                      value={smtpHostInput}
                      onChange={(e) => setSmtpHostInput(e.target.value)}
                      placeholder="smtp.sirketiniz.com"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-xs font-mono outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                      Port & TLS
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={smtpPortInput}
                        onChange={(e) => setSmtpPortInput(Number(e.target.value))}
                        placeholder="465"
                        className="w-20 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-xs font-mono outline-hidden"
                      />
                      <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smtpSecureSsl}
                          onChange={(e) => setSmtpSecureSsl(e.target.checked)}
                          className="rounded text-emerald-500 focus:ring-emerald-500"
                        />
                        <span>SSL</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                    Özel Hesap Başlığı (İsteğe Bağlı)
                  </label>
                  <input
                    type="text"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    placeholder="Örn: Şirket Muhasebe Postası"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 text-xs outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4. BAĞLI HESAPLAR ÖZETİ (Açılır / Kapanır) */}
          {accounts.length > 0 && (
            <div className="pt-2 border-t border-black/5 dark:border-white/5">
              <button
                type="button"
                onClick={() => setShowConnectedList(!showConnectedList)}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 py-1"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Bağlı Hesapları Yönet ({accounts.length})</span>
                </div>
                {showConnectedList ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showConnectedList && (
                <div className="mt-2.5 space-y-2 animate-fade-in">
                  {accounts.map((acc) => {
                    const meta = PROVIDERS_META[acc.provider] || PROVIDERS_META.imap;
                    const isSelected = activeAccountId === acc.id;

                    return (
                      <div
                        key={acc.id}
                        className={`p-3 rounded-2xl flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
                            : 'bg-black/[0.03] dark:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: meta.accentColor }}
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">
                              {acc.displayName}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono truncate block">
                              {acc.email}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectAccount(acc.id);
                              onClose();
                            }}
                            className={`px-2.5 py-1 rounded-xl text-xs font-semibold ${
                              isSelected
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            {isSelected ? 'Seçili' : 'Seç'}
                          </button>
                          {accounts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onRemoveAccount(acc.id)}
                              className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              title="Hesabı Kaldır"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px]">Şifreler AES-256 ile yalnızca cihazınızda saklanır</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-xs font-medium transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
