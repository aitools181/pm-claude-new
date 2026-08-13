"use client";


import { Button as UiButton } from "../ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useToast } from "../ui/Toast";
import { Icon, type IconName } from "../ui/Icon";

type FieldKind = "text" | "textarea" | "number" | "select" | "checkbox" | "json" | "tags" | "datetime" | "project";
export type HubField = { key: string; label: string; kind?: FieldKind; placeholder?: string; required?: boolean; options?: { label: string; value: string }[]; defaultValue?: string | number | boolean };
export type HubAction = { label: string; endpoint: string; method?: "POST" | "PATCH"; description: string; fields: HubField[] };
export type HubProps = {
  title: string;
  eyebrow: string;
  description: string;
  icon: IconName;
  overviewEndpoint: string;
  moduleName: string;
  features: string[];
  actions: HubAction[];
};
type Project = { id: string; name: string; keyPrefix?: string };

function collectMetrics(data: unknown) {
  if (Array.isArray(data)) return [{ label: "Records", value: data.length }];
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const metrics: { label: string; value: number | string }[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) metrics.push({ label: key.replace(/([A-Z])/g, " $1"), value: value.length });
    else if (typeof value === "number" || typeof value === "string") metrics.push({ label: key.replace(/([A-Z])/g, " $1"), value });
    else if (value && typeof value === "object" && key.toLowerCase().includes("metric")) for (const [mk, mv] of Object.entries(value as Record<string, unknown>)) if (typeof mv === "number" || typeof mv === "string") metrics.push({ label: mk.replace(/([A-Z])/g, " $1"), value: mv });
  }
  return metrics.slice(0, 6);
}
function collections(data: unknown) {
  if (Array.isArray(data)) return [{ key: "records", rows: data }];
  if (!data || typeof data !== "object") return [];
  return Object.entries(data as Record<string, unknown>).filter(([, value]) => Array.isArray(value)).map(([key, rows]) => ({ key, rows: rows as unknown[] }));
}
function recordTitle(row: unknown, index: number) {
  if (!row || typeof row !== "object") return String(row);
  const o = row as Record<string, unknown>;
  return String(o.name ?? o.title ?? o.key ?? o.address ?? o.role ?? o.kind ?? o.status ?? `Record ${index + 1}`);
}
function recordSub(row: unknown) {
  if (!row || typeof row !== "object") return "";
  const o = row as Record<string, unknown>;
  return [o.status, o.kind, o.provider, o.mode, o.key, o.createdAt].filter(Boolean).map(String).slice(0, 3).join(" · ");
}

