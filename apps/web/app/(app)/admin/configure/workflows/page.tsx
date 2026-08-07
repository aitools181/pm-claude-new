"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Input } from "../../../../../components/ui/Field";

type Workflow = { id: string; name: string; publishedVersionId: string | null };

export default function WorkflowsList() {
  const router = useRouter();
  const [rows, setRows] = useState<Workflow[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api<Workflow[]>("/workflows", { org: true }).then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create() {
    try { const res = await api<{ workflow: Workflow }>("/workflows", { method: "POST", org: true, body: JSON.stringify({ name }) }); router.push(`/admin/configure/workflows/${res.workflow.id}`); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }

  return (
    <>
      <h1 className="page-title">Workflows</h1>
      <p className="page-sub">Design statuses and transitions, publish an immutable version, then migrate.</p>
      {msg && <div className="callout callout-danger" style={{ marginBottom: 14 }}>{msg}</div>}
      <div className="card card-p" style={{ marginBottom: 20, display: "flex", gap: 8, maxWidth: 460 }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Development Flow" />
        <button className="btn btn-primary" disabled={!name} onClick={create}>Create</button>
      </div>
      <div className="card">
        {rows.length === 0 && <div style={{ padding: 16, color: "var(--ink-3)" }}>No workflows yet.</div>}
        {rows.map((w) => (
          <a key={w.id} href={`/admin/configure/workflows/${w.id}`} className="wi-row" style={{ gridTemplateColumns: "1fr 120px" }}>
            <span className="wi-title">{w.name}</span>
            <span className={`badge ${w.publishedVersionId ? "pill-published" : "pill-draft"}`}>{w.publishedVersionId ? "published" : "draft"}</span>
          </a>
        ))}
      </div>
    </>
  );
}
