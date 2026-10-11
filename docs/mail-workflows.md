# Mail workflows (desktop, steps 9–11)

## Scope

- Reply/all uses parsed To/Cc/Reply-To, excludes connected own addresses, and sends bounded In-Reply-To/References headers. Bcc is never included in reply-all.
- Thread view uses account-owned header links or provider thread IDs; subject similarity is not an identity.
- Provider drafts use explicit IMAP APPEND copies. Continue Draft verifies folder/UIDVALIDITY/UID/Message-ID and restores MIME attachments. Existing provider drafts are not overwritten or deleted, even after sending. Local drafts remain encrypted.
- SMTP partial acceptance preserves only rejected recipients for an explicit retry. Successful delivery is not treated as a failed send when an optional Sent-copy write fails.
- Gmail/Outlook Sent copies are synchronized from the provider. Standard IMAP/SMTP accounts request an optional same-Message-ID Sent APPEND, checking for an existing copy first. There is no automatic retry of send/APPEND after an ambiguous network failure.
- Optimistic Sent records reconcile only against same-account Sent messages. Verified moves invalidate the old source UID, preserve local annotations in an identity-less destination record, then reconcile against real destination metadata before another remote action is possible.

## Search and labels

- Search covers every locally synchronized cached message in the chosen account/folder, including body text, recipients, provider labels and attachment names. It does not claim to search not-yet-synchronized provider history.
- Local database search decrypts scoped records in memory. No plaintext body/search index is stored on disk.
- Local user: labels and provider labels are separate. Provider add/remove and category-label export require confirmation and exact account/folder/message identity, followed by server verification.
- Gmail uses advertised X-GM-EXT-1 labels. Other IMAP servers must advertise writable keywords; unsupported servers return an error. IMAP keywords are not Outlook Categories. System labels are not writable through this feature.
- Metadata polling refreshes provider labels independently of local labels.

## Automation safety

- Rules remain local classification only; they cannot send or delete mail automatically.
- New rules default to Inbox and can be scoped by account/folder. Legacy rules retain their previous all-account/all-folder scope and show it explicitly; users can narrow it without recreating rules.
- Sender/domain matching rejects display-name and suffix lookalikes. Empty explicit scope matches nothing.
- Confirmed batches deduplicate account+message identity, stop at the first failure and retain only verified completion counts. Already completed operations are not automatically retried.
- Bulk unsubscribe opens provider pages only after confirmation; opening a page never claims a verified cancellation.

## Verification

Run npm run verify:desktop, npm run build:win -- --config.npmRebuild=false, then node tests/package-smoke.cjs.
Fixtures cover MIME drafts/attachments, reply-all/threading, Sent reconciliation/copies, partial SMTP delivery, full-store search beyond 6000 records, provider label capability/identity checks, route authorization/confirmation/redaction, scoped rules and partial batches. UI tests run without configured AI.

Live Gmail/Outlook authorization and real provider behavior still require the user's OAuth registrations and interactive sign-in. No real mail is sent or deleted by the fixture suites. Windows installer remains unsigned until a trusted signing certificate is configured.
