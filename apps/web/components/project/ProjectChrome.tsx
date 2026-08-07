"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Icon, type IconName } from "../ui/Icon";
import { useToast } from "../ui/Toast";

type Project = {
  id: string; name: string; keyPrefix: string; color?: string; health: string; status: string;
  privacy: string; version: number; description?: string | null; startDate?: string | null; dueDate?: string | null;
};
type Member = { id: string; userId: string; displayName: string; email: string; accessLevel: string; notifyTasks: boolean };
type Directory = { id: string; displayName: string; email: string };
type StatusUpdate = { id: string; health: string; title?: string; headline?: string; body: string | null; createdAt: string };

const tabs: { key: string; label: string; icon: IconName; suffix: string }[] = [
  { key: "overview", label: "Overview", icon: "home", suffix: "/overview" },
  { key: "list", label: "List", icon: "list", suffix: "" },
  { key: "board", label: "Board", icon: "board", suffix: "/board" },
  { key: "timeline", label: "Timeline", icon: "timeline", suffix: "/timeline" },
  { key: "gantt", label: "Gantt", icon: "gantt", suffix: "/gantt" },
  { key: "dashboard", label: "Dashboard", icon: "chart", suffix: "/reports" },
  { key: "calendar", label: "Calendar", icon: "calendar", suffix: "/calendar" },
  { key: "messages", label: "Messages", icon: "comment", suffix: "/messages" },
  { key: "files", label: "Files", icon: "paperclip", suffix: "/files" },
];

export function ProjectChrome({ project, view, onAddTask, onAddSection, onProjectChange }: {
  project: Project; view: string; onAddTask?: (typeKey?: string) => void; onAddSection?: () => void; onProjectChange?: () => void;
}) {
  const toast = useToast();
  const [share, setShare] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    api<{ projectId: string }[]>("/projects/favorites", { org: true })
      .then((r) => setFavorite(r.some((x) => x.projectId === project.id))).catch(() => {});
  }, [project.id]);

  async function toggleFavorite() {
    const next = !favorite; setFavorite(next);
    await api(`/projects/${project.id}/favorite`, { method: "PUT", org: true, body: JSON.stringify({ favorite: next }) })
      .catch(() => setFavorite(!next));
  }

  async function create(typeKey = "task") {
    if (onAddTask) return onAddTask(typeKey);
    const label = typeKey === "approval" ? "approval" : typeKey === "milestone" ? "milestone" : "task";
    const title = window.prompt(`Name this ${label}`);
    if (!title?.trim()) return;
    const row = await api<{ id: string; key: string }>("/work-items", {
      method: "POST", org: true, body: JSON.stringify({ projectId: project.id, title: title.trim(), typeKey }),
    });
    toast({ message: `${label[0].toUpperCase() + label.slice(1)} ${row.key} added` });
    onProjectChange?.();
  }

  async function addSection() {
    if (onAddSection) return onAddSection();
    const name = window.prompt("Section name");
    if (!name?.trim()) return;
    await api(`/projects/${project.id}/sections`, { method: "POST", org: true, body: JSON.stringify({ name: name.trim() }) });
    toast({ message: "Section added" }); onProjectChange?.();
  }

  return <>
    <header className="asana-project-head">
      <div className="project-head-main">
        <span className="project-icon-large" style={{ background: project.color || "#5b5fc7" }}>{project.name.slice(0, 1).toUpperCase()}</span>
        <div className="project-title-stack">
          <div className="project-title-line">
            <h1>{project.name}</h1>
            <button className="plain-chevron" aria-label="Project menu" onClick={() => setProjectMenu((v) => !v)}><Icon name="chevronDown" size={15} /></button>
            <button className="project-favorite" data-on={favorite} onClick={toggleFavorite} aria-label="Favorite project"><Icon name="star" size={17} /></button>
            {projectMenu && <div className="project-title-menu">
              <button onClick={() => { setCustomize(true); setProjectMenu(false); }}><Icon name="settings" size={15} />Edit project details</button>
              <button onClick={() => { navigator.clipboard.writeText(location.href); setProjectMenu(false); toast({ message: "Project link copied" }); }}><Icon name="link" size={15} />Copy project link</button>
              <a href={`/projects/${project.id}/overview`}><Icon name="activity" size={15} />Project status & activity</a>
              <a href="/settings/workspace"><Icon name="people" size={15} />Workspace settings</a>
            </div>}
          </div>
          <button className={`project-status project-health-${project.health}`} onClick={() => setStatusOpen(true)}>
            <span className="status-dot" />{project.health === "on_track" ? "On track" : project.health === "at_risk" ? "At risk" : project.health === "off_track" ? "Off track" : "Set status"}
          </button>
        </div>
      </div>
      <div className="project-head-actions">
        <MemberFaces projectId={project.id} />
        <button className="btn" onClick={() => setShare(true)}><Icon name="people" size={16} />Share</button>
        <button className="btn" onClick={() => setCustomize(true)}><Icon name="sliders" size={16} />Customize</button>
      </div>
    </header>

    <div className="project-tabs-wrap">
      <nav className="asana-project-tabs" aria-label="Project views">
        {tabs.map((t) => <a key={t.key} href={`/projects/${project.id}${t.suffix}`} data-active={view === t.key}><Icon name={t.icon} size={15} />{t.label}</a>)}
        <button className="tab-plus" onClick={() => setCustomize(true)} aria-label="Add project tab"><Icon name="plus" size={16} /></button>
      </nav>
      <div className="project-view-actions">
        <div className="split-create">
          <button className="btn btn-primary" onClick={() => create("task")}><Icon name="plus" size={16} />Add task</button>
          <button className="btn btn-primary split-arrow" onClick={() => setCreateMenu((v) => !v)} aria-label="Choose item type"><Icon name="chevronDown" size={14} /></button>
          {createMenu && <div className="create-type-menu">
            <button onClick={() => { create("task"); setCreateMenu(false); }}><Icon name="check" size={15} />Task</button>
            <button onClick={() => { create("approval"); setCreateMenu(false); }}><Icon name="approval" size={15} />Approval</button>
            <button onClick={() => { create("milestone"); setCreateMenu(false); }}><span className="diamond-mini">◆</span>Milestone</button>
            <button onClick={() => { addSection(); setCreateMenu(false); }}><Icon name="list" size={15} />Section</button>
          </div>}
        </div>
      </div>
    </div>

    {share && <ProjectShareModal project={project} onClose={() => setShare(false)} />}
    {customize && <CustomizeDrawer project={project} onClose={() => setCustomize(false)} onChanged={onProjectChange} />}
    {statusOpen && <StatusModal project={project} onClose={() => setStatusOpen(false)} onChanged={onProjectChange} />}
  </>;
}

