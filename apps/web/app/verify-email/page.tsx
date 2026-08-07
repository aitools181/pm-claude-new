"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { AuthAside } from "../../components/AuthAside";
import { Callout } from "../../components/ui/Callout";

function VerifyEmailPageInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");
  useEffect(() => {
    if (!token) { setState("error"); setMessage("This verification link is missing its token."); return; }
    api("/auth/email-verification/confirm", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => { setState("done"); setMessage("Your email is verified."); })
      .catch((e) => { setState("error"); setMessage(e instanceof ApiError ? e.message : "Verification failed"); });
  }, [token]);
  return <div className="auth"><AuthAside meta="Verified identity" /><div className="auth-panel"><div className="auth-panel-inner">
    <h1 style={{ fontSize: 22 }}>Email verification</h1>
    <Callout tone={state === "error" ? "danger" : "info"}>{message}</Callout>
    {state !== "loading" && <a className="btn btn-primary btn-block" style={{ marginTop: 16 }} href={state === "done" ? "/home" : "/login"}>{state === "done" ? "Continue" : "Back to sign in"}</a>}
  </div></div></div>;
}

export default function VerifyEmailPage() {
  return <Suspense fallback={null}><VerifyEmailPageInner /></Suspense>;
}
