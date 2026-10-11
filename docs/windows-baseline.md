# Windows desktop baseline

Run `npm run verify:desktop` before accepting changes to mail/account/security flows.
It checks types, production assets/server, unit/security regressions and browser
flows for folders, compose, OAuth UI, polling, reconnection and encrypted cache.
Tests use synthetic credentials and isolated temporary data; they do not contact
real mail accounts. Browser checks require the existing Chrome/Playwright runtime.
For Windows packaging, additionally run `npm run build:win` and the packaged
application smoke check. Passing a build does not prove real provider login or
delivery; those remain separate opt-in checks with fresh credentials.

## Verified on 2026-10-10

- Before this change: typecheck and 89 security/regression cases passed on Linux.
- After this change: 108 security/regression cases passed on both Linux and Windows.
- Linux browser checks passed: UI/themes/folders/compose, mocked OAuth UI,
  polling, confirmed account removal and encrypted cache reload.
- Windows checks passed: typecheck, production NSIS build, account removal and
  DPAPI-encrypted cache reload, packaged backend and real isolated desktop window.
- Packaging test checks embedded dependencies, complete styles, AI-off startup
  and destroyed-window recovery; it never opens the user's installed profile.
- Installer is unsigned. Real Gmail/Outlook authorization and delivery were not
  exercised. Existing bundle-size warnings are not resolved by these changes.
- No Git commit, push or history rewriting was performed for these three steps.

Security acceptance:
- Every mail mutation binds account, source folder, UID and UIDVALIDITY; when
  present, Message-ID must also match. Unknown/stale identity requires resync.
- Removing an account requires confirmation and successful local cleanup before
  success is shown. Cancel/error must not silently remove the account.
- Owned credentials, cached mail and drafts are removed; unrelated accounts and
  shared AI/Telegram keys are preserved. Pending refresh/sync/cache writes cannot
  restore the removed account.
- Vault summaries never expose key/password fragments; provider exceptions are
  not included in logs. Local deletion is not provider-side grant revocation.
- Legacy vault entries without provable ownership are preserved. New manually
  saved mail passwords must include their owning email address in the vault UI.
