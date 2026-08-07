"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { Field, Input } from "../../../../../../components/ui/Field";
import { useToast } from "../../../../../../components/ui/Toast";

type Version = { id: string; versionNo: number; status: string };
type Status = { id: string; key: string; name: string; category: string; isInitial: boolean };
type Transition = { id: string; name: string; fromStatusId: string | null; toStatusId: string };

export default function WorkflowEditor() {
  const id = useParams().id as string;
  const toast = useToast();
  const [name, setName] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [active, setActive] = useState<Version | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [ns, setNs] = useState({ key: "", name: "", category: "todo", isInitial: false });
  const [nt, setNt] = useState({ name: "", fromStatusId: "", toStatusId: "" });
  const [issues, setIssues] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const editable = active?.status === "draft";

  const loadVersion = useCallback(async (v: Version) => {
    setActive(v);
    const detail = await api<{ statuses: Status[]; transitions: Transition[] }>(`/workflows/versions/${v.id}/detail`, { org: true });
    setStatuses(detail.statuses); setTransitions(detail.transitions);
  }, []);

  const load = useCallback(async () => {
    const wf = await api<{ workflow: { name: string }; versions: Version[] }>(`/workflows/${id}`, { org: true });
    setName(wf.workflow.name); setVersions(wf.versions);
    const draft = wf.versions.find((v) => v.status === "draft") ?? wf.versions[wf.versions.length - 1];
    if (draft) await loadVersion(draft);
  }, [id, loadVersion]);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [load]);

  async function addStatus() {
    if (!active) return;
    try { await api(`/workflows/versions/${active.id}/statuses`, { method: "POST", org: true, body: JSON.stringify(ns) }); setNs({ key: "", name: "", category: "todo", isInitial: false }); loadVersion(active); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function addTransition() {
    if (!active) return;
    try { await api(`/workflows/versions/${active.id}/transitions`, { method: "POST", org: true, body: JSON.stringify({ name: nt.name, fromStatusId: nt.fromStatusId || null, toStatusId: nt.toStatusId }) }); setNt({ name: "", fromStatusId: "", toStatusId: "" }); loadVersion(active); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function validate() {
    if (!active) return;
    const res = await api<{ ok: boolean; issues: string[] }>(`/workflows/versions/${active.id}/validate`, { org: true });
    setIssues(res.issues); if (res.ok) toast({ message: "Workflow is valid" });
  }
  async function publish() {
    if (!active) return;
    try { await api(`/workflows/versions/${active.id}/publish`, { method: "POST", org: true }); toast({ message: "Published — this version is now immutable" }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? (e.details ? (e.details as string[]).join("; ") : e.message) : "Failed"); }
  }
  async function branch() {
    try { const v = await api<Version>(`/workflows/${id}/versions`, { method: "POST", org: true }); toast({ message: `Draft v${v.versionNo} created` }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function previewMigration() {
    if (!active) return;
    const res = await api<any[]>(`/workflows/${id}/migration-preview/${active.id}`, { org: true });
    toast({ message: `${res.length} item(s); ${res.filter((r) => r.mapsCleanly).length} map cleanly` });
  }

  const statusName = (sid: string | null) => sid ? (statuses.find((s) => s.id === sid)?.name ?? "?") : "Any";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{name || "Workflow"}</h1>
        <a className="btn btn-ghost" href="/admin/configure/workflows">← All workflows</a>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        {versions.map((v) => (
          <button key={v.id} className={`badge ${v.status === "published" ? "pill-published" : "pill-draft"}`} onClick={() => loadVersion(v)} style={{ cursor: "pointer", outline: active?.id === v.id ? "2px solid var(--primary-line)" : "none" }}>
            v{v.versionNo} · {v.status}
          </button>
        ))}
        {active?.status === "published" && <button className="btn" onClick={branch}>Branch to new draft</button>}
        {active?.status === "published" && <button className="btn btn-ghost" onClick={previewMigration}>Migration preview</button>}
      </div>
      {msg && <div className="callout callout-danger" style={{ marginBottom: 14 }}>{msg}</div>}
      {!editable && active && <div className="callout callout-info" style={{ marginBottom: 14 }}>This version is published and immutable. Branch a new draft to make changes.</div>}

      <div className="wf-canvas">
        {statuses.map((s) => (
          <div key={s.id} className="wf-status">
            <div className="cat">{s.category}</div>
            <div className="nm">{s.name}</div>
            {s.isInitial && <div className="init">● initial</div>}
            <div style={{ marginTop: 8 }}>
              {transitions.filter((t) => t.fromStatusId === s.id || t.fromStatusId === null).map((t) => (
                <div key={t.id} className="wf-trans">{t.name} <span className="arrow">→</span> {statusName(t.toStatusId)}</div>
              ))}
            </div>
          </div>
        ))}
        {statuses.length === 0 && <div className="empty" style={{ minWidth: 280 }}>No statuses yet. Add the first one.</div>}
      </div>

      {editable && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
          <div className="card card-p">
            <strong>Add status</strong>
            <div className="cfg-form" style={{ margin: "12px 0" }}>
              <Field label="Key"><Input className="mono" value={ns.key} onChange={(e) => setNs({ ...ns, key: e.target.value })} /></Field>
              <Field label="Name"><Input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} /></Field>
              <Field label="Category"><select className="input" value={ns.category} onChange={(e) => setNs({ ...ns, category: e.target.value })}><option value="todo">todo</option><option value="in_progress">in_progress</option><option value="done">done</option></select></Field>
              <Field label="Initial"><select className="input" value={String(ns.isInitial)} onChange={(e) => setNs({ ...ns, isInitial: e.target.value === "true" })}><option value="false">No</option><option value="true">Yes</option></select></Field>
            </div>
            <button className="btn btn-primary" disabled={!ns.key || !ns.name} onClick={addStatus}>Add status</button>
          </div>

          <div className="card card-p">
            <strong>Add transition</strong>
            <div className="cfg-form" style={{ margin: "12px 0" }}>
              <Field label="Name"><Input value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} placeholder="Start" /></Field>
              <Field label="From"><select className="input" value={nt.fromStatusId} onChange={(e) => setNt({ ...nt, fromStatusId: e.target.value })}><option value="">Any</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="To"><select className="input" value={nt.toStatusId} onChange={(e) => setNt({ ...nt, toStatusId: e.target.value })}><option value="">Select…</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            </div>
            <button className="btn btn-primary" disabled={!nt.name || !nt.toStatusId} onClick={addTransition}>Add transition</button>
          </div>
        </div>
      )}

      {editable && (
        <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center" }}>
          <button className="btn" onClick={validate}>Validate</button>
          <button className="btn btn-primary" onClick={publish}>Publish</button>
          {issues && issues.length > 0 && <span style={{ color: "var(--danger)", fontSize: 13 }}>{issues.join(" · ")}</span>}
          {issues && issues.length === 0 && <span style={{ color: "var(--success)", fontSize: 13 }}>Valid ✓</span>}
        </div>
      )}
    </>
  );
}
