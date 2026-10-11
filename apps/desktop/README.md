# Sift Mail Desktop

## English

Electron packages the `core/` server and `shared/` UI. Run commands from the repository root:

- Development: `npm run dev:desktop`.
- Windows installer: `npm run build:win`.
- Linux AppImage: `npm run build:linux`.
- Optional Debian package: `npm run build:linux:deb`; requires real maintainer metadata in the builder configuration.
- macOS: `npm run build:mac`; native verification and signing require a macOS host.
- Packaged smoke check: `node tests/package-smoke.cjs` on Windows, or `xvfb-run -a node tests/package-smoke.cjs` on Linux after building. Uses an isolated test profile, never the installed user's accounts.

Build success does not imply code signing or live mail-provider verification. Do not replace a published installer with an unversioned test build.

## Türkçe

Electron, `core/` sunucusunu ve `shared/` arayüzünü paketler. Komutları proje kökünde çalıştırın:

- Geliştirme: `npm run dev:desktop`.
- Windows kurulum dosyası: `npm run build:win`.
- Linux AppImage: `npm run build:linux`.
- İsteğe bağlı Debian paketi: `npm run build:linux:deb`; gerçek paket sorumlusu bilgisi gerekir.
- macOS: `npm run build:mac`; yerel doğrulama ve imzalama için macOS gerekir.
- Paket testi: derleme sonrasında Windows'ta `node tests/package-smoke.cjs`, Linux'ta `xvfb-run -a node tests/package-smoke.cjs`. Yalıtılmış test profili kullanır; mevcut kullanıcı hesaplarını açmaz.

Başarılı derleme, imzalama veya gerçek posta sağlayıcısı doğrulaması anlamına gelmez. Yayımlanmış kurulum dosyasını sürümü değiştirilmemiş test paketiyle değiştirmeyin.
