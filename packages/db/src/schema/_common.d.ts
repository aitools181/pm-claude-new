/**
 * Audit + soft-delete + optimistic-lock columns.
 * Every mutable, organization-owned table spreads these in.
 */
export declare const auditColumns: {
    createdAt: import("drizzle-orm").NotNull<import("drizzle-orm").HasDefault<import("drizzle-orm/pg-core").PgTimestampBuilderInitial<"created_at">>>;
    createdBy: import("drizzle-orm/pg-core").PgUUIDBuilderInitial<"created_by">;
    updatedAt: import("drizzle-orm").NotNull<import("drizzle-orm").HasDefault<import("drizzle-orm/pg-core").PgTimestampBuilderInitial<"updated_at">>>;
    updatedBy: import("drizzle-orm/pg-core").PgUUIDBuilderInitial<"updated_by">;
    deletedAt: import("drizzle-orm/pg-core").PgTimestampBuilderInitial<"deleted_at">;
    deletedBy: import("drizzle-orm/pg-core").PgUUIDBuilderInitial<"deleted_by">;
    version: import("drizzle-orm").NotNull<import("drizzle-orm").HasDefault<import("drizzle-orm/pg-core").PgIntegerBuilderInitial<"version">>>;
};
