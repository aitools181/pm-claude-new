"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Input as UiInput } from "../../../../../components/ui";
import { Icon } from "../../../../../components/ui/Icon";
import { ProjectChrome } from "../../../../../components/project/ProjectChrome";
import { TaskDrawer } from "../../../../../components/work/TaskDrawer";
import { useTheme } from "../../../../../components/theme/ThemeProvider";
import { api } from "../../../../../lib/api";
import { appPrompt } from "../../../../../components/ui/AppDialog";

type Project = { id: string; name: string; keyPrefix: string; color?: string; icon?: string; health: string; status: string; privacy: string; version: number; description?: string | null; startDate?: string | null; dueDate?: string | null };
type Ev = { id: string; key: string; title: string; startDate: string | null; dueDate: string | null; statusCategory: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ProjectCalendar() {
  const id = useParams().id as string;
  const theme = useTheme();
  const weekStart = Number.isInteger(theme.preferences.personalWeekStart) ? Number(theme.preferences.personalWeekStart) : (theme.preferences.workspaceWeekStart ?? 1);
  const locale = theme.preferences.locale || "en";
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const day = (weekStart + i) % 7;
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(Date.UTC(2026, 0, 4 + day)));
  }), [weekStart, locale]);
  const [project, setProject] = useState<Project | null>(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)); });
  const [events, setEvents] = useState<Ev[]>([]);
  const [search, setSearch] = useState("");
  const [weeks, setWeeks] = useState(true);
  const [hideDone, setHideDone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const range = useMemo(() => {
    const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth();
    const start = new Date(Date.UTC(y, m, 1));
    const offset = (start.getUTCDay() - weekStart + 7) % 7;
    start.setUTCDate(start.getUTCDate() - offset);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 41);
    return { from: iso(start), to: iso(end), start };
  }, [cursor, weekStart]);

  const [loadError, setLoadError] = useState("");
  async function load() {
    try {
      const [p, e] = await Promise.all([
        api<Project>(`/projects/${id}`, { org: true }),
        api<Ev[]>(`/calendar/range?from=${range.from}&to=${range.to}&projectId=${id}`, { org: true }).catch(() => []),
      ]);
      setProject(p); setEvents(e); setLoadError("");
    } catch (err) { setLoadError(err instanceof Error ? err.message : "Could not load this project's calendar."); }
  }
  useEffect(() => { load(); }, [id, range.from, range.to]);

  const filtered = events.filter((e) => `${e.key} ${e.title}`.toLowerCase().includes(search.toLowerCase()) && (!hideDone || e.statusCategory !== "done"));
  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of filtered) if (e.dueDate) m.set(e.dueDate, [...(m.get(e.dueDate) || []), e]);
    return m;
  }, [filtered]);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(range.start); d.setUTCDate(d.getUTCDate() + i); return d; });
  const shift = (n: number) => setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + n, 1)));

  async function saveView() {
    const name = await appPrompt("View name", "Calendar view");
    if (!name) return;
    const share = await appPrompt('Share with the whole organization? Type "org" to share, or leave blank to keep it just for you.', "");
    const ownershipTier = (share || "").trim().toLowerCase() === "org" ? "org" : "personal";
    await api("/ui/saved-views", { method: "POST", org: true, body: JSON.stringify({ scopeType: "project", scopeId: id, name, viewType: "calendar", filters: { search, hideDone, weeks }, ownershipTier }) });
  }

  if (!project) return <div className="project-loading">{loadError || "Loading calendar…"}{loadError && <button className="text-button" onClick={load}>Retry</button>}</div>;
  return <>
    <ProjectChrome project={project} view="calendar" onProjectChange={load} />
    <div className="view-toolbar project-toolbar">
      <button className="toolbar-button" onClick={() => setCursor(() => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)); })}>Today</button>
      <button className="toolbar-button" aria-label="Previous month" onClick={() => shift(-1)}>←</button>
      <strong className="calendar-month-label">{cursor.toLocaleString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
      <button className="toolbar-button" aria-label="Next month" onClick={() => shift(1)}>→</button>
      <button className="toolbar-button" data-on={weeks} onClick={() => setWeeks(!weeks)}>Weeks</button>
      <button className="toolbar-button" data-on={hideDone} onClick={() => setHideDone(!hideDone)}><Icon name="filter" size={15}/>{hideDone ? "Incomplete only" : "Filter"}</button>
      <button className="toolbar-button" data-on={weeks} onClick={() => setWeeks(!weeks)}><Icon name="sliders" size={15}/>Options</button>
      <label className="toolbar-search"><Icon name="search" size={15}/><UiInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks"/></label>
      <button className="toolbar-button primary-link" onClick={saveView}>Save view</button>
    </div>
    <div className={`asana-project-calendar ${weeks ? "show-weeks" : ""}`}>
      {weekdays.map((d) => <div className="asana-cal-dow" key={d}>{d}</div>)}
      {cells.map((d, i) => {
        const key = iso(d), same = d.getUTCMonth() === cursor.getUTCMonth(), evs = byDay.get(key) || [];
        return <div className={`asana-cal-cell ${same ? "" : "dim"}`} key={i}>
          <span className="asana-cal-date">{d.getUTCDate()}</span>
          {evs.slice(0, 5).map((e) => <button key={e.id} className={`asana-cal-task ${e.statusCategory === "done" ? "done" : ""}`} onClick={() => setOpenId(e.id)}><span>{e.title}</span></button>)}
          {evs.length > 5 && <span className="asana-cal-more">+{evs.length - 5} more</span>}
        </div>;
      })}
    </div>
    {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} onSaved={load}/>} 
  </>;
}
