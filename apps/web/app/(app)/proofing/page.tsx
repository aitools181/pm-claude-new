"use client";


import { Button as UiButton } from "../../../components/ui";
import { Select as UiSelect } from "../../../components/ui";
import { appPrompt } from "../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { RuntimeStyle } from "../../../components/ui/RuntimeStyle";

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
    const name = await appPrompt("Asset name"); if (!name) return;
    const fileRef = await appPrompt("Image URL (fileRef)") || "https://via.placeholder.com/800x500?text=Proof+v1";
    const a = await api<Asset>("/proof-assets", { method: "POST", org: true, body: JSON.stringify({ name, fileRef, mimeType: "image/png" }) });
    await loadAssets(); open(a.id);
  }
  async function addVersion() {
    if (!sel) return; const fileRef = await appPrompt("New version image URL"); if (!fileRef) return;
    const r = await api<{ version: number; reapprovalRequired: boolean }>(`/proof-assets/${sel}/versions`, { method: "POST", org: true, body: JSON.stringify({ fileRef, mimeType: "image/png" }) });
    toast({ message: r.reapprovalRequired ? "New version — reapproval required" : "New version added" }); open(sel);
  }
  async function addMarkerAt(x: number, y: number) {
    if (!sel) return;
    const comment = await appPrompt("Marker comment"); if (comment === null) return;
    try { await api(`/proof-assets/${sel}/markers`, { method: "POST", org: true, body: JSON.stringify({ assetVersion: ver, x, y, comment }) }); loadMarkers(sel, ver); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not add the marker" }); }
  }
  async function clickStage(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000;
    await addMarkerAt(x, y);
  }
  async function toggleMarker(m: Marker) { try { await api(`/proof-markers/${m.id}/resolve`, { method: "POST", org: true, body: JSON.stringify({ resolved: !m.resolved }) }); if (sel) loadMarkers(sel, ver); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not update the marker" }); } }
  async function review(status: "approved" | "changes_requested") {
    if (!sel) return; const reason = status === "changes_requested" ? await appPrompt("Reason") || undefined : undefined;
    try { await api(`/proof-assets/${sel}/review`, { method: "POST", org: true, body: JSON.stringify({ assetVersion: d?.asset.currentVersion, status, reason }) }); toast({ message: `Review: ${status}` }); open(sel); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not submit the review" }); }
  }
  function switchVer(v: number) { setVer(v); if (sel) loadMarkers(sel, v); }

  const current = d?.versions.find((v) => v.version === ver);

  return (
    <>
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Proofing</h1>
        <UiButton variant="primary"  onClick={create}>+ New asset</UiButton>
      </div>
      <div className="builder-grid">
        <div>
          {!d && <p className="muted">Select an asset to review. Click on the image to drop a marker.</p>}
          {d && (
            <>
              <div className="ui-static-e745eca9">
                <h3 className="ui-static-11696618">{d.asset.name}</h3>
                <UiSelect className="input ui-static-465bfea3" value={ver} onChange={(e) => switchVer(Number(e.target.value))} >
                  {d.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}{v.version === d.asset.currentVersion ? " (current)" : ""}</option>)}
                </UiSelect>
                {d.currentReview && <span className={`pill ${d.currentReview.status === "approved" ? "approved" : d.currentReview.status === "changes_requested" ? "rejected" : "submitted"}`}>{d.currentReview.status.replace("_", " ")}</span>}
                <span className="ui-static-97445a8d" />
                <UiButton variant="tertiary"  onClick={addVersion}>Upload new version</UiButton>
                <UiButton variant="secondary"  onClick={() => review("changes_requested")}>Request changes</UiButton>
                <UiButton variant="primary"  onClick={() => review("approved")}>Approve</UiButton>
              </div>

              <div className="proof-stage">
                {current && <img src={current.fileRef} alt={d.asset.name} role="button" tabIndex={0} aria-label={`Add proof marker to ${d.asset.name}`} onClick={clickStage} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addMarkerAt(.5, .5); } }} className="ui-static-840b5e07" />}
                {markers.map((m, i) => (
                  <RuntimeStyle as="button" type="button" key={m.id} className={`proof-marker runtime-position ${m.resolved ? "resolved" : ""}`} vars={{ "--runtime-left": `${m.x * 100}%`, "--runtime-top": `${m.y * 100}%` }} title={m.comment ?? ""} aria-label={`${m.resolved ? "Reopen" : "Resolve"} marker ${i + 1}${m.comment ? `: ${m.comment}` : ""}`} onClick={(e) => { e.stopPropagation(); toggleMarker(m); }}>{i + 1}</RuntimeStyle>
                ))}
              </div>

              <div className="ui-static-56f43562">
                <div className="muted ui-static-86c64b5c" >Markers on v{ver} (click a pin to resolve)</div>
                {markers.length === 0 && <p className="muted ui-static-5e0faad2" >No markers on this version.</p>}
                {markers.map((m, i) => <div key={m.id} className="ui-proof-comment" data-resolved={m.resolved || undefined}>{i + 1}. {m.comment} <span className="muted">({(m.x * 100).toFixed(0)}%, {(m.y * 100).toFixed(0)}%)</span></div>)}
              </div>
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>Assets</h3>
          {assets.map((a) => <UiButton variant="tertiary" key={a.id} className="ui-selection-row" data-selected={sel === a.id || undefined} onClick={() => open(a.id)}>{a.name} <span className="muted ui-static-11a50812" >v{a.currentVersion}</span></UiButton>)}
        </div>
      </div>
    </>
  );
}
