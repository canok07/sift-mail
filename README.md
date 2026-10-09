# Sift Mail

## English

Sift Mail is a privacy-focused, multi-account email client for Gmail, Outlook, Apple Mail, Yandex, and standard IMAP/SMTP providers. Core mail features work without AI; optional AI providers can assist with summaries, classification, and reply drafts.

Current version: **0.7.4**. See the [changelog](CHANGELOG.md).

### Download

[Download Sift Mail 0.7.4 for Windows](https://github.com/canok07/sift-mail/releases/download/v0.7.4/Sift-Mail-Setup-0.7.4.exe) · [Release notes and SHA-256 checksum](https://github.com/canok07/sift-mail/releases/tag/v0.7.4)

The Windows installer is not code-signed; Windows SmartScreen may show an unknown-publisher warning. macOS, Linux, Android and iOS source projects are available, but this release publishes only a Windows installer.

### What's new in 0.7.4

- Unified optional AI connections and privacy controls; testing a new key does not save it or enable the assistant.
- Safer mail-action confirmations and recovery when the local server restarts.
- Rich-text compose, restored minimized drafts, and original-message `.eml` attachments.
- Encrypted local mail/draft storage, Windows-protected vault keys, and incremental folder synchronization.

### Features

- Multiple email accounts in one interface
- Separate Inbox, Sent, and Spam folders
- Incremental background synchronization, bounded reconnect retries, search, labels, date groups, and pagination
- Encrypted local mail and draft cache; Windows vault keys protected with DPAPI
- Compose, reply, forward, attachments, and recipient suggestions
- Protected HTML email rendering with remote images and tracking pixels blocked
- Light, Dark, OLED, Ocean, and Forest themes
- English, Turkish, and German interface languages
- Optional Gemini, OpenAI, Claude, and Ollama integrations
- Optional plugin system with failure isolation and constrained permissions

### Account setup

- **Gmail:** use a Google app password for IMAP/SMTP.
- **Outlook / Hotmail:** Microsoft OAuth with PKCE is supported when `MICROSOFT_CLIENT_ID` is configured.
- **Apple Mail:** use an Apple app-specific password.
- **Yandex and other providers:** use an app password or manual IMAP/SMTP settings where required.

Passwords and API keys must never be committed to the repository. Copy [.env.example](.env.example) for local configuration. Email content is displayed in a sandboxed frame, and optional cloud AI access is disabled until explicitly configured.

### Development

Requires Node.js and npm.

```powershell
npm ci
npm run dev          # Web development
npm run dev:desktop  # Desktop development
npm run lint
npm test
npm run build
```

Platform builds:

```powershell
npm run build:win
npm run build:mac
npm run build:linux
npm run build:android
npm run build:ios
```

macOS builds require macOS/Xcode. Android builds require the Android SDK. Run `npm run build` before `npm run test:ui`; the UI test requires Chrome.

### Tests

`npm test` checks mail, security, AI privacy, plugins and local sessions. After building, `npm run test:ui` checks fixture-backed browser flows; `node tests/package-smoke.cjs` checks the packaged Windows backend. These checks do not prove live Gmail/Outlook access or mail delivery.

Optional read-only account checks: `npm run test:providers:live`. Supply `SIFT_LIVE_EMAIL` and a fresh `SIFT_LIVE_PASSWORD` (app password) or `SIFT_LIVE_ACCESS_TOKEN` privately through the process environment. Missing credentials return `BLOCKED`. The check does not send or delete mail. Never store credentials in source or Git.

### Project structure

- `core/` — mail, sync, security, rules, AI, and plugins
- `shared/` — shared React UI, types, stores, and services
- `apps/desktop/` — Electron desktop application
- `apps/web/` — Vite web/PWA application
- `apps/mobile/` — Capacitor Android and iOS projects
- `tests/` — security, mail, plugin, UI, and package checks

---

## Türkçe

Sift Mail; Gmail, Outlook, Apple Mail, Yandex ve standart IMAP/SMTP sağlayıcılarını destekleyen, gizlilik odaklı çoklu hesap e-posta istemcisidir. Temel posta özellikleri yapay zekâ olmadan çalışır; isteğe bağlı AI sağlayıcıları özetleme, sınıflandırma ve yanıt taslağı hazırlama konularında yardımcı olabilir.

Güncel sürüm: **0.7.4**. Ayrıntılar için [değişiklik notlarına](CHANGELOG.md) bakın.

### İndir

[Windows için Sift Mail 0.7.4’ü indir](https://github.com/canok07/sift-mail/releases/download/v0.7.4/Sift-Mail-Setup-0.7.4.exe) · [Sürüm notları ve SHA-256 özeti](https://github.com/canok07/sift-mail/releases/tag/v0.7.4)

Windows kurucusu kod imzalı değildir; SmartScreen bilinmeyen yayıncı uyarısı gösterebilir. macOS, Linux, Android ve iOS kaynak projeleri bulunur; bu sürümde yalnızca Windows kurucusu yayımlanır.

### 0.7.4 yenilikleri

- Ortak isteğe bağlı AI bağlantıları ve gizlilik denetimleri; yeni anahtarı test etmek anahtarı kaydetmez, asistanı etkinleştirmez.
- Daha güvenli posta işlemi onayları ve yerel sunucu yeniden başladığında bağlantının toparlanması.
- Biçimlendirilmiş yeni ileti, küçültülen taslakların geri yüklenmesi ve özgün `.eml` ileti ekleri.
- Şifreli yerel mail/taslak saklama, Windows korumalı kasa anahtarı ve artımlı klasör eşitlemesi.

### Özellikler

- Tek arayüzde birden fazla e-posta hesabı
- Birbirinden ayrı Gelen, Giden ve Spam klasörleri
- Artımlı arka plan eşitlemesi, sınırlı yeniden bağlantı denemesi, arama, etiketler, tarih grupları ve sayfalama
- Şifreli yerel ileti/taslak önbelleği ve Windows DPAPI korumalı kasa anahtarı
- Yeni mail, yanıtlama, iletme, dosya ekleri ve alıcı önerileri
- Dış görselleri ve takip piksellerini engelleyen korumalı HTML görünümü
- Açık, Koyu, OLED, Okyanus ve Orman temaları
- Türkçe, İngilizce ve Almanca arayüz
- İsteğe bağlı Gemini, OpenAI, Claude ve Ollama bağlantıları
- Hataları ana uygulamadan yalıtılmış, kısıtlı yetkili isteğe bağlı eklenti sistemi

### Hesap kurulumu

- **Gmail:** IMAP/SMTP için Google uygulama şifresi kullanın.
- **Outlook / Hotmail:** `MICROSOFT_CLIENT_ID` yapılandırıldığında PKCE destekli Microsoft OAuth kullanılabilir.
- **Apple Mail:** Apple uygulamaya özel parolası kullanın.
- **Yandex ve diğer sağlayıcılar:** Gerektiğinde uygulama parolası veya manuel IMAP/SMTP ayarlarını kullanın.

Parolaları ve API anahtarlarını depoya göndermeyin. Yerel yapılandırma için [.env.example](.env.example) dosyasını kopyalayın. Mail içeriği korumalı bir çerçevede gösterilir; bulut AI erişimi kullanıcı açıkça yapılandırana kadar kapalıdır.

### Geliştirme

Node.js ve npm gerektirir.

```powershell
npm ci
npm run dev          # Web geliştirme
npm run dev:desktop  # Masaüstü geliştirme
npm run lint
npm test
npm run build
```

Platform derlemeleri:

```powershell
npm run build:win
npm run build:mac
npm run build:linux
npm run build:android
npm run build:ios
```

macOS derlemesi macOS/Xcode, Android derlemesi Android SDK gerektirir. Arayüz testi için önce `npm run build`, ardından Chrome kurulu bir sistemde `npm run test:ui` çalıştırın.

### Testler

`npm test`; mail, güvenlik, AI gizliliği, eklenti ve yerel oturum kontrollerini çalıştırır. Derlemeden sonra `npm run test:ui` örnek verilerle tarayıcı akışlarını, `node tests/package-smoke.cjs` paketlenmiş Windows sunucusunu kontrol eder. Bu kontroller gerçek Gmail/Outlook erişimini veya mail teslimatını kanıtlamaz.

İsteğe bağlı salt okunur hesap kontrolü: `npm run test:providers:live`. `SIFT_LIVE_EMAIL` ve yeni bir `SIFT_LIVE_PASSWORD` (uygulama parolası) veya `SIFT_LIVE_ACCESS_TOKEN` değerini özel olarak işlem ortamına verin. Bilgiler eksikse `BLOCKED` döner. Test mail göndermez veya silmez. Kimlik bilgilerini kaynak koda ya da Git'e kaydetmeyin.

### Proje yapısı

- `core/` — mail, senkronizasyon, güvenlik, kurallar, AI ve eklentiler
- `shared/` — ortak React arayüzü, tipler, mağazalar ve servisler
- `apps/desktop/` — Electron masaüstü uygulaması
- `apps/web/` — Vite web/PWA uygulaması
- `apps/mobile/` — Capacitor Android ve iOS projeleri
- `tests/` — güvenlik, mail, eklenti, arayüz ve paket kontrolleri

## License / Lisans

[MIT](LICENSE)
