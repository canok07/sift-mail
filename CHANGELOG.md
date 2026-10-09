# Changelog

## 0.7.4 — 2026-10-09

Windows installer release. The installer is unsigned.

### Added

- Unified optional AI connections, backend-only privacy enforcement and strict output validation.
- Rich-text compose, minimized draft restoration and byte-preserving original-message `.eml` attachments.
- Read-only provider connection checks that report `BLOCKED` without fresh credentials.
- Encrypted local persistence for cached messages, compose drafts, reply drafts, and draft attachments.
- Windows DPAPI protection and safe migration for the local vault key.
- Microsoft OAuth popup callback handling and automatic access-token refresh.
- Incoming attachment metadata and on-demand downloads with a 25 MB limit.
- UID-based incremental inbox synchronization with UIDVALIDITY fallback.
- Bounded retry for transient synchronization failures.
- Windows tray behavior so desktop synchronization can continue after the main window is closed.

### Fixed

- AI connection tests no longer save submitted keys or activate the assistant without explicit configuration.
- Cloud consent also applies to remote Ollama endpoints; AI caches are cleared when privacy settings change.
- Mail actions fail closed and preserve remaining messages after a partial failure.
- Local API sessions recover after a rejected pre-action request without retrying ambiguous mail sends.
- Runtime vault key and salt files are no longer tracked by Git. Existing history is not rewritten.
- Custom IMAP/SMTP server settings now survive reconnects.
- Removing an account also clears its in-memory credentials and encrypted cached mail.
- Replies use the selected account and preserve the original Message-ID relationship.
- Opening unread mail updates its IMAP read state; archiving no longer marks it read implicitly.
- Stable message identity now includes account, mailbox, UIDVALIDITY, and UID.
- Microsoft OAuth callback routes are no longer intercepted by the PWA fallback.
- Local session tokens and encrypted mail-cache endpoints reject non-loopback hosts.

### Verification

- Type checking, production build, security tests, IMAP folder tests, merge/refresh tests, retry tests, and mock-backed browser flows pass on Windows.
- Packaged Windows backend and desktop startup are checked separately before publishing.
- Live provider accounts and mail delivery are not verified by fixture-backed tests. No code-signing certificate is included.

---

## 0.7.4 — 2026-10-09 (Türkçe)

Windows kurulum sürümü. Kurucu kod imzalı değildir.

### Eklenenler

- Ortak isteğe bağlı AI bağlantıları, sunucu tarafında gizlilik denetimi ve sıkı çıktı doğrulaması.
- Biçimlendirilmiş ileti, küçültülen taslağın geri yüklenmesi ve özgün baytları koruyan `.eml` ekleri.
- Yeni kimlik bilgileri olmadan `BLOCKED` dönen salt okunur sağlayıcı bağlantı kontrolleri.
- Önbelleğe alınan iletiler, yeni ileti taslakları, yanıt taslakları ve taslak ekleri için şifreli yerel saklama.
- Yerel kasa anahtarı için Windows DPAPI koruması ve güvenli eski anahtar geçişi.
- Microsoft OAuth pencere dönüşü ve otomatik erişim belirteci yenileme.
- Gelen ekleri listeleme ve 25 MB sınırıyla istenince indirme.
- UID tabanlı artımlı gelen kutusu eşitlemesi ve UIDVALIDITY değişiminde güvenli yenileme.
- Geçici eşitleme hatalarında sınırlı tekrar deneme.
- Ana pencere kapatıldıktan sonra eşitlemenin sistem tepsisinde devam etmesi.

### Düzeltilenler

- AI bağlantı testi gönderilen anahtarı kaydetmiyor ve açık yapılandırma olmadan asistanı etkinleştirmiyor.
- Bulut izni uzak Ollama uçlarında da uygulanıyor; gizlilik ayarları değişince AI önbelleği temizleniyor.
- Posta işlemleri hatada güvenli duruyor; kısmi başarısızlıkta kalan iletiler korunuyor.
- Yerel API oturumu işlem öncesi ret sonrasında toparlanıyor; sonucu belirsiz gönderimler tekrarlanmıyor.
- Çalışma zamanı kasa anahtarı ve tuz dosyaları Git takibinden çıkarıldı. Eski geçmiş yeniden yazılmadı.
- Özel IMAP/SMTP ayarları yeniden bağlantıda korunuyor.
- Hesap kaldırılınca bellekteki kimlik bilgileri ve şifreli yerel posta verisi de temizleniyor.
- Yanıtlar seçilen hesabı kullanıyor ve özgün Message-ID ilişkisini koruyor.
- Okunmamış ileti açılınca IMAP okundu durumu güncelleniyor; arşivleme artık kendiliğinden okundu işareti koymuyor.
- İleti kimliği hesap, posta kutusu, UIDVALIDITY ve UID bilgilerini içeriyor.
- Microsoft OAuth dönüş yolu PWA yönlendirmesine takılmıyor.
- Yerel oturum anahtarı ve şifreli posta uçları uzak Host isteklerini reddediyor.

### Doğrulama

- Windows üzerinde tür kontrolü, üretim derlemesi, güvenlik, IMAP klasör, birleştirme/yenileme, tekrar deneme ve sahte sunuculu tarayıcı testleri geçti.
- Paketlenmiş Windows sunucusu ve masaüstü açılışı yayımlamadan önce ayrıca kontrol edilir.
- Örnek verili testler gerçek sağlayıcı erişimini veya mail teslimatını doğrulamaz. Kod imzalama sertifikası bulunmaz.
