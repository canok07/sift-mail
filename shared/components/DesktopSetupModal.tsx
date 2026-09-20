import React, { useState } from 'react';
import {
  X,
  Download,
  Monitor,
  Globe,
  CheckCircle2,
  Cpu,
  Laptop,
  Apple,
  Terminal,
} from 'lucide-react';
import {
  downloadWindowsSetupExe,
  downloadMacSetupScript,
  downloadLinuxSetupScript,
  downloadDesktopPackageJson,
} from '../services/desktopInstaller';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppTheme } from './Header';

interface DesktopSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: AppTheme;
}

export const DesktopSetupModal: React.FC<DesktopSetupModalProps> = ({
  isOpen,
  onClose,
  theme = 'light',
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [downloadedOs, setDownloadedOs] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<'windows' | 'mac' | 'linux' | 'pwa'>('windows');
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  if (!isOpen) return null;

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const handleDownloadWindows = () => {
    downloadWindowsSetupExe(currentUrl);
    setDownloadedOs('windows');
    setTimeout(() => setDownloadedOs(null), 4000);
  };

  const handleDownloadMac = () => {
    downloadMacSetupScript(currentUrl);
    setDownloadedOs('mac');
    setTimeout(() => setDownloadedOs(null), 4000);
  };

  const handleDownloadLinux = () => {
    downloadLinuxSetupScript(currentUrl);
    setDownloadedOs('linux');
    setTimeout(() => setDownloadedOs(null), 4000);
  };

  const modalBg = isOled ? 'bg-[#0a0a0a] text-zinc-100 border-white/10' : isDark ? 'bg-[#18181b] text-zinc-100 border-white/10' : 'bg-white text-zinc-900 border-zinc-200';
  const cardBg = isOled ? 'bg-white/[0.03] border-white/10' : isDark ? 'bg-white/[0.04] border-white/10' : 'bg-zinc-50 border-zinc-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className={`rounded-2xl max-w-2xl w-full my-8 shadow-2xl border flex flex-col max-h-[92vh] overflow-hidden ${modalBg}`}>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-zinc-950 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Cross-Platform (Windows • Mac • Linux • Web)
                </span>
                <span className="text-xs text-zinc-400">v0.5.1</span>
              </div>
              <h2 className="text-base font-bold text-white mt-1">
                Sift — Masaüstü Kurulumu & Çapraz Platform Erişimi
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Switcher Tabs */}
        <div className="px-5 pt-4 pb-2 border-b border-black/5 dark:border-white/5 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActivePlatform('windows')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              activePlatform === 'windows'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Windows</span>
          </button>
          <button
            onClick={() => setActivePlatform('mac')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              activePlatform === 'mac'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Apple className="w-3.5 h-3.5" />
            <span>macOS</span>
          </button>
          <button
            onClick={() => setActivePlatform('linux')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              activePlatform === 'linux'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Linux</span>
          </button>
          <button
            onClick={() => setActivePlatform('pwa')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              activePlatform === 'pwa'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web / PWA</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Windows View */}
          {activePlatform === 'windows' && (
            <div className={`p-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 space-y-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                    <Laptop className="w-3 h-3" />
                    Windows 10 / 11 (Setup.bat / .exe)
                  </div>
                  <h3 className="text-sm font-bold">Windows Otomatik Masaüstü Kurulumu</h3>
                  <p className="text-xs opacity-75 leading-relaxed">
                    Masaüstü simgesi oluşturur, Başlat menüsüne ekler ve tarayıcı çubukları olmadan tam bağımsız Windows penceresi olarak çalıştırır.
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-[11px] opacity-60">Edge & Chrome motoru ile yerel pencere modu</span>
                <button
                  onClick={handleDownloadWindows}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {downloadedOs === 'windows' ? 'Kurulum İndirildi!' : 'Windows Kurulumunu İndir'}
                </button>
              </div>
            </div>
          )}

          {/* macOS View */}
          {activePlatform === 'mac' && (
            <div className={`p-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 space-y-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                    <Apple className="w-3 h-3" />
                    macOS Ventura / Sonoma / Sequoia (Intel & Apple Silicon)
                  </div>
                  <h3 className="text-sm font-bold">macOS Yerel Başlatıcı & Dock Kısayolu</h3>
                  <p className="text-xs opacity-75 leading-relaxed">
                    ~/Applications klasörünüze Sift.app yerel uygulamasını kurar ve bağımsız Dock simgesi üzerinden tek tıkla açılmasını sağlar.
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-[11px] opacity-60">Apple Silicon (M1/M2/M3/M4) ve Intel uyumlu</span>
                <button
                  onClick={handleDownloadMac}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {downloadedOs === 'mac' ? 'Mac Script İndirildi!' : 'macOS Kurulumunu İndir (.command)'}
                </button>
              </div>
            </div>
          )}

          {/* Linux View */}
          {activePlatform === 'linux' && (
            <div className={`p-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 space-y-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                    <Terminal className="w-3 h-3" />
                    Ubuntu / Debian / Fedora / Arch / Linux Mint
                  </div>
                  <h3 className="text-sm font-bold">Linux (.desktop) Uygulama Menü Kurulumu</h3>
                  <p className="text-xs opacity-75 leading-relaxed">
                    ~/.local/share/applications dizinine sift.desktop oluşturur; GNOME, KDE, XFCE veya Wayland masaüstü arama menünüze entegre eder.
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-[11px] opacity-60">X11 & Wayland uyumlu yerel masaüstü girişi</span>
                <button
                  onClick={handleDownloadLinux}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {downloadedOs === 'linux' ? 'Linux Script İndirildi!' : 'Linux Kurulumunu İndir (.sh)'}
                </button>
              </div>
            </div>
          )}

          {/* Web / PWA View */}
          {activePlatform === 'pwa' && (
            <div className={`p-4 rounded-xl border ${cardBg} space-y-3`}>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-600 dark:text-sky-400">
                  <Globe className="w-3 h-3" />
                  Tarayıcı Tabanlı Kurulum (PWA)
                </div>
                <h3 className="text-sm font-bold">1-Tıkla Tarayıcıdan Yükle</h3>
                <p className="text-xs opacity-75 leading-relaxed">
                  Chrome, Edge, Brave veya Safari üzerinden doğrudan bilgisayarınıza bağımsız uygulama olarak yükleyebilirsiniz. Çevrimdışı önbellek desteği sağlar.
                </p>
              </div>

              <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-[11px] opacity-60">
                  {isInstalled ? 'Uygulama zaten yüklü.' : 'Tüm modern tarayıcılarda çalışır'}
                </span>
                {isInstalled ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    Yüklü & Aktif
                  </span>
                ) : isInstallable ? (
                  <button
                    onClick={install}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-xs transition-colors shrink-0"
                  >
                    <Laptop className="w-4 h-4" />
                    Şimdi Masaüstüne Yükle
                  </button>
                ) : (
                  <div className="text-xs opacity-60">
                    Tarayıcı çubuğundaki "Uygulamayı Yükle" simgesine tıklayabilirsiniz.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Electron Geliştirici & NSIS Paketi */}
          <div className={`p-4 rounded-xl border ${cardBg} space-y-2.5`}>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 opacity-70" />
              <h4 className="text-xs font-bold uppercase tracking-wide">
                Electron & Özel Derleme Paketi (Gelişmiş)
              </h4>
            </div>
            <p className="text-xs opacity-75">
              İsterseniz projedeki <code className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-black/5 dark:bg-white/10">apps/desktop/electron/main.cjs</code> dosyasını kullanarak kendi NSIS veya AppImage paketinizi doğrudan oluşturabilirsiniz.
            </p>
            <div className="p-3 bg-zinc-950 rounded-lg text-zinc-300 font-mono text-[11px] space-y-1 overflow-x-auto border border-white/10">
              <div># Masaüstü paketi oluşturma komutu:</div>
              <div className="text-emerald-400">npx electron-builder build --win --x64</div>
            </div>
            <button
              onClick={() => downloadDesktopPackageJson(currentUrl)}
              className="text-xs font-semibold text-emerald-500 hover:text-emerald-400 inline-flex items-center gap-1 mt-1"
            >
              <Download className="w-3.5 h-3.5" />
              Masaüstü package.json yapılandırmasını indir
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-between">
          <span className="text-xs opacity-60">
            İşletim sisteminizden bağımsız, yerel depolama ve sıfır sızıntı garantisi.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white text-xs font-semibold transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
