"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { AuthAside } from "../../components/AuthAside";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Callout";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondFactor, setSecondFactor] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({
        email, password,
        totp: needs2fa && !useRecovery ? secondFactor || undefined : undefined,
        recoveryCode: needs2fa && useRecovery ? secondFactor || undefined : undefined,
      }) });
      document.cookie = "pm_session=1; path=/; samesite=lax";
      router.push("/home");
    } catch (err) {
      if (err instanceof ApiError && (err.message.toLowerCase().includes("2fa") || err.message.toLowerCase().includes("recovery"))) {
        setNeeds2fa(true);
        if (secondFactor) setError("That authentication code did not match. Try again.");
      } else setError(err instanceof ApiError ? err.message : "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <AuthAside meta="Authenticated session · organization-scoped access" />
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Sign in</h1>
          <p style={{ color: "var(--ink-2)", marginTop: 0, marginBottom: 24 }}>Welcome back.</p>
          {error && <div style={{ marginBottom: 16 }}><Callout tone="danger">{error}</Callout></div>}
          <form onSubmit={submit}>
            <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password" hint={<a href="/recover" style={{ color: "var(--primary)" }}>Forgot password?</a>}>
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {needs2fa && (
              <Field label={useRecovery ? "Recovery code" : "Authentication code"} hint={
                <button type="button" className="link-button" onClick={() => { setUseRecovery(!useRecovery); setSecondFactor(""); }}>
                  {useRecovery ? "Use authenticator code" : "Use a recovery code"}
                </button>
              }>
                <Input className="mono" inputMode={useRecovery ? "text" : "numeric"} maxLength={useRecovery ? 32 : 8}
                  value={secondFactor} onChange={(e) => setSecondFactor(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))} autoFocus />
              </Field>
            )}
            <button className="btn btn-primary btn-block" disabled={busy || !email || !password || (needs2fa && !secondFactor)}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
