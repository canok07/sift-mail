# Local mail storage

The Windows mail client uses the SQLite module bundled with Node/Electron; no new native npm dependency is required. Development requires Node 22.13 or newer. `core/storage/mailRepository.ts` owns persistence; `core/security/mailStore.ts` preserves the existing snapshot API.

Messages, compose/reply drafts (including draft attachments), account configuration, local labels, mail rules and folder checkpoints are stored in separate tables. Account/folder identifiers and content digests use domain-separated HMAC indices. Payloads use AES-256-GCM with record identity as authenticated data and keys derived from the existing protected vault. Database counts, row ordering and numeric dates are not encrypted; the database is **not** whole-file SQLCipher encryption. Windows protects the source key with user-bound DPAPI; Linux files use 0600/0700 permissions.

Writes are SQLite transactions with full durability. Unchanged payloads are not re-encrypted. Duplicate identities, credential-shaped fields, corrupted ciphertext and newer database versions fail visibly. Account removal deletes owned records and also prunes the encrypted legacy recovery file. Vault and database cleanup are separate, retryable operations, not a cross-file transaction.

On first access, an existing `mail-cache.enc` is decrypted, validated and imported transactionally. The original encrypted file remains as a recovery copy; malformed data is never overwritten. Legacy browser account/label/rule metadata is removed only after a successful encrypted database save. The UI no longer silently truncates messages at 5,000. The compatibility snapshot transfer still has a 40 MB/100,000-message safety limit: exceeding it returns an error, not silent data loss. Indexed local message queries support account/folder filters and bounded pages. The current UI still restores its snapshot into memory; lazy loading, full-store search and reliable folder reconciliation are later roadmap steps.

## Backup and restore

Settings → Local data offers real encrypted `.siftbackup` downloads and explicit-confirmation restore. Use a unique password of at least 12 characters; it is not saved. Backups use a random salt, scrypt and authenticated AES-GCM. They contain mail data and non-secret account configuration, not passwords, provider tokens, AI keys, the vault or its DPAPI key. A backup can be restored on another device without the original key; sign in again afterward. Restore replaces local mail data/configuration only and does not send, delete or change mail at the provider. Back up before restoring. Lost backup passwords cannot be recovered.

The device-local authenticated APIs are `/api/local/mail-cache`, `/api/local/mail-store/messages`, `/api/local/mail-store/export` and `/api/local/mail-store/import`. Remote hosts cannot access them; responses disable caching. Import requires `confirmReplace: true`. The renderer pauses and drains pending local writes during transfers so stale snapshots do not overwrite restored data.

Verification: `npm run verify:desktop`; dedicated repository regressions: `node --test tests/mail-repository.cjs` after `npm run build`. Packaged Electron startup tests also perform a real encrypted SQLite write/read.

## Türkçe

Mailler, taslaklar, hesap ayarları, etiketler, kurallar ve klasör eşitleme bilgileri yerel SQLite veritabanında tutulur. İçerikler şifrelidir; hesap/klasör kimlikleri indekslerde açık tutulmaz. Kayıt sayıları ve sayısal tarihler şifreli değildir. Eski şifreli önbellek kayıp olmadan taşınır ve kurtarma kopyası korunur. Hesap kaldırılırsa bu kopyadaki ilgili veriler de temizlenir.

Ayarlar → Yerel veriler bölümünden şifreli yedek indirilebilir ve açık onayla geri yüklenebilir. Yedek parolasını saklayın: unutulursa yedek açılamaz. Geri yükleme yerel verileri değiştirir; gerçek posta kutusuna işlem yapmaz. Yedeklerde giriş parolaları/tokenları ve AI anahtarları yoktur; başka cihazda yeniden giriş gerekir. 5.000 ileti kırpması kaldırılmıştır; mevcut snapshot aktarımının 40 MB güvenlik sınırı vardır. Tam klasör uzlaştırması ve tüm depoda arama bu aşamanın kapsamında değildir.
