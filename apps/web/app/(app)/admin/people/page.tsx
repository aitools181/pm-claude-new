"use client";


import { Textarea as UiTextarea, Button as UiButton } from "../../../../components/ui";
import { Select as UiSelect } from "../../../../components/ui";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../lib/api";
import { Field, Input } from "../../../../components/ui/Field";
import { useModalDialog } from "../../../../components/ui/useModalDialog";

type Member = { id: string; displayName: string; email: string; designation?: string | null; department?: string | null; accountType?: string };
type OwnedSummary = { projects: { id: string; name: string }[]; counts: { projects: number; workItems: number; forms: number; automations: number; documents: number } };
type ImportReport = { invited: number; total: number; failedCsv: string; report: { row: number; email: string; roleKey: string; status: string }[] };
type Invitation = { id: string; email: string; roleKey: string; status: string; expiresAt: string };

export default function PeoplePage() {
  const [tab, setTab] = useState<"members" | "teams" | "skills" | "roles">("members");
  return (
    <>
      <h1 className="page-title">People</h1>
      <p className="page-sub">Members, teams, and default roles in this organization.</p>
      <div className="ui-static-67715833">
        {(["members", "teams", "skills", "roles"] as const).map((t) => (
          <UiButton variant="tertiary" key={t} onClick={() => setTab(t)} className="ui-subtab-button" data-active={tab === t || undefined}>{t}</UiButton>
        ))}
      </div>
      {tab === "members" && <Members />}
      {tab === "teams" && <TeamsTab />}
      {tab === "skills" && <SkillsTab />}
      {tab === "roles" && <RolesTable />}
    </>
  );
}

