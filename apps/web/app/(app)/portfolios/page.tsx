"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

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

  async function create() { const name = prompt("Portfolio name"); if (!name) return; await api("/portfolios", { method: "POST", org: true, body: JSON.stringify({ name }) }); loadList(); }
  async function addProject() { if (!sel || !pick) return; await api(`/portfolios/${sel}/projects`, { method: "POST", org: true, body: JSON.stringify({ projectId: pick }) }); setPick(""); open(sel); }
  async function addMilestone() { if (!sel) return; const name = prompt("Milestone name"); if (!name) return; const dueDate = prompt("Due date (YYYY-MM-DD)") || undefined; await api(`/portfolios/${sel}/milestones`, { method: "POST", org: true, body: JSON.stringify({ name, dueDate }) }); open(sel); }
  async function markMs(id: string, status: string) { await api(`/milestones/${id}/status`, { method: "POST", org: true, body: JSON.stringify({ status }) }); if (sel) open(sel); }
  async function addInitiative() { if (!sel) return; const name = prompt("Initiative name"); if (!name) return; await api(`/portfolios/${sel}/initiatives`, { method: "POST", org: true, body: JSON.stringify({ name }) }); open(sel); }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Portfolios</h1>
        <button className="btn btn-primary" onClick={create}>+ New portfolio</button>
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
                  <div><span className="n" style={{ color: roll.milestones.overdue ? "var(--danger)" : undefined }}>{roll.milestones.overdue}</span><span className="l">Overdue</span></div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Add project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="btn" onClick={addProject} disabled={!pick}>Add</button>
              </div>

              <table className="exec-table">
                <thead><tr><th>Project</th><th>Progress</th><th>Done</th><th>Dates</th></tr></thead>
                <tbody>
                  {roll.projects.map((p, i) => (
                    <tr key={i}>
                      <td style={{ color: p.redacted ? "var(--ink-3)" : undefined }}>{p.name}</td>
                      <td>{p.redacted ? "—" : <div className="prog-bar" style={{ width: 120 }}><div className="prog-fill" style={{ width: `${p.progress}%` }} /></div>}</td>
                      <td>{p.redacted ? "—" : `${p.done}/${p.total}`}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{p.redacted ? "—" : `${p.start ?? "?"} → ${p.end ?? "?"}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: "flex", gap: 18, marginTop: 18 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ fontSize: 14 }}>Milestones</h3><button className="btn btn-ghost" onClick={addMilestone}>+ Add</button></div>
                  {ms.map((m) => (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                      <span>{m.name} <span className="muted">{m.dueDate}</span></span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span className={`pill ${m.status === "hit" ? "approved" : m.status === "missed" ? "rejected" : "open"}`}>{m.status}</span>
                        {m.status === "planned" && <button className="btn btn-ghost" style={{ padding: "0 6px" }} onClick={() => markMs(m.id, "hit")}>✓</button>}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ fontSize: 14 }}>Initiatives</h3><button className="btn btn-ghost" onClick={addInitiative}>+ Add</button></div>
                  {inits.map((it) => <div key={it.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}><span>{it.name}</span><span className="pill open">{it.status}</span></div>)}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>Portfolios</h3>
          {portfolios.map((p) => (
            <button key={p.id} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel === p.id ? "var(--primary)" : undefined }} onClick={() => open(p.id)}>{p.name}</button>
          ))}
        </div>
      </div>
    </>
  );
}
