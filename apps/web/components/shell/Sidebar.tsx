"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OrgSwitcher } from "./OrgSwitcher";
import { api } from "../../lib/api";
import { Icon } from "../ui/Icon";

type Project = { id: string; name: string; keyPrefix: string; color?: string };
function active(path: string, href: string) { return path === href || (href !== "/home" && path.startsWith(`${href}/`)); }
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname(); const [projects, setProjects] = useState<Project[]>([]); const [more, setMore] = useState(false); const [isPlatformAdmin, setPlatformAdmin] = useState(false);
  useEffect(() => { api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, []);
  useEffect(() => { api<{ platformAdmin: boolean }>("/superadmin/me").then((r) => setPlatformAdmin(r.platformAdmin)).catch(() => {}); }, []);
  useEffect(() => { onClose(); }, [path]);
  return <aside className="work-sidebar" data-open={open} aria-label="Work navigation">
    <div className="work-sidebar-head"><div className="work-title-row"><strong>Work</strong><button className="side-plus" onClick={() => location.assign('/projects')} aria-label="Create project"><Icon name="plus" size={15} /></button></div><OrgSwitcher /></div>
    <div className="work-sidebar-scroll">
      <nav className="work-primary-nav">
        <a data-active={active(path,"/home")} href="/home"><Icon name="home" size={17} /><span>Home</span></a>
        <a data-active={active(path,"/inbox")} href="/inbox"><Icon name="inbox" size={17} /><span>Inbox</span></a>
      </nav>
      <div className="side-divider" />
      <nav className="work-primary-nav">
        <a data-active={active(path,"/my-tasks")} href="/my-tasks"><Icon name="check" size={17} /><span>My tasks</span></a>
        <a data-active={path === "/projects"} href="/projects"><Icon name="projects" size={17} /><span>Projects</span></a>
        <a data-active={active(path,"/portfolios")} href="/portfolios"><Icon name="portfolio" size={17} /><span>Portfolios</span></a>
      </nav>
      <section className="sidebar-projects"><div className="side-section-title"><span>Projects</span><a href="/projects" title="Browse projects">+</a></div>{projects.slice(0,12).map((p) => <a className="side-project-link" data-active={path.startsWith(`/projects/${p.id}`)} href={`/projects/${p.id}`} key={p.id}><span className="project-glyph" style={{ background: p.color || undefined }}>{p.name.slice(0,1).toUpperCase()}</span><span>{p.name}</span></a>)}{!projects.length && <span className="side-empty">No projects yet</span>}</section>
      <section className="side-more"><button onClick={() => setMore(!more)}><span>More tools</span><Icon name={more ? "chevronDown" : "chevronRight"} size={14} /></button>{more && <nav className="work-primary-nav compact"><a href="/goals"><Icon name="goal" size={16}/>Goals</a><a href="/workload"><Icon name="people" size={16}/>Workload</a><a href="/calendar"><Icon name="calendar" size={16}/>Calendar</a><a href="/dashboards"><Icon name="chart" size={16}/>Dashboards</a><a href="/docs"><Icon name="docs" size={16}/>Docs</a><a href="/service"><Icon name="shield" size={16}/>Service</a><a href="/admin/organizations"><Icon name="settings" size={16}/>Organizations</a><a href="/admin/configure"><Icon name="sliders" size={16}/>Customize</a></nav>}</section>
    </div>
    <div className="work-sidebar-bottom">{isPlatformAdmin && <a href="/superadmin"><Icon name="shield" size={16}/>Platform console</a>}<a href="/settings/workspace#plan"><Icon name="star" size={16}/>Plan & billing</a><a href="/settings/workspace"><Icon name="settings" size={16}/>Workspace settings</a><a href="/admin/people"><Icon name="people" size={16}/>Invite people</a></div>
  </aside>;
}
