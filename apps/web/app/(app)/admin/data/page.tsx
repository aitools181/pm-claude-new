"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput } from "../../../../components/ui";
import { appConfirm } from "../../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Trashed = { id: string; key: string; title: string; deletedAt: string; deletedBy?: string | null; deleteReason?: string | null; isDirect: boolean; isCascaded: boolean };
type Policy = { id: string; entity: string; retentionDays: number; autoPurge: boolean };
type BulkResult = { total: number; restored: number; results: { id: string; ok: boolean; error?: string }[] };

export default function DataOpsPage() {
  const toast = useToast();
  const [scope, setScope] = useState<"mine" | "project" | "org">("org");
  const [bin, setBin] = useState<Trashed[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [days, setDays] = useState("30");
  const [autoPurge, setAutoPurge] = useState(false);

  const load = useCallback(async () => {
    setBin(await api<Trashed[]>(`/trash?scope=${scope}`, { org: true }).catch(() => []));
    setPolicies(await api<Policy[]>("/retention", { org: true }).catch(() => []));
  }, [scope]);
  useEffect(() => { load(); setSelected(new Set()); }, [load]);

  async function restore(id: string) {
    try { const r = await api<{ restored: number; parentDead: boolean }>(`/trash/${id}/restore`, { method: "POST", org: true }); toast({ message: r.parentDead ? `Restored, but the parent no longer exists — re-parent it from the task pane` : `Restored${r.restored > 1 ? ` (${r.restored} items, cascade)` : ""}` }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Restore failed", tone: "error" }); }
  }
  async function purgeOne(id: string) { if (!await appConfirm("Permanently delete? This cannot be undone.")) return; try { await api(`/recycle-bin/${id}`, { method: "DELETE", org: true }); toast({ message: "Permanently deleted" }); load(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); } }
  function toggle(id: string) { setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() { setSelected((s) => s.size === bin.length ? new Set() : new Set(bin.map((t) => t.id))); }
  async function bulkRestoreSelected() {
    if (!selected.size) return;
    const r = await api<BulkResult>("/trash/bulk-restore", { method: "POST", org: true, body: JSON.stringify({ ids: [...selected] }) });
    setBulkResult(r); toast({ message: `${r.restored} of ${r.total} restored` }); load();
  }
  async function savePolicy() { await api("/retention", { method: "POST", org: true, body: JSON.stringify({ entity: "work_item", retentionDays: Number(days), autoPurge }) }); toast({ message: "Retention policy saved" }); load(); }
  async function purgeExpired() { const r = await api<{ purged: number }>("/retention/purge", { method: "POST", org: true }); toast({ message: `Purged ${r.purged} expired item(s)` }); load(); }
  async function exportOrg() {
    const data = await api<object>("/export", { org: true });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "org-export.json"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="page-title">Trash & recycle bin</h1>
      <p className="page-sub">Restore or permanently remove deleted items, set retention, and export your data.</p>
      <div className="builder-grid">
        <div>
          <div className="trash-scope-tabs" role="tablist" aria-label="Trash scope">
            {(["mine", "project", "org"] as const).map((s) => <button key={s} role="tab" aria-selected={scope === s} data-on={scope === s} onClick={() => setScope(s)}>{s === "mine" ? "My trash" : s === "project" ? "Project trash" : "Organization trash"}</button>)}
          </div>
          <div className="trash-bulk-bar">
            <label className="trash-select-all"><input type="checkbox" checked={selected.size > 0 && selected.size === bin.length} onChange={toggleAll} /> {selected.size > 0 ? `${selected.size} selected` : `${bin.length} item(s)`}</label>
            {selected.size > 0 && <UiButton variant="primary" size="compact" onClick={bulkRestoreSelected}>Restore selected</UiButton>}
          </div>
          {bulkResult && <div className="callout callout-info trash-bulk-result">{bulkResult.restored}/{bulkResult.total} restored.{bulkResult.results.some((r) => !r.ok) && ` Failed: ${bulkResult.results.filter((r) => !r.ok).map((r) => r.error).join("; ")}`}</div>}
          {bin.length === 0 && <div className="empty">Trash is empty in this scope.</div>}
          {bin.map((t) => (
            <div key={t.id} className="fieldcard ui-static-13313b1a" >
              <label className="trash-row-check"><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} /></label>
              <span><span className="mono muted ui-static-6cb285c6" >{t.key}</span> {t.title}{t.isCascaded && <span className="trash-cascade-badge">cascaded</span>}<span className="muted ui-static-9456bf7e" >deleted {new Date(t.deletedAt).toLocaleString()}{t.deleteReason ? ` — ${t.deleteReason}` : ""}</span></span>
              <span className="ui-static-49cd0921"><UiButton variant="tertiary"  onClick={() => restore(t.id)}>Restore</UiButton><UiButton variant="tertiary"  onClick={() => purgeOne(t.id)}>Delete forever</UiButton></span>
            </div>
          ))}
        </div>
        <div className="gpanel">
          <h3>Retention</h3>
          <label className="ui-static-47ff695b">Keep deleted items for (days)</label>
          <UiInput className="input ui-static-fdf33f23" type="number" value={days} onChange={(e) => setDays(e.target.value)}  />
          <label className="ui-static-06b02abc"><input type="checkbox" checked={autoPurge} onChange={(e) => setAutoPurge(e.target.checked)} /> Auto-purge expired</label>
          <UiButton variant="primary" className="ui-static-1c3b1f2e" onClick={savePolicy} >Save policy</UiButton>
          <UiButton variant="secondary" className="ui-static-a359258b" onClick={purgeExpired} >Purge expired now</UiButton>
          {policies.map((p) => <div key={p.id} className="muted ui-static-6cb285c6" >{p.entity}: {p.retentionDays}d {p.autoPurge ? "· auto" : ""}</div>)}
          <hr className="ui-static-37034cee" />
          <UiButton variant="secondary" className="ui-static-0466783d" onClick={exportOrg} >Export org data (JSON)</UiButton>
        </div>
      </div>
    </>
  );
}
