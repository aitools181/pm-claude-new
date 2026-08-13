"use client";


import { Button as UiButton } from "../../../components/ui";
import { Select as UiSelect } from "../../../components/ui";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";

type Ev = { id: string; key: string; title: string; startDate: string | null; dueDate: string | null; statusCategory: string };
type Project = { id: string; name: string };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)); });
  const [view, setView] = useState<"month" | "agenda">("month");
  const [scope, setScope] = useState<string>("mine");
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);

  const range = useMemo(() => {
    const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth();
    const gridStart = new Date(Date.UTC(y, m, 1)); gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
    const gridEnd = new Date(gridStart); gridEnd.setUTCDate(gridEnd.getUTCDate() + 41);
    return { from: iso(gridStart), to: iso(gridEnd), gridStart };
  }, [cursor]);

  useEffect(() => { api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, []);
  useEffect(() => {
    const q = scope === "mine" ? "mine=true" : `projectId=${scope}`;
    api<Ev[]>(`/calendar/range?from=${range.from}&to=${range.to}&${q}`, { org: true }).then(setEvents).catch(() => setEvents([]));
  }, [range, scope]);

  const byDay = useMemo(() => { const m = new Map<string, Ev[]>(); for (const e of events) if (e.dueDate) m.set(e.dueDate, [...(m.get(e.dueDate) ?? []), e]); return m; }, [events]);
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => { const d = new Date(range.gridStart); d.setUTCDate(d.getUTCDate() + i); return d; }), [range]);
  const monthLabel = cursor.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
  const shift = (n: number) => setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + n, 1)));

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const icsUrl = `${base}/api/v1/calendar/export.ics?from=${range.from}&to=${range.to}&${scope === "mine" ? "mine=true" : `projectId=${scope}`}`;

  return (
    <>
      <h1 className="page-title">Calendar</h1>
      <p className="page-sub">Due dates across your work; subscribe from any calendar app via ICS.</p>

      <div className="cal-toolbar">
        <UiButton variant="tertiary"  onClick={() => shift(-1)}>←</UiButton>
        <strong className="ui-static-25b0165e">{monthLabel}</strong>
        <UiButton variant="tertiary"  onClick={() => shift(1)}>→</UiButton>
        <UiButton variant="secondary"  onClick={() => setCursor(() => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)); })}>Today</UiButton>
        <span className="ui-static-97445a8d" />
        <UiSelect className="input ui-static-54f91ac4"  value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="mine">My work</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </UiSelect>
        <div className="ui-static-74cac98b">
          {(["month", "agenda"] as const).map((v) => <button key={v} className={[`btn ${view === v ? "btn-primary" : "btn-ghost"}`, "ui-static-6fedee39"].filter(Boolean).join(" ")}  onClick={() => setView(v)}>{v}</button>)}
        </div>
        <a className="btn" href={icsUrl} target="_blank" rel="noreferrer">Subscribe (ICS)</a>
      </div>

      {view === "month" && (
        <div className="cal-grid">
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((d, i) => {
            const key = iso(d), inMonth = d.getUTCMonth() === cursor.getUTCMonth(), evs = byDay.get(key) ?? [];
            return (
              <div key={i} className={`cal-cell ${inMonth ? "" : "dim"}`}>
                <div className="cal-daynum">{d.getUTCDate()}</div>
                {evs.slice(0, 4).map((e) => <div key={e.id} className={`cal-ev ${e.statusCategory === "done" ? "done" : ""}`} title={e.title}>{e.key} {e.title}</div>)}
                {evs.length > 4 && <div className="cal-daynum">+{evs.length - 4} more</div>}
              </div>
            );
          })}
        </div>
      )}

      {view === "agenda" && (
        <div className="card">
          {events.length === 0 && <div className="ui-static-cfad4427">Nothing due in this range.</div>}
          {[...events].filter((e) => e.dueDate).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1)).map((e) => (
            <div key={e.id} className="agenda-row">
              <span className="mono ui-static-63e481c4" >{e.dueDate}</span>
              <span><span className="mono ui-static-63e481c4" >{e.key}</span> {e.title}</span>
              <span className={`status-pill ${e.statusCategory === "done" ? "st-done" : e.statusCategory === "in_progress" ? "st-in_progress" : "st-todo"}`}>{e.statusCategory}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
