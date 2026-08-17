"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Select as UiSelect } from "../../../../../components/ui";
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
  const [recentDryRun, setRecentDryRun] = useState<{ eventName: string; sampledEvents: number; results: { eventId: string; conditionsMatched: boolean; steps: { kind: string; status: string }[] }[] } | null>(null);
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
  async function dryRunRecent() {
    if (!sel) return;
    try {
      const r = await api<{ eventName: string; sampledEvents: number; results: { eventId: string; conditionsMatched: boolean; steps: { kind: string; status: string }[] }[] }>(`/automation/rules/${sel.id}/dry-run-recent`, { method: "POST", org: true, body: JSON.stringify({ limit: 10 }) });
      setRecentDryRun(r);
      toast({ message: `Tested against ${r.sampledEvents} recent "${r.eventName}" event(s) — no side effects` });
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not dry-run against recent events", tone: "error" }); }
  }
  async function toggle(rule: Rule) { await api(`/automation/rules/${rule.id}/enable`, { method: "POST", org: true, body: JSON.stringify({ enabled: !rule.enabled }) }); load(); }
  async function replay(runId: string) { await api(`/automation/runs/${runId}/replay`, { method: "POST", org: true }); toast({ message: "Replayed" }); refreshRuns(); }
  function refreshRuns() { if (sel) api<Run[]>(`/automation/rules/${sel.id}/runs`, { org: true }).then(setRuns).catch(() => {}); }

  return (
    <>
      <h1 className="page-title">Automation</h1>
      <p className="page-sub">WHEN an event happens → IF conditions hold → THEN run actions. Idempotent, retried, loop-guarded.</p>
      {msg && <div className="callout callout-danger ui-static-2b583d73" >{msg}</div>}

      <div className="card card-p ui-static-49f14f8f" >
        <strong>New rule</strong>
        <div className="cfg-form ui-static-56f43562" >
          <Field label="Name"><Input value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} placeholder="Notify on high priority" /></Field>
          <Field label="Trigger"><UiSelect className="input" value={nr.triggerType} onChange={(e) => setNr({ ...nr, triggerType: e.target.value })}><option value="event">event</option><option value="manual">manual</option><option value="schedule">schedule</option></UiSelect></Field>
          {nr.triggerType === "event" && <Field label="Event name"><Input className="mono" value={nr.eventName} onChange={(e) => setNr({ ...nr, eventName: e.target.value })} placeholder="work_item.created" /></Field>}
          <UiButton variant="primary" className="ui-static-87c136df"  disabled={!nr.name} onClick={create}>Create</UiButton>
        </div>
      </div>

      <div className="ui-static-911b26ad">
        <div className="card">
          <table className="table"><thead><tr><th>Rule</th><th>Trigger</th><th>State</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="ui-click-row" data-selected={sel?.id === r.id || undefined}>
                  <td className="ui-static-02a2d333"><button type="button" className="ui-row-link ui-reset-button" aria-pressed={sel?.id === r.id} onClick={() => setSel(r)}>{r.name}</button></td><td className="mono ui-static-6cb285c6">{r.triggerType}</td>
                  <td><button type="button" className="badge ui-static-3b6a3a65 ui-reset-button" aria-pressed={r.enabled} onClick={() => toggle(r)}><span className={`dot ${r.enabled ? "dot-ok" : "dot-off"}`} />{r.enabled ? "on" : (r.disabledReason ?? "off")}</button></td>
                </tr>
              ))}
              {rules.length === 0 && <tr><td colSpan={3} className="ui-static-fbeb64b6">No rules yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card card-p">
          {!sel && <div className="ui-static-fbeb64b6">Select a rule to add actions and see run logs.</div>}
          {sel && (
            <>
              <strong>{sel.name}</strong>
              <div className="ui-static-62ea735f">
                <Field label="Action"><UiSelect className="input" value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value })}><option value="add_comment">add_comment</option><option value="set_priority">set_priority</option><option value="emit_event">emit_event</option></UiSelect></Field>
                <Field label="Config (body / value)"><Input value={act.body} onChange={(e) => setAct({ ...act, body: e.target.value })} /></Field>
                <UiButton variant="secondary" className="ui-static-87c136df"  onClick={addAction}>Add action</UiButton>
              </div>
              <UiButton variant="tertiary"  onClick={dryRun}>Dry run</UiButton>
              {sel.triggerType === "event" && <UiButton variant="tertiary" onClick={dryRunRecent}>Dry-run against recent events</UiButton>}
              {recentDryRun && <div className="automation-recent-dryrun">
                <div className="automation-recent-dryrun-head"><strong>Tested against &ldquo;{recentDryRun.eventName}&rdquo;</strong><span className="muted">{recentDryRun.sampledEvents} recent event(s)</span><button className="icon-btn" aria-label="Dismiss" onClick={() => setRecentDryRun(null)}>✕</button></div>
                {recentDryRun.results.length === 0 && <p className="muted">No recent matching events found for this trigger.</p>}
                {recentDryRun.results.map((r) => <div key={r.eventId} className="automation-recent-dryrun-row">
                  <span className={`pill ${r.conditionsMatched ? "open" : "danger"}`}>{r.conditionsMatched ? "would run" : "skipped"}</span>
                  <div className="automation-recent-dryrun-steps">{r.steps.map((s, i) => <span key={i} className="mono">{s.kind}: {s.status}</span>)}</div>
                </div>)}
              </div>}
              <div className="ui-static-dae7b464">Run logs</div>
              {runs.length === 0 && <div className="ui-static-c3d3e812">No runs yet.</div>}
              {runs.map((run) => (
                <div key={run.id} className="activity-item">
                  <span className={`status-pill ${run.status === "succeeded" ? "st-done" : run.status === "failed" ? "" : "st-todo"}`} data-tone={run.status === "failed" ? "error" : undefined}>{run.status}</span>
                  <span className="mono ui-static-6d000617" >{new Date(run.startedAt).toLocaleTimeString()}</span>
                  {run.status === "failed" && <UiButton variant="tertiary"  onClick={() => replay(run.id)}>Replay</UiButton>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
