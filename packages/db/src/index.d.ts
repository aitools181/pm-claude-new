import * as schema from "./schema/index.js";
export declare function getDb(databaseUrl: string): import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("pg").Pool;
};
export type Database = ReturnType<typeof getDb>;
export { schema };
export * from "./org-scope.js";
