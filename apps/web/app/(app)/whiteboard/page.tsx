"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Board = { id: string; name: string };
type El = { id: string; kind: string; x: number; y: number; w: number; h: number; data: { label?: string; text?: string }; createdWorkItemId: string | null };
type Project = { id: string; name: string };

export default function WhiteboardPage() {
  const toast = useToast();
  const [disabled, setDisabled] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [els, setEls] = useState<El[]>([]);
  const [projects, setProjects] = useState<Project[]>([]); const [proj, setProj] = useState("");

  const loadBoards = useCallback(async () => {
    try { setBoards(await api<Board[]>("/whiteboards", { org: true })); setDisabled(false); }
    catch (e) { if (e instanceof ApiError && /disabled/i.test(e.message)) setDisabled(true); }
  }, []);
  useEffect(() => { loadBoards(); api<Project[]>("/projects", { org: true }).then((p) => { setProjects(p); setProj((x) => x || p[0]?.id || ""); }).catch(() => {}); }, [loadBoards]);
  const open = useCallback(async (id: string) => { setSel(id); const d = await api<{ elements: El[] }>(`/whiteboards/${id}`, { org: true }).catch(() => ({ elements: [] })); setEls(d.elements); }, []);

  async function newBoard() { const name = prompt("Board name"); if (!name) return; const b = await api<Board>("/whiteboards", { method: "POST", org: true, body: JSON.stringify({ name }) }); loadBoards(); open(b.id); }
  async function addNote() { if (!sel) return; const label = prompt("Note text"); if (!label) return; await api(`/whiteboards/${sel}/elements`, { method: "POST", org: true, body: JSON.stringify({ kind: "note", x: 40 + Math.random() * 300, y: 40 + Math.random() * 300, data: { label } }) }); open(sel); }
  async function toTask(e: El) { if (!proj) { toast({ message: "Pick a project" }); return; } await api(`/whiteboards/elements/${e.id}/to-task`, { method: "POST", org: true, body: JSON.stringify({ projectId: proj }) }); toast({ message: "Work item created from element" }); open(sel!); }

  if (disabled) return (<><h1 className="page-title">Whiteboard</h1><div className="module-off">The whiteboard module is disabled. Enable it under <strong>Modules</strong>.</div></>);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Whiteboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="input" value={sel ?? ""} onChange={(e) => open(e.target.value)} style={{ width: 160 }}><option value="">Board…</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <button className="btn" onClick={newBoard}>+ Board</button>
          {sel && <button className="btn btn-primary" onClick={addNote}>+ Note</button>}
        </div>
      </div>
      {sel && <div style={{ marginBottom: 8 }}><select className="input" value={proj} onChange={(e) => setProj(e.target.value)} style={{ width: 180 }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> <span className="muted" style={{ fontSize: 12 }}>click a note to convert it to a task</span></div>}
      {!sel && <p className="muted">Select or create a board.</p>}
      {sel && (
        <div className="wb-canvas">
          {els.map((e) => (
            <div key={e.id} className={`wb-el ${e.kind}`} style={{ left: e.x, top: e.y, width: e.w, height: e.h }} onClick={() => e.kind !== "frame" && toTask(e)} title={e.createdWorkItemId ? "Already a task" : "Click to convert to task"}>
              {e.data.label ?? e.data.text ?? e.kind}
              {e.createdWorkItemId && <span className="pill approved" style={{ display: "block", marginTop: 4 }}>task ✓</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
