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
type Project = { id:string; name:string; keyPrefix:string; color?:string; health:string; status:string; privacy:string; version:number; description?:string|null; startDate?:string|null; dueDate?:string|null };
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

  async function load() {
    try { const [nextBoard, nextProject] = await Promise.all([api<Board>(`/projects/${id}/board`, { org: true }), api<Project>(`/projects/${id}`, { org: true })]); setBoard(nextBoard); setProject(nextProject); }
    catch (e) { setError(message(e, "Could not load the board")); }
  }
  useEffect(() => { load(); }, [id]);

  async function drop(status: string, beforeId?: string) {
    if (!drag) return;
    const workItemId = drag.id;
    const expectedVersion = drag.version;
    setDrag(null); setOver(null); setError(null);
    try {
      const response = await api<{ previous: { status: string; rank: string | null }; version: number }>(`/projects/${id}/board/move`, {
        method: "POST", org: true, body: JSON.stringify({ workItemId, toStatus: status, beforeId, expectedVersion }),
      });
      await load();
      toast({ message: "Task moved", action: { label: "Undo", run: async () => { await api(`/projects/${id}/board/undo`, { method: "POST", org: true, body: JSON.stringify({ workItemId, previous: response.previous, expectedVersion: response.version }) }); await load(); } } });
    } catch (e) { setError(message(e, "Could not move the task")); await load(); }
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
    await api("/ui/saved-views", { method: "POST", org: true, body: JSON.stringify({ scopeType: "project", scopeId: id, name, viewType: "board", filters: { priorityFilter, search, hideDone }, sortSpec: { sortBy }, groupBy: "status" }) });
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
        {COLUMNS.filter((column) => !(hideDone && column.cat === "done")).map((column) => (
          <section key={column.cat} className="asana-board-column" data-over={over === column.cat} data-tone={column.tone}
            onDragOver={(event) => { event.preventDefault(); setOver(column.cat); }}
            onDragLeave={() => setOver((current) => current === column.cat ? null : current)}
            onDrop={() => drop(column.status)}>
            <header className="asana-column-head"><div><span className="column-status-dot" /><strong>{column.label}</strong><span className="column-count">{visibleCards(board[column.cat]).length}</span></div><button className="icon-btn" aria-label={`Add task to ${column.label}`} onClick={() => { setAddingTo(column.cat); setDraft(""); }}><Icon name="plus" size={17} /></button></header>

            {addingTo === column.cat && <form className="board-quick-card" onSubmit={(event) => { event.preventDefault(); createInColumn(column); }}>
              <UiTextarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a task name…" onKeyDown={(event) => {
                if (event.key === "Escape") { setAddingTo(null); setDraft(""); }
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); createInColumn(column); }
              }} />
              <div><span>Enter to add</span><div><UiButton variant="tertiary" size="compact" type="button"  onClick={() => { setAddingTo(null); setDraft(""); }}>Cancel</UiButton><UiButton variant="primary" size="compact"  disabled={!draft.trim() || creating}>{creating ? "Adding…" : "Add task"}</UiButton></div></div>
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
                        <span className="mini-avatar">{item.primaryOwnerUserId?.slice(0, 1).toUpperCase() ?? "–"}</span>
                      </div>
                    </footer>
                    {item.linked && <span className="linked-project-badge"><Icon name="link" size={12} />Linked item</span>}
                  </button>
                </article>
              ))}
              {visibleCards(board[column.cat]).length === 0 && addingTo !== column.cat && <button className="board-empty-column" onClick={() => setAddingTo(column.cat)}><Icon name="plus" size={18} /><strong>Add a task</strong><span>or drag one here</span></button>}
            </div>
            <button className="board-add-bottom" onClick={() => { setAddingTo(column.cat); setDraft(""); }}><Icon name="plus" size={15} />Add task</button>
          </section>
        ))}
      </div>

      {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} onSaved={load} />}
    </>
  );
}
