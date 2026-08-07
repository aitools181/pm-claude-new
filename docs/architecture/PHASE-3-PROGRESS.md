# Phase 3 — Collaboration, Files, Board, Inbox, Search

## Part 1 (this increment) ✅ — Collaboration core (backend)
- **Comments** with threads (parent_comment_id), soft delete, author-only delete.
- **Mentions** validated against access: a mention is recorded for everyone, but a
  notification is created ONLY for users who are active org members AND can see the
  work item's owning project (workspace-visible, or a member of a private project).
- **Reactions** (unique per comment/user/emoji) and **assigned action items**.
- **Watchers**: watch/unwatch; watchers are notified on new comments (deduped).
- **Notifications inbox** with an idempotent `dedupe_key` (realtime-reconnect safe),
  unread count, mark-read / mark-all-read, and per-type preferences table.

## Acceptance tests ✅ (Testcontainers)
Mention reaches an authorised member but never a no-access user (and the mention
row is flagged notified=false) · dedupe collapses repeated deliveries · non-member
cannot read or post comments on a private-project item · reactions are unique.

## Next parts ⏳
- Part 2 — **Files**: attachments + versions, single-use **Download Grants** via the
  authenticated gateway, upload limits/checksum, quarantine. (Security-sensitive.)
- Part 3 — **Kanban board**: fractional rank moves, drag/drop persistence, undo;
  same-organization **Linked Placements** with permission intersection.
- Part 4 — **My Work / Inbox / Global Search** MVP + saved views; frontend for
  comments/board/inbox/search; **realtime** (WebSocket auth + channels).

## Part 2 ✅ — Files + Download Grants (security-sensitive)
- Attachments with **versions**, metadata, and quarantine status
  (pending → clean | infected). Objects live in **private** storage under
  org-scoped keys (`org/<org>/wi/<item>/<version>`); no public URL is ever issued.
- **Upload** goes through the authenticated gateway: reserve a pending version +
  a single-use upload grant → stream bytes through the API while hashing →
  verify size + sha256 → clear quarantine (mismatch ⇒ marked infected).
- **Download** goes through the authenticated gateway: issue a single-use,
  short-lived (3 min) grant for a clean, accessible version → redeem streams the
  private object. Grant consumption is atomic (single-use), org-bound, and
  **re-checks live access at redeem time**.
- Upload size limit enforced (50 MB default, configurable).

## Acceptance tests ✅ (Testcontainers)
Grant is single-use (works once, then rejected) · expired grant rejected ·
cross-organization grant cannot be redeemed · no grant for an inaccessible
(private, non-member) file · access re-checked at redeem · oversized upload
rejected · checksum/size mismatch quarantines the version.

## Part 3 ✅ — Kanban board + Linked Placements (backend)
- **Board**: fractional-rank moves across columns; `move` returns the prior
  {status, rank} so **undo** is a faithful re-apply; access-checked; activity logged.
- **Board fetch** groups a project's items (owning + linked) into todo/in_progress/
  done, ordered by rank.
- **Linked Placements** (same org): `link` requires access to BOTH the source item
  and the target project (permission intersection). Linking **does not grant
  access** — linked items are hidden on a board from anyone who can't access the
  item's owning project. The owning placement can never be unlinked.

## Part 4 (backend) ✅ — My Work, Global Search, Realtime
- **My Work**: items owned by or assigned to me, access-filtered.
- **Global Search** MVP across projects, work items, comments — authorised results
  only, respecting privacy and soft-deletes (no leakage).
- **Realtime**: authenticated Socket.IO gateway; a socket binds to a user via the
  session cookie, joins user + membership-verified org rooms. Notifications emit in
  realtime **only when a new inbox row is created**, so reconnects never duplicate.

## Acceptance tests ✅ (Testcontainers)
Board move persists rank/status and undo restores · link needs both accesses &
linking doesn't grant access (hidden on board for non-owning-project viewers) ·
My Work returns assigned items · search returns authorised results only and
respects soft deletes/privacy.

## Part 4 (frontend) ⏳ — NEXT (final Phase 3 turn)
Board UI (drag/drop + undo), Comments panel in the Task Drawer, Inbox with
actionable notifications, global Search palette, My Work — plus the realtime
client subscription. Then the Phase 3 exit gate is fully met end-to-end.

## Part 4 (frontend) ✅ — Board / Inbox / Search / Comments / Realtime client
- **Board view** with native drag-and-drop across To Do / In Progress / Done,
  drop-to-reorder, and an **Undo** toast that re-applies the captured prior state.
  Linked items are badged; List ↔ Board toggle on the project.
- **Task Drawer** now has a **Comments** panel (list + compose) and a **Watch**
  toggle, alongside the activity feed.
- **Inbox** page: mentions/assignments/updates, mark-read and mark-all-read,
  unread styling.
- **Global ⌘K Search palette** mounted app-wide: grouped project/work-item/comment
  results, keyboard-open, navigates on select.
- **My Work** home now lists items you own or are assigned, across projects.
- **Realtime client**: authenticated Socket.IO connection joins the org room and
  live-updates the topbar unread bell + toast when a notification arrives.

**Phase 3 COMPLETE** — collaboration, files (single-use grants), board, linked
placements, inbox, search, and realtime, across DB / API / UI with the exit-gate
tests (mention authorization, grant single-use/expiry/cross-org, board undo,
link permission-intersection, search non-leakage).
