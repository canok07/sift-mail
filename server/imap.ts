import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';

export type FolderType = 'inbox' | 'spam' | 'sent' | 'drafts' | 'trash' | 'archive' | 'other';

export interface MailboxInfo {
  path: string;
  name: string;
  type: FolderType;
  specialUse?: string;
  totalMessages?: number;
  unreadMessages?: number;
}

export interface ImapConnectOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass?: string;
    accessToken?: string;
  };
  folder?: string;
  folders?: string[];
  syncAllFolders?: boolean;
  offset?: number;
  accountId?: string;
  provider?: string;
}

export interface SmtpConnectOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass?: string;
    accessToken?: string;
    type?: string;
  };
}

export interface FetchedImapMessage {
  id: string;
  uid: number;
  messageId?: string;
  accountId?: string;
  folder: string;
  folderType: FolderType;
  subject: string;
  from: string;
  fromName?: string;
  fromEmail?: string;
  date: string;
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  headers?: string;
  listUnsubscribe?: string;
  isRead: boolean;
}

/**
 * Resolves TLS options adhering to strict security requirements:
 * - In production (`NODE_ENV === 'production'`), strict certificate validation (`rejectUnauthorized: true`)
 *   is MANDATORY and cannot be bypassed under any circumstances.
 * - In local development / testing, `rejectUnauthorized: true` is active by default.
 *   It can ONLY be disabled if explicitly allowed via `ALLOW_INSECURE_TLS='true'`.
 */
export function getTlsOptions(): { rejectUnauthorized: boolean; minVersion?: 'TLSv1.2' | 'TLSv1.3' } {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  }
  const allowInsecure = process.env.ALLOW_INSECURE_TLS === 'true';
  return { rejectUnauthorized: !allowInsecure, minVersion: 'TLSv1.2' };
}

/**
 * Classifies an IMAP mailbox into a standardized folder type across providers
 * (Gmail, Outlook, Yahoo, iCloud, Exchange, Generic IMAP)
 */
export function classifyMailbox(mailbox: {
  path: string;
  name: string;
  specialUse?: string;
}): { type: FolderType; displayName: string } {
  const specialUse = (mailbox.specialUse || '').toLowerCase();
  const path = mailbox.path.toLowerCase().trim();
  const name = mailbox.name.toLowerCase().trim();

  // 1. INBOX
  if (
    specialUse === '\\inbox' ||
    path === 'inbox' ||
    name === 'inbox' ||
    path.includes('gelen') ||
    name.includes('gelen')
  ) {
    return { type: 'inbox', displayName: 'Gelen Kutusu' };
  }

  // 2. SPAM / JUNK
  if (
    specialUse === '\\junk' ||
    specialUse.includes('junk') ||
    specialUse.includes('spam') ||
    path.includes('spam') ||
    path.includes('junk') ||
    path.includes('önemsiz') ||
    path.includes('gereksiz') ||
    name.includes('spam') ||
    name.includes('junk') ||
    name.includes('önemsiz') ||
    name.includes('gereksiz')
  ) {
    return { type: 'spam', displayName: 'Spam & Tehdit' };
  }

  // 3. SENT
  if (
    specialUse === '\\sent' ||
    specialUse.includes('sent') ||
    path.includes('sent') ||
    path.includes('gönderilen') ||
    name.includes('sent') ||
    name.includes('gönderilen')
  ) {
    return { type: 'sent', displayName: 'Gönderilenler' };
  }

  // 4. DRAFTS
  if (
    specialUse === '\\drafts' ||
    specialUse.includes('draft') ||
    path.includes('draft') ||
    path.includes('taslak') ||
    name.includes('draft') ||
    name.includes('taslak')
  ) {
    return { type: 'drafts', displayName: 'Taslaklar' };
  }

  // 5. TRASH
  if (
    specialUse === '\\trash' ||
    specialUse.includes('trash') ||
    path.includes('trash') ||
    path.includes('çöp') ||
    path.includes('deleted') ||
    path.includes('silinmiş') ||
    path.includes('silinen') ||
    name.includes('trash') ||
    name.includes('çöp') ||
    name.includes('deleted')
  ) {
    return { type: 'trash', displayName: 'Çöp Kutusu' };
  }

  // 6. ARCHIVE / ALL MAIL
  if (
    specialUse === '\\archive' ||
    specialUse === '\\all' ||
    specialUse.includes('archive') ||
    specialUse.includes('all') ||
    path.includes('archive') ||
    path.includes('all mail') ||
    path.includes('arşiv') ||
    path.includes('tüm postalar') ||
    name.includes('archive') ||
    name.includes('all mail') ||
    name.includes('arşiv')
  ) {
    return { type: 'archive', displayName: 'Arşiv' };
  }

  return { type: 'other', displayName: mailbox.name || mailbox.path };
}

