"use client";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../ui/Icon";

const entries: { href: string; label: string; icon: IconName }[] = [
  { href: "/home", label: "Work", icon: "home" },
  { href: "/ai/agents", label: "Agents", icon: "sparkles" },
  { href: "/goals", label: "Strategy", icon: "goal" },
  { href: "/docs", label: "Knowledge", icon: "docs" },
  { href: "/admin/people", label: "People", icon: "people" },
];
export function GlobalRail() {
  const path = usePathname();
  return <aside className="global-rail" aria-label="Product areas">
    <a href="/home" className="rail-mark" aria-label="Workspace home"><span className="rail-mark-dot" /><span className="rail-mark-dot" /><span className="rail-mark-dot" /></a>
    <nav className="rail-nav">{entries.map((row) => <a key={row.href} className="rail-link" data-active={path === row.href || path.startsWith(`${row.href}/`)} aria-current={(path === row.href || path.startsWith(`${row.href}/`)) ? "page" : undefined} href={row.href} title={row.label}><Icon name={row.icon} size={19} /><span>{row.label}</span></a>)}</nav>
    <div className="rail-bottom"><a className="rail-link" href="/help" title="Help"><Icon name="help" size={19} /><span>Help</span></a><a className="rail-link" href="/settings" title="Settings"><Icon name="settings" size={19} /><span>Settings</span></a><a className="rail-link" href="/logout" title="Log out"><Icon name="arrowLeft" size={19} /><span>Log out</span></a><a className="rail-avatar" href="/settings/profile" aria-label="Profile">PM</a></div>
  </aside>;
}
