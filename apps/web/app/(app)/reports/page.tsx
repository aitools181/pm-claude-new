"use client";
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>{defs.find((d) => d.id === sel)?.name}</h3>
                <button className="btn btn-primary" onClick={() => runNow(sel)}>Run now</button>
              </div>
              {runs.length === 0 && <p className="muted">No runs yet.</p>}
              {runs.map((run) => (
                <div key={run.id} className="fieldcard">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span onClick={() => toggleRun(run.id)} style={{ cursor: "pointer" }}>
                      <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{new Date(run.createdAt).toLocaleString()}</span>
                      {" "}<span className={`pill ${run.status === "delivered" ? "approved" : run.status === "failed" ? "rejected" : "submitted"}`}>{run.status}</span>
                      <span className="muted" style={{ fontSize: 12 }}> · attempt {run.attempt}/{run.maxAttempts}</span>
                    </span>
                    {(run.status === "retry_scheduled" || run.status === "failed") && run.attempt < run.maxAttempts && <button className="btn btn-ghost" onClick={() => retry(run.id)}>Retry</button>}
                  </div>
                  {run.error && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{run.error}</div>}
                  {expanded === run.id && (
                    <div style={{ marginTop: 8 }}>
                      {deliveries.map((d) => <div key={d.id} style={{ fontSize: 12, padding: "2px 0" }}>{d.recipient} — <span className={d.status === "delivered" ? "h-on_track" : "h-off_track"}>{d.status}</span>{d.error ? ` (${d.error})` : ""}</div>)}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>New report</h3>
          <input className="input" placeholder="Report name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ marginBottom: 6 }} />
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, refId: "" })} style={{ marginBottom: 6 }}>
            <option value="dashboard">Dashboard</option><option value="portfolio">Portfolio</option><option value="metric">Metric</option>
          </select>
          <select className="input" value={form.refId} onChange={(e) => setForm({ ...form, refId: e.target.value })} style={{ marginBottom: 6 }}>
            <option value="">Select {form.kind}…</option>{currentRefs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} style={{ marginBottom: 6 }}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
          <input className="input" placeholder="Recipients (comma separated)" value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} style={{ marginBottom: 8 }} />
          <button className="btn btn-primary" onClick={create} style={{ width: "100%" }}>Create report</button>

          <h3 style={{ marginTop: 18 }}>Reports</h3>
          {defs.map((d) => <button key={d.id} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel === d.id ? "var(--primary)" : undefined }} onClick={() => openHistory(d.id)}>{d.name} <span className="muted" style={{ fontSize: 11 }}>{d.frequency}</span></button>)}
        </div>
      </div>
    </>
  );
}
