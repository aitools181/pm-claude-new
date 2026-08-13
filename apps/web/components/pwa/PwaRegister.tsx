"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";

/** Registers the service worker and surfaces persistent connectivity/update status. */
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

  if (offline) return <div className="ui-pwa-status" data-tone="warning" role="status" aria-live="polite">Offline — changes queue locally</div>;
  if (updateReady) return <div className="ui-pwa-status" data-tone="info" role="status" aria-live="polite"><span>A new version is available</span><Button size="compact" variant="secondary" onClick={applyUpdate}>Update</Button></div>;
  return null;
}
