import { and, eq, isNull } from "drizzle-orm";
/**
 * Organization isolation is enforced HERE, not in the UI.
 * Every read/write against an org-owned table must go through a scope that
 * injects `organization_id = :ctx` and excludes soft-deleted rows by default.
 *
 * A missing organizationId is a hard error — never a silent full-table query.
 */
export function orgScope(orgColumn, deletedAtColumn, organizationId, extra) {
    if (!organizationId) {
        throw new Error("orgScope: organizationId is required — refusing unscoped query");
    }
    const base = and(eq(orgColumn, organizationId), isNull(deletedAtColumn));
    return extra ? and(base, extra) : base;
}
//# sourceMappingURL=org-scope.js.map