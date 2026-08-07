import { type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
/**
 * Organization isolation is enforced HERE, not in the UI.
 * Every read/write against an org-owned table must go through a scope that
 * injects `organization_id = :ctx` and excludes soft-deleted rows by default.
 *
 * A missing organizationId is a hard error — never a silent full-table query.
 */
export declare function orgScope(orgColumn: PgColumn, deletedAtColumn: PgColumn, organizationId: string, extra?: SQL): SQL;
