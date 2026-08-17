"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../../../../../components/ui";
import { appPrompt } from "../../../../../components/ui/AppDialog";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { useToast } from "../../../../../components/ui/Toast";
import { TaskDrawer } from "../../../../../components/work/TaskDrawer";
import { Icon } from "../../../../../components/ui/Icon";
import { ProjectChrome } from "../../../../../components/project/ProjectChrome";

type Item = { id: string; key: string; title: string; priority: string; version: number; linked?: boolean; primaryOwnerUserId?: string | null; dueDate?: string | null; parentId?: string | null };
type Board = { todo: Item[]; in_progress: Item[]; done: Item[] };
type Project = { id:string; name:string; keyPrefix:string; color?:string; health:string; status:string; privacy:string; version:number; description?:string|null; startDate?:string|null; dueDate?:string|null; wipLimits?: Record<string,{limit:number;warnOnly:boolean}>|null };
const COLUMNS: { cat: keyof Board; status: string; label: string; tone: string }[] = [
  { cat: "todo", status: "To Do", label: "To do", tone: "neutral" },
  { cat: "in_progress", status: "In Progress", label: "In progress", tone: "primary" },
  { cat: "done", status: "Done", label: "Done", tone: "success" },
];

function message(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

export default function BoardPage() {
  const id = useParams().id as string;
  const toast = useToast();
  const [board, setBoard] = useState<Board>({ todo: [], in_progress: [], done: [] });
  const [project, setProject] = useState<Project | null>(null);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"custom" | "due" | "priority" | "name">("custom");
  const [hideDone, setHideDone] = useState(false);
  const [drag, setDrag] = useState<{ id: string; version: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<keyof Board | null>(null);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wipEditFor, setWipEditFor] = useState<string | null>(null);
  const [wipDraft, setWipDraft] = useState<{ limit: string; warnOnly: boolean }>({ limit: "", warnOnly: true });
  const [allItems, setAllItems] = useState<{ id: string; title: string; parentId: string | null; statusCategory: string }[]>([]);
  const [directory, setDirectory] = useState<{ id: string; displayName: string }[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [assigneePop, setAssigneePop] = useState<string | null>(null);

  const childrenOf = (pid: string) => allItems.filter((x) => x.parentId === pid);
  const ownerName = (uid: string | null | undefined) => directory.find((m) => m.id === uid)?.displayName || "";

  async function load() {
    try {
      const [nextBoard, nextProject, items, people] = await Promise.all([
        api<Board>(`/projects/${id}/board`, { org: true }),
        api<Project>(`/projects/${id}`, { org: true }),
        api<{ id: string; title: string; parentId: string | null; statusCategory: string }[]>(`/projects/${id}/work-items?limit=500`, { org: true }).catch(() => []),
        api<{ id: string; displayName: string }[]>("/directory/members", { org: true }).catch(() => []),
      ]);
      setBoard(nextBoard); setProject(nextProject); setAllItems(items); setDirectory(people);
    }
    catch (e) { setError(message(e, "Could not load the board")); }
  }
  useEffect(() => { load(); }, [id]);

  async function assignTo(item: Item, userId: string | null) {
    setAssigneePop(null);
    try {
      await api(`/work-items/${item.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: item.version, patch: { primaryOwnerUserId: userId } }) });
      toast({ message: userId ? `Assigned to ${ownerName(userId)}` : "Assignee cleared" }); await load();
    } catch (e) { setError(message(e, "Could not change the assignee")); await load(); }
  }

  async function drop(status: string, beforeId?: string) {
    if (!drag) return;
    const workItemId = drag.id;
    const expectedVersion = drag.version;
    setDrag(null); setOver(null); setError(null);
    try {
      const response = await api<{ previous: { status: string; rank: string | null }; version: number; wipWarning: { statusCategory: string; limit: number; count: number } | null }>(`/projects/${id}/board/move`, {
        method: "POST", org: true, body: JSON.stringify({ workItemId, toStatus: status, beforeId, expectedVersion }),
      });
      await load();
      if (response.wipWarning) toast({ message: `That column is over its WIP limit (${response.wipWarning.count + 1}/${response.wipWarning.limit})`, tone: "error" });
      toast({ message: "Task moved", action: { label: "Undo", run: async () => { await api(`/projects/${id}/board/undo`, { method: "POST", org: true, body: JSON.stringify({ workItemId, previous: response.previous, expectedVersion: response.version }) }); await load(); } } });
    } catch (e) { setError(message(e, "Could not move the task")); await load(); }
  }

  async function saveWipLimit(statusCategory: string, rule: { limit: number; warnOnly: boolean } | null) {
    if (!project) return;
    const nextLimits = { ...(project.wipLimits ?? {}) };
    if (rule) nextLimits[statusCategory] = rule; else delete nextLimits[statusCategory];
    try {
      await api(`/projects/${id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: project.version, patch: { wipLimits: Object.keys(nextLimits).length ? nextLimits : null } }) });
      setProject({ ...project, wipLimits: Object.keys(nextLimits).length ? nextLimits : null, version: project.version + 1 });
      setWipEditFor(null); setWipDraft({ limit: "", warnOnly: true });
    } catch (e) { setError(message(e, "Could not save the WIP limit")); }
  }

  function visibleCards(rows: Item[]) {
    return rows.filter((item) => `${item.key} ${item.title}`.toLowerCase().includes(search.toLowerCase()) && (priorityFilter === "all" || item.priority === priorityFilter)).sort((a,b) => {
      if (sortBy === "name") return a.title.localeCompare(b.title);
      if (sortBy === "due") return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
      if (sortBy === "priority") return ["urgent","high","normal","low"].indexOf(a.priority) - ["urgent","high","normal","low"].indexOf(b.priority);
      return 0;
    });
  }

  async function saveView() {
    const name = await appPrompt("View name", "Board view");
    if (!name) return;
    const share = await appPrompt('Share with the whole organization? Type "org" to share, or leave blank to keep it just for you.', "");
    const ownershipTier = (share || "").trim().toLowerCase() === "org" ? "org" : "personal";
    await api("/ui/saved-views", { method: "POST", org: true, body: JSON.stringify({ scopeType: "project", scopeId: id, name, viewType: "board", filters: { priorityFilter, search, hideDone }, sortSpec: { sortBy }, groupBy: "status", ownershipTier }) });
    toast({ message: "Board view saved" });
  }

  async function createInColumn(column: typeof COLUMNS[number]) {
    if (!draft.trim() || creating) return;
    setCreating(true); setError(null);
    try {
      await api("/work-items", { method: "POST", org: true, body: JSON.stringify({ projectId: id, title: draft.trim(), status: column.status }) });
      setDraft(""); setAddingTo(null); await load(); toast({ message: `Task added to ${column.label}` });
    } catch (e) { setError(message(e, "Could not create the task")); }
    finally { setCreating(false); }
  }

  return (
    <>
      {project && <ProjectChrome project={project} view="board" onAddTask={(typeKey) => { setAddingTo("todo"); setDraft(typeKey === "approval" ? "Approval: " : typeKey === "milestone" ? "Milestone: " : ""); }} onProjectChange={load} />}
      <div className="view-toolbar project-toolbar"><label className="toolbar-button"><Icon name="filter" size={15}/>Filter<UiSelect value={priorityFilter} onChange={(e)=>setPriorityFilter(e.target.value)}><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></UiSelect></label><label className="toolbar-button"><Icon name="sort" size={15}/>Sort<UiSelect value={sortBy} onChange={(e)=>setSortBy(e.target.value as any)}><option value="custom">Custom</option><option value="due">Due date</option><option value="priority">Priority</option><option value="name">Alphabetical</option></UiSelect></label><span className="toolbar-button static-control"><Icon name="list" size={15}/>Group: Status</span><button className="toolbar-button" data-on={hideDone} onClick={()=>setHideDone(!hideDone)}><Icon name="sliders" size={15}/>Options</button><label className="toolbar-search"><Icon name="search" size={15}/><UiInput value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search tasks"/></label><button className="toolbar-button primary-link" onClick={saveView}>Save view</button></div>

      {error && <div className="callout callout-danger project-error"><span>{error}</span><button className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss error"><Icon name="close" size={15} /></button></div>}

      <div className="asana-board">
        {COLUMNS.filter((column) => !(hideDone && column.cat === "done")).map((column) => {
          const wipRule = project?.wipLimits?.[column.cat];
          const columnCount = visibleCards(board[column.cat]).length;
          const atOrOverLimit = Boolean(wipRule && columnCount >= wipRule.limit);
          return (
          <section key={column.cat} className="asana-board-column" data-over={over === column.cat} data-tone={column.tone} data-wip-exceeded={atOrOverLimit || undefined}
            onDragOver={(event) => { event.preventDefault(); setOver(column.cat); }}
            onDragLeave={() => setOver((current) => current === column.cat ? null : current)}
            onDrop={() => drop(column.status)}>
            <header className="asana-column-head"><div><span className="column-status-dot" /><strong>{column.label}</strong><button type="button" className="column-count column-count-button" onClick={() => { const opening = wipEditFor !== column.cat; setWipEditFor(opening ? column.cat : null); if (opening) setWipDraft({ limit: wipRule ? String(wipRule.limit) : "", warnOnly: wipRule?.warnOnly ?? true }); }} aria-haspopup="dialog" title="Set WIP limit">{columnCount}{wipRule && `/${wipRule.limit}`}</button>{atOrOverLimit && <span className={`wip-badge ${wipRule?.warnOnly ? "warn" : "block"}`} title={wipRule?.warnOnly ? "Over the WIP limit (warning only)" : "At the WIP limit — moving more cards here is blocked"}><Icon name="flag" size={11}/></span>}</div><button className="icon-btn" aria-label={`Add task to ${column.label}`} onClick={() => { setAddingTo(column.cat); setDraft(""); }}><Icon name="plus" size={17} /></button></header>
            {wipEditFor === column.cat && <div className="wip-limit-popover" role="dialog" aria-label={`WIP limit for ${column.label}`}>
              <label>Limit<UiInput type="number" min={1} max={999} value={wipDraft.limit} onChange={(e) => setWipDraft({ ...wipDraft, limit: e.target.value })} placeholder="No limit" /></label>
              <label className="wip-warn-only-row"><input type="checkbox" checked={wipDraft.warnOnly} onChange={(e) => setWipDraft({ ...wipDraft, warnOnly: e.target.checked })} /> Warn only (don&rsquo;t block)</label>
              <div className="button-row">
                {wipRule && <UiButton variant="tertiary" size="compact" onClick={() => saveWipLimit(column.cat, null)}>Remove limit</UiButton>}
                <UiButton variant="primary" size="compact" disabled={!wipDraft.limit} onClick={() => saveWipLimit(column.cat, { limit: Number(wipDraft.limit), warnOnly: wipDraft.warnOnly })}>Save</UiButton>
              </div>
            </div>}

            {addingTo === column.cat && <form className="board-quick-card" onSubmit={(event) => { event.preventDefault(); createInColumn(column); }}>
              <UiTextarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a task name…" onKeyDown={(event) => {
                if (event.key === "Escape") { setAddingTo(null); setDraft(""); }
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); createInColumn(column); }
              }} />
              <div><span>Enter to add</span><div><UiButton variant="tertiary" size="compact" type="button"  onClick={() => { setAddingTo(null); setDraft(""); }}>Cancel</UiButton><UiButton type="submit" variant="primary" size="compact"  disabled={!draft.trim() || creating}>{creating ? "Adding…" : "Add task"}</UiButton></div></div>
            </form>}

            <div className="asana-column-cards">
              {visibleCards(board[column.cat]).map((item) => (
                <article key={item.id} className="asana-task-card" draggable data-dragging={drag?.id === item.id}
                  onDragStart={() => setDrag({ id: item.id, version: item.version })} onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.stopPropagation(); drop(column.status, item.id); }}>
                  <button type="button" className="board-card-open ui-reset-button" onClick={() => setOpenId(item.id)} aria-label={`Open ${item.title}`}>
                    <div className="board-card-top"><span className="mono">{item.key}</span></div>
                    <h3>{item.title}</h3>
                    {item.parentId && <span className="board-subtask-label"><Icon name="subtask" size={13} />Subtask</span>}
                    <footer>
                      <span className={`priority-chip priority-${item.priority}`}><Icon name="flag" size={13} />{item.priority}</span>
                      <div className="board-card-meta">
                        {item.dueDate && <span><Icon name="calendar" size={14} />{new Date(`${item.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                      </div>
                    </footer>
                    {item.linked && <span className="linked-project-badge"><Icon name="link" size={12} />Linked item</span>}
                  </button>
                  <div className="board-card-tools">
                    {childrenOf(item.id).length > 0 && <button type="button" className="board-expand-subtasks" aria-expanded={expanded.has(item.id)} aria-label={`${expanded.has(item.id) ? "Collapse" : "Expand"} ${childrenOf(item.id).length} subtask${childrenOf(item.id).length > 1 ? "s" : ""}`} onClick={() => setExpanded((s) => { const n = new Set(s); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}><Icon name="subtask" size={13} />{childrenOf(item.id).length}<Icon name={expanded.has(item.id) ? "chevronDown" : "chevronRight"} size={12} /></button>}
                    <span className="board-assignee-wrap"><button type="button" className="mini-avatar board-assignee-btn" aria-haspopup="menu" aria-expanded={assigneePop === item.id} aria-label={item.primaryOwnerUserId ? `Assignee ${ownerName(item.primaryOwnerUserId)}, change assignee` : "Set assignee"} title={ownerName(item.primaryOwnerUserId) || "Unassigned"} onClick={() => setAssigneePop(assigneePop === item.id ? null : item.id)}>{ownerName(item.primaryOwnerUserId).slice(0, 1).toUpperCase() || "–"}</button>
                    {assigneePop === item.id && <div className="board-assignee-pop" role="menu">{directory.map((m) => <button key={m.id} data-on={m.id === item.primaryOwnerUserId} onClick={() => assignTo(item, m.id)}><span className="mini-avatar">{m.displayName.slice(0, 1)}</span>{m.displayName}</button>)}<button onClick={() => assignTo(item, null)}><Icon name="close" size={14} />No assignee</button></div>}</span>
                  </div>
                  {expanded.has(item.id) && <div className="board-subtask-list">{childrenOf(item.id).map((sub) => <button key={sub.id} type="button" onClick={() => setOpenId(sub.id)}><Icon name={sub.statusCategory === "done" ? "check" : "circle"} size={14} /><span>{sub.title}</span></button>)}</div>}
                </article>
              ))}
              {visibleCards(board[column.cat]).length === 0 && addingTo !== column.cat && <button className="board-empty-column" onClick={() => setAddingTo(column.cat)}><Icon name="plus" size={18} /><strong>Add a task</strong><span>or drag one here</span></button>}
            </div>
            <button className="board-add-bottom" onClick={() => { setAddingTo(column.cat); setDraft(""); }}><Icon name="plus" size={15} />Add task</button>
          </section>
          );
        })}
      </div>

      {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} onSaved={load} />}
    </>
  );
}
