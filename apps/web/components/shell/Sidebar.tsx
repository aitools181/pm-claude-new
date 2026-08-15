"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { OrgSwitcher } from "./OrgSwitcher";
import { api } from "../../lib/api";
import { Icon } from "../ui/Icon";
import { PROJECT_COLOR_PALETTE } from "../theme/themeTokens";
import { RuntimeStyle } from "../ui/RuntimeStyle";
import { useTheme } from "../theme/ThemeProvider";
import { signOut } from "../../lib/logout";

type Project = { id: string; name: string; keyPrefix: string; color?: string; workspaceId?: string; icon?: string | null; version?: number };
type Workspace = { id: string; name: string };
type NavPrefs = {
  showFavorites?: boolean;
  showRecents?: boolean;
  compactSections?: boolean;
  projectOpenMode?: "last" | "list" | "board";
  recentProjectIds?: string[];
  projectLastViews?: Record<string, string>;
};
function active(path: string, href: string) { return path === href || (href !== "/home" && path.startsWith(`${href}/`)); }

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const theme = useTheme();
  const nav = (theme.preferences.navigationPreferences || {}) as NavPrefs;
  const [projects, setProjects] = useState<Project[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [isPlatformAdmin, setPlatformAdmin] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const [projectPop, setProjectPop] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ planKey: string; planName: string; status: string } | null>(null);
  useEffect(() => { api<{ planKey: string; planName: string; status: string }>("/billing/entitlements").then(setPlan).catch(() => {}); }, []);

  useEffect(() => {
    Promise.all([
      api<Project[]>("/projects", { org: true }),
      api<Array<{ projectId: string }>>("/projects/favorites", { org: true }).catch(() => []),
      api<Workspace[]>("/workspaces", { org: true }).catch(() => []),
    ]).then(([rows, favorites, ws]) => { setProjects(rows); setFavoriteIds(favorites.map((row) => row.projectId)); setWorkspaces(ws); }).catch(() => {});
  }, []);

  async function setProjectStyle(projectId: string, patch: { color?: string; icon?: string }) {
    try {
      const fresh = await api<{ version: number }>(`/projects/${projectId}`, { org: true });
      await api(`/projects/${projectId}`, { method: "PATCH", org: true, body: JSON.stringify({ version: fresh.version, patch }) });
      const rows = await api<Project[]>("/projects", { org: true }); setProjects(rows);
    } catch { /* keep sidebar quiet on failure */ }
  }
  useEffect(() => { api<{ platformAdmin: boolean }>("/superadmin/me").then((r) => setPlatformAdmin(r.platformAdmin)).catch(() => {}); }, []);
  useEffect(() => { onClose(); }, [path]);

  useEffect(() => {
    const match = path.match(/^\/projects\/([^/]+)(?:\/([^/?#]+))?/);
    if (!match) return;
    const projectId = match[1]!;
    const view = match[2] || "list";
    const recent = [projectId, ...(nav.recentProjectIds || []).filter((id) => id !== projectId)].slice(0, 6);
    const lastViews = { ...(nav.projectLastViews || {}), [projectId]: view };
    if (JSON.stringify(recent) === JSON.stringify(nav.recentProjectIds || []) && nav.projectLastViews?.[projectId] === view) return;
    theme.setPreferences({ navigationPreferences: { ...nav, recentProjectIds: recent, projectLastViews: lastViews } });
  // Deliberately keyed to route changes; preferences are persisted only when recents/last-view actually change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const byId = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const favoriteProjects = favoriteIds.map((id) => byId.get(id)).filter(Boolean) as Project[];
  const recentProjects = (nav.recentProjectIds || []).map((id) => byId.get(id)).filter(Boolean) as Project[];
  const regularProjects = projects.filter((project) => !favoriteIds.includes(project.id));
  const projectHref = (projectId: string) => {
    const mode = nav.projectOpenMode || "last";
    const view = mode === "last" ? nav.projectLastViews?.[projectId] : mode;
    return !view || view === "list" ? `/projects/${projectId}` : `/projects/${projectId}/${view}`;
  };
  const ProjectLink = ({ project }: { project: Project }) => <span className="side-project-wrap"><a className="side-project-link" data-active={path.startsWith(`/projects/${project.id}`)} aria-current={path.startsWith(`/projects/${project.id}`) ? "page" : undefined} href={projectHref(project.id)} onContextMenu={(e) => { e.preventDefault(); setProjectPop(projectPop === project.id ? null : project.id); }}>
    <RuntimeStyle as="span" className="project-glyph runtime-bg" vars={{ "--runtime-bg": project.color }}>{project.icon && project.icon !== "project" ? <Icon name={project.icon as never} size={13} /> : project.name.slice(0, 1).toUpperCase()}</RuntimeStyle><span>{project.name}</span>
  </a><button type="button" className="side-project-more" aria-label={`Change color and icon of ${project.name}`} aria-haspopup="menu" aria-expanded={projectPop === project.id} onClick={() => setProjectPop(projectPop === project.id ? null : project.id)}><Icon name="more" size={13} /></button>
  {projectPop === project.id && <div className="side-project-pop" role="menu" aria-label={`Color and icon for ${project.name}`}><span className="pop-label">Color</span><div className="project-color-palette compact">{PROJECT_COLOR_PALETTE.map((c, index) => <button key={c} className="project-palette-swatch" data-palette-index={index} data-on={project.color === c} aria-label={`Use color ${index + 1}`} onClick={() => { setProjectStyle(project.id, { color: c }); setProjectPop(null); }} />)}</div><span className="pop-label">Icon</span><div className="pop-icon-row">{(["project","goal","calendar","flag","release","sparkles","chart"] as const).map((ic) => <button key={ic} data-on={(project.icon || "project") === ic} aria-label={`Use ${ic} icon`} onClick={() => { setProjectStyle(project.id, { icon: ic }); setProjectPop(null); }}>{ic === "project" ? <span className="pop-letter">{project.name.slice(0, 1).toUpperCase()}</span> : <Icon name={ic} size={15} />}</button>)}</div><a href={`/projects/${project.id}`}>Open project</a></div>}</span>;

  const teamOf = (project: Project) => workspaces.find((w) => w.id === project.workspaceId);

  return <aside className="work-sidebar" data-open={open} data-compact-sections={!!nav.compactSections} aria-label="Work navigation">
    <div className="work-sidebar-head"><div className="work-title-row"><strong>Work</strong><button className="side-plus" onClick={() => location.assign("/projects")} aria-label="Create project"><Icon name="plus" size={15} /></button></div><OrgSwitcher /></div>
    <div className="work-sidebar-scroll">
      <nav className="work-primary-nav">
        <a data-active={active(path, "/home")} aria-current={active(path, "/home") ? "page" : undefined} href="/home"><Icon name="home" size={17} /><span>Home</span></a>
        <a data-active={active(path, "/inbox")} aria-current={active(path, "/inbox") ? "page" : undefined} href="/inbox"><Icon name="inbox" size={17} /><span>Inbox</span></a>
      </nav>
      <div className="side-divider" />
      <nav className="work-primary-nav">
        <a data-active={active(path, "/my-tasks")} aria-current={active(path, "/my-tasks") ? "page" : undefined} href="/my-tasks"><Icon name="check" size={17} /><span>My tasks</span></a>
        <a data-active={path === "/projects"} aria-current={path === "/projects" ? "page" : undefined} href="/projects"><Icon name="projects" size={17} /><span>Projects</span></a>
        <a data-active={active(path, "/portfolios")} aria-current={active(path, "/portfolios") ? "page" : undefined} href="/portfolios"><Icon name="portfolio" size={17} /><span>Portfolios</span></a>
      </nav>
      {nav.showFavorites !== false && favoriteProjects.length > 0 && <section className="sidebar-projects"><div className="side-section-title"><span>Favorites</span></div>{favoriteProjects.slice(0, 8).map((project) => <ProjectLink key={project.id} project={project} />)}</section>}
      {nav.showRecents !== false && recentProjects.length > 0 && <section className="sidebar-projects"><div className="side-section-title"><span>Recents</span></div>{recentProjects.slice(0, 6).map((project) => <ProjectLink key={project.id} project={project} />)}</section>}
      {workspaces.length > 0 ? workspaces.map((ws) => {
        const teamProjects = regularProjects.filter((p) => p.workspaceId === ws.id);
        const collapsed = collapsedTeams.has(ws.id);
        return <section className="sidebar-projects sidebar-team" key={ws.id}><div className="side-section-title"><button type="button" className="team-collapse" aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} team ${ws.name}`} onClick={() => setCollapsedTeams((prev) => { const n = new Set(prev); n.has(ws.id) ? n.delete(ws.id) : n.add(ws.id); return n; })}><Icon name={collapsed ? "chevronRight" : "chevronDown"} size={12} /><span>{ws.name}</span></button><button type="button" className="team-add" title={`Create project in ${ws.name}`} aria-label={`Create project in ${ws.name}`} onClick={() => window.dispatchEvent(new CustomEvent("pm:open-create", { detail: { kind: "project" } }))}>+</button></div>{!collapsed && teamProjects.map((project) => <ProjectLink key={project.id} project={project} />)}{!collapsed && !teamProjects.length && <span className="side-empty">No projects yet</span>}</section>;
      }) : <section className="sidebar-projects"><div className="side-section-title"><span>Projects</span><a href="/projects" title="Browse projects" aria-label="Browse projects">+</a></div>{regularProjects.slice(0, 12).map((project) => <ProjectLink key={project.id} project={project} />)}{!projects.length && <span className="side-empty">No projects yet</span>}</section>}
      {regularProjects.some((p) => !teamOf(p)) && workspaces.length > 0 && <section className="sidebar-projects"><div className="side-section-title"><span>Other projects</span></div>{regularProjects.filter((p) => !teamOf(p)).slice(0, 8).map((project) => <ProjectLink key={project.id} project={project} />)}</section>}
      <section className="side-more"><button onClick={() => setMore(!more)} aria-expanded={more} aria-controls="more-tools-nav"><span>More tools</span><Icon name={more ? "chevronDown" : "chevronRight"} size={14} /></button>{more && <nav id="more-tools-nav" className="work-primary-nav compact"><a data-active={active(path,"/goals")} aria-current={active(path,"/goals") ? "page" : undefined} href="/goals"><Icon name="goal" size={16}/>Goals</a><a data-active={active(path,"/workload")} aria-current={active(path,"/workload") ? "page" : undefined} href="/workload"><Icon name="people" size={16}/>Workload</a><a data-active={active(path,"/calendar")} aria-current={active(path,"/calendar") ? "page" : undefined} href="/calendar"><Icon name="calendar" size={16}/>Calendar</a><a data-active={active(path,"/dashboards")} aria-current={active(path,"/dashboards") ? "page" : undefined} href="/dashboards"><Icon name="chart" size={16}/>Dashboards</a><a data-active={active(path,"/docs")} aria-current={active(path,"/docs") ? "page" : undefined} href="/docs"><Icon name="docs" size={16}/>Docs</a><a data-active={active(path,"/service")} aria-current={active(path,"/service") ? "page" : undefined} href="/service"><Icon name="shield" size={16}/>Service</a><a data-active={active(path,"/admin/organizations")} aria-current={active(path,"/admin/organizations") ? "page" : undefined} href="/admin/organizations"><Icon name="settings" size={16}/>Organizations</a><a data-active={active(path,"/admin/configure")} aria-current={active(path,"/admin/configure") ? "page" : undefined} href="/admin/configure"><Icon name="sliders" size={16}/>Customize</a></nav>}</section>
    </div>
    <div className="work-sidebar-bottom">
      {plan && <div className="sidebar-plan-card"><span className={`plan-ring ${plan.planKey === "platform_admin" ? "" : plan.status === "trialing" ? "trialing" : ""}`} aria-hidden="true" /><span className="plan-copy"><strong>{plan.planKey === "platform_admin" ? "Platform admin" : `${plan.planName}${plan.status === "trialing" ? " trial" : " plan"}`}</strong>{plan.planKey === "platform_admin" ? <small>Full access — no plan limits</small> : plan.status === "trialing" ? <small>Trial in progress</small> : plan.status === "past_due" ? <small className="plan-warn">Payment past due</small> : <small>{plan.planKey === "free" ? "Upgrade for more" : "Active"}</small>}</span>{plan.planKey !== "platform_admin" && (plan.planKey === "free" || plan.status === "trialing" || plan.status === "past_due") && <a className="plan-billing-cta" href="/pricing">Add billing info</a>}</div>}
      <button type="button" className="sidebar-invite-btn" onClick={() => window.dispatchEvent(new CustomEvent("pm:open-create", { detail: { kind: "invite" } }))}><Icon name="user" size={16} />Invite</button>
      {isPlatformAdmin && <a href="/superadmin"><Icon name="shield" size={16}/>Platform console</a>}<a href="/settings/workspace#plan"><Icon name="star" size={16}/>Plan & billing</a><a href="/settings/workspace"><Icon name="settings" size={16}/>Workspace settings</a><a href="/admin/people"><Icon name="people" size={16}/>Invite people</a><button type="button" className="sidebar-signout" data-testid="sidebar-sign-out" onClick={() => { void signOut(); }}><Icon name="arrowLeft" size={16}/>Log out</button></div>
  </aside>;
}