export function formatImapError(err: any, host?: string): string {
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  const code = (err?.code || '').toLowerCase();
  const responseText = (err?.responseText || '').toLowerCase();
  const responseStatus = (err?.responseStatus || '').toLowerCase();
  const authFailed = Boolean(err?.authenticationFailed);
  const hostStr = (host || '').toLowerCase();

  const isOutlook = hostStr.includes('outlook') || hostStr.includes('office365') || hostStr.includes('live.com');
  const isGmail = hostStr.includes('gmail') || hostStr.includes('google');

  if (
    authFailed ||
    msg.includes('authenticationfailed') ||
    msg.includes('invalid credentials') ||
    msg.includes('auth') ||
    msg.includes('login') ||
    code.includes('auth') ||
    responseText.includes('authentication failed') ||
    responseText.includes('invalid credentials') ||
    responseStatus.includes('no')
  ) {
    if (isOutlook) {
      return (
        'Outlook / Hotmail kimlik doğrulaması başarısız. Microsoft hesaplarında parola desteği (Basic Auth) kapalıdır. ' +
        "Lütfen 'Microsoft ile Giriş Yap' (OAuth 2.0) butonunu kullanın. Eğer OAuth kullanıyorsanız, Outlook Web > Ayarlar > " +
        "E-posta > 'POP ve IMAP' bölümünden IMAP erişiminin etkinleştirildiğinden emin olun."
      );
    }
    if (isGmail) {
      return 'Gmail kimlik doğrulaması başarısız. Gmail için normal hesap şifresi yerine Google Hesabı > Güvenlik > 2 Adımlı Doğrulama altındaki 16 haneli Uygulama Şifresini (App Password) girmeniz gerekir.';
    }
    return 'IMAP kimlik doğrulaması başarısız. Lütfen e-posta adresinizi ve uygulama şifrenizi (App Password) kontrol edin.';
  }

  if (
    code.includes('etimedout') ||
    code.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  ) {
    return 'IMAP sunucusuna bağlanırken zaman aşımı oluştu. Lütfen sunucu adresi ve internet bağlantınızı kontrol edin.';
  }

  if (
    msg.includes('econnrefused') ||
    msg.includes('connection refused')
  ) {
    return 'IMAP sunucusu bağlantıyı reddetti. Lütfen sunucu adresi, port ve SSL/TLS ayarlarını kontrol edin.';
  }

  if (
    msg.includes('certificate') ||
    msg.includes('ssl') ||
    msg.includes('tls')
  ) {
    return 'IMAP SSL/TLS güvenlik anlaşması başarısız oldu. Sunucu TLS sertifikası doğrulanamadı.';
  }

  return err?.message || 'IMAP sunucusuna bağlanılamadı.';
}

function buildImapClient(options: ImapConnectOptions): ImapFlow {
  let authConfig: any;
  if (options.auth.accessToken) {
    authConfig = {
      user: options.auth.user,
      accessToken: options.auth.accessToken,
    };
  } else {
    authConfig = {
      user: options.auth.user,
      pass: options.auth.pass || '',
    };
  }

  return new ImapFlow({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: authConfig,
    logger: false,
    tls: getTlsOptions(),
  });
}

export async function testImapConnection(
  options: ImapConnectOptions
): Promise<{ success: boolean; message: string; mailboxes?: MailboxInfo[] }> {
  const client = buildImapClient(options);

  try {
    await client.connect();
    const rawBoxes = await client.list();
    const mailboxes: MailboxInfo[] = rawBoxes.map((b) => {
      const { type, displayName } = classifyMailbox(b);
      return {
        path: b.path,
        name: displayName,
        type,
        specialUse: b.specialUse,
      };
    });

    return {
      success: true,
      message: `IMAP bağlantısı başarılı! (${mailboxes.length} adet klasör tespit edildi)`,
      mailboxes,
    };
  } catch (err: any) {
    return {
      success: false,
      message: formatImapError(err, options.host),
    };
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {}
    }
  }
}

