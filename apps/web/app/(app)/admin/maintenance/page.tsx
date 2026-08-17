"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../../components/ui";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../lib/api";
import { Field, Input } from "../../../../components/ui/Field";
import { useToast } from "../../../../components/ui/Toast";
import { appPrompt } from "../../../../components/ui/AppDialog";

type MStatus = { active: boolean; reason: string | null; startedAt: string | null };
type Schedule = { id: string; name: string; intervalMinutes: number; retentionDays: number; timezone: string; nextRunAt: string; missedRuns: number; lastStatus: string | null; enabled: boolean };
type Backup = { id: string; status: string; note: string | null; startedAt: string; verified: boolean };
type Alert = { id: string; kind: string; message: string; createdAt: string };
type RestoreRun = { id: string; status: string; targetDatabase: string; cutoverStatus: string; evidence: any[] | null; startedAt: string };
type Finding = { id: string; check: string; severity: "critical" | "high" | "medium"; count: number; sample: string[]; repairable: boolean };
type RepairPreview = { checkId: string; wouldAffect: number; sample: { id: string; action: string }[] };
type QueueStats = { waiting: number; active: number; completed: number; failed: number; delayed: number; oldestWaitingAgeMs: number; failureRatePercent: number; deadLetter: { waiting: number; failed: number }; scheduled: { name: string; pattern: string | null; every: string | null; next: number | null }[] };
type JobRow = { id: string; name: string; timestamp: number; attemptsMade: number; failedReason: string | null; finishedOn: number | null; payload: Record<string, unknown> };
type DlqRow = { id: string; name: string; timestamp: number; payload: Record<string, unknown> };

