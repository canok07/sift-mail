# Sift Mail v16 — 0.6.0

Bu sürüm arayüzü çoklu hesap kullanımı etrafında sadeleştirir. Hesap eklendiği anda uygulama açılır; IMAP senkronizasyonu kullanıcıyı bekletmeden arka planda devam eder. Hesap başına oturum bilgileri yalnızca çalışan uygulamanın belleğinde tutulur.

## Yeni

- Hesapların üstte listelendiği; Tüm İletiler, Gelen, Giden, Spam ve Etiketler sıralamasına sahip sol menü.
- Sıfırdan e-posta oluşturma ve geçmiş gönderen/alıcı adreslerinden otomatik tamamlama.
- Oluşturulabilen, silinebilen, iletilere atanabilen ve filtrelenebilen kullanıcı etiketleri.
- Bugün, Bu Hafta, Bu Ay ve Daha Eski tarih grupları.
- 10, 20, 50 veya 100 ileti gösterme tercihi.
- Genel, Arayüz, Yapay Zekâ, Yardım ve Hakkında bölümlerine sahip tam sayfa ayarlar.
- Yumuşak açık tema, koyu/OLED/Okyanus/Orman temaları, özel vurgu rengi, arka plan resmi, yazı tipi ve boyutu.
- Türkçe, Almanca ve İngilizce yeni ekran çevirileri.
- Microsoft OAuth/PKCE düğmesi; Gmail, Apple, Yandex ve kurumsal hesaplar için yönlendirilmiş IMAP/SMTP kurulumu.
- Sift Mail marka adı ve özgün Windows/PWA ikonu.

## Düzeltmeler

- İleti ayrıntısı ESC ile kapanır.
- HTML e-posta iframe'i artık açık/koyu/OLED temasıyla uyumlu renk şeması kullanır; uzaktaki görseller ve scriptler engellenmeye devam eder.
- İletiler ISO tarihine göre en yeniden eskiye sıralanır.
- Gönderilen ve Spam klasörleri Gelen Kutusuna karışmaz.
- Hesap ekleme bütün iletilerin inmesini beklemez.
- Eski “Doğrudan IMAP Senkronizasyonu” ayar kartı kaldırıldı.

## Doğrulama

- TypeScript kontrolü
- 19 güvenlik testi
- 4 IMAP/MIME/klasör testi
- Chrome uçtan uca arayüz testi
- Vite üretim derlemesi
- Windows NSIS paketi ve paket smoke testi
