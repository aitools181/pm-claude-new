"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
const tabs = [
  ["/settings/profile","Profile"], ["/settings/notifications","Notifications"], ["/settings/email-forwarding","Email Forwarding"], ["/settings/account","Account"], ["/settings/display","Display"], ["/settings/navigation","Navigation"], ["/settings/apps","Apps"], ["/settings/hacks","Hacks"], ["/settings/workspace","Workspace"],
] as const;
export function SettingsShell({ title = "Settings", children }: { title?: string; children: ReactNode }) {
  const path = usePathname();
  return <div className="settings-page"><div className="settings-modal-shell"><header className="settings-modal-head"><h1>{title}</h1><a className="settings-close" href="/home" aria-label="Close settings"><Icon name="close" size={19}/></a></header><div className="settings-layout"><aside className="settings-tabs" aria-label="Settings sections">{tabs.map(([href,label]) => <a href={href} data-active={path === href} aria-current={path===href?"page":undefined} key={href}>{label}</a>)}</aside><section className="settings-panel">{children}</section></div></div></div>;
}
