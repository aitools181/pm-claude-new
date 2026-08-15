"use client";


import { Button as UiButton } from "../ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../ui";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/Toast";
import { useModalDialog } from "../ui/useModalDialog";

type Project = { id: string; name: string; keyPrefix: string };
type Workspace = { id: string; name: string };
type Created = { id: string; owningProjectId: string };

export type CreateKind = "task" | "project" | "page" | "message" | "team" | "portfolio" | "goal" | "invite";

const KIND_META: Record<CreateKind, { title: string; cta: string }> = {
  task: { title: "Create new work", cta: "Create task" },
  project: { title: "Create a project", cta: "Create project" },
  page: { title: "Create a page", cta: "Create page" },
  message: { title: "Send a message", cta: "Send message" },
  team: { title: "Create a team", cta: "Create team" },
  portfolio: { title: "Create a portfolio", cta: "Create portfolio" },
  goal: { title: "Create a goal", cta: "Create goal" },
  invite: { title: "Invite teammates", cta: "Send invite" },
};

function keyPrefixFrom(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const prefix = letters.length > 1 ? letters.map((w) => w[0]).join("").slice(0, 5) : (letters[0] || "").slice(0, 5);
  return prefix || "PRJ";
}

export function GlobalCreateDialog({ open, kind = "task", initialTitle = "", onClose }: { open: boolean; kind?: CreateKind; initialTitle?: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projectId, setProjectId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [title, setTitle] = useState("");
  const [idemKey, setIdemKey] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [typeKey, setTypeKey] = useState<"task"|"approval"|"milestone">("task");
  const [privacy, setPrivacy] = useState<"workspace"|"private">("workspace");
  const [dueDate, setDueDate] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog<HTMLElement>(open, onClose, "input[autofocus]");
  const meta = KIND_META[kind];

  useEffect(() => {
    if (!open) return;
    setIdemKey(crypto.randomUUID());
    setError(null); setTitle(initialTitle); setDescription(""); setEmail(""); setDueDate("");
    if (kind === "task" || kind === "message") {
      api<Project[]>("/projects", { org: true })
        .then((rows) => { setProjects(rows); setProjectId((current) => current || rows[0]?.id || ""); })
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load projects"));
    }
    if (kind === "project") {
      api<Workspace[]>("/workspaces", { org: true })
        .then((rows) => { setWorkspaces(rows); setWorkspaceId((current) => current || rows[0]?.id || ""); })
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load workspaces"));
    }
  }, [open, kind, initialTitle]);

  const selected = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const canSubmit = kind === "invite" ? /.+@.+\..+/.test(email) : kind === "task" || kind === "message" ? Boolean(projectId && title.trim()) : kind === "project" ? Boolean(workspaceId && title.trim()) : Boolean(title.trim());

  async function submit(openAfter = false) {
    if (!canSubmit || saving) return;
    setSaving(true); setError(null);
    try {
      if (kind === "task") {
        const created = await api<Created>("/work-items", { method: "POST", org: true, idempotencyKey: idemKey, body: JSON.stringify({ projectId, title: title.trim(), description: description.trim() || undefined, priority, typeKey }) });
        toast({ message: `Created in ${selected?.name ?? "project"}` });
        onClose();
        if (openAfter) router.push(`/projects/${created.owningProjectId}?task=${created.id}`);
      } else if (kind === "project") {
        const created = await api<{ id: string }>("/projects", { method: "POST", org: true, body: JSON.stringify({ workspaceId, name: title.trim(), keyPrefix: keyPrefixFrom(title), privacy }) });
        toast({ message: "Project created" }); onClose(); router.push(`/projects/${created.id}`);
      } else if (kind === "page") {
        const created = await api<{ id: string }>("/documents", { method: "POST", org: true, body: JSON.stringify({ title: title.trim() }) });
        toast({ message: "Page created" }); onClose(); router.push(`/docs?doc=${created.id}`);
      } else if (kind === "message") {
        await api(`/projects/${projectId}/messages`, { method: "POST", org: true, body: JSON.stringify({ subject: title.trim(), body: description.trim() || undefined }) });
        toast({ message: `Message sent to ${selected?.name ?? "project"}` }); onClose(); router.push(`/projects/${projectId}/messages`);
      } else if (kind === "team") {
        await api("/workspaces", { method: "POST", org: true, body: JSON.stringify({ name: title.trim() }) });
        toast({ message: "Team created" }); onClose(); router.push("/settings/workspace");
      } else if (kind === "portfolio") {
        await api("/portfolios", { method: "POST", org: true, body: JSON.stringify({ name: title.trim(), description: description.trim() || undefined }) });
        toast({ message: "Portfolio created" }); onClose(); router.push("/portfolios");
      } else if (kind === "goal") {
        await api("/goals", { method: "POST", org: true, body: JSON.stringify({ name: title.trim(), description: description.trim() || undefined, dueDate: dueDate || undefined }) });
        toast({ message: "Goal created" }); onClose(); router.push("/goals");
      } else if (kind === "invite") {
        await api("/invitations", { method: "POST", org: true, body: JSON.stringify({ email: email.trim(), roleKey }) });
        toast({ message: `Invitation sent to ${email.trim()}` }); setEmail(""); onClose();
      }
      setTitle(""); setDescription(""); setPriority("normal"); setTypeKey("task");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Could not ${meta.cta.toLowerCase()}`);
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop create-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="global-create-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="create-dialog-head">
          <div>
            <div className="eyebrow">Create</div>
            <h2 id="global-create-title">{meta.title}</h2>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        {error && <div className="callout callout-danger">{error}</div>}

        {kind === "task" && <div className="create-kind-row">{([['task','Task','check'],['approval','Approval','approval'],['milestone','Milestone','goal']] as const).map(([key,label,icon])=><button type="button" key={key} data-on={typeKey===key} onClick={()=>setTypeKey(key)}><Icon name={icon} size={16}/>{label}</button>)}</div>}

        {kind !== "invite" && <label className="create-title-field">
          <span className="sr-only">{kind === "message" ? "Message subject" : `${meta.title} name`}</span>
          <UiInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "task" ? `Write a ${typeKey} name…` : kind === "message" ? "Message subject…" : `Name this ${kind}…`} onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(false); }
            if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); submit(true); }
          }} />
        </label>}

        {(kind === "task" || kind === "message" || kind === "portfolio" || kind === "goal") && <UiTextarea className="create-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === "message" ? "Write your message… " : "Add details (optional)"} />}

        {kind === "task" && <div className="create-meta-grid">
          <label><span>Project</span><UiSelect className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.keyPrefix})</option>)}</UiSelect></label>
          <label><span>Priority</span><UiSelect className="input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></UiSelect></label>
        </div>}
        {kind === "message" && <div className="create-meta-grid">
          <label><span>Project</span><UiSelect className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect></label>
        </div>}
        {kind === "project" && <div className="create-meta-grid">
          <label><span>Team</span><UiSelect className="input" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</UiSelect></label>
          <label><span>Privacy</span><UiSelect className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value as "workspace"|"private")}><option value="workspace">Workspace</option><option value="private">Private</option></UiSelect></label>
        </div>}
        {kind === "goal" && <div className="create-meta-grid">
          <label><span>Due date</span><UiInput className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        </div>}
        {kind === "invite" && <>
          <label className="create-title-field">
            <span className="sr-only">Email address</span>
            <UiInput autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(false); } }} />
          </label>
          <div className="create-meta-grid">
            <label><span>Role</span><UiSelect className="input" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>{["organization_admin","project_admin","team_leader","member","viewer"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</UiSelect></label>
          </div>
        </>}

        <div className="create-dialog-foot">
          <span className="key-hint">{kind === "task" ? <><kbd>Enter</kbd> create · <kbd>Shift</kbd> + <kbd>Enter</kbd> create and open</> : <><kbd>Enter</kbd> {meta.cta.toLowerCase()}</>}</span>
          <div className="button-row">
            <UiButton variant="secondary"  onClick={onClose}>Cancel</UiButton>
            <UiButton variant="primary"  disabled={!canSubmit || saving} onClick={() => submit(false)}>{saving ? "Creating…" : meta.cta}</UiButton>
          </div>
        </div>
        {kind === "task" && <div className="create-more-shortcuts"><span>Or create</span><a href="/projects">Project</a><a href="/docs">Document</a><a href="/goals">Goal</a><a href="/admin/forms">Form</a><a href="/dashboards">Dashboard</a><a href="/discovery">Idea</a><a href="/service">Service request</a></div>}
      </section>
    </div>
  );
}
