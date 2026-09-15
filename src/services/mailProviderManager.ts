import { MailProvider, ConnectedAccount, EmailMessage } from '../types';

export interface ProviderMeta {
  id: MailProvider;
  name: string;
  shortName: string;
  tagline: string;
  badgeClass: string;
  accentColor: string;
  defaultHost?: string;
  defaultPort?: number;
  authType: 'oauth' | 'app_password' | 'credentials';
}

export const PROVIDERS_META: Record<MailProvider, ProviderMeta> = {
  gmail: {
    id: 'gmail',
    name: 'Google Gmail',
    shortName: 'Gmail',
    tagline: 'Google Gmail IMAP/SMTP ve Uygulama Şifresi entegrasyonu',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    accentColor: '#ea4335',
    defaultHost: 'imap.gmail.com',
    defaultPort: 993,
    authType: 'app_password',
  },
  outlook: {
    id: 'outlook',
    name: 'Microsoft Outlook / Office 365',
    shortName: 'Outlook',
    tagline: 'Hotmail, Live ve Kurumsal Microsoft 365 posta kutuları',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    accentColor: '#0078d4',
    defaultHost: 'outlook.office365.com',
    defaultPort: 993,
    authType: 'app_password',
  },
  yahoo: {
    id: 'yahoo',
    name: 'Yahoo Mail',
    shortName: 'Yahoo',
    tagline: 'Yahoo Uygulama Şifresi veya IMAP senkronizasyonu',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    accentColor: '#6001d2',
    defaultHost: 'imap.mail.yahoo.com',
    defaultPort: 993,
    authType: 'app_password',
  },
  icloud: {
    id: 'icloud',
    name: 'Apple iCloud Mail',
    shortName: 'iCloud',
    tagline: '@icloud.com ve @me.com e-posta hesapları',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    accentColor: '#0070c9',
    defaultHost: 'imap.mail.me.com',
    defaultPort: 993,
    authType: 'app_password',
  },
  imap: {
    id: 'imap',
    name: 'Kurumsal & Özel IMAP',
    shortName: 'IMAP / Özel',
    tagline: 'Yandex, cPanel, Zimbra veya şirket içi özel sunucular',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    accentColor: '#059669',
    defaultPort: 993,
    authType: 'credentials',
  },
};

// Clean empty initial state - dynamic accounts are connected by the user via IMAP
export const INITIAL_ACCOUNTS: ConnectedAccount[] = [];

// Clean empty array - no dummy/mock emails
export const MULTI_PROVIDER_SAMPLE_EMAILS: EmailMessage[] = [];

export interface AutoDiscoveredConfig {
  email: string;
  domain: string;
  provider: MailProvider;
  providerName: string;
  shortName: string;
  accentColor: string;
  badgeClass: string;
  isKnownProvider: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  authType: 'oauth' | 'app_password' | 'credentials';
  hint: string;
}

/**
 * Intelligent domain discovery for incoming email addresses.
 * Maps known providers (@gmail, @yandex, @outlook, @yahoo, @icloud, @zoho)
 * or dynamically auto-configures custom/corporate IMAP domains.
 */
