"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput } from "../../../../components/ui";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Token = { id: string; name: string; masked: string; scopes: string[]; expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null };
const SCOPES = ["work:read", "work:write"];

export default function ApiTokensPage() {
  const toast = useToast();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["work:read"]);
  const [expires, setExpires] = useState("");
  const [issued, setIssued] = useState<string | null>(null);

  const load = useCallback(async () => setTokens(await api<Token[]>("/api-tokens", { org: true }).catch(() => [])), []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name || scopes.length === 0) { toast({ message: "Name + at least one scope" }); return; }
    try { const r = await api<{ token: string }>("/api-tokens", { method: "POST", org: true, body: JSON.stringify({ name, scopes, expiresInDays: expires ? Number(expires) : undefined }) }); setIssued(r.token); setName(""); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  async function revoke(id: string) { await api(`/api-tokens/${id}/revoke`, { method: "POST", org: true }); toast({ message: "Revoked" }); load(); }

  return (
    <>
      <h1 className="page-title">API tokens</h1>
      <p className="page-sub">Scoped bearer tokens for the public API. The full token is shown once, at creation.</p>

      {issued && (
        <div className="metric-card ui-static-9a300ca6" >
          <h3>New token — copy it now</h3>
          <p className="muted ui-static-6cb285c6" >This is the only time the full token is shown.</p>
          <div className="ui-static-a76d597a">
            <UiInput className="input mono ui-static-97445a8d" readOnly value={issued}  onFocus={(e) => e.target.select()} />
            <UiButton variant="secondary"  onClick={() => { navigator.clipboard?.writeText(issued); toast({ message: "Copied" }); }}>Copy</UiButton>
            <UiButton variant="tertiary"  onClick={() => setIssued(null)}>Done</UiButton>
          </div>
        </div>
      )}

      <div className="builder-grid">
        <div>
          <table className="exec-table">
            <thead><tr><th>Name</th><th>Token</th><th>Scopes</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tokens.length === 0 && <tr><td colSpan={5} className="muted">No tokens yet.</td></tr>}
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td><td className="mono">{t.masked}</td><td className="muted ui-static-6cb285c6" >{t.scopes.join(", ")}</td>
                  <td>{t.revokedAt ? <span className="pill rejected">revoked</span> : t.expiresAt && new Date(t.expiresAt) < new Date() ? <span className="pill rejected">expired</span> : <span className="pill approved">active</span>}</td>
                  <td className="ui-static-54c2afb7">{!t.revokedAt && <UiButton variant="tertiary"  onClick={() => revoke(t.id)}>Revoke</UiButton>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gpanel">
          <h3>New token</h3>
          <UiInput className="input ui-static-fdf33f23" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)}  />
          <div className="ui-static-fdf33f23">{SCOPES.map((sc) => <label key={sc} className="ui-static-277e3db9"><input type="checkbox" checked={scopes.includes(sc)} onChange={(e) => setScopes(e.target.checked ? [...scopes, sc] : scopes.filter((x) => x !== sc))} /> {sc}</label>)}</div>
          <UiInput className="input ui-static-fdf33f23" type="number" placeholder="Expires in days (optional)" value={expires} onChange={(e) => setExpires(e.target.value)}  />
          <UiButton variant="primary" className="ui-static-0466783d" onClick={create} >Create token</UiButton>
        </div>
      </div>
    </>
  );
}
