"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { enqueue, flush, getQueue, removeAction, updateAction, type QueuedAction } from "../../../lib/offline-queue";

type Project = { id: string; name: string };

export default function QuickCreatePage() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(() => setQueue(getQueue()), []);
  const send = useCallback((a: QueuedAction) => api("/work-items", { method: "POST", org: true, body: JSON.stringify(a.payload) }).then(() => undefined), []);
  const doFlush = useCallback(async () => { const r = await flush(send); refresh(); if (r.synced) toast({ message: `Synced ${r.synced} queued item(s)` }); if (r.conflicts) toast({ message: `${r.conflicts} item(s) need attention` }); }, [send, refresh, toast]);

  useEffect(() => {
    api<Project[]>("/projects", { org: true }).then((p) => { setProjects(p); setProjectId((id) => id || p[0]?.id || ""); }).catch(() => {});
    setOnline(navigator.onLine); refresh();
    const on = () => { setOnline(true); doFlush(); }; const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    if (navigator.onLine) doFlush();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [doFlush, refresh]);

  async function add() {
    if (!projectId || !title.trim()) return;
    const payload = { projectId, title: title.trim() };
    setTitle("");
    if (navigator.onLine) {
      try { await api("/work-items", { method: "POST", org: true, body: JSON.stringify(payload) }); toast({ message: "Created" }); }
      catch (e) { if (e instanceof ApiError) { enqueue("createWorkItem", payload); refresh(); toast({ message: "Saved to queue" }); } }
    } else { enqueue("createWorkItem", payload); refresh(); toast({ message: "Offline — saved to queue" }); }
  }
  async function retry(a: QueuedAction) { updateAction(a.id, { status: "pending", error: undefined }); refresh(); await doFlush(); }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <h1 className="page-title">Quick add</h1>
      <p className="page-sub">{online ? "Online — items are created immediately." : "Offline — items are queued and sync automatically when you reconnect."}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ minWidth: 140 }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input className="input" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1, minWidth: 160 }} />
        <button className="btn btn-primary" onClick={add}>Add</button>
      </div>

      {queue.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 14 }}>Pending sync ({queue.length})</h3>
            {online && <button className="btn btn-ghost" onClick={doFlush}>Sync now</button>}
          </div>
          {queue.map((a) => (
            <div key={a.id} className="fieldcard" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{a.payload.title} {a.status === "conflict" ? <span className="pill rejected" style={{ marginLeft: 6 }}>conflict</span> : <span className="pill submitted" style={{ marginLeft: 6 }}>queued</span>}{a.error && <span className="muted" style={{ fontSize: 11, display: "block" }}>{a.error}</span>}</span>
              {a.status === "conflict" && <span style={{ display: "flex", gap: 6 }}><button className="btn btn-ghost" onClick={() => retry(a)}>Retry</button><button className="btn btn-ghost" onClick={() => { removeAction(a.id); refresh(); }}>Discard</button></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
