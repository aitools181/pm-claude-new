import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
let pool;
export function getDb(databaseUrl) {
    pool ??= new pg.Pool({ connectionString: databaseUrl });
    return drizzle(pool, { schema });
}
export { schema };
export * from "./org-scope.js";
//# sourceMappingURL=index.js.map