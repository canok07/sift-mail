import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  KeyRound,
  Lock,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { VaultSummary } from '../types';
import { AppTheme } from './Header';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: AppTheme;
}

export const VaultModal: React.FC<VaultModalProps> = ({
  isOpen,
  onClose,
  theme = 'light',
}) => {
  const [vault, setVault] = useState<VaultSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New item form
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<'imap_password' | 'gemini_api_key' | 'smtp_password'>('imap_password');
  const [secretValue, setSecretValue] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchVault = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vault');
      if (!res.ok) throw new Error('Kasa bilgisi alınamadı');
      const data = await res.json();
      setVault(data);
    } catch (err: any) {
      setError(err.message || 'Kasa yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchVault();
    }
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !secretValue.trim()) {
      setError('Lütfen anahtar ve şifreli değeri doldurun');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/vault/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key.trim(),
          label: label.trim() || key.trim(),
          category,
          value: secretValue.trim(),
        }),
      });

      if (!res.ok) throw new Error('Kaydedilemedi');
      setSuccessMsg('Veri AES-256-CBC ile yerel diske şifrelenerek kaydedildi.');
      setKey('');
      setLabel('');
      setSecretValue('');
      await fetchVault();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Kasa kaydetme başarısız oldu');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (secretKey: string) => {
    try {
      const res = await fetch(`/api/vault/${encodeURIComponent(secretKey)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchVault();
      }
    } catch (err) {
      console.warn('Silinemedi:', err);
    }
  };

  if (!isOpen) return null;

  const isOled = theme === 'oled';
  const isDark = theme === 'dark' || isOled;

  const modalBg = isOled ? 'bg-[#0a0a0a] text-zinc-100 border-white/10' : isDark ? 'bg-[#18181b] text-zinc-100 border-white/10' : 'bg-white text-zinc-900 border-zinc-200';
  const cardBg = isOled ? 'bg-white/[0.03] border-white/10' : isDark ? 'bg-white/[0.04] border-white/10' : 'bg-zinc-50 border-zinc-200';
  const inputBg = isOled ? 'bg-black border-white/15 text-zinc-100' : isDark ? 'bg-[#121214] border-white/10 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`relative w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden max-h-[90vh] flex flex-col ${modalBg}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-zinc-950 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Yerel Güvenli Kasa (Local Vault)
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                  AES-256-CBC
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                IMAP şifreleri ve Gemini API anahtarları yalnızca cihazınızda şifrelenir
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Security Banner */}
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-3">
            <Shield className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                Sıfır Bulut Sızıntısı Prensibi
              </p>
              <p className="text-[11px] opacity-90 leading-relaxed">
                Bu kasadaki veriler Node.js <code className="font-mono font-bold">crypto</code> modülü ve rastgele IV (Initialization Vector) ile yerel <code className="font-mono">./data/vault.enc</code> dosyasında saklanır. Hiçbir şifreniz harici sunuculara veya internete gönderilmez.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Stored Vault Keys */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-slate-600" />
                Şifreli Kayıtlar ({vault?.totalKeys || 0})
              </h3>
              <button
                onClick={fetchVault}
                className="text-[11px] text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Yenile
              </button>
            </div>

            {vault && vault.keys.length > 0 ? (
              <div className={`divide-y divide-black/5 dark:divide-white/5 border rounded-xl overflow-hidden ${cardBg}`}>
                {vault.keys.map((item) => (
                  <div key={item.key} className="p-3 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-xs font-bold">{item.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 opacity-75">
                          {item.category}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] opacity-60 font-mono">
                        <span>Değer: {item.maskedValue}</span>
                        <span>•</span>
                        <span className="text-[10px]">{new Date(item.updatedAt).toLocaleDateString('tr-TR')}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(item.key)}
                      className="p-1.5 opacity-60 hover:opacity-100 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Kasadan sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-4 rounded-xl border border-dashed text-center text-xs opacity-60 ${cardBg}`}>
                Henüz kasada kayıtlı parola veya API anahtarı yok. Aşağıdaki formu kullanarak ekleyebilirsiniz.
              </div>
            )}
          </div>

          {/* Add New Secret Form */}
          <form onSubmit={handleSave} className={`p-4 rounded-xl border space-y-3 ${cardBg}`}>
            <h4 className="text-xs font-bold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-500" />
              Yeni Şifre / Anahtar Ekle
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold opacity-75 mb-1">
                  Kategori
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    const cat = e.target.value as any;
                    setCategory(cat);
                    if (cat === 'gemini_api_key') {
                      setKey('gemini_custom_api_key');
                      setLabel('Özel Gemini API Anahtarı');
                    }
                  }}
                  className={`w-full text-xs px-3 py-2 rounded-lg border outline-hidden ${inputBg}`}
                >
                  <option value="imap_password">IMAP Posta Şifresi</option>
                  <option value="gemini_api_key">Özel Gemini API Anahtarı</option>
                  <option value="smtp_password">SMTP Gönderim Şifresi</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold opacity-75 mb-1">
                  Etiket / Açıklama
                </label>
                <input
                  type="text"
                  placeholder="örn: Şirket Maili IMAP Parolası"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className={`w-full text-xs px-3 py-2 rounded-lg border outline-hidden ${inputBg}`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold opacity-75 mb-1">
                Kasa Anahtarı (ID)
              </label>
              <input
                type="text"
                placeholder="örn: company_imap_pass veya gemini_custom_api_key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className={`w-full text-xs px-3 py-2 rounded-lg border font-mono outline-hidden ${inputBg}`}
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold opacity-75 mb-1">
                Gizli Değer (Şifre veya API Key)
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Şifrenizi ya da API anahtarınızı girin"
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  className={`w-full text-xs px-3 py-2 rounded-lg border pr-9 outline-hidden ${inputBg}`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                <Lock className="w-3.5 h-3.5" />
                {isSaving ? 'Şifreleniyor...' : 'Kasaya Güvenle Kaydet'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-between text-[11px] opacity-70">
          <span>Depolama: Yerel Disk (AES-256-CBC)</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
