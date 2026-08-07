import { pgTable, uuid, text, doublePrecision, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems } from "./work.js";

/* ============================================================
 * WHITEBOARD — Phase 13 (optional module: canvas + conversion)
 * ============================================================ */
export const whiteboards = pgTable("whiteboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("whiteboards_org_idx").on(t.organizationId) }));

export const whiteboardElements = pgTable("whiteboard_elements", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  whiteboardId: uuid("whiteboard_id").notNull().references(() => whiteboards.id),
  kind: text("kind").notNull(),                         // shape|note|connector|frame|text
  x: doublePrecision("x").default(0).notNull(),
  y: doublePrecision("y").default(0).notNull(),
  w: doublePrecision("w").default(120).notNull(),
  h: doublePrecision("h").default(80).notNull(),
  data: jsonb("data").default({}).notNull(),            // {label,text,color,fromId,toId,frameId,...}
  createdWorkItemId: uuid("created_work_item_id").references(() => workItems.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byBoard: index("whiteboard_elements_board_idx").on(t.whiteboardId) }));
