"use client";


import { Button as UiButton } from "../../../components/ui";
import { Select as UiSelect } from "../../../components/ui";
import { appPrompt } from "../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { RuntimeStyle } from "../../../components/ui/RuntimeStyle";

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

  async function newBoard() { const name = await appPrompt("Board name"); if (!name) return; const b = await api<Board>("/whiteboards", { method: "POST", org: true, body: JSON.stringify({ name }) }); loadBoards(); open(b.id); }
  async function addNote() { if (!sel) return; const label = await appPrompt("Note text"); if (!label) return; await api(`/whiteboards/${sel}/elements`, { method: "POST", org: true, body: JSON.stringify({ kind: "note", x: 40 + Math.random() * 300, y: 40 + Math.random() * 300, data: { label } }) }); open(sel); }
  async function toTask(e: El) { if (!proj) { toast({ message: "Pick a project" }); return; } await api(`/whiteboards/elements/${e.id}/to-task`, { method: "POST", org: true, body: JSON.stringify({ projectId: proj }) }); toast({ message: "Work item created from element" }); open(sel!); }

  if (disabled) return (<><h1 className="page-title">Whiteboard</h1><div className="module-off">The whiteboard module is disabled. Enable it under <strong>Modules</strong>.</div></>);

  return (
    <>
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Whiteboard</h1>
        <div className="ui-static-a76d597a">
          <UiSelect className="input ui-static-28c0f6ec" value={sel ?? ""} onChange={(e) => open(e.target.value)} ><option value="">Board…</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</UiSelect>
          <UiButton variant="secondary"  onClick={newBoard}>+ Board</UiButton>
          {sel && <UiButton variant="primary"  onClick={addNote}>+ Note</UiButton>}
        </div>
      </div>
      {sel && <div className="ui-static-fdf33f23"><UiSelect className="input ui-static-54f91ac4" value={proj} onChange={(e) => setProj(e.target.value)} >{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect> <span className="muted ui-static-6cb285c6" >click a note to convert it to a task</span></div>}
      {!sel && <p className="muted">Select or create a board.</p>}
      {sel && (
        <div className="wb-canvas">
          {els.map((e) => e.kind === "frame" ? (
            <RuntimeStyle key={e.id} className={`wb-el ${e.kind} runtime-rect`} vars={{ "--runtime-left": `${e.x}px`, "--runtime-top": `${e.y}px`, "--runtime-width": `${e.w}px`, "--runtime-height": `${e.h}px` }}>
              {e.data.label ?? e.data.text ?? e.kind}
            </RuntimeStyle>
          ) : (
            <RuntimeStyle as="button" type="button" key={e.id} className={`wb-el ${e.kind} ui-reset-button runtime-rect`} vars={{ "--runtime-left": `${e.x}px`, "--runtime-top": `${e.y}px`, "--runtime-width": `${e.w}px`, "--runtime-height": `${e.h}px` }} onClick={() => toTask(e)} disabled={Boolean(e.createdWorkItemId)} aria-label={`${e.data.label ?? e.data.text ?? e.kind}${e.createdWorkItemId ? ", already converted to a task" : ", convert to task"}`}>
              {e.data.label ?? e.data.text ?? e.kind}
              {e.createdWorkItemId && <span className="pill approved ui-static-6f28f390">task ✓</span>}
            </RuntimeStyle>
          ))}
        </div>
      )}
    </>
  );
}
