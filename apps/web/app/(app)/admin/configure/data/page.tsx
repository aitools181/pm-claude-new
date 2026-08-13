"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Select as UiSelect, Textarea as UiTextarea } from "../../../../../components/ui";
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
      {msg && <div className="callout callout-danger ui-static-2b583d73" >{msg}</div>}

      <div className="ui-static-67715833">
        {(["import", "export"] as const).map((t) => (
          <UiButton variant="tertiary" key={t} onClick={() => setTab(t)} className="ui-subtab-button" data-active={tab === t || undefined}>{t}</UiButton>
        ))}
      </div>

      {tab === "import" && (
        <div className="card card-p">
          <Field label="CSV (Title, Priority)"><UiTextarea className="input mono ui-static-34b7bdc6"  value={csv} onChange={(e) => setCsv(e.target.value)} /></Field>
          <Field label="Target project"><UiSelect className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect></Field>
          <div className="ui-static-a76d597a">
            <UiButton variant="secondary"  onClick={doDry}>Dry run</UiButton>
            <UiButton variant="primary"  disabled={!dry || dry.valid === 0 || !projectId} onClick={doRun}>Import {dry?.valid ?? ""} valid rows</UiButton>
          </div>
          {dry && (
            <div className="preview-box ui-static-d6f2af6e" >
              <div className="ui-static-85c71834">{dry.valid} valid · {dry.errors.length} error(s) of {dry.total}</div>
              {dry.errors.map((e) => <div key={e.row} className="cap-line ui-static-497726e8" >Row {e.row}: {e.message}</div>)}
            </div>
          )}
        </div>
      )}

      {tab === "export" && (
        <div className="card card-p">
          <Field label="Project"><UiSelect className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect></Field>
          <UiButton variant="primary"  disabled={!projectId} onClick={doExport}>Export</UiButton>
          {manifest && (
            <div className="preview-box ui-static-d6f2af6e" >
              <div className="ui-static-d771512b">Manifest</div>
              {manifest.files.map((fl) => (
                <div key={fl.name} className="cap-line">{fl.name} — {fl.count} record(s), {fl.bytes} bytes · <span className="ui-static-fbeb64b6">sha256 {fl.sha256.slice(0, 16)}…</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
