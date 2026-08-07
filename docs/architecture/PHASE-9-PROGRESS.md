# Post-V1 Phase 9 — Goals, Portfolios, Dashboards & Executive Reporting

Built in verifiable streams. **Goals / OKRs** is complete; portfolios, dashboards and
scheduled reports follow.

## Stream 1 — Goals / OKRs ✅ (backend)
- **Schema** (migration `0008`): `goals` (hierarchy via `parent_id`, target types, values,
  confidence, status, due date), `goal_links` (to projects / work items / metrics),
  `goal_updates` (immutable check-in history).
- **Progress engine** (pure `goal-logic`): leaf formulas for percent / numeric / binary;
  **rollup** = average of children; **work-linked** goals derive progress from done/total of
  linked items and projects; precedence rollup > linked-work > leaf.
- **Health & pace**: `expectedProgress` from the elapsed window; `health` blends owner
  confidence with pace (behind-pace → at risk).
- **Check-ins**: each records an immutable `goal_update` (value, computed progress,
  confidence, note) and moves the goal's current value/confidence — full history preserved.
- **Links + redaction**: goals link to projects/work/metrics; on read, links to work items
  or **private projects the viewer can't access are redacted** (name "Restricted", ref
  nulled). **Capability**: `goal.manage` (check-ins allowed to members).

### Verification ✅ (real Postgres)
Percent 60 + numeric 50 roll up to 55; a work-linked goal reads 50% (1 of 2 done); a
check-in appends one history row and sets confidence to at_risk; a private project's name is
visible to the owner but **redacted for a non-member viewer** (ref nulled). Gates —
*rollups match source + update history* and *private names never leak* — pass.

## Stream 2 — Portfolios, Initiatives & Milestones ✅ (backend)
- **Schema** (migration `0009`): `portfolios`, `portfolio_projects`, `initiatives`,
  `initiative_projects`, `milestones`.
- **Cross-project rollup**: an executive table where each project reports done/total,
  progress, and date span; the portfolio aggregate is item-weighted (Σdone / Σtotal).
- **Redaction**: projects the viewer can't access are returned as "Restricted" with **name
  AND metrics nulled**, and their numbers are **excluded from that viewer's aggregate** — so
  private data never leaks into the roll-up.
- **Initiatives** (grouping + status) and **milestones** (due date, hit/missed status,
  overdue detection, completion timestamp); a timeline endpoint returns project spans +
  milestones for the exec view. **Capability**: `portfolio.manage`.

### Verification ✅ (real Postgres)
A portfolio of two projects (1/2 and 2/2 done) rolls up to **75% (3/4)** for a full-access
viewer; after making one project private, a non-member sees it as **Restricted with null
metrics** and their aggregate drops to **50%** (private numbers excluded) while the owner
still sees 75%; a hit milestone and an overdue milestone are summarised correctly; an
initiative's status updates. Gate — *portfolio rollups match source; private metrics never
leak* — passes.

## Stream 3 — Dashboards, Metrics & Drill-down ✅ (backend)
- **Schema** (migration `0010`): `metric_definitions`, `metric_snapshots`, `dashboards`.
- **Metric catalogue**: a fixed, declarative set of sources (work completion, open items,
  average goal progress) — **no arbitrary SQL** (out of scope). Each source ships a
  human-readable **formula** that stays visible on every value.
- **Snapshots + freshness/caching**: computing a definition caches the value with a
  `computedAt`; re-reads within the TTL return the cached value (with an age indicator);
  `refresh` (or a tiny TTL) forces a fresh recompute.
- **Dashboard builder**: dashboards hold a widget list (type, title, metric source, params);
  render computes every widget with its value, unit, **visible formula** and freshness.
- **Drill-down authorization**: a widget drills to its underlying records **filtered to what
  the viewer may access** — private-project items are excluded from the drill.
- **Visibility**: private dashboards are hidden from, and un-renderable by, non-owners.
  **Capability**: `dashboard.manage`.

### Verification ✅ (real Postgres)
`work.done_ratio` = 33% and `work.open_count` = 2 over a 1-done/2-open project; a snapshot
caches (identical `computedAt`) then force-recomputes to a later time; the formula string and
age are always present; a dashboard renders both widgets with formulas; drilling the open-items
widget returns 2 authorised records for the owner but **0 of 2** for a non-member after the
project is made private; a private dashboard is hidden and forbidden to others. Gates —
*widgets drill to authorised records* and *metric freshness + formula visible* — pass.

