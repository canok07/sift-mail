# Sift Mail Mobile

Bu klasör Android ve iOS için Capacitor giriş noktasıdır. Web arayüzü `shared/` içinden üretilir; posta ve güvenlik davranışları `core/` tarafından sağlanır.

- Android geliştirme: `npm run dev:mobile`
- Android üretim: `npm run build:android`
- iOS üretim (macOS): `npm run build:ios`

Yerel Android ve iOS projeleri bu klasör altında sürümlenir. Ortak web paketini her iki projeye kopyalamak için `npm run build:mobile` kullanılır.
