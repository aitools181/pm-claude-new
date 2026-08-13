"use client";

import { Button as UiButton } from "../../../../components/ui";
import { useState } from "react";
import { api } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Finding = { id: string; area: string; severity: string; ok: boolean; detail: string };
type Audit = { findings: Finding[]; criticalHigh: number; passed: boolean };

export default function SecurityPage() {
  const toast = useToast();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() { setLoading(true); try { setAudit(await api<Audit>("/security/audit", { org: true })); } catch { toast({ message: "Audit failed" }); } finally { setLoading(false); } }

  return (
    <>
      <h1 className="page-title">Security audit</h1>
      <p className="page-sub">Run a self-audit for cross-tenant isolation, credential storage and field exposure.</p>
      <UiButton variant="primary"  onClick={run} disabled={loading}>{loading ? "Running…" : "Run security audit"}</UiButton>

      {audit && (
        <div className="ui-static-1b0f4999">
          <div className="metric-card" data-tone={audit.passed ? "success" : "error"}>
            <h3>{audit.passed ? "✓ Passed" : "✗ Findings need attention"}</h3>
            <p className="muted ui-static-5e0faad2" >{audit.criticalHigh} critical/high finding(s)</p>
          </div>
          <table className="exec-table ui-static-56f43562" >
            <thead><tr><th>Area</th><th>Check</th><th>Severity</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>
              {audit.findings.map((f) => (
                <tr key={f.id}>
                  <td>{f.area}</td><td className="mono ui-static-6cb285c6" >{f.id}</td>
                  <td>{f.severity}</td>
                  <td>{f.ok ? <span className="pill approved">ok</span> : <span className="pill rejected">{f.severity}</span>}</td>
                  <td className="muted ui-static-6cb285c6" >{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
