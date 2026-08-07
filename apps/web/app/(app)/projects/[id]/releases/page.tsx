"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { useToast } from "../../../../../components/ui/Toast";

type Release = { id: string; name: string; version: string | null; status: string };
type Item = { id: string; key: string; title: string; statusCategory: string };
type Detail = { release: Release & { notes: string | null; releaseDate: string | null }; items: Item[] };
type Notes = { generated: string; itemCount: number };

export default function ReleasesPage() {
  const id = useParams().id as string;
  const toast = useToast();
  const [releases, setReleases] = useState<Release[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [backlog, setBacklog] = useState<Item[]>([]);
  const [pick, setPick] = useState("");

  const loadList = useCallback(async () => setReleases(await api<Release[]>(`/projects/${id}/releases`, { org: true }).catch(() => [])), [id]);
  useEffect(() => { loadList(); api<Item[]>(`/projects/${id}/backlog`, { org: true }).then(setBacklog).catch(() => {}); }, [loadList, id]);
  const open = useCallback(async (rid: string) => {
    setSel(rid);
    setDetail(await api<Detail>(`/releases/${rid}`, { org: true }).catch(() => null));
    setNotes(await api<Notes>(`/releases/${rid}/notes`, { org: true }).catch(() => null));
  }, []);

  async function create() {
    const name = prompt("Release name (e.g. v1.2)"); if (!name) return;
    const version = prompt("Version (optional, e.g. 1.2.0)") || undefined;
    const r = await api<Release>(`/projects/${id}/releases`, { method: "POST", org: true, body: JSON.stringify({ name, version }) });
    await loadList(); open(r.id);
  }
  async function addItem() { if (!sel || !pick) return; await api(`/releases/${sel}/items`, { method: "POST", org: true, body: JSON.stringify({ workItemId: pick }) }); setPick(""); open(sel); }
  async function removeItem(itemId: string) { if (!sel) return; await api(`/releases/${sel}/items/${itemId}`, { method: "DELETE", org: true }); open(sel); }
  async function publish() {
    if (!sel) return;
    try { await api(`/releases/${sel}/publish`, { method: "POST", org: true }); toast({ message: "Release published" }); loadList(); open(sel); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }

  const released = detail?.release.status === "released";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Releases</h1>
        <a className="btn" href={`/projects/${id}`}>← Project</a>
      </div>

      <div className="agile-grid">
        <div>
          {!detail && <p className="muted">Select or create a release.</p>}
          {detail && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <strong style={{ fontSize: 16 }}>{detail.release.name}</strong>
                {detail.release.version && <span className="mono muted">{detail.release.version}</span>}
                <span className={`pill ${released ? "approved" : "open"}`}>{detail.release.status}</span>
                {!released && <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={publish} disabled={detail.items.length === 0}>Publish</button>}
              </div>

              {!released && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Add work item from backlog…</option>
                    {backlog.filter((b) => !detail.items.find((i) => i.id === b.id)).map((b) => <option key={b.id} value={b.id}>{b.key} — {b.title}</option>)}
                  </select>
                  <button className="btn" onClick={addItem} disabled={!pick}>Add</button>
                </div>
              )}

              <h3 style={{ fontSize: 14 }}>Included work ({detail.items.length})</h3>
              {detail.items.length === 0 && <p className="muted">No work included yet.</p>}
              {detail.items.map((it) => (
                <div key={it.id} className="bl-row">
                  <span className="key">{it.key}</span><span className="title">{it.title}</span>
                  <span className={`pill ${it.statusCategory === "done" ? "approved" : "open"}`}>{it.statusCategory}</span>
                  {!released && <button className="btn btn-ghost" onClick={() => removeItem(it.id)}>✕</button>}
                </div>
              ))}

              {notes && notes.itemCount > 0 && (
                <div className="metric-card" style={{ marginTop: 16 }}>
                  <h3>Release notes (auto-generated)</h3>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-2)", margin: 0 }}>{notes.generated}</pre>
                </div>
              )}
            </>
          )}
        </div>

        <div className="gpanel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3>Releases</h3><button className="btn btn-ghost" onClick={create}>+ New</button></div>
          {releases.map((r) => (
            <button key={r.id} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel === r.id ? "var(--primary)" : undefined }} onClick={() => open(r.id)}>
              {r.name} <span className={`pill ${r.status === "released" ? "approved" : "open"}`} style={{ marginLeft: 4 }}>{r.status}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
