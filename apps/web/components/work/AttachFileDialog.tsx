"use client";
import { useMemo, useRef, useState } from "react";
import { api, apiUpload } from "../../lib/api";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/Toast";

export type AttachTarget = { id: string; key: string; title: string };

export function AttachFileDialog({ tasks, initialTaskId, onClose, onUploaded }: { tasks: AttachTarget[]; initialTaskId?: string | null; onClose: () => void; onUploaded: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [targetId, setTargetId] = useState(initialTaskId || tasks[0]?.id || "");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const filtered = useMemo(() => tasks.filter((task) => `${task.key} ${task.title}`.toLowerCase().includes(query.toLowerCase())).slice(0, 30), [tasks, query]);

  async function upload(file: File) {
    if (!targetId || uploading) return;
    setUploading(true);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
      const grant = await api<{ uploadToken: string }>(`/work-items/${targetId}/attachments`, {
        method: "POST", org: true,
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", bytes: file.size, sha256 }),
      });
      await apiUpload(`/files/upload/${grant.uploadToken}`, file);
      toast({ message: `${file.name} added` });
      onUploaded();
      onClose();
    } finally { setUploading(false); }
  }

  return <div className="modal-backdrop attach-file-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <div className="modal-card attach-file-dialog">
      <div className="modal-title-row"><div><h2>Add file</h2><p>Choose the task that should own this project file.</p></div><button className="icon-btn" onClick={onClose}><Icon name="close" /></button></div>
      <label className="field"><span>Attach to task</span><input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label>
      <div className="attach-target-list">{filtered.map((task) => <button key={task.id} data-active={targetId === task.id} onClick={() => setTargetId(task.id)}><Icon name={targetId === task.id ? "check" : "circle"} size={16}/><span><strong>{task.title}</strong><small>{task.key}</small></span></button>)}</div>
      {!tasks.length && <div className="compact-empty"><Icon name="paperclip"/><strong>Create a task first</strong><span>Files are attached to work items so permissions and history stay consistent.</span></div>}
      <input ref={inputRef} hidden type="file" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
      <div className="modal-foot right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!targetId || uploading} onClick={() => inputRef.current?.click()}><Icon name="paperclip" size={15}/>{uploading ? "Uploading…" : "Choose file"}</button></div>
    </div>
  </div>;
}
