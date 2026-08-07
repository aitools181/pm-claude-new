# Phase 2 — Workspace, Project, Core Work Item MVP

## Part 1 (this increment) ✅ — Backend engine
- **Workspaces / departments** with membership.
- **Projects**: owner, team, status, health, privacy (workspace|private), dates,
  and a per-project monotonic key sequence. Object-level access: workspace-
  visible vs private (membership required). Optimistic update; soft delete.
- **Sections** (per project, lexically ranked).
- **Unified Work Item engine** with the binding invariants:
  - exactly one **immutable** `owning_project_id` (no update path exposes it);
  - exactly one **active owning placement** (partial unique index enforces it);
  - atomic Work Item + owning placement creation;
  - per-project key generation (`ENG-1`, `ENG-2`…) under a row lock;
  - **optimistic locking** (version precondition → 409 on stale writes);
  - status → status-category mapping; primary owner + reporter;
  - subtask hierarchy (parent_id); assignees/contributors, tags, checklists;
  - soft delete + restore;
  - **activity events** on every core mutation (distinct from security audit).
- REST: workspaces, projects (+overview), work-items CRUD, assignees,
  list-by-project with pagination — all behind session + org-context + capability
  guards, plus private-project access checks.

## Acceptance tests ✅ (Testcontainers, real Postgres)
Sequential/unique keys · exactly-one owning placement · immutable owning project ·
stale optimistic update rejected · status-category mapping · org isolation ·
soft delete/restore · activity recorded · private-project access control.

## Part 2 (NEXT) ⏳ — Frontend + E2E
Quick Create, Project Overview, List MVP, Task Drawer, inline fields, empty/error
states; Playwright E2E for the create→assign→execute→complete slice.

## Part 2 ✅ — Frontend + E2E
- Projects list with workspace + project creation (key prefix, privacy).
- Project Overview: header (key, status/health, privacy, item count), List MVP.
- Quick Create (add a task inline, Enter to save).
- Task Drawer (slide-over): inline title/description/progress, status + priority,
  optimistic save with a friendly 409-conflict recovery, and the activity feed.
- Robust org-context resolution in the API client (no switcher race).
- Playwright E2E: create project → quick-create task → open drawer → mark Done.

**Phase 2 COMPLETE** — Create → Assign → Execute → Complete works across
DB / API / UI with permission, concurrency, and isolation tests; no fake persistence.
