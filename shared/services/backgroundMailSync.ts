import type { EmailMessage } from '../types';
import type { FolderDelta } from '../../core/sync/imap';
import { reconcilePendingSent } from '../../core/mail/workflows';

/** Reject incomplete/untrusted deltas before changing cache or advancing a cursor. */
export function reconcileFolderDelta(existing: EmailMessage[], incoming: EmailMessage[], accountId: string, folder: string,
  expectedUidValidity: string | undefined, requestedUids: number[], delta: FolderDelta): { messages: EmailMessage[]; added: EmailMessage[] } {
  const uid = (n: unknown): n is number => Number.isInteger(n) && Number(n) > 0 && Number(n) <= 4294967295;
  const fail = () => { throw new Error('INVALID_FOLDER_DELTA'); };
  if (!delta || delta.folder !== folder || typeof delta.uidValidity !== 'string' || !/^\d+$/.test(delta.uidValidity) || delta.uidValidity === '0' ||
    typeof delta.reset !== 'boolean' || typeof delta.hasMore !== 'boolean' || !Number.isInteger(delta.nextUid) || delta.nextUid < 0 || delta.nextUid > 4294967295 ||
    !Array.isArray(delta.checkedUids) || !Array.isArray(delta.deletedUids) || !Array.isArray(delta.flags)) fail();
  if (delta.reset !== Boolean(expectedUidValidity && expectedUidValidity !== delta.uidValidity)) fail();
  const requested = new Set(delta.reset ? [] : requestedUids);
  const checked = new Set(delta.checkedUids);
  if (checked.size !== delta.checkedUids.length || checked.size !== requested.size || delta.checkedUids.some(n => !uid(n) || !requested.has(n))) fail();
  const deleted = new Set(delta.deletedUids), flags = new Map<number, FolderDelta['flags'][number]>();
  if (deleted.size !== delta.deletedUids.length || delta.deletedUids.some(n => !checked.has(n))) fail();
  for (const flag of delta.flags) {
    if (!flag || !checked.has(flag.uid) || deleted.has(flag.uid) || typeof flag.isRead !== 'boolean' || flags.has(flag.uid)) fail();
    if(flag.providerLabels!==undefined && (!Array.isArray(flag.providerLabels) || flag.providerLabels.length>1000 || flag.providerLabels.some(label=>typeof label!=='string' || label.length>255 || /[\r\n\x00]/.test(label))))fail();
    flags.set(flag.uid,flag);
  }
  if (deleted.size + flags.size !== checked.size) fail();
  const old = new Map(existing.filter(m => m.accountId === accountId && m.folder === folder).map(m => [m.id,m]));
  const arrivals = new Map<string, EmailMessage>();
  for (const email of incoming) {
    if (email.accountId !== accountId || email.folder !== folder || email.uidValidity !== delta.uidValidity || !uid(email.uid) || email.uid > delta.nextUid ||
      email.id !== `imap-${accountId}-${encodeURIComponent(folder)}-${delta.uidValidity}-${email.uid}` || deleted.has(email.uid)) fail();
    const previous = old.get(email.id);
    arrivals.set(email.id, { ...email, analysis: previous?.analysis || email.analysis, safeCategory: previous?.safeCategory || email.safeCategory,
      labels: Array.from(new Set([...(email.labels || []), ...(previous?.labels || []).filter(label => label.startsWith('user:'))])) });
  }
  const kept = existing.filter(email => {
    if (email.accountId !== accountId || email.folder !== folder) return true;
    if(email.pendingMove || email.pendingSent)return true;
    if (delta.reset || email.uidValidity !== delta.uidValidity) return false;
    return !arrivals.has(email.id) && !deleted.has(email.uid!);
  }).map(email => email.accountId === accountId && email.folder === folder && flags.has(email.uid!)
    ? { ...email, isRead: flags.get(email.uid!)!.isRead,providerLabels:flags.get(email.uid!)!.providerLabels ?? email.providerLabels } : email);
  const messages = Array.from(new Map([...kept, ...arrivals.values()].map(m => [JSON.stringify([m.accountId,m.id]),m])).values());
  return { messages: reconcilePendingSent(messages), added: [...arrivals.values()].filter(m => !old.has(m.id)) };
}

export interface FolderSyncJob { key: string; generation: number }

/** One lightweight scheduler, no agents, no stored credentials and no overlapping cycles. */
export class BackgroundMailScheduler {
  private states = new Map<string, { generation: number; due: number; failures: number }>();
  private running = false;
  private stopped = false;
  private controller = new AbortController();
  constructor(private interval = 120_000) {}
  dispose() { this.stopped = true; this.controller.abort(); this.states.clear(); }
  async tick(jobs: FolderSyncJob[], run: (job: FolderSyncJob, signal: AbortSignal) => Promise<{ hasMore: boolean }>, now = Date.now(), immediate = false) {
    if (this.stopped || this.running) return;
    const keys = new Set(jobs.map(job => job.key));
    for (const key of this.states.keys()) if (!keys.has(key)) this.states.delete(key);
    for (const job of jobs) {
      const state = this.states.get(job.key);
      if (!state || state.generation !== job.generation) this.states.set(job.key, { generation: job.generation, due: now + this.interval, failures: 0 });
      if (immediate) this.states.get(job.key)!.due = now;
    }
    const due = jobs.filter(job => this.states.get(job.key)!.due <= now).sort((a,b) => this.states.get(a.key)!.due - this.states.get(b.key)!.due).slice(0,4);
    this.running = true;
    try {
      for (const job of due) {
        if (this.stopped) break;
        const state = this.states.get(job.key)!;
        try {
          const result = await run(job,this.controller.signal);
          state.failures = 0;
          state.due = Math.max(now, Date.now()) + (result.hasMore ? 15_000 : this.interval);
        } catch {
          state.failures++;
          state.due = Math.max(now, Date.now()) + Math.min(300_000,15_000 * 2 ** Math.min(5,state.failures - 1));
        }
      }
    } finally { this.running = false; }
  }
}

/** Rotate metadata-only checks through every cached UID instead of repeatedly checking just the newest page. */
export function nextKnownUidBatch(messages: EmailMessage[], accountId: string, folder: string, uidValidity: string | undefined, after: number) {
  const uids = Array.from(new Set(messages.filter(m => m.accountId === accountId && m.folder === folder && m.uidValidity === uidValidity && m.uid)
    .map(m => m.uid!))).sort((a,b) => a-b);
  const next = uids.filter(uid => uid > after).slice(0,1000);
  return next.length ? next : uids.slice(0,1000);
}
