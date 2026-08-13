"use client";

import { Button as UiButton } from "../../../../components/ui";
import { useEffect, useState, useCallback } from "react";
import { api } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Version = { appVersion: string; expectedSchema: number; node: string };
type Migration = { applied: number; expected: number; upToDate: boolean; pending: number; mode: string };
type Changelog = { current: string; entries: { version: string; date: string; highlights: string[] }[] };

export default function ReleasePage() {
  const toast = useToast();
  const [version, setVersion] = useState<Version | null>(null);
  const [migration, setMigration] = useState<Migration | null>(null);
  const [changelog, setChangelog] = useState<Changelog | null>(null);

  const load = useCallback(async () => {
    setVersion(await api<Version>("/release/version").catch(() => null));
    setMigration(await api<Migration>("/release/migration-status", { org: true }).catch(() => null));
    setChangelog(await api<Changelog>("/release/changelog").catch(() => null));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function support() {
    const data = await api<object>("/release/support-bundle", { org: true });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "support-bundle.json"; a.click(); URL.revokeObjectURL(url);
    toast({ message: "Support bundle downloaded" });
  }

  return (
    <>
      <h1 className="page-title">Release & support</h1>
      <p className="page-sub">Version, migration status, changelog and diagnostic support bundle.</p>

      <div className="metric-grid ui-static-87c136df" >
        <div className="metric-card"><div className="metric-label">Version</div><div className="metric-value">{version?.appVersion ?? "—"}</div><div className="muted ui-static-6cb285c6" >node {version?.node}</div></div>
        <div className="metric-card"><div className="metric-label">Schema</div><div className="metric-value">{migration ? `${migration.applied}/${migration.expected}` : "—"}</div><div className="muted ui-static-6cb285c6" >{migration?.mode}{migration && !migration.upToDate ? ` · ${migration.pending} pending` : ""}</div></div>
        <div className="metric-card"><div className="metric-label">Status</div><div className="metric-value">{migration?.upToDate ? "✓" : "⚠"}</div><div className="muted ui-static-6cb285c6" >{migration?.upToDate ? "up to date" : "migration needed"}</div></div>
      </div>
      <UiButton variant="primary" className="ui-static-87c136df" onClick={support} >Download support bundle</UiButton>

      <h3 className="ui-static-433de30b">Changelog</h3>
      {changelog?.entries.map((e) => (
        <div key={e.version} className="fieldcard">
          <strong>{e.version}</strong> <span className="muted ui-static-6cb285c6" >{e.date}</span>
          <ul className="ui-static-fc1e217f">{e.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </div>
      ))}
    </>
  );
}
