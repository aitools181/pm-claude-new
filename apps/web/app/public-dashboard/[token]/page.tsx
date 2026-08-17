"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../lib/api";

type Widget = { id: string; type: string; title: string; value: number | string | null; unit?: string; computedAt?: string; error?: string };
type PublicDashboard = { name: string; widgets: Widget[] };

export default function PublicDashboardPage() {
  const token = useParams().token as string;
  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<PublicDashboard>(`/public/dashboards/${token}`).then(setDashboard).catch((e) => setError(e instanceof ApiError ? e.message : "This shared dashboard is not available."));
  }, [token]);

  if (error) return <div className="public-dashboard-shell"><div className="empty">{error}</div></div>;
  if (!dashboard) return <div className="public-dashboard-shell"><div className="muted">Loading…</div></div>;

  return (
    <div className="public-dashboard-shell">
      <header className="public-dashboard-head"><h1 className="page-title">{dashboard.name}</h1><span className="muted">Shared view — read-only</span></header>
      <div className="public-dashboard-grid">
        {dashboard.widgets.length === 0 && <div className="empty">No widgets are shared in this view.</div>}
        {dashboard.widgets.map((w) => (
          <div className="public-dashboard-widget" key={w.id}>
            <strong>{w.title}</strong>
            {w.error ? <span className="muted">Unavailable</span> : <span className="public-dashboard-value">{w.value ?? "—"}{w.unit ? ` ${w.unit}` : ""}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
