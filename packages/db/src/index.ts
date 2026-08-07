import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

let pool: pg.Pool | undefined;

export function getDb(databaseUrl: string) {
  pool ??= new pg.Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof getDb>;
export { schema };
export * from "./org-scope.js";
