"use client";

import { Button as UiButton } from "../../../../../components/ui";
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
      {msg && <div className="callout callout-danger ui-static-2b583d73" >{msg}</div>}
      <div className="card card-p ui-static-76c744f9" >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Development Flow" />
        <UiButton variant="primary"  disabled={!name} onClick={create}>Create</UiButton>
      </div>
      <div className="card">
        {rows.length === 0 && <div className="ui-static-cfad4427">No workflows yet.</div>}
        {rows.map((w) => (
          <a key={w.id} href={`/admin/configure/workflows/${w.id}`} className="wi-row ui-static-b4a3ead0" >
            <span className="wi-title">{w.name}</span>
            <span className={`badge ${w.publishedVersionId ? "pill-published" : "pill-draft"}`}>{w.publishedVersionId ? "published" : "draft"}</span>
          </a>
        ))}
      </div>
    </>
  );
}
