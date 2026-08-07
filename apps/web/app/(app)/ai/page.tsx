"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Status = { provider: string; healthy: boolean; budgetTokens: number; usedTokens: number };
type Cite = { kind: string; id: string; key?: string };
type Proposal = { id: string; title: string; citations: Cite[]; degraded: boolean; status: string; createdWorkItemId: string | null };
type Project = { id: string; name: string };

export default function AiPage() {
  const toast = useToast();
  const [disabled, setDisabled] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [text, setText] = useState(""); const [projectId, setProjectId] = useState(""); const [useRetrieval, setUseRetrieval] = useState(true);

  const load = useCallback(async () => {
    try { setStatus(await api<Status>("/ai/status", { org: true })); setDisabled(false); }
    catch (e) { if (e instanceof ApiError && /disabled/i.test(e.message)) { setDisabled(true); return; } }
    setProposals(await api<Proposal[]>("/ai/proposals", { org: true }).catch(() => []));
    api<Project[]>("/projects", { org: true }).then((p) => { setProjects(p); setProjectId((id) => id || p[0]?.id || ""); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function propose() { if (!text.trim() || !projectId) return; try { await api("/ai/propose-task", { method: "POST", org: true, body: JSON.stringify({ projectId, text, useRetrieval }) }); setText(""); toast({ message: "Proposal drafted — review before applying" }); load(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
  async function confirm(id: string) { await api(`/ai/proposals/${id}/confirm`, { method: "POST", org: true }); toast({ message: "Applied — work item created" }); load(); }
  async function reject(id: string) { await api(`/ai/proposals/${id}/reject`, { method: "POST", org: true }); load(); }

  if (disabled) return (<><h1 className="page-title">AI assistant</h1><div className="module-off">The AI module is disabled. Enable it under <strong>Modules</strong> to use the assistant.</div></>);

  return (
    <>
      <h1 className="page-title">AI assistant</h1>
      <p className="page-sub">The assistant drafts proposals from content you can access. Nothing changes until you confirm.</p>
      {status && <p className="muted" style={{ fontSize: 12 }}>Provider: {status.provider} · {status.healthy ? "healthy" : "degraded"} · budget {status.usedTokens}/{status.budgetTokens} tokens</p>}

      <div className="gpanel" style={{ marginBottom: 16 }}>
        <textarea className="input" rows={3} placeholder="Describe a task; the assistant will draft it…" value={text} onChange={(e) => setText(e.target.value)} style={{ marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: 180 }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={useRetrieval} onChange={(e) => setUseRetrieval(e.target.checked)} /> use my accessible items as context</label>
          <span style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={propose}>Draft proposal</button>
        </div>
      </div>

      <h3 style={{ fontSize: 14 }}>Proposals</h3>
      {proposals.length === 0 && <div className="empty">No proposals yet.</div>}
      {proposals.map((p) => (
        <div key={p.id} className="fieldcard">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{p.title}<span className="ai-badge">AI</span>{p.degraded && <span className="pill submitted" style={{ marginLeft: 6 }}>degraded</span>}</span>
            {p.status === "proposed" ? <span style={{ display: "flex", gap: 6 }}><button className="btn btn-primary" onClick={() => confirm(p.id)}>Confirm & create</button><button className="btn btn-ghost" onClick={() => reject(p.id)}>Reject</button></span>
              : <span className={`pill ${p.status === "applied" ? "approved" : "rejected"}`}>{p.status}</span>}
          </div>
          {p.citations.length > 0 && <div style={{ marginTop: 6 }}><span className="muted" style={{ fontSize: 11 }}>Sources: </span>{p.citations.map((c) => <span key={c.id} className="ai-cite mono">{c.key ?? c.id.slice(0, 8)}</span>)}</div>}
        </div>
      ))}
    </>
  );
}
