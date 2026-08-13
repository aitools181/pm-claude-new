"use client";


import { Button as UiButton } from "../../../components/ui";
import { Select as UiSelect } from "../../../components/ui";
import { appPrompt } from "../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { RuntimeStyle } from "../../../components/ui/RuntimeStyle";

type Portfolio = { id: string; name: string };
type ProjRow = { projectId: string | null; name: string; redacted: boolean; progress: number | null; done: number | null; total: number | null; start: string | null; end: string | null };
type Rollup = { portfolio: { name: string }; projects: ProjRow[]; aggregateProgress: number; aggregateDone: number; aggregateTotal: number; milestones: { total: number; hit: number; missed: number; overdue: number } };
type Milestone = { id: string; name: string; dueDate: string | null; status: string };
type Project = { id: string; name: string };
type Initiative = { id: string; name: string; status: string };

export default function PortfoliosPage() {
  const toast = useToast();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [roll, setRoll] = useState<Rollup | null>(null);
  const [ms, setMs] = useState<Milestone[]>([]);
  const [inits, setInits] = useState<Initiative[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pick, setPick] = useState("");

  const loadList = useCallback(async () => setPortfolios(await api<Portfolio[]>("/portfolios", { org: true }).catch(() => [])), []);
  useEffect(() => { loadList(); api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, [loadList]);
  const open = useCallback(async (id: string) => {
    setSel(id);
    setRoll(await api<Rollup>(`/portfolios/${id}/rollup`, { org: true }).catch(() => null));
    setMs(await api<Milestone[]>(`/portfolios/${id}/milestones`, { org: true }).catch(() => []));
    setInits(await api<Initiative[]>(`/portfolios/${id}/initiatives`, { org: true }).catch(() => []));
  }, []);

  async function create() { const name = await appPrompt("Portfolio name"); if (!name) return; await api("/portfolios", { method: "POST", org: true, body: JSON.stringify({ name }) }); loadList(); }
  async function addProject() { if (!sel || !pick) return; await api(`/portfolios/${sel}/projects`, { method: "POST", org: true, body: JSON.stringify({ projectId: pick }) }); setPick(""); open(sel); }
  async function addMilestone() { if (!sel) return; const name = await appPrompt("Milestone name"); if (!name) return; const dueDate = await appPrompt("Due date (YYYY-MM-DD)") || undefined; await api(`/portfolios/${sel}/milestones`, { method: "POST", org: true, body: JSON.stringify({ name, dueDate }) }); open(sel); }
  async function markMs(id: string, status: string) { await api(`/milestones/${id}/status`, { method: "POST", org: true, body: JSON.stringify({ status }) }); if (sel) open(sel); }
  async function addInitiative() { if (!sel) return; const name = await appPrompt("Initiative name"); if (!name) return; await api(`/portfolios/${sel}/initiatives`, { method: "POST", org: true, body: JSON.stringify({ name }) }); open(sel); }

  return (
    <>
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Portfolios</h1>
        <UiButton variant="primary"  onClick={create}>+ New portfolio</UiButton>
      </div>
      <div className="builder-grid">
        <div>
          {!roll && <p className="muted">Select a portfolio for the executive rollup.</p>}
          {roll && (
            <>
              <div className="metric-card">
                <div className="kpi">
                  <div><span className="n">{roll.aggregateProgress}%</span><span className="l">Overall progress</span></div>
                  <div><span className="n">{roll.aggregateDone}/{roll.aggregateTotal}</span><span className="l">Items done</span></div>
                  <div><span className="n">{roll.milestones.hit}/{roll.milestones.total}</span><span className="l">Milestones hit</span></div>
                  <div><span className="n" data-tone={roll.milestones.overdue ? "error" : undefined}>{roll.milestones.overdue}</span><span className="l">Overdue</span></div>
                </div>
              </div>

              <div className="ui-static-73c5d6e9">
                <UiSelect className="input ui-static-97445a8d" value={pick} onChange={(e) => setPick(e.target.value)} >
                  <option value="">Add project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </UiSelect>
                <UiButton variant="secondary"  onClick={addProject} disabled={!pick}>Add</UiButton>
              </div>

              <table className="exec-table">
                <thead><tr><th>Project</th><th>Progress</th><th>Done</th><th>Dates</th></tr></thead>
                <tbody>
                  {roll.projects.map((p, i) => (
                    <tr key={i}>
                      <td data-redacted={p.redacted || undefined}>{p.name}</td>
                      <td>{p.redacted ? "—" : <div className="prog-bar ui-static-465bfea3" ><RuntimeStyle className="prog-fill runtime-width" vars={{ "--runtime-width": `${p.progress}%` }} /></div>}</td>
                      <td>{p.redacted ? "—" : `${p.done}/${p.total}`}</td>
                      <td className="muted ui-static-6cb285c6" >{p.redacted ? "—" : `${p.start ?? "?"} → ${p.end ?? "?"}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="ui-static-0cee3872">
                <div className="ui-static-97445a8d">
                  <div className="ui-static-13313b1a"><h3 className="ui-static-433de30b">Milestones</h3><UiButton variant="tertiary"  onClick={addMilestone}>+ Add</UiButton></div>
                  {ms.map((m) => (
                    <div key={m.id} className="ui-static-9f3b9e48">
                      <span>{m.name} <span className="muted">{m.dueDate}</span></span>
                      <span className="ui-static-25b52886">
                        <span className={`pill ${m.status === "hit" ? "approved" : m.status === "missed" ? "rejected" : "open"}`}>{m.status}</span>
                        {m.status === "planned" && <UiButton variant="tertiary" className="ui-static-7c699c10"  onClick={() => markMs(m.id, "hit")}>✓</UiButton>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="ui-static-97445a8d">
                  <div className="ui-static-13313b1a"><h3 className="ui-static-433de30b">Initiatives</h3><UiButton variant="tertiary"  onClick={addInitiative}>+ Add</UiButton></div>
                  {inits.map((it) => <div key={it.id} className="ui-static-6ff59dcb"><span>{it.name}</span><span className="pill open">{it.status}</span></div>)}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>Portfolios</h3>
          {portfolios.map((p) => (
            <UiButton variant="tertiary" key={p.id} className="ui-selection-row" data-selected={sel === p.id || undefined} onClick={() => open(p.id)}>{p.name}</UiButton>
          ))}
        </div>
      </div>
    </>
  );
}
