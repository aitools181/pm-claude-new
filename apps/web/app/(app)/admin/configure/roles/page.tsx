"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Select as UiSelect } from "../../../../../components/ui";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { Field, Input } from "../../../../../components/ui/Field";

type Role = { id: string; key: string; name: string; isSystem: string };
type Member = { userId: string; displayName: string; email: string };

export default function RolesEditor() {
  const [caps, setCaps] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [nr, setNr] = useState({ key: "", name: "" });
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [assign, setAssign] = useState({ targetUserId: "", roleKey: "" });
  const [previewUser, setPreviewUser] = useState("");
  const [preview, setPreview] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setCaps((await api<{ capabilities: string[] }>("/roles/capabilities", { org: true })).capabilities);
    setRoles(await api<Role[]>("/roles", { org: true }));
    setMembers(await api<Member[]>("/members", { org: true }).catch(() => []));
  }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);

  async function createRole() {
    setMsg(null);
    const permissions = Object.keys(picked).filter((k) => picked[k]);
    try { await api("/roles", { method: "POST", org: true, body: JSON.stringify({ key: nr.key, name: nr.name, permissions }) }); setNr({ key: "", name: "" }); setPicked({}); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function doAssign() {
    setMsg(null);
    try { await api("/roles/assignments", { method: "POST", org: true, body: JSON.stringify(assign) }); setMsg("Role assigned."); if (previewUser === assign.targetUserId) runPreview(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function runPreview() {
    if (!previewUser) return;
    const res = await api<{ capabilities: string[] }>(`/roles/preview/${previewUser}`, { org: true });
    setPreview(res.capabilities);
  }

  return (
    <>
      <h1 className="page-title">Roles & Permissions</h1>
      <p className="page-sub">Build roles, assign them, and preview a user's exact capabilities — the preview is computed by the same resolver the server enforces.</p>
      {msg && <div className="callout callout-info ui-static-2b583d73" >{msg}</div>}

      <div className="ui-static-911b26ad">
        <div className="card card-p">
          <strong>New role</strong>
          <div className="cfg-form ui-static-d60550f6" >
            <Field label="Key"><Input className="mono" value={nr.key} onChange={(e) => setNr({ ...nr, key: e.target.value })} placeholder="reporter" /></Field>
            <Field label="Name"><Input value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} placeholder="Reporter" /></Field>
          </div>
          <div className="ui-static-8672e9a0">Permissions</div>
          <div className="chips ui-static-02a78aa2" >
            {caps.map((c) => <button type="button" key={c} className="chip mono ui-reset-button" aria-pressed={!!picked[c]} data-on={!!picked[c]} onClick={() => setPicked({ ...picked, [c]: !picked[c] })}>{c}</button>)}
          </div>
          <UiButton variant="primary"  disabled={!nr.key || !nr.name} onClick={createRole}>Create role</UiButton>

          <div className="ui-static-8986c503" />
          <strong>Assign role</strong>
          <div className="cfg-form ui-static-56f43562" >
            <Field label="User"><UiSelect className="input" value={assign.targetUserId} onChange={(e) => setAssign({ ...assign, targetUserId: e.target.value })}><option value="">Select…</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</UiSelect></Field>
            <Field label="Role"><UiSelect className="input" value={assign.roleKey} onChange={(e) => setAssign({ ...assign, roleKey: e.target.value })}><option value="">Select…</option>{roles.map((r) => <option key={r.id} value={r.key}>{r.name}</option>)}</UiSelect></Field>
          </div>
          <UiButton variant="secondary"  disabled={!assign.targetUserId || !assign.roleKey} onClick={doAssign}>Assign</UiButton>
        </div>

        <div className="card card-p">
          <strong>Permission preview</strong>
          <p className="ui-static-76ceb398">Exactly what this user can do right now.</p>
          <div className="ui-static-843ba39c">
            <Field label="User"><UiSelect className="input" value={previewUser} onChange={(e) => setPreviewUser(e.target.value)}><option value="">Select…</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</UiSelect></Field>
            <UiButton variant="primary" className="ui-static-87c136df"  disabled={!previewUser} onClick={runPreview}>Preview</UiButton>
          </div>
          <div className="preview-box">
            {preview === null && <span className="ui-static-c3d3e812">Select a user and preview.</span>}
            {preview?.length === 0 && <span className="ui-static-c3d3e812">No capabilities.</span>}
            {preview?.map((c) => <div key={c} className="cap-line">✓ {c}</div>)}
          </div>
        </div>
      </div>

      <div className="card ui-static-1b0f4999" >
        <table className="table"><thead><tr><th>Role</th><th>Key</th><th>Type</th></tr></thead>
          <tbody>{roles.map((r) => <tr key={r.id}><td className="ui-static-02a2d333">{r.name}</td><td className="mono">{r.key}</td><td>{r.isSystem === "true" ? "system" : "custom"}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
