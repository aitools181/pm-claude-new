"use client";
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
      {msg && <div className="callout callout-info" style={{ marginBottom: 14 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card card-p">
          <strong>New role</strong>
          <div className="cfg-form" style={{ margin: "12px 0" }}>
            <Field label="Key"><Input className="mono" value={nr.key} onChange={(e) => setNr({ ...nr, key: e.target.value })} placeholder="reporter" /></Field>
            <Field label="Name"><Input value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} placeholder="Reporter" /></Field>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 8 }}>Permissions</div>
          <div className="chips" style={{ marginBottom: 14, maxHeight: 180, overflow: "auto" }}>
            {caps.map((c) => <span key={c} className="chip mono" data-on={!!picked[c]} onClick={() => setPicked({ ...picked, [c]: !picked[c] })}>{c}</span>)}
          </div>
          <button className="btn btn-primary" disabled={!nr.key || !nr.name} onClick={createRole}>Create role</button>

          <div style={{ borderTop: "1px solid var(--line)", margin: "18px 0" }} />
          <strong>Assign role</strong>
          <div className="cfg-form" style={{ marginTop: 12 }}>
            <Field label="User"><select className="input" value={assign.targetUserId} onChange={(e) => setAssign({ ...assign, targetUserId: e.target.value })}><option value="">Select…</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</select></Field>
            <Field label="Role"><select className="input" value={assign.roleKey} onChange={(e) => setAssign({ ...assign, roleKey: e.target.value })}><option value="">Select…</option>{roles.map((r) => <option key={r.id} value={r.key}>{r.name}</option>)}</select></Field>
          </div>
          <button className="btn" disabled={!assign.targetUserId || !assign.roleKey} onClick={doAssign}>Assign</button>
        </div>

        <div className="card card-p">
          <strong>Permission preview</strong>
          <p style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 4 }}>Exactly what this user can do right now.</p>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
            <Field label="User"><select className="input" value={previewUser} onChange={(e) => setPreviewUser(e.target.value)}><option value="">Select…</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</select></Field>
            <button className="btn btn-primary" style={{ marginBottom: 16 }} disabled={!previewUser} onClick={runPreview}>Preview</button>
          </div>
          <div className="preview-box">
            {preview === null && <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Select a user and preview.</span>}
            {preview?.length === 0 && <span style={{ color: "var(--ink-3)", fontSize: 13 }}>No capabilities.</span>}
            {preview?.map((c) => <div key={c} className="cap-line">✓ {c}</div>)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <table className="table"><thead><tr><th>Role</th><th>Key</th><th>Type</th></tr></thead>
          <tbody>{roles.map((r) => <tr key={r.id}><td style={{ fontWeight: 500 }}>{r.name}</td><td className="mono">{r.key}</td><td>{r.isSystem === "true" ? "system" : "custom"}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
