"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Select as UiSelect } from "../../../../components/ui";
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
      <div className="ui-static-67715833">
        {(["members", "teams", "roles"] as const).map((t) => (
          <UiButton variant="tertiary" key={t} onClick={() => setTab(t)} className="ui-subtab-button" data-active={tab === t || undefined}>{t}</UiButton>
        ))}
      </div>
      {tab === "members" && <Members />}
      {tab === "teams" && <div className="card card-p"><div className="empty ui-static-a19bf612" >No teams yet. Create one to group people for assignment and reporting.</div></div>}
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
      <div className="ui-static-09170c65">
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
        <Field label="Role">
          <UiSelect className="input" value={roleKey} onChange={(e) => setRole(e.target.value)}>
            {["organization_admin", "project_admin", "team_leader", "member", "viewer"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </UiSelect>
        </Field>
        <UiButton variant="primary" className="ui-static-87c136df"  disabled={!email} onClick={invite}>Send invite</UiButton>
      </div>
      {msg && <div className="callout callout-info ui-static-da12f285" >{msg}</div>}

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
      <tbody>{rows.map(([r, s]) => <tr key={r}><td className="ui-static-02a2d333">{r}</td><td className="ui-static-66d97643">{s}</td></tr>)}</tbody>
    </table></div>
  );
}
