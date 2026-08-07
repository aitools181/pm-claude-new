"use client";
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
        <div className="metric-card" style={{ borderColor: "var(--primary)" }}>
          <h3>New token — copy it now</h3>
          <p className="muted" style={{ fontSize: 12 }}>This is the only time the full token is shown.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input mono" readOnly value={issued} style={{ flex: 1 }} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(issued); toast({ message: "Copied" }); }}>Copy</button>
            <button className="btn btn-ghost" onClick={() => setIssued(null)}>Done</button>
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
                  <td>{t.name}</td><td className="mono">{t.masked}</td><td className="muted" style={{ fontSize: 12 }}>{t.scopes.join(", ")}</td>
                  <td>{t.revokedAt ? <span className="pill rejected">revoked</span> : t.expiresAt && new Date(t.expiresAt) < new Date() ? <span className="pill rejected">expired</span> : <span className="pill approved">active</span>}</td>
                  <td style={{ textAlign: "right" }}>{!t.revokedAt && <button className="btn btn-ghost" onClick={() => revoke(t.id)}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gpanel">
          <h3>New token</h3>
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8 }} />
          <div style={{ marginBottom: 8 }}>{SCOPES.map((sc) => <label key={sc} style={{ display: "block", fontSize: 13 }}><input type="checkbox" checked={scopes.includes(sc)} onChange={(e) => setScopes(e.target.checked ? [...scopes, sc] : scopes.filter((x) => x !== sc))} /> {sc}</label>)}</div>
          <input className="input" type="number" placeholder="Expires in days (optional)" value={expires} onChange={(e) => setExpires(e.target.value)} style={{ marginBottom: 8 }} />
          <button className="btn btn-primary" onClick={create} style={{ width: "100%" }}>Create token</button>
        </div>
      </div>
    </>
  );
}
