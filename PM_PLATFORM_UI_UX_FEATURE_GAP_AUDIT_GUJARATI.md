# PM Platform — UI/UX, Subtask, Security ane Feature Gap Audit

**Audit date:** 2026-08-06  
**Source:** `Final_Self_Contained_PM_Platform_Master_Blueprint_Gujarati_v3.0.docx` (Revision 3.0, 166 pages) + uploaded source ZIP  
**Audit method:** static source-code review, route/service/schema/test inspection, blueprint traceability, targeted code corrections.  
**Important limitation:** uploaded ZIP ma `node_modules` nathi, sandbox ma Docker nathi ane package registry network accessible nathi. Etle full `pnpm typecheck`, `next build`, Testcontainers, Playwright ane live browser acceptance run kari shakaya nathi. Badha changed TS/TSX files TypeScript transpile parser thi syntax-check karya chhe.

---

## 1. Executive result

Repository ma ghana feature modules, database tables, API services ane screens present chhe, pan **“phase/file present” ne “production-complete facility” samajvu safe nathi**. Blueprint pramane feature complete tyare j ganay jyare persisted lifecycle, permission negative tests, migration, audit, observability, backup/restore ane failure handling evidence hoy.

Audit pehla core Task UI ma aa main problem hato:

- Database ma `parentId` ane `subtask` type hova chhata normal Project List ane Task Drawer ma subtask create/display flow natho.
- Generic Work Item create ma parent same Organization/Project chhe ke nahi, subtask mate parent mandatory chhe ke nahi, depth/type rules vagere enforce thata natha.
- Generic PATCH thi `parentId` directly badli shakata hato, etle validated re-parent service bypass thai shakti hati.
- Work item detail/activity ane Board paths ma object/project-level privacy checks incomplete hata.
- `/projects` list active user mate filter thati nathi, etle private Project na name/key sidebar/global create ma leak thai shakta hata.
- Explicit assignee/primary owner active Organization member chhe ke nahi te validate thatu nathu.
- Parent ne open subtasks sathe complete/delete karvathi silent lifecycle corruption/orphan risk hato.
- Sidebar flat ane over-loaded hati; grouped progressive navigation, responsive mobile shell ane adaptive global create missing hata.
- 2FA TOTP secret plaintext ma store thato hato.

Aa delivery ma uparna core issues ma targeted fixes add karya chhe.

---

## 2. Aa version ma implement/fix karelu

### 2.1 Asana-style UI shell

- Grouped left navigation: Home, Planning, Knowledge, Tools, Projects, optional Apps, System.
- Project shortcuts, clearer active state, responsive mobile drawer/scrim.
- Sticky topbar, compact search trigger, global Create dialog, notifications, keyboard shortcut `C`.
- Self-contained system font stack; Google Fonts runtime dependency remove kari.
- New reusable SVG icon system.
- Responsive CSS for desktop/tablet/mobile, visible focus states and reduced-motion compatibility.

### 2.2 Project List experience

- Attractive project header, project avatar, status/progress summary cards.
- List/Board/Calendar/Timeline/Gantt/Backlog/Dashboard view tabs.
- Search, status filter, sorting controls.
- Hierarchical expandable task/subtask rows.
- Task row par direct **Add subtask** action.
- Inline task and inline subtask rapid entry.
- Status, priority, owner, due date and child count presentation.
- Drawer deep-link support through `?task=<id>`.

### 2.3 Board experience

- Per-column quick create.
- Better card hierarchy, priority, assignee, due date and linked/subtask indicators.
- Improved drag/drop states, empty states and undo feedback.
- Project access and placement validation before board read/move/undo.
- Allowed status validation.
- Board drag/drop thi parent ne open subtasks sathe `Done` karvano lifecycle bypass block karyo.
- Board status/rank/activity mutation single transaction ma kari; status change par required optimistic version precondition, `version` increment ane `work_item_status_history` write add karyu.
- Soft-deleted placements board query/rank update ma ignore thay chhe.

### 2.4 Task Drawer experience

- Asana-like wider responsive task drawer.
- Complete/reopen action, editable title/description, status, priority, due date and progress.
- Subtask count/progress, Add Subtask input, subtask navigation and parent back navigation.
- Comments, activity and dependencies tabs.
- Duplicate-with-subtasks, watch and recycle-bin actions.
- Loading, error, blocked and empty states.

### 2.5 Backend Task/Subtask integrity

