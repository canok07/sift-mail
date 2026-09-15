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
    await client.logout();
    return {
      success: true,
      message: `IMAP bağlantısı başarılı! (${mailboxes.length} adet posta kutusu algılandı)`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'IMAP sunucusuna bağlanılamadı.',
    };
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

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const messages: FetchedImapMessage[] = [];

    try {
      // Find total message count in INBOX
      const mailbox = client.mailbox;
      const total = typeof mailbox === 'object' && mailbox && 'exists' in mailbox ? (mailbox as any).exists : 0;

      if (total === 0) {
        return { success: true, messages: [] };
      }

      const start = Math.max(1, total - maxResults + 1);
      const range = `${start}:${total}`;

      for await (const msg of client.fetch(range, {
        envelope: true,
        source: false,
        bodyParts: ['TEXT'],
        flags: true,
      })) {
        const envelope = msg.envelope;
        const fromObj = envelope.from?.[0];
        const fromEmail = fromObj ? `${fromObj.address || ''}` : '';
        const fromName = fromObj?.name || fromEmail.split('@')[0] || 'Bilinmeyen Gönderici';
        const fromStr = fromObj?.name ? `${fromObj.name} <${fromEmail}>` : fromEmail;

        const subject = envelope.subject || 'Konusuz';
        const dateStr = envelope.date ? new Date(envelope.date).toLocaleString('tr-TR') : new Date().toLocaleString('tr-TR');

        // Extract body preview
        let snippet = '';
        if (msg.bodyParts) {
          for (const [, buffer] of msg.bodyParts) {
            snippet += buffer.toString('utf8');
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
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return { success: true, messages: messages.reverse() };
  } catch (err: any) {
    console.error('IMAP e-posta çekme hatası:', err);
    return {
      success: false,
      messages: [],
      error: err.message || 'IMAP e-postaları alınamadı',
    };
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
