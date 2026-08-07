# Phase 5 — Automation, Templates, Recurrence, Data Portability

## Part 1 (this increment) ✅ — Automation engine (backend)
Internal triggers only (event / schedule / manual) — no public API/webhooks (Phase 11).

- **WHEN → IF → THEN** rules: event/schedule/manual trigger, conditions
  (payload_equals / always), and an ordered action list.
- **Action registry** (extensible): built-ins `add_comment`, `set_priority`,
  `emit_event`; new kinds register without touching the engine.
- **Idempotency**: a run's `dedupe_key = rule + event id`; dispatching the same
  event twice creates the run once, so side effects never duplicate.
- **Retry**: each step retries up to 3 attempts; **safe replay** re-runs only
  failed/pending steps and never re-executes a step that already succeeded.
- **Loop detection**: causation depth is tracked; beyond the max, the engine stops
  and disables the offending rule (`disabled_reason = loop_detected`).
- **Dry run**: executes with side effects suppressed; steps recorded as `dry_run`.
- **Disable-on-failure**: rules can auto-disable after a failing run.
- Full run/step logs for observability.

## Acceptance tests ✅ (Testcontainers)
Same event twice → one side effect · dry run performs nothing · failing step
retries within a run · fail → replay succeeds without duplicating the succeeded
step's effect · self-emitting rule is detected, stopped, and disabled (runs
bounded) · disable-on-failure disables the rule.

## Next parts ⏳
- Part 2 — **Templates + Recurrence**: project/task/workflow template framework
  (versioned, no silent instance mutation) and recurring tasks with unique,
  timezone-correct occurrences.
- Part 3 — **Import/Export**: CSV/XLSX/JSON import wizard (dry-run, mapping
  profiles, error file) and export jobs with a files manifest (counts/checksums).
- Part 4 — **UI**: automation builder + test + logs, template library, recurrence
  editor, import mapping/preview, export centre.

## Part 2 ✅ — Templates + Recurrence (backend)
- **Templates**: versioned; a published version's content is snapshotted at
  instantiation, so later template edits create new versions and NEVER mutate
  existing instances (template-drift control). Project templates instantiate a
  real project + sections + tasks; provenance recorded in `template_instances`.
- **Recurrence**: recurring rules with frequency/interval/timezone; occurrences
  are **unique per (rule, tz-local date)** and the occurrence key is computed in
  the rule's IANA timezone.

## Part 3 ✅ — Import / Export (backend)
- **Import**: CSV parser + JSON rows, a mapping profile (target ← source), a
  **dry run** that validates every row and produces an error report while
  inserting nothing, and a chunked **run** that inserts valid rows and reports the
  rest.
- **Export**: project export produces JSON datasets plus a **manifest** with
  per-file record counts, byte sizes, and **sha256 checksums** that reconcile with
  the exported bytes.

## Part 4 ✅ — Configuration UI
- **Automation builder**: create rules (event/manual/schedule), add actions,
  toggle enable, **dry-run**, and a **run-log** panel with per-run status and a
  **Replay** button on failed runs.
- **Template library**: author + publish a project template and **instantiate** it
  into a workspace (independent copies).
- **Recurrence editor**: create recurring rules (project, frequency, timezone,
  first run) and "generate due now".
- **Import/Export centre**: paste CSV → dry-run preview (valid count + error rows)
  → import into a project; export a project and view its **checksummed manifest**.

## Acceptance tests ✅ (Testcontainers)
Template instance unaffected by later template versions (no drift) · recurrence
occurrences unique and timezone-correct · import dry-run reports errors and
inserts nothing, real run inserts valid + reports invalid · export manifest counts
and checksums reconcile with the exported content.

**Phase 5 COMPLETE** — automation, templates, recurrence, and data portability,
observable/idempotent and usable from the UI without manual database work.
