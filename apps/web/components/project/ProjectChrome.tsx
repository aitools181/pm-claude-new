"use client";


import { Button as UiButton } from "../ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../ui";
import { appPrompt } from "../ui/AppDialog";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { Icon, type IconName } from "../ui/Icon";
import { useToast } from "../ui/Toast";
import { useModalDialog } from "../ui/useModalDialog";
import { appConfirm } from "../ui/AppDialog";
import { PROJECT_COLOR_PALETTE } from "../theme/themeTokens";
import { RuntimeStyle } from "../ui/RuntimeStyle";

type Project = {
  id: string; name: string; keyPrefix: string; color?: string; health: string; status: string;
  privacy: string; version: number; description?: string | null; startDate?: string | null; dueDate?: string | null; icon?: string | null;
};
type SavedView = { id: string; name: string; viewType: string; isDefault: boolean; filters?: Record<string, unknown>; columns?: unknown[]; sortSpec?: Record<string, unknown>; groupBy?: string | null };
type Member = { id: string; userId: string; displayName: string; email: string; accessLevel: string; notifyTasks: boolean };
type Directory = { id: string; displayName: string; email: string };
type StatusUpdate = { id: string; health: string; title?: string; headline?: string; body: string | null; createdAt: string };

const tabs: { key: string; label: string; icon: IconName; suffix: string }[] = [
  { key: "overview", label: "Overview", icon: "home", suffix: "/overview" },
  { key: "list", label: "List", icon: "list", suffix: "" },
  { key: "board", label: "Board", icon: "board", suffix: "/board" },
  { key: "workflow", label: "Workflow", icon: "integration", suffix: "/workflow" },
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [share, setShare] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewMenu, setViewMenu] = useState<string | null>(null);
  const [portfolioMenu, setPortfolioMenu] = useState(false);
  const [portfolios, setPortfolios] = useState<{ id: string; name: string }[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function duplicateProject() {
    if (busyAction) return; setBusyAction("duplicate");
    try {
      const created = await api<{ id: string; copiedItems: number; copiedSections: number }>(`/projects/${project.id}/duplicate`, { method: "POST", org: true, body: JSON.stringify({}) });
      toast({ message: `Project duplicated — ${created.copiedSections} sections, ${created.copiedItems} tasks copied` });
      setProjectMenu(false); router.push(`/projects/${created.id}`);
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Could not duplicate project", tone: "error" }); }
    finally { setBusyAction(null); }
  }
  async function saveAsTemplate() {
    if (busyAction) return; setBusyAction("template");
    try {
      const [sections, items] = await Promise.all([
        api<{ id: string; name: string; rank: string }[]>(`/projects/${project.id}/sections`, { org: true }),
        api<{ id: string; title: string; parentId: string | null; sectionId: string | null; priority: string; status: string; description?: string | null }[]>(`/projects/${project.id}/work-items?limit=500`, { org: true }),
      ]);
      await api("/templates", { method: "POST", org: true, body: JSON.stringify({ kind: "project", name: `${project.name} template`, content: {
        sourceProjectId: project.id, name: project.name, description: project.description ?? null, color: project.color ?? null, icon: project.icon ?? null,
        sections: sections.map((s) => ({ name: s.name, rank: s.rank })),
        items: items.map((x) => ({ title: x.title, parentRef: x.parentId, ref: x.id, sectionName: sections.find((s) => s.id === x.sectionId)?.name ?? null, priority: x.priority, status: x.status, description: x.description ?? null })),
      } }) });
      toast({ message: "Saved as project template" }); setProjectMenu(false);
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Could not save template", tone: "error" }); }
    finally { setBusyAction(null); }
  }
  async function openPortfolioMenu() {
    setPortfolioMenu((v) => !v);
    if (!portfolios.length) { try { setPortfolios(await api<{ id: string; name: string }[]>("/portfolios", { org: true })); } catch { setPortfolios([]); } }
  }
  async function addToPortfolio(pid: string, pname: string) {
    try { await api(`/portfolios/${pid}/projects`, { method: "POST", org: true, body: JSON.stringify({ projectId: project.id }) }); toast({ message: `Added to ${pname}` }); }
    catch (e) { toast({ message: e instanceof Error ? e.message : "Could not add to portfolio", tone: "error" }); }
    setPortfolioMenu(false); setProjectMenu(false);
  }
  async function toggleArchive() {
    const archiving = project.status !== "archived";
    try {
      const fresh = await api<Project>(`/projects/${project.id}`, { org: true });
      await api(`/projects/${project.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: fresh.version, patch: { status: archiving ? "archived" : "active" } }) });
      toast({ message: archiving ? "Project archived" : "Project unarchived" }); setProjectMenu(false); onProjectChange?.();
    } catch (e) { toast({ message: e instanceof Error ? e.message : "Could not update project", tone: "error" }); }
  }
  async function deleteProject() {
    const ok = await appConfirm(`Delete ${project.name}? Tasks stay recoverable by an admin, but the project disappears for everyone.`, { confirmLabel: "Delete project" });
    if (!ok) return;
    try { await api(`/projects/${project.id}`, { method: "DELETE", org: true }); toast({ message: "Project deleted" }); router.push("/projects"); }
    catch (e) { toast({ message: e instanceof Error ? e.message : "Could not delete project", tone: "error" }); }
  }

  useEffect(() => {
    api<{ projectId: string }[]>("/projects/favorites", { org: true })
      .then((r) => setFavorite(r.some((x) => x.projectId === project.id))).catch(() => {});
    api<SavedView[]>(`/ui/saved-views?scopeType=project&scopeId=${project.id}`, { org: true }).then(setSavedViews).catch(() => setSavedViews([]));
  }, [project.id]);

  async function reloadViews(){ setSavedViews(await api<SavedView[]>(`/ui/saved-views?scopeType=project&scopeId=${project.id}`, {org:true})); }
  async function renameView(row: SavedView){ const name=await appPrompt("Rename view", row.name); if(!name?.trim())return; try{await api(`/ui/saved-views/${row.id}`,{method:"PATCH",org:true,body:JSON.stringify({name:name.trim()})}); await reloadViews();}catch(err){toast({message:err instanceof Error?err.message:"Could not rename the view",tone:"error"});} }
  async function setDefaultView(row: SavedView){ try{await api(`/ui/saved-views/${row.id}`,{method:"PATCH",org:true,body:JSON.stringify({isDefault:true})}); toast({message:`${row.name} is now the default view`}); await reloadViews();}catch(err){toast({message:err instanceof Error?err.message:"Could not set the default view",tone:"error"});} }
  async function duplicateView(row: SavedView){ try{await api(`/ui/saved-views/${row.id}/duplicate`,{method:"POST",org:true}); await reloadViews();}catch(err){toast({message:err instanceof Error?err.message:"Could not duplicate the view",tone:"error"});} }
  async function removeView(row: SavedView){ if(!await appConfirm(`Remove the "${row.name}" view? Anyone using it will lose this saved filter set.`, { confirmLabel: "Remove view" })) return; try{await api(`/ui/saved-views/${row.id}`,{method:"DELETE",org:true}); if(searchParams.get("savedView")===row.id) location.href=`/projects/${project.id}`; else await reloadViews();}catch(err){toast({message:err instanceof Error?err.message:"Could not remove the view",tone:"error"});} }

  async function toggleFavorite() {
    const next = !favorite; setFavorite(next);
    await api(`/projects/${project.id}/favorite`, { method: "PUT", org: true, body: JSON.stringify({ favorite: next }) })
      .catch(() => setFavorite(!next));
  }

  async function create(typeKey = "task") {
    if (onAddTask) return onAddTask(typeKey);
    const label = typeKey === "approval" ? "approval" : typeKey === "milestone" ? "milestone" : "task";
    const title = await appPrompt(`Name this ${label}`);
    if (!title?.trim()) return;
    try {
      const row = await api<{ id: string; key: string }>("/work-items", {
        method: "POST", org: true, body: JSON.stringify({ projectId: project.id, title: title.trim(), typeKey }),
      });
      toast({ message: `${label[0].toUpperCase() + label.slice(1)} ${row.key} added` });
      onProjectChange?.();
    } catch (err) { toast({ message: err instanceof Error ? err.message : `Could not add the ${label}`, tone: "error" }); }
  }

  async function addSection() {
    if (onAddSection) return onAddSection();
    const name = await appPrompt("Section name");
    if (!name?.trim()) return;
    try { await api(`/projects/${project.id}/sections`, { method: "POST", org: true, body: JSON.stringify({ name: name.trim() }) }); toast({ message: "Section added" }); onProjectChange?.(); }
    catch (err) { toast({ message: err instanceof Error ? err.message : "Could not add the section", tone: "error" }); }
  }

  return <>
    <header className="asana-project-head">
      <div className="project-head-main">
        <RuntimeStyle as="span" className="project-icon-large runtime-bg" vars={{ "--runtime-bg": project.color || "var(--ui-action)" }}>{project.icon && project.icon !== "project" ? <Icon name={project.icon as IconName} size={20}/> : project.name.slice(0, 1).toUpperCase()}</RuntimeStyle>
        <div className="project-title-stack">
          <div className="project-title-line">
            <h1>{project.name}</h1>
            <button className="plain-chevron" aria-label="Project menu" onClick={() => setProjectMenu((v) => !v)}><Icon name="chevronDown" size={15} /></button>
            <button className="project-favorite" data-on={favorite} onClick={toggleFavorite} aria-label="Favorite project"><Icon name="star" size={17} /></button>
            {projectMenu && <div className="project-title-menu">
              <button onClick={() => { setCustomize(true); setProjectMenu(false); }}><Icon name="settings" size={15} />Edit project details</button>
              <button onClick={() => { navigator.clipboard.writeText(location.href); setProjectMenu(false); toast({ message: "Project link copied" }); }}><Icon name="link" size={15} />Copy project link</button>
              <a href={`/projects/${project.id}/overview`}><Icon name="activity" size={15} />Project status & activity</a>
              <div className="menu-divider" />
              <button onClick={duplicateProject} disabled={busyAction === "duplicate"}><Icon name="copy" size={15} />{busyAction === "duplicate" ? "Duplicating…" : "Duplicate project"}</button>
              <button onClick={saveAsTemplate} disabled={busyAction === "template"}><Icon name="docs" size={15} />{busyAction === "template" ? "Saving…" : "Save as template"}</button>
              <span className="portfolio-submenu-wrap"><button aria-haspopup="menu" aria-expanded={portfolioMenu} onClick={openPortfolioMenu}><Icon name="portfolio" size={15} />Add to portfolio…</button>
              {portfolioMenu && <div className="project-submenu">{portfolios.map((p) => <button key={p.id} onClick={() => addToPortfolio(p.id, p.name)}>{p.name}</button>)}{!portfolios.length && <span className="submenu-empty">No portfolios yet</span>}<a href="/portfolios">New portfolio…</a></div>}</span>
              <div className="menu-divider" />
              <button onClick={toggleArchive}><Icon name="inbox" size={15} />{project.status === "archived" ? "Unarchive project" : "Archive project"}</button>
              <button className="danger-menu-item" onClick={deleteProject}><Icon name="trash" size={15} />Delete project</button>
              <div className="menu-divider" />
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
        <UiButton variant="secondary"  onClick={() => setShare(true)}><Icon name="people" size={16} />Share</UiButton>
        <UiButton variant="secondary"  onClick={() => setCustomize(true)}><Icon name="sliders" size={16} />Customize</UiButton>
      </div>
    </header>

    <div className="project-tabs-wrap">
      <nav className="asana-project-tabs" aria-label="Project views">
        {tabs.map((t) => <a key={t.key} href={`/projects/${project.id}${t.suffix}`} data-active={view === t.key && !searchParams.get("savedView")}><Icon name={t.icon} size={15} />{t.label}</a>)}
        {savedViews.map((row)=><span className="project-custom-tab" key={row.id}><a href={`/projects/${project.id}?savedView=${row.id}`} data-active={searchParams.get("savedView")===row.id}><Icon name={row.viewType==="board"?"board":"list"} size={15}/>{row.name}{row.isDefault?<span title="Default view">•</span>:null}</a><button aria-label={`Manage ${row.name}`} onClick={()=>setViewMenu(viewMenu===row.id?null:row.id)}><Icon name="chevronDown" size={13}/></button>{viewMenu===row.id&&<div className="project-view-menu"><button onClick={()=>renameView(row)}>Rename view</button><button onClick={()=>setDefaultView(row)}>Set as default</button><button onClick={()=>duplicateView(row)}>Make a copy</button><button onClick={()=>{navigator.clipboard.writeText(`${location.origin}/projects/${project.id}?savedView=${row.id}`);toast({message:"View link copied"});setViewMenu(null)}}>Copy view link</button><button className="danger" onClick={()=>removeView(row)}>Remove view</button></div>}</span>)}
        <button className="tab-plus" onClick={async()=>{const name=await appPrompt("New view name","Custom view");if(!name?.trim())return;await api("/ui/saved-views",{method:"POST",org:true,body:JSON.stringify({scopeType:"project",scopeId:project.id,name:name.trim(),viewType:"list"})});await reloadViews();}} aria-label="Add project tab"><Icon name="plus" size={16} /></button>
      </nav>
      <div className="project-view-actions">
        <div className="split-create">
          <UiButton variant="primary"  onClick={() => create("task")}><Icon name="plus" size={16} />Add task</UiButton>
          <UiButton variant="primary" className="split-arrow" onClick={() => setCreateMenu((v) => !v)} aria-label="Choose item type"><Icon name="chevronDown" size={14} /></UiButton>
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
  return <div className="member-faces">{rows.slice(0, 4).map((m) => <span key={m.id} title={m.displayName}>{m.displayName.slice(0, 1).toUpperCase()}</span>)}{rows.length > 4 && <span className="member-more">+{rows.length - 4}</span>}</div>;
}

function StatusModal({ project, onClose, onChanged }: { project: Project; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const dialogRef = useModalDialog<HTMLDivElement>(true, onClose, "input");
  const [health, setHealth] = useState(project.health || "on_track");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  useEffect(() => { api<StatusUpdate[]>(`/projects/${project.id}/status-updates`, { org: true }).then(setUpdates).catch(() => {}); }, [project.id]);
  async function publish() {
    if (!headline.trim()) return;
    try {
      await api(`/projects/${project.id}/status-updates`, { method: "POST", org: true, body: JSON.stringify({ health, title: headline.trim(), body: body.trim() || undefined }) });
      const fresh = await api<Project>(`/projects/${project.id}`, { org: true });
      if (fresh.health !== health) await api(`/projects/${project.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: fresh.version, patch: { health } }) });
      toast({ message: "Project status published" }); onChanged?.(); onClose();
    } catch (err) { toast({ message: err instanceof Error ? err.message : "Could not publish the status update", tone: "error" }); }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div ref={dialogRef} tabIndex={-1} className="asana-status-modal" role="dialog" aria-modal="true" aria-labelledby="project-status-title">
    <div className="modal-title-row"><div><h2 id="project-status-title">Set project status</h2><p>Share a concise health update with project members.</p></div><button className="icon-btn" aria-label="Close project status dialog" onClick={onClose}><Icon name="close" /></button></div>
    <div className="status-choice-row">{[["on_track", "On track"], ["at_risk", "At risk"], ["off_track", "Off track"]].map(([v, l]) => <button key={v} data-on={health === v} data-health={v} onClick={() => setHealth(v)}><span />{l}</button>)}</div>
    <label className="field"><span>Headline</span><UiInput className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="What changed?" /></label>
    <label className="field"><span>Details</span><UiTextarea className="input status-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Progress, blockers, risks, next steps…" /></label>
    {updates[0] && <div className="last-status"><strong>Latest update</strong><span>{updates[0].headline ?? updates[0].title}</span></div>}
    <div className="modal-foot right"><UiButton variant="secondary"  onClick={onClose}>Cancel</UiButton><UiButton variant="primary"  disabled={!headline.trim()} onClick={publish}>Publish status</UiButton></div>
  </div></div>;
}

function ProjectShareModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const toast = useToast();
  const dialogRef = useModalDialog<HTMLDivElement>(true, onClose, ".share-search-wrap input");
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
  async function add(u: Directory) { try { await api(`/projects/${project.id}/members`, { method: "POST", org: true, body: JSON.stringify({ userId: u.id, accessLevel: access }) }); setQuery(""); await load(); } catch (err) { toast({ message: err instanceof Error ? err.message : "Could not add the member", tone: "error" }); } }
  async function patch(m: Member, p: Record<string, unknown>) { try { await api(`/projects/${project.id}/members/${m.id}`, { method: "PATCH", org: true, body: JSON.stringify(p) }); await load(); } catch (err) { toast({ message: err instanceof Error ? err.message : "Could not update the member", tone: "error" }); } }
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div ref={dialogRef} tabIndex={-1} className="asana-share-modal" role="dialog" aria-modal="true" aria-labelledby="project-share-title">
    <div className="modal-title-row"><h2 id="project-share-title">Share {project.name}</h2><button className="icon-btn" aria-label="Close share project dialog" onClick={onClose}><Icon name="close" /></button></div>
    <div className="share-invite-row"><div className="share-search-wrap"><Icon name="search" size={15} /><UiInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invite with email or name" />{query && choices.length > 0 && <div className="share-suggestions">{choices.map((u) => <button onClick={() => add(u)} key={u.id}><span className="mini-avatar">{u.displayName.slice(0, 1)}</span><span><strong>{u.displayName}</strong><small>{u.email}</small></span></button>)}</div>}</div><UiSelect value={access} onChange={(e) => setAccess(e.target.value)}><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option><option value="project_admin">Project admin</option></UiSelect></div>
    <label className="share-notify"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify members when tasks are added to this project</label>
    <div className="share-section-title">Who has access</div>
    <div className="share-workspace-row"><span className="share-workspace-icon"><Icon name={project.privacy === "private" ? "lock" : "people"} size={17} /></span><span><strong>{project.privacy === "private" ? "Private project" : "Workspace members"}</strong><small>{project.privacy === "private" ? "Only invited members can access" : "Workspace members can discover this project"}</small></span></div>
    <div className="member-access-list">{members.map((m) => <div key={m.id}><span className="mini-avatar">{m.displayName.slice(0, 1)}</span><span className="member-copy"><strong>{m.displayName}</strong><small>{m.email}</small></span><label className="tiny-checkbox"><input type="checkbox" checked={m.notifyTasks} onChange={(e) => patch(m, { notifyTasks: e.target.checked })} />Notify</label><UiSelect value={m.accessLevel} onChange={(e) => patch(m, { accessLevel: e.target.value })}><option value="viewer">Viewer</option><option value="commenter">Commenter</option><option value="editor">Editor</option><option value="project_admin">Project admin</option></UiSelect></div>)}</div>
    <div className="modal-foot"><a href="/settings/notifications">Manage notifications</a><UiButton variant="secondary"  onClick={() => { navigator.clipboard.writeText(location.href); toast({ message: "Project link copied" }); }}><Icon name="link" size={15} />Copy project link</UiButton></div>
  </div></div>;
}

