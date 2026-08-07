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
      {error && <div className="callout callout-danger" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card">
        <table className="table">
          <thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>When</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={4} style={{ color: "var(--ink-3)" }}>Loading…</td></tr>}
            {rows?.length === 0 && !error && <tr><td colSpan={4} style={{ color: "var(--ink-3)" }}>No events yet.</td></tr>}
            {rows?.map((e) => (
              <tr key={e.id}>
                <td className="mono" style={{ fontSize: 13 }}>{e.action}</td>
                <td className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{e.actorUserId?.slice(0, 8) ?? "system"}</td>
                <td style={{ color: "var(--ink-2)" }}>{e.targetType ?? "—"}</td>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
