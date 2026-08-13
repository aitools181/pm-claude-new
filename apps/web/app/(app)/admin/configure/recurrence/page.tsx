"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Select as UiSelect } from "../../../../../components/ui";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { Field, Input } from "../../../../../components/ui/Field";
import { useToast } from "../../../../../components/ui/Toast";

type Rule = { id: string; name: string; frequency: string; timezone: string; nextRunAt: string; active: boolean };
type Project = { id: string; name: string };

export default function RecurrenceEditor() {
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [f, setF] = useState({ name: "", projectId: "", title: "", frequency: "daily", timezone: "UTC", firstRunAt: "" });
  const [msg, setMsg] = useState<string | null>(null);

  async function load() { setRules(await api<Rule[]>("/recurring-rules", { org: true })); setProjects(await api<Project[]>("/projects", { org: true }).catch(() => [])); }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);

  async function create() {
    setMsg(null);
    try { await api("/recurring-rules", { method: "POST", org: true, body: JSON.stringify({ name: f.name, spec: { projectId: f.projectId, title: f.title }, frequency: f.frequency, timezone: f.timezone, firstRunAt: new Date(f.firstRunAt).toISOString() }) }); setF({ name: "", projectId: "", title: "", frequency: "daily", timezone: "UTC", firstRunAt: "" }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function generate() { const res = await api<{ created: string[] }>("/recurring-rules/generate", { method: "POST", org: true }); toast({ message: `${res.created.length} occurrence(s) generated` }); load(); }

  return (
    <>
      <h1 className="page-title">Recurrence</h1>
      <p className="page-sub">Recurring tasks — occurrences are unique per rule and computed in the rule's timezone.</p>
      {msg && <div className="callout callout-danger ui-static-2b583d73" >{msg}</div>}

      <div className="card card-p ui-static-49f14f8f" >
        <div className="cfg-form">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Daily standup" /></Field>
          <Field label="Project"><UiSelect className="input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">Select…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect></Field>
          <Field label="Task title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Standup" /></Field>
          <Field label="Frequency"><UiSelect className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option>daily</option><option>weekly</option><option>monthly</option></UiSelect></Field>
          <Field label="Timezone"><Input className="mono" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} placeholder="Asia/Kolkata" /></Field>
          <Field label="First run (local)"><Input type="datetime-local" value={f.firstRunAt} onChange={(e) => setF({ ...f, firstRunAt: e.target.value })} /></Field>
        </div>
        <div className="ui-static-a7d4afc9">
          <UiButton variant="primary"  disabled={!f.name || !f.projectId || !f.title || !f.firstRunAt} onClick={create}>Create rule</UiButton>
          <UiButton variant="secondary"  onClick={generate}>Generate due now</UiButton>
        </div>
      </div>

      <div className="card">
        <table className="table"><thead><tr><th>Name</th><th>Frequency</th><th>Timezone</th><th>Next run</th></tr></thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={4} className="ui-static-fbeb64b6">No recurring rules.</td></tr>}
            {rules.map((r) => <tr key={r.id}><td className="ui-static-02a2d333">{r.name}</td><td>{r.frequency}</td><td className="mono">{r.timezone}</td><td>{new Date(r.nextRunAt).toLocaleString()}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
