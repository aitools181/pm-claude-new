import { Global, Module, Inject } from "@nestjs/common";
import { getDb, type Database } from "@pm/db";
import { ENV } from "../config/config.module.js";
import type { Env } from "@pm/shared";

export const DB = Symbol("DB");

@Global()
@Module({
  providers: [
    { provide: DB, useFactory: (env: Env): Database => getDb(env.DATABASE_URL), inject: [ENV] },
  ],
  exports: [DB],
})
export class DbModule {}
