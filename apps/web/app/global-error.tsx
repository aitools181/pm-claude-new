"use client";

import { useEffect } from "react";

/** Last resort: catches failures in the root layout itself. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Root layout failed:", error); }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "48px", maxWidth: "560px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "20px", marginBottom: "8px" }}>The application failed to load</h1>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Reload the page to try again. If this keeps happening, contact your administrator.
          {error.digest ? ` Reference: ${error.digest}` : ""}
        </p>
        <button type="button" onClick={reset} style={{ padding: "10px 16px", cursor: "pointer" }}>Reload</button>
      </body>
    </html>
  );
}
