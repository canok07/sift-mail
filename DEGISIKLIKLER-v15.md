# Sift v15 (0.5.2)

- Gelen Kutusu, Gönderilenler ve Spam ayrı klasörler olarak gösterilir. Sayılar IMAP klasör toplamlarından gelir.
- İlk açılışta klasör başına en yeni 100 ileti yüklenir. Yüklenen/toplam sayacı ve "Daha fazla yükle" düğmesi eklenmiştir.
- MIME, quoted-printable ve base64 içerikleri mailparser ile çözülür. Tam ileti metni ve HTML içeriği korunur; yalnızca liste önizlemesi 180 karakterdir.
- İletiler tarihe göre sıralanır. Gönderilenler artık gelen kutusuna karışmaz.
- Klasör okuma hatası boş klasör gibi gösterilmez.
- Liste kartları sadeleştirilmiştir. AI analizi ve gelişmiş işlemler ileti ayrıntısında açılır bölümdedir.
- Telegram isteğe bağlı, varsayılan olarak kapalı ayrıntı bölümündedir. "Son 3 saatteki spam mailleri temizle" komut simülatörü kaldırılmıştır. Abonelikten çıkınca otomatik geçmiş temizliği devreden çıkarılmıştır.
- HTML e-posta ayrı, script çalıştırmayan bir iframe içinde gösterilir. Dış görseller yüklenmez.
- Hesap bağlama gerçek senkronizasyonu bekler ve diğer hesabın iletilerini korur.
- v14 başlangıç ve JSON yanıt düzeltmeleri korunmuştur.

## Doğrulama

TypeScript kontrolü, 19 güvenlik testi, 4 posta/MIME testi ve Chrome arayüz testi geçti. Arayüz testi yapay test iletileriyle hesap bağlama, klasör ayrımı, sayfalama, HTML gösterimi, script izolasyonu ve isteğe bağlı Telegram alanını doğrular.

Bu sürümde kişisel Gmail hesabındaki güncel iletilerle canlı karşılaştırma yapılmadı. Hotmail OAuth ve gerçek AI sağlayıcı çağrıları bu değişikliğin test kapsamında değildir; bunların eksiksiz çalıştığı iddia edilmez. Gmail konuşma görünümü ile IMAP tekil ileti sayıları farklı olabilir.

Kaynakları derlemek için Sift-Olustur.cmd kullanılabilir. Hazır ZIP paketinde npm veya Node kurulumu gerekmez.
