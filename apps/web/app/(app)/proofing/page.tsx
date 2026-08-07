"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Asset = { id: string; name: string; currentVersion: number };
type Version = { version: number; fileRef: string; mimeType: string | null };
type Review = { status: string; reason: string | null } | null;
type Detail = { asset: Asset & { reapprovalOnUpdate: boolean }; versions: Version[]; currentReview: Review };
type Marker = { id: string; x: number; y: number; comment: string | null; resolved: boolean };

export default function ProofingPage() {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [ver, setVer] = useState(1);
  const [markers, setMarkers] = useState<Marker[]>([]);

  const loadAssets = useCallback(async () => setAssets(await api<Asset[]>("/proof-assets", { org: true }).catch(() => [])), []);
  useEffect(() => { loadAssets(); }, [loadAssets]);
  const loadMarkers = useCallback(async (id: string, v: number) => setMarkers(await api<Marker[]>(`/proof-assets/${id}/markers?version=${v}`, { org: true }).catch(() => [])), []);
  const open = useCallback(async (id: string) => {
    const dd = await api<Detail>(`/proof-assets/${id}`, { org: true }).catch(() => null);
    setSel(id); setD(dd); const v = dd?.asset.currentVersion ?? 1; setVer(v); if (dd) loadMarkers(id, v);
  }, [loadMarkers]);

  async function create() {
    const name = prompt("Asset name"); if (!name) return;
    const fileRef = prompt("Image URL (fileRef)") || "https://via.placeholder.com/800x500?text=Proof+v1";
    const a = await api<Asset>("/proof-assets", { method: "POST", org: true, body: JSON.stringify({ name, fileRef, mimeType: "image/png" }) });
    await loadAssets(); open(a.id);
  }
  async function addVersion() {
    if (!sel) return; const fileRef = prompt("New version image URL"); if (!fileRef) return;
    const r = await api<{ version: number; reapprovalRequired: boolean }>(`/proof-assets/${sel}/versions`, { method: "POST", org: true, body: JSON.stringify({ fileRef, mimeType: "image/png" }) });
    toast({ message: r.reapprovalRequired ? "New version — reapproval required" : "New version added" }); open(sel);
  }
  async function clickStage(e: React.MouseEvent<HTMLImageElement>) {
    if (!sel) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000;
    const comment = prompt("Marker comment"); if (comment === null) return;
    await api(`/proof-assets/${sel}/markers`, { method: "POST", org: true, body: JSON.stringify({ assetVersion: ver, x, y, comment }) });
    loadMarkers(sel, ver);
  }
  async function toggleMarker(m: Marker) { await api(`/proof-markers/${m.id}/resolve`, { method: "POST", org: true, body: JSON.stringify({ resolved: !m.resolved }) }); if (sel) loadMarkers(sel, ver); }
  async function review(status: "approved" | "changes_requested") {
    if (!sel) return; const reason = status === "changes_requested" ? prompt("Reason") || undefined : undefined;
    await api(`/proof-assets/${sel}/review`, { method: "POST", org: true, body: JSON.stringify({ assetVersion: d?.asset.currentVersion, status, reason }) });
    toast({ message: `Review: ${status}` }); open(sel);
  }
  function switchVer(v: number) { setVer(v); if (sel) loadMarkers(sel, v); }

  const current = d?.versions.find((v) => v.version === ver);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Proofing</h1>
        <button className="btn btn-primary" onClick={create}>+ New asset</button>
      </div>
      <div className="builder-grid">
        <div>
          {!d && <p className="muted">Select an asset to review. Click on the image to drop a marker.</p>}
          {d && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>{d.asset.name}</h3>
                <select className="input" value={ver} onChange={(e) => switchVer(Number(e.target.value))} style={{ width: 120 }}>
                  {d.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}{v.version === d.asset.currentVersion ? " (current)" : ""}</option>)}
                </select>
                {d.currentReview && <span className={`pill ${d.currentReview.status === "approved" ? "approved" : d.currentReview.status === "changes_requested" ? "rejected" : "submitted"}`}>{d.currentReview.status.replace("_", " ")}</span>}
                <span style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={addVersion}>Upload new version</button>
                <button className="btn" onClick={() => review("changes_requested")}>Request changes</button>
                <button className="btn btn-primary" onClick={() => review("approved")}>Approve</button>
              </div>

              <div className="proof-stage">
                {current && <img src={current.fileRef} alt={d.asset.name} onClick={clickStage} style={{ cursor: "crosshair" }} />}
                {markers.map((m, i) => (
                  <span key={m.id} className={`proof-marker ${m.resolved ? "resolved" : ""}`} style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }} title={m.comment ?? ""} onClick={(e) => { e.stopPropagation(); toggleMarker(m); }}>{i + 1}</span>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Markers on v{ver} (click a pin to resolve)</div>
                {markers.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No markers on this version.</p>}
                {markers.map((m, i) => <div key={m.id} style={{ fontSize: 13, padding: "3px 0", textDecoration: m.resolved ? "line-through" : "none", color: m.resolved ? "var(--ink-3)" : "var(--ink)" }}>{i + 1}. {m.comment} <span className="muted">({(m.x * 100).toFixed(0)}%, {(m.y * 100).toFixed(0)}%)</span></div>)}
              </div>
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>Assets</h3>
          {assets.map((a) => <button key={a.id} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel === a.id ? "var(--primary)" : undefined }} onClick={() => open(a.id)}>{a.name} <span className="muted" style={{ fontSize: 11 }}>v{a.currentVersion}</span></button>)}
        </div>
      </div>
    </>
  );
}
