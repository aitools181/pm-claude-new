# Email delivery (Turn 3) — v5.1

Migration 0032 adds `mail_settings`. SMTP is instance configuration, so it is managed from the
platform console (`/superadmin` → Email (SMTP)) and guarded by `PlatformAdminGuard`.

## Secret handling
The SMTP password is encrypted with AES-256-GCM before storage, reusing the existing credential
vault helpers keyed from `SESSION_SECRET`. The API never returns the password — the settings
endpoint reports only `hasPassword`. Saving with a blank password field keeps the stored secret,
so an administrator can edit the host or port without re-entering credentials.

## Delivery
`MailService` builds a nodemailer transport when settings exist and delivery is enabled, and falls
back to the log-only adapter otherwise, so a fresh install still works with no configuration.
The transport is cached and rebuilt automatically whenever settings change.

**Delivery failure never breaks the calling flow.** Invitations, password resets and email
verification complete even if the SMTP server is unreachable; the failure is logged and reported
rather than thrown at the user mid-signup.

## Testing a server
`POST /superadmin/mail/test` verifies the connection and sends one message, then records
`lastTestAt`, `lastTestOk` and `lastTestError`, which the console shows. A failed test returns the
underlying SMTP error (for example an authentication or connection refusal) so the cause is visible.

## Audit
Saving settings and running a test both write instance-scope audit events
(`platform.mail_settings_saved`, `platform.mail_test_sent`).

## Verified (real Postgres + a live SMTP server, 13 checks)
Log-adapter fallback before configuration; host/port/From validation; password encrypted at rest
and never exposed; blank password preserves the secret; successful test against a real server with
the result recorded; genuine delivery once enabled (the test server received the messages);
disabling reverts to the log adapter; a failed test stores the error; delivery failure does not
break the caller; and both actions are audited.
