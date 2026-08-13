"use client";
import { useMemo, useRef, useState } from "react";
import { api, apiUpload } from "../../lib/api";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/Display";
import { Field, Input } from "../ui/Field";
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
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : "Could not upload file", tone: "error" });
    } finally { setUploading(false); }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add file"
      description="Choose the task that should own this project file."
      className="attach-file-dialog"
      initialFocusSelector="input:not([type=file])"
      closeLabel="Close add file dialog"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" leadingIcon="paperclip" loading={uploading} disabled={!targetId} onClick={() => inputRef.current?.click()}>{uploading ? "Uploading" : "Choose file"}</Button></>}
    >
      <Field label="Attach to task">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" />
      </Field>
      <div className="attach-target-list" aria-label="Task to attach file to">
        {filtered.map((task) => <button type="button" aria-pressed={targetId === task.id} key={task.id} data-active={targetId === task.id} onClick={() => setTargetId(task.id)}><Icon name={targetId === task.id ? "check" : "circle"} size={16}/><span><strong>{task.title}</strong><small>{task.key}</small></span></button>)}
      </div>
      {!tasks.length ? <EmptyState title="Create a task first" description="Files are attached to work items so permissions and history stay consistent." icon="paperclip" /> : null}
      <input ref={inputRef} hidden type="file" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
    </Dialog>
  );
}