- Added `POST /work-items/:id/subtasks`.
- Added `GET /work-items/:id/subtasks`.
- Subtask mate parent mandatory.
- Parent and child same owning project/Organization ma hova mandatory.
- Task-with-parent prohibited in current V1 task/subtask hierarchy.
- Max depth validation (5 levels in this implementation).
- Parent type/child type matrix validation.
- Deleted/missing parent rejection.
- Section-to-project validation.
- Stable hierarchy validation detail codes.
- Generic PATCH mathi `parentId` remove; hierarchy mutation validated re-parent endpoint through j.
- Detail response ma `typeKey`, `typeName`, `subtaskCount`.
- Open subtasks hoy to parent complete/delete block thay; silent cascade/orphan na bane.
- Work item get/update/assign/unassign/delete/restore/activity ma object access checks.
- Mobility clone/reparent/move/bulk/old-key resolve ma source/destination access checks.
- Cross-project move ma parent-only move thi children orphan/cross-project parent na bane: subtree athva promote-children mapping required.
- Subtree move ma selected root parent clear, descendants ni hierarchy preserve ane old Project section placement clear.
- Project list ane project access active Organization membership + private Project membership pramane filter.
- Explicit primary owner/assignee mate active Organization membership validation.

### 2.6 Security correction

- TOTP secret AES-256-GCM encrypted-at-rest kari, deployment `SESSION_SECRET` mathi key derive thay chhe.
- Existing plaintext value mate temporary compatibility read seam chhe; successful confirm par ciphertext rotate thay chhe.

### 2.7 Tests add/update

- Subtask create/list/count test.
- Parent-required validation test.
- Cross-project parent rejection test.
- Open-child parent completion/deletion prevention test.
- Invalid/inactive Organization assignee rejection test.
- Private Project active non-member mate access/list redaction test.
- Cross-project move hierarchy preview/rejection, subtree preservation ane placement-section cleanup test.
- Board move/undo optimistic conflict, version increment and status-history test.
- Board thi open-subtask parent completion bypass reject thay te regression test.
- Playwright journey: project → task → subtask → child complete → parent complete.

---

## 3. Haju baki P0 / release-blocking work

| Priority | Gap | Current position | Required next work |
|---|---|---|---|
| P0 | Full build/runtime evidence | Syntax parser pass only | Install dependencies; run six-package typecheck, API build, Next build, migrations, Testcontainers, Playwright, axe |
| P0 | Complete hierarchy lifecycle | Create/list/basic guard fixed; promote/demote/re-parent UI and impact preview incomplete | Parent lifecycle policy dialog, subtree count, promote/demote/re-parent, restore conflict and race tests |
| P0 | Permission sweep | Core Work Item/Board/Mobility paths improved, all remaining modules not exhaustively audited | Endpoint-by-endpoint positive/negative matrix for private project, guest, field security, export/search/count leakage |
| P0 | Auth hardening | TOTP encryption fixed | Recovery codes, password-reset endpoints/UI, email verification, login rate limit/backoff/lockout, secure production cookie, all-session revoke |
| P0 | Central error catalogue | New hierarchy codes exist but UI mostly shows message | Map stable codes to inline field errors, retry/draft recovery, permission denied, conflict and long-running states |
| P0 | Backup/restore acceptance | Code/screens present | Real isolated restore drill, reconciliation evidence, object file counts, RPO/RTO proof |
| P0 | Claim correction | Handoff claimed all phases complete | Treat phase claims as implementation inventory until acceptance evidence passes |

---

## 4. P1 — Asana-level daily usability baki

1. **Task Drawer sections:** checklist, attachments/version history, custom fields, tags, collaborators/watchers list, related work, recurring rule, approval panel.
2. **Hierarchy UX:** expand/collapse all, hide completed subtasks, subtask filtering, drag-to-reparent, nested subtask quick add, bulk subtask edit.
3. **List/Table:** inline field edit, column chooser/resizing, grouping, bulk selection/actions, saved views/tabs, sections/lists and drag rank.
4. **Board:** WIP limits, swimlanes, configurable card fields, keyboard move alternative, rank conflict recovery.
5. **My Work/Inbox:** Today/Upcoming/Later grouping, snooze, actionable notification controls, personal saved perspectives.
6. **Search:** unified permission-safe search across all enabled domains, richer query builder, highlighted matches, recent/saved searches.
7. **Draft safety:** local draft recovery for title/description/comment/task/subtask, network timeout retry and confirmed-success-only clear.
8. **Accessibility:** axe audit, screen-reader announcements, complete keyboard alternatives, dialog focus trap, color-contrast and mobile touch checks.
9. **Responsive coverage:** all 59 pages need consistent layout; current visual redesign mainly shell, Project List, Board and Task Drawer par focused chhe.
10. **Design system migration:** repository na ghana pages haju inline styles use kare chhe; shared components/tokens ma migrate karva.

