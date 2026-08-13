"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput } from "../../../components/ui";
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
    <div className="ui-static-1a30c0a0">
      <h1 className="page-title">Your request</h1>
      <p className="page-sub">Track status and message the team about this request.</p>

      {thread?.submissions.map((s) => (
        <div key={s.id} className="fieldcard ui-static-13313b1a" >
          <span className="mono ui-static-5e0faad2" >{new Date(s.createdAt).toLocaleString()}</span>
          <span className={`pill ${s.status === "routed" ? "approved" : "submitted"}`}>{s.status === "routed" ? "received" : s.status}</span>
        </div>
      ))}

      <h3 className="ui-static-40b0ff8c">Conversation</h3>
      <div className="ui-static-f4e719ae">
        {thread?.messages.length === 0 && <p className="muted ui-static-5e0faad2" >No messages yet. Ask a question below.</p>}
        {thread?.messages.map((m) => (
          <div key={m.id} className={`thread-msg ${m.authorKind}`}>
            <div className="ui-static-f700e0f5">{m.authorKind === "agent" ? "Team" : "You"} · {new Date(m.at).toLocaleString()}</div>
            {m.body}
          </div>
        ))}
      </div>
      <div className="ui-static-a76d597a">
        <UiInput className="input ui-static-97445a8d" placeholder="Write a message…" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}  />
        <UiButton variant="primary"  onClick={send}>Send</UiButton>
      </div>
    </div>
  );
}
