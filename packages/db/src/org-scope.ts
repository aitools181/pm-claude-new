import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Organization isolation is enforced HERE, not in the UI.
 * Every read/write against an org-owned table must go through a scope that
 * injects `organization_id = :ctx` and excludes soft-deleted rows by default.
 *
 * A missing organizationId is a hard error — never a silent full-table query.
 */
export function orgScope(
  orgColumn: PgColumn,
  deletedAtColumn: PgColumn,
  organizationId: string,
  extra?: SQL,
): SQL {
  if (!organizationId) {
    throw new Error("orgScope: organizationId is required — refusing unscoped query");
  }
  const base = and(eq(orgColumn, organizationId), isNull(deletedAtColumn));
  return extra ? (and(base, extra) as SQL) : (base as SQL);
}
