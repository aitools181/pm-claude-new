"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../components/ui";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Def = { id: string; name: string; kind: string; format: string; frequency: string; enabled: boolean; nextRunAt: string | null };
type Run = { id: string; status: string; attempt: number; maxAttempts: number; error: string | null; createdAt: string };
type Delivery = { id: string; recipient: string; status: string; error: string | null };
type Ref = { id: string; name: string };

export default function ReportsPage() {
  const toast = useToast();
  const [defs, setDefs] = useState<Def[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [refs, setRefs] = useState<{ dashboard: Ref[]; portfolio: Ref[]; metric: Ref[] }>({ dashboard: [], portfolio: [], metric: [] });
  const [form, setForm] = useState({ name: "", kind: "dashboard", refId: "", frequency: "weekly", recipients: "" });

  const loadDefs = useCallback(async () => setDefs(await api<Def[]>("/report-definitions", { org: true }).catch(() => [])), []);
  useEffect(() => {
    loadDefs();
    Promise.all([api<Ref[]>("/dashboards", { org: true }).catch(() => []), api<Ref[]>("/portfolios", { org: true }).catch(() => []), api<Ref[]>("/metric-definitions", { org: true }).catch(() => [])])
      .then(([dashboard, portfolio, metric]) => setRefs({ dashboard, portfolio, metric }));
  }, [loadDefs]);
  const openHistory = useCallback(async (id: string) => { setSel(id); setRuns(await api<Run[]>(`/report-definitions/${id}/history`, { org: true }).catch(() => [])); setExpanded(null); }, []);

  async function create() {
    if (!form.name || !form.refId || !form.recipients) { toast({ message: "Fill name, target and recipients" }); return; }
    await api("/report-definitions", { method: "POST", org: true, body: JSON.stringify({ name: form.name, kind: form.kind, refId: form.refId, frequency: form.frequency, recipients: form.recipients.split(",").map((s) => s.trim()).filter(Boolean) }) });
    setForm({ name: "", kind: "dashboard", refId: "", frequency: "weekly", recipients: "" }); loadDefs();
  }
  async function runNow(id: string) { try { const r = await api<{ status: string }>(`/report-definitions/${id}/run`, { method: "POST", org: true }); toast({ message: `Run: ${r.status}` }); openHistory(id); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
  async function retry(runId: string) { try { await api(`/report-runs/${runId}/retry`, { method: "POST", org: true }); toast({ message: "Retried" }); if (sel) openHistory(sel); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
  async function toggleRun(runId: string) { if (expanded === runId) { setExpanded(null); return; } setExpanded(runId); setDeliveries(await api<Delivery[]>(`/report-runs/${runId}/deliveries`, { org: true }).catch(() => [])); }

  const currentRefs = refs[form.kind as keyof typeof refs] ?? [];

  return (
    <>
      <h1 className="page-title">Scheduled reports</h1>
      <div className="builder-grid">
        <div>
          {!sel && <p className="muted">Select a report to see its run history and deliveries.</p>}
          {sel && (
            <>
              <div className="ui-static-ba5de791">
                <h3 className="ui-static-11696618">{defs.find((d) => d.id === sel)?.name}</h3>
                <UiButton variant="primary"  onClick={() => runNow(sel)}>Run now</UiButton>
              </div>
              {runs.length === 0 && <p className="muted">No runs yet.</p>}
              {runs.map((run) => (
                <div key={run.id} className="fieldcard">
                  <div className="ui-static-13313b1a">
                    <button type="button" onClick={() => toggleRun(run.id)} className="ui-static-3b6a3a65 ui-reset-button" aria-expanded={expanded === run.id}>
                      <span className="mono ui-static-63e481c4" >{new Date(run.createdAt).toLocaleString()}</span>
                      {" "}<span className={`pill ${run.status === "delivered" ? "approved" : run.status === "failed" ? "rejected" : "submitted"}`}>{run.status}</span>
                      <span className="muted ui-static-6cb285c6" > · attempt {run.attempt}/{run.maxAttempts}</span>
                    </button>
                    {(run.status === "retry_scheduled" || run.status === "failed") && run.attempt < run.maxAttempts && <UiButton variant="tertiary"  onClick={() => retry(run.id)}>Retry</UiButton>}
                  </div>
                  {run.error && <div className="ui-static-5f638055">{run.error}</div>}
                  {expanded === run.id && (
                    <div className="ui-static-8a77e5a3">
                      {deliveries.map((d) => <div key={d.id} className="ui-static-6cc78029">{d.recipient} — <span className={d.status === "delivered" ? "h-on_track" : "h-off_track"}>{d.status}</span>{d.error ? ` (${d.error})` : ""}</div>)}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>New report</h3>
          <UiInput className="input ui-static-4e420aff" placeholder="Report name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}  />
          <UiSelect className="input ui-static-4e420aff" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, refId: "" })} >
            <option value="dashboard">Dashboard</option><option value="portfolio">Portfolio</option><option value="metric">Metric</option>
          </UiSelect>
          <UiSelect className="input ui-static-4e420aff" value={form.refId} onChange={(e) => setForm({ ...form, refId: e.target.value })} >
            <option value="">Select {form.kind}…</option>{currentRefs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </UiSelect>
          <UiSelect className="input ui-static-4e420aff" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} >
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </UiSelect>
          <UiInput className="input ui-static-fdf33f23" placeholder="Recipients (comma separated)" value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })}  />
          <UiButton variant="primary" className="ui-static-0466783d" onClick={create} >Create report</UiButton>

          <h3 className="ui-static-86de7ac6">Reports</h3>
          {defs.map((d) => <UiButton variant="tertiary" key={d.id} className="ui-selection-row" data-selected={sel === d.id || undefined} onClick={() => openHistory(d.id)}>{d.name} <span className="muted ui-static-11a50812" >{d.frequency}</span></UiButton>)}
        </div>
      </div>
    </>
  );
}