function CustomizeDrawer({ project, onClose, onChanged }: { project: Project; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const drawerRef = useModalDialog<HTMLElement>(true, onClose);
  const [description, setDescription] = useState(project.description || "");
  const [icon, setIcon] = useState(project.icon || "project");
  const [color, setColor] = useState(project.color || "var(--ui-action)");
  const [privacy, setPrivacy] = useState(project.privacy || "workspace");
  const [startDate, setStartDate] = useState(project.startDate || "");
  const [dueDate, setDueDate] = useState(project.dueDate || "");
  const palette = PROJECT_COLOR_PALETTE;
  async function saveProject() {
    try {
      const fresh = await api<Project>(`/projects/${project.id}`, { org: true });
      await api(`/projects/${project.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: fresh.version, patch: { description, color, icon, privacy, startDate: startDate || null, dueDate: dueDate || null } }) });
      toast({ message: "Project settings saved" }); onChanged?.();
    } catch (err) { toast({ message: err instanceof Error ? err.message : "Could not save project settings", tone: "error" }); }
  }
  const items = [
    ["Fields", "Custom fields and calculated fields", "/admin/configure"], ["Forms", "Request intake and routing", "/admin/forms"],
    ["Emails", "Project email and task routing", "/communications"], ["Apps", "Integrations for this project", "/admin/integrations"],
    ["Task types and templates", "Task, approval and milestone layouts", "/admin/configure"], ["Bundles", "Reusable field/workflow/screen bundles", "/admin/configure"],
    ["Status templates", "Reusable project status updates", `/projects/${project.id}/overview`], ["Rules", "Automation and AI Studio rules", "/admin/configure"],
    ["Security levels", "Restrict who can see specific tasks", `/projects/${project.id}/security`],
  ];
  return <><button className="drawer-overlay" onClick={onClose} aria-label="Close customize" /><aside ref={drawerRef} tabIndex={-1} className="customize-drawer" role="dialog" aria-modal="true" aria-labelledby="customize-project-title">
    <div className="drawer-head"><h2 id="customize-project-title">Customize</h2><button className="icon-btn" aria-label="Close customize project panel" onClick={onClose}><Icon name="close" /></button></div>
    <div className="customize-section"><span className="customize-label">This project</span><UiTextarea className="input project-desc-edit" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Project description" /><label>Project icon<UiSelect className="input" value={icon} onChange={(e)=>setIcon(e.target.value)}><option value="project">Letter tile</option><option value="goal">Target</option><option value="calendar">Calendar</option><option value="flag">Flag</option><option value="release">Release</option><option value="sparkles">Sparkles</option><option value="chart">Chart</option></UiSelect></label><div className="project-color-palette">{palette.map((c, index) => <button key={c} className="project-palette-swatch" data-palette-index={index} data-on={color === c} onClick={() => setColor(c)} aria-label={`Use ${c}`} />)}</div><div className="mini-form-grid"><label>Privacy<UiSelect className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}><option value="workspace">Workspace</option><option value="private">Private</option></UiSelect></label><label>Start<UiInput className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label>Due<UiInput className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label></div><UiButton variant="secondary" size="compact"  onClick={saveProject}>Save project settings</UiButton></div>
    <div className="customize-ai"><span className="ai-star"><Icon name="sparkles" size={17} /></span><div><strong>AI Studio</strong><span>Create governed project rules and summaries</span></div><a href="/ai">Open</a></div>
    <div className="customize-section"><span className="customize-label">Workflow features</span>{items.map(([h, d, u]) => <a className="customize-row" href={u} key={h}><span><strong>{h}</strong><small>{d}</small></span><Icon name="chevronRight" size={15} /></a>)}</div>
  </aside></>;
}