---

## 5. Blueprint F01–F42 traceability and pending facilities

**Legend**  
- **Substantial code** = relevant schema/API/UI routes visible, pan runtime acceptance haju pending.  
- **Partial** = core slice present pan blueprint ni important facilities missing/incomplete.  
- **Missing/placeholder** = meaningful product-grade implementation mali nathi ke mock-only chhe.

| ID | Feature domain | Audit state | Main pending facilities |
|---|---|---|---|
| F01 | Organization & Installation Management | Partial | Full org settings/lifecycle, suspend/archive/export-before-delete, quotas, branding, org clone/sandbox, support-access controls |
| F02 | Identity, Authentication & Session Security | Partial | Recovery codes, reset/verification UI+API, rate limit/lockout, suspicious-login notification, PAT UI maturity, session revoke-all |
| F03 | Users, Teams, Groups & Membership Lifecycle | Partial | Nested groups, bulk invite/import report, effective dates, skill tags, user deactivation ownership reassignment wizard |
| F04 | Roles, Permissions & Access Control | Partial | Complete scoped/field capability matrix, permission preview, deny precedence, high-risk approval/re-auth coverage |
| F05 | Workspace, Department & Project Management | Partial | Sections UI, templates depth, health/status updates, progress modes, member/settings UX, duplicate project options |
| F06 | Unified Work Item Engine | Partial—improved | Checklist, contributors/watchers UI, tags, attachments, multiple placements UX, type/workflow compatibility, merge/duplicate detection, bulk actions |
| F07 | Dependencies, Relationships & Scheduling | Substantial code | Permission/redaction and cycle race acceptance, working-calendar edge cases, richer relationship types and blocked-duration reports |
| F08 | Comments, Mentions & Collaborative Activity | Partial | Rich text, threads, mentions access UX, reactions, assigned comments, resolve/pin/edit history, field-value redaction |
| F09 | Files, Attachments & Version Management | Partial | Task Drawer upload/preview/version UI, resumable progress/cancel/retry, virus quarantine evidence, quota/orphan cleanup |
| F10 | Views, Filters, Sorting & Saved Perspectives | Partial | Saved tabs/views manager, column configuration, grouping, table paste, subtasks display modes, share/default scope |
| F11 | Custom Fields, Types & Registry | Partial | Full field type catalogue, conditional visibility, formulas/rollups, reuse/scope overrides, archive/migration usage reports |
| F12 | Workflow Engine & Approval Gates | Partial | Scheme/screen association, complete validators/actions, immutable publish/migration evidence, override and approval gate UX |
| F13 | Automation Engine & Background Execution | Partial | Mature no-code nested conditions, dry-run preview, run-step diagnostics, dead-letter/replay UI, loop/rate/concurrency acceptance |
| F14 | Templates, Recurrence & Standard Patterns | Partial | All template kinds, variables/relative dates, preview/version/publish, holidays/missed-run policy and occurrence idempotency evidence |
| F15 | Time Tracking, Timesheets & Estimates | Substantial code | Timer reconnect acceptance, overlapping policy, lock/correction workflow, richer reports and calendar-based entry |
| F16 | Resource, Capacity, Skills & Leave | Partial | Future allocation planner, skill/proficiency, leave workflow/import, privacy-redacted workload, calendar precedence |
| F17 | Forms, Intake & External Portal | Partial | Conditional branches maturity, public security/CAPTCHA/quarantine, requester isolation tests, published schema versioning |
| F18 | Approvals, Review & Visual Proofing | Partial | All approval models, reminders/escalation/delegation, field/file locks, asset checksum/reapproval acceptance |
| F19 | Agile Backlog, Sprints, Epics & Releases | Partial | Full epic/story hierarchy, capacity/scope change, sprint close/carryover history, mature Agile reports and rank races |
| F20 | Goals, OKRs, Portfolios & Programs | Partial | Goal hierarchy/targets, historical status updates, strategy rollups, cross-project programs, private link redaction |
| F21 | Dashboards, Analytics & Scheduled Reporting | Partial | Authoritative metric catalogue, drilldowns, scheduling/delivery failure UI, permission-at-export, query budgets/materialization |
| F22 | Docs, Wiki, Meetings & Knowledge Graph | Partial | Rich editor maturity, permissions/version restore, backlinks/graph, collaborative editing, stale/orphan content controls |
| F23 | Search, Command Palette, Inbox & Notifications | Partial | All-domain index, query syntax maturity, actionable/snooze/digests/quiet hours, delivery logs and revocation leak tests |
| F24 | Import, Export, API, Integrations & Webhooks | Partial | XLSX/JSON mapping depth, complete portable export, consistent public API breadth, OAuth, signed webhook replay acceptance |
| F25 | System Administration, Audit & Operations | Substantial code | Immutable audit proof, full job dashboard/replay, recycle-bin policies, structured alerting and dangerous action re-auth |
| F26 | Backup, Restore & Disaster Recovery | Substantial code | Real scheduled/isolated restore drill, encrypted off-server backup, reconciliation/cutover evidence and documented RPO/RTO |
| F27 | English UI, Unicode, Accessibility & PWA | Partial | Central English message catalogue, remove hardcoded visible strings, complete accessibility audit, offline conflict queue |
| F28 | Chat, Whiteboard & AI Assistance | Placeholder/partial | Real-time collaboration maturity, permission-aware retrieval evidence, real provider/BYOK/local model, AI action audit/governance |
| F29 | Enterprise Identity, SSO, LDAP & SCIM | Missing | SAML/OIDC, LDAP, SCIM, directory sync, mappings, deprovisioning and admin UX |
| F30 | Work Item Creation, Hierarchy, Lifecycle & Mobility | Partial—improved | Impact preview, promote/demote/re-parent UI, checklist conversion, subtree restore, advanced move mappings/rollback |
| F31 | Advanced WQL, Schemes & Screens | Partial | Complete query grammar/functions, autocomplete/explain, saved/shared queries, screen/field/workflow schemes |
| F32 | Lookup, Mirror, Rollup & Relationship Calculations | Missing/very limited | Lookup/mirror fields, relationship rollups, dependency-aware recalculation, permission-safe formulas |
| F33 | Scenario Planning, Draft Plans & Advanced Roadmaps | Partial | Non-destructive draft scenarios, compare/publish, baseline variance, capacity and dependency simulations |
| F34 | Asana/Jira/ClickUp Migration Assistants | Missing | Vendor-specific importers, mapping assistant, user/status/custom-field/subtask/attachment migration, reconciliation report |
| F35 | DevOps Lifecycle & Engineering Intelligence | Partial | Commit/branch/PR/deployment traceability, environments, deployment status, cycle/lead intelligence, provider adapters |
| F36 | Connected/Federated Search & External Knowledge | Missing | External connectors, federated result security, freshness/index lifecycle, source permission recheck |
| F37 | Administration Sandbox & Configuration Promotion | Partial | Isolated admin sandbox, masked data, config diff/promotion/rollback, approvals and audit |
| F38 | Service Management, SLA, On-call, Incident & CMDB | Missing separate domain | Portal/queues, SLA calendars, on-call/escalation, incident/change/problem, assets/CMDB |
| F39 | Product Discovery, Insights & Prioritisation | Missing separate domain | Ideas/insights, opportunity links, scoring/prioritisation, public roadmap and feedback intake |
| F40 | Native Communications, Email-in-Task, Calendar & Meeting Capture | Partial | Inbound/outbound threaded email, mailbox/calendar sync, meeting capture, ownership/security/delivery logs |
| F41 | Personal Productivity, Mind Map, Map, Reminders & Native Clients | Missing/limited | Reminders, personal planner, mind map/map views, desktop/mobile native clients, offline sync |
| F42 | AI Teammates, Agents & AI Governance | Missing/mock | Agent lifecycle, scoped tools, approval gates, budgets, model/prompt registry, evaluations, audit and data policy |

