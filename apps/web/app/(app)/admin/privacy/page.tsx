"use client";

import { useEffect, useState } from "react";
import { Button as UiButton, Select as UiSelect } from "../../../../components/ui";
import { Field, Input } from "../../../../components/ui/Field";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";
import { appConfirm } from "../../../../components/ui/AppDialog";

type Dsr = { id: string; subjectUserId: string; requestType: string; status: string; slaDeadline: string; notes: string | null; createdAt: string };
type ErasurePreview = { willAnonymise: { profile: boolean; workItemsAuthored: number; commentsAuthored: number }; willRetainByLegalBasis: boolean; activeHolds: { id: string; scope: string; reason: string }[] };
type Hold = { id: string; scope: string; scopeUserId: string | null; scopeProjectId: string | null; dateFrom: string | null; dateTo: string | null; reason: string; createdAt: string; createdByUserId: string; releasedAt: string | null };
type Member = { id: string; displayName: string; email: string };
type AnonRun = { id: string; targetUserId: string; performedByUserId: string; fieldsAffected: string[]; performedAt: string };

export default function PrivacyPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"dsr" | "holds" | "consent" | "anonymise">("dsr");
  const [members, setMembers] = useState<Member[]>([]);

  // DSR
  const [dsrList, setDsrList] = useState<Dsr[]>([]);
  const [dsrForm, setDsrForm] = useState({ subjectUserId: "", requestType: "access", notes: "" });
  const [preview, setPreview] = useState<{ dsrId: string; data: ErasurePreview } | null>(null);

  // Legal holds
  const [holds, setHolds] = useState<Hold[]>([]);
  const [holdForm, setHoldForm] = useState({ scope: "user", scopeUserId: "", scopeProjectId: "", dateFrom: "", dateTo: "", reason: "" });

  // Anonymisation runs
  const [anonRuns, setAnonRuns] = useState<AnonRun[]>([]);

  async function load() {
    setMembers(await api<Member[]>("/directory/members", { org: true }).catch(() => []));
    setDsrList(await api<Dsr[]>("/privacy/dsr", { org: true }).catch(() => []));
    setHolds(await api<Hold[]>("/privacy/legal-holds", { org: true }).catch(() => []));
    setAnonRuns(await api<AnonRun[]>("/privacy/anonymisation-runs", { org: true }).catch(() => []));
  }
  useEffect(() => { load(); }, []);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName || id.slice(0, 8);

  async function createDsr() {
    if (!dsrForm.subjectUserId) return;
    try { await api("/privacy/dsr", { method: "POST", org: true, body: JSON.stringify(dsrForm) }); setDsrForm({ subjectUserId: "", requestType: "access", notes: "" }); toast({ message: "Request logged" }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }
  async function setDsrStatus(id: string, status: string) {
    try { await api(`/privacy/dsr/${id}/status`, { method: "POST", org: true, body: JSON.stringify({ status }) }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }
  async function exportDsr(d: Dsr) {
    try {
      const r = await api<{ manifest: unknown; data: unknown }>(`/privacy/dsr/${d.id}/export`, { method: "POST", org: true, body: JSON.stringify({ subjectUserId: d.subjectUserId }) });
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `dsr-export-${d.id.slice(0, 8)}.json`; a.click(); URL.revokeObjectURL(a.href);
      toast({ message: "Export bundle downloaded" });
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Export failed", tone: "error" }); }
  }
  async function checkErasure(d: Dsr) {
    try { setPreview({ dsrId: d.id, data: await api<ErasurePreview>(`/privacy/dsr/erasure-preview/${d.subjectUserId}`, { org: true }) }); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }
  async function anonymiseSubject(d: Dsr) {
    if (!await appConfirm(`Anonymise ${nameOf(d.subjectUserId)}? This is irreversible.`)) return;
    try { await api(`/privacy/anonymise/${d.subjectUserId}`, { method: "POST", org: true, body: JSON.stringify({ dsrRequestId: d.id }) }); toast({ message: "User anonymised" }); setPreview(null); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not anonymise — check for an active legal hold", tone: "error" }); }
  }

  async function createHold() {
    if (!holdForm.reason.trim()) return;
    try {
      await api("/privacy/legal-holds", { method: "POST", org: true, body: JSON.stringify({ ...holdForm, scopeUserId: holdForm.scopeUserId || undefined, scopeProjectId: holdForm.scopeProjectId || undefined, dateFrom: holdForm.dateFrom || undefined, dateTo: holdForm.dateTo || undefined }) });
      setHoldForm({ scope: "user", scopeUserId: "", scopeProjectId: "", dateFrom: "", dateTo: "", reason: "" }); toast({ message: "Legal hold created" }); load();
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }
  async function releaseHold(h: Hold) {
    if (!await appConfirm(`Release this legal hold? Retention purge will resume for matching items.`)) return;
    const approver = members.find((m) => m.id !== h.createdByUserId)?.id;
    if (!approver) { toast({ message: "Release requires a second admin account in this organization", tone: "error" }); return; }
    try { await api(`/privacy/legal-holds/${h.id}/release`, { method: "POST", org: true, body: JSON.stringify({ approvedByUserId: approver }) }); toast({ message: "Hold released" }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Release requires a separate approver", tone: "error" }); }
  }

  return (
    <>
      <h1 className="page-title">Privacy operations</h1>
      <p className="page-sub">Data subject requests, legal hold, consent register and anonymisation — every action here is audited.</p>
      <div className="privacy-tabs" role="tablist">
        {(["dsr", "holds", "consent", "anonymise"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} data-on={tab === t} onClick={() => setTab(t)}>{t === "dsr" ? "Data subject requests" : t === "holds" ? "Legal hold" : t === "consent" ? "Consent" : "Anonymisation log"}</button>)}
      </div>

      {tab === "dsr" && <div className="card card-p">
        <strong>Log a new request</strong>
        <div className="privacy-form-row">
          <Field label="Subject"><UiSelect className="input" value={dsrForm.subjectUserId} onChange={(e) => setDsrForm({ ...dsrForm, subjectUserId: e.target.value })}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</UiSelect></Field>
          <Field label="Type"><UiSelect className="input" value={dsrForm.requestType} onChange={(e) => setDsrForm({ ...dsrForm, requestType: e.target.value })}>{["access", "rectification", "erasure", "restriction", "portability", "objection"].map((t) => <option key={t} value={t}>{t}</option>)}</UiSelect></Field>
          <Field label="Notes"><Input value={dsrForm.notes} onChange={(e) => setDsrForm({ ...dsrForm, notes: e.target.value })} placeholder="Optional" /></Field>
          <UiButton variant="primary" disabled={!dsrForm.subjectUserId} onClick={createDsr}>Log request</UiButton>
        </div>
        <table className="table">
          <thead><tr><th>Subject</th><th>Type</th><th>Status</th><th>SLA deadline</th><th></th></tr></thead>
          <tbody>
            {dsrList.length === 0 && <tr><td colSpan={5} className="muted">No requests logged.</td></tr>}
            {dsrList.map((d) => <tr key={d.id}>
              <td>{nameOf(d.subjectUserId)}</td><td className="muted">{d.requestType}</td>
              <td><UiSelect className="input compact" value={d.status} onChange={(e) => setDsrStatus(d.id, e.target.value)}>{["intake", "verifying", "in_progress", "completed", "rejected"].map((s) => <option key={s} value={s}>{s}</option>)}</UiSelect></td>
              <td className={new Date(d.slaDeadline) < new Date() ? "text-danger" : "muted"}>{new Date(d.slaDeadline).toLocaleDateString()}</td>
              <td className="privacy-row-actions">
                {(d.requestType === "access" || d.requestType === "portability") && <UiButton variant="secondary" size="compact" onClick={() => exportDsr(d)}>Export</UiButton>}
                {d.requestType === "erasure" && <UiButton variant="secondary" size="compact" onClick={() => checkErasure(d)}>Preview erasure</UiButton>}
              </td>
            </tr>)}
          </tbody>
        </table>
        {preview && <div className="privacy-erasure-preview">
          <strong>Erasure preview — {nameOf(dsrList.find((d) => d.id === preview.dsrId)?.subjectUserId ?? "")}</strong>
          <p>Would anonymise: profile, {preview.data.willAnonymise.workItemsAuthored} authored work item(s), {preview.data.willAnonymise.commentsAuthored} comment(s).</p>
          {preview.data.willRetainByLegalBasis
            ? <p className="text-danger">Blocked by active legal hold: {preview.data.activeHolds.map((h) => h.reason).join(", ")}</p>
            : <div className="button-row"><UiButton variant="destructive" onClick={() => { const d = dsrList.find((x) => x.id === preview.dsrId); if (d) anonymiseSubject(d); }}>Anonymise now</UiButton></div>}
        </div>}
      </div>}

      {tab === "holds" && <div className="card card-p">
        <strong>Create a legal hold</strong>
        <div className="privacy-form-row">
          <Field label="Scope"><UiSelect className="input" value={holdForm.scope} onChange={(e) => setHoldForm({ ...holdForm, scope: e.target.value })}>{["user", "project", "date_range"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</UiSelect></Field>
          {holdForm.scope === "user" && <Field label="User"><UiSelect className="input" value={holdForm.scopeUserId} onChange={(e) => setHoldForm({ ...holdForm, scopeUserId: e.target.value })}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</UiSelect></Field>}
          {holdForm.scope === "date_range" && <>
            <Field label="From"><Input type="date" value={holdForm.dateFrom} onChange={(e) => setHoldForm({ ...holdForm, dateFrom: e.target.value })} /></Field>
            <Field label="To"><Input type="date" value={holdForm.dateTo} onChange={(e) => setHoldForm({ ...holdForm, dateTo: e.target.value })} /></Field>
          </>}
          <Field label="Reason"><Input value={holdForm.reason} onChange={(e) => setHoldForm({ ...holdForm, reason: e.target.value })} placeholder="Litigation hold — case #1234" /></Field>
          <UiButton variant="primary" disabled={!holdForm.reason.trim()} onClick={createHold}>Create hold</UiButton>
        </div>
        <table className="table">
          <thead><tr><th>Scope</th><th>Reason</th><th>Created</th><th>State</th><th></th></tr></thead>
          <tbody>
            {holds.length === 0 && <tr><td colSpan={5} className="muted">No legal holds.</td></tr>}
            {holds.map((h) => <tr key={h.id}>
              <td>{h.scope}{h.scopeUserId && ` — ${nameOf(h.scopeUserId)}`}</td><td className="muted">{h.reason}</td>
              <td className="muted">{new Date(h.createdAt).toLocaleDateString()}</td>
              <td><span className={`pill ${h.releasedAt ? "open" : "danger"}`}>{h.releasedAt ? "released" : "active"}</span></td>
              <td>{!h.releasedAt && <UiButton variant="secondary" size="compact" onClick={() => releaseHold(h)}>Release</UiButton>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}

      {tab === "consent" && <ConsentTab members={members} nameOf={nameOf} />}

      {tab === "anonymise" && <div className="card card-p">
        <strong>Anonymisation log</strong>
        <p className="muted">Every anonymisation is irreversible and audited. This is the record of who was anonymised, when, and by whom.</p>
        <table className="table">
          <thead><tr><th>Subject</th><th>Performed by</th><th>Fields affected</th><th>When</th></tr></thead>
          <tbody>
            {anonRuns.length === 0 && <tr><td colSpan={4} className="muted">No anonymisation runs yet.</td></tr>}
            {anonRuns.map((r) => <tr key={r.id}>
              <td>{nameOf(r.targetUserId)}</td><td className="muted">{nameOf(r.performedByUserId)}</td>
              <td className="muted">{r.fieldsAffected.join(", ")}</td><td className="muted">{new Date(r.performedAt).toLocaleString()}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </>
  );
}

function ConsentTab({ members, nameOf }: { members: Member[]; nameOf: (id: string) => string }) {
  const toast = useToast();
  const [userId, setUserId] = useState("");
  const [purpose, setPurpose] = useState("telemetry");
  const [version, setVersion] = useState("1.0");
  const [records, setRecords] = useState<{ id: string; purpose: string; version: string; grantedAt: string; withdrawnAt: string | null }[]>([]);

  async function loadFor(uid: string) { if (uid) setRecords(await api<{ id: string; purpose: string; version: string; grantedAt: string; withdrawnAt: string | null }[]>(`/privacy/consent/${uid}`, { org: true }).catch(() => [])); }
  async function grant() {
    if (!userId) return;
    try { await api(`/privacy/consent/${userId}`, { method: "POST", org: true, body: JSON.stringify({ purpose, version }) }); toast({ message: "Consent recorded" }); loadFor(userId); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }
  async function withdraw(p: string) {
    try { await api(`/privacy/consent/${userId}/withdraw`, { method: "POST", org: true, body: JSON.stringify({ purpose: p }) }); toast({ message: "Withdrawn" }); loadFor(userId); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed", tone: "error" }); }
  }

  return <div className="card card-p">
    <strong>Consent register</strong>
    <div className="privacy-form-row">
      <Field label="Member"><UiSelect className="input" value={userId} onChange={(e) => { setUserId(e.target.value); loadFor(e.target.value); }}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</UiSelect></Field>
      <Field label="Purpose"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="telemetry" /></Field>
      <Field label="Version"><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" /></Field>
      <UiButton variant="primary" disabled={!userId} onClick={grant}>Record consent</UiButton>
    </div>
    {userId && <table className="table">
      <thead><tr><th>Purpose</th><th>Version</th><th>Granted</th><th>State</th><th></th></tr></thead>
      <tbody>
        {records.length === 0 && <tr><td colSpan={5} className="muted">No consent records for {nameOf(userId)}.</td></tr>}
        {records.map((r) => <tr key={r.id}>
          <td>{r.purpose}</td><td className="muted">{r.version}</td><td className="muted">{new Date(r.grantedAt).toLocaleDateString()}</td>
          <td><span className={`pill ${r.withdrawnAt ? "danger" : "open"}`}>{r.withdrawnAt ? "withdrawn" : "active"}</span></td>
          <td>{!r.withdrawnAt && <UiButton variant="secondary" size="compact" onClick={() => withdraw(r.purpose)}>Withdraw</UiButton>}</td>
        </tr>)}
      </tbody>
    </table>}
  </div>;
}
