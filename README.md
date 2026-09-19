# Sift Mail

Sift Mail, Electron tabanlı çoklu hesap masaüstü e-posta istemcisidir. Gmail, Outlook, Apple, Yandex ve standart IMAP/SMTP hesaplarını; e-posta okumayı ve isteğe bağlı AI analizini tek uygulamada toplar.

## v16 — 0.6.0

- **Hızlı açılış:** Hesap arayüze hemen eklenir; IMAP klasörleri ve son iletiler arka planda yüklenir.
- **Çoklu hesap:** Hesaplar sol menüde ayrı görünür; Tüm İletiler, Gelen, Giden ve Spam hesap bazında veya birleşik kullanılabilir.
- **Tarih ve sayfalama:** İletiler tarihe göre sıralanır, Bugün / Bu Hafta / Bu Ay / Daha Eski gruplarına ayrılır; 10/20/50/100 görünür ileti seçilebilir.
- **Okuma deneyimi:** ESC ile kapanan ileti görünümü ve aktif temaya uyan korumalı HTML/salt metin arka planı.
- **Oluştur ve kişiler:** Sıfırdan ileti oluşturma, hesap seçme ve daha önceki gönderen/alıcı adreslerinden otomatik öneri.
- **Etiketler:** Kullanıcı etiketi oluşturma, silme, iletiye uygulama ve etiketle filtreleme.
- **Tam sayfa Ayarlar:** Genel, Arayüz, Yapay Zekâ, Yardım ve Hakkında sayfaları; tema, özel renk, arka plan, yazı tipi/boyutu ve ileti sayısı ayarları.
- **Dil:** Yeni temel ekranlar Türkçe, Almanca ve İngilizce çeviri sistemine bağlandı.
- **Sağlayıcılar:** Microsoft OAuth/PKCE ve Gmail, Yandex, Apple ile standart IMAP uygulama parolası akışları; manuel kurumsal IMAP/SMTP seçeneği.
- **Kimlik:** Sift Mail adı, 0.6.0 paket kimliği ve Windows/PWA için yeni özgün uygulama ikonu.

- **Klasör ayrımı:** Gelen Kutusu, Gönderilenler ve Spam ayrı menülerde açılır. Gönderilen iletiler gelen kutusuna karışmaz.
- **Doğru ileti içeriği:** MIME, quoted-printable ve base64 içerikleri çözülür. Türkçe/Almanca karakterler ve tam metin korunur; yalnızca liste önizlemesi kısaltılır.
- **Tarih sıralaması:** İletiler klasörlerin çekilme sırasına göre değil, ileti tarihine göre sıralanır.
- **Sayfalama:** İlk senkronizasyonda klasör başına en yeni 100 ileti yüklenir. Yüklenen/toplam sayacı ve “Daha fazla yükle” düğmesi eski iletilere erişim sağlar.
- **Açık hata bildirimi:** Klasör okuma hatası boş klasör gibi gösterilmez.
- **Sade arayüz:** Liste kartları küçültüldü. Ayrıntılı AI analizi ve gelişmiş işlemler açılır bölüme taşındı.
- **İsteğe bağlı Telegram:** Bağlantı alanı kapalı bir ayrıntı bölümündedir. “Son 3 saatteki spam mailleri temizle” komut simülatörü kaldırıldı.
- **Otomatik temizlik:** Abonelikten çıkınca geçmişi otomatik temizleme davranışı kaldırıldı.
- **Masaüstü başlangıcı:** Electron, yerel sunucu hazır olduğunda arayüzü açar. HTML içeren geçerli JSON yanıtlarının yanlışlıkla hata sayılması düzeltildi.
- **Hesaplar:** Hesap bağlama gerçek senkronizasyonu bekler; başka hesaba ait yüklenmiş iletiler korunur.

Ayrıntılar: [v16 değişiklik notları](DEGISIKLIKLER-v16.md).

## Çalıştırma

Hazır taşınabilir paket kullanıyorsanız ZIP’in tamamını bir klasöre çıkarın ve içindeki `Sift.exe` dosyasını açın. `resources` klasörü ve diğer dosyalar EXE’nin yanında kalmalıdır. Eski Sift sürümünü önce kapatın.

Kaynak koddan çalıştırmak için Node.js ve npm gerekir:

```powershell
npm ci
npm run dev
```

Windows paketi oluşturmak için `Sift-Olustur.cmd` dosyasını çalıştırın. Bu dosya bağımlılıkları kurar, TypeScript kontrolünü ve testleri çalıştırır, ardından Windows paketini üretir. Çıktı `release/` klasöründedir.

Elle derleme:

```powershell
npm run lint
npm test
npm run build:win
```

## Hesaplar ve AI bağlantıları

Gmail bağlantısında Google uygulama şifresi kullanılabilir. Microsoft/Hotmail için OAuth/PKCE desteklenir ve `MICROSOFT_CLIENT_ID` gerekir. Apple uygulamaya özel parola ister. Yandex OAuth istemci yapılandırması yoksa uygulama parolasıyla IMAP kullanılabilir. Normal Microsoft hesap parolasıyla giriş beklenmemelidir.

AI ayarlarında Gemini, OpenAI, Anthropic ve Ollama sağlayıcı seçenekleri bulunur. Seçeneklerin görünmesi tek başına bağlantının kurulmuş olduğu anlamına gelmez; ilgili sağlayıcı yapılandırılmalı ve bağlantısı test edilmelidir.

HTML iletiler script çalıştırmayan ayrı bir iframe içinde gösterilir. Dış görseller yüklenmez. Parolaları, API anahtarlarını veya `.env` dosyanızı GitHub’a göndermeyin. Yapılandırma örneği: [.env.example](.env.example).

## Test sonuçları

v16 için şu kontroller tamamlandı:

- TypeScript: `npm run lint`
- 19 güvenlik testi ve 4 posta/MIME testi: `npm test`
- Chrome arayüz testi: arka plan senkronizasyonu, klasör ayrımı, sayfalama, MIME/script izolasyonu, ESC, yeni ileti, etiket, tam sayfa ayarlar ve dil geçişi
- Paket testi: Electron çalışma ortamı, paketlenmiş sunucu bağımlılıkları, sağlık uç noktası ve ön yüz dosyaları

Arayüz testini çalıştırmak için Chrome kurulu olmalıdır:

```powershell
npm run build
npm run test:ui
```

Windows paket testini derlemeden sonra çalıştırabilirsiniz:

```powershell
node tests/package-smoke.cjs
```

Bu kontroller yapay test iletileriyle yürütüldü. **Kişisel Gmail hesabındaki güncel iletilerle canlı karşılaştırma, Hotmail OAuth ve gerçek AI sağlayıcı çağrıları bu sürümde doğrulanmadı.** Test sonuçları tüm sağlayıcıların sorunsuz çalıştığı garantisi değildir.

## Lisans

[MIT](LICENSE)
