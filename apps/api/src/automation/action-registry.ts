import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";

export type ActionContext = {
  db: Database; organizationId: string; actorUserId: string | null;
  payload: any; dryRun: boolean; depth: number;
  emit: (eventName: string, payload: any) => Promise<void>;
};
export type ActionExecutor = (ctx: ActionContext, config: any) => Promise<unknown>;

/** Registry of THEN actions. Internal only (no webhooks/public API in Phase 5). */
@Injectable()
export class ActionRegistry {
  private map = new Map<string, ActionExecutor>();
  constructor() {
    this.register("add_comment", async (ctx, config) => {
      if (ctx.dryRun) return { would: "add_comment", body: config?.body };
      const workItemId = config?.workItemId ?? ctx.payload?.workItemId;
      await ctx.db.insert(schema.comments).values({ organizationId: ctx.organizationId, workItemId, authorUserId: ctx.actorUserId!, body: config?.body ?? "" });
      return { commented: true };
    });
    this.register("set_priority", async (ctx, config) => {
      if (ctx.dryRun) return { would: "set_priority", priority: config?.priority };
      const workItemId = config?.workItemId ?? ctx.payload?.workItemId;
      await ctx.db.update(schema.workItems).set({ priority: config?.priority ?? "normal" })
        .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, ctx.organizationId)));
      return { priority: config?.priority };
    });
    this.register("emit_event", async (ctx, config) => {
      if (ctx.dryRun) return { would: "emit_event", eventName: config?.eventName };
      await ctx.emit(config?.eventName, config?.payload ?? ctx.payload);
      return { emitted: config?.eventName };
    });
  }
  register(kind: string, fn: ActionExecutor) { this.map.set(kind, fn); }
  get(kind: string): ActionExecutor | undefined { return this.map.get(kind); }
}
