"use client";

import { useEffect, useRef, useState } from "react";
import { Button as UiButton, Input as UiInput } from "../ui";
import { api } from "../../lib/api";
import { Icon } from "../ui/Icon";

type FoundProject = { id: string; name: string };
type FoundItem = { id: string; key: string; title: string; owningProjectId: string; statusCategory: string };
type FoundComment = { id: string; body: string | null; workItemId: string };
type SearchResult = { projects: FoundProject[]; workItems: FoundItem[]; comments: FoundComment[] };
type AiStatus = { enabled: boolean; provider?: string | null; reason?: string | null };
type Turn = { role: "user" | "assistant"; text: string; projects?: FoundProject[]; items?: FoundItem[]; comments?: FoundComment[] };

export function AiChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) api<AiStatus>("/ai/status", { org: true }).then(setStatus).catch(() => setStatus({ enabled: false })); }, [open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [turns, busy]);

  async function ask() {
    const q = draft.trim();
    if (!q || busy) return;
    setDraft(""); setBusy(true);
    setTurns((t) => [...t, { role: "user", text: q }]);
    try {
      const r = await api<SearchResult>(`/search?q=${encodeURIComponent(q)}`, { org: true });
      const total = r.projects.length + r.workItems.length + r.comments.length;
      const openCount = r.workItems.filter((x) => x.statusCategory !== "done").length;
      const text = total
        ? `Found ${total} result${total > 1 ? "s" : ""} for "${q}"${r.workItems.length ? ` — ${openCount} of ${r.workItems.length} matching tasks are still open` : ""}.`
        : `Nothing in your workspace matches "${q}". Try different keywords, or turn the request into a task below.`;
      setTurns((t) => [...t, { role: "assistant", text, projects: r.projects.slice(0, 3), items: r.workItems.slice(0, 6), comments: r.comments.slice(0, 2) }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: e instanceof Error ? e.message : "Search is not reachable right now." }]);
    } finally { setBusy(false); }
  }

  function toTask(text: string) {
    window.dispatchEvent(new CustomEvent("pm:open-create", { detail: { kind: "task", title: text } }));
    onClose();
  }

  if (!open) return null;
  return <>
    <button className="drawer-overlay" aria-label="Close AI panel" onClick={onClose} />
    <aside className="ai-chat-panel" role="dialog" aria-modal="true" aria-label="AI assistant">
      <header className="ai-chat-head"><span className="widget-icon purple"><Icon name="sparkles" size={16} /></span><div><strong>AI assistant</strong><small>{status?.enabled ? `Connected${status.provider ? ` · ${status.provider}` : ""}` : "Permission-aware workspace search"}</small></div><a href="/ai" title="Open AI studio" aria-label="Open AI studio"><Icon name="settings" size={15} /></a><button className="icon-btn" aria-label="Close AI assistant" onClick={onClose}><Icon name="close" /></button></header>
      {status && !status.enabled && <div className="ai-chat-notice">The governed AI provider is not activated, so answers come from permission-aware workspace search. <a href="/ai">Activate in AI studio</a>.</div>}
      <div className="ai-chat-scroll" ref={scrollRef}>
        {!turns.length && <div className="ai-chat-zero"><Icon name="sparkles" size={26} /><strong>Ask about your work</strong><span>Try a project name, a task keyword, or paste a request and turn it into a task.</span></div>}
        {turns.map((turn, index) => <article key={index} className={`ai-turn ${turn.role}`}>
          <p>{turn.text}</p>
          {(turn.projects?.length || turn.items?.length || turn.comments?.length) ? <div className="ai-refs">
            {turn.projects?.map((p) => <a key={`p-${p.id}`} href={`/projects/${p.id}`}><Icon name="projects" size={14} /><span><strong>{p.name}</strong><small>Project</small></span></a>)}
            {turn.items?.map((x) => <a key={`t-${x.id}`} href={`/projects/${x.owningProjectId}?task=${x.id}`}><Icon name={x.statusCategory === "done" ? "check" : "circle"} size={14} /><span><strong>{x.title}</strong><small>{x.key}</small></span></a>)}
            {turn.comments?.map((c) => <a key={`c-${c.id}`} href={`/search?q=${encodeURIComponent((c.body || "").slice(0, 30))}`}><Icon name="comment" size={14} /><span><strong>Comment</strong><small>{(c.body || "").slice(0, 60)}</small></span></a>)}
          </div> : null}
          {turn.role === "user" && <button className="ai-to-task" onClick={() => toTask(turn.text)}><Icon name="plus" size={13} />Turn into task</button>}
        </article>)}
        {busy && <article className="ai-turn assistant"><p>Searching your workspace…</p></article>}
      </div>
      <form className="ai-chat-composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <UiInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about tasks, projects, docs…" aria-label="Ask the AI assistant" />
        <UiButton type="submit" variant="primary" size="compact" disabled={!draft.trim() || busy}>{busy ? "…" : "Ask"}</UiButton>
      </form>
    </aside>
  </>;
}
