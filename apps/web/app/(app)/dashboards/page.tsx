"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../components/ui";
import { appPrompt } from "../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { useModalDialog } from "../../../components/ui/useModalDialog";

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
  const drillDialogRef = useModalDialog<HTMLDivElement>(Boolean(drill), () => setDrill(null));

  const loadList = useCallback(async () => setList(await api<Dashboard[]>("/dashboards", { org: true }).catch(() => [])), []);
  useEffect(() => { loadList(); api<Cat[]>("/metric-catalogue", { org: true }).then(setCat).catch(() => {}); api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, [loadList]);
  const open = useCallback(async (id: string) => { setSel(id); setRendered(await api<Rendered>(`/dashboards/${id}/render`, { org: true }).catch(() => null)); }, []);

  async function create() { const name = await appPrompt("Dashboard name"); if (!name) return; await api("/dashboards", { method: "POST", org: true, body: JSON.stringify({ name, visibility: "org", widgets: [] }) }); loadList(); }
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
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Dashboards</h1>
        <UiButton variant="primary"  onClick={create}>+ New dashboard</UiButton>
      </div>
      <div className="builder-grid">
        <div>
          {!rendered && <p className="muted">Select a dashboard.</p>}
          {rendered && (
            <>
              <div className="dash-grid ui-static-87c136df" >
                {rendered.widgets.length === 0 && <p className="muted">No widgets yet — add one below.</p>}
                {rendered.widgets.map((w) => (
                  <div key={w.id} className="widget-card">
                    <div className="muted ui-static-6cb285c6" >{w.title}</div>
                    {w.error ? <div className="ui-static-8763236a">{w.error}</div> : <div className="widget-val">{w.value}{w.unit === "%" ? "%" : ""}</div>}
                    <div className="widget-meta">{w.formula?.formula}</div>
                    <div className="ui-static-1c620034">
                      <span className={`fresh ${w.stale ? "stale" : ""}`}>{w.ageSeconds === 0 ? "live" : `${w.ageSeconds}s ago`}</span>
                      {drillable(w) && <UiButton variant="tertiary" className="ui-static-e5e520c5"  onClick={() => doDrill(w)}>Drill →</UiButton>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="ui-static-559c8d07">
                <UiSelect className="input ui-static-fc2c71fc" value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value })} >
                  <option value="">Add widget: metric…</option>{cat.map((c) => <option key={c.source} value={c.source}>{c.label}</option>)}
                </UiSelect>
                {cat.find((c) => c.source === add.source)?.params.includes("projectId") && (
                  <UiSelect className="input ui-static-7c07cdf8" value={add.projectId} onChange={(e) => setAdd({ ...add, projectId: e.target.value })} >
                    <option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </UiSelect>
                )}
                <UiInput className="input ui-static-f09611ef" placeholder="Title (optional)" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })}  />
                <UiButton variant="secondary"  onClick={addWidget} disabled={!add.source}>Add widget</UiButton>
              </div>
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>Dashboards</h3>
          {list.map((d) => <UiButton variant="tertiary" key={d.id} className="ui-selection-row" data-selected={sel === d.id || undefined} onClick={() => open(d.id)}>{d.name} <span className="pill open ui-static-46cec891" >{d.visibility}</span></UiButton>)}
        </div>
      </div>

      {drill && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrill(null); }}>
          <div ref={drillDialogRef} tabIndex={-1} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="dashboard-drill-title">
            <h2 id="dashboard-drill-title" className="page-title ui-static-4ff818ff" >{drill.title} — records</h2>
            <p className="page-sub">Showing {drill.records.length} record(s) you can access.</p>
            {drill.records.map((r) => <div key={r.key} className="bl-row"><span className="key">{r.key}</span><span className="title">{r.title}</span></div>)}
            {drill.records.length === 0 && <p className="muted">No authorised records.</p>}
            <div className="ui-static-475e409f"><UiButton variant="secondary"  onClick={() => setDrill(null)}>Close</UiButton></div>
          </div>
        </div>
      )}
    </>
  );
}
