"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { Field, Input } from "../../../../../components/ui/Field";
import { useToast } from "../../../../../components/ui/Toast";

type Rule = { id: string; name: string; triggerType: string; enabled: boolean; disabledReason: string | null };
type Run = { id: string; status: string; startedAt: string };

export default function AutomationBuilder() {
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [nr, setNr] = useState({ name: "", triggerType: "event", eventName: "" });
  const [sel, setSel] = useState<Rule | null>(null);
  const [act, setAct] = useState({ kind: "add_comment", body: "" });
  const [runs, setRuns] = useState<Run[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api<Rule[]>("/automation/rules", { org: true }).then(setRules).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { if (sel) api<Run[]>(`/automation/rules/${sel.id}/runs`, { org: true }).then(setRuns).catch(() => setRuns([])); }, [sel]);

  async function create() {
    setMsg(null);
    try { await api("/automation/rules", { method: "POST", org: true, body: JSON.stringify({ name: nr.name, triggerType: nr.triggerType, triggerConfig: nr.triggerType === "event" ? { eventName: nr.eventName } : {} }) }); setNr({ name: "", triggerType: "event", eventName: "" }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function addAction() {
    if (!sel) return;
    await api(`/automation/rules/${sel.id}/actions`, { method: "POST", org: true, body: JSON.stringify({ kind: act.kind, config: { body: act.body } }) });
    toast({ message: "Action added" }); setAct({ kind: "add_comment", body: "" });
  }
  async function dryRun() { if (!sel) return; await api(`/automation/rules/${sel.id}/run`, { method: "POST", org: true, body: JSON.stringify({ dryRun: true }) }); toast({ message: "Dry run recorded — no side effects" }); refreshRuns(); }
  async function toggle(rule: Rule) { await api(`/automation/rules/${rule.id}/enable`, { method: "POST", org: true, body: JSON.stringify({ enabled: !rule.enabled }) }); load(); }
  async function replay(runId: string) { await api(`/automation/runs/${runId}/replay`, { method: "POST", org: true }); toast({ message: "Replayed" }); refreshRuns(); }
  function refreshRuns() { if (sel) api<Run[]>(`/automation/rules/${sel.id}/runs`, { org: true }).then(setRuns).catch(() => {}); }

  return (
    <>
      <h1 className="page-title">Automation</h1>
      <p className="page-sub">WHEN an event happens → IF conditions hold → THEN run actions. Idempotent, retried, loop-guarded.</p>
      {msg && <div className="callout callout-danger" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className="card card-p" style={{ marginBottom: 20 }}>
        <strong>New rule</strong>
        <div className="cfg-form" style={{ marginTop: 12 }}>
          <Field label="Name"><Input value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} placeholder="Notify on high priority" /></Field>
          <Field label="Trigger"><select className="input" value={nr.triggerType} onChange={(e) => setNr({ ...nr, triggerType: e.target.value })}><option value="event">event</option><option value="manual">manual</option><option value="schedule">schedule</option></select></Field>
          {nr.triggerType === "event" && <Field label="Event name"><Input className="mono" value={nr.eventName} onChange={(e) => setNr({ ...nr, eventName: e.target.value })} placeholder="work_item.created" /></Field>}
          <button className="btn btn-primary" style={{ marginBottom: 16 }} disabled={!nr.name} onClick={create}>Create</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <table className="table"><thead><tr><th>Rule</th><th>Trigger</th><th>State</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} onClick={() => setSel(r)} style={{ cursor: "pointer", background: sel?.id === r.id ? "var(--surface-2)" : undefined }}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td><td className="mono" style={{ fontSize: 12 }}>{r.triggerType}</td>
                  <td><span className="badge" onClick={(e) => { e.stopPropagation(); toggle(r); }} style={{ cursor: "pointer" }}><span className={`dot ${r.enabled ? "dot-ok" : "dot-off"}`} />{r.enabled ? "on" : (r.disabledReason ?? "off")}</span></td>
                </tr>
              ))}
              {rules.length === 0 && <tr><td colSpan={3} style={{ color: "var(--ink-3)" }}>No rules yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card card-p">
          {!sel && <div style={{ color: "var(--ink-3)" }}>Select a rule to add actions and see run logs.</div>}
          {sel && (
            <>
              <strong>{sel.name}</strong>
              <div style={{ display: "flex", gap: 8, alignItems: "end", margin: "12px 0" }}>
                <Field label="Action"><select className="input" value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value })}><option value="add_comment">add_comment</option><option value="set_priority">set_priority</option><option value="emit_event">emit_event</option></select></Field>
                <Field label="Config (body / value)"><Input value={act.body} onChange={(e) => setAct({ ...act, body: e.target.value })} /></Field>
                <button className="btn" style={{ marginBottom: 16 }} onClick={addAction}>Add action</button>
              </div>
              <button className="btn btn-ghost" onClick={dryRun}>Dry run</button>
              <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }}>Run logs</div>
              {runs.length === 0 && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>No runs yet.</div>}
              {runs.map((run) => (
                <div key={run.id} className="activity-item">
                  <span className={`status-pill ${run.status === "succeeded" ? "st-done" : run.status === "failed" ? "" : "st-todo"}`} style={run.status === "failed" ? { background: "var(--danger-weak)", color: "#8f2b27" } : {}}>{run.status}</span>
                  <span className="mono" style={{ marginLeft: "auto" }}>{new Date(run.startedAt).toLocaleTimeString()}</span>
                  {run.status === "failed" && <button className="btn btn-ghost" onClick={() => replay(run.id)}>Replay</button>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
