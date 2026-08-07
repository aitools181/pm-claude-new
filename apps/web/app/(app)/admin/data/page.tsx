"use client";
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
  async function purgeOne(id: string) { if (!confirm("Permanently delete? This cannot be undone.")) return; try { await api(`/recycle-bin/${id}`, { method: "DELETE", org: true }); toast({ message: "Permanently deleted" }); load(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
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
          <h3 style={{ fontSize: 14 }}>Recycle bin ({bin.length})</h3>
          {bin.length === 0 && <div className="empty">Recycle bin is empty.</div>}
          {bin.map((t) => (
            <div key={t.id} className="fieldcard" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><span className="mono muted" style={{ fontSize: 12 }}>{t.key}</span> {t.title}<span className="muted" style={{ fontSize: 11, display: "block" }}>deleted {new Date(t.deletedAt).toLocaleString()}</span></span>
              <span style={{ display: "flex", gap: 6 }}><button className="btn btn-ghost" onClick={() => restore(t.id)}>Restore</button><button className="btn btn-ghost" onClick={() => purgeOne(t.id)}>Delete forever</button></span>
            </div>
          ))}
        </div>
        <div className="gpanel">
          <h3>Retention</h3>
          <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Keep deleted items for (days)</label>
          <input className="input" type="number" value={days} onChange={(e) => setDays(e.target.value)} style={{ marginBottom: 8 }} />
          <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}><input type="checkbox" checked={autoPurge} onChange={(e) => setAutoPurge(e.target.checked)} /> Auto-purge expired</label>
          <button className="btn btn-primary" onClick={savePolicy} style={{ width: "100%", marginBottom: 6 }}>Save policy</button>
          <button className="btn" onClick={purgeExpired} style={{ width: "100%", marginBottom: 12 }}>Purge expired now</button>
          {policies.map((p) => <div key={p.id} className="muted" style={{ fontSize: 12 }}>{p.entity}: {p.retentionDays}d {p.autoPurge ? "· auto" : ""}</div>)}
          <hr style={{ margin: "12px 0", borderColor: "var(--line)" }} />
          <button className="btn" onClick={exportOrg} style={{ width: "100%" }}>Export org data (JSON)</button>
        </div>
      </div>
    </>
  );
}
