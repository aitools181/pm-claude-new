"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../../components/ui";
import { appPrompt } from "../../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Integration = { id: string; kind: string; name: string; status: string; healthStatus: string | null; healthDetail: string | null; credentialHint: string | null };
const KINDS = ["email", "calendar", "github", "gitlab", "generic"];

export default function IntegrationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Integration[]>([]);
  const [form, setForm] = useState({ kind: "github", name: "", secret: "" });

  const load = useCallback(async () => setItems(await api<Integration[]>("/integrations", { org: true }).catch(() => [])), []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.name) { toast({ message: "Name required" }); return; }
    try { await api("/integrations", { method: "POST", org: true, body: JSON.stringify({ kind: form.kind, name: form.name, secret: form.secret || undefined }) }); setForm({ kind: "github", name: "", secret: "" }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  async function health(id: string) { const r = await api<{ ok: boolean; detail?: string }>(`/integrations/${id}/health-check`, { method: "POST", org: true }); toast({ message: r.ok ? "Healthy" : `Failing: ${r.detail}` }); load(); }
  async function rotate(id: string) { const secret = await appPrompt("New secret"); if (!secret) return; await api(`/integrations/${id}/credential`, { method: "POST", org: true, body: JSON.stringify({ secret }) }); toast({ message: "Credential rotated" }); load(); }
  async function disconnect(id: string) { await api(`/integrations/${id}/status`, { method: "POST", org: true, body: JSON.stringify({ status: "disconnected" }) }); load(); }

  return (
    <>
      <h1 className="page-title">Integrations</h1>
      <p className="page-sub">Connect external tools. Credentials are encrypted and only ever shown masked.</p>
      <div className="builder-grid">
        <div>
          {items.map((it) => (
            <div key={it.id} className="fieldcard ui-static-13313b1a" >
              <span>
                <strong>{it.name}</strong> <span className="muted">{it.kind}</span>
                <span className="ui-static-10f5bdb8">
                  <span className={`pill ${it.status === "connected" ? "approved" : it.status === "error" ? "rejected" : "open"}`}>{it.status}</span>
                  {it.healthStatus && <span className={[`pill ${it.healthStatus === "ok" ? "approved" : "rejected"}`, "ui-static-46cec891"].filter(Boolean).join(" ")} >{it.healthStatus}</span>}
                  {it.credentialHint && <span className="muted ui-static-391ef124" >secret {it.credentialHint}</span>}
                </span>
              </span>
              <span className="ui-static-49cd0921">
                <UiButton variant="tertiary"  onClick={() => health(it.id)}>Health</UiButton>
                <UiButton variant="tertiary"  onClick={() => rotate(it.id)}>Rotate</UiButton>
                {it.status !== "disconnected" && <UiButton variant="tertiary"  onClick={() => disconnect(it.id)}>Disconnect</UiButton>}
              </span>
            </div>
          ))}
          {items.length === 0 && <div className="empty">No integrations connected.</div>}
        </div>
        <div className="gpanel">
          <h3>Connect</h3>
          <UiSelect className="input ui-static-fdf33f23" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} >{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</UiSelect>
          <UiInput className="input ui-static-fdf33f23" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}  />
          <UiInput className="input ui-static-fdf33f23" type="password" placeholder="Secret / token" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })}  />
          <UiButton variant="primary" className="ui-static-0466783d" onClick={create} >Connect</UiButton>
        </div>
      </div>
    </>
  );
}
