"use client";
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
      <button className="btn btn-primary" onClick={run} disabled={loading}>{loading ? "Running…" : "Run security audit"}</button>

      {audit && (
        <div style={{ marginTop: 16 }}>
          <div className="metric-card" style={{ borderColor: audit.passed ? "var(--h-on_track,#1E7A52)" : "var(--danger)" }}>
            <h3>{audit.passed ? "✓ Passed" : "✗ Findings need attention"}</h3>
            <p className="muted" style={{ fontSize: 13 }}>{audit.criticalHigh} critical/high finding(s)</p>
          </div>
          <table className="exec-table" style={{ marginTop: 12 }}>
            <thead><tr><th>Area</th><th>Check</th><th>Severity</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>
              {audit.findings.map((f) => (
                <tr key={f.id}>
                  <td>{f.area}</td><td className="mono" style={{ fontSize: 12 }}>{f.id}</td>
                  <td>{f.severity}</td>
                  <td>{f.ok ? <span className="pill approved">ok</span> : <span className="pill rejected">{f.severity}</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
