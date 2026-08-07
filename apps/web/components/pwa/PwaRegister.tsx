"use client";
import { useEffect, useState } from "react";

/** Registers the service worker and surfaces install/update prompts. */
export default function PwaRegister() {
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onOnline = () => setOffline(false), onOffline = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(nw); });
      });
    }).catch(() => {});
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  function applyUpdate() { updateReady?.postMessage("SKIP_WAITING"); updateReady?.addEventListener("statechange", () => { if (updateReady.state === "activated") location.reload(); }); }

  if (offline) return <div style={{ position: "fixed", bottom: 12, left: 12, zIndex: 50, background: "#92610A", color: "#fff", padding: "6px 12px", borderRadius: 8, fontSize: 13 }}>Offline — changes queue locally</div>;
  if (updateReady) return <div style={{ position: "fixed", bottom: 12, left: 12, zIndex: 50, background: "var(--primary,#5B8DEF)", color: "#fff", padding: "6px 12px", borderRadius: 8, fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>A new version is available <button onClick={applyUpdate} style={{ background: "#fff", color: "#111", border: "none", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>Update</button></div>;
  return null;
}
