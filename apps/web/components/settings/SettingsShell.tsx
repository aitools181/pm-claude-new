"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
const tabs = [
  ["/settings/profile","Profile"], ["/settings/notifications","Notifications"], ["/settings/email-forwarding","Email Forwarding"], ["/settings/account","Account"], ["/settings/display","Display"], ["/settings/apps","Apps"], ["/settings/hacks","Hacks"], ["/settings/workspace","Workspace"],
] as const;
export function SettingsShell({ title = "Settings", children }: { title?: string; children: ReactNode }) {
  const path = usePathname();
  return <div className="settings-page"><div className="settings-heading"><h1>{title}</h1><p>Manage your personal experience, account and workspace preferences.</p></div><div className="settings-layout"><aside className="settings-tabs">{tabs.map(([href,label]) => <a href={href} data-active={path === href} key={href}>{label}</a>)}</aside><section className="settings-panel">{children}</section></div></div>;
}