export async function fetchImapMessages(
  options: ImapConnectOptions,
  maxResults: number = 20
): Promise<{
  success: boolean;
  messages: FetchedImapMessage[];
  mailboxes: MailboxInfo[];
  error?: string;
}> {
  const client = buildImapClient(options);
  const accountId = options.accountId || 'acc-primary';

  try {
    await client.connect();

    // 1. Discover all mailboxes
    const rawBoxes = await client.list();
    const mailboxInfos: MailboxInfo[] = rawBoxes.map((b) => {
      const { type, displayName } = classifyMailbox(b);
      return {
        path: b.path,
        name: displayName,
        type,
        specialUse: b.specialUse,
      };
    });

    const allMessages: FetchedImapMessage[] = [];

    // Determine target folders to fetch
    let targetFolders: { path: string; type: FolderType }[] = [];

    if (options.folder) {
      const match = mailboxInfos.find((m) => m.path === options.folder);
      const fType = match ? match.type : classifyMailbox({ path: options.folder, name: options.folder }).type;
      targetFolders = [{ path: options.folder, type: fType }];
    } else if (options.folders && options.folders.length > 0) {
      targetFolders = options.folders.map((fPath) => {
        const match = mailboxInfos.find((m) => m.path === fPath);
        return {
          path: fPath,
          type: match ? match.type : classifyMailbox({ path: fPath, name: fPath }).type,
        };
      });
    } else {
      // Full sync: prioritize INBOX and SPAM/JUNK folders
      const inboxBox = mailboxInfos.find((m) => m.type === 'inbox') || { path: 'INBOX', type: 'inbox' as FolderType };
      const spamBox = mailboxInfos.find((m) => m.type === 'spam');
      const sentBox = mailboxInfos.find((m) => m.type === 'sent');

      targetFolders = [{ path: inboxBox.path, type: 'inbox' }];
      if (spamBox && spamBox.path !== inboxBox.path) {
        targetFolders.push({ path: spamBox.path, type: 'spam' });
      }
      if (sentBox && sentBox.path !== inboxBox.path) {
        targetFolders.push({ path: sentBox.path, type: 'sent' });
      }
    }

    // 2. Fetch messages from each target folder
    for (const target of targetFolders) {
      let lock: any = null;
      try {
        lock = await client.getMailboxLock(target.path);
        const mailbox = client.mailbox;
        const total = typeof mailbox === 'object' && mailbox && 'exists' in mailbox ? (mailbox as any).exists : 0;

        // Update mailbox count in metadata list
        const info = mailboxInfos.find((m) => m.path === target.path);
        if (info) {
          info.totalMessages = total;
        }

        const end = Math.max(0, total - (options.offset || 0));
        if (end > 0) {
          const limit = maxResults;
          const start = Math.max(1, end - limit + 1);
          const range = `${start}:${end}`;

          for await (const msg of client.fetch(range, {
            envelope: true,
            source: true,
            flags: true,
            uid: true,
          })) {
            try {
              const envelope = msg.envelope;
              const fromObj = envelope?.from?.[0];
              const fromEmail = fromObj ? `${fromObj.address || ''}` : '';
              const fromName = fromObj?.name || fromEmail.split('@')[0] || 'Bilinmeyen Gönderici';
              const fromStr = fromObj?.name ? `${fromObj.name} <${fromEmail}>` : fromEmail;

              const subject = envelope?.subject || 'Konusuz';
              if (!msg.source) throw new Error('İleti içeriği alınamadı.');
              const parsed = await simpleParser(msg.source, { skipHtmlToText: false, skipTextToHtml: true });
              const dateStr = new Date(parsed.date || envelope?.date || 0).toISOString();

              const bodyText = parsed.text || '';
              const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 180);

              let listUnsubscribe: string | undefined;
              if (envelope?.inReplyTo) {
                // Header hints
              }

              // Deduplication ID incorporating account, folder, and UID
              const stableId = `imap-${accountId}-${target.type}-${msg.uid}`;

              allMessages.push({
                id: stableId,
                uid: msg.uid,
                messageId: envelope?.messageId || undefined,
                accountId,
                folder: target.path,
                folderType: target.type,
                subject,
                from: fromStr,
                fromName,
                fromEmail,
                date: dateStr,
                snippet: snippet || subject,
                bodyText,
                bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
                listUnsubscribe: String(parsed.headers.get('list-unsubscribe') || ''),
                isRead: msg.flags?.has('\\Seen') || false,
              });
            } catch (perMsgErr) {
              throw new Error('Bir ileti okunamadı; eksik liste yerine senkronizasyonu yeniden deneyin.');
            }
          }
        }
      } catch (folderErr: any) {
        throw new Error(`${target.type} klasörü okunamadı: ${folderErr?.message || 'Bağlantı hatası'}`);
      } finally {
        if (lock && typeof lock.release === 'function') {
          try {
            lock.release();
          } catch {}
        }
      }
    }

    return {
      success: true,
      messages: allMessages.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
      mailboxes: mailboxInfos,
    };
  } catch (err: any) {
    console.error('IMAP e-posta çekme hatası:', err);
    return {
      success: false,
      messages: [],
      mailboxes: [],
      error: formatImapError(err, options.host),
    };
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {}
    }
  }
}

export async function testSmtpConnection(
  options: SmtpConnectOptions
): Promise<{ success: boolean; message: string }> {
  const authConfig: any = options.auth.accessToken
    ? {
        type: 'OAuth2',
        user: options.auth.user,
        accessToken: options.auth.accessToken,
      }
    : {
        user: options.auth.user,
        pass: options.auth.pass || '',
      };

  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: authConfig,
    tls: getTlsOptions(),
  });

  try {
    await transporter.verify();
    return {
      success: true,
      message: 'SMTP bağlantısı başarıyla doğrulandı!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'SMTP sunucusuna bağlanılamadı.',
    };
  }
}

export async function sendSmtpMessage(
  options: SmtpConnectOptions,
  mail: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    inReplyTo?: string;
  }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const authConfig: any = options.auth.accessToken
    ? {
        type: 'OAuth2',
        user: options.auth.user,
        accessToken: options.auth.accessToken,
      }
    : {
        user: options.auth.user,
        pass: options.auth.pass || '',
      };

  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: authConfig,
    tls: getTlsOptions(),
  });

  try {
    const info = await transporter.sendMail({
      from: options.auth.user,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo,
      inReplyTo: mail.inReplyTo,
    });
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error('SMTP gönderme hatası:', err);
    return { success: false, error: err.message || 'E-posta gönderilemedi.' };
  }
}