---

## 6. Asana / Jira / ClickUp comparison — current development ma baki

### Asana jevi simplicity mate

- Task drawer ma complete fields/sections and polished collaboration.
- List ma sections, inline editing, column control, saved tabs/views and bulk actions.
- My Work, Inbox, project status updates, forms/rules/templates, goals/portfolios/workload na consistent simple UX.
- Multiple-project placement with clear “linking does not grant access” behaviour.
- Same context List ↔ Board ↔ Calendar ↔ Timeline switch karta preserve karvo.

### Jira-class execution mate

- Work type/workflow/field/screen schemes and deterministic migration.
- Mature WQL/JQL-class query editor with autocomplete, functions, explain and saved filters.
- Backlog/sprint/epic/release edge cases, rank concurrency, scope change and historical reports.
- Issue/work-item security level and complete permission matrix.
- DevOps links, version/release intelligence and deployment status.
- Service Management domain F38 separately activate karvo.

### ClickUp-style optional productivity mate

- Nested subtasks display modes and bulk subtask table.
- Task Drawer ma custom fields, checklists, relationships, assigned comments, attachments.
- Strong Docs/Whiteboard/Goals/Time/Forms/Automation cross-linking.
- Hierarchy-based feature inheritance and module-controlled progressive disclosure.
- Personal productivity, reminders and connected communication modules.
- Real AI provider/agents/governance instead of mock provider.

