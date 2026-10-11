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
  uidValidity?: string;
  highestUid?: number;
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
  sinceUid?: number;
  expectedUidValidity?: string;
  knownUids?: number[];
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

export type ImapMailAction = 'mark_read' | 'mark_unread' | 'trash' | 'archive' | 'move';

export interface ImapActionOptions extends ImapConnectOptions {
  accountId: string;
  accountEmail: string;
  expectedUidValidity: string;
  messageId?: string;
  uid: number;
  sourceFolder: string;
  action: ImapMailAction;
  destination?: string;
}

export interface FetchedImapMessage {
  id: string;
  uid: number;
  uidValidity?: string;
  messageId?: string;
  accountId?: string;
  folder: string;
  to?: string[];
  cc?: string[];
  replyTo?: string[];
  inReplyTo?: string;
  references?: string[];
  threadId?: string;
  providerLabels?: string[];
  folderType: FolderType;
  subject: string;
  from: string;
  fromName?: string;
  fromEmail?: string;
  date: string;
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Array<{ index: number; filename: string; contentType: string; size: number }>;
  headers?: string;
  listUnsubscribe?: string;
  isRead: boolean;
}

export interface FolderDelta {
  folder: string;
  uidValidity: string;
  reset: boolean;
  checkedUids: number[];
  deletedUids: number[];
  flags: Array<{ uid: number; isRead: boolean; providerLabels?:string[] }>;
  nextUid: number;
  hasMore: boolean;
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
  const identityErrors: Record<string, string> = {
    IMAP_ACCOUNT_IDENTITY_MISMATCH: 'Posta hesabı eşleşmiyor. Hesabı yeniden bağlayın.',
    IMAP_MESSAGE_IDENTITY_REQUIRED: 'İleti kimliği eksik. İşlemden önce klasörü yenileyin.',
    IMAP_UIDVALIDITY_CHANGED: 'Posta kutusu değişti. İşlem yapılmadı; klasörü yenileyin.',
    IMAP_MESSAGE_IDENTITY_CHANGED: 'İleti kimliği değişti. İşlem yapılmadı; klasörü yenileyin.',
    IMAP_MESSAGE_NOT_FOUND: 'İleti sunucuda bulunamadı. Klasörü yenileyin.',
    IMAP_ACTION_VERIFICATION_FAILED: 'Posta sunucusu işlemi doğrulamadı. Klasörü yenileyin.',
    IMAP_MESSAGE_TOO_LARGE: 'İleti indirme boyutu sınırını aşıyor.',
  };
  if (identityErrors[err?.message]) return identityErrors[err.message];
  if (err?.message === 'IMAP_FOLDER_FETCH_FAILED') {
    const type = ['inbox', 'spam', 'sent', 'drafts', 'trash', 'archive', 'other'].includes(err.folderType) ? err.folderType : 'posta';
    return `${type} klasörü okunamadı: ${formatImapError(err.cause, host)}`;
  }
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

  if (/econn|socket|connection (?:closed|lost|reset)|network/i.test(msg + code)) return 'Posta sunucusu bağlantısı kesildi (connection lost). Yeniden deneyin.';
  return 'IMAP işlemi tamamlanamadı. Bağlantıyı ve klasör bilgilerini kontrol edin.';
}

