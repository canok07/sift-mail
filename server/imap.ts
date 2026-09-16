import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

export interface ImapConnectOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface SmtpConnectOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface FetchedImapMessage {
  id: string;
  uid: number;
  subject: string;
  from: string;
  fromName?: string;
  fromEmail?: string;
  date: string;
  snippet: string;
  bodyText?: string;
  headers?: string;
  listUnsubscribe?: string;
  isRead: boolean;
}

export function formatImapError(err: any): string {
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  const code = (err?.code || '').toLowerCase();
  const responseText = (err?.responseText || '').toLowerCase();
  const responseStatus = (err?.responseStatus || '').toLowerCase();
  const authFailed = Boolean(err?.authenticationFailed);

  if (
    authFailed ||
    msg.includes('authenticationfailed') ||
    msg.includes('invalid credentials') ||
    msg.includes('auth') ||
    msg.includes('login failed') ||
    msg.includes('command failed') ||
    responseText.includes('authenticationfailed') ||
    responseText.includes('invalid credentials') ||
    responseText.includes('username and password not accepted') ||
    code.includes('auth')
  ) {
    return 'IMAP kimlik doğrulaması başarısız. Lütfen 16 haneli uygulama şifrenizi kontrol edin.';
  }

  if (
    msg.includes('application-specific password required') ||
    msg.includes('app password')
  ) {
    return 'Google Uygulama Şifresi zorunludur. Lütfen myaccount.google.com adresinden 16 haneli Uygulama Şifresi oluşturun.';
  }

  if (
    msg.includes('enotfound') ||
    msg.includes('getaddrinfo') ||
    msg.includes('dns')
  ) {
    return 'IMAP sunucusuna bağlanılamadı. Sunucu adresini kontrol edin.';
  }

  if (
    msg.includes('etimedout') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  ) {
    return 'IMAP sunucusuna bağlanırken zaman aşımı oluştu. Lütfen bağlantınızı kontrol edin.';
  }

  if (
    msg.includes('econnrefused') ||
    msg.includes('connection refused')
  ) {
    return 'IMAP sunucusu bağlantıyı reddetti. Lütfen sunucu adresi, port ve SSL ayarlarını kontrol edin.';
  }

  if (
    msg.includes('certificate') ||
    msg.includes('ssl') ||
    msg.includes('tls')
  ) {
    return 'IMAP SSL/TLS güvenlik anlaşması başarısız oldu. Lütfen port ve SSL ayarlarınızı kontrol edin.';
  }

  return err?.message || 'IMAP sunucusuna bağlanılamadı.';
}

export async function testImapConnection(options: ImapConnectOptions): Promise<{ success: boolean; message: string }> {
  const client = new ImapFlow({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    const mailboxes = await client.list();
    return {
      success: true,
      message: `IMAP bağlantısı başarılı! (${mailboxes.length} adet posta kutusu algılandı)`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: formatImapError(err),
    };
  } finally {
    try {
      await client.logout();
    } catch {
      try { client.close(); } catch {}
    }
  }
}

export async function fetchImapMessages(
  options: ImapConnectOptions,
  maxResults: number = 15
): Promise<{ success: boolean; messages: FetchedImapMessage[]; error?: string }> {
  const client = new ImapFlow({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  let lock: any = null;
  try {
    await client.connect();
    lock = await client.getMailboxLock('INBOX');
    const messages: FetchedImapMessage[] = [];

    // Find total message count in INBOX
    const mailbox = client.mailbox;
    const total = typeof mailbox === 'object' && mailbox && 'exists' in mailbox ? (mailbox as any).exists : 0;

    if (total > 0) {
      const start = Math.max(1, total - maxResults + 1);
      const range = `${start}:${total}`;

      for await (const msg of client.fetch(range, {
        envelope: true,
        source: false,
        bodyParts: ['TEXT'],
        flags: true,
      })) {
        try {
          const envelope = msg.envelope;
          const fromObj = envelope?.from?.[0];
          const fromEmail = fromObj ? `${fromObj.address || ''}` : '';
          const fromName = fromObj?.name || fromEmail.split('@')[0] || 'Bilinmeyen Gönderici';
          const fromStr = fromObj?.name ? `${fromObj.name} <${fromEmail}>` : fromEmail;

          const subject = envelope?.subject || 'Konusuz';
          const dateStr = envelope?.date ? new Date(envelope.date).toLocaleString('tr-TR') : new Date().toLocaleString('tr-TR');

          // Extract body preview
          let snippet = '';
          if (msg.bodyParts) {
            for (const [, buffer] of msg.bodyParts) {
              if (buffer) {
                snippet += buffer.toString('utf8');
              }
            }
          }
          snippet = snippet.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 250);

          // Check unsubscription header
          let listUnsubscribe = '';
          const anyMsg = msg as any;
          if (anyMsg.headers && typeof anyMsg.headers.toString === 'function') {
            const headerStr = anyMsg.headers.toString('utf8');
            const match = headerStr.match(/list-unsubscribe:\s*<([^>]+)>/i);
            if (match && match[1]) {
              listUnsubscribe = match[1];
            }
          }

          messages.push({
            id: `imap-${msg.uid}`,
            uid: msg.uid,
            subject,
            from: fromStr,
            fromName,
            fromEmail,
            date: dateStr,
            snippet: snippet || subject,
            bodyText: snippet,
            listUnsubscribe,
            isRead: msg.flags?.has('\\Seen') || false,
          });
        } catch (perMsgErr) {
          console.warn('Tekil ileti ayrıştırma atlandı:', perMsgErr);
        }
      }
    }

    return { success: true, messages: messages.reverse() };
  } catch (err: any) {
    console.error('IMAP e-posta çekme hatası:', err);
    return {
      success: false,
      messages: [],
      error: formatImapError(err),
    };
  } finally {
    if (lock && typeof lock.release === 'function') {
      try {
        lock.release();
      } catch {}
    }
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {}
    }
  }
}

export async function testSmtpConnection(options: SmtpConnectOptions): Promise<{ success: boolean; message: string }> {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
    tls: {
      rejectUnauthorized: false,
    },
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
  mail: { to: string; subject: string; text: string; html?: string; replyTo?: string; inReplyTo?: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
    tls: {
      rejectUnauthorized: false,
    },
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