export function detectMailProvider(rawEmail: string): AutoDiscoveredConfig {
  const cleanEmail = rawEmail.trim().toLowerCase();
  const domain = cleanEmail.includes('@') ? cleanEmail.split('@')[1].trim() : '';

  // 1. Google Gmail
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return {
      email: cleanEmail,
      domain,
      provider: 'gmail',
      providerName: 'Google Gmail',
      shortName: 'Gmail',
      accentColor: '#ea4335',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      isKnownProvider: true,
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecure: true,
      authType: 'app_password',
      hint: 'Google Gmail (imap.gmail.com:993) algılandı. Google 2 Adımlı Doğrulama ve Uygulama Şifreniz ile doğrudan bağlanın.',
    };
  }

  // 2. Microsoft Outlook / Hotmail / Office365
  if (
    [
      'outlook.com',
      'hotmail.com',
      'live.com',
      'msn.com',
      'office365.com',
      'outlook.com.tr',
      'hotmail.com.tr',
    ].includes(domain)
  ) {
    return {
      email: cleanEmail,
      domain,
      provider: 'outlook',
      providerName: 'Microsoft Outlook / Hotmail',
      shortName: 'Outlook',
      accentColor: '#0078d4',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
      isKnownProvider: true,
      imapHost: 'outlook.office365.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
      smtpSecure: false,
      authType: 'app_password',
      hint: 'Microsoft Exchange / 365 sunucusu (outlook.office365.com:993) otomatik tanımlandı.',
    };
  }

  // 3. Yandex Mail
  if (
    ['yandex.com', 'yandex.com.tr', 'ya.ru', 'yandex.ru', 'yandex.kz', 'yandex.ua'].includes(
      domain
    )
  ) {
    return {
      email: cleanEmail,
      domain,
      provider: 'imap',
      providerName: 'Yandex Mail',
      shortName: 'Yandex',
      accentColor: '#fc3f1d',
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      isKnownProvider: true,
      imapHost: 'imap.yandex.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.yandex.com',
      smtpPort: 465,
      smtpSecure: true,
      authType: 'app_password',
      hint: 'Yandex IMAP sunucusu (imap.yandex.com:993) otomatik tanımlandı. Uygulama Parolanızı girin.',
    };
  }

  // 4. Yahoo Mail
  if (['yahoo.com', 'yahoo.com.tr', 'ymail.com', 'rocketmail.com'].includes(domain)) {
    return {
      email: cleanEmail,
      domain,
      provider: 'yahoo',
      providerName: 'Yahoo Mail',
      shortName: 'Yahoo',
      accentColor: '#6001d2',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      isKnownProvider: true,
      imapHost: 'imap.mail.yahoo.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.mail.yahoo.com',
      smtpPort: 465,
      smtpSecure: true,
      authType: 'app_password',
      hint: 'Yahoo IMAP sunucusu (imap.mail.yahoo.com:993) otomatik tanımlandı. Uygulama Şifreniz ile bağlanın.',
    };
  }

  // 5. Apple iCloud
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) {
    return {
      email: cleanEmail,
      domain,
      provider: 'icloud',
      providerName: 'Apple iCloud Mail',
      shortName: 'iCloud',
      accentColor: '#0070c9',
      badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
      isKnownProvider: true,
      imapHost: 'imap.mail.me.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.mail.me.com',
      smtpPort: 587,
      smtpSecure: false,
      authType: 'app_password',
      hint: 'Apple iCloud IMAP sunucusu (imap.mail.me.com:993) otomatik tanımlandı. Apple ID Uygulama Parolası gereklidir.',
    };
  }

  // 6. Zoho Mail
  if (['zoho.com', 'zohomail.com'].includes(domain)) {
    return {
      email: cleanEmail,
      domain,
      provider: 'imap',
      providerName: 'Zoho Mail',
      shortName: 'Zoho',
      accentColor: '#1389e4',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      isKnownProvider: true,
      imapHost: 'imappro.zoho.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtppro.zoho.com',
      smtpPort: 465,
      smtpSecure: true,
      authType: 'app_password',
      hint: 'Zoho IMAP/SMTP sunucusu otomatik yapılandırıldı.',
    };
  }

  // 7. Proton Mail (Bridge)
  if (['proton.me', 'protonmail.com', 'pm.me'].includes(domain)) {
    return {
      email: cleanEmail,
      domain,
      provider: 'imap',
      providerName: 'Proton Mail',
      shortName: 'Proton',
      accentColor: '#6d4aff',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      isKnownProvider: true,
      imapHost: '127.0.0.1',
      imapPort: 1143,
      imapSecure: false,
      smtpHost: '127.0.0.1',
      smtpPort: 1025,
      smtpSecure: false,
      authType: 'credentials',
      hint: 'Proton Bridge yerel köprü adresi (127.0.0.1:1143) otomatik tanımlandı.',
    };
  }

  // 8. Custom / Corporate domain (Kurumsal e-posta)
  const isCustomDomain = Boolean(domain && domain.includes('.'));
  const domainPrefix = domain ? domain.split('.')[0].toUpperCase() : 'IMAP';

  return {
    email: cleanEmail,
    domain,
    provider: 'imap',
    providerName: isCustomDomain ? `${domain} Kurumsal E-posta` : 'Özel / Kurumsal IMAP',
    shortName: isCustomDomain ? domainPrefix : 'IMAP',
    accentColor: '#059669',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    isKnownProvider: false,
    imapHost: domain ? `imap.${domain}` : '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: domain ? `smtp.${domain}` : '',
    smtpPort: 465,
    smtpSecure: true,
    authType: 'credentials',
    hint: isCustomDomain
      ? `Kurumsal alan adı (@${domain}) tespit edildi. Standart IMAP (imap.${domain}) ve SMTP sunucu ayarları otomatik hazırlandı.`
      : 'E-posta adresinizi girdiğinizde sunucu ayarları otomatik keşfedilecektir.',
  };
}
