import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  saveVaultSecret,
  getVaultSecret,
  deleteVaultSecret,
  getVaultSummary,
} from '../core/security/vault';
import { getTlsOptions } from '../core/sync/imap';
import {
  VaultSaveSchema,
  EmailSyncSchema,
  ImapConnectSchema,
  SmtpSendSchema,
  AnalyzeBatchSchema,
} from '../core/security/validation';
import {
  getActiveSessionToken,
  createRateLimiter,
  isOriginAllowed,
} from '../core/security';

describe('Sift Security Hardening & Validation Test Suite', () => {
  const testKey = 'test_secret_integration_key';
  const testValue = 'S3cureP@ssw0rd!123_GCM';
  const vaultPath = path.join(process.cwd(), 'data', 'vault.enc');
  let backupVaultContent: string | null = null;

  before(() => {
    if (fs.existsSync(vaultPath)) {
      backupVaultContent = fs.readFileSync(vaultPath, 'utf8');
    }
  });

  after(() => {
    if (backupVaultContent !== null) {
      fs.writeFileSync(vaultPath, backupVaultContent, 'utf8');
    } else if (fs.existsSync(vaultPath)) {
      try {
        fs.unlinkSync(vaultPath);
      } catch {
        // ignore
      }
    }
  });

  describe('1. Vault AES-256-GCM Authenticated Encryption', () => {
    it('should encrypt, store, and decrypt a secret correctly with AES-256-GCM', () => {
      saveVaultSecret(testKey, testValue, 'imap', 'Test Secret');
      const retrieved = getVaultSecret(testKey);
      assert.equal(retrieved, testValue, 'Decrypted value should match original plaintext');

      const summary = getVaultSummary();
      const item = summary.keys.find(s => s.key === testKey);
      assert.ok(item, 'Item should be present in vault summary');
      assert.equal(item?.category, 'imap');
      assert.equal(item?.label, 'Test Secret');
    });

    it('should verify vault disk file uses version 2 and GCM format', () => {
      const vaultPath = path.join(process.cwd(), 'data', 'vault.enc');
      assert.ok(fs.existsSync(vaultPath), 'data/vault.enc must exist');
      const raw = fs.readFileSync(vaultPath, 'utf8').trim();
      assert.ok(raw.startsWith('gcm:v1:'), 'Vault payload must start with gcm:v1:');
      const parts = raw.split(':');
      assert.equal(parts.length, 5, 'Vault payload must have 5 parts (gcm, v1, iv, authTag, ciphertext)');
    });

    it('should fail decryption if ciphertext or auth tag is tampered with', () => {
      const vaultPath = path.join(process.cwd(), 'data', 'vault.enc');
      const originalRaw = fs.readFileSync(vaultPath, 'utf8');
      
      try {
        // Corrupt the auth tag in the payload
        const parts = originalRaw.split(':');
        parts[3] = '00'.repeat(16); // Fake zero auth tag
        fs.writeFileSync(vaultPath, parts.join(':'), 'utf8');

        // Reading tampered secret must throw integrity failure
        assert.throws(() => {
          getVaultSecret(testKey);
        }, /GCM kimlik doğrulama|Kasa verisi bozulmuş/);
      } finally {
        // Always restore original payload
        fs.writeFileSync(vaultPath, originalRaw, 'utf8');
      }

      assert.equal(getVaultSecret(testKey), testValue, 'Restored secret should decrypt cleanly');
    });

    it('should delete a secret and remove it from storage', () => {
      const removed = deleteVaultSecret(testKey);
      assert.equal(removed, true, 'deleteVaultSecret should return true for existing secret');
      assert.equal(getVaultSecret(testKey), null, 'Deleted secret must return null');
    });
  });

  describe('2. IMAP & TLS Certificate Validation Enforcement', () => {
    it('should strictly enforce rejectUnauthorized: true by default', () => {
      delete process.env.ALLOW_INSECURE_TLS;
      const options = getTlsOptions();
      assert.equal(options.rejectUnauthorized, true, 'TLS must reject unauthorized/self-signed certs by default');
    });

    it('should only allow insecure TLS when ALLOW_INSECURE_TLS is explicitly "true"', () => {
      process.env.ALLOW_INSECURE_TLS = 'true';
      const insecureOptions = getTlsOptions();
      assert.equal(insecureOptions.rejectUnauthorized, false, 'Should allow insecure TLS when explicitly enabled');

      // Reset
      delete process.env.ALLOW_INSECURE_TLS;
      const secureOptions = getTlsOptions();
      assert.equal(secureOptions.rejectUnauthorized, true, 'Must revert to secure TLS after clearing env flag');
    });
  });

  describe('3. Zod Schema Input Validation', () => {
    it('VaultSaveSchema should validate valid input and reject empty key/value', () => {
      const valid = VaultSaveSchema.safeParse({
        key: 'imap_password',
        value: 'super-secret',
        category: 'imap',
        label: 'App Password',
      });
      assert.equal(valid.success, true);

      const invalid = VaultSaveSchema.safeParse({
        key: '',
        value: '',
      });
      assert.equal(invalid.success, false, 'Empty key and value should be rejected');
    });

    it('EmailSyncSchema should validate required email and password credentials', () => {
      const valid = EmailSyncSchema.safeParse({
        email: 'user@example.com',
        password: '16-char-app-password',
        host: 'imap.example.com',
        port: 993,
        secure: true,
        maxResults: 20,
      });
      assert.equal(valid.success, true);

      const invalid = EmailSyncSchema.safeParse({
        email: 'not-an-email',
        password: '',
      });
      assert.equal(invalid.success, false, 'Invalid email and empty password must fail');
    });

    it('ImapConnectSchema should validate server and auth fields', () => {
      const valid = ImapConnectSchema.safeParse({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: 'test@gmail.com',
          pass: 'mysecretpass',
        },
      });
      assert.equal(valid.success, true);

      const invalid = ImapConnectSchema.safeParse({
        host: '',
        auth: { user: '', pass: '' },
      });
      assert.equal(invalid.success, false);
    });

    it('SmtpSendSchema should require either config or smtp and complete mail fields', () => {
      const valid = SmtpSendSchema.safeParse({
        config: {
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: { user: 'me@gmail.com', pass: 'secret' },
        },
        mail: {
          to: 'recipient@example.com',
          subject: 'Test Email',
          text: 'Hello from automated security test',
        },
      });
      assert.equal(valid.success, true);

      const invalid = SmtpSendSchema.safeParse({
        mail: { to: 'bad' },
      });
      assert.equal(invalid.success, false, 'Missing config and missing subject/text must fail');
    });

    it('AnalyzeBatchSchema should reject non-array or empty emails payload', () => {
      const valid = AnalyzeBatchSchema.safeParse({
        emails: [
          {
            id: '1',
            from: 'sender@example.com',
            subject: 'Meeting Notes',
            snippet: 'Let us meet at 3 PM',
          },
        ],
      });
      assert.equal(valid.success, true);

      const invalid = AnalyzeBatchSchema.safeParse({ emails: [] });
      assert.equal(invalid.success, false, 'Empty emails array must fail');
    });
  });

  describe('4. Session Token Security & Rate Limiting', () => {
    it('should generate and return an active session token', () => {
      const token = getActiveSessionToken();
      assert.ok(token, 'Session token should be non-empty string');
      assert.ok(token.length >= 32, 'Session token should have at least 32 characters of entropy');
    });

    it('rate limiter should allow requests within window and throttle excess', () => {
      const limiter = createRateLimiter({ maxRequests: 5, windowMs: 1000, message: 'Test limit exceeded' });
      const fakeReq = {
        ip: '127.0.0.1',
        path: '/test/route',
        socket: { remoteAddress: '127.0.0.1' },
      } as any;

      let passedCount = 0;
      let blocked = false;

      const next = () => { passedCount++; };
      const res = {
        setHeader: () => {},
        status: (code: number) => ({
          json: (body: any) => {
            if (code === 429) blocked = true;
          },
        }),
      } as any;

      for (let i = 0; i < 7; i++) {
        limiter(fakeReq, res, next);
      }

      assert.equal(passedCount, 5, 'Should allow exact limit of 5 calls');
      assert.equal(blocked, true, 'Calls after 5th should receive HTTP 429 response');
    });
  });

  describe('5. CORS Origin Security & Rejection', () => {
    it('should allow non-browser requests where origin is undefined', () => {
      assert.equal(isOriginAllowed(undefined), true);
    });

    it('should allow localhost and 127.0.0.1 on various ports', () => {
      assert.equal(isOriginAllowed('http://localhost:3000'), true);
      assert.equal(isOriginAllowed('http://localhost:5173'), true);
      assert.equal(isOriginAllowed('http://127.0.0.1:3000'), true);
      assert.equal(isOriginAllowed('https://localhost:8080'), true);
    });

    it('should allow native app schemes (capacitor, ionic, file)', () => {
      assert.equal(isOriginAllowed('capacitor://localhost'), true);
      assert.equal(isOriginAllowed('ionic://localhost'), true);
      assert.equal(isOriginAllowed('file://'), true);
    });

    it('should strictly reject unauthorized external web origins', () => {
      assert.equal(isOriginAllowed('http://malicious-site.com'), false);
      assert.equal(isOriginAllowed('https://evil-hacker.org'), false);
      assert.equal(isOriginAllowed('http://localhost.evil.com'), false);
    });

    it('should respect conditional LAN access settings', () => {
      // By default LAN access is disabled
      assert.equal(isOriginAllowed('http://192.168.1.150:3000', { isLanAccessEnabled: false }), false);
      // When explicitly enabled:
      assert.equal(isOriginAllowed('http://192.168.1.150:3000', { isLanAccessEnabled: true }), true);
      assert.equal(isOriginAllowed('http://10.0.0.5:3000', { isLanAccessEnabled: true }), true);
    });

    it('should allow explicitly configured custom origins', () => {
      const allowed = ['https://myinbox.app', 'https://mail.company.internal'];
      assert.equal(isOriginAllowed('https://myinbox.app', { allowedCustomOrigins: allowed }), true);
      assert.equal(isOriginAllowed('https://unauthorized.company.internal', { allowedCustomOrigins: allowed }), false);
    });
  });
});
