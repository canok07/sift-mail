import type { EmailMessage } from '../types';
import { safeFetchJson } from './apiClient';

export interface ComposeDraft {
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: Array<{ filename: string; content: string; encoding: 'base64'; contentType?: string; size: number; source: 'file' | 'email' }>;
}

export interface ReplyDraft {
  accountId: string;
  to: string;
  subject: string;
  body: string;
}

export interface LocalMailSnapshot {
  version: 1;
  messages: EmailMessage[];
  composeDraft: ComposeDraft | null;
  replyDrafts: Record<string, ReplyDraft>;
}

export async function loadLocalMailSnapshot(): Promise<LocalMailSnapshot | null> {
  const result = await safeFetchJson<{ success: boolean; snapshot: LocalMailSnapshot | null }>('/api/local/mail-cache');
  return result.snapshot;
}

export async function saveLocalMailSnapshot(snapshot: LocalMailSnapshot): Promise<void> {
  await safeFetchJson('/api/local/mail-cache', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }),
  });
}
