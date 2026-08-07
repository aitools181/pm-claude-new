import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems, projects } from "./work.js";

/* ============================================================
 * WORK ITEM MOBILITY — v3 F30 (move key history / redirects)
 * ============================================================ */
export const workItemKeyHistory = pgTable("work_item_key_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  oldKey: text("old_key").notNull(),
  oldProjectId: uuid("old_project_id").references(() => projects.id),
  newKey: text("new_key").notNull(),
  reason: text("reason"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byItem: index("key_history_item_idx").on(t.workItemId), byOldKey: index("key_history_oldkey_idx").on(t.organizationId, t.oldKey) }));
