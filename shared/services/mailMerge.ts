import type { EmailMessage } from '../types';

function uidGeneration(email: EmailMessage): string | null {
  if (!email.uid || !email.id.startsWith('imap-')) return null;
  return email.id.slice(0, -String(email.uid).length);
}

export function mergeMailRefresh(
  existing: EmailMessage[],
  incoming: EmailMessage[],
  accountId: string,
  refreshedFolders: string[],
): { messages: EmailMessage[]; added: EmailMessage[] } {
  const folders = new Set(refreshedFolders);
  const incomingById = new Map(incoming.map(email => [email.id, email]));
  const existingById = new Map(existing.map(email => [email.id, email]));
  const minUidByFolder = new Map<string, number>();
  const generationByFolder = new Map<string, string | null>();
  for (const email of incoming) {
    if (!email.folder || !email.uid) continue;
    minUidByFolder.set(email.folder, Math.min(minUidByFolder.get(email.folder) ?? Infinity, email.uid));
    if (!generationByFolder.has(email.folder)) generationByFolder.set(email.folder, uidGeneration(email));
  }

  const retained = existing.filter(email => {
    if (incomingById.has(email.id)) return false;
    if (email.accountId !== accountId || !email.folder || !folders.has(email.folder)) return true;
    const boundary = minUidByFolder.get(email.folder);
    return boundary !== undefined && Boolean(email.uid && email.uid < boundary) &&
      uidGeneration(email) === generationByFolder.get(email.folder);
  });

  const mergedIncoming = incoming.map(email => {
    const previous = existingById.get(email.id);
    if (!previous) return email;
    return {
      ...email,
      safeCategory: previous.safeCategory || email.safeCategory,
      analysis: previous.analysis || email.analysis,
      labels: Array.from(new Set([...(email.labels || []), ...(previous.labels || []).filter(label => label.startsWith('user:'))])),
    };
  });
  return { messages: [...mergedIncoming, ...retained], added: mergedIncoming.filter(email => !existingById.has(email.id)) };
}
