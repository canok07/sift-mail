import React, { useState } from 'react';
import {
  X,
  Palette,
  Shield,
  Zap,
  Sliders,
  Check,
  Send,
  Bot,
  Laptop,
  Moon,
  Sun,
  Globe,
  Lock,
  Trash2,
  Cpu,
  AlertCircle,
} from 'lucide-react';
import {
  useSettingsStore,
  AppTheme,
  AppLanguage,
  AIProvider,
} from '../stores/useSettingsStore';
import { useTranslation } from 'react-i18next';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVaultModal?: () => void;
  onOpenDesktopModal?: () => void;
  onOpenLoginModal?: () => void;
}

type SettingsTab = 'appearance' | 'privacy' | 'automation' | 'general';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenVaultModal,
  onOpenDesktopModal,
  onOpenLoginModal,
}) => {
  const { t, i18n } = useTranslation();
  const {
    theme,
    language,
    blockTrackers,
    requireBiometric,
    autoDeleteUnsubscribed,
    aiProvider,
    ollamaEndpoint,
    telegramBotToken,
    telegramChatId,
    telegramEnabled,
    setTheme,
    setLanguage,
    setBlockTrackers,
    setRequireBiometric,
    setAutoDeleteUnsubscribed,
    setAIProvider,
    setOllamaEndpoint,
    setTelegramConfig,
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  // Local state for Telegram config edits
  const [tokenInput, setTokenInput] = useState(telegramBotToken);
  const [chatIdInput, setChatIdInput] = useState(telegramChatId);
  const [telegramSaved, setTelegramSaved] = useState(false);

  // Telegram simulator state
  const [simCommand, setSimCommand] = useState('Son 3 saatteki spam mailleri temizle');
  const [simResponse, setSimResponse] = useState<string | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  if (!isOpen) return null;

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const handleLanguageChange = (lang: AppLanguage) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
  };

  const handleSaveTelegram = async () => {
    setTelegramConfig({
      botToken: tokenInput,
      chatId: chatIdInput,
      enabled: Boolean(tokenInput && chatIdInput),
    });

    try {
      await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput, chatId: chatIdInput }),
      });
      setTelegramSaved(true);
      setTimeout(() => setTelegramSaved(false), 3000);
    } catch (err) {
      console.error('Telegram ayarları kaydedilemedi:', err);
    }
  };

  const handleRunSimCommand = async () => {
    if (!simCommand.trim()) return;
    setSimLoading(true);
    setSimResponse(null);
    try {
      const res = await fetch('/api/telegram/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: simCommand }),
      });
      const data = await res.json();
      setSimResponse(data.reply || data.message || 'Komut işlendi.');
    } catch {
      setSimResponse('Simülasyon yanıtı alınırken bir hata oluştu.');
    } finally {
      setSimLoading(false);
    }
  };

  // iOS-style Toggle Component
  const ToggleSwitch = ({
    checked,
    onChange,
    label,
    description,
  }: {
    checked: boolean;
    onChange: (val: boolean) => void;
    label: string;
    description?: string;
  }) => (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="flex-1 pr-2">
        <p className="text-sm font-medium tracking-tight text-zinc-900 dark:text-zinc-200">
          {label}
        </p>
        {description && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden ${
          checked
            ? 'bg-zinc-800 dark:bg-zinc-200'
            : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white dark:bg-zinc-900 shadow-md ring-0 transition duration-200 ease-in-out my-0.5 ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Card */}
      <div
        className={`relative w-full max-w-2xl rounded-3xl p-6 sm:p-8 shadow-2xl transition-all border-0 z-10 max-h-[90vh] flex flex-col ${
          isOled
            ? 'bg-[#000000] text-zinc-300'
            : isDark
            ? 'bg-[#121212] text-zinc-300'
            : 'bg-white text-zinc-800'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-black/5 dark:border-white/5 shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Ayarlar
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Sift deneyiminizi, güvenliğinizi ve otomasyonlarınızı yapılandırın.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Tabs Navigation */}
        <div className="flex items-center gap-1.5 py-4 border-b border-black/5 dark:border-white/5 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'appearance'
                ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Görünüm</span>
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'privacy'
                ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Gizlilik</span>
          </button>

          <button
            onClick={() => setActiveTab('automation')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'automation'
                ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Otomasyon</span>
          </button>

          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'general'
                ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Genel</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-1">
          {/* TAB 1: GÖRÜNÜM (APPEARANCE) */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-fade-in">
              {/* Üçlü Tema Seçimi */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                  Tema Modu
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Light */}
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all ${
                      theme === 'light'
                        ? 'bg-zinc-100 dark:bg-zinc-800 ring-2 ring-zinc-900 dark:ring-zinc-100'
                        : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                    }`}
                  >
                    <Sun className="w-5 h-5 mb-2 text-amber-500" />
                    <span className="text-xs font-bold">Açık</span>
                    <span className="text-[10px] opacity-60 mt-0.5">Sakin Gri (#f8f9fa)</span>
                  </button>

                  {/* Dark */}
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all ${
                      theme === 'dark'
                        ? 'bg-zinc-800 ring-2 ring-zinc-400 text-white'
                        : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                    }`}
                  >
                    <Moon className="w-5 h-5 mb-2 text-indigo-400" />
                    <span className="text-xs font-bold">Koyu</span>
                    <span className="text-[10px] opacity-60 mt-0.5">Koyu Gri (#121212)</span>
                  </button>

                  {/* OLED */}
                  <button
                    onClick={() => setTheme('oled')}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all ${
                      theme === 'oled'
                        ? 'bg-black ring-2 ring-zinc-400 text-white'
                        : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-black border border-white/20 mb-2 flex items-center justify-center text-[10px] font-bold">
                      0
                    </div>
                    <span className="text-xs font-bold">OLED</span>
                    <span className="text-[10px] opacity-60 mt-0.5">Zifiri Siyah (#000000)</span>
                  </button>
                </div>
              </div>

              {/* Dil Seçimi */}
              <div className="pt-2 border-t border-black/5 dark:border-white/5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                  Uygulama Dili
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { code: 'tr' as AppLanguage, name: 'Türkçe', flag: '🇹🇷' },
                    { code: 'en' as AppLanguage, name: 'English', flag: '🇬🇧' },
                    { code: 'de' as AppLanguage, name: 'Deutsch', flag: '🇩🇪' },
                  ].map((item) => (
                    <button
                      key={item.code}
                      onClick={() => handleLanguageChange(item.code)}
                      className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl text-xs font-semibold transition-all ${
                        language === item.code
                          ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                          : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <span className="text-base">{item.flag}</span>
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GİZLİLİK (PRIVACY) */}
          {activeTab === 'privacy' && (
            <div className="space-y-4 animate-fade-in divide-y divide-black/5 dark:divide-white/5">
              <ToggleSwitch
                checked={blockTrackers}
                onChange={setBlockTrackers}
                label="1x1 Takip Piksellerini Engelle"
                description="Gelen bülten ve pazarlama iletilerindeki dış kaynaklı 1x1 piksel görünmez casus takip görsellerini otomatik engeller."
              />

              <ToggleSwitch
                checked={requireBiometric}
                onChange={setRequireBiometric}
                label="Biyometrik / Güvenlik Koruması"
                description="Uygulama arka plandan geri açıldığında cihazınızın biyometrik sensörü veya kilit kodu ile teyit ister."
              />

              {/* Şifreli Kasa Butonu ve Yönetimi */}
              <div className="py-2">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Yerel Şifreli Kasa (AES-256-CBC)
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        IMAP şifreleri, oturum tokenleri ve hassas kimlik bilgilerinizi şifreli yerel kasada güvenle yönetin.
                      </p>
                    </div>
                  </div>
                  {onOpenVaultModal && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenVaultModal();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-colors shrink-0"
                    >
                      Kasayı Aç
                    </button>
                  )}
                </div>
              </div>

              <div className="py-4">
                <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] flex items-start gap-3">
                  <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-200">
                      Yerel Şifreleme Garantisi
                    </p>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Tüm e-posta verileriniz, oturum anahtarlarınız ve analiz kayıtlarınız cihazınızda AES-256-CBC standardıyla şifrelenir. Harici hiçbir üçüncü parti sunucuya veri aktarılmaz.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OTOMASYON (AUTOMATION & TELEGRAM) */}
          {activeTab === 'automation' && (
            <div className="space-y-6 animate-fade-in">
              <ToggleSwitch
                checked={autoDeleteUnsubscribed}
                onChange={setAutoDeleteUnsubscribed}
                label="Abonelikten Çıkınca Geçmişi Temizle"
                description="Bir bültenden çıkıldığında, ilgili göndericiye ait geçmiş tüm eski tanıtım e-postalarını doğrudan çöp kutusuna taşır."
              />

              {/* Telegram Bot Section */}
              <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-200">
                        Telegram Bot Asistanı (Telegraf)
                      </h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Yoldayken Telegram üzerinden sesli veya yazılı komutlarla gelen kutunuzu yönetin.
                      </p>
                    </div>
                  </div>
                  {telegramEnabled && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
                      Aktif 🟢
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                      Telegram Bot Token (BotFather'dan alınan)
                    </label>
                    <input
                      type="password"
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border-0 text-xs text-zinc-900 dark:text-zinc-200 outline-hidden font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                      Yetkili Telegram Chat ID (Sıkı Whitelist Koruması)
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: 987654321"
                      value={chatIdInput}
                      onChange={(e) => setChatIdInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border-0 text-xs text-zinc-900 dark:text-zinc-200 outline-hidden font-mono"
                    />
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                      Yalnızca bu ID'den gelen mesajlar işleme alınır. Diğer kullanıcılara erişim reddedilir.
                    </p>
                  </div>

                  <button
                    onClick={handleSaveTelegram}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white transition-colors"
                  >
                    {telegramSaved ? 'Ayarlar Kaydedildi ✓' : 'Telegram Botunu Başlat / Güncelle'}
                  </button>
                </div>

                {/* NLP Command Simulator */}
                <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] space-y-3 mt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 block">
                    Doğal Dil Komut Testi (NLP Simülatörü)
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={simCommand}
                      onChange={(e) => setSimCommand(e.target.value)}
                      placeholder="Örn: Son 3 saatteki spam mailleri temizle"
                      className="flex-1 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border-0 text-xs outline-hidden"
                    />
                    <button
                      onClick={handleRunSimCommand}
                      disabled={simLoading}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors shrink-0"
                    >
                      {simLoading ? 'Çözümleniyor...' : 'Test Et'}
                    </button>
                  </div>

                  {simResponse && (
                    <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 text-xs whitespace-pre-line leading-relaxed text-zinc-300">
                      {simResponse}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GENEL (GENERAL & AI ENGINE) */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-fade-in">
              {/* Aktif Yapay Zeka Modeli Açılır Listesi */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                  Aktif Yapay Zeka Modeli (AI Engine)
                </label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAIProvider(e.target.value as AIProvider)}
                  className="w-full px-4 py-3 rounded-2xl bg-black/5 dark:bg-white/5 border-0 text-xs font-semibold text-zinc-900 dark:text-zinc-200 outline-hidden cursor-pointer"
                >
                  <option value="gemini" className="bg-zinc-900 text-zinc-200">
                    Google Gemini (gemini-2.5-flash — Yüksek Hız & Akıllı Analiz)
                  </option>
                  <option value="openai" className="bg-zinc-900 text-zinc-200">
                    OpenAI (gpt-4o — Güçlü Muhakeme & Hızlı Yanıt)
                  </option>
                  <option value="anthropic" className="bg-zinc-900 text-zinc-200">
                    Anthropic Claude (claude-3-7-sonnet — Hassas Güvenlik & Hibrit Akıl Yürütme)
                  </option>
                  <option value="ollama" className="bg-zinc-900 text-zinc-200">
                    Ollama (Yerel / Sıfır Maliyet — localhost:11434)
                  </option>
                </select>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  Tüm e-posta sınıflandırmaları, kargo takip ayrıştırmaları ve fatura tespitleri seçilen bu model fabrikası üzerinden çalışır.
                </p>
              </div>

              {/* Ollama Endpoint Input if selected */}
              {aiProvider === 'ollama' && (
                <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] space-y-2 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200">
                      Ollama REST API Yapılandırması
                    </span>
                  </div>
                  <input
                    type="text"
                    value={ollamaEndpoint}
                    onChange={(e) => setOllamaEndpoint(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border-0 text-xs font-mono outline-hidden"
                  />
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Terminalinizde 'ollama run llama3' veya 'mistral' modelinin yüklü olduğundan emin olun.
                  </p>
                </div>
              )}

              {/* Masaüstü Kurulumu (EXE / PWA) */}
              {onOpenDesktopModal && (
                <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 flex items-center justify-center shrink-0">
                      <Laptop className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Masaüstü Uygulaması (Setup .EXE / PWA)
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Windows için bağımsız kurulum paketi veya masaüstü PWA istemcisi.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenDesktopModal();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900 font-semibold text-xs transition-colors shrink-0"
                  >
                    Kurulum
                  </button>
                </div>
              )}

              {/* E-posta IMAP Senkronizasyonu */}
              <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Doğrudan IMAP Senkronizasyonu
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Google Uygulama Şifresi ile anlık bellek üzerinden güvenli bağlantı.
                    </p>
                  </div>
                  {onOpenLoginModal && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenLoginModal();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shrink-0"
                    >
                      Giriş Yap
                    </button>
                  )}
                </div>
              </div>

              {/* Version and System Info */}
              <div className="pt-4 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <div>
                  <p className="font-bold text-zinc-900 dark:text-zinc-200">Sift</p>
                  <p className="text-[11px]">Sürüm 2.0.0 — Zen Edition</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 text-[10px] font-semibold">
                  Human-in-the-Loop Korumalı
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
