"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Dashboard = { id: string; name: string; visibility: string };
type Widget = { id: string; type: string; title: string; source?: string; params?: Record<string, unknown>; value?: number | null; unit?: string; formula?: { formula: string }; ageSeconds?: number; stale?: boolean; error?: string };
type Rendered = { dashboard: Dashboard; widgets: Widget[] };
type Cat = { source: string; label: string; formula: string; unit: string; params: string[]; drillable: boolean };
type Project = { id: string; name: string };

export default function DashboardsPage() {
  const toast = useToast();
  const [list, setList] = useState<Dashboard[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [cat, setCat] = useState<Cat[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [add, setAdd] = useState({ source: "", title: "", projectId: "" });
  const [drill, setDrill] = useState<{ title: string; records: { key: string; title: string }[] } | null>(null);

  const loadList = useCallback(async () => setList(await api<Dashboard[]>("/dashboards", { org: true }).catch(() => [])), []);
  useEffect(() => { loadList(); api<Cat[]>("/metric-catalogue", { org: true }).then(setCat).catch(() => {}); api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, [loadList]);
  const open = useCallback(async (id: string) => { setSel(id); setRendered(await api<Rendered>(`/dashboards/${id}/render`, { org: true }).catch(() => null)); }, []);

  async function create() { const name = prompt("Dashboard name"); if (!name) return; await api("/dashboards", { method: "POST", org: true, body: JSON.stringify({ name, visibility: "org", widgets: [] }) }); loadList(); }
  async function addWidget() {
    if (!sel || !add.source || !rendered) return;
    const c = cat.find((x) => x.source === add.source);
    const widget: Widget = { id: crypto.randomUUID(), type: "number", title: add.title || c?.label || add.source, source: add.source, params: add.projectId ? { projectId: add.projectId } : {} };
    const widgets = [...(rendered.widgets.map((w) => ({ id: w.id, type: w.type, title: w.title, source: w.source, params: w.params }))), widget];
    await api(`/dashboards/${sel}`, { method: "PATCH", org: true, body: JSON.stringify({ widgets }) });
    setAdd({ source: "", title: "", projectId: "" }); open(sel);
  }
  async function doDrill(w: Widget) {
    if (!sel) return;
    try { const res = await api<{ records: any[] }>(`/dashboards/${sel}/widgets/${w.id}/drill`, { org: true }); setDrill({ title: w.title, records: res.records }); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Drill failed" }); }
  }
  const drillable = (w: Widget) => w.source === "work.open_count";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Dashboards</h1>
        <button className="btn btn-primary" onClick={create}>+ New dashboard</button>
      </div>
      <div className="builder-grid">
        <div>
          {!rendered && <p className="muted">Select a dashboard.</p>}
          {rendered && (
            <>
              <div className="dash-grid" style={{ marginBottom: 16 }}>
                {rendered.widgets.length === 0 && <p className="muted">No widgets yet — add one below.</p>}
                {rendered.widgets.map((w) => (
                  <div key={w.id} className="widget-card">
                    <div className="muted" style={{ fontSize: 12 }}>{w.title}</div>
                    {w.error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{w.error}</div> : <div className="widget-val">{w.value}{w.unit === "%" ? "%" : ""}</div>}
                    <div className="widget-meta">{w.formula?.formula}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <span className={`fresh ${w.stale ? "stale" : ""}`}>{w.ageSeconds === 0 ? "live" : `${w.ageSeconds}s ago`}</span>
                      {drillable(w) && <button className="btn btn-ghost" style={{ padding: "0 8px" }} onClick={() => doDrill(w)}>Drill →</button>}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select className="input" value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value })} style={{ width: 190 }}>
                  <option value="">Add widget: metric…</option>{cat.map((c) => <option key={c.source} value={c.source}>{c.label}</option>)}
                </select>
                {cat.find((c) => c.source === add.source)?.params.includes("projectId") && (
                  <select className="input" value={add.projectId} onChange={(e) => setAdd({ ...add, projectId: e.target.value })} style={{ width: 150 }}>
                    <option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                <input className="input" placeholder="Title (optional)" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                <button className="btn" onClick={addWidget} disabled={!add.source}>Add widget</button>
              </div>
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>Dashboards</h3>
          {list.map((d) => <button key={d.id} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel === d.id ? "var(--primary)" : undefined }} onClick={() => open(d.id)}>{d.name} <span className="pill open" style={{ marginLeft: 4 }}>{d.visibility}</span></button>)}
        </div>
      </div>

      {drill && (
        <div className="modal-backdrop" onClick={() => setDrill(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="page-title" style={{ fontSize: 18 }}>{drill.title} — records</h2>
            <p className="page-sub">Showing {drill.records.length} record(s) you can access.</p>
            {drill.records.map((r) => <div key={r.key} className="bl-row"><span className="key">{r.key}</span><span className="title">{r.title}</span></div>)}
            {drill.records.length === 0 && <p className="muted">No authorised records.</p>}
            <div style={{ textAlign: "right", marginTop: 12 }}><button className="btn" onClick={() => setDrill(null)}>Close</button></div>
          </div>
        </div>
      )}
    </>
  );
}
