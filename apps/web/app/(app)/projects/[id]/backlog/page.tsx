"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Input as UiInput } from "../../../../../components/ui";
import { appPrompt } from "../../../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { useToast } from "../../../../../components/ui/Toast";

type Item = { id: string; key: string; title: string; statusCategory: string; storyPoints: number | null };
type Sprint = { id: string; name: string; state: string; goal: string | null; committedPoints: number | null };
type SprintDetail = { sprint: Sprint; items: Item[]; points: number };

export default function BacklogPage() {
  const id = useParams().id as string;
  const toast = useToast();
  const [backlog, setBacklog] = useState<Item[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [target, setTarget] = useState<string>("");
  const [detail, setDetail] = useState<SprintDetail | null>(null);

  const loadBacklog = useCallback(async () => setBacklog(await api<Item[]>(`/projects/${id}/backlog`, { org: true }).catch(() => [])), [id]);
  const loadSprints = useCallback(async () => { const s = await api<Sprint[]>(`/projects/${id}/sprints`, { org: true }).catch(() => []); setSprints(s); if (!target && s.find((x) => x.state !== "closed")) setTarget(s.find((x) => x.state !== "closed")!.id); }, [id, target]);
  useEffect(() => { loadBacklog(); loadSprints(); }, [loadBacklog, loadSprints]);
  const loadDetail = useCallback(async (sid: string) => setDetail(await api<SprintDetail>(`/sprints/${sid}`, { org: true }).catch(() => null)), []);
  useEffect(() => { if (target) loadDetail(target); else setDetail(null); }, [target, loadDetail]);

  async function setPoints(item: Item, v: string) {
    const storyPoints = v === "" ? null : Number(v);
    try { await api(`/work-items/${item.id}/points`, { method: "POST", org: true, body: JSON.stringify({ storyPoints }) }); loadBacklog(); if (target) loadDetail(target); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not update story points" }); }
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= backlog.length) return;
    const beforeId = dir === -1 ? backlog[i - 2]?.id ?? null : backlog[i + 1]?.id ?? null;
    const afterId = dir === -1 ? backlog[i - 1]?.id ?? null : backlog[i + 2]?.id ?? null;
    try { await api(`/work-items/${backlog[i].id}/backlog-rank`, { method: "POST", org: true, body: JSON.stringify({ beforeId, afterId }) }); loadBacklog(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not reorder the backlog" }); }
  }
  async function addToSprint(item: Item) {
    if (!target) { toast({ message: "Select or create a sprint first" }); return; }
    try { await api(`/sprints/${target}/items`, { method: "POST", org: true, body: JSON.stringify({ workItemId: item.id }) }); loadBacklog(); loadDetail(target); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not add to the sprint" }); }
  }
  async function removeFromSprint(item: Item) {
    try { await api(`/sprints/${target}/items/${item.id}`, { method: "DELETE", org: true }); loadBacklog(); loadDetail(target); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not remove from the sprint" }); }
  }
  async function createSprint() {
    const name = await appPrompt("Sprint name", `Sprint ${sprints.length + 1}`); if (!name) return;
    try { const s = await api<Sprint>(`/projects/${id}/sprints`, { method: "POST", org: true, body: JSON.stringify({ name }) }); await loadSprints(); setTarget(s.id); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not create the sprint" }); }
  }
  async function startSprint(sid: string) {
    try { await api(`/sprints/${sid}/start`, { method: "POST", org: true }); toast({ message: "Sprint started" }); loadSprints(); loadDetail(sid); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }

  const totalPts = backlog.reduce((s, i) => s + (i.storyPoints ?? 0), 0);

  return (
    <>
      <div className="ui-static-69be3752">
        <h1 className="page-title ui-static-c81ce4b2" >Backlog</h1>
        <a className="btn" href={`/projects/${id}`}>← Project</a>
      </div>
      <p className="page-sub">{backlog.length} items · {totalPts} points</p>

      <div className="agile-grid">
        <div>
          {backlog.length === 0 && <div className="empty">Backlog is empty. Create work items in the project.</div>}
          {backlog.map((it, i) => (
            <div key={it.id} className="bl-row">
              <span className="ui-static-7ecbcd21">
                <UiButton variant="tertiary" className="ui-static-6d46476a"  onClick={() => move(i, -1)} disabled={i === 0}>▲</UiButton>
                <UiButton variant="tertiary" className="ui-static-6d46476a"  onClick={() => move(i, 1)} disabled={i === backlog.length - 1}>▼</UiButton>
              </span>
              <span className="key">{it.key}</span>
              <span className="title">{it.title}</span>
              <UiInput className="pts" defaultValue={it.storyPoints ?? ""} placeholder="–" onBlur={(e) => e.target.value !== String(it.storyPoints ?? "") && setPoints(it, e.target.value)} />
              <UiButton variant="tertiary"  onClick={() => addToSprint(it)}>→ Sprint</UiButton>
            </div>
          ))}
        </div>

        <div className="gpanel">
          <div className="ui-static-13313b1a"><h3>Sprints</h3><UiButton variant="tertiary"  onClick={createSprint}>+ New</UiButton></div>
          {sprints.map((s) => (
            <div key={s.id} className="sprint-card" data-state={s.state} data-selected={target === s.id || undefined}>
              <div className="ui-static-13313b1a">
                <UiButton variant="tertiary" className="ui-static-06b2a83b"  onClick={() => setTarget(s.id)}>{s.name}</UiButton>
                <span className={`pill ${s.state === "active" ? "submitted" : s.state === "closed" ? "approved" : "open"}`}>{s.state}</span>
              </div>
              {target === s.id && detail && (
                <div className="ui-static-8a77e5a3">
                  <div className="muted ui-static-a42d5f9e" >{detail.items.length} items · {detail.points} pts{s.committedPoints != null ? ` · committed ${s.committedPoints}` : ""}</div>
                  {detail.items.map((it) => (
                    <div key={it.id} className="ui-static-78ed4c5e">
                      <span>{it.key} {it.title.slice(0, 18)}</span>
                      {s.state !== "closed" && <UiButton variant="tertiary" className="ui-static-7c699c10"  onClick={() => removeFromSprint(it)}>✕</UiButton>}
                    </div>
                  ))}
                  <div className="ui-static-1a6be0e9">
                    {s.state === "planned" && <UiButton variant="primary" className="ui-static-97445a8d"  onClick={() => startSprint(s.id)} disabled={detail.items.length === 0}>Start</UiButton>}
                    {s.state !== "planned" && <a className="btn btn-primary ui-static-3cce2efa"  href={`/projects/${id}/sprints/${s.id}`}>Open board →</a>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