function MemberFaces({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Member[]>([]);
  useEffect(() => { api<Member[]>(`/projects/${projectId}/members`, { org: true }).then(setRows).catch(() => {}); }, [projectId]);
  return <div className="member-faces">{rows.slice(0, 4).map((m, i) => <span key={m.id} title={m.displayName} style={{ zIndex: 5 - i }}>{m.displayName.slice(0, 1).toUpperCase()}</span>)}{rows.length > 4 && <span className="member-more">+{rows.length - 4}</span>}</div>;
}

function StatusModal({ project, onClose, onChanged }: { project: Project; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const [health, setHealth] = useState(project.health || "on_track");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  useEffect(() => { api<StatusUpdate[]>(`/projects/${project.id}/status-updates`, { org: true }).then(setUpdates).catch(() => {}); }, [project.id]);
  async function publish() {
    if (!headline.trim()) return;
    await api(`/projects/${project.id}/status-updates`, { method: "POST", org: true, body: JSON.stringify({ health, title: headline.trim(), body: body.trim() || undefined }) });
    const fresh = await api<Project>(`/projects/${project.id}`, { org: true });
    if (fresh.health !== health) await api(`/projects/${project.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: fresh.version, patch: { health } }) });
    toast({ message: "Project status published" }); onChanged?.(); onClose();
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="asana-status-modal">
    <div className="modal-title-row"><div><h2>Set project status</h2><p>Share a concise health update with project members.</p></div><button className="icon-btn" onClick={onClose}><Icon name="close" /></button></div>
    <div className="status-choice-row">{[["on_track", "On track"], ["at_risk", "At risk"], ["off_track", "Off track"]].map(([v, l]) => <button key={v} data-on={health === v} data-health={v} onClick={() => setHealth(v)}><span />{l}</button>)}</div>
    <label className="field"><span>Headline</span><input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="What changed?" /></label>
    <label className="field"><span>Details</span><textarea className="input status-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Progress, blockers, risks, next steps…" /></label>
    {updates[0] && <div className="last-status"><strong>Latest update</strong><span>{updates[0].headline ?? updates[0].title}</span></div>}
    <div className="modal-foot right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!headline.trim()} onClick={publish}>Publish status</button></div>
  </div></div>;
}

function ProjectShareModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [directory, setDirectory] = useState<Directory[]>([]);
  const [query, setQuery] = useState("");
  const [access, setAccess] = useState("editor");
  const [notify, setNotify] = useState(true);
  async function load() {
    const [a, b] = await Promise.all([api<Member[]>(`/projects/${project.id}/members`, { org: true }), api<Directory[]>("/directory/members", { org: true })]);
    setMembers(a); setDirectory(b);
  }
  useEffect(() => { load().catch(() => {}); }, [project.id]);
  const invited = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const choices = directory.filter((x) => !invited.has(x.id) && (`${x.displayName} ${x.email}`).toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  async function add(u: Directory) { await api(`/projects/${project.id}/members`, { method: "POST", org: true, body: JSON.stringify({ userId: u.id, accessLevel: access }) }); setQuery(""); await load(); }
  async function patch(m: Member, p: Record<string, unknown>) { await api(`/projects/${project.id}/members/${m.id}`, { method: "PATCH", org: true, body: JSON.stringify(p) }); await load(); }
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="asana-share-modal">
    <div className="modal-title-row"><h2>Share {project.name}</h2><button className="icon-btn" onClick={onClose}><Icon name="close" /></button></div>
    <div className="share-invite-row"><div className="share-search-wrap"><Icon name="search" size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invite with email or name" />{query && choices.length > 0 && <div className="share-suggestions">{choices.map((u) => <button onClick={() => add(u)} key={u.id}><span className="mini-avatar">{u.displayName.slice(0, 1)}</span><span><strong>{u.displayName}</strong><small>{u.email}</small></span></button>)}</div>}</div><select value={access} onChange={(e) => setAccess(e.target.value)}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option><option value="project_admin">Project admin</option></select></div>
    <label className="share-notify"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify members when tasks are added to this project</label>
    <div className="share-section-title">Who has access</div>
    <div className="share-workspace-row"><span className="share-workspace-icon"><Icon name={project.privacy === "private" ? "lock" : "people"} size={17} /></span><span><strong>{project.privacy === "private" ? "Private project" : "Workspace members"}</strong><small>{project.privacy === "private" ? "Only invited members can access" : "Workspace members can discover this project"}</small></span></div>
    <div className="member-access-list">{members.map((m) => <div key={m.id}><span className="mini-avatar">{m.displayName.slice(0, 1)}</span><span className="member-copy"><strong>{m.displayName}</strong><small>{m.email}</small></span><label className="tiny-checkbox"><input type="checkbox" checked={m.notifyTasks} onChange={(e) => patch(m, { notifyTasks: e.target.checked })} />Notify</label><select value={m.accessLevel} onChange={(e) => patch(m, { accessLevel: e.target.value })}><option value="viewer">Viewer</option><option value="commenter">Commenter</option><option value="editor">Editor</option><option value="project_admin">Project admin</option></select></div>)}</div>
    <div className="modal-foot"><a href="/settings/notifications">Manage notifications</a><button className="btn" onClick={() => { navigator.clipboard.writeText(location.href); toast({ message: "Project link copied" }); }}><Icon name="link" size={15} />Copy project link</button></div>
  </div></div>;
}

function CustomizeDrawer({ project, onClose, onChanged }: { project: Project; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const [description, setDescription] = useState(project.description || "");
  const [color, setColor] = useState(project.color || "#5b5fc7");
  const [privacy, setPrivacy] = useState(project.privacy || "workspace");
  const [startDate, setStartDate] = useState(project.startDate || "");
  const [dueDate, setDueDate] = useState(project.dueDate || "");
  const palette = ["#5b5fc7", "#f06a6a", "#e7a82f", "#20aa8f", "#4573d2", "#8d84e8", "#ea4e9d", "#7a7978"];
  async function saveProject() {
    const fresh = await api<Project>(`/projects/${project.id}`, { org: true });
    await api(`/projects/${project.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: fresh.version, patch: { description, color, privacy, startDate: startDate || null, dueDate: dueDate || null } }) });
    toast({ message: "Project settings saved" }); onChanged?.();
  }
  const items = [
    ["Fields", "Custom fields and calculated fields", "/admin/configure"], ["Forms", "Request intake and routing", "/admin/forms"],
    ["Emails", "Project email and task routing", "/communications"], ["Apps", "Integrations for this project", "/admin/integrations"],
    ["Task types and templates", "Task, approval and milestone layouts", "/admin/configure"], ["Bundles", "Reusable field/workflow/screen bundles", "/admin/configure"],
    ["Status templates", "Reusable project status updates", `/projects/${project.id}/overview`], ["Rules", "Automation and AI Studio rules", "/admin/configure"],
  ];
  return <><button className="drawer-overlay" onClick={onClose} aria-label="Close customize" /><aside className="customize-drawer">
    <div className="drawer-head"><h2>Customize</h2><button className="icon-btn" onClick={onClose}><Icon name="close" /></button></div>
    <div className="customize-section"><span className="customize-label">This project</span><textarea className="input project-desc-edit" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Project description" /><div className="project-color-palette">{palette.map((c) => <button key={c} style={{ background: c }} data-on={color === c} onClick={() => setColor(c)} aria-label={`Use ${c}`} />)}</div><div className="mini-form-grid"><label>Privacy<select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}><option value="workspace">Workspace</option><option value="private">Private</option></select></label><label>Start<input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label>Due<input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label></div><button className="btn btn-small" onClick={saveProject}>Save project settings</button></div>
    <div className="customize-ai"><span className="ai-star"><Icon name="sparkles" size={17} /></span><div><strong>AI Studio</strong><span>Create governed project rules and summaries</span></div><a href="/ai">Open</a></div>
    <div className="customize-section"><span className="customize-label">Workflow features</span>{items.map(([h, d, u]) => <a className="customize-row" href={u} key={h}><span><strong>{h}</strong><small>{d}</small></span><Icon name="chevronRight" size={15} /></a>)}</div>
  </aside></>;
}
