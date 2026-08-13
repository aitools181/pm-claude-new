"use client";

import { Button as UiButton } from "../../../../components/ui";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../../../lib/api";
import { Callout } from "../../../../components/ui/Callout";
import { Field, Input } from "../../../../components/ui/Field";
import { useToast } from "../../../../components/ui/Toast";

type Session = { id: string; userAgent: string | null; ip: string | null; createdAt: string; expiresAt: string; current: boolean };
type TwoFactorStatus = { enabled: boolean; recoveryCodesRemaining: number };
type Enrolment = { qrDataUrl: string; secret: string };

export default function SessionsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Session[] | null>(null);
  const [twofa, setTwofa] = useState<TwoFactorStatus | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sessions, status] = await Promise.all([
      api<Session[]>("/auth/sessions"),
      api<TwoFactorStatus>("/2fa/status"),
    ]);
    setRows(sessions); setTwofa(status);
  }, []);
  useEffect(() => { load().catch(() => { setRows([]); setTwofa({ enabled: false, recoveryCodesRemaining: 0 }); }); }, [load]);

  async function action(run: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null);
    try { await run(); toast({ message: success }); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  async function begin2fa() {
    setBusy(true); setError(null);
    try { setEnrolment(await api<Enrolment>("/2fa/enrol", { method: "POST" })); setCode(""); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not start enrolment"); }
    finally { setBusy(false); }
  }

  async function confirm2fa() {
    setBusy(true); setError(null);
    try {
      const result = await api<{ enabled: boolean; recoveryCodes: string[] }>("/2fa/enrol/confirm", { method: "POST", body: JSON.stringify({ code }) });
      setRecoveryCodes(result.recoveryCodes); setEnrolment(null); setCode(""); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not enable 2FA"); }
    finally { setBusy(false); }
  }

  async function regenerate() {
    setBusy(true); setError(null);
    try {
      const result = await api<{ recoveryCodes: string[] }>("/2fa/recovery/regenerate", { method: "POST", body: JSON.stringify({ code }) });
      setRecoveryCodes(result.recoveryCodes); setCode(""); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not regenerate recovery codes"); }
    finally { setBusy(false); }
  }

  async function disable2fa() {
    await action(() => api("/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }), "Two-factor authentication disabled");
    setCode(""); setRecoveryCodes([]);
  }

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Account security</h1><p className="page-sub">Manage signed-in devices, email verification and two-factor authentication.</p></div></div>
      {error && <div className="ui-static-87c136df"><Callout tone="danger">{error}</Callout></div>}

      <div className="card ui-static-905d8b3d" >
        <div className="card-head"><div><h2 className="ui-static-4499790d">Active sessions</h2><p className="muted ui-static-63e775fe" >Revoke any device you no longer recognise.</p></div>
          <UiButton variant="secondary" className="btn-secondary" disabled={busy || !rows?.length} onClick={() => action(async () => {
            await api("/auth/sessions/revoke-all", { method: "POST" }); window.location.href = "/login";
          }, "All sessions revoked")}>Sign out everywhere</UiButton></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Device</th><th>IP</th><th>Signed in</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={5} className="muted">No active sessions.</td></tr>}
            {rows?.map((s) => <tr key={s.id}>
              <td><strong>{s.current ? "This device" : "Signed-in device"}</strong><div className="muted ui-static-5f880077" >{s.userAgent ?? "Unknown device"}</div></td>
              <td className="mono">{s.ip ?? "—"}</td><td>{new Date(s.createdAt).toLocaleString()}</td><td>{new Date(s.expiresAt).toLocaleDateString()}</td>
              <td><UiButton variant="tertiary" className="btn-sm" disabled={busy} onClick={() => action(async () => {
                const result = await api<{ current: boolean }>(`/auth/sessions/${s.id}`, { method: "DELETE" });
                if (result.current) window.location.href = "/login";
              }, "Session revoked")}>Revoke</UiButton></td>
            </tr>)}
          </tbody>
        </table></div>
      </div>

      <div className="card ui-static-905d8b3d" >
        <div className="card-head"><div><h2 className="ui-static-4499790d">Email verification</h2><p className="muted ui-static-63e775fe" >Send a single-use verification link to your account email.</p></div>
          <UiButton variant="secondary" className="btn-secondary" disabled={busy} onClick={() => action(() => api("/auth/email-verification/request", { method: "POST" }), "Verification email queued")}>Send verification email</UiButton></div>
      </div>

      <div className="card">
        <div className="card-head"><div><h2 className="ui-static-4499790d">Two-factor authentication</h2><p className="muted ui-static-63e775fe" >{twofa?.enabled ? `Enabled · ${twofa.recoveryCodesRemaining} recovery codes remaining` : "Add an authenticator app for stronger account protection."}</p></div>
          {!twofa?.enabled && !enrolment && <UiButton variant="primary"  disabled={busy} onClick={begin2fa}>Set up 2FA</UiButton>}</div>

        {enrolment && <div className="settings-split">
          <div><img src={enrolment.qrDataUrl} width={220} height={220} alt="Authenticator QR code" className="ui-static-28eb553c" /></div>
          <div><Callout tone="info">Scan the QR code, or enter this secret manually: <span className="mono">{enrolment.secret}</span></Callout>
            <Field label="Authenticator code"><Input inputMode="numeric" className="mono" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
            <UiButton variant="primary"  disabled={busy || code.length < 6} onClick={confirm2fa}>Confirm and enable</UiButton></div>
        </div>}

        {twofa?.enabled && <div className="ui-static-04391f08">
          <Field label="Current authenticator code" hint="Required to disable 2FA or replace recovery codes."><Input inputMode="numeric" className="mono" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
          <div className="button-row"><UiButton variant="secondary" className="btn-secondary" disabled={busy || code.length < 6} onClick={regenerate}>Generate new recovery codes</UiButton>
            <UiButton variant="destructive"  disabled={busy || code.length < 6} onClick={disable2fa}>Disable 2FA</UiButton></div>
        </div>}

        {recoveryCodes.length > 0 && <div className="ui-static-86de7ac6"><Callout tone="danger"><strong>Save these recovery codes now.</strong> Each code works once and will not be shown again.</Callout>
          <div className="recovery-grid" aria-label="Recovery codes">{recoveryCodes.map((c) => <code key={c}>{c}</code>)}</div>
          <UiButton variant="secondary" className="btn-secondary" onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}>Copy codes</UiButton></div>}
      </div>
    </>
  );
}
