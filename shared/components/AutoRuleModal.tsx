import React, { useState } from 'react';
import {
  X,
  SlidersHorizontal,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Globe,
  Mail,
  FileText,
  Copy,
  Download,
  Info,
} from 'lucide-react';
import { AutoRule, SafeCategory } from '../types';
import { CATEGORIES_META } from '../../core/rules/categoryManager';

interface AutoRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: AutoRule[];
  onAddRule: (rule: Omit<AutoRule, 'id' | 'createdAt' | 'matchCount'>) => void;
  onToggleRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  autoWatcherEnabled: boolean;
  onToggleAutoWatcher: (enabled: boolean) => void;
}

export const AutoRuleModal: React.FC<AutoRuleModalProps> = ({
  isOpen,
  onClose,
  rules,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  autoWatcherEnabled,
  onToggleAutoWatcher,
}) => {
  const [newCategory, setNewCategory] = useState<SafeCategory>('work');
  const [newPatternType, setNewPatternType] = useState<'domain' | 'from' | 'subject'>('domain');
  const [newPatternValue, setNewPatternValue] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [copiedQuery, setCopiedQuery] = useState(false);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatternValue.trim()) return;

    onAddRule({
      category: newCategory,
      patternType: newPatternType,
      patternValue: newPatternValue.trim().toLowerCase(),
      isActive: true,
      description:
        newDescription.trim() ||
        `${newPatternValue.trim()} eşleşmesi "${CATEGORIES_META[newCategory].name}" kategorisine aktarılır`,
    });

    setNewPatternValue('');
    setNewDescription('');
  };

  // Generate Gmail Filter Search Query syntax
  const generateGmailFilterQuery = () => {
    return rules
      .filter((r) => r.isActive)
      .map((r) => {
        if (r.patternType === 'domain') return `from:(*@${r.patternValue})`;
        if (r.patternType === 'from') return `from:(${r.patternValue})`;
        return `subject:(${r.patternValue})`;
      })
      .join(' OR ');
  };

  const handleCopyFilterQuery = () => {
    const q = generateGmailFilterQuery();
    navigator.clipboard.writeText(q);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-xs">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Gelecek İletiler İçin Otomatik Ayrıştırma Kuralları
              </h2>
              <p className="text-xs text-slate-600">
                Gelen kutunuza bundan sonra düşecek yeni e-postaları eşleşen kurallara göre anında sınıflandırır.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Live Watcher Card */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 mt-0.5">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-emerald-950">
                    Canlı Gelen Kutusu İzleyici (Auto-Categorizer)
                  </h3>
                  <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-200 text-emerald-900">
                    {autoWatcherEnabled ? 'Aktif' : 'Devre Dışı'}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                  Yeni gelen e-postalar otomatik olarak analiz edilir; NLP ve aşağıdaki kurallarla eşleşerek ait olduğu güvenli kategoriye atanır.
                </p>
              </div>
            </div>
            <button
              onClick={() => onToggleAutoWatcher(!autoWatcherEnabled)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0 ${
                autoWatcherEnabled
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              {autoWatcherEnabled ? 'İzleyiciyi Durdur' : 'İzleyiciyi Başlat'}
            </button>
          </div>

          {/* New Rule Form */}
          <form onSubmit={handleCreate} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-slate-700" />
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Yeni Otomatik Kural Tanımla
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Target Category */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Hedef Kategori
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as SafeCategory)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 font-medium"
                >
                  {Object.entries(CATEGORIES_META).map(([catKey, meta]) => (
                    <option key={catKey} value={catKey}>
                      {meta.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pattern Type */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Eşleşme Kriteri
                </label>
                <select
                  value={newPatternType}
                  onChange={(e) => setNewPatternType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 font-medium"
                >
                  <option value="domain">Alan Adı (Domain)</option>
                  <option value="from">Gönderici E-posta</option>
                  <option value="subject">Konuda Geçen Kelime</option>
                </select>
              </div>

              {/* Pattern Value */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Kural Değeri
                </label>
                <input
                  type="text"
                  required
                  value={newPatternValue}
                  onChange={(e) => setNewPatternValue(e.target.value)}
                  placeholder={
                    newPatternType === 'domain'
                      ? 'örnek: github.com'
                      : newPatternType === 'from'
                      ? 'ornek@sirket.com'
                      : 'fatura, bilet, sprint'
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Description & Add button */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="İsteğe bağlı kural açıklaması (ör: Şirket içi yazışmaları İş'e ekle)"
                className="flex-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
              />
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors shrink-0"
              >
                Kuralı Kaydet
              </button>
            </div>
          </form>

          {/* Active Rules List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Kayıtlı Kurallar ({rules.length})
              </span>
              <span className="text-[11px] text-slate-600">
                Gelecek iletiler için anında devreye girer
              </span>
            </div>

            {rules.length === 0 ? (
              <p className="text-xs text-slate-600 italic p-4 text-center border border-dashed rounded-xl">
                Henüz özel bir kural eklenmedi. Yukarıdaki formdan yeni kural ekleyebilirsiniz.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {rules.map((rule) => {
                  const meta = CATEGORIES_META[rule.category] || CATEGORIES_META.other;

                  return (
                    <div
                      key={rule.id}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="mt-0.5 text-slate-400">
                          {rule.patternType === 'domain' ? (
                            <Globe className="w-4 h-4 text-blue-500" />
                          ) : rule.patternType === 'from' ? (
                            <Mail className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <FileText className="w-4 h-4 text-amber-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                              {rule.patternValue}
                            </span>
                            <span className="text-slate-400 text-xs">→</span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color.badge}`}
                            >
                              {meta.name}
                            </span>
                          </div>
                          {rule.description && (
                            <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                              {rule.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onToggleRule(rule.id)}
                          className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
                            rule.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {rule.isActive ? 'Aktif' : 'Pasif'}
                        </button>
                        <button
                          onClick={() => onDeleteRule(rule.id)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Kuralı Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Export / Gmail Native Filters */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <Info className="w-4 h-4 text-blue-600" />
                <span>Gmail Arama / Filtre Sözdizimi</span>
              </div>
              <button
                onClick={handleCopyFilterQuery}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 px-2 py-1 bg-white border border-slate-200 rounded-md shadow-xs transition-colors"
              >
                <Copy className="w-3 h-3" />
                {copiedQuery ? 'Kopyalandı!' : 'Sözdizimini Kopyala'}
              </button>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed font-mono bg-white p-2 rounded-lg border border-slate-200 break-all">
              {generateGmailFilterQuery() || 'Henüz aktif kural yok.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
