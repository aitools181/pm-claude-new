"use client";
import { useState } from "react";
import { api } from "../../lib/api";
import { AuthAside } from "../../components/AuthAside";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Callout";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) }); setSent(true); }
    finally { setBusy(false); }
  }
  return <div className="auth"><AuthAside meta="Secure password recovery" /><div className="auth-panel"><div className="auth-panel-inner">
    <h1 style={{ fontSize: 22, marginBottom: 6 }}>Reset your password</h1>
    <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>Enter your sign-in email. We will send a single-use reset link if the account exists.</p>
    {sent ? <><Callout tone="info">Check your email for a reset link. The link expires in 30 minutes.</Callout><a className="btn btn-secondary btn-block" style={{ marginTop: 16 }} href="/login">Back to sign in</a></> :
      <form onSubmit={submit}><Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <button className="btn btn-primary btn-block" disabled={busy || !email}>{busy ? "Sending…" : "Send reset link"}</button></form>}
  </div></div></div>;
}
