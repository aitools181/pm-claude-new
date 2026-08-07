# Post-V1 Phase 7 — Time, Resource, Forms & Approval Operations

Large phase, built in verifiable streams. **Stream 1 — Time & Timesheets** is complete
(backend); Resource/capacity, Forms, and Approvals follow.

## Stream 1 — Time & Timesheets ✅ (backend)
- **Schema** (migration `0002`): `active_timers` (one running timer per user),
  `time_entries` (committed, source = timer|manual), `timesheets` (weekly state machine);
  additive `work_items.estimate_minutes`.
- **Timer**: start / stop / discard / current — one active timer per user; starting a new
  one stops+logs the previous (switch); stop commits a `time_entry`.
- **Time entries**: manual create / update / delete / list, validated (positive minutes,
  ≤ 1 day) and **guarded against a locked week**.
- **Weekly timesheet state machine**: `open → submitted → approved → locked`,
  `submitted → rejected → open`, and admin `reopen`. Empty timesheets can't be submitted;
  transitions are enforced and concurrency-safe.
- **Reconciliation**: a week's total is the sum of its entries — timer and manual both feed
  the same `time_entries`, so totals reconcile by construction.
- **Reports**: aggregated minutes (and billable) by user/project over a date range.
- **Capabilities**: `time.log`, `timesheet.approve`.

### Verification ✅ (real Postgres, in-sandbox)
Timer stop logs a 30-min entry and clears; manual entry logs; **week total = entries sum =
summary total (120=120)**; `submitted→approved→locked`; **locked week blocks create &
update**; invalid transition blocked; **reopen unlocks**; report total correct. All green.
(Testcontainers suite added for CI.)

## Stream 2 — Resource: capacity / leave / allocation ✅ (backend)
- **Schema** (migration `0003`): `capacity_profiles` (per-user hours/day + optional
  working-days override), `leaves` (time off), `allocations` (person → project, period,
  percent).
- **Capacity engine** (pure `computeCapacity`, DB-backed `ResourceService.workload`):
  - uses the **work calendar** (working days exclude weekends + holidays; holidays counted
    separately),
  - subtracts **approved leave** on working days,
  - reports **estimated assigned work** and **unestimated assigned items separately**,
  - computes allocation load and utilization %, flags over-allocation.
- **Allocation planner**: create/list/delete allocations; **team view** aggregates every
  member's workload over a range.
- **Leave**: request / list / approve / cancel. **Profiles**: get / set hours-per-day.
- **Capability**: `resource.manage`.

### Verification ✅ (real Postgres)
Over a Mon–Sun range with a mid-week holiday, one leave day, a 50% allocation, and two
assigned items (one estimated, one not): workingDays=4, holidayDays=1, leaveDays=1,
**net capacity 1440**, allocated 960, **estimated 300**, **unestimated 1 (separate)**.
Gate — *capacity reflects work calendar, leave and unestimated work separately* — met.

## Stream 3 — Forms: builder / branching / versioning / routing ✅ (backend)
- **Schema** (migration `0004`): `forms` (draft fields/routing + public token),
  `form_versions` (immutable published snapshots), `form_submissions` (answers, routed
  work item, requester ref).
- **Builder + versioning**: edit a draft (fields, routing, default target); **publish**
  snapshots it into an immutable numbered version; submissions bind to a version.
- **Conditional branching** (pure `form-logic`): `visibleWhen` hides fields and
  de-requires them; validation only enforces **visible** required fields.
- **Routing**: first matching rule wins (else default target); a submission **creates a
  work item** in the routed project with an interpolated title (`{field}` tokens).
- **Internal + public submission**: public via an opaque token, with an **in-memory
  per-IP rate limiter** and a **pluggable CAPTCHA verifier** (dev = allow-all).
- **Requester portal**: submissions retrievable only by their opaque `requesterRef`
  (IDOR-safe). **Capability**: `form.manage`.

### Verification ✅ (real Postgres)
Publish v1; `category=bug` routes to the Bugs project with title `BUG: {title}`;
`category=task` routes to the default project (severity hidden, not required); a missing
**visible** required field is rejected; public submit routes and returns a ref; the **6th
public submit from one IP is blocked** while another IP passes; a requester sees only their
own submission; **v2 reroutes** the same answers. All branch/routing fixtures create the
expected item — gate met.

## Stream 4 — Approvals: models / delegation / escalation / reapproval ✅ (backend)
- **Schema** (migration `0005`): `approval_definitions`, `approval_requests`,
  `approval_stages`, `approval_decisions`, `approval_events` (history).
- **Models**: `mode` sequential (one stage active at a time, advances on approval) or
  parallel (all stages active); per-stage `rule` **any** (one approver suffices) or
  **all** (every approver must approve); any rejection rejects the request.
- **Delegation**: an approver hands their pending slot to a substitute, who then appears in
  the queue and can decide on their behalf.
- **Escalation**: overdue active stages gain the request's fallback approver (with an event).
- **Field lock + reapproval**: an active/approved request locks configured fields;
  changing a locked field under `on_locked_change` **reopens** the request for a new round.
- **History + queue**: full event log; per-user pending-decision queue (direct + delegated).
- **Capability**: `approval.manage` (deciding is authorized by being an approver/delegate).

### Verification ✅ (real Postgres)
Sequential all→any approves; a rejection rejects; parallel-any approves once every stage
resolves; a delegate can decide; a locked field reads locked (others don't); a locked-field
change reopens (round 2) while a non-locked change doesn't; an overdue stage gains the
escalation approver + event. **All approval models, delegation and reapproval policies pass.**

---

## Phase 7 backend COMPLETE ✅ (4 streams) — frontend next
Time & timesheets · Resource/capacity · Forms · Approvals — all built and verified against a
real database. Remaining: the Phase 7 **frontend** (timer widget, weekly timesheet, workload
board, form builder + public form + request portal, approval queue/panel).
- Resource: working hours, leave, capacity, workload & allocation planner.
- Forms: builder, conditional branching, versioning, routing, internal/public submission.
- Approvals: sequential/parallel/any/all models, reminders, escalation, history,
  field/file lock & reapproval.
- Then the Phase 7 frontend (timer widget, timesheet, workload, form builder/portal, approval queue).

## Frontend ✅ — Phase 7 COMPLETE
- **Time** (`/time`): live timer widget (start/stop/discard, ticking elapsed), weekly
  timesheet with per-day totals, manual entry add/delete, and submit — read-only once
  submitted/approved/locked.
- **Workload** (`/workload`): team capacity board over a date range — utilisation bars,
  net capacity, leave/holiday, allocated vs estimated, and unestimated-item flags; falls
  back to a personal view without the resource capability.
- **Approvals** (`/approvals`): personal decision queue, request panel with stages +
  approver slots, approve/reject with comment, delegate to a substitute, and full history.
- **Forms** (`/admin/forms`): builder for fields (type, required, options, conditional
  visibility) and routing rules, default target, publish, and one-click **public link**;
  submissions list.
- **Public form** (`/f/[token]`) and **request portal** (`/requests/[ref]`): unauthenticated
  pages — the public form respects conditional visibility and, on submit, returns a tracking
  link; the portal shows that requester's submission statuses only.

All routes compile in the production build (29/29). **Phase 7 delivered end-to-end** across
DB / API / UI, verified against a real database.
