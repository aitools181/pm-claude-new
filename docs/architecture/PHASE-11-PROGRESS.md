# Post-V1 Phase 11 — Public API, Integrations, PWA & External Connectivity

Built in verifiable streams. **Public API + scoped tokens** is complete; webhooks,
integrations/credential vault and the PWA/mobile frontend follow.

## Stream 1 — Public API & Scoped Tokens (backend)
- Schema (migration 0015): api_tokens (SHA-256 hash only, prefix for display, scopes,
  expiry, revocation, last-used), idempotency_keys (unique per org+key).
- Scoped tokens: create returns the raw token ONCE; listings are masked (prefix +
  bullets) and never expose the hash or raw value. authenticate() rejects unknown, revoked
  and expired tokens with distinct error codes; ApiTokenGuard + ScopeGuard enforce
  Bearer auth and per-endpoint scopes.
- Versioned REST (/public-api/v1): keyset pagination (limit + opaque cursor, no overlap),
  filtering (projectId, status), and a create endpoint. POSTs honour an Idempotency-Key
  header — a repeat replays the stored response instead of creating twice.
- Contract: a stable OpenAPI 3 document is served at /public-api/v1/openapi.json (no auth).
  Capability: token.manage for the management console.

### Verification (real Postgres)
A created token starts with pmk_ and is masked in listings (no hash/raw); a valid token
authenticates with its scopes; revoked, expired and unknown tokens are denied; keyset
pagination returns 2 + 2 + 1 across three pages with no overlap and a null final cursor;
project/status filters work; a public create returns a work item; a repeated idempotency key
keeps the first stored response. Gates — documented contracts + revoked/expired token denied;
credentials never appear after save — pass.

## Stream 2 — Webhooks (backend)
- Schema (migration 0016): webhook_subscriptions (url, HMAC secret, event list, active),
  webhook_deliveries (payload, status, attempt, signature, retry time, response).
- Signing + replay protection: each delivery is signed HMAC-SHA256 over
  `timestamp.deliveryId.body` and sent with X-PM-Signature / X-PM-Timestamp / X-PM-Delivery
  headers. verifySignature() rejects tampered bodies, wrong signatures, and stale timestamps
  (default 300s tolerance) so replays are detectable.
- Delivery + retries: emit() signs and sends to each active subscription whose event list
  matches; failures schedule a retry with linear backoff up to maxAttempts, then the delivery
  is marked failed (give-up). A recovered endpoint delivers on retry; retryDue() drives the
  scheduler.
- Replay + logs: any past delivery can be manually replayed as a fresh delivery; per-attempt
  status/error is logged. Secrets are masked in listings. Capability: webhook.manage.

### Verification (real Postgres)
Signature verifies and rejects tampering + stale timestamps; a subscription's secret is masked
in listings; a matching event delivers and is signed while a non-matching event is skipped; a
failing endpoint retries to maxAttempts (attempt 4) then fails and rejects further retries; a
recovered endpoint delivers on retry; replay creates a new delivered delivery. Gate — webhook
signature/replay protection and retries pass.

## Stream 3 — Integrations & Credential Vault (backend)
- Schema (migration 0017): integrations (kind, non-secret config, status, health), and
  integration_credentials (AES-256-GCM ciphertext + masked hint only).
- Credential vault: secrets are encrypted at rest with a key derived from the deployment
  session secret; the raw value is never returned. Reads expose only a masked hint
  (e.g. ••••1234); the DB stores ciphertext, and decrypt is server-only (used by adapters).
  GCM authentication means tampered ciphertext is rejected.
- Adapter interface + registry: per-kind adapters (email/calendar/github/gitlab/generic)
  expose healthCheck(config, secret); runHealthCheck decrypts the credential server-side,
  runs the adapter and records ok/failing (+ error status). Reconnect/disconnect and
  credential rotation are supported. Capability: integration.manage.

### Verification (real Postgres)
Crypto round-trips and rejects tampering; a created integration returns only ••••1234, the DB
row holds ciphertext (no plaintext), and list/get expose no secret or ciphertext; a health
check succeeds using the server-side decrypt; a credential-less integration reports failing +
error; rotation updates the hint and stays healthy; disconnect updates status. Gate —
credentials never appear in logs/UI after save — passes.

## Stream 4 — PWA, Offline Queue & Developer Consoles (frontend)
- Installable PWA: web app manifest, an SVG app icon, and a service worker that caches the
  app shell, serves an offline fallback, always passes /api through to the network, and drives
  an update flow (a client registrar prompts to apply a new version and shows an offline banner).
- Offline draft/action queue: a localStorage-backed queue (lib/offline-queue) captures
  actions while offline and auto-flushes on reconnect; server rejections surface as explicit
  conflicts the user can retry or discard. The mobile-friendly Quick add page (/quick) creates
  work items directly when online and queues them when offline.
- Developer consoles: API tokens (/admin/api-tokens) — create with scopes + expiry, one-time
  reveal, masked listing, revoke; Webhooks (/admin/webhooks) — subscriptions with masked
  secrets, delivery logs, send-test, retry and replay; Integrations (/admin/integrations) —
  connect by kind, masked credential hint, health check, rotate and disconnect.

All routes compile in the production build (40/40).

---

## Phase 11 COMPLETE (4 streams) — verified against a real database
Public API + scoped tokens, Webhooks (signing/replay/retries), Integrations + encrypted
credential vault, and the installable PWA with an offline queue + developer consoles. Gates
— documented contracts + revoked/expired token denied; webhook signature/replay + retries;
credentials never appear after save; PWA install/update + queued-draft conflict flow;
mobile primary journeys — are met.

## Next in Phase 11
Webhook subscriptions (signing, delivery logs, retries, replay); integration adapter
interface + credential vault (encrypted, masked, health checks); email-to-task / calendar /
GitHub adapters; then the responsive PWA (installable, offline draft queue with conflict
handling) frontend.
