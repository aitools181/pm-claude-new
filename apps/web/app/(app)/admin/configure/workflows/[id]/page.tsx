"use client";


import { Button as UiButton } from "../../../../../../components/ui";
import { Select as UiSelect } from "../../../../../../components/ui";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { Field, Input } from "../../../../../../components/ui/Field";
import { useToast } from "../../../../../../components/ui/Toast";

type Version = { id: string; versionNo: number; status: string };
type Status = { id: string; key: string; name: string; category: string; isInitial: boolean };
type Transition = { id: string; name: string; fromStatusId: string | null; toStatusId: string };

export default function WorkflowEditor() {
  const id = useParams().id as string;
  const toast = useToast();
  const [name, setName] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [active, setActive] = useState<Version | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [ns, setNs] = useState({ key: "", name: "", category: "todo", isInitial: false });
  const [nt, setNt] = useState({ name: "", fromStatusId: "", toStatusId: "" });
  const [gateFor, setGateFor] = useState<string | null>(null);
  const [gateKind, setGateKind] = useState("approval_required");
  const [gateConfig, setGateConfig] = useState("");
  const [simulateFor, setSimulateFor] = useState<string | null>(null);
  const [simulateItemKey, setSimulateItemKey] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simulateResult, setSimulateResult] = useState<{ wouldSucceed: boolean; steps: { stage: string; kind: string; passed: boolean; detail: string }[] } | null>(null);
  async function runSimulate(transitionId: string) {
    if (!simulateItemKey.trim()) return;
    setSimulating(true); setSimulateResult(null);
    try {
      const found = await api<{ id: string }>(`/work-items/by-key/${encodeURIComponent(simulateItemKey.trim())}`, { org: true });
      const result = await api<{ wouldSucceed: boolean; steps: { stage: string; kind: string; passed: boolean; detail: string }[] }>(`/workflows/items/${found.id}/transition/${transitionId}/simulate`, { method: "POST", org: true });
      setSimulateResult(result);
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not find that work item or run the simulation"); }
    finally { setSimulating(false); }
  }
  const [issues, setIssues] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function addGate(transitionId: string) {
    const ruleType = gateKind === "assign_actor" || gateKind === "set_progress" ? "post_action" : "validator";
    const config = gateKind === "field_required" ? { fieldKey: gateConfig.trim() } : gateKind === "set_progress" ? { progress: Number(gateConfig) || 0 } : gateKind === "approval_required" && gateConfig.trim() ? { definitionId: gateConfig.trim() } : undefined;
    try {
      await api(`/workflows/transitions/${transitionId}/rules`, { method: "POST", org: true, body: JSON.stringify({ ruleType, kind: gateKind, config }) });
      setMsg(`Gate added to transition — ${gateKind.replace(/_/g, " ")}`); setGateFor(null); setGateConfig("");
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not add gate"); }
  }

  const editable = active?.status === "draft";

  const loadVersion = useCallback(async (v: Version) => {
    setActive(v);
    const detail = await api<{ statuses: Status[]; transitions: Transition[] }>(`/workflows/versions/${v.id}/detail`, { org: true });
    setStatuses(detail.statuses); setTransitions(detail.transitions);
  }, []);

  const load = useCallback(async () => {
    const wf = await api<{ workflow: { name: string }; versions: Version[] }>(`/workflows/${id}`, { org: true });
    setName(wf.workflow.name); setVersions(wf.versions);
    const draft = wf.versions.find((v) => v.status === "draft") ?? wf.versions[wf.versions.length - 1];
    if (draft) await loadVersion(draft);
  }, [id, loadVersion]);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [load]);

  async function addStatus() {
    if (!active) return;
    try { await api(`/workflows/versions/${active.id}/statuses`, { method: "POST", org: true, body: JSON.stringify(ns) }); setNs({ key: "", name: "", category: "todo", isInitial: false }); loadVersion(active); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function addTransition() {
    if (!active) return;
    try { await api(`/workflows/versions/${active.id}/transitions`, { method: "POST", org: true, body: JSON.stringify({ name: nt.name, fromStatusId: nt.fromStatusId || null, toStatusId: nt.toStatusId }) }); setNt({ name: "", fromStatusId: "", toStatusId: "" }); loadVersion(active); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function validate() {
    if (!active) return;
    const res = await api<{ ok: boolean; issues: string[] }>(`/workflows/versions/${active.id}/validate`, { org: true });
    setIssues(res.issues); if (res.ok) toast({ message: "Workflow is valid" });
  }
  async function publish() {
    if (!active) return;
    try { await api(`/workflows/versions/${active.id}/publish`, { method: "POST", org: true }); toast({ message: "Published — this version is now immutable" }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? (e.details ? (e.details as string[]).join("; ") : e.message) : "Failed"); }
  }
  async function branch() {
    try { const v = await api<Version>(`/workflows/${id}/versions`, { method: "POST", org: true }); toast({ message: `Draft v${v.versionNo} created` }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function previewMigration() {
    if (!active) return;
    const res = await api<any[]>(`/workflows/${id}/migration-preview/${active.id}`, { org: true });
    toast({ message: `${res.length} item(s); ${res.filter((r) => r.mapsCleanly).length} map cleanly` });
  }

  const statusName = (sid: string | null) => sid ? (statuses.find((s) => s.id === sid)?.name ?? "?") : "Any";

  return (
    <>
      <div className="ui-static-89e98afd">
        <h1 className="page-title ui-static-ef0b7a11" >{name || "Workflow"}</h1>
        <a className="btn btn-ghost" href="/admin/configure/workflows">← All workflows</a>
      </div>
      <div className="ui-static-0d6300c2">
        {versions.map((v) => (
          <button key={v.id} className={`badge ui-version-chip ${v.status === "published" ? "pill-published" : "pill-draft"}`} onClick={() => loadVersion(v)} data-active={active?.id === v.id || undefined}>
            v{v.versionNo} · {v.status}
          </button>
        ))}
        {active?.status === "published" && <UiButton variant="secondary"  onClick={branch}>Branch to new draft</UiButton>}
        {active?.status === "published" && <UiButton variant="tertiary"  onClick={previewMigration}>Migration preview</UiButton>}
      </div>
      {msg && <div className="callout callout-danger ui-static-2b583d73" >{msg}</div>}
      {!editable && active && <div className="callout callout-info ui-static-2b583d73" >This version is published and immutable. Branch a new draft to make changes.</div>}

      <div className="wf-canvas">
        {statuses.map((s) => (
          <div key={s.id} className="wf-status">
            <div className="cat">{s.category}</div>
            <div className="nm">{s.name}</div>
            {s.isInitial && <div className="init">● initial</div>}
            <div className="ui-static-8a77e5a3">
              {transitions.filter((t) => t.fromStatusId === s.id || t.fromStatusId === null).map((t) => (
                <div key={t.id} className="wf-trans">{t.name} <span className="arrow">→</span> {statusName(t.toStatusId)}
                  {editable && <button type="button" className="wf-gate-btn" aria-expanded={gateFor === t.id} onClick={() => setGateFor(gateFor === t.id ? null : t.id)}>+ gate</button>}
                  {gateFor === t.id && <div className="wf-gate-form">
                    <UiSelect className="input" value={gateKind} onChange={(e) => { setGateKind(e.target.value); setGateConfig(""); }}>
                      <option value="approval_required">Approval required (blocks until approved)</option>
                      <option value="comment_required">Comment required</option>
                      <option value="field_required">Field required</option>
                      <option value="assign_actor">Assign actor (post-action)</option>
                      <option value="set_progress">Set progress % (post-action)</option>
                    </UiSelect>
                    {gateKind === "field_required" && <Input value={gateConfig} onChange={(e) => setGateConfig(e.target.value)} placeholder="fieldKey" />}
                    {gateKind === "set_progress" && <Input type="number" value={gateConfig} onChange={(e) => setGateConfig(e.target.value)} placeholder="100" />}
                    {gateKind === "approval_required" && <Input value={gateConfig} onChange={(e) => setGateConfig(e.target.value)} placeholder="Approval definition id (optional)" />}
                    <UiButton variant="primary" size="compact" onClick={() => addGate(t.id)}>Add</UiButton>
                  </div>}
                  <button type="button" className="wf-gate-btn" onClick={() => { setSimulateFor(simulateFor === t.id ? null : t.id); setSimulateResult(null); }}>Simulate</button>
                  {simulateFor === t.id && <div className="wf-gate-form wf-simulate-form">
                    <Input value={simulateItemKey} onChange={(e) => setSimulateItemKey(e.target.value)} placeholder="Work item key, e.g. ENG-42" />
                    <UiButton variant="secondary" size="compact" disabled={!simulateItemKey.trim() || simulating} onClick={() => runSimulate(t.id)}>{simulating ? "Testing…" : "Run"}</UiButton>
                  </div>}
                  {simulateFor === t.id && simulateResult && <div className="wf-simulate-result">
                    <strong className={simulateResult.wouldSucceed ? "wf-sim-ok" : "wf-sim-fail"}>{simulateResult.wouldSucceed ? "Would succeed" : "Would not succeed"}</strong>
                    {simulateResult.steps.map((step, i) => <div key={i} className="wf-simulate-step"><span className={`pill ${step.passed ? "open" : "danger"}`}>{step.stage}</span><span className="mono">{step.kind}</span><span className="muted">{step.detail}</span></div>)}
                    {simulateResult.steps.length === 0 && <p className="muted">No conditions, validators or post-actions on this transition — it would always succeed from the right status.</p>}
                  </div>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {statuses.length === 0 && <div className="empty ui-static-e581e86b" >No statuses yet. Add the first one.</div>}
      </div>

      {editable && (
        <div className="ui-static-508e5602">
          <div className="card card-p">
            <strong>Add status</strong>
            <div className="cfg-form ui-static-d60550f6" >
              <Field label="Key"><Input className="mono" value={ns.key} onChange={(e) => setNs({ ...ns, key: e.target.value })} /></Field>
              <Field label="Name"><Input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} /></Field>
              <Field label="Category"><UiSelect className="input" value={ns.category} onChange={(e) => setNs({ ...ns, category: e.target.value })}><option value="todo">todo</option><option value="in_progress">in_progress</option><option value="done">done</option></UiSelect></Field>
              <Field label="Initial"><UiSelect className="input" value={String(ns.isInitial)} onChange={(e) => setNs({ ...ns, isInitial: e.target.value === "true" })}><option value="false">No</option><option value="true">Yes</option></UiSelect></Field>
            </div>
            <UiButton variant="primary"  disabled={!ns.key || !ns.name} onClick={addStatus}>Add status</UiButton>
          </div>

          <div className="card card-p">
            <strong>Add transition</strong>
            <div className="cfg-form ui-static-d60550f6" >
              <Field label="Name"><Input value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} placeholder="Start" /></Field>
              <Field label="From"><UiSelect className="input" value={nt.fromStatusId} onChange={(e) => setNt({ ...nt, fromStatusId: e.target.value })}><option value="">Any</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</UiSelect></Field>
              <Field label="To"><UiSelect className="input" value={nt.toStatusId} onChange={(e) => setNt({ ...nt, toStatusId: e.target.value })}><option value="">Select…</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</UiSelect></Field>
            </div>
            <UiButton variant="primary"  disabled={!nt.name || !nt.toStatusId} onClick={addTransition}>Add transition</UiButton>
          </div>
        </div>
      )}

      {editable && (
        <div className="ui-static-fcd56586">
          <UiButton variant="secondary"  onClick={validate}>Validate</UiButton>
          <UiButton variant="primary"  onClick={publish}>Publish</UiButton>
          {issues && issues.length > 0 && <span className="ui-static-8763236a">{issues.join(" · ")}</span>}
          {issues && issues.length === 0 && <span className="ui-static-9632501d">Valid ✓</span>}
        </div>
      )}
    </>
  );
}
