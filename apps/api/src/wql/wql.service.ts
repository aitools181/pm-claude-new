import { Injectable, Inject } from "@nestjs/common";
import { and, or, not, eq, ne, gt, lt, gte, lte, ilike, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
import { ConfigService, type ConfigDoc } from "../config-export/config.service.js";
import { sha256 } from "../common/crypto.js";
import { parseWql, WQL_FIELDS, type Node } from "./wql.js";

const wi = schema.workItems;
const COLUMN = {
  status: wi.status,
  status_category: wi.statusCategory,
  priority: wi.priority,
  title: wi.title,
  description: wi.description,
  owner: wi.primaryOwnerUserId,
  reporter: wi.reporterUserId,
  project: wi.owningProjectId,
  parent: wi.parentId,
  key: wi.key,
  created: wi.createdAt,
  updated: wi.updatedAt,
  due: wi.dueDate,
  start: wi.startDate,
  progress: wi.progress,
  estimate: wi.estimateMinutes,
  story_points: wi.storyPoints,
  sprint: wi.sprintId,
} as const;
const RESULT_LIMIT = 500;

function relDate(v: string): Date {
  const m = /^(-?\d+)([dhw])$/.exec(v);
  if (!m) return new Date(v);
  const n = Number(m[1]); const unit = m[2];
  const ms = unit === "d" ? 864e5 : unit === "h" ? 36e5 : 6048e5;
  return new Date(Date.now() + n * ms);
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
function diff(before: unknown, after: unknown, path = ""): { path: string; before: unknown; after: unknown }[] {
  if (stable(before) === stable(after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) || Array.isArray(after)) return [{ path: path || "$", before, after }];
  const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], path ? `${path}.${k}` : k));
}

@Injectable()
export class WqlService {
  constructor(@Inject(DB) private readonly db: Database, private readonly config: ConfigService) {}

