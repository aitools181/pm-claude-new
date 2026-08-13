"use client";


import { Button as UiButton } from "../../../components/ui";
import { Select as UiSelect, Textarea as UiTextarea } from "../../../components/ui";
import { appPrompt, appConfirm } from "../../../components/ui/AppDialog";
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

  async function clone(it: Item) { const sub = await appConfirm("Include subtasks in the clone?"); await api(`/work-items/${it.id}/clone`, { method: "POST", org: true, body: JSON.stringify({ includeSubtasks: sub }) }); toast({ message: "Cloned" }); loadItems(projectId); }
  async function reparent(it: Item) { const pid = await appPrompt("New parent work item id (blank = promote to top level)", it.parentId ?? ""); if (pid === null) return; try { await api(`/work-items/${it.id}/reparent`, { method: "POST", org: true, body: JSON.stringify({ newParentId: pid.trim() || null }) }); toast({ message: "Re-parented" }); loadItems(projectId); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
  async function doBulk() { const lines = bulk.split("\n"); const r = await api<{ created: number; failed: number }>("/work-items/bulk", { method: "POST", org: true, body: JSON.stringify({ projectId, lines }) }); toast({ message: `Created ${r.created}, failed ${r.failed}` }); setBulk(""); loadItems(projectId); }

  async function moveDryRun() { if (!move) return; const r = await api<{ preview: string[] }>(`/work-items/${move.item.id}/move`, { method: "POST", org: true, body: JSON.stringify({ destinationProjectId: move.dest, hierarchyHandling: move.handling, dryRun: true }) }); setMove({ ...move, preview: r.preview }); }
  async function moveConfirm() { if (!move) return; try { await api(`/work-items/${move.item.id}/move`, { method: "POST", org: true, body: JSON.stringify({ destinationProjectId: move.dest, hierarchyHandling: move.handling, reason: "moved via tools" }) }); toast({ message: "Moved" }); setMove(null); loadItems(projectId); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }

  return (
    <>
      <h1 className="page-title">Item tools</h1>
      <p className="page-sub">Clone, re-parent, bulk-create and move work items across projects.</p>
      <div className="ui-static-29a89e4b">
        <UiSelect className="input ui-static-2acaf3b5" value={projectId} onChange={(e) => pick(e.target.value)} >{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect>
      </div>

      <div className="builder-grid">
        <div>
          <table className="exec-table">
            <thead><tr><th>Key</th><th>Title</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={3} className="muted">No items.</td></tr>}
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="mono">{it.key}</td><td>{it.title}{it.parentId && <span className="muted ui-static-11a50812" > · child</span>}</td>
                  <td className="ui-static-4ede699f">
                    <UiButton variant="tertiary"  onClick={() => clone(it)}>Clone</UiButton>
                    <UiButton variant="tertiary"  onClick={() => reparent(it)}>Re-parent</UiButton>
                    <UiButton variant="tertiary"  onClick={() => setMove({ item: it, dest: projects.find((p) => p.id !== projectId)?.id ?? "", handling: "single", preview: null })}>Move</UiButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gpanel">
          <h3>Bulk add</h3>
          <p className="muted ui-static-6cb285c6" >One task title per line.</p>
          <UiTextarea className="input ui-static-fdf33f23" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)}  />
          <UiButton variant="primary" className="ui-static-0466783d" onClick={doBulk}  disabled={!bulk.trim()}>Create tasks</UiButton>
        </div>
      </div>

      {move && (
        <div className="fieldcard ui-static-fcff7eb0" >
          <h3>Move “{move.item.title}”</h3>
          <div className="ui-static-58703f15">
            <UiSelect className="input" value={move.dest} onChange={(e) => setMove({ ...move, dest: e.target.value, preview: null })}>{projects.filter((p) => p.id !== projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect>
            <UiSelect className="input" value={move.handling} onChange={(e) => setMove({ ...move, handling: e.target.value, preview: null })}><option value="single">Single item</option><option value="subtree">Entire subtree</option><option value="promote_children">Promote children</option></UiSelect>
            <UiButton variant="secondary"  onClick={moveDryRun}>Preview</UiButton>
            <UiButton variant="primary"  onClick={moveConfirm} disabled={!move.dest}>Confirm move</UiButton>
            <UiButton variant="tertiary"  onClick={() => setMove(null)}>Cancel</UiButton>
          </div>
          {move.preview && <p className="muted ui-static-b0cc7e05" >Will move {move.preview.length} item(s): {move.preview.join(", ")}</p>}
        </div>
      )}
    </>
  );
}
