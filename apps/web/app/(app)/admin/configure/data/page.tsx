"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { Field, Input } from "../../../../../components/ui/Field";
import { useToast } from "../../../../../components/ui/Toast";

type Project = { id: string; name: string };
type DryRun = { total: number; valid: number; errors: { row: number; message: string }[] };
type Manifest = { files: { name: string; count: number; sha256: string; bytes: number }[] };

export default function DataCentre() {
  const toast = useToast();
  const [tab, setTab] = useState<"import" | "export">("import");
  const [projects, setProjects] = useState<Project[]>([]);
  const [csv, setCsv] = useState("Title,Priority\nDesign API,high\nWrite tests,normal");
  const [mapping] = useState({ title: "Title", priority: "Priority" });
  const [projectId, setProjectId] = useState("");
  const [dry, setDry] = useState<DryRun | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { api<Project[]>("/projects", { org: true }).then((p) => { setProjects(p); if (p[0]) setProjectId(p[0].id); }).catch(() => {}); }, []);

  async function doDry() {
    setMsg(null);
    try { setDry(await api<DryRun>("/import/dry-run", { method: "POST", org: true, body: JSON.stringify({ csv, mapping }) })); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function doRun() {
    try { const res = await api<{ inserted: number; failed: number }>("/import/run", { method: "POST", org: true, body: JSON.stringify({ csv, mapping, projectId }) }); toast({ message: `Imported ${res.inserted}, ${res.failed} failed` }); setDry(null); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function doExport() {
    try { const res = await api<{ manifest: Manifest }>(`/export/project/${projectId}`, { method: "POST", org: true }); setManifest(res.manifest); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }

  return (
    <>
      <h1 className="page-title">Import / Export</h1>
      <p className="page-sub">Import CSV with a dry-run preview; export a project with a checksummed manifest.</p>
      {msg && <div className="callout callout-danger" style={{ marginBottom: 14 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--line)" }}>
        {(["import", "export"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="btn btn-ghost" style={{ borderRadius: 0, textTransform: "capitalize", borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent", color: tab === t ? "var(--primary)" : "var(--ink-2)" }}>{t}</button>
        ))}
      </div>

      {tab === "import" && (
        <div className="card card-p">
          <Field label="CSV (Title, Priority)"><textarea className="input mono" style={{ height: 120, padding: 10, fontSize: 13 }} value={csv} onChange={(e) => setCsv(e.target.value)} /></Field>
          <Field label="Target project"><select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={doDry}>Dry run</button>
            <button className="btn btn-primary" disabled={!dry || dry.valid === 0 || !projectId} onClick={doRun}>Import {dry?.valid ?? ""} valid rows</button>
          </div>
          {dry && (
            <div className="preview-box" style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{dry.valid} valid · {dry.errors.length} error(s) of {dry.total}</div>
              {dry.errors.map((e) => <div key={e.row} className="cap-line" style={{ color: "var(--danger)" }}>Row {e.row}: {e.message}</div>)}
            </div>
          )}
        </div>
      )}

      {tab === "export" && (
        <div className="card card-p">
          <Field label="Project"><select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <button className="btn btn-primary" disabled={!projectId} onClick={doExport}>Export</button>
          {manifest && (
            <div className="preview-box" style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Manifest</div>
              {manifest.files.map((fl) => (
                <div key={fl.name} className="cap-line">{fl.name} — {fl.count} record(s), {fl.bytes} bytes · <span style={{ color: "var(--ink-3)" }}>sha256 {fl.sha256.slice(0, 16)}…</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
