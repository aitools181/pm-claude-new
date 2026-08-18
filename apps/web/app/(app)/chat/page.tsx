"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../components/ui";
import { appPrompt } from "../../../components/ui/AppDialog";
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
  const [body, setBody] = useState(""); const [reply, setReply] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]); const [proj, setProj] = useState("");

  const loadChannels = useCallback(async () => {
    try { setChannels(await api<Channel[]>("/chat/channels", { org: true })); setDisabled(false); }
    catch (e) { if (e instanceof ApiError && /disabled/i.test(e.message)) setDisabled(true); }
  }, []);
  useEffect(() => { loadChannels(); api<Project[]>("/projects", { org: true }).then((p) => { setProjects(p); setProj((x) => x || p[0]?.id || ""); }).catch(() => {}); }, [loadChannels]);
  const open = useCallback(async (id: string) => { setSel(id); setMessages(await api<Message[]>(`/chat/channels/${id}/messages`, { org: true }).catch(() => [])); }, []);

  async function newChannel() { const name = await appPrompt("Channel name"); if (!name) return; try { await api("/chat/channels", { method: "POST", org: true, body: JSON.stringify({ name }) }); loadChannels(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not create the channel" }); } }
  async function send() { if (!sel || !body.trim() || sending) return; setSending(true); try { await api(`/chat/channels/${sel}/messages`, { method: "POST", org: true, body: JSON.stringify({ body, parentMessageId: reply || undefined }) }); setBody(""); setReply(null); open(sel); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not send the message — it has not been lost, try again" }); } finally { setSending(false); } }
  async function toTask(m: Message) { if (!proj) { toast({ message: "Pick a project first" }); return; } try { await api(`/chat/messages/${m.id}/to-task`, { method: "POST", org: true, body: JSON.stringify({ projectId: proj }) }); toast({ message: "Work item created from message" }); open(sel!); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not create a task from this message" }); } }

  if (disabled) return (<><h1 className="page-title">Chat</h1><div className="module-off">The chat module is disabled. Enable it under <strong>Modules</strong>.</div></>);

  return (
    <>
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Chat</h1>
        <div className="ui-static-01ef7fc9">
          <UiSelect className="input ui-static-7c07cdf8" value={proj} onChange={(e) => setProj(e.target.value)} >{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect>
          <UiButton variant="primary"  onClick={newChannel}>+ Channel</UiButton>
        </div>
      </div>
      <div className="chat-layout">
        <div className="gpanel">
          {channels.map((c) => <UiButton variant="tertiary" key={c.id} className="ui-selection-row" data-selected={sel === c.id || undefined} onClick={() => open(c.id)}># {c.name}{c.isPrivate ? " 🔒" : ""}</UiButton>)}
          {channels.length === 0 && <p className="muted ui-static-5e0faad2" >No channels yet.</p>}
        </div>
        <div>
          {!sel && <p className="muted">Select a channel.</p>}
          {sel && (
            <>
              {messages.map((m) => (
                <div key={m.id} className={`chat-msg ${m.parentMessageId ? "thread" : ""}`}>
                  <div className="ui-static-c7853059">
                    <span>{m.body}</span>
                    <span className="ui-static-b71a0331">
                      {!m.parentMessageId && <UiButton variant="tertiary" className="ui-static-7c699c10"  onClick={() => setReply(m.id)}>Reply</UiButton>}
                      {m.createdWorkItemId ? <span className="pill approved">task ✓</span> : <UiButton variant="tertiary" className="ui-static-7c699c10"  onClick={() => toTask(m)}>→ Task</UiButton>}
                    </span>
                  </div>
                </div>
              ))}
              <div className="ui-static-a7d4afc9">
                <UiInput className="input ui-static-97445a8d" placeholder={reply ? "Reply in thread…" : "Message…"} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !sending && send()} disabled={sending} />
                {reply && <UiButton variant="tertiary"  onClick={() => setReply(null)}>Cancel reply</UiButton>}
                <UiButton variant="primary"  onClick={send} disabled={sending}>{sending ? "Sending…" : "Send"}</UiButton>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
