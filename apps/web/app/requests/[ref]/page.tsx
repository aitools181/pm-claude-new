"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";

type Sub = { id: string; status: string; createdAt: string };
type Msg = { id: string; authorKind: string; body: string; at: string };
type Thread = { submissions: Sub[]; messages: Msg[] };

export default function RequestPortalPage() {
  const ref = useParams().ref as string;
  const [thread, setThread] = useState<Thread | null>(null);
  const [body, setBody] = useState("");

  const load = useCallback(async () => { setThread(await api<Thread>(`/public/requests/${ref}/thread`).catch(() => ({ submissions: [], messages: [] }))); }, [ref]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!body.trim()) return;
    await api(`/public/requests/${ref}/messages`, { method: "POST", body: JSON.stringify({ body }) });
    setBody(""); load();
  }

  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 20px" }}>
      <h1 className="page-title">Your request</h1>
      <p className="page-sub">Track status and message the team about this request.</p>

      {thread?.submissions.map((s) => (
        <div key={s.id} className="fieldcard" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 13 }}>{new Date(s.createdAt).toLocaleString()}</span>
          <span className={`pill ${s.status === "routed" ? "approved" : "submitted"}`}>{s.status === "routed" ? "received" : s.status}</span>
        </div>
      ))}

      <h3 style={{ fontSize: 14, marginTop: 20 }}>Conversation</h3>
      <div style={{ margin: "10px 0" }}>
        {thread?.messages.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No messages yet. Ask a question below.</p>}
        {thread?.messages.map((m) => (
          <div key={m.id} className={`thread-msg ${m.authorKind}`}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 2 }}>{m.authorKind === "agent" ? "Team" : "You"} · {new Date(m.at).toLocaleString()}</div>
            {m.body}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" placeholder="Write a message…" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={send}>Send</button>
      </div>
    </div>
  );
}
