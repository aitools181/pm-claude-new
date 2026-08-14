"use client";

import { useEffect } from "react";
import { Callout } from "../../components/ui/Callout";

/**
 * Errors inside the authenticated app keep the shell (rail, sidebar, topbar)
 * mounted, so the user can navigate away or sign out instead of being stranded
 * on a blank page.
 */
export default function AppSectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Page render failed:", error); }, [error]);

  return (
    <div className="settings-section">
      <h2>This page could not be displayed</h2>
      <Callout tone="danger">
        Something in this view failed to render. Details are in the browser console.
      </Callout>
      {error.digest ? <p className="muted">Reference: {error.digest}</p> : null}
      <div className="setting-card">
        <button className="btn btn-primary" type="button" onClick={reset}>Try again</button>
        <a className="btn btn-secondary" href="/home">Back to home</a>
      </div>
    </div>
  );
}
