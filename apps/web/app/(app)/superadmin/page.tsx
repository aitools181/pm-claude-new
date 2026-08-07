"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Org = { id: string; name: string; slug: string; status: string; members: number; projects: number; workItems: number };
type Admin = { userId: string; email: string; displayName: string; note: string | null };
type Flag = { id: string; key: string; enabled: boolean };
type Stats = { organizations: number; activeOrganizations: number; users: number; projects: number; workItems: number; platformAdmins: number };
type Audit = { id: string; action: string; targetType: string | null; targetId: string | null; createdAt: string };
type Plan = { id: string; key: string; name: string; description: string | null; currency: string; priceMonthly: number; priceYearly: number; limits: Record<string, number | null>; modules: string[]; isPublic: boolean; status: string };
type Version = { version: string; release: string };
type Mail = { host: string; port: number; secure: boolean; username: string | null; hasPassword: boolean; fromName: string; fromEmail: string; replyTo: string | null; enabled: boolean; lastTestAt: string | null; lastTestOk: boolean | null; lastTestError: string | null } | null;
const money = (minor: number, cur: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(minor / 100);

const TABS = ["Organizations", "Plans & pricing", "Email (SMTP)", "Administrators", "Platform flags", "Audit"] as const;

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
    if (!confirm(`Remove platform access for ${a.email}?`)) return;
    try { await api(`/superadmin/admins/${a.userId}`, { method: "DELETE" }); toast({ message: "Access revoked" }); load(); }
    catch (e) { err(e, "Could not revoke access"); }
  }
  async function savePlan(plan: Plan, patch: Record<string, unknown>) {
    try { await api(`/superadmin/plans/${plan.key}`, { method: "PATCH", body: JSON.stringify(patch) }); toast({ message: `${plan.name} updated` }); load(); }
    catch (e) { err(e, "Could not update plan"); }
  }
  async function editPrice(plan: Plan, field: "priceMonthly" | "priceYearly") {
    const label = field === "priceMonthly" ? "monthly" : "yearly";
    const cur = prompt(`New ${label} price for ${plan.name} (in ${plan.currency}, whole units)`, String(plan[field] / 100));
    if (cur === null) return;
    const minor = Math.round(Number(cur) * 100);
    if (!Number.isFinite(minor) || minor < 0) return toast({ message: "Enter a valid amount" });
    savePlan(plan, { [field]: minor });
  }
  async function editLimit(plan: Plan, key: string) {
    const cur = prompt(`${key} for ${plan.name} — a number, or blank for unlimited`, plan.limits?.[key] == null ? "" : String(plan.limits[key]));
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
    const to = prompt("Send a test message to which address?");
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
  if (!allowed) return (<><h1 className="page-title">Platform console</h1><div className="fieldcard" style={{ borderColor: "var(--danger)" }}><p>This console is limited to platform administrators. Organization administrators manage their own organization from Admin instead.</p></div></>);

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Platform console</h1>
        {version && <span className="pill open" title={version.release}>v{version.version} · {version.release}</span>}
      </div>
      <p className="page-sub">Instance-wide administration: organizations, module entitlements, platform flags and administrators. Work item content stays private to each organization.</p>

      {stats && (
        <div className="stat-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {[["Organizations", `${stats.activeOrganizations}/${stats.organizations}`], ["Users", stats.users], ["Projects", stats.projects], ["Work items", stats.workItems], ["Platform admins", stats.platformAdmins]].map(([k, v]) => (
            <div className="fieldcard" key={String(k)} style={{ flex: "1 1 150px" }}><div className="muted" style={{ fontSize: 12 }}>{k}</div><div style={{ fontSize: 22, fontWeight: 600 }}>{v}</div></div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => <button key={t} className={`btn ${tab === t ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Organizations" && (
        <table className="exec-table">
          <thead><tr><th>Organization</th><th>Members</th><th>Projects</th><th>Items</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {orgs.length === 0 && <tr><td colSpan={6} className="muted">No organizations.</td></tr>}
            {orgs.map((o) => <tr key={o.id}>
              <td><strong>{o.name}</strong><br /><span className="muted mono" style={{ fontSize: 11 }}>{o.slug}</span></td>
              <td>{o.members}</td><td>{o.projects}</td><td>{o.workItems}</td>
              <td><span className={`pill ${o.status === "active" ? "open" : "danger"}`}>{o.status}</span></td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="btn btn-ghost" onClick={() => openPlanFor(o)}>Plan</button>
                <button className="btn btn-ghost" onClick={() => openModules(o)}>Modules</button>
                {o.status === "active"
                  ? <button className="btn btn-ghost" onClick={() => setStatus(o, "suspended")}>Suspend</button>
                  : <button className="btn btn-ghost" onClick={() => setStatus(o, "active")}>Reactivate</button>}
              </td>
            </tr>)}
          </tbody>
        </table>
      )}

      {tab === "Plans & pricing" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 12 }}>Prices are what customers see on the public pricing page. Limits and modules decide what each tier can actually use.</span>
            {plans.length === 0 && <button className="btn btn-primary" onClick={seedPlans}>Install default plans</button>}
          </div>
          <table className="exec-table">
            <thead><tr><th>Plan</th><th>Monthly</th><th>Yearly</th><th>Members</th><th>Projects</th><th>Modules</th><th>State</th></tr></thead>
            <tbody>
              {plans.length === 0 && <tr><td colSpan={7} className="muted">No plans yet.</td></tr>}
              {plans.map((p) => <tr key={p.id}>
                <td><strong>{p.name}</strong><br /><span className="muted mono" style={{ fontSize: 11 }}>{p.key}</span></td>
                <td><button className="btn btn-ghost" onClick={() => editPrice(p, "priceMonthly")}>{money(p.priceMonthly, p.currency)}</button></td>
                <td><button className="btn btn-ghost" onClick={() => editPrice(p, "priceYearly")}>{money(p.priceYearly, p.currency)}</button></td>
                <td><button className="btn btn-ghost" onClick={() => editLimit(p, "maxMembers")}>{p.limits?.maxMembers ?? "∞"}</button></td>
                <td><button className="btn btn-ghost" onClick={() => editLimit(p, "maxProjects")}>{p.limits?.maxProjects ?? "∞"}</button></td>
                <td className="muted" style={{ fontSize: 11, maxWidth: 220 }}>{p.modules.length ? p.modules.join(", ") : "core only"}</td>
                <td>
                  <span className={`pill ${p.status === "active" ? "open" : "danger"}`}>{p.status}</span>
                  {p.status === "active" && <button className="btn btn-ghost" onClick={() => savePlan(p, { isPublic: !p.isPublic })}>{p.isPublic ? "public" : "hidden"}</button>}
                </td>
              </tr>)}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12 }}>Click a price or limit to edit it. Blank limit means unlimited. Changes apply immediately — downgrades withdraw module access without deleting data.</p>
        </>
      )}

      {tab === "Email (SMTP)" && (
        <div className="builder-grid">
          <div className="gpanel">
            <h3>SMTP server</h3>
            <label>Host<input className="input" value={mailForm.host} onChange={(e) => setMailForm({ ...mailForm, host: e.target.value })} placeholder="smtp.gmail.com" style={{ marginBottom: 6 }} /></label>
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <label style={{ flex: 1 }}>Port<input className="input" type="number" value={mailForm.port} onChange={(e) => setMailForm({ ...mailForm, port: Number(e.target.value) })} /></label>
              <label style={{ flex: 1, display: "flex", gap: 6, alignItems: "flex-end", paddingBottom: 8 }}>
                <input type="checkbox" checked={mailForm.secure} onChange={(e) => setMailForm({ ...mailForm, secure: e.target.checked })} /> <span>Implicit TLS (465)</span>
              </label>
            </div>
            <label>Username<input className="input" value={mailForm.username} onChange={(e) => setMailForm({ ...mailForm, username: e.target.value })} autoComplete="off" style={{ marginBottom: 6 }} /></label>
            <label>Password<input className="input" type="password" value={mailForm.password} onChange={(e) => setMailForm({ ...mailForm, password: e.target.value })} autoComplete="new-password" placeholder={mail?.hasPassword ? "•••••••• (leave blank to keep)" : "SMTP password"} style={{ marginBottom: 10 }} /></label>
            <h3>Sender</h3>
            <label>From name<input className="input" value={mailForm.fromName} onChange={(e) => setMailForm({ ...mailForm, fromName: e.target.value })} style={{ marginBottom: 6 }} /></label>
            <label>From address<input className="input" value={mailForm.fromEmail} onChange={(e) => setMailForm({ ...mailForm, fromEmail: e.target.value })} placeholder="no-reply@yourdomain.com" style={{ marginBottom: 6 }} /></label>
            <label>Reply-to (optional)<input className="input" value={mailForm.replyTo} onChange={(e) => setMailForm({ ...mailForm, replyTo: e.target.value })} style={{ marginBottom: 10 }} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input type="checkbox" checked={mailForm.enabled} onChange={(e) => setMailForm({ ...mailForm, enabled: e.target.checked })} />
              <span>Deliver email through this server</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={saveMail} disabled={mailBusy || !mailForm.host || !mailForm.fromEmail}>{mailBusy ? "Working…" : "Save settings"}</button>
              <button className="btn" onClick={testMail} disabled={mailBusy || !mail?.enabled}>Send test</button>
            </div>
          </div>
          <div className="fieldcard">
            <h3>Status</h3>
            {!mail && <p className="muted">Not configured yet. Until a server is saved and enabled, email is written to the server log instead of being delivered.</p>}
            {mail && (
              <>
                <p style={{ margin: "0 0 8px" }}>Delivery is <span className={`pill ${mail.enabled ? "open" : "danger"}`}>{mail.enabled ? "enabled" : "disabled"}</span></p>
                <p className="muted mono" style={{ fontSize: 12 }}>{mail.host}:{mail.port} · {mail.secure ? "implicit TLS" : "STARTTLS"} · {mail.username || "no auth"}</p>
                <p className="muted" style={{ fontSize: 12 }}>From: {mail.fromName} &lt;{mail.fromEmail}&gt;</p>
                <hr style={{ opacity: 0.2, margin: "12px 0" }} />
                <h3>Last test</h3>
                {!mail.lastTestAt && <p className="muted">Never tested.</p>}
                {mail.lastTestAt && (
                  <p style={{ fontSize: 13 }}>
                    <span className={`pill ${mail.lastTestOk ? "open" : "danger"}`}>{mail.lastTestOk ? "delivered" : "failed"}</span>{" "}
                    <span className="muted">{new Date(mail.lastTestAt).toLocaleString()}</span>
                    {mail.lastTestError && <><br /><span className="mono" style={{ fontSize: 11, color: "var(--danger)" }}>{mail.lastTestError}</span></>}
                  </p>
                )}
              </>
            )}
            <hr style={{ opacity: 0.2, margin: "12px 0" }} />
            <p className="muted" style={{ fontSize: 12 }}>The password is encrypted before it is stored and is never sent back to this page. Leave the field blank when saving to keep the existing one. If delivery fails, invitations and password resets still complete — the message is logged rather than lost.</p>
          </div>
        </div>
      )}

      {tab === "Administrators" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input className="input" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ maxWidth: 320 }} />
            <button className="btn btn-primary" onClick={grant} disabled={!email}>Grant platform access</button>
          </div>
          <table className="exec-table">
            <thead><tr><th>Administrator</th><th>Email</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {admins.map((a) => <tr key={a.userId}>
                <td>{a.displayName}</td><td className="mono" style={{ fontSize: 12 }}>{a.email}</td><td className="muted">{a.note ?? "—"}</td>
                <td style={{ textAlign: "right" }}><button className="btn btn-ghost" onClick={() => revoke(a)}>Revoke</button></td>
              </tr>)}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12 }}>The final administrator cannot be removed, to prevent locking the instance out.</p>
        </>
      )}

      {tab === "Platform flags" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input className="input mono" placeholder="new.flag.key" value={flagKey} onChange={(e) => setFlagKey(e.target.value)} style={{ maxWidth: 320 }} />
            <button className="btn btn-primary" onClick={() => setFlag(flagKey, true)} disabled={!flagKey}>Create enabled</button>
          </div>
          <table className="exec-table">
            <thead><tr><th>Flag</th><th>State</th><th></th></tr></thead>
            <tbody>
              {flags.length === 0 && <tr><td colSpan={3} className="muted">No platform flags yet.</td></tr>}
              {flags.map((f) => <tr key={f.id}>
                <td className="mono">{f.key}</td><td><span className={`pill ${f.enabled ? "open" : "danger"}`}>{f.enabled ? "on" : "off"}</span></td>
                <td style={{ textAlign: "right" }}><button className="btn btn-ghost" onClick={() => setFlag(f.key, !f.enabled)}>{f.enabled ? "Disable" : "Enable"}</button></td>
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
              <td className="muted" style={{ fontSize: 12 }}>{new Date(a.createdAt).toLocaleString()}</td>
              <td className="mono" style={{ fontSize: 12 }}>{a.action}</td>
              <td className="muted mono" style={{ fontSize: 11 }}>{a.targetType ?? "—"}{a.targetId ? ` · ${a.targetId.slice(0, 8)}…` : ""}</td>
            </tr>)}
          </tbody>
        </table>
      )}

      {planFor && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPlanFor(null); }}>
          <div className="modal-card">
            <div className="modal-title-row"><h2>Plan · {planFor.org.name}</h2><button className="icon-btn" onClick={() => setPlanFor(null)}>✕</button></div>
            <p className="muted" style={{ fontSize: 12 }}>Current tier: <strong>{planFor.current}</strong>. Changing the plan immediately changes limits and module entitlements.</p>
            <div style={{ display: "grid", gap: 6 }}>
              {plans.filter((p) => p.status === "active").map((p) => (
                <button key={p.key} className={`btn ${planFor.current === p.key ? "btn-primary" : ""}`} onClick={() => assignPlan(planFor.org.id, p.key)}>
                  {p.name} · {money(p.priceMonthly, p.currency)}/mo · {p.limits?.maxProjects ?? "∞"} projects
                </button>
              ))}
            </div>
            <div className="modal-actions"><button className="btn" onClick={() => setPlanFor(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {modulesFor && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModulesFor(null); }}>
          <div className="modal-card">
            <div className="modal-title-row"><h2>Modules · {modulesFor.org.name}</h2><button className="icon-btn" onClick={() => setModulesFor(null)}>✕</button></div>
            <p className="muted" style={{ fontSize: 12 }}>Optional modules this organization may use. Disabled modules are refused by the API, not merely hidden.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 320, overflow: "auto" }}>
              {Object.entries(modulesFor.modules).map(([m, on]) => (
                <label key={m} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={on} onChange={(e) => toggleModule(m, e.target.checked)} />
                  <span className="mono" style={{ fontSize: 12 }}>{m}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions"><button className="btn" onClick={() => setModulesFor(null)}>Done</button></div>
          </div>
        </div>
      )}
    </>
  );
}
