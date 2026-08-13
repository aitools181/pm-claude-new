"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/realtime";
import { CommandPalette } from "./CommandPalette";
import { GlobalCreateDialog } from "./GlobalCreateDialog";
import { UserMenu } from "./UserMenu";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/Toast";

export function TopbarClient({ onMenu }: { onMenu: () => void }) {
  const router = useRouter(); const toast = useToast(); const [unread, setUnread] = useState(0); const [createOpen, setCreateOpen] = useState(false);
  async function refresh() { try { const { count } = await api<{ count: number }>("/notifications/unread-count", { org: true }); setUnread(count); } catch {} }
  useEffect(() => { refresh(); const s = getSocket(); const onNotif = () => { setUnread((n) => n + 1); toast({ message: "New notification", action: { label: "Open inbox", run: () => router.push("/inbox") } }); }; s.on("notification", onNotif); return () => { s.off("notification", onNotif); }; }, [router, toast]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { const target = e.target as HTMLElement | null; if (target?.matches("input, textarea, select, [contenteditable=true]")) return; if (e.key.toLowerCase() === "c") { e.preventDefault(); setCreateOpen(true); } }; addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey); }, []);
  return <>
    <header className="asana-topbar">
      <div className="asana-topbar-left"><button className="topbar-icon mobile-menu" aria-label="Open navigation" onClick={onMenu}><Icon name="menu" size={20} /></button><button className="asana-create" onClick={() => setCreateOpen(true)}><span className="create-orb"><Icon name="plus" size={17} /></span><strong>Create</strong></button></div>
      <button className="asana-search" aria-haspopup="dialog" aria-label="Search workspace (Ctrl K)" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}><Icon name="search" size={17} /><span>Search</span><kbd>Ctrl K</kbd></button>
      <div className="asana-topbar-actions"><a href="/ai" className="topbar-icon ai-topbar-button" aria-label="AI assistant"><Icon name="sparkles" size={18} /></a><a href="/inbox" className="topbar-icon bell" aria-label="Inbox" onClick={() => setUnread(0)}><Icon name="bell" size={18} />{unread > 0 && <span className="count">{unread > 99 ? "99+" : unread}</span>}</a><a href="/settings" className="topbar-icon" aria-label="Settings"><Icon name="settings" size={18} /></a><UserMenu /></div>
      <CommandPalette />
    </header>
    <GlobalCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
  </>;
}
