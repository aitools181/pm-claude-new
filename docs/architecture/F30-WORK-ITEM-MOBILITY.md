# v3 F30 — Work Item Creation, Hierarchy, Lifecycle & Mobility (backend)

Extends the core work engine with the v3 §9 mobility contract, additively (no changes to the
existing create/update paths). New migration 0024 adds work_item_key_history.

## Delivered
- **Clone / duplicate (§9.12)**: new key + identity, title/description/type/priority copied,
  status reset to initial, owner/dates optional (keep/clear), optional whole-subtree clone with
  depth validation, comments and activity/audit never copied, and a clone event linking the
  source.
- **Promote / demote / re-parent (§9.11, §9.8)**: promote clears parent_id; demote/re-parent
  set it after validating same-project (V1), the parent-child type matrix, no self-parent, no
  ancestor cycle, and that the moved subtree stays within the depth limit (default 5).
- **Rapid bulk entry (§9.13)**: one item per non-empty line with per-row validation; successful
  rows persist and failed rows come back as an editable error report (partial success).
- **Move Work Item Wizard (§9.20)**: controlled cross-project move that mints a new destination
  key, keeps the immutable internal id, records searchable key history (old→new) for redirects,
  relocates the owning placement, supports single/subtree/promote-children handling, offers a
  dry-run impact preview, runs transactionally, and prohibits cross-organization moves.
- Old-key resolution (resolveKey) redirects a retired key to its current item.

## Verification (real Postgres)
Clone produces a new key with reset status and a cloned subtree; demote sets and promote clears
the parent; self-parent, an invalid type pairing, a depth-exceeding move and a cycle are all
rejected; bulk create reports partial success; a cross-project move is dry-runnable, mints a
BET-* key, writes key history, relocates the placement, and the old key resolves to the moved
item; a subtree move relocates children with new keys. All checks pass.
