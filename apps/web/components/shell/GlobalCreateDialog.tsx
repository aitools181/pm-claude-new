"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/Toast";

type Project = { id: string; name: string; keyPrefix: string };
type Created = { id: string; owningProjectId: string };

export function GlobalCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [typeKey, setTypeKey] = useState<"task"|"approval"|"milestone">("task");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api<Project[]>("/projects", { org: true })
      .then((rows) => { setProjects(rows); setProjectId((current) => current || rows[0]?.id || ""); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load projects"));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const selected = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  async function submit(openAfter = false) {
    if (!projectId || !title.trim() || saving) return;
    setSaving(true); setError(null);
    try {
      const created = await api<Created>("/work-items", {
        method: "POST",
        org: true,
        body: JSON.stringify({ projectId, title: title.trim(), description: description.trim() || undefined, priority, typeKey }),
      });
      toast({ message: `Created in ${selected?.name ?? "project"}` });
      setTitle(""); setDescription(""); setPriority("normal"); setTypeKey("task"); onClose();
      if (openAfter) router.push(`/projects/${created.owningProjectId}?task=${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create task");
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop create-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="global-create-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="create-dialog-head">
          <div>
            <div className="eyebrow">Create</div>
            <h2 id="global-create-title">Create new work</h2>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        {error && <div className="callout callout-danger">{error}</div>}
        <div className="create-kind-row">{([['task','Task','check'],['approval','Approval','approval'],['milestone','Milestone','goal']] as const).map(([key,label,icon])=><button type="button" key={key} data-on={typeKey===key} onClick={()=>setTypeKey(key)}><Icon name={icon} size={16}/>{label}</button>)}</div>
        <label className="create-title-field">
          <span className="sr-only">Task title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Write a ${typeKey} name…`} onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(false); }
            if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); submit(true); }
          }} />
        </label>
        <textarea className="create-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add details (optional)" />
        <div className="create-meta-grid">
          <label><span>Project</span><select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.keyPrefix})</option>)}</select></label>
          <label><span>Priority</span><select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        </div>
        <div className="create-dialog-foot">
          <span className="key-hint"><kbd>Enter</kbd> create · <kbd>Shift</kbd> + <kbd>Enter</kbd> create and open</span>
          <div className="button-row">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!projectId || !title.trim() || saving} onClick={() => submit(false)}>{saving ? "Creating…" : "Create task"}</button>
          </div>
        </div>
        <div className="create-more-shortcuts"><span>Or create</span><a href="/projects">Project</a><a href="/docs">Document</a><a href="/goals">Goal</a><a href="/admin/forms">Form</a><a href="/dashboards">Dashboard</a><a href="/discovery">Idea</a><a href="/service">Service request</a></div>
      </section>
    </div>
  );
}
