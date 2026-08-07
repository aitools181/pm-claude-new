"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Project = { id: string; name: string };
type Item = { id: string; key: string; title: string; parentId: string | null };

export default function MobilityPage() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [bulk, setBulk] = useState("");
  const [move, setMove] = useState<{ item: Item; dest: string; handling: string; preview: string[] | null } | null>(null);

  const loadItems = useCallback(async (pid: string) => {
    if (!pid) return;
    const r = await api<{ results: Item[] }>("/wql/run", { method: "POST", org: true, body: JSON.stringify({ wql: `project = "${pid}"` }) }).catch(() => ({ results: [] as Item[] }));
    setItems(r.results);
  }, []);
  useEffect(() => { api<Project[]>("/projects", { org: true }).then((p) => { setProjects(p); const id = p[0]?.id || ""; setProjectId(id); loadItems(id); }).catch(() => {}); }, [loadItems]);
  function pick(id: string) { setProjectId(id); loadItems(id); }

  async function clone(it: Item) { const sub = confirm("Include subtasks in the clone?"); await api(`/work-items/${it.id}/clone`, { method: "POST", org: true, body: JSON.stringify({ includeSubtasks: sub }) }); toast({ message: "Cloned" }); loadItems(projectId); }
  async function reparent(it: Item) { const pid = prompt("New parent work item id (blank = promote to top level)", it.parentId ?? ""); if (pid === null) return; try { await api(`/work-items/${it.id}/reparent`, { method: "POST", org: true, body: JSON.stringify({ newParentId: pid.trim() || null }) }); toast({ message: "Re-parented" }); loadItems(projectId); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
  async function doBulk() { const lines = bulk.split("\n"); const r = await api<{ created: number; failed: number }>("/work-items/bulk", { method: "POST", org: true, body: JSON.stringify({ projectId, lines }) }); toast({ message: `Created ${r.created}, failed ${r.failed}` }); setBulk(""); loadItems(projectId); }

  async function moveDryRun() { if (!move) return; const r = await api<{ preview: string[] }>(`/work-items/${move.item.id}/move`, { method: "POST", org: true, body: JSON.stringify({ destinationProjectId: move.dest, hierarchyHandling: move.handling, dryRun: true }) }); setMove({ ...move, preview: r.preview }); }
  async function moveConfirm() { if (!move) return; try { await api(`/work-items/${move.item.id}/move`, { method: "POST", org: true, body: JSON.stringify({ destinationProjectId: move.dest, hierarchyHandling: move.handling, reason: "moved via tools" }) }); toast({ message: "Moved" }); setMove(null); loadItems(projectId); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }

  return (
    <>
      <h1 className="page-title">Item tools</h1>
      <p className="page-sub">Clone, re-parent, bulk-create and move work items across projects.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select className="input" value={projectId} onChange={(e) => pick(e.target.value)} style={{ width: 200 }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>

      <div className="builder-grid">
        <div>
          <table className="exec-table">
            <thead><tr><th>Key</th><th>Title</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={3} className="muted">No items.</td></tr>}
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="mono">{it.key}</td><td>{it.title}{it.parentId && <span className="muted" style={{ fontSize: 11 }}> · child</span>}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost" onClick={() => clone(it)}>Clone</button>
                    <button className="btn btn-ghost" onClick={() => reparent(it)}>Re-parent</button>
                    <button className="btn btn-ghost" onClick={() => setMove({ item: it, dest: projects.find((p) => p.id !== projectId)?.id ?? "", handling: "single", preview: null })}>Move</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gpanel">
          <h3>Bulk add</h3>
          <p className="muted" style={{ fontSize: 12 }}>One task title per line.</p>
          <textarea className="input" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} style={{ marginBottom: 8 }} />
          <button className="btn btn-primary" onClick={doBulk} style={{ width: "100%" }} disabled={!bulk.trim()}>Create tasks</button>
        </div>
      </div>

      {move && (
        <div className="fieldcard" style={{ marginTop: 16, borderColor: "var(--primary)" }}>
          <h3>Move “{move.item.title}”</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select className="input" value={move.dest} onChange={(e) => setMove({ ...move, dest: e.target.value, preview: null })}>{projects.filter((p) => p.id !== projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select className="input" value={move.handling} onChange={(e) => setMove({ ...move, handling: e.target.value, preview: null })}><option value="single">Single item</option><option value="subtree">Entire subtree</option><option value="promote_children">Promote children</option></select>
            <button className="btn" onClick={moveDryRun}>Preview</button>
            <button className="btn btn-primary" onClick={moveConfirm} disabled={!move.dest}>Confirm move</button>
            <button className="btn btn-ghost" onClick={() => setMove(null)}>Cancel</button>
          </div>
          {move.preview && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Will move {move.preview.length} item(s): {move.preview.join(", ")}</p>}
        </div>
      )}
    </>
  );
}
