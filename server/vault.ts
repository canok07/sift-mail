import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const VAULT_FILE = path.join(DATA_DIR, 'vault.enc');
const SALT_FILE = path.join(DATA_DIR, '.vault_salt');
const ALGORITHM = 'aes-256-cbc';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Generate or read persistent salt
function getOrCreateSalt(): Buffer {
  if (fs.existsSync(SALT_FILE)) {
    return fs.readFileSync(SALT_FILE);
  }
  const newSalt = crypto.randomBytes(32);
  fs.writeFileSync(SALT_FILE, newSalt, { mode: 0o600 });
  return newSalt;
}

// Derive a secure 32-byte AES key bound to this host
function getVaultKey(): Buffer {
  const salt = getOrCreateSalt();
  // Mix with a local machine seed
  const machineSeed = process.env.VAULT_SECRET || 'smart-email-filter-local-vault-seed-2026';
  return crypto.scryptSync(machineSeed, salt, 32);
}

interface StoredVaultItem {
  key: string;
  value: string;
  label: string;
  category: 'imap_password' | 'gemini_api_key' | 'smtp_password' | 'custom_token' | 'telegram' | string;
  updatedAt: string;
}

// Encrypt string using AES-256-CBC
function encryptData(plainText: string): string {
  const key = getVaultKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// Decrypt string using AES-256-CBC
function decryptData(cipherText: string): string {
  const key = getVaultKey();
  const parts = cipherText.split(':');
  if (parts.length !== 2) throw new Error('Geçersiz şifreli veri formatı');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Load decrypted items map
function loadVaultItems(): Record<string, StoredVaultItem> {
  if (!fs.existsSync(VAULT_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(VAULT_FILE, 'utf8');
    if (!raw.trim()) return {};
    const decrypted = decryptData(raw);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Kasa yükleme hatası:', err);
    return {};
  }
}

// Save items map encrypted to disk
function saveVaultItems(items: Record<string, StoredVaultItem>): void {
  const serialized = JSON.stringify(items);
  const encrypted = encryptData(serialized);
  fs.writeFileSync(VAULT_FILE, encrypted, { encoding: 'utf8', mode: 0o600 });
}

export function saveVaultSecret(
  key: string,
  value: string,
  category: StoredVaultItem['category'] = 'imap_password',
  label: string = key
): void {
  const items = loadVaultItems();
  items[key] = {
    key,
    value,
    label,
    category,
    updatedAt: new Date().toISOString(),
  };
  saveVaultItems(items);
}

export function getVaultSecret(key: string): string | null {
  const items = loadVaultItems();
  return items[key]?.value || null;
}

export function deleteVaultSecret(key: string): boolean {
  const items = loadVaultItems();
  if (items[key]) {
    delete items[key];
    saveVaultItems(items);
    return true;
  }
  return false;
}

export function getVaultSummary() {
  const items = loadVaultItems();
  const entries = Object.values(items).map((item) => {
    let masked = '••••••••';
    if (item.value.length > 4) {
      masked = `${item.value.slice(0, 2)}••••••••${item.value.slice(-2)}`;
    }
    return {
      key: item.key,
      label: item.label,
      category: item.category,
      maskedValue: masked,
      updatedAt: item.updatedAt,
    };
  });

  return {
    isConfigured: true,
    algorithm: 'AES-256-CBC' as const,
    totalKeys: entries.length,
    storagePath: VAULT_FILE,
    lastUpdated: entries.length > 0 ? entries[entries.length - 1].updatedAt : new Date().toISOString(),
    keys: entries,
  };
}