function Members() {
  const [email, setEmail] = useState("");
  const [roleKey, setRole] = useState("member");
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [deact, setDeact] = useState<{ member: Member; summary: OwnedSummary | null; reassignTo: string; reason: string } | null>(null);
  const deactRef = useModalDialog<HTMLDivElement>(Boolean(deact), () => setDeact(null));
  const [loadError, setLoadError] = useState("");
  const load = () => {
    setLoadError("");
    return Promise.all([
      api<Invitation[]>("/invitations", { org: true }).then(setInvites).catch(() => {}),
      api<Member[]>("/directory/members", { org: true }).then(setMembers).catch((e) => { setLoadError(e instanceof Error ? e.message : "Could not load members."); }),
    ]);
  };
  useEffect(() => { load(); }, []);

  async function invite() {
    setMsg(null);
    try { await api("/invitations", { method: "POST", org: true, body: JSON.stringify({ email, roleKey }) }); setEmail(""); setMsg("Invitation sent."); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not invite"); }
  }
  async function inviteBulk() {
    const emails = bulkText.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!emails.length) return;
    try {
      const r = await api<{ invited: number; total: number; report: { email: string; status: string }[] }>("/invitations/bulk", { method: "POST", org: true, body: JSON.stringify({ emails, roleKey }) });
      const skipped = r.report.filter((x) => x.status !== "invited");
      setMsg(`${r.invited} of ${r.total} invited${skipped.length ? ` — skipped: ${skipped.map((x) => `${x.email} (${x.status.replace(/_/g, " ")})`).join(", ")}` : ""}`);
      setBulkText(""); setBulkOpen(false); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Bulk invite failed"); }
  }
  async function importCsv() {
    if (!csvText.trim()) return;
    try {
      const r = await api<ImportReport>("/invitations/import-csv", { method: "POST", org: true, body: JSON.stringify({ csv: csvText, defaultRoleKey: roleKey }) });
      setImportReport(r); setCsvText(""); setMsg(`CSV import: ${r.invited} of ${r.total} invited.`); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "CSV import failed"); }
  }
  function downloadFailed() {
    if (!importReport?.failedCsv) return;
    const blob = new Blob([importReport.failedCsv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "failed-rows.csv"; a.click(); URL.revokeObjectURL(a.href);
  }
  async function revoke(id: string) { await api(`/invitations/${id}`, { method: "DELETE", org: true }); load(); }
  async function openDeactivate(member: Member) {
    setDeact({ member, summary: null, reassignTo: "", reason: "" });
    try { const summary = await api<OwnedSummary>(`/directory/members/${member.id}/owned-summary`, { org: true }); setDeact((d) => d && d.member.id === member.id ? { ...d, summary } : d); }
    catch { /* summary optional */ }
  }
  async function confirmDeactivate() {
    if (!deact?.reassignTo) return;
    try {
      const r = await api<{ projectsReassigned: number; workItemsReassigned: number }>(`/directory/members/${deact.member.id}/deactivate`, { method: "POST", org: true, body: JSON.stringify({ reassignToUserId: deact.reassignTo, reason: deact.reason || undefined }) });
      setMsg(`${deact.member.displayName} deactivated — ${r.projectsReassigned} projects and ${r.workItemsReassigned} tasks reassigned.`);
      setDeact(null); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not deactivate"); }
  }

  return (
    <div className="card card-p">
      <strong>Invite a member</strong>
      <div className="ui-static-09170c65">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
        <Field label="Role">
          <UiSelect className="input" value={roleKey} onChange={(e) => setRole(e.target.value)}>
            {["organization_admin", "project_admin", "team_leader", "member", "viewer"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </UiSelect>
        </Field>
        <UiButton variant="primary" className="ui-static-87c136df"  disabled={!email} onClick={invite}>Send invite</UiButton>
        <UiButton variant="secondary" onClick={() => { setBulkOpen(!bulkOpen); setCsvOpen(false); }}>Bulk invite</UiButton>
        <UiButton variant="secondary" onClick={() => { setCsvOpen(!csvOpen); setBulkOpen(false); }}>Import CSV</UiButton>
      </div>
      {bulkOpen && <div className="people-bulk-panel">
        <p>One email per line (commas and semicolons also work). The selected role above applies to everyone in the batch.</p>
        <UiTextarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"asha@company.com\nravi@company.com"} rows={5} />
        <UiButton variant="primary" size="compact" disabled={!bulkText.trim()} onClick={inviteBulk}>Send bulk invites</UiButton>
      </div>}
      {csvOpen && <div className="people-bulk-panel">
        <p>Paste CSV rows as <code>email,displayName,roleKey</code> (header optional; role falls back to the selection above). Every row is validated; failed rows can be downloaded, corrected and re-imported.</p>
        <UiTextarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"email,displayName,roleKey\nasha@company.com,Asha Patel,member"} rows={6} />
        <UiButton variant="primary" size="compact" disabled={!csvText.trim()} onClick={importCsv}>Validate & import</UiButton>
      </div>}
      {importReport && <div className="import-report">
        <div className="import-report-head"><strong>Import report</strong><span>{importReport.invited} invited · {importReport.total - importReport.invited} skipped/failed</span>{importReport.failedCsv && <button className="text-button" onClick={downloadFailed}>Download failed rows</button>}<button className="icon-btn" aria-label="Dismiss import report" onClick={() => setImportReport(null)}>✕</button></div>
        <table className="table"><thead><tr><th>Row</th><th>Email</th><th>Role</th><th>Result</th></tr></thead><tbody>
          {importReport.report.slice(0, 20).map((r) => <tr key={r.row}><td>{r.row}</td><td>{r.email}</td><td>{r.roleKey}</td><td><span className="badge"><span className={`dot ${r.status === "invited" ? "dot-ok" : "dot-warn"}`} />{r.status.replace(/_/g, " ")}</span></td></tr>)}
          {importReport.report.length > 20 && <tr><td colSpan={4} className="muted">…and {importReport.report.length - 20} more rows</td></tr>}
        </tbody></table>
      </div>}
      {msg && <div className="callout callout-info ui-static-da12f285" >{msg}</div>}

      <strong className="people-section-title">Active members</strong>
      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Designation</th><th>Department</th><th></th></tr></thead>
        <tbody>
          {loadError && <tr><td colSpan={5} className="callout callout-danger people-load-error"><span>{loadError}</span> <UiButton variant="secondary" size="compact" onClick={load}>Retry</UiButton></td></tr>}
          {!loadError && members.map((m) => <tr key={m.id}>
            <td>{m.displayName}{m.accountType === "guest" && <span className="account-type-badge guest">Guest</span>}</td><td className="muted">{m.email}</td><td className="muted">{m.designation || "—"}</td><td className="muted">{m.department || "—"}</td>
            <td className="ui-static-54c2afb7"><UiButton variant="secondary" size="compact" onClick={() => openDeactivate(m)}>Deactivate…</UiButton></td>
          </tr>)}
        </tbody>
      </table>

      <strong className="people-section-title">Pending invitations</strong>
      <table className="table ui-static-8a77e5a3" >
        <thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {invites.length === 0 && <tr><td colSpan={4} className="ui-static-fbeb64b6">No pending invitations.</td></tr>}
          {invites.map((i) => (
            <tr key={i.id}>
              <td>{i.email}</td>
              <td className="ui-static-66d97643">{i.roleKey.replace(/_/g, " ")}</td>
              <td><span className="badge"><span className={`dot ${i.status === "pending" ? "dot-warn" : i.status === "accepted" ? "dot-ok" : "dot-off"}`} />{i.status}</span></td>
              <td className="ui-static-54c2afb7">{i.status === "pending" && <UiButton variant="destructive"  onClick={() => revoke(i.id)}>Revoke</UiButton>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {deact && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDeact(null)}>
        <div ref={deactRef} tabIndex={-1} className="modal-card deactivate-wizard" role="dialog" aria-modal="true" aria-label={`Deactivate ${deact.member.displayName}`}>
          <div className="modal-title-row"><h2>Deactivate {deact.member.displayName}</h2><button className="icon-btn" aria-label="Close" onClick={() => setDeact(null)}>✕</button></div>
          <p className="muted">Ownership must be transferred before deactivation. The account is suspended in this organization — nothing is deleted.</p>
          {deact.summary ? <div className="owned-summary">
            <div><strong>{deact.summary.counts.projects}</strong><span>Projects owned</span></div>
            <div><strong>{deact.summary.counts.workItems}</strong><span>Tasks assigned</span></div>
            <div><strong>{deact.summary.counts.forms}</strong><span>Forms</span></div>
            <div><strong>{deact.summary.counts.automations}</strong><span>Automations</span></div>
            <div><strong>{deact.summary.counts.documents}</strong><span>Documents</span></div>
          </div> : <p className="muted">Loading ownership summary…</p>}
          {deact.summary && deact.summary.projects.length > 0 && <p className="muted">Projects: {deact.summary.projects.map((p) => p.name).join(", ")}</p>}
          <Field label="Reassign everything to">
            <UiSelect className="input" value={deact.reassignTo} onChange={(e) => setDeact({ ...deact, reassignTo: e.target.value })}>
              <option value="">Select a member…</option>
              {members.filter((m) => m.id !== deact.member.id).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </UiSelect>
          </Field>
          <Field label="Reason (recorded in the audit log)">
            <Input value={deact.reason} onChange={(e) => setDeact({ ...deact, reason: e.target.value })} placeholder="Left the organization" />
          </Field>
          <div className="button-row">
            <UiButton variant="secondary" onClick={() => setDeact(null)}>Cancel</UiButton>
            <UiButton variant="destructive" disabled={!deact.reassignTo} onClick={confirmDeactivate}>Reassign & deactivate</UiButton>
          </div>
        </div>
      </div>}
    </div>
  );
}


type Team = { id: string; name: string; leaderUserId?: string | null; parentTeamId?: string | null; description?: string | null; memberCount: number };
type TeamMemberRow = { userId: string; displayName: string; email: string; effectiveFrom?: string | null; effectiveTo?: string | null };

function TeamsTab() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sel, setSel] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [form, setForm] = useState({ name: "", leaderUserId: "", parentTeamId: "", description: "" });
  const [addMember, setAddMember] = useState({ userId: "", effectiveFrom: "", effectiveTo: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => Promise.all([
    api<Team[]>("/directory/teams", { org: true }).then(setTeams).catch(() => {}),
    api<Member[]>("/directory/members", { org: true }).then(setMembers).catch(() => {}),
  ]);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (sel) api<TeamMemberRow[]>(`/directory/teams/${sel.id}/members`, { org: true }).then(setTeamMembers).catch(() => setTeamMembers([])); }, [sel?.id]);

  const nameOf = (id?: string | null) => members.find((m) => m.id === id)?.displayName || "—";
  const teamName = (id?: string | null) => teams.find((t) => t.id === id)?.name || "—";

  async function createTeam() {
    if (!form.name.trim()) return;
    try {
      await api("/directory/teams", { method: "POST", org: true, body: JSON.stringify({ name: form.name.trim(), leaderUserId: form.leaderUserId || null, parentTeamId: form.parentTeamId || null, description: form.description.trim() || null }) });
      setForm({ name: "", leaderUserId: "", parentTeamId: "", description: "" }); setMsg("Team created."); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not create team"); }
  }
  async function patchTeam(teamId: string, patch: Record<string, unknown>) {
    try { await api(`/directory/teams/${teamId}`, { method: "PATCH", org: true, body: JSON.stringify(patch) }); load(); if (sel?.id === teamId) setSel((t) => t ? { ...t, ...patch } as Team : t); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not update team"); }
  }
  async function removeTeam(teamId: string) {
    try { await api(`/directory/teams/${teamId}`, { method: "DELETE", org: true }); if (sel?.id === teamId) setSel(null); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not delete team"); }
  }
  async function addToTeam() {
    if (!sel || !addMember.userId) return;
    try {
      await api(`/directory/teams/${sel.id}/members`, { method: "POST", org: true, body: JSON.stringify({ userId: addMember.userId, effectiveFrom: addMember.effectiveFrom || null, effectiveTo: addMember.effectiveTo || null }) });
      setAddMember({ userId: "", effectiveFrom: "", effectiveTo: "" });
      const rows = await api<TeamMemberRow[]>(`/directory/teams/${sel.id}/members`, { org: true }); setTeamMembers(rows); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not add member"); }
  }
  async function removeFromTeam(userId: string) {
    if (!sel) return;
    await api(`/directory/teams/${sel.id}/members/${userId}`, { method: "DELETE", org: true });
    setTeamMembers((rows) => rows.filter((r) => r.userId !== userId)); load();
  }

  return <div className="card card-p">
    <strong>Create a team</strong>
    <div className="team-create-grid">
      <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Engineering" /></Field>
      <Field label="Team leader"><UiSelect className="input" value={form.leaderUserId} onChange={(e) => setForm({ ...form, leaderUserId: e.target.value })}><option value="">No leader</option>{members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</UiSelect></Field>
      <Field label="Parent team"><UiSelect className="input" value={form.parentTeamId} onChange={(e) => setForm({ ...form, parentTeamId: e.target.value })}><option value="">Top level</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</UiSelect></Field>
      <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this team owns" /></Field>
      <UiButton variant="primary" disabled={!form.name.trim()} onClick={createTeam}>Create team</UiButton>
    </div>
    {msg && <div className="callout callout-info">{msg}</div>}

    <table className="table">
      <thead><tr><th>Team</th><th>Leader</th><th>Parent</th><th>Members</th><th></th></tr></thead>
      <tbody>
        {teams.length === 0 && <tr><td colSpan={5} className="muted">No teams yet. Create one to group people for assignment and reporting.</td></tr>}
        {teams.map((t) => <tr key={t.id} className={sel?.id === t.id ? "row-selected" : undefined}>
          <td><button className="text-button" onClick={() => setSel(t)}>{t.name}</button>{t.description && <small className="muted team-desc"> — {t.description}</small>}</td>
          <td className="muted">{nameOf(t.leaderUserId)}</td>
          <td className="muted">{teamName(t.parentTeamId)}</td>
          <td>{t.memberCount}</td>
          <td className="ui-static-54c2afb7"><UiButton variant="destructive" size="compact" onClick={() => removeTeam(t.id)}>Delete</UiButton></td>
        </tr>)}
      </tbody>
    </table>

    {sel && <div className="team-detail">
      <div className="team-detail-head"><strong>{sel.name}</strong>
        <Field label="Leader"><UiSelect className="input" value={sel.leaderUserId || ""} onChange={(e) => patchTeam(sel.id, { leaderUserId: e.target.value || null })}><option value="">No leader</option>{members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</UiSelect></Field>
        <Field label="Parent"><UiSelect className="input" value={sel.parentTeamId || ""} onChange={(e) => patchTeam(sel.id, { parentTeamId: e.target.value || null })}><option value="">Top level</option>{teams.filter((t) => t.id !== sel.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</UiSelect></Field>
      </div>
      <div className="team-add-member">
        <Field label="Add member"><UiSelect className="input" value={addMember.userId} onChange={(e) => setAddMember({ ...addMember, userId: e.target.value })}><option value="">Select…</option>{members.filter((m) => !teamMembers.some((r) => r.userId === m.id)).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</UiSelect></Field>
        <Field label="Effective from"><Input type="date" value={addMember.effectiveFrom} onChange={(e) => setAddMember({ ...addMember, effectiveFrom: e.target.value })} /></Field>
        <Field label="Effective to"><Input type="date" value={addMember.effectiveTo} onChange={(e) => setAddMember({ ...addMember, effectiveTo: e.target.value })} /></Field>
        <UiButton variant="primary" size="compact" disabled={!addMember.userId} onClick={addToTeam}>Add</UiButton>
      </div>
      <table className="table">
        <thead><tr><th>Member</th><th>Email</th><th>Effective from</th><th>Effective to</th><th></th></tr></thead>
        <tbody>
          {teamMembers.length === 0 && <tr><td colSpan={5} className="muted">No members on this team yet.</td></tr>}
          {teamMembers.map((r) => <tr key={r.userId}><td>{r.displayName}</td><td className="muted">{r.email}</td><td className="muted">{r.effectiveFrom || "—"}</td><td className="muted">{r.effectiveTo || "open"}</td><td className="ui-static-54c2afb7"><UiButton variant="secondary" size="compact" onClick={() => removeFromTeam(r.userId)}>Remove</UiButton></td></tr>)}
        </tbody>
      </table>
    </div>}
  </div>;
}


type SkillRow = { userId: string; displayName: string; skills: { skill: string; level: number }[] };
type Suggestion = { userId: string; displayName: string; level: number; openItems: number };

function SkillsTab() {
  const [matrix, setMatrix] = useState<SkillRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => Promise.all([
    api<SkillRow[]>("/skills/matrix", { org: true }).then(setMatrix).catch(() => {}),
    api<Member[]>("/directory/members", { org: true }).then(setMembers).catch(() => {}),
  ]);
  useEffect(() => { load(); }, []);

  function beginEdit(userId: string) {
    const row = matrix.find((m) => m.userId === userId);
    setEditFor(userId);
    setEditText((row?.skills ?? []).map((s) => `${s.skill}:${s.level}`).join(", "));
  }
  async function saveSkills() {
    if (!editFor) return;
    const skills = editText.split(",").map((part) => {
      const [skill, lvl] = part.split(":").map((x) => x.trim());
      return { skill, level: Math.min(5, Math.max(1, Number(lvl) || 3)) };
    }).filter((s) => s.skill);
    try {
      await api(`/users/${editFor}/skills`, { method: "PUT", org: true, body: JSON.stringify({ skills }) });
      setMsg("Skills saved."); setEditFor(null); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not save skills"); }
  }
  async function suggest() {
    if (!query.trim()) return;
    try { setSuggestions(await api<Suggestion[]>(`/skills/suggest?skill=${encodeURIComponent(query.trim())}`, { org: true })); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Suggestion lookup failed"); }
  }

  return <div className="card card-p">
    <strong>Who should take this work?</strong>
    <p className="muted skills-hint">Skill-aware suggestion: highest level first, lightest open workload first.</p>
    <div className="skills-suggest-row">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Skill, e.g. react" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); suggest(); } }} />
      <UiButton variant="primary" size="compact" disabled={!query.trim()} onClick={suggest}>Suggest assignees</UiButton>
    </div>
    {suggestions && <div className="skills-suggestions">{suggestions.length === 0 && <span className="muted">Nobody has that skill yet.</span>}{suggestions.map((s) => <span className="suggestion-chip" key={s.userId}><strong>{s.displayName}</strong> L{s.level} · {s.openItems} open</span>)}</div>}
    {msg && <div className="callout callout-info">{msg}</div>}

    <strong className="people-section-title">Skills matrix</strong>
    <table className="table">
      <thead><tr><th>Member</th><th>Skills (level 1–5)</th><th></th></tr></thead>
      <tbody>
        {members.map((m) => {
          const row = matrix.find((x) => x.userId === m.id);
          return <tr key={m.id}>
            <td>{m.displayName}</td>
            <td>{editFor === m.id
              ? <Input value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="react:4, sql:3, figma:2" />
              : <span className="skill-chips">{(row?.skills ?? []).map((s) => <span className="suggestion-chip" key={s.skill}>{s.skill} <b>L{s.level}</b></span>)}{!row?.skills?.length && <span className="muted">No skills recorded</span>}</span>}</td>
            <td className="ui-static-54c2afb7">{editFor === m.id
              ? <><UiButton variant="primary" size="compact" onClick={saveSkills}>Save</UiButton> <UiButton variant="secondary" size="compact" onClick={() => setEditFor(null)}>Cancel</UiButton></>
              : <UiButton variant="secondary" size="compact" onClick={() => beginEdit(m.id)}>Edit skills</UiButton>}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

function RolesTable() {
  const rows: [string, string][] = [
    ["Organization Administrator", "Org-wide settings and governance"],
    ["Workspace Administrator", "Assigned workspace"],
    ["Project Administrator", "Assigned project"],
    ["Team Leader", "Team operations"],
    ["Member", "Assigned work"],
    ["Guest", "Explicitly shared work"],
    ["Viewer", "Read-only"],
  ];
  return (
    <div className="card"><table className="table"><thead><tr><th>Role</th><th>Scope</th></tr></thead>
      <tbody>{rows.map(([r, s]) => <tr key={r}><td className="ui-static-02a2d333">{r}</td><td className="ui-static-66d97643">{s}</td></tr>)}</tbody>
    </table></div>
  );
}
