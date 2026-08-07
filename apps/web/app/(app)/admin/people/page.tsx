"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../lib/api";
import { Field, Input } from "../../../../components/ui/Field";

type Invitation = { id: string; email: string; roleKey: string; status: string; expiresAt: string };

export default function PeoplePage() {
  const [tab, setTab] = useState<"members" | "teams" | "roles">("members");
  return (
    <>
      <h1 className="page-title">People</h1>
      <p className="page-sub">Members, teams, and default roles in this organization.</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--line)" }}>
        {(["members", "teams", "roles"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="btn btn-ghost"
            style={{ borderRadius: 0, borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent", color: tab === t ? "var(--primary)" : "var(--ink-2)", textTransform: "capitalize" }}>{t}</button>
        ))}
      </div>
      {tab === "members" && <Members />}
      {tab === "teams" && <div className="card card-p"><div className="empty" style={{ padding: 40 }}>No teams yet. Create one to group people for assignment and reporting.</div></div>}
      {tab === "roles" && <RolesTable />}
    </>
  );
}

function Members() {
  const [email, setEmail] = useState("");
  const [roleKey, setRole] = useState("member");
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<Invitation[]>("/invitations", { org: true }).then(setInvites).catch(() => {});
  useEffect(() => { load(); }, []);

  async function invite() {
    setMsg(null);
    try { await api("/invitations", { method: "POST", org: true, body: JSON.stringify({ email, roleKey }) }); setEmail(""); setMsg("Invitation sent."); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not invite"); }
  }
  async function revoke(id: string) { await api(`/invitations/${id}`, { method: "DELETE", org: true }); load(); }

  return (
    <div className="card card-p">
      <strong>Invite a member</strong>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px auto", gap: 10, alignItems: "end", margin: "12px 0 8px" }}>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
        <Field label="Role">
          <select className="input" value={roleKey} onChange={(e) => setRole(e.target.value)}>
            {["organization_admin", "project_admin", "team_leader", "member", "viewer"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <button className="btn btn-primary" style={{ marginBottom: 16 }} disabled={!email} onClick={invite}>Send invite</button>
      </div>
      {msg && <div className="callout callout-info" style={{ marginBottom: 12 }}>{msg}</div>}

      <table className="table" style={{ marginTop: 8 }}>
        <thead><tr><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {invites.length === 0 && <tr><td colSpan={4} style={{ color: "var(--ink-3)" }}>No pending invitations.</td></tr>}
          {invites.map((i) => (
            <tr key={i.id}>
              <td>{i.email}</td>
              <td style={{ color: "var(--ink-2)" }}>{i.roleKey.replace(/_/g, " ")}</td>
              <td><span className="badge"><span className={`dot ${i.status === "pending" ? "dot-warn" : i.status === "accepted" ? "dot-ok" : "dot-off"}`} />{i.status}</span></td>
              <td style={{ textAlign: "right" }}>{i.status === "pending" && <button className="btn btn-danger" onClick={() => revoke(i.id)}>Revoke</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
      <tbody>{rows.map(([r, s]) => <tr key={r}><td style={{ fontWeight: 500 }}>{r}</td><td style={{ color: "var(--ink-2)" }}>{s}</td></tr>)}</tbody>
    </table></div>
  );
}
