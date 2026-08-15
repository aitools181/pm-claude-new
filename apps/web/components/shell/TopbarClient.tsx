"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/realtime";
import { CommandPalette } from "./CommandPalette";
import { GlobalCreateDialog, type CreateKind } from "./GlobalCreateDialog";
import { UserMenu } from "./UserMenu";
import { AiChatPanel } from "./AiChatPanel";
import { Icon, type IconName } from "../ui/Icon";
import { useToast } from "../ui/Toast";

const CREATE_ITEMS: { kind: CreateKind; label: string; icon: IconName }[] = [
  { kind: "task", label: "Task", icon: "check" },
  { kind: "project", label: "Project", icon: "projects" },
  { kind: "page", label: "Page", icon: "docs" },
  { kind: "message", label: "Message", icon: "comment" },
  { kind: "team", label: "Team", icon: "people" },
  { kind: "portfolio", label: "Portfolio", icon: "portfolio" },
  { kind: "goal", label: "Goal", icon: "goal" },
];

export function TopbarClient({ onMenu }: { onMenu: () => void }) {
  const router = useRouter(); const toast = useToast(); const [unread, setUnread] = useState(0); const [createOpen, setCreateOpen] = useState(false);
  const [createMenu, setCreateMenu] = useState(false); const [createKind, setCreateKind] = useState<CreateKind>("task"); const [aiOpen, setAiOpen] = useState(false); const [createTitle, setCreateTitle] = useState("");
  function pick(kind: CreateKind, title = "") { setCreateKind(kind); setCreateTitle(title); setCreateMenu(false); setCreateOpen(true); }
  useEffect(() => {
    const onOpen = (e: Event) => { const detail = (e as CustomEvent<{ kind?: CreateKind; title?: string }>).detail; if (detail?.kind) pick(detail.kind, detail.title ?? ""); };
    window.addEventListener("pm:open-create", onOpen);
    return () => window.removeEventListener("pm:open-create", onOpen);
  }, []);
  async function refresh() { try { const { count } = await api<{ count: number }>("/notifications/unread-count", { org: true }); setUnread(count); } catch {} }
  useEffect(() => { refresh(); const s = getSocket(); const onNotif = () => { setUnread((n) => n + 1); toast({ message: "New notification", action: { label: "Open inbox", run: () => router.push("/inbox") } }); }; s.on("notification", onNotif); return () => { s.off("notification", onNotif); }; }, [router, toast]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { const target = e.target as HTMLElement | null; if (target?.matches("input, textarea, select, [contenteditable=true]")) return; if (e.key.toLowerCase() === "c") { e.preventDefault(); setCreateKind("task"); setCreateOpen(true); } }; addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey); }, []);
  return <>
    <header className="asana-topbar">
      <div className="asana-topbar-left"><button className="topbar-icon mobile-menu" aria-label="Open navigation" onClick={onMenu}><Icon name="menu" size={20} /></button><span className="global-create-wrap"><button className="asana-create" aria-haspopup="menu" aria-expanded={createMenu} onClick={() => setCreateMenu((v) => !v)}><span className="create-orb"><Icon name="plus" size={17} /></span><strong>Create</strong></button>{createMenu && <><button className="menu-scrim" aria-label="Close create menu" onClick={() => setCreateMenu(false)} /><div className="global-create-menu" role="menu" aria-label="Create">
        {CREATE_ITEMS.map((it) => <button role="menuitem" key={it.kind} onClick={() => pick(it.kind)}><Icon name={it.icon} size={16} />{it.label}</button>)}
        <button role="menuitem" onClick={() => { setCreateMenu(false); router.push("/ai/agents"); }}><Icon name="sparkles" size={16} />AI Teammate</button>
        <div className="menu-divider" />
        <button role="menuitem" onClick={() => pick("invite")}><Icon name="user" size={16} />Invite</button>
      </div></>}</span></div>
      <button className="asana-search" aria-haspopup="dialog" aria-label="Search workspace (Ctrl K)" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}><Icon name="search" size={17} /><span>Search</span><kbd>Ctrl K</kbd></button>
      <div className="asana-topbar-actions"><button type="button" className="topbar-icon ai-topbar-button" aria-label="Chat with AI" aria-expanded={aiOpen} onClick={() => setAiOpen(true)}><Icon name="sparkles" size={18} /></button><a href="/inbox" className="topbar-icon bell" aria-label="Inbox" onClick={() => setUnread(0)}><Icon name="bell" size={18} />{unread > 0 && <span className="count">{unread > 99 ? "99+" : unread}</span>}</a><a href="/settings" className="topbar-icon" aria-label="Settings"><Icon name="settings" size={18} /></a><UserMenu /></div>
      <CommandPalette />
    </header>
    <GlobalCreateDialog open={createOpen} kind={createKind} initialTitle={createTitle} onClose={() => { setCreateOpen(false); setCreateTitle(""); }} />
    <AiChatPanel open={aiOpen} onClose={() => setAiOpen(false)} />
  </>;
}
