"use client";

import { useEffect } from "react";
import { Callout } from "../components/ui/Callout";

/**
 * Without an error boundary a single render failure unmounts the whole tree and
 * the user is left staring at a blank white page with nothing to act on. This
 * keeps the failure visible, recoverable and reportable.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Route render failed:", error); }, [error]);

  return (
    <div className="auth">
      <div className="auth-panel"><div className="auth-panel-inner">
        <h1 className="ui-static-881f70f9">Something went wrong</h1>
        <Callout tone="danger">
          This page could not be displayed. The error has been logged to the browser console.
        </Callout>
        {error.digest ? <p className="muted">Reference: {error.digest}</p> : null}
        <div className="ui-static-56f43562">
          <button className="btn btn-primary btn-block" type="button" onClick={reset}>Try again</button>
          <a className="btn btn-secondary btn-block" href="/home">Back to home</a>
        </div>
      </div></div>
    </div>
  );
}
