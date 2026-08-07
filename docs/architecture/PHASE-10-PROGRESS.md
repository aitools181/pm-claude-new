# Post-V1 Phase 10 — Docs, Meetings, Request Portal & Proofing

Built in verifiable streams. **Docs / Wiki** is complete; meetings, proofing and the portal
expansion follow.

## Stream 1 — Docs / Wiki ✅ (backend)
- **Schema** (migration `0012`): `documents` (page tree via `parent_id`, workspace scope,
  visibility, current-version pointer), `document_versions` (immutable block-JSON snapshots
  with `restored_from`), `document_links` (the link graph).
- **Versioned autosave**: every save writes a new immutable version; the document points at
  the latest. **Restore** writes a *new* version carrying the chosen version's content —
  history is never mutated.
- **Link graph + backlinks**: embed references inside the block JSON are re-derived into
  `document_links` on every save/restore, so backlinks ("which docs reference this work
  item / this doc") stay accurate; a `backlinksFor(kind,id)` lookup powers reverse links.
- **Permission-aware embeds**: resolving a document projects each embed for the viewer — a
  work-item embed is redacted ("Restricted item") when the viewer can't access the item's
  project; dashboards honour their visibility.
- **Selected-text-to-task**: creates a work item and embeds it back into the document,
  establishing a live backlink. **Capability**: `doc.manage`.

### Verification ✅ (real Postgres)
Creating a doc with an embed syncs one link; editing it away clears the link; restoring v1
produces v3 (`restoredFrom = 1`, three versions total) and **re-establishes the embed so the
backlink is valid again**; the work item's backlink resolves to the doc; after the project is
made private the embed is **allowed for the owner but redacted for a non-member**; a doc→doc
backlink survives a restore; selection-to-task yields a linked, embedded work item. Gates —
*restore creates a new version + backlinks remain valid* and *embedded work respects viewer
permissions* — pass.

## Stream 2 — Meetings ✅ (backend)
- **Schema** (migration `0013`): `meeting_series`, `meetings`, `meeting_agenda_items`,
  `meeting_decisions`, `meeting_attendance`, `meeting_actions`.
- **Meeting workspace data**: recurring series + occurrences; ordered agenda items;
  free-text notes; recorded decisions; attendance (invited/attended/absent, upserted).
- **Action conversion**: a meeting action item **converts into a linked work item** carrying
  its title, assignee (→ `primary_owner_user_id`) and due date; the action is marked
  `converted` with the new `work_item_id`, and re-conversion is rejected. **Capability**:
  `meeting.manage`.

### Verification ✅ (real Postgres)
A weekly series + meeting is created; agenda items sort by position (A before B); a decision
and an attendance upsert (invited → attended) record correctly; converting an action yields a
work item titled "Release notes" owned by the assignee with the due date carried, the action
flips to `converted` with its `work_item_id`, and a second convert is rejected. Gate —
*meeting action creates the correct linked Work Item* — passes.

## Next in Phase 10 ⏳
Meetings (series, agenda, notes, decisions, attendance, **action → work item**); image/PDF
**proofing** (normalised markers tied to an immutable asset version, version compare, **asset
update → reapproval**); request-portal conversations/files + richer status timeline; then the
Phase 10 frontend (docs home/editor/tree, meeting workspace, proofing viewer).

## Stream 3 — Proofing & Portal Expansion ✅ (backend)
- Schema (migration 0014): proof_assets, proof_asset_versions (immutable), proof_markers
  (version-pinned, normalised 0..1 coords), proof_reviews, submission_messages.
- Markers record the exact asset_version + normalised coords, so a new version never moves
  them; old markers stay on their version, the new version starts clean.
- Asset-update reapproval: when reapproval_on_update is set, a new version opens a fresh
  pending review (prior approval superseded); otherwise approval carries over. Version
  compare returns both refs and marker counts.
- Portal expansion: a threaded conversation on a request — public requester posts via the
  opaque ref, agents reply internally, both read one ordered thread. Capability: proof.manage.

### Verification (real Postgres)
Marker on v1 at (0.25,0.5) persists after v2 upload while v2 is clean; an approved asset with
reapproval configured returns to pending on update, an unconfigured one keeps approval;
compare reports 1 vs 0 markers; requester + agent messages return as one ordered thread.
Gates — proof marker remains on exact version/location; asset update triggers configured
reapproval — pass.

## Frontend — Phase 10 COMPLETE
- Docs (/docs): page tree, block editor, save = new version, version history + restore,
  permission-aware embeds, backlinks, create-task-from-doc.
- Meetings (/meetings): agenda, notes, decisions, attendance, action -> linked work item.
- Proofing (/proofing): click-to-drop normalised markers, version selector, resolve,
  approve / request-changes, new-version upload with reapproval prompt.
- Request portal (/requests/[ref], public): status list + conversation thread.

All routes compile (36/36). Phase 10 delivered end-to-end across DB / API / UI.
