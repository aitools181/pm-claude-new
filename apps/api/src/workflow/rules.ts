import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";

type Rule = { ruleType: string; kind: string; config: any };

/** Conditions decide if a transition is OFFERED to a user (silent skip if false). */
export async function conditionPasses(db: Database, organizationId: string, userId: string, workItemId: string, rule: Rule): Promise<boolean> {
  switch (rule.kind) {
    case "role": {
      const [r] = await db.select().from(schema.userRoleAssignments).where(and(
        eq(schema.userRoleAssignments.organizationId, organizationId),
        eq(schema.userRoleAssignments.userId, userId),
        eq(schema.userRoleAssignments.roleKey, rule.config?.roleKey))).limit(1);
      return !!r;
    }
    case "assignee_set": {
      const [a] = await db.select().from(schema.workItemAssignees).where(and(
        eq(schema.workItemAssignees.organizationId, organizationId), eq(schema.workItemAssignees.workItemId, workItemId))).limit(1);
      return !!a;
    }
    default: return true;
  }
}

/** Validators must hold for a transition to SUCCEED — failure returns a precise reason. */
export async function validatorReason(db: Database, organizationId: string, workItemId: string, rule: Rule): Promise<string | null> {
  switch (rule.kind) {
    case "field_required": {
      const key = rule.config?.fieldKey;
      const [def] = await db.select().from(schema.customFieldDefinitions).where(and(eq(schema.customFieldDefinitions.organizationId, organizationId), eq(schema.customFieldDefinitions.key, key))).limit(1);
      if (!def) return `Required field "${key}" is not defined`;
      const [val] = await db.select().from(schema.customFieldValues).where(and(eq(schema.customFieldValues.workItemId, workItemId), eq(schema.customFieldValues.fieldId, def.id))).limit(1);
      if (!val) return `Field "${key}" must be set before this transition`;
      return null;
    }
    case "comment_required": {
      const [c] = await db.select().from(schema.comments).where(and(eq(schema.comments.organizationId, organizationId), eq(schema.comments.workItemId, workItemId))).limit(1);
      return c ? null : "A comment is required before this transition";
    }
    default: return null;
  }
}

/** Post-actions apply side effects after a successful transition. */
export async function applyPostAction(db: Database, organizationId: string, userId: string, workItemId: string, rule: Rule) {
  switch (rule.kind) {
    case "assign_actor":
      await db.insert(schema.workItemAssignees).values({ organizationId, workItemId, userId }).onConflictDoNothing();
      break;
    case "set_progress":
      await db.update(schema.workItems).set({ progress: Number(rule.config?.progress ?? 0) }).where(eq(schema.workItems.id, workItemId));
      break;
  }
}
