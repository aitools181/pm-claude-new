"use client";

import { useEffect, useState } from "react";
import { Button as UiButton } from "../../../../components/ui";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";
import { appConfirm } from "../../../../components/ui/AppDialog";
import { RuntimeStyle } from "../../../../components/ui/RuntimeStyle";

type Funnel = { invited: number; logged_in: number; created_work_item: number; completed_work_item: number };
type UnusedModule = { module: string; lastUsed: string | null };
type Telemetry = { category: string; enabled: boolean };

const FUNNEL_STEPS: { key: keyof Funnel; label: string }[] = [
  { key: "invited", label: "Invited" }, { key: "logged_in", label: "Logged in" },
  { key: "created_work_item", label: "Created a task" }, { key: "completed_work_item", label: "Completed a task" },
];

export default function AdoptionPage() {
  const toast = useToast();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [unused, setUnused] = useState<UnusedModule[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [hasSample, setHasSample] = useState(false);

  async function load() {
    setFunnel(await api<Funnel>("/admin/adoption/funnel", { org: true }).catch(() => null));
    setUnused(await api<UnusedModule[]>("/admin/adoption/unused-modules", { org: true }).catch(() => []));
    setTelemetry(await api<Telemetry[]>("/telemetry-settings", { org: true }).catch(() => []));
  }
  useEffect(() => { load(); }, []);

  async function toggleTelemetry(category: string, enabled: boolean) {
    try { await api("/telemetry-settings", { method: "POST", org: true, body: JSON.stringify({ category, enabled }) }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }
  async function addSampleData() {
    try { await api("/onboarding/sample-data", { method: "POST", org: true }); toast({ message: "Sample project created" }); setHasSample(true); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }
  async function removeSampleData() {
    if (!await appConfirm("Remove all sample data? This cannot be undone.")) return;
    try { const r = await api<{ removed: number }>("/onboarding/sample-data", { method: "DELETE", org: true }); toast({ message: `Removed ${r.removed} sample project(s)` }); setHasSample(false); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }

  const maxFunnel = funnel ? Math.max(1, funnel.invited) : 1;

  return (
    <>
      <h1 className="page-title">Adoption & telemetry</h1>
      <p className="page-sub">How your team is activating the product, which enabled modules aren&rsquo;t being used, and self-hosted telemetry controls.</p>

      <div className="card card-p">
        <strong>Activation funnel</strong>
        {funnel && <div className="adoption-funnel">
          {FUNNEL_STEPS.map((s) => <div key={s.key} className="adoption-funnel-step">
            <div className="adoption-funnel-bar"><RuntimeStyle vars={{ "--funnel-pct": `${(funnel[s.key] / maxFunnel) * 100}%` }} /></div>
            <span>{s.label}</span><strong>{funnel[s.key]}</strong>
          </div>)}
        </div>}
      </div>

      <div className="card card-p">
        <strong>Unused modules (last 30 days)</strong>
        {unused.length === 0 && <p className="muted">Every enabled module has recorded activity — nothing unused right now.</p>}
        {unused.length > 0 && <table className="table">
          <thead><tr><th>Module</th><th></th></tr></thead>
          <tbody>{unused.map((m) => <tr key={m.module}><td>{m.module.replace(/_/g, " ")}</td><td><a href="/admin/modules" className="text-button">Review in Modules</a></td></tr>)}</tbody>
        </table>}
      </div>

      <div className="card card-p">
        <strong>Sample data</strong>
        <p className="muted">A sample project to explore the product before adding real work. Explicitly flagged and excluded from analytics.</p>
        <div className="button-row">
          <UiButton variant="secondary" onClick={addSampleData}>Add sample project</UiButton>
          <UiButton variant="destructive" onClick={removeSampleData}>Remove all sample data</UiButton>
        </div>
      </div>

      <div className="card card-p">
        <strong>Self-hosted telemetry</strong>
        <p className="muted">Off by default. Nothing you write (titles, comments, files) is ever telemetry.</p>
        <table className="table">
          <thead><tr><th>Category</th><th>State</th><th></th></tr></thead>
          <tbody>
            {telemetry.map((t) => <tr key={t.category}>
              <td>{t.category}</td><td><span className={`pill ${t.enabled ? "open" : "danger"}`}>{t.enabled ? "on" : "off"}</span></td>
              <td><UiButton variant="secondary" size="compact" onClick={() => toggleTelemetry(t.category, !t.enabled)}>{t.enabled ? "Turn off" : "Turn on"}</UiButton></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
