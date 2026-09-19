# Sift Mail

Sift, Electron tabanlı bir masaüstü e-posta istemcisidir. Gelen Kutusu, Gönderilenler ve Spam klasörlerini ayrı gösterir; e-posta okumayı ve isteğe bağlı AI analizini tek uygulamada toplar.

## v15 — 0.5.2

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

Ayrıntılar: [Değişiklik notları](DEGISIKLIKLER-v15.md).

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

Gmail bağlantısında Google uygulama şifresi kullanılır. Microsoft/Hotmail bağlantısı OAuth yapılandırması gerektirir; normal hesap şifresiyle giriş beklenmemelidir.

AI ayarlarında Gemini, OpenAI, Anthropic ve Ollama sağlayıcı seçenekleri bulunur. Seçeneklerin görünmesi tek başına bağlantının kurulmuş olduğu anlamına gelmez; ilgili sağlayıcı yapılandırılmalı ve bağlantısı test edilmelidir.

HTML iletiler script çalıştırmayan ayrı bir iframe içinde gösterilir. Dış görseller yüklenmez. Parolaları, API anahtarlarını veya `.env` dosyanızı GitHub’a göndermeyin. Yapılandırma örneği: [.env.example](.env.example).

## Test sonuçları

v15 için şu kontroller tamamlandı:

- TypeScript: `npm run lint`
- 19 güvenlik testi ve 4 posta/MIME testi: `npm test`
- Chrome arayüz testi: hesap bağlama, klasör ayrımı, sayfalama, ileti gösterimi, script izolasyonu ve isteğe bağlı Telegram alanı
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
