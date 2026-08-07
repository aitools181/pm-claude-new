"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../lib/api";
import { Field, Input } from "../../../../components/ui/Field";
import { useToast } from "../../../../components/ui/Toast";

type MStatus = { active: boolean; reason: string | null; startedAt: string | null };
type Schedule = { id: string; name: string; intervalMinutes: number; retentionDays: number; timezone: string; nextRunAt: string; missedRuns: number; lastStatus: string | null; enabled: boolean };
type Backup = { id: string; status: string; note: string | null; startedAt: string; verified: boolean };
type Alert = { id: string; kind: string; message: string; createdAt: string };
type RestoreRun = { id: string; status: string; targetDatabase: string; cutoverStatus: string; evidence: any[] | null; startedAt: string };

export default function MaintenancePage() {
  const toast = useToast();
  const [tab, setTab] = useState<"backups" | "restore">("backups");
  const [m, setM] = useState<MStatus | null>(null);
  const [reason, setReason] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [restores, setRestores] = useState<RestoreRun[]>([]);
  const [sel, setSel] = useState<RestoreRun | null>(null);
  const [ns, setNs] = useState({ name: "", intervalMinutes: 1440, retentionDays: 30, timezone: "UTC", firstRunAt: "" });
  const [rr, setRr] = useState({ backupRunId: "", manifestPath: "/manifests/latest.json", requestedTargetDatabase: "", requestedObjectNamespace: "" });
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setM(await api<MStatus>("/maintenance/status", { org: true }).catch(() => null));
    setSchedules(await api<Schedule[]>("/maintenance/backup-schedules", { org: true }).catch(() => []));
    setBackups(await api<Backup[]>("/maintenance/backups", { org: true }).catch(() => []));
    setAlerts(await api<Alert[]>("/maintenance/alerts", { org: true }).catch(() => []));
    setRestores(await api<RestoreRun[]>("/maintenance/restore", { org: true }).catch(() => []));
  }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);

  async function toggleMaintenance() {
    try {
      if (m?.active) await api("/maintenance/exit", { method: "POST", org: true });
      else await api("/maintenance/enter", { method: "POST", org: true, body: JSON.stringify({ reason: reason || "manual" }) });
      setReason(""); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function createSchedule() {
    try { await api("/maintenance/backup-schedules", { method: "POST", org: true, body: JSON.stringify({ ...ns, firstRunAt: new Date(ns.firstRunAt).toISOString() }) }); setNs({ name: "", intervalMinutes: 1440, retentionDays: 30, timezone: "UTC", firstRunAt: "" }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function runTick() { const res = await api<{ count: number }>("/maintenance/backup-schedules/tick", { method: "POST", org: true }); toast({ message: `${res.count} backup(s) run` }); load(); }
  async function verify(id: string) { await api(`/maintenance/backups/${id}/verify`, { method: "POST", org: true }); toast({ message: "Verified" }); load(); }
  async function requestRestore() {
    try { const res = await api<{ restoreRunId: string; message: string }>("/maintenance/restore/request", { method: "POST", org: true, body: JSON.stringify(rr) }); toast({ message: res.message }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }

  return (
    <>
      <h1 className="page-title">Backup & Restore</h1>
      <p className="page-sub">Scheduled backups with retention and verification; orchestrated, isolated, reversible restores.</p>
      {msg && <div className="callout callout-danger" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className={`mx-banner ${m?.active ? "mx-on" : "mx-off"}`}>
        <span>{m?.active ? `Maintenance mode ACTIVE — mutations blocked${m.reason ? ` (${m.reason})` : ""}` : "Maintenance mode is off — the system is live."}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!m?.active && <input className="input" style={{ height: 32, width: 200 }} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />}
          <button className={`btn ${m?.active ? "btn-primary" : ""}`} onClick={toggleMaintenance}>{m?.active ? "Exit maintenance" : "Enter maintenance"}</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--line)" }}>
        {(["backups", "restore"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="btn btn-ghost" style={{ borderRadius: 0, textTransform: "capitalize", borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent", color: tab === t ? "var(--primary)" : "var(--ink-2)" }}>{t}</button>
        ))}
      </div>

      {tab === "backups" && (
        <>
          <div className="card card-p" style={{ marginBottom: 18 }}>
            <strong>New schedule</strong>
            <div className="cfg-form" style={{ margin: "12px 0" }}>
              <Field label="Name"><Input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder="Nightly" /></Field>
              <Field label="Interval (min)"><Input type="number" value={ns.intervalMinutes} onChange={(e) => setNs({ ...ns, intervalMinutes: Number(e.target.value) })} /></Field>
              <Field label="Retention (days)"><Input type="number" value={ns.retentionDays} onChange={(e) => setNs({ ...ns, retentionDays: Number(e.target.value) })} /></Field>
              <Field label="Timezone"><Input className="mono" value={ns.timezone} onChange={(e) => setNs({ ...ns, timezone: e.target.value })} /></Field>
              <Field label="First run"><Input type="datetime-local" value={ns.firstRunAt} onChange={(e) => setNs({ ...ns, firstRunAt: e.target.value })} /></Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" disabled={!ns.name || !ns.firstRunAt} onClick={createSchedule}>Create schedule</button>
              <button className="btn" onClick={runTick}>Run due now</button>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="callout callout-danger" style={{ marginBottom: 18 }}>
              {alerts.map((a) => <div key={a.id}><span className="mono" style={{ fontSize: 12 }}>{a.kind}</span> — {a.message}</div>)}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <div style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid var(--line)" }}>Schedules</div>
              <table className="table"><thead><tr><th>Name</th><th>Every</th><th>Retention</th><th>Missed</th><th>Last</th></tr></thead>
                <tbody>
                  {schedules.length === 0 && <tr><td colSpan={5} style={{ color: "var(--ink-3)" }}>No schedules.</td></tr>}
                  {schedules.map((s) => <tr key={s.id}><td style={{ fontWeight: 500 }}>{s.name}</td><td>{s.intervalMinutes}m</td><td>{s.retentionDays}d</td><td>{s.missedRuns > 0 ? <span style={{ color: "var(--danger)" }}>{s.missedRuns}</span> : 0}</td><td>{s.lastStatus ?? "—"}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid var(--line)" }}>Recent backups</div>
              <table className="table"><thead><tr><th>When</th><th>Status</th><th>Verified</th><th></th></tr></thead>
                <tbody>
                  {backups.length === 0 && <tr><td colSpan={4} style={{ color: "var(--ink-3)" }}>No backups yet.</td></tr>}
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td>{new Date(b.startedAt).toLocaleString()}</td>
                      <td><span className={`status-pill ${b.status === "completed" ? "st-done" : "st-todo"}`}>{b.status}</span></td>
                      <td>{b.verified ? "✓" : "—"}</td>
                      <td>{!b.verified && <button className="btn btn-ghost" onClick={() => verify(b.id)}>Verify</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "restore" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card card-p">
            <strong>Request a restore</strong>
            <p style={{ color: "var(--ink-2)", fontSize: 13, margin: "4px 0 12px" }}>Restores always target a new isolated database + object namespace. Execution runs via the Maintenance CLI.</p>
            <Field label="Backup"><select className="input" value={rr.backupRunId} onChange={(e) => setRr({ ...rr, backupRunId: e.target.value })}><option value="">Select a backup…</option>{backups.map((b) => <option key={b.id} value={b.id}>{new Date(b.startedAt).toLocaleString()} · {b.status}</option>)}</select></Field>
            <Field label="Manifest path"><Input className="mono" value={rr.manifestPath} onChange={(e) => setRr({ ...rr, manifestPath: e.target.value })} /></Field>
            <div className="cfg-form">
              <Field label="Target database"><Input className="mono" value={rr.requestedTargetDatabase} onChange={(e) => setRr({ ...rr, requestedTargetDatabase: e.target.value })} placeholder="restore_2026_08" /></Field>
              <Field label="Object namespace"><Input className="mono" value={rr.requestedObjectNamespace} onChange={(e) => setRr({ ...rr, requestedObjectNamespace: e.target.value })} placeholder="restore-ns-2026-08" /></Field>
            </div>
            <button className="btn btn-primary" disabled={!rr.backupRunId || !rr.requestedTargetDatabase || !rr.requestedObjectNamespace} onClick={requestRestore}>Request restore</button>
          </div>

          <div className="card">
            <div style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid var(--line)" }}>Restore runs</div>
            {restores.length === 0 && <div style={{ padding: 14, color: "var(--ink-3)" }}>No restore runs.</div>}
            {restores.map((r) => (
              <div key={r.id}>
                <div className="notif" onClick={() => setSel(sel?.id === r.id ? null : r)} style={{ cursor: "pointer" }}>
                  <span className={`status-pill ${r.status === "completed" ? "st-done" : r.status === "aborted" || r.status === "refused" ? "" : "st-todo"}`} style={r.status === "aborted" || r.status === "refused" ? { background: "var(--danger-weak)", color: "#8f2b27" } : {}}>{r.status}</span>
                  <span className="mono" style={{ fontSize: 12, flex: 1 }}>{r.targetDatabase}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>cutover: {r.cutoverStatus}</span>
                </div>
                {sel?.id === r.id && r.evidence && (
                  <div className="evidence" style={{ margin: "8px 14px 14px" }}>
                    {r.evidence.map((e, i) => (
                      <div key={i} className="row"><span className="step">{e.step}</span><span className={e.ok === false ? "bad" : "ok"}>{e.ok === false ? "✗" : "✓"}</span>{e.reason && <span style={{ color: "var(--danger)", fontSize: 12 }}>{e.reason}</span>}{e.found && <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>found {e.found} / expected {e.expected}</span>}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
