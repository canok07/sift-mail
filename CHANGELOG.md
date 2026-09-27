# Changelog

## 0.7.4 — 2026-09-27

This is a source update; a new signed installer has not been published yet. The latest downloadable Windows installer remains 0.7.3.

### Added

- Encrypted local persistence for cached messages, compose drafts, reply drafts, and draft attachments.
- Windows DPAPI protection and safe migration for the local vault key.
- Microsoft OAuth popup callback handling and automatic access-token refresh.
- Incoming attachment metadata and on-demand downloads with a 25 MB limit.
- UID-based incremental inbox synchronization with UIDVALIDITY fallback.
- Bounded retry for transient synchronization failures.
- Windows tray behavior so desktop synchronization can continue after the main window is closed.

### Fixed

- Custom IMAP/SMTP server settings now survive reconnects.
- Removing an account also clears its in-memory credentials and encrypted cached mail.
- Replies use the selected account and preserve the original Message-ID relationship.
- Opening unread mail updates its IMAP read state; archiving no longer marks it read implicitly.
- Stable message identity now includes account, mailbox, UIDVALIDITY, and UID.
- Microsoft OAuth callback routes are no longer intercepted by the PWA fallback.
- Local session tokens and encrypted mail-cache endpoints reject non-loopback hosts.

### Verification

- Type checking, production build, security tests, IMAP folder tests, merge/refresh tests, retry tests, and mock-backed browser flows pass on Windows.
- Real provider accounts, a packaged Electron executable, and a signed installer have not yet been verified.

---

## 0.7.4 — 2026-09-27 (Türkçe)

Bu bir kaynak kod güncellemesidir; yeni imzalı kurulum paketi henüz yayımlanmadı. İndirilebilir son Windows kurucusu 0.7.3 olarak kalır.

### Eklenenler

- Önbelleğe alınan iletiler, yeni ileti taslakları, yanıt taslakları ve taslak ekleri için şifreli yerel saklama.
- Yerel kasa anahtarı için Windows DPAPI koruması ve güvenli eski anahtar geçişi.
- Microsoft OAuth pencere dönüşü ve otomatik erişim belirteci yenileme.
- Gelen ekleri listeleme ve 25 MB sınırıyla istenince indirme.
- UID tabanlı artımlı gelen kutusu eşitlemesi ve UIDVALIDITY değişiminde güvenli yenileme.
- Geçici eşitleme hatalarında sınırlı tekrar deneme.
- Ana pencere kapatıldıktan sonra eşitlemenin sistem tepsisinde devam etmesi.

### Düzeltilenler

- Özel IMAP/SMTP ayarları yeniden bağlantıda korunuyor.
- Hesap kaldırılınca bellekteki kimlik bilgileri ve şifreli yerel posta verisi de temizleniyor.
- Yanıtlar seçilen hesabı kullanıyor ve özgün Message-ID ilişkisini koruyor.
- Okunmamış ileti açılınca IMAP okundu durumu güncelleniyor; arşivleme artık kendiliğinden okundu işareti koymuyor.
- İleti kimliği hesap, posta kutusu, UIDVALIDITY ve UID bilgilerini içeriyor.
- Microsoft OAuth dönüş yolu PWA yönlendirmesine takılmıyor.
- Yerel oturum anahtarı ve şifreli posta uçları uzak Host isteklerini reddediyor.

### Doğrulama

- Windows üzerinde tür kontrolü, üretim derlemesi, güvenlik, IMAP klasör, birleştirme/yenileme, tekrar deneme ve sahte sunuculu tarayıcı testleri geçti.
- Gerçek sağlayıcı hesapları, paketlenmiş Electron uygulaması ve imzalı kurulum paketi henüz doğrulanmadı.
