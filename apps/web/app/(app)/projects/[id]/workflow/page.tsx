"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../../lib/api";
import { ProjectChrome } from "../../../../../components/project/ProjectChrome";
import { TaskDrawer } from "../../../../../components/work/TaskDrawer";
import { Icon } from "../../../../../components/ui/Icon";

type Project = { id: string; name: string; keyPrefix: string; color?: string; health: string; status: string; privacy: string; version: number };
type BoardItem = { id: string; key: string; title: string; priority: string; dueDate?: string | null };
type Board = { todo: BoardItem[]; in_progress: BoardItem[]; done: BoardItem[] };
type Rule = { id: string; name: string; enabled: boolean; trigger?: string };

const STAGES: { cat: keyof Board; label: string; hint: string; tone: string }[] = [
  { cat: "todo", label: "To do", hint: "Work enters the workflow here", tone: "neutral" },
  { cat: "in_progress", label: "In progress", hint: "Actively being worked on", tone: "primary" },
  { cat: "done", label: "Done", hint: "Completed and verified", tone: "success" },
];

export default function WorkflowPage() {
  const id = useParams().id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [board, setBoard] = useState<Board>({ todo: [], in_progress: [], done: [] });
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [rulesDenied, setRulesDenied] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const [loadError, setLoadError] = useState("");
  async function load() {
    try {
      const [p, b] = await Promise.all([
        api<Project>(`/projects/${id}`, { org: true }),
        api<Board>(`/projects/${id}/board`, { org: true }).catch(() => ({ todo: [], in_progress: [], done: [] })),
      ]);
      setProject(p); setBoard(b); setLoadError("");
      try { setRules(await api<Rule[]>("/automation/rules", { org: true })); }
      catch { setRules(null); setRulesDenied(true); }
    } catch (err) { setLoadError(err instanceof Error ? err.message : "Could not load this project's workflow."); }
  }
  useEffect(() => { load(); }, [id]);

  const total = useMemo(() => board.todo.length + board.in_progress.length + board.done.length, [board]);

  if (!project) return <div className="project-loading">{loadError || "Loading workflow…"}{loadError && <button className="text-button" onClick={load}>Retry</button>}</div>;
  return <>
    <ProjectChrome project={project} view="workflow" onProjectChange={load} />
    <div className="workflow-page">
      <header className="workflow-head">
        <div><h2>Workflow</h2><p>How work moves through {project?.name ?? "this project"} — {total} tasks across {STAGES.length} stages.</p></div>
        <a className="btn btn-secondary" href="/admin/configure/workflows"><Icon name="settings" size={15} />Edit workflow stages</a>
      </header>

      <div className="workflow-stages">
        {STAGES.map((stage, index) => <div className="workflow-stage-wrap" key={stage.cat}>
          <section className="workflow-stage" data-tone={stage.tone}>
            <header><span className="stage-dot" /><strong>{stage.label}</strong><span className="stage-count">{board[stage.cat].length}</span></header>
            <p>{stage.hint}</p>
            <div className="stage-tasks">
              {board[stage.cat].slice(0, 5).map((item) => <button key={item.id} onClick={() => setOpenId(item.id)}><span className="mono">{item.key}</span><span className="stage-task-title">{item.title}</span></button>)}
              {board[stage.cat].length > 5 && <span className="stage-more">+{board[stage.cat].length - 5} more</span>}
              {!board[stage.cat].length && <span className="stage-empty">No tasks in this stage.</span>}
            </div>
          </section>
          {index < STAGES.length - 1 && <span className="workflow-arrow" aria-hidden="true"><Icon name="chevronRight" size={17} /></span>}
        </div>)}
      </div>

      <section className="workflow-rules">
        <header><span className="widget-icon purple"><Icon name="sparkles" size={17} /></span><div><h3>Automation in this workflow</h3><p>Rules run when tasks enter or leave a stage.</p></div><a href="/admin/configure/automation">Open rule builder</a></header>
        {rules && rules.length > 0 && <div className="workflow-rule-list">{rules.slice(0, 6).map((rule) => <div key={rule.id}><span className={`rule-state ${rule.enabled ? "on" : ""}`} aria-hidden="true" /><strong>{rule.name}</strong><small>{rule.enabled ? "Active" : "Paused"}{rule.trigger ? ` · ${rule.trigger}` : ""}</small></div>)}</div>}
        {rules && !rules.length && <div className="workflow-rule-empty">No automation rules yet. Create one to move, assign or update tasks automatically.</div>}
        {rulesDenied && <div className="workflow-rule-empty">Automation rules are managed by workspace admins. Ask an admin, or open the rule builder if you have access.</div>}
      </section>
    </div>
    {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} onSaved={load} />}
  </>;
}