export default function MaintenancePage() {
  const toast = useToast();
  const [tab, setTab] = useState<"backups" | "restore" | "integrity" | "jobs">("backups");
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

  // ---- X04.2/X04.3 integrity ----
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<RepairPreview | null>(null);
  const [repairReason, setRepairReason] = useState("");

  // ---- X04.4 job/queue admin ----
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [jobStatus, setJobStatus] = useState<"failed" | "waiting" | "active" | "completed" | "delayed">("failed");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [dlq, setDlq] = useState<DlqRow[]>([]);

  async function load() {
    setM(await api<MStatus>("/maintenance/status", { org: true }).catch(() => null));
    setSchedules(await api<Schedule[]>("/maintenance/backup-schedules", { org: true }).catch(() => []));
    setBackups(await api<Backup[]>("/maintenance/backups", { org: true }).catch(() => []));
    setAlerts(await api<Alert[]>("/maintenance/alerts", { org: true }).catch(() => []));
    setRestores(await api<RestoreRun[]>("/maintenance/restore", { org: true }).catch(() => []));
  }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);

  // ---- X04.2/X04.3 integrity handlers ----
  async function runScan() {
    setScanning(true); setFindings(null); setPreview(null);
    try { setFindings(await api<Finding[]>("/maintenance/integrity/scan", { org: true })); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Scan failed", tone: "error" }); }
    finally { setScanning(false); }
  }
  async function previewRepair(checkId: string) {
    try { setPreview(await api<RepairPreview>(`/maintenance/integrity/${checkId}/preview`, { method: "POST", org: true })); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Preview failed", tone: "error" }); }
  }
  async function applyRepair(checkId: string) {
    if (repairReason.trim().length < 5) { toast({ message: "A reason of at least 5 characters is required", tone: "error" }); return; }
    try {
      const r = await api<{ checkId: string; repaired: number }>(`/maintenance/integrity/${checkId}/repair`, { method: "POST", org: true, body: JSON.stringify({ reason: repairReason.trim() }) });
      toast({ message: `Repaired ${r.repaired} row(s)` }); setPreview(null); setRepairReason(""); runScan();
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Repair failed", tone: "error" }); }
  }

  // ---- X04.4 job/queue admin handlers ----
  async function loadJobs() {
    setQueueStats(await api<QueueStats>("/superadmin/jobs/stats").catch(() => null));
    setJobs(await api<JobRow[]>(`/superadmin/jobs?status=${jobStatus}`).catch(() => []));
    setDlq(await api<DlqRow[]>("/superadmin/jobs/dead-letter").catch(() => []));
  }
  useEffect(() => { if (tab === "jobs") loadJobs(); }, [tab, jobStatus]);
  async function retryJob(id: string) { try { await api(`/superadmin/jobs/${id}/retry`, { method: "POST" }); toast({ message: "Job queued for retry" }); loadJobs(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); } }
  async function cancelJob(id: string) { try { await api(`/superadmin/jobs/${id}`, { method: "DELETE" }); toast({ message: "Job removed" }); loadJobs(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); } }
  async function redriveDlq(id: string) { try { await api(`/superadmin/jobs/dead-letter/${id}/redrive`, { method: "POST" }); toast({ message: "Re-driven to the live queue" }); loadJobs(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); } }
  async function discardDlq(id: string) {
    const why = await appPrompt("Reason for discarding this dead-letter job (audited)", "");
    if (!why || why.trim().length < 5) { if (why !== null) toast({ message: "A reason of at least 5 characters is required", tone: "error" }); return; }
    try { await api(`/superadmin/jobs/dead-letter/${id}`, { method: "DELETE", body: JSON.stringify({ reason: why.trim() }) }); toast({ message: "Discarded" }); loadJobs(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }

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
      {msg && <div className="callout callout-danger ui-static-2b583d73" >{msg}</div>}

      <div className={`mx-banner ${m?.active ? "mx-on" : "mx-off"}`}>
        <span>{m?.active ? `Maintenance mode ACTIVE — mutations blocked${m.reason ? ` (${m.reason})` : ""}` : "Maintenance mode is off — the system is live."}</span>
        <div className="ui-static-01ef7fc9">
          {!m?.active && <UiInput className="input ui-static-522b24ba"  placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />}
          <button className={`btn ${m?.active ? "btn-primary" : ""}`} onClick={toggleMaintenance}>{m?.active ? "Exit maintenance" : "Enter maintenance"}</button>
        </div>
      </div>

      <div className="ui-static-67715833">
        {(["backups", "restore", "integrity", "jobs"] as const).map((t) => (
          <UiButton variant="tertiary" key={t} onClick={() => setTab(t)} className="ui-subtab-button" data-active={tab === t || undefined}>{t}</UiButton>
        ))}
      </div>

      {tab === "backups" && (
        <>
          <div className="card card-p ui-static-905d8b3d" >
            <strong>New schedule</strong>
            <div className="cfg-form ui-static-d60550f6" >
              <Field label="Name"><Input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder="Nightly" /></Field>
              <Field label="Interval (min)"><Input type="number" value={ns.intervalMinutes} onChange={(e) => setNs({ ...ns, intervalMinutes: Number(e.target.value) })} /></Field>
              <Field label="Retention (days)"><Input type="number" value={ns.retentionDays} onChange={(e) => setNs({ ...ns, retentionDays: Number(e.target.value) })} /></Field>
              <Field label="Timezone"><Input className="mono" value={ns.timezone} onChange={(e) => setNs({ ...ns, timezone: e.target.value })} /></Field>
              <Field label="First run"><Input type="datetime-local" value={ns.firstRunAt} onChange={(e) => setNs({ ...ns, firstRunAt: e.target.value })} /></Field>
            </div>
            <div className="ui-static-a76d597a">
              <UiButton variant="primary"  disabled={!ns.name || !ns.firstRunAt} onClick={createSchedule}>Create schedule</UiButton>
              <UiButton variant="secondary"  onClick={runTick}>Run due now</UiButton>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="callout callout-danger ui-static-905d8b3d" >
              {alerts.map((a) => <div key={a.id}><span className="mono ui-static-6cb285c6" >{a.kind}</span> — {a.message}</div>)}
            </div>
          )}

          <div className="ui-static-911b26ad">
            <div className="card">
              <div className="ui-static-f71cd2d3">Schedules</div>
              <table className="table"><thead><tr><th>Name</th><th>Every</th><th>Retention</th><th>Missed</th><th>Last</th></tr></thead>
                <tbody>
                  {schedules.length === 0 && <tr><td colSpan={5} className="ui-static-fbeb64b6">No schedules.</td></tr>}
                  {schedules.map((s) => <tr key={s.id}><td className="ui-static-02a2d333">{s.name}</td><td>{s.intervalMinutes}m</td><td>{s.retentionDays}d</td><td>{s.missedRuns > 0 ? <span className="ui-static-497726e8">{s.missedRuns}</span> : 0}</td><td>{s.lastStatus ?? "—"}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="ui-static-f71cd2d3">Recent backups</div>
              <table className="table"><thead><tr><th>When</th><th>Status</th><th>Verified</th><th></th></tr></thead>
                <tbody>
                  {backups.length === 0 && <tr><td colSpan={4} className="ui-static-fbeb64b6">No backups yet.</td></tr>}
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td>{new Date(b.startedAt).toLocaleString()}</td>
                      <td><span className={`status-pill ${b.status === "completed" ? "st-done" : "st-todo"}`}>{b.status}</span></td>
                      <td>{b.verified ? "✓" : "—"}</td>
                      <td>{!b.verified && <UiButton variant="tertiary"  onClick={() => verify(b.id)}>Verify</UiButton>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "restore" && (
        <div className="ui-static-911b26ad">
          <div className="card card-p">
            <strong>Request a restore</strong>
            <p className="ui-static-1574a8fb">Restores always target a new isolated database + object namespace. Execution runs via the Maintenance CLI.</p>
            <Field label="Backup"><UiSelect className="input" value={rr.backupRunId} onChange={(e) => setRr({ ...rr, backupRunId: e.target.value })}><option value="">Select a backup…</option>{backups.map((b) => <option key={b.id} value={b.id}>{new Date(b.startedAt).toLocaleString()} · {b.status}</option>)}</UiSelect></Field>
            <Field label="Manifest path"><Input className="mono" value={rr.manifestPath} onChange={(e) => setRr({ ...rr, manifestPath: e.target.value })} /></Field>
            <div className="cfg-form">
              <Field label="Target database"><Input className="mono" value={rr.requestedTargetDatabase} onChange={(e) => setRr({ ...rr, requestedTargetDatabase: e.target.value })} placeholder="restore_2026_08" /></Field>
              <Field label="Object namespace"><Input className="mono" value={rr.requestedObjectNamespace} onChange={(e) => setRr({ ...rr, requestedObjectNamespace: e.target.value })} placeholder="restore-ns-2026-08" /></Field>
            </div>
            <UiButton variant="primary"  disabled={!rr.backupRunId || !rr.requestedTargetDatabase || !rr.requestedObjectNamespace} onClick={requestRestore}>Request restore</UiButton>
          </div>

          <div className="card">
            <div className="ui-static-f71cd2d3">Restore runs</div>
            {restores.length === 0 && <div className="ui-static-cb617d5f">No restore runs.</div>}
            {restores.map((r) => (
              <div key={r.id}>
                <button type="button" className="notif ui-static-3b6a3a65 ui-reset-button" aria-expanded={sel?.id === r.id} onClick={() => setSel(sel?.id === r.id ? null : r)}>
                  <span className={`status-pill ${r.status === "completed" ? "st-done" : r.status === "aborted" || r.status === "refused" ? "" : "st-todo"}`} data-tone={r.status === "aborted" || r.status === "refused" ? "error" : undefined}>{r.status}</span>
                  <span className="mono ui-static-ceab66cf" >{r.targetDatabase}</span>
                  <span className="ui-static-63e481c4">cutover: {r.cutoverStatus}</span>
                </button>
                {sel?.id === r.id && r.evidence && (
                  <div className="evidence ui-static-f51696ab" >
                    {r.evidence.map((e, i) => (
                      <div key={i} className="row"><span className="step">{e.step}</span><span className={e.ok === false ? "bad" : "ok"}>{e.ok === false ? "✗" : "✓"}</span>{e.reason && <span className="ui-static-b89d96f1">{e.reason}</span>}{e.found && <span className="mono ui-static-6acd729e" >found {e.found} / expected {e.expected}</span>}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "integrity" && (
        <div className="integrity-tab">
          <div className="integrity-head">
            <p className="muted">Read-only checks for orphan rows, hierarchy cycles and dangling permission config. Every repair requires a dry-run preview first.</p>
            <UiButton variant="primary" disabled={scanning} onClick={runScan}>{scanning ? "Scanning…" : "Run scan"}</UiButton>
          </div>
          {findings && <table className="table">
            <thead><tr><th>Check</th><th>Severity</th><th>Count</th><th></th></tr></thead>
            <tbody>
              {findings.map((f) => <tr key={f.id}>
                <td>{f.check}</td>
                <td><span className={`pill ${f.severity === "critical" ? "danger" : f.severity === "high" ? "warn" : "open"}`}>{f.severity}</span></td>
                <td>{f.count}</td>
                <td>{f.count > 0 && f.repairable && <UiButton variant="secondary" size="compact" onClick={() => previewRepair(f.id)}>Preview repair</UiButton>}</td>
              </tr>)}
            </tbody>
          </table>}
          {preview && <div className="integrity-preview">
            <strong>Repair preview — {preview.checkId}</strong>
            <p className="muted">{preview.wouldAffect} row(s) would be affected.</p>
            <ul>{preview.sample.map((s) => <li key={s.id}><span className="mono">{s.id}</span> — {s.action}</li>)}</ul>
            <Field label="Reason (required, audited)"><Input value={repairReason} onChange={(e) => setRepairReason(e.target.value)} placeholder="Cleaning up after project delete" /></Field>
            <div className="button-row">
              <UiButton variant="secondary" onClick={() => setPreview(null)}>Cancel</UiButton>
              <UiButton variant="destructive" disabled={repairReason.trim().length < 5} onClick={() => applyRepair(preview.checkId)}>Apply repair</UiButton>
            </div>
          </div>}
        </div>
      )}

      {tab === "jobs" && (
        <div className="jobs-tab">
          {queueStats && <div className="jobs-stats-grid">
            <div><strong>{queueStats.waiting}</strong><span>Waiting</span></div>
            <div><strong>{queueStats.active}</strong><span>Active</span></div>
            <div><strong>{queueStats.failed}</strong><span>Failed</span></div>
            <div><strong>{queueStats.delayed}</strong><span>Delayed</span></div>
            <div><strong>{queueStats.failureRatePercent}%</strong><span>Failure rate</span></div>
            <div><strong>{queueStats.deadLetter.waiting + queueStats.deadLetter.failed}</strong><span>Dead-letter</span></div>
          </div>}
          {queueStats && queueStats.scheduled.length > 0 && <div className="jobs-scheduled">
            <strong>Scheduled jobs</strong>
            {queueStats.scheduled.map((s) => <div key={s.name}>{s.name}{s.every ? ` — every ${Math.round(Number(s.every) / 60000)} min` : s.pattern ? ` — ${s.pattern}` : ""}{s.next && <span className="muted"> · next {new Date(s.next).toLocaleString()}</span>}</div>)}
          </div>}
          <div className="jobs-status-tabs" role="tablist">
            {(["failed", "waiting", "active", "completed", "delayed"] as const).map((s) => <button key={s} role="tab" aria-selected={jobStatus === s} data-on={jobStatus === s} onClick={() => setJobStatus(s)}>{s}</button>)}
          </div>
          <table className="table">
            <thead><tr><th>Job</th><th>Queued</th><th>Attempts</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {jobs.length === 0 && <tr><td colSpan={5} className="muted">No {jobStatus} jobs.</td></tr>}
              {jobs.map((j) => <tr key={j.id}>
                <td>{j.name}</td><td className="muted">{new Date(j.timestamp).toLocaleString()}</td><td>{j.attemptsMade}</td>
                <td className="muted">{j.failedReason ?? "—"}</td>
                <td className="ui-static-54c2afb7"><UiButton variant="secondary" size="compact" onClick={() => retryJob(j.id)}>Retry</UiButton><UiButton variant="destructive" size="compact" onClick={() => cancelJob(j.id)}>Cancel</UiButton></td>
              </tr>)}
            </tbody>
          </table>
          <strong className="jobs-dlq-title">Dead-letter queue</strong>
          <table className="table">
            <thead><tr><th>Job</th><th>Queued</th><th></th></tr></thead>
            <tbody>
              {dlq.length === 0 && <tr><td colSpan={3} className="muted">Dead-letter queue is empty.</td></tr>}
              {dlq.map((j) => <tr key={j.id}>
                <td>{j.name}</td><td className="muted">{new Date(j.timestamp).toLocaleString()}</td>
                <td className="ui-static-54c2afb7"><UiButton variant="secondary" size="compact" onClick={() => redriveDlq(j.id)}>Re-drive</UiButton><UiButton variant="destructive" size="compact" onClick={() => discardDlq(j.id)}>Discard</UiButton></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