export function AdvancedModuleHub(props: HubProps) {
  const toast = useToast();
  const [data, setData] = useState<unknown>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [tab, setTab] = useState<"overview" | "create" | "data">("overview");
  const [actionIndex, setActionIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const action = props.actions[actionIndex];

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api(props.overviewEndpoint, { org: true })); setDisabled(false); }
    catch (error) { if (error instanceof ApiError && /disabled|module/i.test(error.message)) setDisabled(true); else toast({ message: error instanceof Error ? error.message : "Unable to load module" }); }
    finally { setLoading(false); }
  }, [props.overviewEndpoint, toast]);

  useEffect(() => { load(); api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, [load]);
  useEffect(() => {
    const next: Record<string, string | number | boolean> = {};
    for (const field of action?.fields ?? []) next[field.key] = field.defaultValue ?? (field.kind === "checkbox" ? false : "");
    setValues(next);
  }, [actionIndex, action]);

  const metrics = useMemo(() => collectMetrics(data), [data]);
  const groups = useMemo(() => collections(data), [data]);

  function parsedBody() {
    const body: Record<string, unknown> = {};
    for (const field of action.fields) {
      const value = values[field.key];
      if ((value === "" || value === undefined) && !field.required) continue;
      if (field.kind === "number") body[field.key] = Number(value);
      else if (field.kind === "checkbox") body[field.key] = Boolean(value);
      else if (field.kind === "json") body[field.key] = value ? JSON.parse(String(value)) : {};
      else if (field.kind === "tags") body[field.key] = String(value).split(",").map((v) => v.trim()).filter(Boolean);
      else if (field.kind === "datetime") body[field.key] = new Date(String(value)).toISOString();
      else body[field.key] = value;
    }
    return body;
  }

  async function submit() {
    setSubmitting(true);
    try {
      await api(action.endpoint, { method: action.method ?? "POST", org: true, headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(parsedBody()) });
      toast({ message: `${action.label} completed` });
      setTab("overview");
      await load();
    } catch (error) { toast({ message: error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Action failed" }); }
    finally { setSubmitting(false); }
  }

  if (disabled) return (
    <div className="advanced-page">
      <div className="advanced-hero"><span className="advanced-icon"><Icon name={props.icon} size={22} /></span><div><span className="advanced-eyebrow">{props.eyebrow}</span><h1>{props.title}</h1><p>{props.description}</p></div></div>
      <div className="module-off">The <strong>{props.moduleName}</strong> module is disabled. Enable it in <a href="/admin/modules">System → Modules</a>; core project work remains available.</div>
    </div>
  );

  return (
    <div className="advanced-page">
      <header className="advanced-hero">
        <span className="advanced-icon"><Icon name={props.icon} size={22} /></span>
        <div className="advanced-hero-copy"><span className="advanced-eyebrow">{props.eyebrow}</span><h1>{props.title}</h1><p>{props.description}</p></div>
        <UiButton variant="secondary"  onClick={load} disabled={loading}>Refresh</UiButton>
      </header>
      <nav className="advanced-tabs" aria-label={`${props.title} sections`}>
        {(["overview", "create", "data"] as const).map((name) => <button key={name} data-active={tab === name} onClick={() => setTab(name)}>{name === "create" ? "New / Configure" : name[0].toUpperCase() + name.slice(1)}</button>)}
      </nav>

      {tab === "overview" && <>
        <section className="advanced-metrics">
          {(metrics.length ? metrics : [{ label: "Module", value: loading ? "Loading" : "Ready" }]).map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></article>)}
        </section>
        <section className="advanced-layout">
          <div className="advanced-panel"><div className="advanced-panel-head"><div><span className="advanced-kicker">Capabilities</span><h2>Everything in one workspace</h2></div></div><div className="feature-check-grid">{props.features.map((feature) => <div key={feature}><span><Icon name="check" size={14} /></span><p>{feature}</p></div>)}</div></div>
          <aside className="advanced-side-card"><span className="advanced-kicker">Quick start</span><h3>{props.actions[0]?.label}</h3><p>{props.actions[0]?.description}</p><UiButton variant="primary"  onClick={() => setTab("create")}>Open setup</UiButton></aside>
        </section>
        {groups[0] && <section className="advanced-panel"><div className="advanced-panel-head"><div><span className="advanced-kicker">Recent</span><h2>{groups[0].key.replace(/([A-Z])/g, " $1")}</h2></div><UiButton variant="tertiary"  onClick={() => setTab("data")}>View all</UiButton></div><div className="record-list">{groups[0].rows.slice(0, 6).map((row, i) => <button key={String((row as any)?.id ?? i)} onClick={() => { setTab("data"); setExpanded(String((row as any)?.id ?? `${groups[0].key}-${i}`)); }}><span className="record-monogram">{recordTitle(row, i).slice(0, 1).toUpperCase()}</span><span><strong>{recordTitle(row, i)}</strong><small>{recordSub(row) || "Configured record"}</small></span><Icon name="chevronRight" size={15} /></button>)}</div></section>}
      </>}

      {tab === "create" && <section className="advanced-layout">
        <div className="advanced-panel">
          <div className="advanced-panel-head"><div><span className="advanced-kicker">Action</span><h2>{action.label}</h2><p>{action.description}</p></div></div>
          {props.actions.length > 1 && <div className="action-switcher">{props.actions.map((item, i) => <button key={item.label} data-active={i === actionIndex} onClick={() => setActionIndex(i)}>{item.label}</button>)}</div>}
          <div className="advanced-form">
            {action.fields.map((field) => <label key={field.key} className={field.kind === "textarea" || field.kind === "json" ? "wide" : ""}><span>{field.label}{field.required && <b> *</b>}</span>
              {field.kind === "textarea" || field.kind === "json" ? <UiTextarea rows={field.kind === "json" ? 6 : 4} placeholder={field.placeholder} value={String(values[field.key] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} /> : field.kind === "select" ? <UiSelect value={String(values[field.key] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}><option value="">Choose…</option>{field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</UiSelect> : field.kind === "project" ? <UiSelect value={String(values[field.key] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}><option value="">Choose project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect> : field.kind === "checkbox" ? <span className="advanced-checkbox"><input type="checkbox" checked={Boolean(values[field.key])} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.checked }))} /> Enabled</span> : <UiInput type={field.kind === "number" ? "number" : field.kind === "datetime" ? "datetime-local" : "text"} placeholder={field.placeholder} value={String(values[field.key] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} />}
            </label>)}
          </div>
          <div className="advanced-form-footer"><span>Fields are validated by the server and audited where required.</span><UiButton variant="primary"  onClick={submit} disabled={submitting}>{submitting ? "Saving…" : action.label}</UiButton></div>
        </div>
        <aside className="advanced-side-card"><span className="advanced-kicker">Safe by design</span><h3>Permission-aware</h3><p>Organization context, module enablement, access checks and stable validation errors are enforced server-side.</p></aside>
      </section>}

      {tab === "data" && <section className="advanced-data-grid">
        {groups.length === 0 && <div className="empty">No records are available yet.</div>}
        {groups.map((group) => <div className="advanced-panel" key={group.key}><div className="advanced-panel-head"><div><span className="advanced-kicker">Collection</span><h2>{group.key.replace(/([A-Z])/g, " $1")}</h2></div><span className="count-badge">{group.rows.length}</span></div><div className="record-list">{group.rows.map((row, i) => { const id = String((row as any)?.id ?? `${group.key}-${i}`); return <div className="record-detail" key={id}><button onClick={() => setExpanded(expanded === id ? null : id)}><span className="record-monogram">{recordTitle(row, i).slice(0, 1).toUpperCase()}</span><span><strong>{recordTitle(row, i)}</strong><small>{recordSub(row) || "Record"}</small></span><Icon name={expanded === id ? "chevronDown" : "chevronRight"} size={15} /></button>{expanded === id && <pre>{JSON.stringify(row, null, 2)}</pre>}</div>; })}</div></div>)}
      </section>}
    </div>
  );
}
