"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { useToast } from "../../../../../../components/ui/Toast";

type Item = { id: string; key: string; title: string; statusCategory: string; storyPoints: number | null };
type Detail = { sprint: { id: string; name: string; state: string; goal: string | null; committedPoints: number | null }; items: Item[]; points: number };
type Burndown = { committedPoints?: number; completedPoints?: number; remainingPoints?: number };
type Sprint = { id: string; name: string; state: string };

const COLS: [string, string][] = [["todo", "To Do"], ["in_progress", "In Progress"], ["done", "Done"]];
const NEXT: Record<string, string> = { todo: "In Progress", in_progress: "Done", done: "To Do" };
const pts = (items: Item[]) => items.reduce((s, i) => s + (i.storyPoints ?? 0), 0);

export default function SprintBoardPage() {
  const { id, sprintId } = useParams() as { id: string; sprintId: string };
  const toast = useToast();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [burn, setBurn] = useState<Burndown | null>(null);
  const [scope, setScope] = useState<{ type: string }[]>([]);
  const [wizard, setWizard] = useState(false);
  const [carryTo, setCarryTo] = useState("");
  const [planned, setPlanned] = useState<Sprint[]>([]);

  const load = useCallback(async () => {
    setDetail(await api<Detail>(`/sprints/${sprintId}`, { org: true }).catch(() => null));
    setBurn(await api<any>(`/sprints/${sprintId}/burndown`, { org: true }).catch(() => null));
    setScope(await api<any[]>(`/sprints/${sprintId}/scope-events`, { org: true }).catch(() => []));
  }, [sprintId]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(item: Item) {
    try {
      const w = await api<any>(`/work-items/${item.id}`, { org: true });
      await api(`/work-items/${item.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: w.version, patch: { status: NEXT[item.statusCategory] } }) });
      load();
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  async function openWizard() {
    setPlanned((await api<Sprint[]>(`/projects/${id}/sprints`, { org: true }).catch(() => [])).filter((s) => s.state === "planned"));
    setWizard(true);
  }
  async function close() {
    try { const res = await api<any>(`/sprints/${sprintId}/close`, { method: "POST", org: true, body: JSON.stringify({ carryOverToSprintId: carryTo || null }) });
      toast({ message: `Sprint closed · ${res.report.completedPoints}/${res.report.committedPoints} pts done` }); setWizard(false); router.push(`/projects/${id}/reports`);
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }

  if (!detail) return <p className="muted">Loading…</p>;
  const incomplete = detail.items.filter((i) => i.statusCategory !== "done");
  const closed = detail.sprint.state === "closed";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div><h1 className="page-title" style={{ marginBottom: 0 }}>{detail.sprint.name}</h1>{detail.sprint.goal && <p className="page-sub">{detail.sprint.goal}</p>}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href={`/projects/${id}/backlog`}>← Backlog</a>
          {detail.sprint.state === "active" && <button className="btn btn-primary" onClick={openWizard}>Close sprint</button>}
        </div>
      </div>

      <div className="metric-card">
        <div className="kpi">
          <div><span className="n">{detail.sprint.committedPoints ?? detail.points}</span><span className="l">Committed</span></div>
          <div><span className="n">{burn?.completedPoints ?? pts(detail.items.filter((i) => i.statusCategory === "done"))}</span><span className="l">Completed</span></div>
          <div><span className="n">{burn?.remainingPoints ?? "—"}</span><span className="l">Remaining</span></div>
          <div><span className="n">{scope.filter((s) => s.type === "added").length}</span><span className="l">Scope added</span></div>
          <div><span className="n"><span className={`pill ${detail.sprint.state === "active" ? "submitted" : detail.sprint.state === "closed" ? "approved" : "open"}`}>{detail.sprint.state}</span></span><span className="l">State</span></div>
        </div>
      </div>

      <div className="board-cols">
        {COLS.map(([cat, label]) => {
          const its = detail.items.filter((i) => i.statusCategory === cat);
          return (
            <div key={cat} className="board-col">
              <h4>{label} · {its.length} · {pts(its)}pt</h4>
              {its.map((it) => (
                <div key={it.id} className="board-item">
                  <span><span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{it.key}</span> {it.title}</span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {it.storyPoints != null && <span className="pts">{it.storyPoints}</span>}
                    {!closed && <button className="btn btn-ghost" style={{ padding: "0 6px" }} title={`Move to ${NEXT[it.statusCategory]}`} onClick={() => setStatus(it)}>→</button>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {wizard && (
        <div className="modal-backdrop" onClick={() => setWizard(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="page-title" style={{ fontSize: 18 }}>Close sprint</h2>
            <p className="page-sub">{detail.items.filter((i) => i.statusCategory === "done").length} of {detail.items.length} items done. {incomplete.length} incomplete item(s) will be carried over.</p>
            <div style={{ margin: "12px 0" }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 5 }}>Carry incomplete items to</div>
              <select className="input" value={carryTo} onChange={(e) => setCarryTo(e.target.value)} style={{ width: "100%" }}>
                <option value="">Back to backlog</option>
                {planned.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setWizard(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={close}>Close sprint &amp; freeze report</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