---

## 7. Confirmed error/security register

| Severity | Finding | Status in delivered code |
|---|---|---|
| Critical | Subtask backend existed but normal UX missing | Fixed core create/list UX |
| Critical | Parent validation missing in canonical create | Fixed for task/subtask V1 rules |
| Critical | Generic PATCH could bypass re-parent validation | Fixed; `parentId` removed from generic update DTO/service |
| High | Work item read/activity could leak private-project item with known ID | Fixed on Work Controller paths |
| High | Project list exposed private Project metadata to active non-project members | Fixed; `/projects` is viewer-filtered |
| High | Explicit assignee/owner could be outside or inactive in the Organization | Fixed for core create/update/assign paths |
| High | Board read returned owning items without checking target project access | Fixed |
| High | Board move could target unrelated project/placement or invalid status | Fixed |
| Critical | Board drag/drop direct status update thi open-subtask completion policy bypass thati hati | Fixed; same lifecycle guard, atomic transaction, version/history write added |
| High | Mobility paths lacked complete source/destination access checks | Fixed targeted paths |
| Critical | Parent-only cross-project move could leave children pointing across Projects | Fixed; mapping required or subtree/promote-children |
| High | Subtree move could retain old parent and stale source section placement | Fixed; root detached, descendants preserved, section cleared |
| High | TOTP secret stored plaintext | Fixed with AES-256-GCM |
| High | Parent complete/delete could leave open/orphan subtasks | Fixed by explicit blocking; full policy/impact preview still pending |
| Medium | Runtime Google Fonts dependency conflicted with self-contained/offline core | Removed |
| Medium | README/HANDOFF completion claims conflict with evidence standard | Documentation corrected in this package |
| Medium | AI provider is mock | Open gap |
| Medium | Recovery codes/password reset/verification/rate limiting incomplete | Open gap |
| High | Workflow transition path still updates Work Item status directly and needs the same hierarchy/version/history/access contract | Open; release-blocking permission/lifecycle sweep item |
| Medium | Many screens are thin and inline-style-heavy | Open; core shell/project/task/board redesigned first |

---

## 8. Required acceptance run before deployment

```bash
corepack enable
pnpm install --frozen-lockfile

# Type/build
pnpm typecheck
pnpm build

# Database/API tests
pnpm --filter @pm/db migrate
pnpm --filter @pm/api test

# Browser tests
pnpm --filter @pm/web e2e
```

Additional mandatory checks:

- Fresh Postgres/Redis/MinIO stack.
- Private project adversarial ID tests.
- Parent/subtask concurrent create/re-parent/deletion race tests.
- Mobile widths 360/768/1024/1440.
- Keyboard-only and screen-reader run.
- axe automated accessibility scan.
- Isolated backup restore drill.
- Full endpoint permission matrix and export/search leakage tests.

---

## 9. Recommended next implementation order

1. **Run and repair full build/tests** for this patch.
2. **Complete Phase 2B/2C hierarchy acceptance:** re-parent/promote/demote/impact/restore UI and race tests.
3. **Finish Task Drawer:** checklist, attachments, custom fields, tags and followers.
4. **Finish List/Table:** sections, inline edit, columns, bulk, saved views.
5. **Permission/security sweep** across all controllers and background jobs.
6. **Auth production gate:** recovery codes, reset/verify, lockout/rate limit, secure cookie/session revoke.
7. **Then mature Jira/ClickUp advanced modules** according to F31–F42, keeping optional modules hidden until enabled.

