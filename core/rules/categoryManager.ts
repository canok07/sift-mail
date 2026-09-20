import { SafeCategory, AutoRule, EmailMessage } from '../../shared/types';

export interface CategoryMetadata {
  id: SafeCategory;
  name: string;
  shortLabel: string;
  description: string;
  gmailLabel: string;
  color: {
    bg: string;
    text: string;
    border: string;
    badge: string;
    activeTab: string;
  };
}

export const CATEGORIES_META: Record<SafeCategory, CategoryMetadata> = {
  work: {
    id: 'work',
    name: 'İş & Projeler',
    shortLabel: 'İş',
    description: 'Şirket içi yazışmalar, toplantı notları, GitHub, Jira ve proje görevleri',
    gmailLabel: 'Güvenli/İş & Projeler',
    color: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      activeTab: 'bg-emerald-700 text-white',
    },
  },
  finance: {
    id: 'finance',
    name: 'Finans & Fatura',
    shortLabel: 'Finans',
    description: 'Banka dekontları, aylık abonelikler, SaaS ve bulut fatura bildirimleri',
    gmailLabel: 'Güvenli/Finans & Fatura',
    color: {
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      border: 'border-blue-200',
      badge: 'bg-blue-100 text-blue-800 border-blue-300',
      activeTab: 'bg-blue-700 text-white',
    },
  },
  shopping: {
    id: 'shopping',
    name: 'Sipariş & Kargo',
    shortLabel: 'Sipariş',
    description: 'E-ticaret sipariş onayları, kargo takip ve teslimat hareketleri',
    gmailLabel: 'Güvenli/Sipariş & Kargo',
    color: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
      activeTab: 'bg-amber-700 text-white',
    },
  },
  official: {
    id: 'official',
    name: 'Resmi & Bildirim',
    shortLabel: 'Resmi',
    description: 'e-Devlet, kamu kurumları, üniversiteler ve resmi tebligatlar',
    gmailLabel: 'Güvenli/Resmi Bildirim',
    color: {
      bg: 'bg-purple-50',
      text: 'text-purple-800',
      border: 'border-purple-200',
      badge: 'bg-purple-100 text-purple-800 border-purple-300',
      activeTab: 'bg-purple-700 text-white',
    },
  },
  personal: {
    id: 'personal',
    name: 'Kişisel & Sosyal',
    shortLabel: 'Kişisel',
    description: 'Aile, arkadaşlar, kişisel davetler ve sosyal yazışmalar',
    gmailLabel: 'Güvenli/Kişisel',
    color: {
      bg: 'bg-teal-50',
      text: 'text-teal-800',
      border: 'border-teal-200',
      badge: 'bg-teal-100 text-teal-800 border-teal-300',
      activeTab: 'bg-teal-700 text-white',
    },
  },
  travel: {
    id: 'travel',
    name: 'Seyahat & Bilet',
    shortLabel: 'Seyahat',
    description: 'Uçak ve tren biletleri, otel rezervasyonları, seyahat planları',
    gmailLabel: 'Güvenli/Seyahat & Bilet',
    color: {
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-200',
      badge: 'bg-rose-100 text-rose-800 border-rose-300',
      activeTab: 'bg-rose-700 text-white',
    },
  },
  other: {
    id: 'other',
    name: 'Diğer Güvenli',
    shortLabel: 'Diğer',
    description: 'Genel bilgilendirmeler ve diğer doğrulanmış güvenli iletiler',
    gmailLabel: 'Güvenli/Genel',
    color: {
      bg: 'bg-slate-50',
      text: 'text-slate-800',
      border: 'border-slate-200',
      badge: 'bg-slate-100 text-slate-800 border-slate-300',
      activeTab: 'bg-slate-800 text-white',
    },
  },
};

// Initial default smart rules for future incoming emails
export const DEFAULT_AUTO_RULES: AutoRule[] = [
  {
    id: 'rule-1',
    category: 'work',
    patternType: 'domain',
    patternValue: 'sirket.com.tr',
    isActive: true,
    matchCount: 1,
    createdAt: new Date().toISOString(),
    description: 'Şirket içi e-postaları "İş & Projeler" kategorisine ata',
  },
  {
    id: 'rule-2',
    category: 'work',
    patternType: 'subject',
    patternValue: 'sprint',
    isActive: true,
    matchCount: 1,
    createdAt: new Date().toISOString(),
    description: 'Konusunda "sprint", "planlama" geçen iletileri "İş & Projeler" kategorisine ata',
  },
  {
    id: 'rule-3',
    category: 'finance',
    patternType: 'domain',
    patternValue: 'google.com',
    isActive: true,
    matchCount: 1,
    createdAt: new Date().toISOString(),
    description: 'Google Cloud ve fatura bildirimlerini "Finans & Fatura" kategorisine ata',
  },
  {
    id: 'rule-4',
    category: 'finance',
    patternType: 'subject',
    patternValue: 'fatura',
    isActive: true,
    matchCount: 1,
    createdAt: new Date().toISOString(),
    description: 'Konusunda "fatura" veya "ekstre" geçen iletileri "Finans & Fatura" kategorisine ata',
  },
  {
    id: 'rule-5',
    category: 'shopping',
    patternType: 'domain',
    patternValue: 'hepsiburada.com',
    isActive: true,
    matchCount: 1,
    createdAt: new Date().toISOString(),
    description: 'Hepsiburada ve e-ticaret siparişlerini "Sipariş & Kargo" kategorisine ata',
  },
  {
    id: 'rule-6',
    category: 'official',
    patternType: 'domain',
    patternValue: 'turkiye.gov.tr',
    isActive: true,
    matchCount: 1,
    createdAt: new Date().toISOString(),
    description: 'e-Devlet ve .gov.tr kamu bildirimlerini "Resmi & Bildirim" kategorisine ata',
  },
  {
    id: 'rule-7',
    category: 'travel',
    patternType: 'domain',
    patternValue: 'turkishairlines.com',
    isActive: true,
    matchCount: 1,
    createdAt: new Date().toISOString(),
    description: 'THY ve havayolu biletlerini "Seyahat & Bilet" kategorisine ata',
  },
];

// Helper to evaluate an email against active AutoRules for future incoming email classification
export function evaluateAutoRules(
  email: EmailMessage,
  rules: AutoRule[]
): { matchedRule: AutoRule; category: SafeCategory } | null {
  const activeRules = rules.filter((r) => r.isActive);
  const fromLower = email.from.toLowerCase();
  const subjectLower = email.subject.toLowerCase();
  const fromEmail = email.fromEmail?.toLowerCase() || '';

  for (const rule of activeRules) {
    const val = rule.patternValue.toLowerCase();

    if (rule.patternType === 'domain') {
      // Check if sender domain matches
      if (fromEmail.endsWith(val) || fromLower.includes(`@${val}`) || fromLower.includes(`.${val}`)) {
        return { matchedRule: rule, category: rule.category };
      }
    } else if (rule.patternType === 'from') {
      if (fromEmail.includes(val) || fromLower.includes(val)) {
        return { matchedRule: rule, category: rule.category };
      }
    } else if (rule.patternType === 'subject') {
      if (subjectLower.includes(val)) {
        return { matchedRule: rule, category: rule.category };
      }
    }
  }

  return null;
}

// Extract domain from email address
export function extractDomain(emailStr: string): string {
  const match = emailStr.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].toLowerCase() : '';
}
