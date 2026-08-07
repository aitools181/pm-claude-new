import { timestamp, integer, uuid } from "drizzle-orm/pg-core";
/**
 * Audit + soft-delete + optimistic-lock columns.
 * Every mutable, organization-owned table spreads these in.
 */
export const auditColumns = {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid("updated_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by"),
    version: integer("version").default(0).notNull(),
};
//# sourceMappingURL=_common.js.map