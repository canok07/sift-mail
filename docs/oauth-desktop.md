# Desktop mail account sign-in / Masaüstü hesap girişi

## English

Gmail and Outlook use the system browser, authorization-code + PKCE, and a local callback. The callback exchanges codes on the backend; an authenticated poll with a separate private capability returns the short-lived access token. Refresh tokens/client secrets stay in the encrypted local vault. No password/token is saved in renderer account metadata. Manual IMAP/SMTP remains available.

Setup in **Accounts → OAuth application registration**:

- Google: create an OAuth client with application type **Desktop app** and configure the consent screen/test users. Enter the client ID, and optionally the issued client secret. This is not a Gemini API key. The callback is `http://127.0.0.1:<actual-port>/oauth/google/callback`. The existing IMAP/SMTP engine requires Google's restricted `https://mail.google.com/` scope. Public distribution requires Google's applicable verification; a local test passing does not establish approval.
- Microsoft: register a **Mobile and desktop application / public client**, allow the intended account types, and register the actual loopback callback `http://127.0.0.1:<actual-port>/oauth/microsoft/callback` (desktop normally uses port 47831). No Microsoft client secret is used. Delegated permissions: Outlook `IMAP.AccessAsUser.All`, `SMTP.Send`, Microsoft Graph `User.Read`, plus offline access. Profile and Outlook mail use separate audience tokens. Consent alone does not enable a mailbox whose administrator/provider has disabled IMAP/SMTP.
- After relaunch, select **Reconnect** on a saved OAuth account or refresh the inbox. If permission has expired/revoked, sign in again. Manual-password accounts intentionally ask for a fresh app password unless the user explicitly saves it in the vault.
- Removing an account clears only that account's local credentials/cache. It does not claim to revoke the provider's consent grant. Use the provider's security page to revoke authorization.

Verification: `npm run verify:desktop`, then `npm run build:win`, then the packaged desktop smoke check. Provider/unit/browser tests use synthetic fixtures, not real Gmail/Outlook. The optional `npm run test:providers:live` needs fresh credentials in process environment and never sends/moves/deletes. Before claiming real delivery, the owner must authorize a real send/reply/attachment test and verify the receiving mailbox and Sent folder. Do not place credentials in source, logs, screenshots, or reports.

## Türkçe

**Hesaplar → OAuth uygulama kaydı** bölümünden Google **Desktop app** veya Microsoft **public client** kaydını girin. API anahtarı değil, OAuth client ID gerekir. Giriş normal tarayıcıda açılır; izin verip Sift'e dönün. Refresh tokenlar ve varsa Google client secret yerel şifreli kasada kalır.

Google'da test kullanıcıları/izin ekranı ve IMAP/SMTP için `https://mail.google.com/` izni gereklidir. Herkese dağıtım için Google'ın doğrulama koşulları ayrıca karşılanmalıdır. Microsoft'ta yukarıdaki gerçek dönüş adresini ve devredilmiş izinleri kaydedin; client secret oluşturmayın. Kurumun IMAP/SMTP'yi kapatmış olması OAuth ile aşılmaz.

Yeniden açılışta **Yeniden bağlan** veya yenile düğmesini kullanın. İzin iptal edilmişse tekrar giriş gerekir. Hesap kaldırma yerel temizlemedir; sağlayıcıdaki erişim iznini iptal ettiğini iddia etmez.

2026-10-10: Kullanıcı OAuth uygulama kayıtlarının henüz hazır olmadığını belirtti ve kod/yerel testlerin tamamlanmasını istedi. Gerçek Gmail/Outlook okuma, gönderme, yanıtlama, ek teslimatı ve klasör eşleşmesi bu yüzden henüz doğrulanmadı. Eski paylaşılan şifreler kullanılmaz; yeni OAuth girişi ve açık gönderim izni gerekir.

## Official references

- [Google installed-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google IMAP/SMTP OAuth scope](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol)
- [Microsoft IMAP/SMTP OAuth](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)
