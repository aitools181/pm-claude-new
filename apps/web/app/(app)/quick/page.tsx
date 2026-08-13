"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../components/ui";
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
    <div className="ui-static-34a7c6fd">
      <h1 className="page-title">Quick add</h1>
      <p className="page-sub">{online ? "Online — items are created immediately." : "Offline — items are queued and sync automatically when you reconnect."}</p>

      <div className="ui-static-4748c51c">
        <UiSelect className="input ui-static-4592c743" value={projectId} onChange={(e) => setProjectId(e.target.value)} >{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect>
        <UiInput className="input ui-static-eb62184e" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}  />
        <UiButton variant="primary"  onClick={add}>Add</UiButton>
      </div>

      {queue.length > 0 && (
        <div>
          <div className="ui-static-13313b1a">
            <h3 className="ui-static-433de30b">Pending sync ({queue.length})</h3>
            {online && <UiButton variant="tertiary"  onClick={doFlush}>Sync now</UiButton>}
          </div>
          {queue.map((a) => (
            <div key={a.id} className="fieldcard ui-static-13313b1a" >
              <span>{a.payload.title} {a.status === "conflict" ? <span className="pill rejected ui-static-391ef124" >conflict</span> : <span className="pill submitted ui-static-391ef124" >queued</span>}{a.error && <span className="muted ui-static-9456bf7e" >{a.error}</span>}</span>
              {a.status === "conflict" && <span className="ui-static-49cd0921"><UiButton variant="tertiary"  onClick={() => retry(a)}>Retry</UiButton><UiButton variant="tertiary"  onClick={() => { removeAction(a.id); refresh(); }}>Discard</UiButton></span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
