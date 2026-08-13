"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "../../../../lib/api";

type Evidence = { total: number; passed: number; passRate: number; latest: { status: string; at: string } | null; lastGoodRecovery: { at: string; rpoSeconds: number; rtoSeconds: number; target: string } | null };
type Drill = { id: string; target: string; status: string; checksumsOk: boolean; reconciled: boolean; appStarted: boolean; rpoSeconds: number | null; rtoSeconds: number | null; startedAt: string };

const fmt = (s: number | null) => (s == null ? "—" : s >= 3600 ? `${(s / 3600).toFixed(1)}h` : s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`);

export default function RecoveryPage() {
  const [ev, setEv] = useState<Evidence | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);

  const load = useCallback(async () => {
    setEv(await api<Evidence>("/dr/recovery-evidence", { org: true }).catch(() => null));
    setDrills(await api<Drill[]>("/dr/drills", { org: true }).catch(() => []));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <h1 className="page-title">Recovery evidence</h1>
      <p className="page-sub">Restore-drill history with checksum integrity, reconciliation and RPO/RTO.</p>

      {ev && (
        <div className="metric-grid ui-static-87c136df" >
          <div className="metric-card"><div className="metric-label">Drills passed</div><div className="metric-value">{ev.passed}/{ev.total}</div><div className="muted ui-static-6cb285c6" >{ev.passRate}% pass rate</div></div>
          <div className="metric-card"><div className="metric-label">Last good RPO</div><div className="metric-value">{fmt(ev.lastGoodRecovery?.rpoSeconds ?? null)}</div><div className="muted ui-static-6cb285c6" >data age at recovery</div></div>
          <div className="metric-card"><div className="metric-label">Last good RTO</div><div className="metric-value">{fmt(ev.lastGoodRecovery?.rtoSeconds ?? null)}</div><div className="muted ui-static-6cb285c6" >time to recover</div></div>
        </div>
      )}

      <table className="exec-table">
        <thead><tr><th>Started</th><th>Target</th><th>Checksums</th><th>Reconciled</th><th>App</th><th>RPO</th><th>RTO</th><th>Result</th></tr></thead>
        <tbody>
          {drills.length === 0 && <tr><td colSpan={8} className="muted">No restore drills recorded yet.</td></tr>}
          {drills.map((d) => (
            <tr key={d.id}>
              <td>{new Date(d.startedAt).toLocaleString()}</td><td>{d.target}</td>
              <td>{d.checksumsOk ? "✓" : "✗"}</td><td>{d.reconciled ? "✓" : "✗"}</td><td>{d.appStarted ? "✓" : "✗"}</td>
              <td>{fmt(d.rpoSeconds)}</td><td>{fmt(d.rtoSeconds)}</td>
              <td>{d.status === "passed" ? <span className="pill approved">passed</span> : <span className="pill rejected">failed</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
