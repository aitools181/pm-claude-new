"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Channel = { id: string; name: string; kind: string; isPrivate: boolean };
type Message = { id: string; body: string; authorUserId: string; parentMessageId: string | null; createdWorkItemId: string | null };
type Project = { id: string; name: string };

export default function ChatPage() {
  const toast = useToast();
  const [disabled, setDisabled] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState(""); const [reply, setReply] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]); const [proj, setProj] = useState("");

  const loadChannels = useCallback(async () => {
    try { setChannels(await api<Channel[]>("/chat/channels", { org: true })); setDisabled(false); }
    catch (e) { if (e instanceof ApiError && /disabled/i.test(e.message)) setDisabled(true); }
  }, []);
  useEffect(() => { loadChannels(); api<Project[]>("/projects", { org: true }).then((p) => { setProjects(p); setProj((x) => x || p[0]?.id || ""); }).catch(() => {}); }, [loadChannels]);
  const open = useCallback(async (id: string) => { setSel(id); setMessages(await api<Message[]>(`/chat/channels/${id}/messages`, { org: true }).catch(() => [])); }, []);

  async function newChannel() { const name = prompt("Channel name"); if (!name) return; await api("/chat/channels", { method: "POST", org: true, body: JSON.stringify({ name }) }); loadChannels(); }
  async function send() { if (!sel || !body.trim()) return; await api(`/chat/channels/${sel}/messages`, { method: "POST", org: true, body: JSON.stringify({ body, parentMessageId: reply || undefined }) }); setBody(""); setReply(null); open(sel); }
  async function toTask(m: Message) { if (!proj) { toast({ message: "Pick a project first" }); return; } await api(`/chat/messages/${m.id}/to-task`, { method: "POST", org: true, body: JSON.stringify({ projectId: proj }) }); toast({ message: "Work item created from message" }); open(sel!); }

  if (disabled) return (<><h1 className="page-title">Chat</h1><div className="module-off">The chat module is disabled. Enable it under <strong>Modules</strong>.</div></>);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Chat</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="input" value={proj} onChange={(e) => setProj(e.target.value)} style={{ width: 150 }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button className="btn btn-primary" onClick={newChannel}>+ Channel</button>
        </div>
      </div>
      <div className="chat-layout">
        <div className="gpanel">
          {channels.map((c) => <button key={c.id} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4, borderColor: sel === c.id ? "var(--primary)" : undefined }} onClick={() => open(c.id)}># {c.name}{c.isPrivate ? " 🔒" : ""}</button>)}
          {channels.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No channels yet.</p>}
        </div>
        <div>
          {!sel && <p className="muted">Select a channel.</p>}
          {sel && (
            <>
              {messages.map((m) => (
                <div key={m.id} className={`chat-msg ${m.parentMessageId ? "thread" : ""}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{m.body}</span>
                    <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {!m.parentMessageId && <button className="btn btn-ghost" style={{ padding: "0 6px" }} onClick={() => setReply(m.id)}>Reply</button>}
                      {m.createdWorkItemId ? <span className="pill approved">task ✓</span> : <button className="btn btn-ghost" style={{ padding: "0 6px" }} onClick={() => toTask(m)}>→ Task</button>}
                    </span>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input className="input" placeholder={reply ? "Reply in thread…" : "Message…"} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} style={{ flex: 1 }} />
                {reply && <button className="btn btn-ghost" onClick={() => setReply(null)}>Cancel reply</button>}
                <button className="btn btn-primary" onClick={send}>Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
