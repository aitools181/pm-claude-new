"use client";
import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";

type Event = { id: string; action: string; actorUserId: string | null; targetType: string | null; createdAt: string };

export default function AuditPage() {
  const [rows, setRows] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Event[]>("/audit", { org: true }).then(setRows).catch((e) => { setError(e.message); setRows([]); }); }, []);

  return (
    <>
      <h1 className="page-title">Audit log</h1>
      <p className="page-sub">Security events in this organization. Append-only.</p>
      {error && <div className="callout callout-danger ui-static-87c136df" >{error}</div>}
      <div className="card">
        <table className="table">
          <thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>When</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={4} className="ui-static-fbeb64b6">Loading…</td></tr>}
            {rows?.length === 0 && !error && <tr><td colSpan={4} className="ui-static-fbeb64b6">No events yet.</td></tr>}
            {rows?.map((e) => (
              <tr key={e.id}>
                <td className="mono ui-static-5e0faad2" >{e.action}</td>
                <td className="mono ui-static-63e481c4" >{e.actorUserId?.slice(0, 8) ?? "system"}</td>
                <td className="ui-static-66d97643">{e.targetType ?? "—"}</td>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