  private resolveValue(field: string, value: unknown, userId: string): unknown {
    if (value && typeof value === "object" && "fn" in (value as object)) {
      const fn = (value as { fn: string }).fn;
      if (fn === "currentUser") return userId;
      if (fn === "now") return new Date();
      if (fn === "today") { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; }
      if (fn === "startOfWeek") { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; }
      throw new AppError("VALIDATION", `Unknown function ${fn}()`);
    }
    if (["created", "updated", "due", "start"].includes(field) && typeof value === "string") return relDate(value);
    if (["progress", "estimate", "story_points"].includes(field) && typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (["has_children", "blocked"].includes(field) && typeof value === "string") return value.toLowerCase() === "true";
    return value;
  }

  private compare(col: any, op: string, v: unknown): SQL | undefined {
    switch (op) {
      case "=": return v === null ? isNull(col) : eq(col, v as never);
      case "!=": return v === null ? not(isNull(col)) : ne(col, v as never);
      case ">": return gt(col, v as never);
      case "<": return lt(col, v as never);
      case ">=": return gte(col, v as never);
      case "<=": return lte(col, v as never);
      case "~": return ilike(col, `%${String(v)}%`);
      case "IN": return inArray(col, v as never[]);
      default: throw new AppError("VALIDATION", `Unsupported operator ${op}`);
    }
  }

  private toCondition(org: string, node: Node, userId: string): SQL | undefined {
    if (node.type === "and") return and(...node.nodes.map((n) => this.toCondition(org, n, userId)).filter(Boolean) as SQL[]);
    if (node.type === "or") return or(...node.nodes.map((n) => this.toCondition(org, n, userId)).filter(Boolean) as SQL[]);
    if (node.type === "not") { const c = this.toCondition(org, node.node, userId); return c ? not(c) : undefined; }
    if (node.type !== "cmp") throw new AppError("VALIDATION", "Invalid query node");
    const v = this.resolveValue(node.field, node.value, userId);
    if (node.field === "type") {
      if (node.op === "IN" && Array.isArray(v)) return sql`${wi.typeId} in (select id from work_item_types where organization_id = ${org} and key in (${sql.join(v.map((x) => sql`${String(x)}`), sql`, `)}))`;
      if (!["=", "!="].includes(node.op)) throw new AppError("VALIDATION", "Type supports =, != and IN");
      const exists = sql`exists (select 1 from work_item_types t where t.id = ${wi.typeId} and t.organization_id = ${org} and t.key = ${String(v)})`;
      return node.op === "=" ? exists : not(exists);
    }
    if (node.field === "has_children") {
      const exists = sql`exists (select 1 from work_items c where c.organization_id = ${org} and c.parent_id = ${wi.id} and c.deleted_at is null)`;
      return v ? exists : not(exists);
    }
    if (node.field === "blocked") {
      const exists = sql`exists (select 1 from work_item_dependencies d join work_items p on p.id = d.predecessor_id where d.organization_id = ${org} and d.successor_id = ${wi.id} and d.deleted_at is null and p.deleted_at is null and p.status_category <> 'done')`;
      return v ? exists : not(exists);
    }
    if (node.field === "changed_by") {
      if (!["=", "!="].includes(node.op)) throw new AppError("VALIDATION", "changed_by supports = and !=");
      const exists = sql`exists (select 1 from activity_events a where a.organization_id = ${org} and a.work_item_id = ${wi.id} and a.actor_user_id = ${String(v)})`;
      return node.op === "=" ? exists : not(exists);
    }
    const col = COLUMN[node.field as keyof typeof COLUMN];
    if (!col) throw new AppError("VALIDATION", `Unknown or inaccessible field '${node.field}'`);
    return this.compare(col, node.op, v);
  }

  private cost(node: Node): number {
    if (node.type === "cmp") return ["title", "description"].includes(node.field) && node.op === "~" ? 12 : ["changed_by", "blocked", "has_children", "type"].includes(node.field) ? 8 : 1;
    if (node.type === "not") return 1 + this.cost(node.node);
    return 1 + node.nodes.reduce((n, child) => n + this.cost(child), 0);
  }

  explain(wql: string) {
    const ast = parseWql(wql);
    const estimatedCost = this.cost(ast);
    return { valid: true, ast, estimatedCost, execution: estimatedCost > 40 ? "async_export_recommended" : "interactive", fields: WQL_FIELDS, functions: ["currentUser()", "now()", "today()", "startOfWeek()"] };
  }

  async run(org: string, userId: string, wql: string, options: { limit?: number; offset?: number } = {}) {
    let ast: Node;
    try { ast = parseWql(wql); } catch (e) { throw new AppError("VALIDATION", e instanceof Error ? e.message : "Invalid query", { code: "wql_parse_error" }); }
    const estimatedCost = this.cost(ast);
    if (estimatedCost > 100) throw new AppError("RATE_LIMITED", "Query cost exceeds the interactive budget; use a narrower query or asynchronous export", { estimatedCost });
    const cond = this.toCondition(org, ast, userId);
    const limit = Math.min(Math.max(1, options.limit ?? 200), RESULT_LIMIT);
    const offset = Math.max(0, options.offset ?? 0);
    const rows = await this.db.select({ id: wi.id, key: wi.key, title: wi.title, description: wi.description, status: wi.status, statusCategory: wi.statusCategory, priority: wi.priority, ownerUserId: wi.primaryOwnerUserId, projectId: wi.owningProjectId, typeId: wi.typeId, parentId: wi.parentId, dueDate: wi.dueDate, startDate: wi.startDate, progress: wi.progress, estimateMinutes: wi.estimateMinutes, storyPoints: wi.storyPoints, updatedAt: wi.updatedAt })
      .from(wi).where(and(eq(wi.organizationId, org), isNull(wi.deletedAt), cond)).limit(limit + 1).offset(offset);
    const visible = [];
    for (const r of rows) if (await canAccessWorkItem(this.db, org, r.id, userId)) visible.push(r);
    return { total: visible.slice(0, limit).length, hasMore: visible.length > limit || rows.length > limit, limit, offset, estimatedCost, results: visible.slice(0, limit) };
  }

  async save(org: string, userId: string, name: string, wql: string) {
    parseWql(wql);
    const [row] = await this.db.insert(schema.savedQueries).values({ organizationId: org, name, wql, createdByUserId: userId }).returning();
    return row;
  }
  listSaved(org: string) { return this.db.select().from(schema.savedQueries).where(eq(schema.savedQueries.organizationId, org)).orderBy(schema.savedQueries.createdAt); }

  async subscribe(org: string, userId: string, savedQueryId: string, input: { schedule?: string; channel?: string; onlyWhenChanged?: boolean; nextRunAt?: string }) {
    const [query] = await this.db.select().from(schema.savedQueries).where(and(eq(schema.savedQueries.organizationId, org), eq(schema.savedQueries.id, savedQueryId))).limit(1);
    if (!query) throw new AppError("NOT_FOUND", "Saved query not found");
    const values = { organizationId: org, savedQueryId, userId, schedule: input.schedule ?? "daily", channel: input.channel ?? "in_app", onlyWhenChanged: input.onlyWhenChanged ?? true, nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : null, enabled: true };
    const existing = await this.db.select().from(schema.querySubscriptions).where(and(eq(schema.querySubscriptions.savedQueryId, savedQueryId), eq(schema.querySubscriptions.userId, userId), eq(schema.querySubscriptions.channel, values.channel))).limit(1).then((r) => r[0]);
    if (existing) return (await this.db.update(schema.querySubscriptions).set(values).where(eq(schema.querySubscriptions.id, existing.id)).returning())[0];
    return (await this.db.insert(schema.querySubscriptions).values(values).returning())[0];
  }
  subscriptions(org: string, userId: string) { return this.db.select().from(schema.querySubscriptions).where(and(eq(schema.querySubscriptions.organizationId, org), eq(schema.querySubscriptions.userId, userId))); }

  async setLayout(org: string, typeKey: string, screen: string, fields: string[]) {
    const safeFields = [...new Set(fields.map((f) => f.trim()).filter(Boolean))];
    const [existing] = await this.db.select().from(schema.screenSchemes).where(and(eq(schema.screenSchemes.organizationId, org), eq(schema.screenSchemes.typeKey, typeKey), eq(schema.screenSchemes.screen, screen))).limit(1);
    if (existing) return (await this.db.update(schema.screenSchemes).set({ fields: safeFields, updatedAt: new Date() }).where(eq(schema.screenSchemes.id, existing.id)).returning())[0];
    return (await this.db.insert(schema.screenSchemes).values({ organizationId: org, typeKey, screen, fields: safeFields }).returning())[0];
  }
  async getLayout(org: string, typeKey: string, screen: string) {
    const [row] = await this.db.select().from(schema.screenSchemes).where(and(eq(schema.screenSchemes.organizationId, org), eq(schema.screenSchemes.typeKey, typeKey), eq(schema.screenSchemes.screen, screen))).limit(1);
    return { typeKey, screen, fields: (row?.fields as string[]) ?? ["title", "status", "priority", "owner"] };
  }

  private async currentSnapshot(org: string) {
    const [config, screens, queries] = await Promise.all([
      this.config.export(org),
      this.db.select().from(schema.screenSchemes).where(eq(schema.screenSchemes.organizationId, org)),
      this.db.select({ name: schema.savedQueries.name, wql: schema.savedQueries.wql }).from(schema.savedQueries).where(eq(schema.savedQueries.organizationId, org)),
    ]);
    return { config, screens: screens.map((x) => ({ typeKey: x.typeKey, screen: x.screen, fields: x.fields })), savedQueries: queries };
  }

  async createBundle(org: string, userId: string, input: { name: string; description?: string; captureCurrent?: boolean; snapshot?: Record<string, unknown> }) {
    const [bundle] = await this.db.insert(schema.configurationBundles).values({ organizationId: org, name: input.name, description: input.description, createdByUserId: userId }).returning();
    if (input.captureCurrent !== false || input.snapshot) return { bundle, version: await this.createBundleVersion(org, userId, bundle.id, { snapshot: input.snapshot, changeSummary: "Initial version" }) };
    return { bundle };
  }

  async createBundleVersion(org: string, userId: string, bundleId: string, input: { snapshot?: Record<string, unknown>; changeSummary?: string }) {
    const [bundle] = await this.db.select().from(schema.configurationBundles).where(and(eq(schema.configurationBundles.organizationId, org), eq(schema.configurationBundles.id, bundleId))).limit(1);
    if (!bundle) throw new AppError("NOT_FOUND", "Configuration bundle not found");
    const snapshot = input.snapshot ?? await this.currentSnapshot(org);
    const checksum = sha256(stable(snapshot));
    const version = bundle.currentVersion + 1;
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.configurationBundleVersions).values({ organizationId: org, bundleId, version, snapshot, checksum, changeSummary: input.changeSummary, createdByUserId: userId }).returning();
      await tx.update(schema.configurationBundles).set({ currentVersion: version, updatedAt: new Date() }).where(eq(schema.configurationBundles.id, bundleId));
      return row;
    });
  }

  async bundleDetail(org: string, id: string) {
    const [bundle] = await this.db.select().from(schema.configurationBundles).where(and(eq(schema.configurationBundles.organizationId, org), eq(schema.configurationBundles.id, id))).limit(1);
    if (!bundle) throw new AppError("NOT_FOUND", "Configuration bundle not found");
    const versions = await this.db.select().from(schema.configurationBundleVersions).where(eq(schema.configurationBundleVersions.bundleId, id)).orderBy(schema.configurationBundleVersions.version);
    const bindings = await this.db.select().from(schema.projectConfigurationBindings).where(eq(schema.projectConfigurationBindings.bundleId, id));
    return { bundle, versions, usage: { projects: bindings.length }, bindings };
  }

  async compareBundleVersions(org: string, bundleId: string, fromVersion: number, toVersion: number) {
    const versions = await this.db.select().from(schema.configurationBundleVersions).where(and(eq(schema.configurationBundleVersions.organizationId, org), eq(schema.configurationBundleVersions.bundleId, bundleId), inArray(schema.configurationBundleVersions.version, [fromVersion, toVersion])));
    const from = versions.find((v) => v.version === fromVersion), to = versions.find((v) => v.version === toVersion);
    if (!from || !to) throw new AppError("NOT_FOUND", "Bundle version not found");
    const changes = diff(from.snapshot, to.snapshot);
    return { fromVersion, toVersion, changes, conflicts: [], impact: { changedPaths: changes.length } };
  }

  async publishBundleVersion(org: string, bundleId: string, version: number) {
    const [row] = await this.db.update(schema.configurationBundleVersions).set({ published: true }).where(and(eq(schema.configurationBundleVersions.organizationId, org), eq(schema.configurationBundleVersions.bundleId, bundleId), eq(schema.configurationBundleVersions.version, version))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Bundle version not found");
    await this.db.update(schema.configurationBundles).set({ status: "published", updatedAt: new Date() }).where(eq(schema.configurationBundles.id, bundleId));
    return row;
  }

  async applyBundle(org: string, userId: string, projectId: string, bundleId: string, version: number) {
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to project");
    const [v] = await this.db.select().from(schema.configurationBundleVersions).where(and(eq(schema.configurationBundleVersions.organizationId, org), eq(schema.configurationBundleVersions.bundleId, bundleId), eq(schema.configurationBundleVersions.version, version), eq(schema.configurationBundleVersions.published, true))).limit(1);
    if (!v) throw new AppError("NOT_FOUND", "Published bundle version not found");
    const snapshot = v.snapshot as { config?: ConfigDoc; screens?: { typeKey: string; screen: string; fields: string[] }[] };
    if (snapshot.config) await this.config.import(org, userId, snapshot.config);
    for (const layout of snapshot.screens ?? []) await this.setLayout(org, layout.typeKey, layout.screen, layout.fields);
    const [existing] = await this.db.select().from(schema.projectConfigurationBindings).where(and(eq(schema.projectConfigurationBindings.organizationId, org), eq(schema.projectConfigurationBindings.projectId, projectId))).limit(1);
    const values = { organizationId: org, projectId, bundleId, bundleVersionId: v.id, appliedByUserId: userId, appliedAt: new Date() };
    const binding = existing ? (await this.db.update(schema.projectConfigurationBindings).set(values).where(eq(schema.projectConfigurationBindings.id, existing.id)).returning())[0] : (await this.db.insert(schema.projectConfigurationBindings).values(values).returning())[0];
    return { binding, applied: { configuration: Boolean(snapshot.config), layouts: snapshot.screens?.length ?? 0 }, checksum: v.checksum };
  }

  metadata() { return { fields: WQL_FIELDS, operators: ["=", "!=", ">", "<", ">=", "<=", "~", "IN"], functions: ["currentUser()", "now()", "today()", "startOfWeek()"], examples: ["owner = currentUser() AND status != Done", "type IN [bug, story] AND blocked = true", "due < today() AND priority IN [high, urgent]", "changed_by = currentUser() AND updated >= -7d"] }; }
}
