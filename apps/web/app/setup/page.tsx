"use client";

import { Button as UiButton } from "../../components/ui";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { AuthAside } from "../../components/AuthAside";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/Callout";

const STEPS = ["Administrator", "Organization", "Review"];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ displayName: "", email: "", password: "", orgName: "", orgSlug: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: k === "orgSlug" ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") : e.target.value });

  async function finish() {
    setBusy(true); setError(null);
    try { await api("/auth/setup", { method: "POST", body: JSON.stringify(f) }); router.push("/login"); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Setup failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <AuthAside meta="First-run setup · creates the first administrator and organization" />
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <h1 className="ui-static-849a358d">Set up your installation</h1>
          <p className="ui-static-3af046eb">This runs once. You’ll be the first administrator.</p>

          <div className="stepper">
            {STEPS.map((s, i) => (
              <div key={s} className="step" data-state={i === step ? "active" : i < step ? "done" : ""}>
                <span className="num">{i < step ? "✓" : i + 1}</span>{s}
              </div>
            ))}
          </div>

          {error && <div className="ui-static-87c136df"><Callout tone="danger">{error}</Callout></div>}

          {step === 0 && (
            <>
              <Field label="Your name"><Input value={f.displayName} onChange={set("displayName")} placeholder="Ada Lovelace" /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} placeholder="admin@company.com" /></Field>
              <Field label="Password" hint="At least 10 characters."><Input type="password" value={f.password} onChange={set("password")} /></Field>
              <UiButton variant="primary" className="btn-block" disabled={!f.displayName || !f.email || f.password.length < 10} onClick={() => setStep(1)}>Continue</UiButton>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Organization name"><Input value={f.orgName} onChange={set("orgName")} placeholder="Acme Inc." /></Field>
              <Field label="Organization slug" hint={<>Used in URLs. <span className="mono">{f.orgSlug || "acme-inc"}</span></>}>
                <Input className="mono" value={f.orgSlug} onChange={set("orgSlug")} placeholder="acme-inc" />
              </Field>
              <div className="ui-static-a76d597a">
                <UiButton variant="secondary"  onClick={() => setStep(0)}>Back</UiButton>
                <UiButton variant="primary" className="btn-block" disabled={!f.orgName || !f.orgSlug} onClick={() => setStep(2)}>Continue</UiButton>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="card card-p ui-static-87c136df" >
                <Row k="Administrator" v={f.displayName} />
                <Row k="Email" v={f.email} mono />
                <Row k="Organization" v={f.orgName} />
                <Row k="Slug" v={f.orgSlug} mono />
              </div>
              <div className="ui-static-a76d597a">
                <UiButton variant="secondary"  onClick={() => setStep(1)}>Back</UiButton>
                <UiButton variant="primary" className="btn-block" onClick={finish} disabled={busy}>{busy ? "Creating…" : "Create and finish"}</UiButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="ui-static-7342334e">
      <span className="ui-static-fbeb64b6">{k}</span>
      <span className={mono ? "mono" : ""}>{v || "—"}</span>
    </div>
  );
}
