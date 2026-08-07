import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { AuditService } from "../audit/audit.service.js";

/** Portable configuration document: custom fields, custom types, and roles. */
export type ConfigDoc = {
  version: 1;
  fields: any[];
  fieldOptions: any[];
  fieldVisibility: any[];
  types: any[];
  roles: { key: string; name: string; permissions: string[] }[];
};

@Injectable()
export class ConfigService {
  constructor(@Inject(DB) private readonly db: Database, private readonly audit: AuditService) {}

  async export(organizationId: string): Promise<ConfigDoc> {
    const fields = await this.db.select().from(schema.customFieldDefinitions)
      .where(and(eq(schema.customFieldDefinitions.organizationId, organizationId), isNull(schema.customFieldDefinitions.archivedAt)));
    const fieldOptions = await this.db.select().from(schema.customFieldOptions).where(eq(schema.customFieldOptions.organizationId, organizationId));
    const fieldVisibility = await this.db.select().from(schema.customFieldVisibility).where(eq(schema.customFieldVisibility.organizationId, organizationId));
    const types = await this.db.select().from(schema.workItemTypes).where(and(eq(schema.workItemTypes.organizationId, organizationId), eq(schema.workItemTypes.isSystem, false)));

    const roleRows = await this.db.select().from(schema.roles).where(eq(schema.roles.organizationId, organizationId));
    const roles = [];
    for (const role of roleRows) {
      const perms = await this.db.select({ key: schema.rolePermissions.permissionKey }).from(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, role.id));
      roles.push({ key: role.key, name: role.name, permissions: perms.map((p) => p.key) });
    }
    return {
      version: 1,
      fields: fields.map((f) => ({ key: f.key, name: f.name, fieldType: f.fieldType, required: f.required, visibility: f.visibility, config: f.config, scopeType: f.scopeType })),
      fieldOptions: fieldOptions.map((o) => ({ fieldKey: fields.find((f) => f.id === o.fieldId)?.key, value: o.value, label: o.label, rank: o.rank })),
      fieldVisibility: fieldVisibility.map((v) => ({ fieldKey: fields.find((f) => f.id === v.fieldId)?.key, roleKey: v.roleKey })),
      types: types.map((t) => ({ key: t.key, name: t.name, icon: t.icon })),
      roles,
    };
  }

  /** Import into a target org. Idempotent on keys (skips existing). Non-system roles + fields + types. */
  async import(organizationId: string, userId: string, doc: ConfigDoc) {
    return this.db.transaction(async (tx) => {
      const fieldIdByKey = new Map<string, string>();
      for (const f of doc.fields) {
        const [existing] = await tx.select().from(schema.customFieldDefinitions).where(and(eq(schema.customFieldDefinitions.organizationId, organizationId), eq(schema.customFieldDefinitions.key, f.key))).limit(1);
        if (existing) { fieldIdByKey.set(f.key, existing.id); continue; }
        const [ins] = await tx.insert(schema.customFieldDefinitions).values({ organizationId, key: f.key, name: f.name, fieldType: f.fieldType, required: f.required, visibility: f.visibility, config: f.config, scopeType: f.scopeType, createdBy: userId }).returning();
        fieldIdByKey.set(f.key, ins.id);
      }
      for (const o of doc.fieldOptions) {
        const fid = fieldIdByKey.get(o.fieldKey); if (!fid) continue;
        await tx.insert(schema.customFieldOptions).values({ organizationId, fieldId: fid, value: o.value, label: o.label, rank: o.rank }).onConflictDoNothing();
      }
      for (const v of doc.fieldVisibility) {
        const fid = fieldIdByKey.get(v.fieldKey); if (!fid) continue;
        await tx.insert(schema.customFieldVisibility).values({ organizationId, fieldId: fid, roleKey: v.roleKey }).onConflictDoNothing();
      }
      for (const t of doc.types) {
        await tx.insert(schema.workItemTypes).values({ organizationId, key: t.key, name: t.name, icon: t.icon, isSystem: false, createdBy: userId }).onConflictDoNothing();
      }
      for (const role of doc.roles) {
        const [existing] = await tx.select().from(schema.roles).where(and(eq(schema.roles.organizationId, organizationId), eq(schema.roles.key, role.key))).limit(1);
        const roleId = existing?.id ?? (await tx.insert(schema.roles).values({ organizationId, key: role.key, name: role.name, isSystem: "false", createdBy: userId }).returning())[0].id;
        for (const perm of role.permissions) await tx.insert(schema.rolePermissions).values({ organizationId, roleId, permissionKey: perm }).onConflictDoNothing();
      }
      await this.audit.append({ scopeType: "organization", organizationId, actorUserId: userId, action: "configuration.imported", metadata: { fields: doc.fields.length, roles: doc.roles.length, types: doc.types.length } });
      return { imported: { fields: doc.fields.length, roles: doc.roles.length, types: doc.types.length } };
    });
  }
}
