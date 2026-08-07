# Post-V1 Phase 13 — Optional Chat, Whiteboard & AI Modules

Optional, independently enable/disable and permission-safe modules that never couple core
Work Item writes. **Chat** is complete; whiteboard and the AI assistant follow.

## Optional-module framework
- ModulesService: chat / whiteboard / ai are OFF by default and toggled per organization via
  feature flags. assertEnabled gates every optional-module call, so a disabled module returns
  a module_disabled error and the rest of the product is unaffected.

## Stream 1 — Chat (backend)
- Schema (migration 0021): chat_channels (channel/DM, private, retention window),
  chat_channel_members, chat_messages (threads via parent_message_id, soft delete, and a
  created_work_item_id link for message-to-task).
- Channels/DMs/threads with membership-based access: public channels are open to org members,
  private channels and DMs require membership for both reading and posting.
- Message-to-task: converts a message into an authorised work item (title from the message or
  an override) and links it back; only channel members may convert.
- Retention: per-channel retention windows purge old messages. Capability: chat.use; module
  toggles use organization.settings.manage.

### Verification (real Postgres)
With chat disabled, chat calls are blocked while core work-item creation still succeeds;
enabling it gives channels and threaded replies; a private channel denies a non-member read and
post; message-to-task creates a work item titled from the message and stores the link; a
non-member cannot convert a private message; per-channel retention purges a 40-day-old message
while keeping a recent one; disabling the module again re-blocks chat. Gates — disabling an
optional module leaves core unaffected, and chat conversion creates correct authorised work —
pass.

## Stream 2 — Whiteboard (backend)
- Schema (migration 0022): whiteboards and whiteboard_elements (shape/note/connector/frame/
  text with position/size, jsonb data, soft delete, and a created_work_item_id link).
- Canvas operations: add/move/resize/delete elements; connectors validate that both endpoints
  are connectable elements on the same board (no dangling links).
- Conversion: element-to-task turns a note/shape into an authorised work item (title from the
  element label or an override) with a back-link; frame-to-doc gathers the notes/text inside a
  frame's bounds into a new document. Capability: whiteboard.use; gated by the whiteboard
  optional module.

### Verification (real Postgres)
With whiteboard disabled, board creation is blocked while core work-item creation still
succeeds; enabling it allows a board with shapes/notes/frames; a connector between two elements
is accepted while one with a missing endpoint is rejected; element-to-task creates a work item
titled from the note and links it; frame-to-doc captures exactly the two in-bounds notes into a
document; move and soft-delete work; disabling re-blocks the module. Gates — disabling an
optional module leaves core unaffected, and whiteboard conversion creates correct authorised
work — pass.

## Next in Phase 13
Whiteboard (canvas shapes/notes/connectors/frames with task/doc conversion) and the AI
assistant (provider abstraction/BYOK, permission-aware retrieval with source citations,
human-confirmed mutations with action audit, graceful provider-outage degradation).

## Stream 3 — AI Assistant (backend)
- Schema (migration 0023): ai_settings (provider kind, token budget + usage), ai_action_proposals
  (title, payload, citations, degraded flag, status, created_work_item link), ai_audit_log.
- Provider abstraction: an AiProvider interface with a sandbox-safe deterministic MockAiProvider
  (BYOK/local bind real clients). Health is togglable to exercise outage handling.
- Permission-aware retrieval: keyword search over work items filtered through canAccessWorkItem,
  so the assistant only ever sees items the requesting user can access, and every result carries
  a source object ref (work item id + key) for citation.
- Human-in-the-loop mutations: proposeTask drafts a title (with retrieved citations) and records
  a proposal WITHOUT mutating; a work item is created only on explicit confirmProposal, which
  logs an apply action; rejectProposal never mutates. Token usage is metered against a per-org
  budget, and a provider outage degrades gracefully to a heuristic title (flagged degraded)
  instead of failing. Capability: ai.use; gated by the ai optional module.

### Verification (real Postgres)
With AI disabled, retrieval is blocked and core work is unaffected; enabled, retrieval returns
an accessible item but excludes a private-project item the user can't see, with source refs; a
proposal carries citations and creates no work item until confirmed; confirmation creates the
work item and logs an apply action while rejection mutates nothing; a provider outage produces a
degraded-but-usable proposal; the token budget is enforced; and the audit trail records
retrieval/propose/apply. Gates — AI cannot retrieve inaccessible content and cites sources;
mutation requires explicit confirmation and logs the action; provider outage degrades gracefully;
disabling the module leaves core unaffected — pass.

## Phase 13 backend COMPLETE (3 modules)
Chat, Whiteboard and the AI assistant are implemented as independent, disableable, permission-safe
optional modules, each verified against a real database.

## Frontend — Phase 13 modules
- Modules console (/admin/modules): enable/disable chat, whiteboard and ai per organization.
- Chat (/chat): channel list, messages with threaded replies, and message-to-task; shows a
  graceful "module disabled" state when off.
- Whiteboard (/whiteboard): board picker, a grid canvas rendering positioned notes/shapes/frames,
  add-note, and click-to-convert an element into a task.
- AI assistant (/ai): provider/budget status, a draft-proposal composer (with "use my accessible
  items as context"), and a proposals list with source citations, an AI label, and explicit
  Confirm/Reject — nothing mutates until confirmed.

All routes compile in the production build (48/48). Each surface degrades to a disabled-state
prompt when its module is off, so core navigation is unaffected.

## Phase 13 COMPLETE — backend (3 modules) + frontend, verified against a real database.
