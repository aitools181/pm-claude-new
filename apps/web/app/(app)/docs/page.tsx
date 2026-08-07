"use client";
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

  async function create() { const t = prompt("Document title"); if (!t) return; const d = await api<{ id: string }>("/documents", { method: "POST", org: true, body: JSON.stringify({ title: t, blocks: [{ type: "text", text: "" }] }) }); await loadTree(); open(d.id); }
  async function save() { if (!sel) return; await api(`/documents/${sel}`, { method: "PUT", org: true, body: JSON.stringify({ title, blocks }) }); toast({ message: "Saved new version" }); loadTree(); open(sel); }
  async function restore(v: number) { if (!sel) return; await api(`/documents/${sel}/restore`, { method: "POST", org: true, body: JSON.stringify({ version: v }) }); toast({ message: `Restored v${v}` }); open(sel); }
  async function toTask() {
    if (!sel || !proj) { toast({ message: "Pick a project first" }); return; }
    const t = prompt("Task title"); if (!t) return;
    try { await api(`/documents/${sel}/selection-to-task`, { method: "POST", org: true, body: JSON.stringify({ projectId: proj, title: t }) }); toast({ message: "Task created & embedded" }); open(sel); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  const embedFor = (b: Block) => detail?.embeds.find((e) => e.refId === b.refId);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Docs</h1>
        <button className="btn btn-primary" onClick={create}>+ New doc</button>
      </div>
      <div className="docs-layout">
        <div className="doc-tree gpanel">
          {tree.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No documents yet.</p>}
          {tree.map((n) => <button key={n.id} data-active={sel === n.id} style={{ paddingLeft: n.parentId ? 20 : 8 }} onClick={() => open(n.id)}>{n.title}</button>)}
        </div>

        <div>
          {!detail && <p className="muted">Select or create a document.</p>}
          {detail && (
            <>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }} />
              {blocks.map((b, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  {b.type === "embed" ? (
                    <div className="block-embed">
                      <span>🔗 {embedFor(b)?.redacted ? <em className="muted">{embedFor(b)?.label}</em> : embedFor(b)?.label}{embedFor(b)?.statusCategory && <span className="pill open" style={{ marginLeft: 6 }}>{embedFor(b)?.statusCategory}</span>}</span>
                      <button className="btn btn-ghost" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ) : (
                    <textarea className="block-text" rows={2} value={b.text ?? ""} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={() => setBlocks([...blocks, { type: "text", text: "" }])}>+ Text block</button>
                <button className="btn btn-primary" onClick={save}>Save</button>
                <span style={{ flex: 1 }} />
                <select className="input" value={proj} onChange={(e) => setProj(e.target.value)} style={{ width: 150 }}><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <button className="btn" onClick={toTask}>Create task from doc</button>
              </div>

              <div style={{ display: "flex", gap: 18, marginTop: 18 }}>
                <div style={{ flex: 1 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Version history (current v{detail.document.version})</div>
                  {versions.map((v) => (
                    <div key={v.version} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                      <span>v{v.version}{v.restoredFrom ? ` (from v${v.restoredFrom})` : ""} · {new Date(v.createdAt).toLocaleString()}</span>
                      {v.version !== detail.document.version && <button className="btn btn-ghost" style={{ padding: "0 6px" }} onClick={() => restore(v.version)}>Restore</button>}
                    </div>
                  ))}
                </div>
                {detail.backlinks.length > 0 && (
                  <div style={{ flex: 1 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Backlinks</div>
                    {detail.backlinks.map((d) => <button key={d.id} className="btn btn-ghost" style={{ display: "block", textAlign: "left" }} onClick={() => open(d.id)}>{d.title}</button>)}
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
