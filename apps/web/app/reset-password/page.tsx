"use client";

import { Button as UiButton } from "../../components/ui";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { api, ApiError } from "../../lib/api";
import { AuthAside } from "../../components/AuthAside";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Callout";

function ResetPasswordPageInner() {
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
    <h1 className="ui-static-849a358d">Choose a new password</h1>
    <p className="muted ui-static-50b8e771" >Use at least 10 characters. Resetting signs out every active device.</p>
    {!token && <Callout tone="danger">This reset link is missing its token.</Callout>}
    {error && <div className="ui-static-87c136df"><Callout tone="danger">{error}</Callout></div>}
    {done ? <><Callout tone="info">Password updated. You can now sign in.</Callout><a className="btn btn-primary btn-block ui-static-1b0f4999"  href="/login">Sign in</a></> :
      <form onSubmit={submit}><Field label="New password"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Confirm password"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <UiButton variant="primary" className="btn-block" disabled={busy || !token || password.length < 10 || password !== confirm}>{busy ? "Updating…" : "Update password"}</UiButton></form>}
  </div></div></div>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordPageInner /></Suspense>;
}
