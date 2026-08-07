"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { Field, Input } from "../../../../../components/ui/Field";
import { useToast } from "../../../../../components/ui/Toast";

type Template = { id: string; name: string; kind: string; publishedVersionId: string | null };
type Workspace = { id: string; name: string };

export default function TemplatesLibrary() {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [t, setT] = useState({ name: "", keyPrefix: "", tasks: "" });
  const [inst, setInst] = useState<Record<string, { workspaceId: string; keyPrefix: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setTemplates(await api<Template[]>("/templates", { org: true }));
    setWorkspaces(await api<Workspace[]>("/workspaces", { org: true }).catch(() => []));
  }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);

  async function create() {
    setMsg(null);
    const tasks = t.tasks.split("\n").map((x) => x.trim()).filter(Boolean).map((title) => ({ title }));
    try {
      const res = await api<{ version: { id: string } }>("/templates", { method: "POST", org: true, body: JSON.stringify({ kind: "project", name: t.name, content: { name: t.name, keyPrefix: t.keyPrefix, sections: ["Backlog"], tasks } }) });
      await api(`/templates/versions/${res.version.id}/publish`, { method: "POST", org: true });
      setT({ name: "", keyPrefix: "", tasks: "" }); load(); toast({ message: "Template published" });
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function instantiate(id: string) {
    const cfg = inst[id]; if (!cfg?.workspaceId) return;
    try { const res = await api<{ projectId: string }>(`/templates/${id}/instantiate-project`, { method: "POST", org: true, body: JSON.stringify({ workspaceId: cfg.workspaceId, keyPrefix: cfg.keyPrefix || undefined }) }); toast({ message: "Project created", action: { label: "Open", run: () => location.assign(`/projects/${res.projectId}`) } }); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }

  return (
    <>
      <h1 className="page-title">Templates</h1>
      <p className="page-sub">Publish a project template once; instantiate independent copies — edits never mutate existing projects.</p>
      {msg && <div className="callout callout-danger" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className="card card-p" style={{ marginBottom: 20 }}>
        <strong>New project template</strong>
        <div className="cfg-form" style={{ margin: "12px 0" }}>
          <Field label="Name"><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Sprint" /></Field>
          <Field label="Key prefix"><Input className="mono" value={t.keyPrefix} onChange={(e) => setT({ ...t, keyPrefix: e.target.value.toUpperCase() })} placeholder="SPR" /></Field>
        </div>
        <Field label="Tasks (one per line)"><textarea className="input" style={{ height: 80, padding: 10 }} value={t.tasks} onChange={(e) => setT({ ...t, tasks: e.target.value })} placeholder={"Plan\nBuild\nReview"} /></Field>
        <button className="btn btn-primary" disabled={!t.name || !t.keyPrefix} onClick={create}>Create & publish</button>
      </div>

      <div className="card">
        {templates.length === 0 && <div style={{ padding: 16, color: "var(--ink-3)" }}>No templates yet.</div>}
        {templates.map((tp) => (
          <div key={tp.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontWeight: 500 }}>{tp.name} <span className="badge" style={{ marginLeft: 6 }}>{tp.kind}</span></span>
            <select className="input" style={{ height: 34, width: 150 }} value={inst[tp.id]?.workspaceId ?? ""} onChange={(e) => setInst({ ...inst, [tp.id]: { ...(inst[tp.id] ?? { keyPrefix: "" }), workspaceId: e.target.value } })}>
              <option value="">Workspace…</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input className="input mono" style={{ height: 34, width: 90 }} placeholder="KEY" value={inst[tp.id]?.keyPrefix ?? ""} onChange={(e) => setInst({ ...inst, [tp.id]: { ...(inst[tp.id] ?? { workspaceId: "" }), keyPrefix: e.target.value.toUpperCase() } })} />
            <button className="btn btn-primary" disabled={!tp.publishedVersionId || !inst[tp.id]?.workspaceId} onClick={() => instantiate(tp.id)}>Instantiate</button>
          </div>
        ))}
      </div>
    </>
  );
}
