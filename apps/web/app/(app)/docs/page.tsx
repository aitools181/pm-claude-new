"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../../../components/ui";
import { appPrompt } from "../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Node = { id: string; parentId: string | null; title: string };
type Block = { type: string; text?: string; refKind?: string; refId?: string };
type Embed = { refKind: string; refId: string; allowed: boolean; redacted: boolean; label: string; statusCategory?: string };
type Detail = { document: { id: string; title: string; version: number }; blocks: Block[]; embeds: Embed[]; backlinks: { id: string; title: string }[] };
type Version = { version: number; restoredFrom: number | null; createdAt: string };
type Project = { id: string; name: string };

export default function DocsPage() {
  const toast = useToast();
  const [tree, setTree] = useState<Node[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [proj, setProj] = useState("");

  const loadTree = useCallback(async () => setTree(await api<Node[]>("/documents/tree", { org: true }).catch(() => [])), []);
  useEffect(() => { loadTree(); api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, [loadTree]);
  const open = useCallback(async (id: string) => {
    setSel(id);
    const d = await api<Detail>(`/documents/${id}`, { org: true }).catch(() => null);
    setDetail(d); setTitle(d?.document.title ?? ""); setBlocks(d?.blocks ?? []);
    setVersions(await api<Version[]>(`/documents/${id}/versions`, { org: true }).catch(() => []));
  }, []);

  async function create() { const t = await appPrompt("Document title"); if (!t) return; const d = await api<{ id: string }>("/documents", { method: "POST", org: true, body: JSON.stringify({ title: t, blocks: [{ type: "text", text: "" }] }) }); await loadTree(); open(d.id); }
  async function save() { if (!sel) return; await api(`/documents/${sel}`, { method: "PUT", org: true, body: JSON.stringify({ title, blocks }) }); toast({ message: "Saved new version" }); loadTree(); open(sel); }
  async function restore(v: number) { if (!sel) return; await api(`/documents/${sel}/restore`, { method: "POST", org: true, body: JSON.stringify({ version: v }) }); toast({ message: `Restored v${v}` }); open(sel); }
  async function toTask() {
    if (!sel || !proj) { toast({ message: "Pick a project first" }); return; }
    const t = await appPrompt("Task title"); if (!t) return;
    try { await api(`/documents/${sel}/selection-to-task`, { method: "POST", org: true, body: JSON.stringify({ projectId: proj, title: t }) }); toast({ message: "Task created & embedded" }); open(sel); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  const embedFor = (b: Block) => detail?.embeds.find((e) => e.refId === b.refId);

  return (
    <>
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Docs</h1>
        <UiButton variant="primary"  onClick={create}>+ New doc</UiButton>
      </div>
      <div className="docs-layout">
        <div className="doc-tree gpanel">
          {tree.length === 0 && <p className="muted ui-static-5e0faad2" >No documents yet.</p>}
          {tree.map((n) => <button key={n.id} data-active={sel === n.id} className="ui-doc-tree-item" data-nested={Boolean(n.parentId) || undefined} onClick={() => open(n.id)}>{n.title}</button>)}
        </div>

        <div>
          {!detail && <p className="muted">Select or create a document.</p>}
          {detail && (
            <>
              <UiInput className="input ui-static-0f45719b" value={title} onChange={(e) => setTitle(e.target.value)}  />
              {blocks.map((b, i) => (
                <div key={i} className="ui-static-fdf33f23">
                  {b.type === "embed" ? (
                    <div className="block-embed">
                      <span>🔗 {embedFor(b)?.redacted ? <em className="muted">{embedFor(b)?.label}</em> : embedFor(b)?.label}{embedFor(b)?.statusCategory && <span className="pill open ui-static-391ef124" >{embedFor(b)?.statusCategory}</span>}</span>
                      <UiButton variant="tertiary"  onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>✕</UiButton>
                    </div>
                  ) : (
                    <UiTextarea className="block-text" rows={2} value={b.text ?? ""} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  )}
                </div>
              ))}
              <div className="ui-static-ac54538e">
                <UiButton variant="tertiary"  onClick={() => setBlocks([...blocks, { type: "text", text: "" }])}>+ Text block</UiButton>
                <UiButton variant="primary"  onClick={save}>Save</UiButton>
                <span className="ui-static-97445a8d" />
                <UiSelect className="input ui-static-7c07cdf8" value={proj} onChange={(e) => setProj(e.target.value)} ><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect>
                <UiButton variant="secondary"  onClick={toTask}>Create task from doc</UiButton>
              </div>

              <div className="ui-static-0cee3872">
                <div className="ui-static-97445a8d">
                  <div className="muted ui-static-86c64b5c" >Version history (current v{detail.document.version})</div>
                  {versions.map((v) => (
                    <div key={v.version} className="ui-static-78ed4c5e">
                      <span>v{v.version}{v.restoredFrom ? ` (from v${v.restoredFrom})` : ""} · {new Date(v.createdAt).toLocaleString()}</span>
                      {v.version !== detail.document.version && <UiButton variant="tertiary" className="ui-static-7c699c10"  onClick={() => restore(v.version)}>Restore</UiButton>}
                    </div>
                  ))}
                </div>
                {detail.backlinks.length > 0 && (
                  <div className="ui-static-97445a8d">
                    <div className="muted ui-static-86c64b5c" >Backlinks</div>
                    {detail.backlinks.map((d) => <UiButton variant="tertiary" key={d.id} className="ui-static-a39f7c7b"  onClick={() => open(d.id)}>{d.title}</UiButton>)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
