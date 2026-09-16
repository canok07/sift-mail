import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const VAULT_FILE = path.join(DATA_DIR, 'vault.enc');
const SALT_FILE = path.join(DATA_DIR, '.vault_salt');
const KEY_FILE = path.join(DATA_DIR, '.vault_key');
const ALGORITHM_GCM = 'aes-256-gcm';
const ALGORITHM_CBC_LEGACY = 'aes-256-cbc';

// Ensure data directory exists with restricted permissions
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
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

// Generate or read persistent local machine vault key (NO hardcoded fallback)
function getOrCreateMachineSecret(): string {
  // If explicitly provided via environment, prefer that
  if (process.env.VAULT_SECRET && process.env.VAULT_SECRET.trim().length > 0) {
    return process.env.VAULT_SECRET.trim();
  }

  // Otherwise, read or generate a secure host-bound key file with restricted permissions (0600)
  if (fs.existsSync(KEY_FILE)) {
    const existing = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (existing) return existing;
  }

  const generatedKey = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_FILE, generatedKey, { encoding: 'utf8', mode: 0o600 });
  return generatedKey;
}

// Derive a secure 32-byte AES key bound to this host
export function getVaultKey(): Buffer {
  const salt = getOrCreateSalt();
  const machineSecret = getOrCreateMachineSecret();
  return crypto.scryptSync(machineSecret, salt, 32);
}

export interface StoredVaultItem {
  key: string;
  value: string;
  label: string;
  category: 'imap_password' | 'gemini_api_key' | 'smtp_password' | 'custom_token' | 'telegram' | string;
  updatedAt: string;
}

// Encrypt string using authenticated AES-256-GCM
export function encryptData(plainText: string): string {
  const key = getVaultKey();
  // 12 bytes IV is standard and optimal for AES-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM_GCM, key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: gcm:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
  return `gcm:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// Decrypt string using AES-256-GCM with backward compatibility for legacy AES-256-CBC
export function decryptData(cipherText: string): string {
  const key = getVaultKey();
  const trimmed = cipherText.trim();

  // 1. Authenticated AES-256-GCM format
  if (trimmed.startsWith('gcm:v1:')) {
    const parts = trimmed.split(':');
    if (parts.length !== 5) {
      throw new Error('Geçersiz AES-256-GCM şifreli veri formatı.');
    }

    const [, , ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM_GCM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      throw new Error(
        'Kasa verisi bozulmuş veya yetkisiz şekilde değiştirilmiş. GCM kimlik doğrulama doğrulaması (Auth Tag) başarısız.'
      );
    }
  }

  // 2. Legacy AES-256-CBC format migration check (<iv_hex>:<ciphertext_hex>)
  const legacyParts = trimmed.split(':');
  if (legacyParts.length === 2 && legacyParts[0].length === 32) {
    try {
      const iv = Buffer.from(legacyParts[0], 'hex');
      const encrypted = legacyParts[1];
      const decipher = crypto.createDecipheriv(ALGORITHM_CBC_LEGACY, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Verify JSON structure
      JSON.parse(decrypted);

      // Auto-migrate legacy format to AES-256-GCM
      try {
        const reEncrypted = encryptData(decrypted);
        fs.writeFileSync(VAULT_FILE, reEncrypted, { encoding: 'utf8', mode: 0o600 });
        console.log('[Sift Vault] Eski AES-256-CBC kasası başarıyla güvenli AES-256-GCM formatına yükseltildi.');
      } catch (migrateErr) {
        console.warn('[Sift Vault] Otomatik GCM yükseltme uyarısı:', migrateErr);
      }

      return decrypted;
    } catch {
      throw new Error('Kasa verisi bozulmuş veya eski şifreleme anahtarı geçersiz.');
    }
  }

  throw new Error('Desteklenmeyen veya bozulmuş şifreli veri biçimi.');
}

// Load decrypted items map (strictly throws if corrupted or tampered)
export function loadVaultItems(): Record<string, StoredVaultItem> {
  if (!fs.existsSync(VAULT_FILE)) {
    return {};
  }

  const raw = fs.readFileSync(VAULT_FILE, 'utf8');
  if (!raw.trim()) {
    return {};
  }

  const decrypted = decryptData(raw);
  try {
    return JSON.parse(decrypted);
  } catch {
    throw new Error('Kasa verisi çözüldü ancak JSON yapısı bozuk. Dosya bütünlüğü doğrulanamadı.');
  }
}

// Save items map encrypted to disk
export function saveVaultItems(items: Record<string, StoredVaultItem>): void {
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
  try {
    const items = loadVaultItems();
    return items[key]?.value || null;
  } catch (err: any) {
    console.error(`[Vault Error reading key '${key}']`, err.message);
    throw err;
  }
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
    algorithm: 'AES-256-GCM' as const,
    totalKeys: entries.length,
    storagePath: VAULT_FILE,
    lastUpdated: entries.length > 0 ? entries[entries.length - 1].updatedAt : new Date().toISOString(),
    keys: entries,
  };
}

export function verifyVaultIntegrity(): { valid: boolean; error?: string } {
  try {
    loadVaultItems();
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}
