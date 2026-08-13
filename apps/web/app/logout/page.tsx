"use client";

import { useEffect, useRef, useState } from "react";
import { AuthAside } from "../../components/AuthAside";
import { Callout } from "../../components/ui/Callout";
import { signOut } from "../../lib/logout";

/**
 * Always-available sign-out. The account menu, the sidebar footer and
 * Settings -> Account all call the same helper, but this route means signing out
 * never depends on finding a control in the chrome: /logout always works.
 */
export default function LogoutPage() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    signOut().catch(() => setFailed(true));
  }, []);

  return (
    <div className="auth">
      <AuthAside meta="Ending your session" />
      <div className="auth-panel"><div className="auth-panel-inner">
        <h1 className="ui-static-881f70f9">Signing out</h1>
        <Callout tone={failed ? "danger" : "info"}>
          {failed
            ? "We could not reach the server, but this device has been cleared."
            : "Clearing this session and returning you to the sign-in page…"}
        </Callout>
        <a className="btn btn-primary btn-block ui-static-1b0f4999" href="/login">Go to sign in</a>
      </div></div>
    </div>
  );
}
