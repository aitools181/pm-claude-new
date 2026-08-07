"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { AuthAside } from "../../components/AuthAside";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Callout";

export default function ResetPasswordPage() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try { await api("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, password }) }); setDone(true); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Reset failed"); }
    finally { setBusy(false); }
  }
  return <div className="auth"><AuthAside meta="Single-use reset · all sessions revoked" /><div className="auth-panel"><div className="auth-panel-inner">
    <h1 style={{ fontSize: 22, marginBottom: 6 }}>Choose a new password</h1>
    <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>Use at least 10 characters. Resetting signs out every active device.</p>
    {!token && <Callout tone="danger">This reset link is missing its token.</Callout>}
    {error && <div style={{ marginBottom: 16 }}><Callout tone="danger">{error}</Callout></div>}
    {done ? <><Callout tone="info">Password updated. You can now sign in.</Callout><a className="btn btn-primary btn-block" style={{ marginTop: 16 }} href="/login">Sign in</a></> :
      <form onSubmit={submit}><Field label="New password"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Confirm password"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <button className="btn btn-primary btn-block" disabled={busy || !token || password.length < 10 || password !== confirm}>{busy ? "Updating…" : "Update password"}</button></form>}
  </div></div></div>;
}
