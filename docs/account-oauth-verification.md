# Account/OAuth verification — 2026-10-10

Scope: roadmap steps 4–6, Windows desktop. Existing mail/automation/AI behavior preserved; no framework, dependency, version, Git history or push changes.

- Shared account service: provider login, refresh deduplication, reconnect, connection normalization and account-removal cancellation are independent of UI components. Account metadata contains no passwords/access/refresh tokens.
- Gmail: system-browser Desktop PKCE, loopback backend callback, verified profile, offline refresh in the secure vault. Microsoft: same desktop handoff; existing resource-separated tokens retained and refresh/revocation handling strengthened.
- Private authenticated polling capability is separate from URL state. Callback HTML contains no codes, tokens, provider errors or script payload. Expired/replayed/wrong-provider/cancelled callbacks fail safely. Cancellation/removal during exchange cannot recreate credentials.
- Attachment download verifies UIDVALIDITY/Message-ID and rejects oversized source before download. SMTP transport closes after send. Real offline Nodemailer/mailparser round-trip verifies unicode, reply threading, attachment bytes and Bcc header privacy.

Checks passed on Linux and Windows: typecheck, production frontend/backend build, 130 test cases (21 security + 109 regressions), mail UI/themes/folders/pagination/compose/locales, mock-provider Gmail/Outlook OAuth/reconnect/revocation/cancellation, background polling, account removal, encrypted cache/draft reload.

Windows NSIS build passed. Actual packaged desktop opened using a disposable profile; backend dependencies/assets, full CSS/layout, local API, AI-off startup and destroyed-window recovery passed. NSIS installation into the user's live profile was deliberately not performed. Installer is unsigned; no trusted signing certificate is available.

Remaining blocker: user confirmed OAuth application registrations are not ready. Real Gmail/Outlook login, read/send/reply, attachment delivery and provider-folder equivalence are **not verified**. No real mail was sent, moved or deleted; old exposed credentials were not reused. Application registration plus fresh interactive login and an explicitly approved send test are required.

Existing nonblocking warnings remain: large frontend chunk (~928 kB) and static/dynamic AI import overlap. Web/mobile production authentication and platform builds were outside this task.

Canonical sources: `/home/can/projects/sift-mail`. Git HEAD remains `7d61ddb8b94fcfb1dbe03ae2c00c354d8c6af7d5`. No commit/push/force-push performed. Existing unrelated dirty changes preserved.
