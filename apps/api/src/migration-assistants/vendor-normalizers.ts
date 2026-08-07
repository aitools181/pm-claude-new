export type Vendor = "asana" | "jira" | "clickup";
export type NormalizedItem = {
  sourceId: string; sourceKey?: string; sourceUrl?: string; title: string; description?: string;
  projectSourceId?: string; parentSourceId?: string; type: "task" | "subtask"; status?: string;
  priority?: string; ownerEmail?: string; dueDate?: string; startDate?: string; archived?: boolean;
  raw: Record<string, unknown>; unsupported: string[];
};
export type NormalizedExport = { items: NormalizedItem[]; projects: Array<{ sourceId: string; name: string; key?: string }>; users: Array<{ sourceId: string; email?: string; name?: string }>; supported: string[]; unsupported: string[] };

const text = (v: unknown) => typeof v === "string" ? v : v == null ? undefined : String(v);
const arr = (v: unknown) => Array.isArray(v) ? v : [];

export function normalizeVendorExport(vendor: Vendor, source: Record<string, unknown>): NormalizedExport {
  if (vendor === "asana") {
    const projects = arr(source.projects).map((p: any) => ({ sourceId: text(p.gid ?? p.id)!, name: text(p.name) ?? "Imported project", key: text(p.key) }));
    const users = arr(source.users).map((u: any) => ({ sourceId: text(u.gid ?? u.id)!, email: text(u.email), name: text(u.name) }));
    const tasks = arr(source.tasks).map((t: any): NormalizedItem => ({ sourceId: text(t.gid ?? t.id)!, sourceUrl: text(t.permalink_url), title: text(t.name) ?? "Untitled", description: text(t.notes), projectSourceId: text(t.project_gid ?? t.projects?.[0]?.gid ?? t.projects?.[0]), parentSourceId: text(t.parent_gid ?? t.parent?.gid), type: t.parent_gid || t.parent ? "subtask" : "task", status: t.completed ? "Done" : "To Do", priority: text(t.priority), ownerEmail: text(t.assignee?.email), dueDate: text(t.due_on), startDate: text(t.start_on), archived: Boolean(t.archived), raw: t, unsupported: ["rules", "forms", "goals"].filter((k) => t[k] != null) }));
    return { projects, users, items: tasks, supported: ["projects", "users", "tasks", "subtasks", "dates", "assignees", "comments", "attachments"], unsupported: ["portfolio_sharing_rules", "native_rules_execution"] };
  }
  if (vendor === "jira") {
    const projects = arr(source.projects).map((p: any) => ({ sourceId: text(p.id ?? p.key)!, name: text(p.name) ?? "Imported project", key: text(p.key) }));
    const users = arr(source.users).map((u: any) => ({ sourceId: text(u.accountId ?? u.id)!, email: text(u.emailAddress ?? u.email), name: text(u.displayName ?? u.name) }));
    const issues = arr(source.issues).map((i: any): NormalizedItem => { const f = i.fields ?? i; const issueType = text(f.issuetype?.name ?? f.issueType) ?? "Task"; return { sourceId: text(i.id ?? i.key)!, sourceKey: text(i.key), sourceUrl: text(i.self), title: text(f.summary) ?? "Untitled", description: text(f.description), projectSourceId: text(f.project?.id ?? f.project?.key), parentSourceId: text(f.parent?.id ?? f.parent?.key), type: /sub.?task/i.test(issueType) ? "subtask" : "task", status: /done|closed|resolved/i.test(text(f.status?.name) ?? "") ? "Done" : /progress/i.test(text(f.status?.name) ?? "") ? "In Progress" : "To Do", priority: (text(f.priority?.name) ?? "normal").toLowerCase(), ownerEmail: text(f.assignee?.emailAddress), dueDate: text(f.duedate), startDate: text(f.startdate), archived: false, raw: i, unsupported: ["issueSecurity", "serviceDesk", "advancedRoadmaps"].filter((k) => f[k] != null) }; });
    return { projects, users, items: issues, supported: ["projects", "issues", "subtasks", "statuses", "priorities", "users", "sprints", "releases", "comments", "attachments"], unsupported: ["custom_jql_functions", "marketplace_app_payloads"] };
  }
  const spaces = arr(source.spaces);
  const projects = [...arr(source.projects), ...spaces].map((p: any) => ({ sourceId: text(p.id)!, name: text(p.name) ?? "Imported project", key: text(p.key) }));
  const users = arr(source.users).map((u: any) => ({ sourceId: text(u.id)!, email: text(u.email), name: text(u.username ?? u.name) }));
  const tasks = arr(source.tasks).map((t: any): NormalizedItem => ({ sourceId: text(t.id)!, sourceKey: text(t.custom_id), sourceUrl: text(t.url), title: text(t.name) ?? "Untitled", description: text(t.description ?? t.text_content), projectSourceId: text(t.project?.id ?? t.list?.id ?? t.space?.id), parentSourceId: text(t.parent), type: t.parent ? "subtask" : "task", status: /complete|closed|done/i.test(text(t.status?.status ?? t.status) ?? "") ? "Done" : /progress|active/i.test(text(t.status?.status ?? t.status) ?? "") ? "In Progress" : "To Do", priority: text(t.priority?.priority ?? t.priority)?.toLowerCase(), ownerEmail: text(t.assignees?.[0]?.email), dueDate: t.due_date ? new Date(Number(t.due_date)).toISOString().slice(0, 10) : undefined, startDate: t.start_date ? new Date(Number(t.start_date)).toISOString().slice(0, 10) : undefined, archived: Boolean(t.archived), raw: t, unsupported: ["dependencies", "automations", "relationships"].filter((k) => t[k] != null) }));
  return { projects, users, items: tasks, supported: ["spaces", "projects", "lists", "tasks", "subtasks", "statuses", "custom_fields", "comments", "attachments"], unsupported: ["native_dashboards", "whiteboards", "clips"] };
}
