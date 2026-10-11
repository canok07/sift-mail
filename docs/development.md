# Development / Geliştirme

## English

Requires Node.js 22.13+ and npm. Run from the repository root:

```powershell
npm ci
npm run dev:desktop
npm run verify:desktop
npm run build:win
node tests/package-smoke.cjs
```

Browser checks require Chrome. Package checks run after the Windows build using an isolated profile. On 2026-10-11, 183 security/regression/folder-delta tests, desktop verification on Windows/Linux and Windows packaged startup passed. These are fixture checks, not proof of real mail delivery.

- [Account/OAuth setup](oauth-desktop.md)
- [Mail workflows and provider limitations](mail-workflows.md)
- [Background synchronization](background-sync.md)
- [Encrypted storage and backups](local-mail-store.md)
- Platform docs: [desktop](../apps/desktop/README.md), [web](../apps/web/README.md), [mobile](../apps/mobile/README.md)

Live provider checks: `npm run test:providers:live`; supply fresh credentials privately through the process environment. Missing credentials report `BLOCKED`; no mail is sent, moved or deleted. Never commit credentials or user mail data. Public OAuth distribution requires applicable provider approval. Web/mobile production readiness, live AI verification and code signing remain separate work.

## Türkçe

Node.js 22.13+ ve npm gerekir. Yukarıdaki komutları proje kökünden çalıştırın. Arayüz kontrolleri Chrome gerektirir; Windows paket testi mevcut hesaplar yerine yalıtılmış profil açar.

11 Ekim 2026'da 183 güvenlik/regresyon/klasör testi, Windows/Linux masaüstü kontrolleri ve Windows paket açılışı geçti. Bunlar örnek verili testlerdir; gerçek mail teslimatını kanıtlamaz. Gerçek Gmail/Outlook kontrolü OAuth kayıtları ve etkileşimli giriş gerektirir. AI canlı doğrulaması, web/mobil üretim hazırlığı ve kod imzalama ayrı aşamalardır.

Kurulum ve çalışma ayrıntıları yukarıdaki belgelerdedir. Kimlik bilgilerini yalnızca özel işlem ortamında kullanın; kaynak koda veya Git'e eklemeyin. `test:providers:live` mail göndermez, taşımaz veya silmez.
