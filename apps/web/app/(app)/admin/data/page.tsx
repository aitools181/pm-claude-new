"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput } from "../../../../components/ui";
import { appConfirm } from "../../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Trashed = { id: string; key: string; title: string; deletedAt: string };
type Policy = { id: string; entity: string; retentionDays: number; autoPurge: boolean };

export default function DataOpsPage() {
  const toast = useToast();
  const [bin, setBin] = useState<Trashed[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [days, setDays] = useState("30");
  const [autoPurge, setAutoPurge] = useState(false);

  const load = useCallback(async () => {
    setBin(await api<Trashed[]>("/recycle-bin", { org: true }).catch(() => []));
    setPolicies(await api<Policy[]>("/retention", { org: true }).catch(() => []));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function restore(id: string) { await api(`/recycle-bin/${id}/restore`, { method: "POST", org: true }); toast({ message: "Restored" }); load(); }
  async function purgeOne(id: string) { if (!await appConfirm("Permanently delete? This cannot be undone.")) return; try { await api(`/recycle-bin/${id}`, { method: "DELETE", org: true }); toast({ message: "Permanently deleted" }); load(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
  async function savePolicy() { await api("/retention", { method: "POST", org: true, body: JSON.stringify({ entity: "work_item", retentionDays: Number(days), autoPurge }) }); toast({ message: "Retention policy saved" }); load(); }
  async function purgeExpired() { const r = await api<{ purged: number }>("/retention/purge", { method: "POST", org: true }); toast({ message: `Purged ${r.purged} expired item(s)` }); load(); }
  async function exportOrg() {
    const data = await api<object>("/export", { org: true });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "org-export.json"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="page-title">Data & recycle bin</h1>
      <p className="page-sub">Restore or permanently remove deleted items, set retention, and export your data.</p>
      <div className="builder-grid">
        <div>
          <h3 className="ui-static-433de30b">Recycle bin ({bin.length})</h3>
          {bin.length === 0 && <div className="empty">Recycle bin is empty.</div>}
          {bin.map((t) => (
            <div key={t.id} className="fieldcard ui-static-13313b1a" >
              <span><span className="mono muted ui-static-6cb285c6" >{t.key}</span> {t.title}<span className="muted ui-static-9456bf7e" >deleted {new Date(t.deletedAt).toLocaleString()}</span></span>
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
