"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../../../../../components/ui";
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
      {msg && <div className="callout callout-danger ui-static-2b583d73" >{msg}</div>}

      <div className="card card-p ui-static-49f14f8f" >
        <strong>New project template</strong>
        <div className="cfg-form ui-static-d60550f6" >
          <Field label="Name"><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Sprint" /></Field>
          <Field label="Key prefix"><Input className="mono" value={t.keyPrefix} onChange={(e) => setT({ ...t, keyPrefix: e.target.value.toUpperCase() })} placeholder="SPR" /></Field>
        </div>
        <Field label="Tasks (one per line)"><UiTextarea className="input ui-static-fb1f09ac"  value={t.tasks} onChange={(e) => setT({ ...t, tasks: e.target.value })} placeholder={"Plan\nBuild\nReview"} /></Field>
        <UiButton variant="primary"  disabled={!t.name || !t.keyPrefix} onClick={create}>Create & publish</UiButton>
      </div>

      <div className="card">
        {templates.length === 0 && <div className="ui-static-cfad4427">No templates yet.</div>}
        {templates.map((tp) => (
          <div key={tp.id} className="ui-static-3d4bb296">
            <span className="ui-static-02a2d333">{tp.name} <span className="badge ui-static-391ef124" >{tp.kind}</span></span>
            <UiSelect className="input ui-static-03c6165a"  value={inst[tp.id]?.workspaceId ?? ""} onChange={(e) => setInst({ ...inst, [tp.id]: { ...(inst[tp.id] ?? { keyPrefix: "" }), workspaceId: e.target.value } })}>
              <option value="">Workspace…</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </UiSelect>
            <UiInput className="input mono ui-static-5e5c5e32"  placeholder="KEY" value={inst[tp.id]?.keyPrefix ?? ""} onChange={(e) => setInst({ ...inst, [tp.id]: { ...(inst[tp.id] ?? { workspaceId: "" }), keyPrefix: e.target.value.toUpperCase() } })} />
            <UiButton variant="primary"  disabled={!tp.publishedVersionId || !inst[tp.id]?.workspaceId} onClick={() => instantiate(tp.id)}>Instantiate</UiButton>
          </div>
        ))}
      </div>
    </>
  );
}
