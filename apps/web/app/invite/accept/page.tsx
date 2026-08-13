"use client";

import { Button as UiButton } from "../../../components/ui";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError } from "../../../lib/api";
import { AuthAside } from "../../../components/AuthAside";
import { Field, Input } from "../../../components/ui/Field";
import { Callout } from "../../../components/ui/Callout";

function Accept() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [displayName, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api("/invitations/accept", { method: "POST", body: JSON.stringify({ token, displayName: displayName || undefined, password: password || undefined }) });
      router.push("/login");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not accept invitation"); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <AuthAside meta="Invitation · join an organization" />
      <div className="auth-panel"><div className="auth-panel-inner">
        <h1 className="ui-static-849a358d">Accept your invitation</h1>
        <p className="ui-static-a71c0726">Set up your account to join.</p>
        {!token && <Callout tone="danger">This link is missing its token.</Callout>}
        {error && <div className="ui-static-7e0bcb62"><Callout tone="danger">{error}</Callout></div>}
        {token && (
          <form onSubmit={submit} className="ui-static-56f43562">
            <Field label="Your name" hint="Leave blank if you already have an account."><Input value={displayName} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Set a password" hint="At least 10 characters. Skip if you already have an account."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <UiButton variant="primary" className="btn-block" disabled={busy}>{busy ? "Joining…" : "Join organization"}</UiButton>
          </form>
        )}
      </div></div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Accept /></Suspense>;
}
