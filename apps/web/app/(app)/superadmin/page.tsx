"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput } from "../../../components/ui";
import { appPrompt, appConfirm } from "../../../components/ui/AppDialog";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { useModalDialog } from "../../../components/ui/useModalDialog";

type Grant = { id: string; organizationId: string; organizationName: string; adminName: string; reason: string; expiresAt: string; revokedAt: string | null; createdAt: string };
type Org = { id: string; name: string; slug: string; status: string; members: number; projects: number; workItems: number };
type Admin = { userId: string; email: string; displayName: string; note: string | null };
type Flag = { id: string; key: string; enabled: boolean };
type Stats = { organizations: number; activeOrganizations: number; users: number; projects: number; workItems: number; platformAdmins: number };
type Audit = { id: string; action: string; targetType: string | null; targetId: string | null; createdAt: string };
type Plan = { id: string; key: string; name: string; description: string | null; currency: string; priceMonthly: number; priceYearly: number; limits: Record<string, number | null>; modules: string[]; isPublic: boolean; status: string };
type Version = { version: string; release: string };
type Mail = { host: string; port: number; secure: boolean; username: string | null; hasPassword: boolean; fromName: string; fromEmail: string; replyTo: string | null; enabled: boolean; lastTestAt: string | null; lastTestOk: boolean | null; lastTestError: string | null } | null;
const money = (minor: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(minor / 100);

const TABS = ["Organizations", "Support access", "Plans & pricing", "Email (SMTP)", "Administrators", "Platform flags", "Audit"] as const;

export default function SuperAdminPage() {
  const toast = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Organizations");
  const [stats, setStats] = useState<Stats | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [modulesFor, setModulesFor] = useState<{ org: Org; modules: Record<string, boolean> } | null>(null);
  const [email, setEmail] = useState(""); const [flagKey, setFlagKey] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]); const [version, setVersion] = useState<Version | null>(null);
  const [planFor, setPlanFor] = useState<{ org: Org; current: string } | null>(null);
  const [mail, setMail] = useState<Mail>(null);
  const [mailForm, setMailForm] = useState({ host: "", port: 587, secure: false, username: "", password: "", fromName: "PM Platform", fromEmail: "", replyTo: "", enabled: false });
  const [mailBusy, setMailBusy] = useState(false);
  const planDialogRef = useModalDialog<HTMLDivElement>(Boolean(planFor), () => setPlanFor(null));
  const modulesDialogRef = useModalDialog<HTMLDivElement>(Boolean(modulesFor), () => setModulesFor(null));

  const err = (e: unknown, fallback: string) => toast({ message: e instanceof ApiError ? e.message : fallback });

  const load = useCallback(async () => {
    try {
      const [s, o, a, f, l, p, v, m] = await Promise.all([
        api<Stats>("/superadmin/stats"), api<Org[]>("/superadmin/organizations"),
        api<Admin[]>("/superadmin/admins"), api<Flag[]>("/superadmin/flags"), api<Audit[]>("/superadmin/audit?limit=60"),
        api<Plan[]>("/superadmin/plans"), api<Version>("/superadmin/version"),
        api<Mail>("/superadmin/mail").catch(() => null),
      ]);
      setStats(s); setOrgs(o); setAdmins(a); setFlags(f); setAudit(l); setPlans(p); setVersion(v); setMail(m);
      if (m) setMailForm({ host: m.host, port: m.port, secure: m.secure, username: m.username ?? "", password: "", fromName: m.fromName, fromEmail: m.fromEmail, replyTo: m.replyTo ?? "", enabled: m.enabled });
    } catch (e) { err(e, "Could not load console"); }
  }, []);

  useEffect(() => {
    api<{ platformAdmin: boolean }>("/superadmin/me")
      .then((r) => { setAllowed(r.platformAdmin); if (r.platformAdmin) load(); })
      .catch(() => setAllowed(false));
  }, [load]);

  async function setStatus(o: Org, status: string) {
    try { await api(`/superadmin/organizations/${o.id}/status`, { method: "POST", body: JSON.stringify({ status }) }); toast({ message: `${o.name} is now ${status}` }); load(); }
    catch (e) { err(e, "Could not change status"); }
  }
  async function archiveOrg(o: Org) {
    if (!await appConfirm(`Archive ${o.name}? A completed export from the last 7 days is required first.`, { confirmLabel: "Archive" })) return;
    try { await api(`/superadmin/organizations/${o.id}/status`, { method: "POST", body: JSON.stringify({ status: "archived" }) }); toast({ message: `${o.name} archived` }); load(); }
    catch (e) { err(e, "Archive blocked — run Export first, then archive within 7 days"); }
  }
  async function exportOrg(o: Org) {
    try {
      const r = await api<{ exportedAt: string; bundle: unknown }>(`/superadmin/organizations/${o.id}/export`, { method: "POST", body: JSON.stringify({}) });
      const blob = new Blob([JSON.stringify(r.bundle, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${o.slug}-export-${r.exportedAt.slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
      toast({ message: `${o.name} exported — archive is now unlocked for 7 days` });
    } catch (e) { err(e, "Export failed"); }
  }
  async function startSupport(o: Org) {
    const reason = await appPrompt(`Reason for support access to ${o.name} (recorded in the audit log)`, "");
    if (!reason || reason.trim().length < 5) { if (reason !== null) toast({ message: "A reason of at least 5 characters is required", tone: "error" }); return; }
    try {
      await api("/superadmin/support-access", { method: "POST", body: JSON.stringify({ organizationId: o.id, reason: reason.trim(), minutes: 60 }) });
      toast({ message: `Support access to ${o.name} active for 60 minutes` }); loadGrants();
    } catch (e) { err(e, "Could not start support access"); }
  }
  const [grants, setGrants] = useState<Grant[]>([]);
  const loadGrants = useCallback(() => { api<Grant[]>("/superadmin/support-access").then(setGrants).catch(() => {}); }, []);
  useEffect(() => { loadGrants(); }, [loadGrants]);
  async function endGrant(g: Grant) {
    try { await api(`/superadmin/support-access/${g.id}`, { method: "DELETE" }); toast({ message: "Support access ended" }); loadGrants(); }
    catch (e) { err(e, "Could not end grant"); }
  }
  async function openModules(o: Org) {
    try { setModulesFor({ org: o, modules: await api<Record<string, boolean>>(`/superadmin/organizations/${o.id}/modules`) }); }
    catch (e) { err(e, "Could not load modules"); }
  }
  async function toggleModule(mod: string, enabled: boolean) {
    if (!modulesFor) return;
    try {
      await api(`/superadmin/organizations/${modulesFor.org.id}/modules`, { method: "POST", body: JSON.stringify({ module: mod, enabled }) });
      setModulesFor({ ...modulesFor, modules: { ...modulesFor.modules, [mod]: enabled } });
    } catch (e) { err(e, "Could not toggle module"); }
  }
  async function grant() {
    try { await api("/superadmin/admins", { method: "POST", body: JSON.stringify({ email }) }); toast({ message: "Administrator added" }); setEmail(""); load(); }
    catch (e) { err(e, "Could not grant access"); }
  }
  async function revoke(a: Admin) {
    if (!await appConfirm(`Remove platform access for ${a.email}?`)) return;
    try { await api(`/superadmin/admins/${a.userId}`, { method: "DELETE" }); toast({ message: "Access revoked" }); load(); }
    catch (e) { err(e, "Could not revoke access"); }
  }
  async function savePlan(plan: Plan, patch: Record<string, unknown>) {
    try { await api(`/superadmin/plans/${plan.key}`, { method: "PATCH", body: JSON.stringify(patch) }); toast({ message: `${plan.name} updated` }); load(); }
    catch (e) { err(e, "Could not update plan"); }
  }
  async function editPrice(plan: Plan, field: "priceMonthly" | "priceYearly") {
    const label = field === "priceMonthly" ? "monthly" : "yearly";
    const cur = await appPrompt(`New ${label} price for ${plan.name} (in ${plan.currency}, whole units)`, String(plan[field] / 100));
    if (cur === null) return;
    const minor = Math.round(Number(cur) * 100);
    if (!Number.isFinite(minor) || minor < 0) return toast({ message: "Enter a valid amount" });
    savePlan(plan, { [field]: minor });
  }
  async function editLimit(plan: Plan, key: string) {
    const cur = await appPrompt(`${key} for ${plan.name} — a number, or blank for unlimited`, plan.limits?.[key] == null ? "" : String(plan.limits[key]));
    if (cur === null) return;
    const val = cur.trim() === "" ? null : Number(cur);
    if (val !== null && (!Number.isInteger(val) || val < 0)) return toast({ message: "Enter a whole number or leave blank" });
    savePlan(plan, { limits: { ...plan.limits, [key]: val } });
  }
  async function seedPlans() {
    try { await api("/superadmin/plans/seed", { method: "POST", body: "{}" }); toast({ message: "Default plans installed" }); load(); }
    catch (e) { err(e, "Could not install plans"); }
  }
  async function assignPlan(orgId: string, planKey: string) {
    try { await api(`/superadmin/plans/organizations/${orgId}`, { method: "POST", body: JSON.stringify({ planKey }) }); toast({ message: "Plan assigned" }); setPlanFor(null); load(); }
    catch (e) { err(e, "Could not assign plan"); }
  }
  async function openPlanFor(o: Org) {
    try { const ent = await api<{ planKey: string }>(`/superadmin/plans/organizations/${o.id}`); setPlanFor({ org: o, current: ent.planKey }); }
    catch (e) { err(e, "Could not load plan"); }
  }
  async function saveMail() {
    setMailBusy(true);
    try {
      const saved = await api<Mail>("/superadmin/mail", { method: "POST", body: JSON.stringify({ ...mailForm, port: Number(mailForm.port), username: mailForm.username || null, password: mailForm.password || null, replyTo: mailForm.replyTo || null }) });
      setMail(saved); setMailForm((f) => ({ ...f, password: "" })); toast({ message: "Email settings saved" });
    } catch (e) { err(e, "Could not save email settings"); }
    finally { setMailBusy(false); }
  }
  async function testMail() {
    const to = await appPrompt("Send a test message to which address?");
    if (!to) return;
    setMailBusy(true);
    try { await api("/superadmin/mail/test", { method: "POST", body: JSON.stringify({ to }) }); toast({ message: `Test message sent to ${to}` }); load(); }
    catch (e) { err(e, "Test failed"); load(); }
    finally { setMailBusy(false); }
  }
  async function setFlag(key: string, enabled: boolean) {
    try { await api("/superadmin/flags", { method: "POST", body: JSON.stringify({ key, enabled }) }); setFlagKey(""); load(); }
    catch (e) { err(e, "Could not save flag"); }
  }

  if (allowed === null) return <p className="muted">Checking access…</p>;
  if (!allowed) return (<><h1 className="page-title">Platform console</h1><div className="fieldcard ui-static-2907c574" ><p>This console is limited to platform administrators. Organization administrators manage their own organization from Admin instead.</p></div></>);

  return (
    <>
      <div className="ui-static-1363b299">
        <h1 className="page-title ui-static-ef0b7a11" >Platform console</h1>
        {version && <span className="pill open" title={version.release}>v{version.version} · {version.release}</span>}
      </div>
      <p className="page-sub">Instance-wide administration: organizations, module entitlements, platform flags and administrators. Work item content stays private to each organization.</p>

      {stats && (
        <div className="stat-row ui-static-bc3ad077" >
          {[["Organizations", `${stats.activeOrganizations}/${stats.organizations}`], ["Users", stats.users], ["Projects", stats.projects], ["Work items", stats.workItems], ["Platform admins", stats.platformAdmins]].map(([k, v]) => (
            <div className="fieldcard ui-static-86b8a5c0" key={String(k)} ><div className="muted ui-static-6cb285c6" >{k}</div><div className="ui-static-c021b869">{v}</div></div>
          ))}
        </div>
      )}

      <div className="ui-static-a7ec8b99">
        {TABS.map((t) => <button key={t} className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Organizations" && (
        <table className="exec-table">
          <thead><tr><th>Organization</th><th>Members</th><th>Projects</th><th>Items</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {orgs.length === 0 && <tr><td colSpan={6} className="muted">No organizations.</td></tr>}
            {orgs.map((o) => <tr key={o.id}>
              <td><strong>{o.name}</strong><br /><span className="muted mono ui-static-11a50812" >{o.slug}</span></td>
              <td>{o.members}</td><td>{o.projects}</td><td>{o.workItems}</td>
              <td><span className={`pill ${o.status === "active" ? "open" : "danger"}`}>{o.status}</span></td>
              <td className="ui-static-4ede699f">
                <UiButton variant="tertiary"  onClick={() => openPlanFor(o)}>Plan</UiButton>
                <UiButton variant="tertiary"  onClick={() => openModules(o)}>Modules</UiButton>
                <UiButton variant="tertiary"  onClick={() => exportOrg(o)}>Export</UiButton>
                <UiButton variant="tertiary"  onClick={() => startSupport(o)}>Support access</UiButton>
                {o.status === "active"
                  ? <UiButton variant="tertiary"  onClick={() => setStatus(o, "suspended")}>Suspend</UiButton>
                  : <UiButton variant="tertiary"  onClick={() => setStatus(o, "active")}>Reactivate</UiButton>}
                {o.status !== "archived" && <UiButton variant="tertiary"  onClick={() => archiveOrg(o)}>Archive</UiButton>}
              </td>
            </tr>)}
          </tbody>
        </table>
      )}

      {tab === "Support access" && (
        <div className="support-access-panel">
          <p className="muted">Time-bound, reasoned entry into an organization without membership. Start a grant from the Organizations tab; every start and end is written to the audit log. Grants expire automatically.</p>
          <table className="exec-table">
            <thead><tr><th>Organization</th><th>Platform admin</th><th>Reason</th><th>Started</th><th>Expires</th><th>State</th><th></th></tr></thead>
            <tbody>
              {grants.length === 0 && <tr><td colSpan={7} className="muted">No support-access grants yet.</td></tr>}
              {grants.map((g) => {
                const active = !g.revokedAt && new Date(g.expiresAt) > new Date();
                return <tr key={g.id}>
                  <td><strong>{g.organizationName}</strong></td>
                  <td>{g.adminName}</td>
                  <td className="muted">{g.reason}</td>
                  <td className="muted">{new Date(g.createdAt).toLocaleString()}</td>
                  <td className="muted">{new Date(g.expiresAt).toLocaleString()}</td>
                  <td><span className={`pill ${active ? "open" : "danger"}`}>{g.revokedAt ? "ended" : active ? "active" : "expired"}</span></td>
                  <td>{active && <UiButton variant="tertiary" onClick={() => endGrant(g)}>End now</UiButton>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Plans & pricing" && (
        <>
          <div className="ui-static-27a9242a">
            <span className="muted ui-static-6cb285c6" >Prices are what customers see on the public pricing page. Limits and modules decide what each tier can actually use.</span>
            {plans.length === 0 && <UiButton variant="primary"  onClick={seedPlans}>Install default plans</UiButton>}
          </div>
          <table className="exec-table">
            <thead><tr><th>Plan</th><th>Monthly</th><th>Yearly</th><th>Members</th><th>Projects</th><th>Modules</th><th>State</th></tr></thead>
            <tbody>
              {plans.length === 0 && <tr><td colSpan={7} className="muted">No plans yet.</td></tr>}
              {plans.map((p) => <tr key={p.id}>
                <td><strong>{p.name}</strong><br /><span className="muted mono ui-static-11a50812" >{p.key}</span></td>
                <td><UiButton variant="tertiary"  onClick={() => editPrice(p, "priceMonthly")}>{money(p.priceMonthly, p.currency)}</UiButton></td>
                <td><UiButton variant="tertiary"  onClick={() => editPrice(p, "priceYearly")}>{money(p.priceYearly, p.currency)}</UiButton></td>
                <td><UiButton variant="tertiary"  onClick={() => editLimit(p, "maxMembers")}>{p.limits?.maxMembers ?? "∞"}</UiButton></td>
                <td><UiButton variant="tertiary"  onClick={() => editLimit(p, "maxProjects")}>{p.limits?.maxProjects ?? "∞"}</UiButton></td>
                <td className="muted ui-static-9bd7c139" >{p.modules.length ? p.modules.join(", ") : "core only"}</td>
                <td>
                  <span className={`pill ${p.status === "active" ? "open" : "danger"}`}>{p.status}</span>
                  {p.status === "active" && <UiButton variant="tertiary"  onClick={() => savePlan(p, { isPublic: !p.isPublic })}>{p.isPublic ? "public" : "hidden"}</UiButton>}
                </td>
              </tr>)}
            </tbody>
          </table>
          <p className="muted ui-static-6cb285c6" >Click a price or limit to edit it. Blank limit means unlimited. Changes apply immediately — downgrades withdraw module access without deleting data.</p>
        </>
      )}

      {tab === "Email (SMTP)" && (
        <div className="builder-grid">
          <div className="gpanel">
            <h3>SMTP server</h3>
            <label>Host<UiInput className="input ui-static-4e420aff" value={mailForm.host} onChange={(e) => setMailForm({ ...mailForm, host: e.target.value })} placeholder="smtp.gmail.com"  /></label>
            <div className="ui-static-9d6820f7">
              <label className="ui-static-97445a8d">Port<UiInput className="input" type="number" value={mailForm.port} onChange={(e) => setMailForm({ ...mailForm, port: Number(e.target.value) })} /></label>
              <label className="ui-static-bd649348">
                <input type="checkbox" checked={mailForm.secure} onChange={(e) => setMailForm({ ...mailForm, secure: e.target.checked })} /> <span>Implicit TLS (465)</span>
              </label>
            </div>
            <label>Username<UiInput className="input ui-static-4e420aff" value={mailForm.username} onChange={(e) => setMailForm({ ...mailForm, username: e.target.value })} autoComplete="off"  /></label>
            <label>Password<UiInput className="input ui-static-761d3add" type="password" value={mailForm.password} onChange={(e) => setMailForm({ ...mailForm, password: e.target.value })} autoComplete="new-password" placeholder={mail?.hasPassword ? "•••••••• (leave blank to keep)" : "SMTP password"}  /></label>
            <h3>Sender</h3>
            <label>From name<UiInput className="input ui-static-4e420aff" value={mailForm.fromName} onChange={(e) => setMailForm({ ...mailForm, fromName: e.target.value })}  /></label>
            <label>From address<UiInput className="input ui-static-4e420aff" value={mailForm.fromEmail} onChange={(e) => setMailForm({ ...mailForm, fromEmail: e.target.value })} placeholder="no-reply@yourdomain.com"  /></label>
            <label>Reply-to (optional)<UiInput className="input ui-static-761d3add" value={mailForm.replyTo} onChange={(e) => setMailForm({ ...mailForm, replyTo: e.target.value })}  /></label>
            <label className="ui-static-779f737d">
              <input type="checkbox" checked={mailForm.enabled} onChange={(e) => setMailForm({ ...mailForm, enabled: e.target.checked })} />
              <span>Deliver email through this server</span>
            </label>
            <div className="ui-static-a76d597a">
              <UiButton variant="primary"  onClick={saveMail} disabled={mailBusy || !mailForm.host || !mailForm.fromEmail}>{mailBusy ? "Working…" : "Save settings"}</UiButton>
              <UiButton variant="secondary"  onClick={testMail} disabled={mailBusy || !mail?.enabled}>Send test</UiButton>
            </div>
          </div>
          <div className="fieldcard">
            <h3>Status</h3>
            {!mail && <p className="muted">Not configured yet. Until a server is saved and enabled, email is written to the server log instead of being delivered.</p>}
            {mail && (
              <>
                <p className="ui-static-df671843">Delivery is <span className={`pill ${mail.enabled ? "open" : "danger"}`}>{mail.enabled ? "enabled" : "disabled"}</span></p>
                <p className="muted mono ui-static-6cb285c6" >{mail.host}:{mail.port} · {mail.secure ? "implicit TLS" : "STARTTLS"} · {mail.username || "no auth"}</p>
                <p className="muted ui-static-6cb285c6" >From: {mail.fromName} &lt;{mail.fromEmail}&gt;</p>
                <hr className="ui-static-6ead5531" />
                <h3>Last test</h3>
                {!mail.lastTestAt && <p className="muted">Never tested.</p>}
                {mail.lastTestAt && (
                  <p className="ui-static-5e0faad2">
                    <span className={`pill ${mail.lastTestOk ? "open" : "danger"}`}>{mail.lastTestOk ? "delivered" : "failed"}</span>{" "}
                    <span className="muted">{new Date(mail.lastTestAt).toLocaleString()}</span>
                    {mail.lastTestError && <><br /><span className="mono ui-static-09bfd191" >{mail.lastTestError}</span></>}
                  </p>
                )}
              </>
            )}
            <hr className="ui-static-6ead5531" />
            <p className="muted ui-static-6cb285c6" >The password is encrypted before it is stored and is never sent back to this page. Leave the field blank when saving to keep the existing one. If delivery fails, invitations and password resets still complete — the message is logged rather than lost.</p>
          </div>
        </div>
      )}

      {tab === "Administrators" && (
        <>
          <div className="ui-static-bb2693cf">
            <UiInput className="input ui-static-3521b3d8" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)}  />
            <UiButton variant="primary"  onClick={grant} disabled={!email}>Grant platform access</UiButton>
          </div>
          <table className="exec-table">
            <thead><tr><th>Administrator</th><th>Email</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {admins.map((a) => <tr key={a.userId}>
                <td>{a.displayName}</td><td className="mono ui-static-6cb285c6" >{a.email}</td><td className="muted">{a.note ?? "—"}</td>
                <td className="ui-static-54c2afb7"><UiButton variant="tertiary"  onClick={() => revoke(a)}>Revoke</UiButton></td>
              </tr>)}
            </tbody>
          </table>
          <p className="muted ui-static-6cb285c6" >The final administrator cannot be removed, to prevent locking the instance out.</p>
        </>
      )}

      {tab === "Platform flags" && (
        <>
          <div className="ui-static-bb2693cf">
            <UiInput className="input mono ui-static-3521b3d8" placeholder="new.flag.key" value={flagKey} onChange={(e) => setFlagKey(e.target.value)}  />
            <UiButton variant="primary"  onClick={() => setFlag(flagKey, true)} disabled={!flagKey}>Create enabled</UiButton>
          </div>
          <table className="exec-table">
            <thead><tr><th>Flag</th><th>State</th><th></th></tr></thead>
            <tbody>
              {flags.length === 0 && <tr><td colSpan={3} className="muted">No platform flags yet.</td></tr>}
              {flags.map((f) => <tr key={f.id}>
                <td className="mono">{f.key}</td><td><span className={`pill ${f.enabled ? "open" : "danger"}`}>{f.enabled ? "on" : "off"}</span></td>
                <td className="ui-static-54c2afb7"><UiButton variant="tertiary"  onClick={() => setFlag(f.key, !f.enabled)}>{f.enabled ? "Disable" : "Enable"}</UiButton></td>
              </tr>)}
            </tbody>
          </table>
        </>
      )}

      {tab === "Audit" && (
        <table className="exec-table">
          <thead><tr><th>When</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>
            {audit.length === 0 && <tr><td colSpan={3} className="muted">No instance activity yet.</td></tr>}
            {audit.map((a) => <tr key={a.id}>
              <td className="muted ui-static-6cb285c6" >{new Date(a.createdAt).toLocaleString()}</td>
              <td className="mono ui-static-6cb285c6" >{a.action}</td>
              <td className="muted mono ui-static-11a50812" >{a.targetType ?? "—"}{a.targetId ? ` · ${a.targetId.slice(0, 8)}…` : ""}</td>
            </tr>)}
          </tbody>
        </table>
      )}

      {planFor && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPlanFor(null); }}>
          <div ref={planDialogRef} tabIndex={-1} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="org-plan-title">
            <div className="modal-title-row"><h2 id="org-plan-title">Plan · {planFor.org.name}</h2><button className="icon-btn" aria-label="Close organization plan dialog" onClick={() => setPlanFor(null)}>✕</button></div>
            <p className="muted ui-static-6cb285c6" >Current tier: <strong>{planFor.current}</strong>. Changing the plan immediately changes limits and module entitlements.</p>
            <div className="ui-static-5646293c">
              {plans.filter((p) => p.status === "active").map((p) => (
                <button key={p.key} className={`btn ${planFor.current === p.key ? "btn-primary" : ""}`} onClick={() => assignPlan(planFor.org.id, p.key)}>
                  {p.name} · {money(p.priceMonthly, p.currency)}/mo · {p.limits?.maxProjects ?? "∞"} projects
                </button>
              ))}
            </div>
            <div className="modal-actions"><UiButton variant="secondary"  onClick={() => setPlanFor(null)}>Cancel</UiButton></div>
          </div>
        </div>
      )}

      {modulesFor && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModulesFor(null); }}>
          <div ref={modulesDialogRef} tabIndex={-1} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="org-modules-title">
            <div className="modal-title-row"><h2 id="org-modules-title">Modules · {modulesFor.org.name}</h2><button className="icon-btn" aria-label="Close organization modules dialog" onClick={() => setModulesFor(null)}>✕</button></div>
            <p className="muted ui-static-6cb285c6" >Optional modules this organization may use. Disabled modules are refused by the API, not merely hidden.</p>
            <div className="ui-static-9629e438">
              {Object.entries(modulesFor.modules).map(([m, on]) => (
                <label key={m} className="ui-static-01ef7fc9">
                  <input type="checkbox" checked={on} onChange={(e) => toggleModule(m, e.target.checked)} />
                  <span className="mono ui-static-6cb285c6" >{m}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions"><UiButton variant="secondary"  onClick={() => setModulesFor(null)}>Done</UiButton></div>
          </div>
        </div>
      )}
    </>
  );
}
