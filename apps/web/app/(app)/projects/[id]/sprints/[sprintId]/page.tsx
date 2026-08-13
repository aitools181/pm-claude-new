"use client";


import { Button as UiButton } from "../../../../../../components/ui";
import { Select as UiSelect } from "../../../../../../components/ui";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { useToast } from "../../../../../../components/ui/Toast";
import { useModalDialog } from "../../../../../../components/ui/useModalDialog";

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
  const closeSprintDialogRef = useModalDialog<HTMLDivElement>(wizard, () => setWizard(false), "select");

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
      <div className="ui-static-f16fa207">
        <div><h1 className="page-title ui-static-ef0b7a11" >{detail.sprint.name}</h1>{detail.sprint.goal && <p className="page-sub">{detail.sprint.goal}</p>}</div>
        <div className="ui-static-a76d597a">
          <a className="btn" href={`/projects/${id}/backlog`}>← Backlog</a>
          {detail.sprint.state === "active" && <UiButton variant="primary"  onClick={openWizard}>Close sprint</UiButton>}
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
                  <span><span className="mono ui-static-6acd729e" >{it.key}</span> {it.title}</span>
                  <span className="ui-static-25b52886">
                    {it.storyPoints != null && <span className="pts">{it.storyPoints}</span>}
                    {!closed && <UiButton variant="tertiary" className="ui-static-7c699c10"  title={`Move to ${NEXT[it.statusCategory]}`} onClick={() => setStatus(it)}>→</UiButton>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {wizard && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setWizard(false); }}>
          <div ref={closeSprintDialogRef} tabIndex={-1} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="close-sprint-title">
            <h2 id="close-sprint-title" className="page-title ui-static-4ff818ff" >Close sprint</h2>
            <p className="page-sub">{detail.items.filter((i) => i.statusCategory === "done").length} of {detail.items.length} items done. {incomplete.length} incomplete item(s) will be carried over.</p>
            <div className="ui-static-d60550f6">
              <div className="muted ui-static-99ecd519" >Carry incomplete items to</div>
              <UiSelect className="input ui-static-0466783d" value={carryTo} onChange={(e) => setCarryTo(e.target.value)} >
                <option value="">Back to backlog</option>
                {planned.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </UiSelect>
            </div>
            <div className="ui-static-309cf477">
              <UiButton variant="secondary"  onClick={() => setWizard(false)}>Cancel</UiButton>
              <UiButton variant="primary"  onClick={close}>Close sprint &amp; freeze report</UiButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
