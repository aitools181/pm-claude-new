# Phase 6-essential — Dependencies, Calendar, V1 Planning

V1 guardrails honoured: dependency **conflicts are displayed only** — there is no
cascade service and no dependent-date mutation. Cross-project dependencies never
leak private details.

## Backend / domain (this increment) ✅
- **Dependencies**: predecessor→successor links (finish_to_start + approved set),
  with self-link and duplicate rejection.
- **Circular-dependency detection**: a new edge is rejected if the successor can
  already reach the predecessor (BFS, cycle-safe).
- **Blocked indicators**: an item is blocked while any predecessor is incomplete.
- **Dependency-conflict read model**: finish_to_start conflict when a successor
  starts before its predecessor is due — surfaced as a warning; **nothing is
  rescheduled** (no cascade).
- **Cross-project dependency graph** with **redaction**: neighbours in projects the
  viewer cannot access are returned as `{ redacted:true, title:"Restricted item" }`
  placeholders; real titles never appear in the payload.
- **Working calendars + holidays**: timezone-safe (all-day, UTC-anchored)
  working-day math — `workingDaysBetween` and `addWorkingDays` exclude weekends and
  holidays.
- **Calendar view + ICS export**: access-filtered items in a date range (project or
  "my work") and an RFC-5545 ICS feed (all-day VEVENTs).

## Acceptance tests ✅ (Testcontainers)
Self-link and cycle creation rejected · blocked indicator flips with predecessor
completion · conflict reported with NO cascade (predecessor dates unchanged) ·
private neighbour redacted for non-members (title never leaks), visible to members ·
working-day counts exclude weekends + holidays and add-working-days skips them.

## Next ⏳ — Frontend (completes Phase 6-essential)
Dependency graph view + blocked badges, add/remove dependency in the Task Drawer,
conflict warnings, personal/project calendar (month/week/day/agenda) with ICS
subscribe, working-calendar/holiday admin, and the basic (non-gating) Timeline.
Then the V1 Stable Release Gate.

## Frontend ✅ (completes Phase 6-essential)
- **Dependency graph** page per project: auto-layered SVG graph with edges,
  **blocked** badges, conflict edges highlighted, and **redacted placeholders** for
  private cross-project neighbours; a conflicts banner lists warnings (no cascade).
- **Task Drawer → Dependencies tab**: shows blocked state and links, add a
  "blocks / blocked by" dependency via inline item search, and remove one.
- **Calendar** page: month grid + agenda, scope switch (my work / project),
  month navigation, and **ICS subscribe**.
- **Working Calendars admin** (under Configure): create calendars with working
  days, add holidays, and a working-day counter.
- **Basic Timeline** page (non-gating): start→due bars, milestone diamonds,
  dependency lines, and zoom.

**Phase 6-essential COMPLETE** — dependencies, blocked indicators, cycle
detection, graph, personal/project calendar, working calendars, holidays, ICS, and
a basic timeline, across DB / API / UI, with V1 guardrails (display-only conflicts,
no cascade, no cross-project leakage).

## V1 status
All V1 phases are now implemented: **0 → 1A → 1B → 2 → 3 → 4 → 5 → 5B →
6-essential**. Next milestone is the **V1 Stable Release Gate** (compile/typecheck
fix-up pass, migration generation, full test run, and the roadmap's release
checklist).