export function buildImapClient(options: ImapConnectOptions): ImapFlow {
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
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
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
  incremental: boolean;
  delta?: FolderDelta;
  error?: string;
  retryable?: boolean;
  code?: string;
}> {
  const client = buildImapClient(options);
  const accountId = options.accountId || 'acc-primary';
  let incremental = false;
  let delta: FolderDelta | undefined;

  try {
    await client.connect();

    // 1. Discover all mailboxes
    const rawBoxes = await client.list();
    const mailboxInfos: MailboxInfo[] = rawBoxes.filter(b => !b.flags?.has('\\Noselect')).map((b) => {
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
        lock = await client.getMailboxLock(target.path, { readOnly: true });
        const mailbox = client.mailbox;
        const total = typeof mailbox === 'object' && mailbox && 'exists' in mailbox ? (mailbox as any).exists : 0;

        // Update mailbox count in metadata list
        const info = mailboxInfos.find((m) => m.path === target.path);
        if (info) {
          info.totalMessages = total;
          info.uidValidity = String((mailbox as any)?.uidValidity || '0');
          info.highestUid = Math.max(0, Number((mailbox as any)?.uidNext || 1) - 1);
        }

        const currentUidValidity = String((mailbox as any)?.uidValidity || '0');
        const canIncrement = Boolean(options.folder && options.sinceUid !== undefined && options.expectedUidValidity === currentUidValidity);
        const reset = Boolean(options.expectedUidValidity && options.expectedUidValidity !== currentUidValidity);
        let newUids: number[] = [];
        if (options.knownUids !== undefined) {
          if (!options.folder || options.knownUids.length > 1000 || options.knownUids.some(uid => !Number.isInteger(uid) || uid < 1)) throw new Error('IMAP_INVALID_SYNC_UIDS');
          const known = reset ? [] : Array.from(new Set(options.knownUids));
          const flags: FolderDelta['flags'] = [];
          if (known.length) {
            // No bodies and no Seen mutation. Only explicitly checked missing UIDs may be removed locally.
            for await (const msg of client.fetch(known.join(','), { uid: true, flags: true,labels:true }, { uid: true })) {
              if (!known.includes(msg.uid) || !(msg.flags instanceof Set)) throw new Error('IMAP_INVALID_SYNC_METADATA');
              flags.push({ uid: msg.uid, isRead: msg.flags.has('\\Seen'), providerLabels:[...(msg.labels || msg.flags)].filter(label=>!label.startsWith('\\')) });
            }
          }
          const found = new Set(flags.map(item => item.uid));
          delta = { folder: target.path, uidValidity: currentUidValidity, reset, checkedUids: known,
            deletedUids: known.filter(uid => !found.has(uid)), flags, nextUid: 0, hasMore: false };
        }
        let range: string | null = null;
        let fetchByUid = false;
        if (canIncrement) {
          incremental = true;
          const matches: number[] = await (client as any).search({ uid: `${Number(options.sinceUid) + 1}:*` }, { uid: true });
          if (!Array.isArray(matches)) throw new Error('IMAP_INVALID_SYNC_METADATA');
          newUids = Array.from(new Set(matches.filter(uid => Number.isInteger(uid) && uid > Number(options.sinceUid)))).sort((a,b) => a-b);
          // Oldest outstanding UID first: taking the newest batch loses mail when a backlog exceeds the limit.
          const batch = newUids.slice(0, maxResults);
          if (batch.length) { range = batch.join(','); fetchByUid = true; }
          if (delta) { delta.nextUid = batch.at(-1) ?? options.sinceUid!; delta.hasMore = newUids.length > batch.length; }
        } else {
          const end = Math.max(0, total - (options.offset || 0));
          if (end > 0) range = `${Math.max(1, end - maxResults + 1)}:${end}`;
        }
        if (range) {

          for await (const msg of client.fetch(range, {
            envelope: true,
            source: true,
            flags: true,
            uid: true,
            labels: true,
            threadId: true,
          }, { uid: fetchByUid })) {
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

              // UID is only unique inside a mailbox and its UIDVALIDITY generation.
              const uidValidity = String((mailbox as any)?.uidValidity || '0');
              const stableId = `imap-${accountId}-${encodeURIComponent(target.path)}-${uidValidity}-${msg.uid}`;

              allMessages.push({
                id: stableId,
                uid: msg.uid,
                uidValidity,
                messageId: parsed.messageId || envelope?.messageId || undefined,
                to: [parsed.to].flat().flatMap(value => value?.value.map(address => address.address || '') || []).filter(Boolean),
                cc: [parsed.cc].flat().flatMap(value => value?.value.map(address => address.address || '') || []).filter(Boolean),
                replyTo: parsed.replyTo?.value.map(address => address.address || '').filter(Boolean),
                inReplyTo: parsed.inReplyTo,
                references: typeof parsed.references === 'string' ? [parsed.references] : parsed.references,
                threadId: msg.threadId ? String(msg.threadId) : undefined,
                providerLabels: [...(msg.labels || msg.flags || [])].filter(label => !label.startsWith('\\')),
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
                attachments: parsed.attachments.map((attachment, index) => ({
                  index,
                  filename: attachment.filename || `attachment-${index + 1}`,
                  contentType: attachment.contentType || 'application/octet-stream',
                  size: attachment.size || attachment.content.length,
                })),
                listUnsubscribe: String(parsed.headers.get('list-unsubscribe') || ''),
                isRead: msg.flags?.has('\\Seen') || false,
              });
            } catch (perMsgErr) {
              throw new Error('Bir ileti okunamadı; eksik liste yerine senkronizasyonu yeniden deneyin.');
            }
          }
        }
        if (delta && !canIncrement) delta.nextUid = allMessages.filter(msg => msg.folder === target.path).reduce((n,msg) => Math.max(n,msg.uid), 0);
      } catch (folderErr: any) {
        throw Object.assign(new Error('IMAP_FOLDER_FETCH_FAILED'), { folderType: target.type, cause: folderErr });
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
      incremental,
      delta,
    };
  } catch (err: any) {
    console.error('[Sift Mail] IMAP_FETCH_FAILED');
    const cause = err?.cause || err;
    const authFailure = Boolean(cause?.authenticationFailed) || /auth|invalid credentials|login failed/i.test(String(cause?.code || '') + ' ' + String(cause?.message || ''));
    return {
      success: false,
      messages: [],
      mailboxes: [],
      incremental: false,
      error: formatImapError(err, options.host),
      code: authFailure ? 'REAUTH_REQUIRED' : 'SYNC_FAILED',
      retryable: !authFailure,
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

export async function fetchRawImapMessage(options: ImapConnectOptions & { folder: string; uid: number; messageId?: string; maxBytes?: number }): Promise<{ filename: string; contentType: string; content: string; size: number }> {
  const client = buildImapClient(options);
  let lock: any = null;
  try {
    await client.connect();
    lock = await client.getMailboxLock(options.folder);
    if (options.expectedUidValidity && String((client.mailbox as any)?.uidValidity) !== options.expectedUidValidity) throw new Error('IMAP_UIDVALIDITY_CHANGED');
    if (!options.expectedUidValidity && !options.messageId) throw new Error('IMAP_MESSAGE_IDENTITY_REQUIRED');
    const limit = Math.min(options.maxBytes ?? 25 * 1024 * 1024, 25 * 1024 * 1024);
    const metadata: any = await client.fetchOne(options.uid, { size: true, envelope: true }, { uid: true });
    if (!metadata) throw new Error('IMAP_MESSAGE_NOT_FOUND');
    if (options.messageId && metadata.envelope?.messageId !== options.messageId) throw new Error('IMAP_MESSAGE_IDENTITY_CHANGED');
    if (!Number.isInteger(metadata.size) || metadata.size < 1 || metadata.size > limit) throw new Error('IMAP_MESSAGE_TOO_LARGE');
    // ImapFlow uses BODY.PEEK[] by default: downloading never marks the original read.
    const message: any = await client.fetchOne(options.uid, { source: true }, { uid: true });
    if (!message?.source) throw new Error('IMAP_MESSAGE_NOT_FOUND');
    const source = Buffer.from(message.source);
    if (source.length > limit) throw new Error('IMAP_MESSAGE_TOO_LARGE');
    const subject = String(metadata.envelope?.subject || `email-${options.uid}`).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0,80) || 'email';
    return { filename: `${subject}.eml`, contentType: 'message/rfc822', content: source.toString('base64'), size: source.length };
  } finally {
    try { lock?.release?.(); } catch {}
    try { await client.logout(); } catch { try { client.close(); } catch {} }
  }
}

export async function fetchImapAttachment(options: ImapConnectOptions & { folder: string; uid: number; index: number; messageId?: string }): Promise<{ filename: string; contentType: string; content: string }> {
  const client = buildImapClient(options);
  let lock: any = null;
  try {
    await client.connect();
    lock = await client.getMailboxLock(options.folder);
    if (!options.expectedUidValidity && !options.messageId) throw new Error('IMAP_MESSAGE_IDENTITY_REQUIRED');
    if (options.expectedUidValidity && String((client.mailbox as any)?.uidValidity) !== options.expectedUidValidity) throw new Error('IMAP_UIDVALIDITY_CHANGED');
    const metadata: any = await client.fetchOne(options.uid, { size: true, envelope: true }, { uid: true });
    if (!metadata) throw new Error('IMAP_MESSAGE_NOT_FOUND');
    if (options.messageId && metadata.envelope?.messageId !== options.messageId) throw new Error('IMAP_MESSAGE_IDENTITY_CHANGED');
    if (!Number.isInteger(metadata.size) || metadata.size < 1 || metadata.size > 25 * 1024 * 1024) throw new Error('IMAP_MESSAGE_TOO_LARGE');
    const message: any = await client.fetchOne(options.uid, { source: true }, { uid: true });
    if (!message?.source) throw new Error('IMAP_MESSAGE_NOT_FOUND');
    if (message.source.length > 25 * 1024 * 1024) throw new Error('IMAP_MESSAGE_TOO_LARGE');
    const parsed = await simpleParser(message.source);
    const attachment = parsed.attachments[options.index];
    if (!attachment) throw new Error('Ek bulunamadı.');
    if (attachment.content.length > 25 * 1024 * 1024) throw new Error('Ek 25 MB indirme sınırını aşıyor.');
    return {
      filename: (attachment.filename || `attachment-${options.index + 1}`).replace(/[\\/]/g, '_'),
      contentType: attachment.contentType || 'application/octet-stream',
      content: attachment.content.toString('base64'),
    };
  } finally {
    try { lock?.release?.(); } catch {}
    try { await client.logout(); } catch { try { client.close(); } catch {} }
  }
}

export async function performImapAction(options: ImapActionOptions): Promise<{ success: boolean; verified: boolean; destination?: string }> {
  // Never act on a cached UID without its mailbox generation and account binding.
  if (!options.accountId || !options.accountEmail || options.accountEmail.trim().toLowerCase() !== options.auth.user.trim().toLowerCase()) throw new Error('IMAP_ACCOUNT_IDENTITY_MISMATCH');
  if (!/^[1-9]\d{0,9}$/.test(options.expectedUidValidity || '') || Number(options.expectedUidValidity) > 4294967295) throw new Error('IMAP_MESSAGE_IDENTITY_REQUIRED');
  if (!Number.isInteger(options.uid) || options.uid < 1 || !options.sourceFolder) throw new Error('IMAP_MESSAGE_IDENTITY_REQUIRED');
  const client = buildImapClient(options);
  let lock: any = null;
  try {
    await client.connect();
    const mailboxes = await client.list();
    lock = await client.getMailboxLock(options.sourceFolder);
    if (String((client.mailbox as any)?.uidValidity) !== options.expectedUidValidity) throw new Error('IMAP_UIDVALIDITY_CHANGED');
    const original: any = await client.fetchOne(options.uid, { uid: true, envelope: true }, { uid: true });
    if (!original || original.uid !== options.uid) throw new Error('IMAP_MESSAGE_NOT_FOUND');
    if (options.messageId && original.envelope?.messageId !== options.messageId) throw new Error('IMAP_MESSAGE_IDENTITY_CHANGED');
    if (options.action === 'mark_read' || options.action === 'mark_unread') {
      if (options.action === 'mark_read') await client.messageFlagsAdd(options.uid, ['\\Seen'], { uid: true });
      else await client.messageFlagsRemove(options.uid, ['\\Seen'], { uid: true });
      const current: any = await client.fetchOne(options.uid, { flags: true }, { uid: true });
      const isRead = Boolean(current?.flags?.has('\\Seen'));
      const verified = Boolean(current) && (options.action === 'mark_read' ? isRead : !isRead);
      if (!verified) throw new Error('IMAP_ACTION_VERIFICATION_FAILED');
      return { success: true, verified };
    }
    const desiredType: FolderType = options.action === 'trash' ? 'trash' : options.action === 'archive' ? 'archive' : 'other';
    const destination = options.destination || mailboxes.find(box => classifyMailbox(box).type === desiredType)?.path;
    if (!destination) throw new Error(options.action === 'trash' ? 'Çöp klasörü bulunamadı.' : options.action === 'archive' ? 'Arşiv/Tüm Postalar klasörü bulunamadı.' : 'Hedef klasör belirtilmedi.');
    if (destination === options.sourceFolder) throw new Error('İleti zaten hedef klasörde.');
    await client.messageMove(options.uid, destination, { uid: true });
    const sourceMessage: any = await client.fetchOne(options.uid, { uid: true }, { uid: true });
    const verified = !sourceMessage;
    if (!verified) throw new Error('IMAP_ACTION_VERIFICATION_FAILED');
    return { success: true, verified, destination };
  } finally {
    try { lock?.release?.(); } catch {}
    try { await client.logout(); } catch { try { client.close(); } catch {} }
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
    requireTLS: !options.secure,
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
      message: 'SMTP bağlantısı doğrulanamadı. Sunucu ayarlarını ve giriş bilgilerini kontrol edin.',
    };
  } finally {
    transporter.close();
  }
}

export async function sendSmtpMessage(
  options: SmtpConnectOptions,
  mail: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    inReplyTo?: string;
    references?: string[];
    attachments?: Array<{ filename: string; content: string; encoding?: 'base64'; contentType?: string }>;
  }
): Promise<{ success: boolean; messageId?: string; partial?: boolean; accepted?: string[]; rejected?: string[]; error?: string }> {
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
    requireTLS: !options.secure,
    auth: authConfig,
    tls: getTlsOptions(),
  });

  try {
    const info = await transporter.sendMail({
      from: options.auth.user,
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      attachments: mail.attachments,
    });
    const accepted = (info.accepted || []).map((value: any) => typeof value === 'string' ? value : value.address).filter(Boolean);
    const rejected = (info.rejected || []).map((value: any) => typeof value === 'string' ? value : value.address).filter(Boolean);
    if(Array.isArray(info.accepted) && !accepted.length && rejected.length)return {success:false,error:'Hiçbir alıcı teslimatı kabul etmedi. Alıcı adreslerini kontrol edin.'};
    // Never retry an already accepted message merely because another recipient was rejected.
    return { success: true, messageId: info.messageId, partial: rejected.length > 0, accepted, rejected };
  } catch (err: any) {
    console.error('[Sift Mail] SMTP_SEND_FAILED');
    return { success: false, error: 'SMTP gönderme işlemi doğrulanamadı. Yeniden göndermeden önce Gönderilenler klasörünü kontrol edin.' };
  } finally {
    transporter.close();
  }
}
