# Background mail synchronization / Arka plan posta eşitlemesi

## English

After an account connects, Sift polls every selectable folder without AI. One scheduler checks due jobs every 15 seconds, runs at most four sequential requests per cycle and normally revisits a folder after two minutes. Large folder/account sets take additional cycles. New-message backlogs continue in 25-message batches; reconnect retries use bounded exponential backoff (15 seconds–5 minutes). The operating system's online event expedites checks. Authorization expiry preserves cached mail and asks the user to reconnect.

Each request checks up to 1,000 cached UIDs using flags-only IMAP FETCH in a read-only mailbox. The checks rotate over older pages as well as recent mail. Only successfully checked missing UIDs are removed from the local cache; no provider deletion or send is performed. A successful IMAP LIST updates folder discovery. UIDVALIDITY changes replace only the affected account/folder generation. Local labels and analysis are preserved for unchanged identities.

`syncCursor` is the last delivered UID, **not** the server's `highestUid`. Ascending batches avoid skipping mail during a large backlog. Folder cursors and messages are stored together in the existing encrypted snapshot. Unrequested historical bodies remain on the provider and can be loaded through existing pagination. This is bounded polling, not IMAP IDLE, a Gmail History API worker or guaranteed instantaneous sync.

Account removal, reconnect, manual refresh, local-data transfer and user mail actions invalidate stale responses. Closing the app cancels the scheduler; no background daemon or stored IMAP password is introduced. Live Gmail/Outlook authorization and delivery remain a separate verification gate requiring the user's OAuth registrations.

Checks: `npm run test:poll`, `npm run verify:desktop`; Windows packaging: `npm run build:win`, followed by `node tests/package-smoke.cjs`.

## Türkçe

Hesap bağlandıktan sonra tüm seçilebilir klasörler AI’dan bağımsız kontrol edilir. Tek zamanlayıcı 15 saniyede bir zamanı gelen işleri kontrol eder; her turda en fazla dört sıralı istek çalışır. Normal klasör kontrol aralığı iki dakikadır; çok sayıda klasör/hesap ek turlar gerektirir. Biriken yeni iletiler 25’lik partilerle alınır. Bağlantı hatalarında 15 saniye–5 dakika arası kademeli yeniden deneme yapılır. İnternetin geri gelmesi kontrolleri öne çeker. Yetki sona erdiğinde mevcut mailler korunur ve yeniden giriş istenir.

Her istekte en fazla 1.000 kayıtlı UID’nin yalnızca okunma bayrakları kontrol edilir; gövdeler tekrar indirilmez ve eski sayfalar da sırayla taranır. Başarılı kontrolde bulunamayan iletiler yalnızca yerel listeden kaldırılır; sağlayıcıda silme/gönderme yapılmaz. UIDVALIDITY değişimi yalnızca ilgili hesap/klasörü yeniler. Etiketler ve analizler aynı ileti kimliğinde korunur.

Şifreli depodaki `syncCursor`, sunucunun en yüksek UID’sinden ayrı olarak son teslim alınan UID’yi tutar. Küçükten büyüğe partiler birikmiş yeni maillerin atlanmasını önler. Tüm eski gövdeler otomatik indirilmez; mevcut sayfalama kullanılır. Bu sistem sınırlı aralıklarla kontrol yapar; IMAP IDLE veya anlık eşitleme değildir. Gerçek Gmail/Outlook testleri OAuth kayıtları hazır olduğunda ayrıca yapılmalıdır.
