# Sift Mail

## English

Sift Mail is a multi-account email client with optional AI assistance. Accounts, sync, folders, search, labels, compose, attachments and reply/forward work independently of AI. Windows desktop is the current priority.

Version: **0.7.4** · [Changelog](CHANGELOG.md)

### Download and status

[Published Windows installer](https://github.com/canok07/sift-mail/releases/download/v0.7.4/Sift-Mail-Setup-0.7.4.exe) · [Release notes and checksum](https://github.com/canok07/sift-mail/releases/tag/v0.7.4)

The `main` branch contains newer desktop changes than that installer. This source update does not replace the release asset. Installers are unsigned; Windows SmartScreen may show an unknown-publisher warning.

### Features

- Multiple accounts; separate Inbox, Sent, Spam, Drafts, Archive and Trash views.
- Incremental background sync, reconnect recovery, date groups and pagination (10/20/50/100).
- Search across synchronized local mail: body text, recipients and attachment names. Unsynchronized provider history is not searched.
- Rich-text compose, attachments, recipient suggestions, reply-all and header-linked, account-isolated conversations.
- Encrypted local mail/drafts and portable backups; Windows DPAPI-protected vault keys.
- Explicit provider draft copies and continuation with original attachments. Provider draft originals are preserved.
- Separate local/provider labels and account/folder-scoped classification rules. Provider label updates and mail actions require confirmation; completed operations are not silently retried after partial failures.
- Sandboxed HTML mail with remote images/tracking blocked, five themes and English/Turkish/German UI.
- Optional Gemini, OpenAI, Claude and Ollama integration infrastructure. AI is unavailable until configured and enabled; normal mail use does not depend on it.

Gmail labels use the advertised IMAP extension. Other providers must support writable IMAP keywords; these are not Outlook Categories. Details: [mail workflows](docs/mail-workflows.md), [background sync](docs/background-sync.md), [storage and backups](docs/local-mail-store.md).

### Account setup and privacy

- **Gmail:** system-browser OAuth with a registered Google Desktop client, or an app password where available.
- **Outlook/Hotmail:** system-browser OAuth with a registered Microsoft public desktop client.
- **iCloud Mail, Yandex and standard IMAP/SMTP:** manual server settings and provider-required app passwords.

Configure OAuth registrations in the account dialog; see [desktop OAuth setup](docs/oauth-desktop.md). OAuth is fixture-tested. Live Gmail/Outlook login, delivery and folder equivalence still require registrations and interactive testing; public OAuth distribution requires applicable provider approval.

Refresh credentials and explicitly saved secrets stay in the encrypted local vault. Never commit passwords, keys, tokens or user mail data. [.env.example](.env.example) contains placeholders only. Cloud AI requires configuration and privacy permission.

### Development and verification

Requires **Node.js 22.13+** and npm. Run from the repository root:

```powershell
npm ci
npm run dev:desktop
npm run verify:desktop
npm run build:win
node tests/package-smoke.cjs
```

Browser tests require Chrome. Run the package check after building on Windows; it uses an isolated profile, never installed user accounts.

**Verified on 2026-10-11:** TypeScript, production build, 183 security/regression/folder-delta tests, and UI/OAuth-fixture/sync/reconnect/encrypted-cache flows passed on Windows and Linux. Windows NSIS packaging and the actual packaged Electron window passed. These checks do not prove live mail delivery. Live AI verification and final performance/release hardening remain separate work.

Optional read-only provider check: `npm run test:providers:live`. Supply fresh credentials privately through the process environment; missing credentials report `BLOCKED`. It does not send, move or delete mail.

### Structure and platforms

- `core/` — mail, sync, accounts/OAuth, storage, security, rules, AI and plugins.
- `shared/` — React UI, types and shared services.
- `apps/desktop/` — Electron desktop shell.
- `apps/web/` — Vite web/PWA; `npm run dev:web` / `npm run build:web`.
- `apps/mobile/` — Capacitor Android/iOS source projects.
- `tests/` — automated and fixture-backed checks.

Web/mobile sources exist, but Windows checks do not establish production web authentication, mobile readiness or native macOS/iOS verification. Platform docs: [desktop](apps/desktop/README.md), [web](apps/web/README.md), [mobile](apps/mobile/README.md).

---

## Türkçe

Sift Mail, isteğe bağlı yapay zekâ desteği sunan çoklu hesap e-posta istemcisidir. Hesaplar, eşitleme, klasörler, arama, etiketler, yeni ileti, ekler ve yanıtlama/iletme AI'dan bağımsız çalışır. Güncel öncelik Windows masaüstüdür.

Sürüm: **0.7.4** · [Değişiklik notları](CHANGELOG.md)

### İndir ve güncel durum

[Yayımlanmış Windows kurucusu](https://github.com/canok07/sift-mail/releases/download/v0.7.4/Sift-Mail-Setup-0.7.4.exe) · [Sürüm notları ve dosya özeti](https://github.com/canok07/sift-mail/releases/tag/v0.7.4)

`main` dalındaki masaüstü kaynakları bu kurucudan daha yenidir. Bu kaynak güncellemesi yayımlanmış paketi değiştirmez. Kurucular imzasızdır; SmartScreen bilinmeyen yayıncı uyarısı gösterebilir.

### Özellikler

- Ayrı Gelen, Giden, Spam, Taslaklar, Arşiv ve Çöp Kutusu görünümleriyle çoklu hesap yönetimi.
- Artımlı arka plan eşitlemesi, yeniden bağlantı, tarih grupları ve 10/20/50/100 iletilik sayfalama.
- Eşitlenmiş yerel maillerin gövdesinde, alıcılarında ve ek adlarında arama. Henüz eşitlenmemiş sağlayıcı geçmişi aranmaz.
- Biçimlendirilmiş yeni ileti, ekler, alıcı önerileri, tümünü yanıtlama ve ileti başlıklarıyla bağlanan hesap bazlı konuşmalar.
- Şifreli yerel mail/taslaklar ve taşınabilir yedekler; Windows DPAPI korumalı kasa anahtarı.
- Açık işlemle sağlayıcıya taslak kopyası kaydetme ve özgün ekleriyle devam etme. Sağlayıcıdaki özgün taslak korunur.
- Ayrı yerel/sağlayıcı etiketleri ve hesap/klasör kapsamlı sınıflandırma kuralları. Sağlayıcı etiketi ve mail işlemleri onay ister; kısmi hatada tamamlanan işlemler sessizce tekrarlanmaz.
- Dış görselleri/takibi engelleyen korumalı HTML görünümü, beş tema ve İngilizce/Türkçe/Almanca arayüz.
- İsteğe bağlı Gemini, OpenAI, Claude ve Ollama bağlantı altyapısı. Yapılandırılıp etkinleştirilmedikçe AI kullanılamaz; normal mail kullanımı AI gerektirmez.

Gmail etiketleri sunucunun bildirdiği IMAP uzantısını kullanır. Diğer sağlayıcılarda yazılabilir IMAP anahtar sözcük desteği gerekir; bunlar Outlook Kategorileri değildir. Ayrıntılar: [mail akışları](docs/mail-workflows.md), [arka plan eşitlemesi](docs/background-sync.md), [depolama ve yedekler](docs/local-mail-store.md).

### Hesap kurulumu ve gizlilik

- **Gmail:** kayıtlı Google Desktop uygulamasıyla sistem tarayıcısında OAuth veya kullanılabiliyorsa uygulama parolası.
- **Outlook/Hotmail:** kayıtlı Microsoft public desktop uygulamasıyla sistem tarayıcısında OAuth.
- **iCloud Mail, Yandex ve standart IMAP/SMTP:** manuel sunucu ayarları ve sağlayıcının istediği uygulama parolası.

OAuth kayıtlarını hesap penceresinde yapılandırın; [masaüstü OAuth kurulumu](docs/oauth-desktop.md) gerekli bilgileri açıklar. OAuth örnek sağlayıcılarla test edilmiştir. Gerçek Gmail/Outlook girişi, teslimat ve klasör eşleşmesi kayıtları ve etkileşimli testleri bekler; herkese dağıtım için ilgili sağlayıcı onayları gerekir.

Yenileme bilgileri ve açıkça kaydedilen sırlar şifreli yerel kasada tutulur. Parola, anahtar, token veya kullanıcı maillerini Git'e eklemeyin. [.env.example](.env.example) yalnızca yer tutucular içerir. Bulut AI yapılandırma ve gizlilik izni gerektirir.

### Geliştirme ve doğrulama

**Node.js 22.13+** ve npm gerekir. Proje kökünden çalıştırın:

```powershell
npm ci
npm run dev:desktop
npm run verify:desktop
npm run build:win
node tests/package-smoke.cjs
```

Tarayıcı testleri Chrome gerektirir. Paket kontrolünü Windows derlemesinden sonra çalıştırın; mevcut hesaplar yerine yalıtılmış profil kullanılır.

**11 Ekim 2026 doğrulaması:** Windows ve Linux'ta TypeScript, üretim derlemesi, 183 güvenlik/regresyon/klasör testi ve arayüz/örnek OAuth/eşitleme/yeniden bağlantı/şifreli önbellek akışları geçti. Windows NSIS paketi ve gerçek paketlenmiş Electron penceresi açılışı geçti. Bunlar gerçek mail teslimatını kanıtlamaz. AI canlı doğrulaması ve son performans/yayın hazırlığı ayrı aşamalardır.

İsteğe bağlı salt okunur sağlayıcı kontrolü: `npm run test:providers:live`. Yeni kimlik bilgilerini özel olarak işlem ortamına verin; eksik bilgilerde `BLOCKED` döner. Test mail göndermez, taşımaz veya silmez.

### Yapı ve platformlar

- `core/` — mail, eşitleme, hesap/OAuth, depolama, güvenlik, kurallar, AI ve eklentiler.
- `shared/` — React arayüzü, tipler ve ortak servisler.
- `apps/desktop/` — Electron masaüstü kabuğu.
- `apps/web/` — Vite web/PWA; `npm run dev:web` / `npm run build:web`.
- `apps/mobile/` — Capacitor Android/iOS kaynak projeleri.
- `tests/` — otomatik ve örnek verili kontroller.

Web/mobil kaynakları bulunur; Windows testleri üretim web kimlik doğrulamasını, mobil hazır oluşunu veya yerel macOS/iOS doğrulamasını kanıtlamaz. Platform belgeleri: [masaüstü](apps/desktop/README.md), [web](apps/web/README.md), [mobil](apps/mobile/README.md).

## License / Lisans

[MIT](LICENSE)
