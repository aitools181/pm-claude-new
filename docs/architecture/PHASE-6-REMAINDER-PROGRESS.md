# Post-V1 Phase 6-remainder — Full Planning

Completes the planning capabilities V1 deferred: full Gantt hierarchy, baselines,
critical path, automatic scheduling, cross-project planning, and cascading
reschedule (preview → confirm → undo).

## Backend / domain (this increment) ✅
- **Schema**: `work_items.duration_days` + `schedule_mode` (manual|auto);
  `reschedule_operations` (reversible cascade journal). Migration `0001`.
- **Critical Path Method engine** (`SchedulingService.compute`): forward + backward
  pass over the finish-to-start network → earliest/latest start & finish, **slack**,
  and the **critical path**; timezone-safe working-day math (weekends + holidays).
- **Automatic scheduling**: auto-mode items derive start/finish from predecessors and
  the working calendar; manual items keep their fixed dates.
- **Gantt hierarchy rollup**: a parent spans min(child start) .. max(child finish).
- **Cascading reschedule**:
  - **preview** — computes the full downstream impact of moving an item, **persisting
    nothing**; manual successors are surfaced as conflicts rather than moved;
    cross-project items the viewer can't access are redacted.
  - **confirm** — applies the cascade in one transaction and writes a reversible
    journal entry.
  - **undo** — restores the exact pre-cascade dates.
- **Baselines**: capture a schedule snapshot; **variance** reports per-item start/finish
  slippage vs any baseline.

## Verification ✅ (real Postgres, in-sandbox)
- CPM on a diamond network → critical path `A→B→D`, C carries slack (pure unit check).
- preview changes N items with **zero DB writes**; confirm applies and **undo restores
  exactly**; a manual successor is flagged (conflict) and not moved; baseline variance
  reports the injected slip. All green. (Testcontainers suite added for CI.)

## Next ⏳ — Frontend
Full Gantt view (hierarchy bars, critical-path highlight, slack), drag/resize with a
**reschedule impact preview** modal (confirm/undo), baseline capture + variance overlay,
and per-item manual/auto schedule toggle.

## Frontend ✅ (completes Phase 6-remainder)
- **Gantt view** (`/projects/[id]/gantt`): hierarchy-indented bars, **critical-path
  highlight** (red) vs on-schedule (blue), **slack** shown as a trailing block,
  dependency arrows, a "today" line, month grid, and zoom.
- **Reschedule flow**: select a bar → set a new start → **impact preview** modal
  (old → new per item, manual conflicts flagged) → **Confirm & apply** → an **Undo**
  banner (one click reverts the whole cascade). Nothing is written until confirm.
- **Baselines**: capture a baseline; pick one to overlay **ghost bars** at baseline
  dates with per-item **variance** (+/- days) beside each bar.
- **Manual/auto toggle + duration** per item in the side panel (extends the work-item
  update DTO with `scheduleMode` + `durationDays`).

**Phase 6-remainder COMPLETE** — full Gantt, baselines, critical path, automatic
scheduling, cross-project-safe cascading reschedule (preview → confirm → undo), across
DB / API / UI, verified against a real database.
