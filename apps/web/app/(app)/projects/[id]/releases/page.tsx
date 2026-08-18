"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Select as UiSelect } from "../../../../../components/ui";
import { appPrompt } from "../../../../../components/ui/AppDialog";
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
    const name = await appPrompt("Release name (e.g. v1.2)"); if (!name) return;
    const version = await appPrompt("Version (optional, e.g. 1.2.0)") || undefined;
    try { const r = await api<Release>(`/projects/${id}/releases`, { method: "POST", org: true, body: JSON.stringify({ name, version }) }); await loadList(); open(r.id); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not create the release" }); }
  }
  async function addItem() {
    if (!sel || !pick) return;
    try { await api(`/releases/${sel}/items`, { method: "POST", org: true, body: JSON.stringify({ workItemId: pick }) }); setPick(""); open(sel); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not add the item" }); }
  }
  async function removeItem(itemId: string) {
    if (!sel) return;
    try { await api(`/releases/${sel}/items/${itemId}`, { method: "DELETE", org: true }); open(sel); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not remove the item" }); }
  }
  async function publish() {
    if (!sel) return;
    try { await api(`/releases/${sel}/publish`, { method: "POST", org: true }); toast({ message: "Release published" }); loadList(); open(sel); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }

  const released = detail?.release.status === "released";

  return (
    <>
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Releases</h1>
        <a className="btn" href={`/projects/${id}`}>← Project</a>
      </div>

      <div className="agile-grid">
        <div>
          {!detail && <p className="muted">Select or create a release.</p>}
          {detail && (
            <>
              <div className="ui-static-a522af54">
                <strong className="ui-static-1444c6ea">{detail.release.name}</strong>
                {detail.release.version && <span className="mono muted">{detail.release.version}</span>}
                <span className={`pill ${released ? "approved" : "open"}`}>{detail.release.status}</span>
                {!released && <UiButton variant="primary" className="ui-static-6d000617"  onClick={publish} disabled={detail.items.length === 0}>Publish</UiButton>}
              </div>

              {!released && (
                <div className="ui-static-bb2693cf">
                  <UiSelect className="input ui-static-97445a8d" value={pick} onChange={(e) => setPick(e.target.value)} >
                    <option value="">Add work item from backlog…</option>
                    {backlog.filter((b) => !detail.items.find((i) => i.id === b.id)).map((b) => <option key={b.id} value={b.id}>{b.key} — {b.title}</option>)}
                  </UiSelect>
                  <UiButton variant="secondary"  onClick={addItem} disabled={!pick}>Add</UiButton>
                </div>
              )}

              <h3 className="ui-static-433de30b">Included work ({detail.items.length})</h3>
              {detail.items.length === 0 && <p className="muted">No work included yet.</p>}
              {detail.items.map((it) => (
                <div key={it.id} className="bl-row">
                  <span className="key">{it.key}</span><span className="title">{it.title}</span>
                  <span className={`pill ${it.statusCategory === "done" ? "approved" : "open"}`}>{it.statusCategory}</span>
                  {!released && <UiButton variant="tertiary"  onClick={() => removeItem(it.id)}>✕</UiButton>}
                </div>
              ))}

              {notes && notes.itemCount > 0 && (
                <div className="metric-card ui-static-1b0f4999" >
                  <h3>Release notes (auto-generated)</h3>
                  <pre className="ui-static-7f12eb0b">{notes.generated}</pre>
                </div>
              )}
            </>
          )}
        </div>

        <div className="gpanel">
          <div className="ui-static-13313b1a"><h3>Releases</h3><UiButton variant="tertiary"  onClick={create}>+ New</UiButton></div>
          {releases.map((r) => (
            <UiButton variant="tertiary" key={r.id} className="ui-selection-row" data-selected={sel === r.id || undefined} onClick={() => open(r.id)}>
              {r.name} <span className={[`pill ${r.status === "released" ? "approved" : "open"}`, "ui-static-46cec891"].filter(Boolean).join(" ")} >{r.status}</span>
            </UiButton>
          ))}
        </div>
      </div>
    </>
  );
}
