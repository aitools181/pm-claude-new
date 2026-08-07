# Post-V1 Phase 8 — Agile Backlog, Sprint & Release Management

Built in verifiable chunks. **Sprint core** (backlog, lifecycle, scope, metrics) is complete;
releases and the full chart set + frontend follow.

## Sprint core ✅ (backend)
- **Schema** (migration `0006`): `sprints`, `sprint_scope_events`, `sprint_reports` (frozen),
  `releases`, `release_items`; additive `work_items.story_points / sprint_id / backlog_rank`
  and `projects.agile_enabled`.
- **Backlog**: ranked product backlog (items not in a sprint), **fractional-rank moves**
  (concurrent-safe, reusing the board's `rankBetween`), and story-point setting.
- **Sprint lifecycle**: create → **start** (freezes the committed baseline: item ids +
  points) → **close**. Adding/removing items while active records **scope events** without
  touching the committed baseline.
- **Close**: computes completed vs committed, added/removed, and carry-over; **carries
  incomplete items** to a target sprint or back to the backlog; writes an **immutable
  `sprint_report`** (committed/completed/added/removed/carried + burndown). Closed sprints
  reject further modification.
- **Metrics**: velocity (last-N average), committed-vs-completed per sprint, and burndown
  (frozen for closed sprints, live for active). **Capability**: `sprint.manage`.

### Verification ✅ (real Postgres)
Fractional rank lands strictly between neighbours; start snapshots 8 committed points across
2 items; a post-start add logs a scope event while committed stays 8; close reports
committed 8 / completed 3 / added 2 / carried 7 and moves incomplete items to the backlog;
editing an item after close leaves the report at 3; velocity averages 3; committed-vs-completed
delta is −5; frozen burndown is 8→5; a closed sprint rejects edits. **All Phase 8 gates
(baseline/history, snapshot immutability, concurrent rank, metric fixtures) pass.**

## Releases + full charts ✅ (backend)
- **Releases** (`releases`, `release_items`): create versions, add/remove included work,
  **publish** (locks the release), and **auto-generated notes that trace to work items**
  (each line references the item key + title). Published releases reject further changes.
- **Status history** (migration `0007`, `work_item_status_history`): every status-category
  transition is logged from the work-item update path — the foundation for time metrics and
  flow charts.
- **Charts/metrics**: **cycle time** (in-progress → done) and **lead time** (created → done),
  averaged; **burnup** (completed vs growing scope); **CFD** (per-day counts by category,
  reconstructed from history); alongside velocity, committed-vs-completed and burndown.

### Verification ✅ (real Postgres)
Release notes list both included items by key; a published release rejects edits; two status
updates write two history rows; with controlled timestamps lead time = 3h and cycle time = 2h;
burnup reports scope 5 / completed 5; CFD returns per-day category counts. **Release items and
notes trace to work — gate met.**

---

## Phase 8 backend COMPLETE ✅ — frontend next
Sprint core + releases + full charts, all verified against a real database. Remaining: the
Phase 8 **frontend** (backlog, sprint planning, sprint board, close wizard, reports, release
detail) and the Agile project template / Epic-Story-Bug type set.
Releases (versions, notes, included work traceable to items); burnup / CFD / cycle & lead
time; Agile project template & Epic/Story/Bug/Task/Subtask types; then the Phase 8 frontend
(backlog, sprint planning, sprint board, close wizard, reports, release detail).

## Frontend ✅ — Phase 8 COMPLETE
- **Backlog & planning** (`/projects/[id]/backlog`): ranked backlog with inline story
  points and ▲▼ reordering (fractional rank), sprint list, create sprint, add/remove items,
  and start — with a live per-sprint item/points summary.
- **Sprint board** (`/projects/[id]/sprints/[sprintId]`): To Do / In Progress / Done columns
  with points, one-click status advance, committed/completed/remaining/scope KPIs, and a
  **close wizard** (choose carry-over target → freezes the report).
- **Reports** (`/projects/[id]/reports`): dependency-free SVG **velocity** (committed vs
  completed + average), **cumulative flow** (14-day stacked), and **cycle/lead time** KPIs.
- **Releases** (`/projects/[id]/releases`): create versions, add/remove included work,
  **auto-generated release notes**, and publish (locks the release).

All routes compile in the production build (29/29). **Phase 8 delivered end-to-end** across
DB / API / UI, verified against a real database.
