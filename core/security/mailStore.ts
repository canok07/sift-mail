import fs from 'fs';
import path from 'path';
import { decryptData, encryptData } from './vault';

const dataDir = process.env.SIFT_DATA_DIR || path.join(process.cwd(), 'data');
const cacheFile = path.join(dataDir, 'mail-cache.enc');
const maxPlaintextBytes = 40 * 1024 * 1024;

export interface LocalMailSnapshot {
  version: 1;
  messages: unknown[];
  composeDraft: Record<string, unknown> | null;
  replyDrafts: Record<string, unknown>;
}

export function loadLocalMailSnapshot(): LocalMailSnapshot | null {
  if (!fs.existsSync(cacheFile)) return null;
  const raw = fs.readFileSync(cacheFile, 'utf8');
  const data: unknown = JSON.parse(decryptData(raw));
  if (!data || typeof data !== 'object' || (data as LocalMailSnapshot).version !== 1 ||
      !Array.isArray((data as LocalMailSnapshot).messages)) {
    throw new Error('Yerel posta önbelleğinin biçimi geçersiz.');
  }
  return data as LocalMailSnapshot;
}

export function saveLocalMailSnapshot(snapshot: LocalMailSnapshot): void {
  const plain = JSON.stringify(snapshot);
  if (Buffer.byteLength(plain, 'utf8') > maxPlaintextBytes) throw new Error('Yerel posta önbelleği 40 MB sınırını aşıyor.');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const temporary = `${cacheFile}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, encryptData(plain), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, cacheFile);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
