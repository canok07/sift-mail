# Sift Mail v17 (0.7.0) Değişiklikleri

## Yapay zekâ

- Bağlantı testi sonucu artık `success` alanına göre değerlendirilir; başarısız yanıt başarılı gibi gösterilmez.
- API anahtarı bağlantı testi sırasında kalıcı olarak yazılmaz.
- “Bağla ve güvenli kaydet” yalnızca başarılı testten sonra etkinleşir.
- Kaydedilmiş ve kullanıcı tarafından etkinleştirilmiş sağlayıcı yoksa Sift Asistanı ile AI işlem düğmeleri gizlenir.
- Ollama yalnızca bir uç nokta doğrulanıp kaydedildiğinde yapılandırılmış kabul edilir.

## Posta listesi ve klasörler

- Liste 10, 20, 50 veya 100 iletiyle gerçek sayfalara ayrılır.
- Önceki/Sonraki düğmeleri ve gösterilen ileti aralığı ana ekrana eklendi.
- Sayfa boyutu Ayarlar'dan kaldırılıp posta araç çubuğuna taşındı.
- Gelen, Giden, Spam, Taslak, Çöp ve Arşiv filtreleri kesin klasör eşleşmesi kullanır.
- Klasör veya hesap değişince önceki sayfa, seçim ve açık ileti durumu temizlenir.

## Yeni ileti

- Oluşturma penceresi Gmail ve Outlook'taki temel akışlar örnek alınarak yeniden tasarlandı.
- Alıcı, Cc, Bcc, Konu ve mesaj gövdesi alanları eklendi.
- Birden çok dosya eki ve toplam boyut kontrolü eklendi.
- Mevcut bir e-posta RFC822 `.eml` eki olarak yeni mesaja eklenebilir.
- Açık bir ileti “İlet” düğmesiyle konu ve özgün içerik bilgileri korunarak compose ekranına aktarılabilir.
- SMTP hattı Cc, Bcc ve ekleri destekleyecek şekilde genişletildi.

## Doğrulama

- TypeScript kontrolü geçti.
- 19 güvenlik testi ve 4 IMAP/MIME testi geçti.
- Chrome uçtan uca testi klasör izolasyonu, iki yönlü sayfalama, sayfa boyutu, ESC, güvenli HTML, `.eml` eki ve AI test/kaydetme kapısını doğruladı.
