"use client";
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
    await api(`/work-items/${item.id}/points`, { method: "POST", org: true, body: JSON.stringify({ storyPoints }) });
    loadBacklog(); if (target) loadDetail(target);
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= backlog.length) return;
    const beforeId = dir === -1 ? backlog[i - 2]?.id ?? null : backlog[i + 1]?.id ?? null;
    const afterId = dir === -1 ? backlog[i - 1]?.id ?? null : backlog[i + 2]?.id ?? null;
    await api(`/work-items/${backlog[i].id}/backlog-rank`, { method: "POST", org: true, body: JSON.stringify({ beforeId, afterId }) });
    loadBacklog();
  }
  async function addToSprint(item: Item) {
    if (!target) { toast({ message: "Select or create a sprint first" }); return; }
    await api(`/sprints/${target}/items`, { method: "POST", org: true, body: JSON.stringify({ workItemId: item.id }) });
    loadBacklog(); loadDetail(target);
  }
  async function removeFromSprint(item: Item) { await api(`/sprints/${target}/items/${item.id}`, { method: "DELETE", org: true }); loadBacklog(); loadDetail(target); }
  async function createSprint() {
    const name = prompt("Sprint name", `Sprint ${sprints.length + 1}`); if (!name) return;
    const s = await api<Sprint>(`/projects/${id}/sprints`, { method: "POST", org: true, body: JSON.stringify({ name }) });
    await loadSprints(); setTarget(s.id);
  }
  async function startSprint(sid: string) {
    try { await api(`/sprints/${sid}/start`, { method: "POST", org: true }); toast({ message: "Sprint started" }); loadSprints(); loadDetail(sid); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }

  const totalPts = backlog.reduce((s, i) => s + (i.storyPoints ?? 0), 0);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Backlog</h1>
        <a className="btn" href={`/projects/${id}`}>← Project</a>
      </div>
      <p className="page-sub">{backlog.length} items · {totalPts} points</p>

      <div className="agile-grid">
        <div>
          {backlog.length === 0 && <div className="empty">Backlog is empty. Create work items in the project.</div>}
          {backlog.map((it, i) => (
            <div key={it.id} className="bl-row">
              <span style={{ display: "flex", flexDirection: "column" }}>
                <button className="btn btn-ghost" style={{ padding: "0 4px", height: 16, lineHeight: 1 }} onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                <button className="btn btn-ghost" style={{ padding: "0 4px", height: 16, lineHeight: 1 }} onClick={() => move(i, 1)} disabled={i === backlog.length - 1}>▼</button>
              </span>
              <span className="key">{it.key}</span>
              <span className="title">{it.title}</span>
              <input className="pts" defaultValue={it.storyPoints ?? ""} placeholder="–" onBlur={(e) => e.target.value !== String(it.storyPoints ?? "") && setPoints(it, e.target.value)} />
              <button className="btn btn-ghost" onClick={() => addToSprint(it)}>→ Sprint</button>
            </div>
          ))}
        </div>

        <div className="gpanel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3>Sprints</h3><button className="btn btn-ghost" onClick={createSprint}>+ New</button></div>
          {sprints.map((s) => (
            <div key={s.id} className="sprint-card" data-state={s.state} style={{ borderColor: target === s.id ? "var(--primary)" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button className="btn btn-ghost" style={{ padding: 0, fontWeight: 600 }} onClick={() => setTarget(s.id)}>{s.name}</button>
                <span className={`pill ${s.state === "active" ? "submitted" : s.state === "closed" ? "approved" : "open"}`}>{s.state}</span>
              </div>
              {target === s.id && detail && (
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{detail.items.length} items · {detail.points} pts{s.committedPoints != null ? ` · committed ${s.committedPoints}` : ""}</div>
                  {detail.items.map((it) => (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                      <span>{it.key} {it.title.slice(0, 18)}</span>
                      {s.state !== "closed" && <button className="btn btn-ghost" style={{ padding: "0 6px" }} onClick={() => removeFromSprint(it)}>✕</button>}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {s.state === "planned" && <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => startSprint(s.id)} disabled={detail.items.length === 0}>Start</button>}
                    {s.state !== "planned" && <a className="btn btn-primary" style={{ flex: 1, textAlign: "center" }} href={`/projects/${id}/sprints/${s.id}`}>Open board →</a>}
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
