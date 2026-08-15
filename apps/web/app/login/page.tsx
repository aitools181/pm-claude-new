"use client";

import { Button as UiButton } from "../../components/ui";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { AuthAside } from "../../components/AuthAside";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Callout";

export default function LoginPage() {
  const [expired, setExpired] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondFactor, setSecondFactor] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setExpired(new URLSearchParams(window.location.search).get("expired") === "1"); }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read straight from the form. Browser autofill often populates the DOM
    // without firing React's onChange, which would leave the state values empty
    // and silently post blank credentials.
    const data = new FormData(e.currentTarget);
    const emailValue = (String(data.get("email") ?? "") || email).trim();
    const passwordValue = String(data.get("password") ?? "") || password;
    if (!emailValue || !passwordValue) { setError("Enter your email or username, and your password."); return; }
    setBusy(true); setError(null);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({
        email: emailValue, password: passwordValue,
        totp: needs2fa && !useRecovery ? secondFactor || undefined : undefined,
        recoveryCode: needs2fa && useRecovery ? secondFactor || undefined : undefined,
      }) });
      const next = new URLSearchParams(window.location.search).get("next");
      let landing = "/home";
      if (next?.startsWith("/") && !next.startsWith("//")) {
        landing = next;
      } else {
        const prefs = await api<{ defaultLanding?: string }>("/ui/preferences", { org: true }).catch(() => ({ defaultLanding: "/home" }));
        if (prefs.defaultLanding?.startsWith("/") && !prefs.defaultLanding.startsWith("//")) landing = prefs.defaultLanding;
      }
      // Full navigation, not router.push: the session cookie was just issued and
      // middleware must see it on a fresh document request.
      window.location.assign(landing);
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
          <h1 className="ui-static-849a358d">Sign in</h1>
          <p className="ui-static-3af046eb">Welcome back.</p>
          {expired && !error && <div className="ui-static-87c136df"><Callout tone="warning">Your session expired. Sign in again to continue.</Callout></div>}
          {error && <div className="ui-static-87c136df"><Callout tone="danger">{error}</Callout></div>}
          <form onSubmit={submit}>
            <Field label="Email or username"><Input name="email" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password" hint={<a href="/recover" className="ui-static-dc2e428f">Forgot password?</a>}>
              <Input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
            <UiButton type="submit" variant="primary" className="btn-block" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </UiButton>
          </form>
        </div>
      </div>
    </div>
  );
}
