# F29-F42 Advanced Capability Completion

This document maps Master Blueprint v3.0 pages 91-103 to the implementation in this repository. These domains remain optional and independently enabled so the core Work Item engine continues to run without ITSM, Discovery, communications, connected search, or AI providers.

## Implementation matrix

| Feature | Database/domain | API/service | UI | Activation boundary |
|---|---|---|---|---|
| F29 Enterprise Identity | Identity providers, verified domains, directory connectors, mappings, sync runs, external identities, SSO exemptions, single-use break-glass codes | Provider health/enforcement, domain discovery, LDAP/AD bulk sync contract, scoped SCIM v2 Users endpoints, deprovision/session revoke, group-to-role/team governance, audited break-glass login | System > Enterprise identity | Live IdP metadata/certificates and LDAP network credentials are deployment inputs. SAML/OIDC conformance must be certified against the selected IdP. |
| F30 Work Item Mobility | Parent/depth invariants, key history, owning placement, idempotency request hash | Clone hierarchy, bulk create, hierarchy impact preview, promote/demote/re-parent, cross-project dry-run move, rollback and old-key resolution | Item tools and Task Drawer subtask flow | Cross-organization move is intentionally prohibited; use controlled export/import. |
| F31 WQL, schemes and screens | Saved queries, subscriptions, screen schemes, configuration bundles/versions/project bindings | Safe AST parser for AND/OR/NOT/IN/functions, field whitelist, cost/explain, saved queries, subscriptions, immutable bundle versions, diff/publish/apply | Advanced search plus configuration screens | Connector-specific predicates can extend the parser without exposing SQL. |
| F32 Lookup/Mirror/Rollup | Calculated definitions, relation paths, projections, dependency graph and recalculation runs | Permission-aware lookup/mirror/aggregates, cycle detection, freshness/error state and override audit | Calculations | Large scopes use observable recalculation runs. |
| F33 Scenario Planning | Scenarios, draft changes, baselines, schedule runs, warnings and commit proposals | Deterministic dependency scheduling, overload/cycle warnings, compare, stale-version checks, selective approved commit and rollback evidence | Scenarios | Plan-only until explicit authorized commit. |
| F34 Vendor Migration | Migration projects, discovery snapshots, mapping profiles, batches and source references | Asana/Jira/ClickUp normalizers, discovery/coverage, dry-run, chunked resumable import, idempotent rerun and reconciliation | Migration centre | Source export/API credentials and representative fixtures are required for production cutover. |
| F35 DevOps Lifecycle | Repositories, PRs, builds, deployments, environments, findings, development links, webhook events and DORA snapshots | Signed/replay-protected hook, Work Item key linking, readiness and DORA calculations | DevOps | Git/CI provider credentials and webhook configuration are deployment inputs; platform does not host source or execute CI. |
| F36 Connected Search | Connectors, scopes, indexed objects, ACL snapshots, crawl runs and retrieval citations | Indexed/federated connector contract, scope/exclusion/retention, ACL check and stale invalidation, cited retrieval | Connected search | Provider OAuth/API credentials and connector-specific crawlers are deployment inputs. |
| F37 Admin Sandbox | Sandbox environments, packages/versions, diffs, promotions and rollback packages | Isolated sandbox organization, seeded roles/capabilities, config clone, outbound modules suppressed, signed package, diff/conflict/approval/promotion/rollback | System > Sandbox | Masked sample data requires an organization-approved masking policy. Secrets are never cloned. |
| F38 Service Management | Service projects, request types, queues, SLA clocks, incidents/problems/changes, alerts/on-call, asset schemas/CIs/relations | Portal/request intake, deterministic calendar-aware SLA, queue evaluation, incident/change/on-call and CMDB impact services | Service management | Paging/email/discovery adapters require external services. Domain remains separate from normal Projects. |
| F39 Product Discovery | Ideas, insights, customers/opportunities/experiments, formulas, votes, publications and delivery links | Evidence linking/dedup, explainable RICE/WSJF/weighted scoring, merge, delivery rollup and revocable roadmap publication | Discovery | Customer PII policy/consent and public hosting configuration are deployment inputs. |
| F40 Communications | Mailboxes, threads/messages, calendar connections/events, clips/transcripts/sync sessions/meeting captures | Signed inbound email, threading/routing/reply queue, two-way sync conflict records, consented clips/transcripts and reviewed meeting actions | Communications | SMTP/mail provider, Google/Microsoft/CalDAV credentials, media storage and transcription provider are deployment inputs. |
| F41 Personal Productivity | Notes, reminders, mind maps/nodes, location projections, browser captures, device registrations and offline queue | Private notes, recurring/snoozed reminders, task conversion, map/mind-map APIs, device revoke and offline conflict queue | Productivity | Native desktop/iOS/Android binaries and browser-store publication are separate packaging deliverables; responsive PWA/API are in this repository. |
| F42 AI Teammates | Teammates, policies, tool grants, runs, memory, action proposals, checkpoints and budgets | Permission-scoped tools, citations, budget limits, governed memory, human checkpoints and field-whitelisted mass mutations | AI teammates | BYOK/local provider credentials and model evaluation are deployment inputs. Core availability never depends on AI. |

## Security and integrity controls

- Every advanced table is organization-owned and all services resolve organization context server-side.
- Optional modules are off by default and normal navigation hides disabled modules.
- Public SCIM uses scoped API tokens (`scim:write`). Public email and DevOps ingestion use HMAC signatures and replay/idempotency records.
- SCIM deprovisioning disables the organization membership and revokes sessions; it never deletes authored work.
- Break-glass codes are hashed, short-lived, single-use, organization-scoped and audited.
- Sandbox creation seeds default roles and capabilities, grants the creator an organization-admin assignment, copies configuration without secrets, and disables outbound communications/DevOps/connected-search modules.
- AI mass updates accept only the Work Item update allowlist; arbitrary proposal keys cannot reach the database update method.
- Scenario commit accepts only an explicit field allowlist and validates numeric values before persistence.
- Password reset and email verification use hashed, expiring, single-use tokens; password reset revokes all active sessions.
- Session listing never serializes stored token hashes; users can revoke one device or all devices.
- Task Drawer files/custom fields/checklists/tags use live Work Item access checks; protected files use single-use upload/download grants.

## Database migrations

- `0026_complete_f29_f42.sql` creates the advanced domain tables.
- `0027_f29_f42_completion.sql` adds WQL bundle/subscription tables, the request hash for race-safe idempotency, connector/provider-scoped external-identity uniqueness and grants new capabilities to existing organization-admin roles.
- `0028_auth_security_completion.sql` adds email verification state, database-backed login lockout fields, auth-token indexes/FK and hashed one-time 2FA recovery codes.

## Verification

Run the dependency-free structural and pure-engine gate:

```bash
node scripts/verify-f29-f42.cjs
```

It parses all TS/TSX sources, resolves relative imports, exercises WQL/scenario/SLA/prioritisation/vendor-normalizer fixtures, checks migration coverage for advanced tables, verifies UI/API module presence, confirms AppModule imports and writes `verification-f29-f42.json`.

Then, in a networked Docker environment, run the full release gate:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm --filter @pm/api test
pnpm --filter @pm/web e2e
pnpm --filter @pm/db migrate
```

Provider activation additionally requires real IdP/directory, Git/CI, email/calendar, search and AI test tenants. Passing local structural tests is not a substitute for those external conformance and security tests.