## Stream 4 — Scheduled Reports & Delivery ✅ (backend)
- **Schema** (migration `0011`): `report_definitions` (kind → dashboard/portfolio/metric,
  format, frequency, recipients, next-run), `report_runs` (status, attempt, error, retry
  time, content summary), `report_deliveries` (per-recipient delivery log).
- **Generation**: a report renders its source (dashboard render / portfolio rollup / metric
  snapshot) as its owner and serialises it — recording a content summary (bytes/format).
- **Delivery** via a **pluggable `Deliverer`** (dev = success; production binds email/webhook).
  Each recipient's outcome is logged.
- **Retry + failure logging**: a failed attempt records the error and a **failed delivery per
  recipient**, then schedules a retry with **linear backoff**; retries continue to
  `maxAttempts` and then the run is marked **failed** (give-up). A recovered deliverer
  succeeds on the next attempt.
- **Scheduler**: `runDue` runs enabled definitions whose next-run time has arrived and
  advances the schedule; `retryDue` re-attempts runs whose retry time has come. History +
  delivery logs are queryable. **Capability**: `report.manage`.

### Verification ✅ (real Postgres)
A report delivers to two recipients (both logged, content summary sized); a failing deliverer
yields `retry_scheduled` with the error and a failed delivery row; repeated retries reach
`maxAttempts` and the run becomes **failed** (further retry rejected); a recovered deliverer
delivers on retry (attempt 2); `runDue` runs an overdue report and advances its `nextRunAt`;
`retryDue` re-attempts a scheduled retry. Gate — *scheduled delivery + failure retry/logging
work* — passes.

---

## Phase 9 backend COMPLETE ✅ (4 streams) — frontend next
Goals/OKRs · Portfolios · Dashboards/metrics · Scheduled reports — all verified against a real
database. Remaining: the Phase 9 **frontend** (goal workspace + check-ins, portfolio views,
dashboard builder/viewer, report scheduling).

Portfolios / initiatives / milestones with cross-project aggregation; dashboard builder +
widget catalogue with drill-down; metric definitions + snapshots/freshness; scheduled
reports with delivery + retry logging; then the Phase 9 frontend.

## Frontend ✅ — Phase 9 COMPLETE
- **Goals workspace** (`/goals`): hierarchical objective/KR tree with progress bars +
  health dots, create objective/key-result, and a detail panel with **check-in** (value,
  confidence, note), linked-object list (redacted-safe), and **update history**.
- **Portfolios** (`/portfolios`): executive rollup KPIs, a project table with progress bars
  (**redacted rows shown as "—"**), add project, milestones (add / mark hit / overdue) and
  initiatives.
- **Dashboards** (`/dashboards`): viewer renders each widget's value with its **visible
  formula** and a **freshness** pill; a builder adds widgets from the metric catalogue
  (with optional project scope); drillable widgets open an authorised-records modal.
- **Reports** (`/reports`): create scheduled reports (target dashboard/portfolio/metric,
  frequency, recipients), **run now**, and a run history with per-run **delivery logs** and
  a **retry** action.

All routes compile in the production build (33/33). **Phase 9 delivered end-to-end** across
DB / API / UI, verified against a real database.

## Frontend ✅ — Phase 9 COMPLETE
- **Goals workspace** (`/goals`): hierarchical objective → key-result tree with progress
  bars, health dots and expected-pace; create objectives/KRs; per-goal **check-in flow**
  (value + confidence + note) with immutable **update history** and redaction-aware links.
- **Portfolios** (`/portfolios`): executive rollup KPIs (overall progress, items done,
  milestones hit/overdue) and a per-project table that shows **Restricted** rows without
  metrics for projects the viewer can't access; add projects, milestones (mark hit) and
  initiatives.
- **Dashboards** (`/dashboards`): a viewer that renders each widget's value with its
  **visible formula** and a **freshness** pill, a builder that adds widgets from the metric
  catalogue (with optional project scope), and **drill-down** to authorised records only.
- **Reports** (`/reports`): create scheduled reports (dashboard/portfolio/metric target,
  frequency, recipients), **run now**, and a run history with per-recipient delivery logs
  and **retry** for failed runs.

All routes compile in the production build (33/33). **Phase 9 delivered end-to-end** across
DB / API / UI, verified against a real database.
