"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput } from "../../../components/ui";
import { useEffect, useState, useCallback, useRef } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Timer = { id: string; startedAt: string; description: string | null } | null;
type Entry = { id: string; date: string; minutes: number; description: string | null; source: string };
type Sheet = { sheet: { status: string }; weekStart: string; weekEnd: string; totalMinutes: number; byDay: Record<string, number>; entries: Entry[] };

const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
const mondayOf = (d: Date) => { const x = new Date(d); const dow = x.getUTCDay(); x.setUTCDate(x.getUTCDate() + (dow === 0 ? -6 : 1 - dow)); return x.toISOString().slice(0, 10); };
const addDays = (s: string, n: number) => { const x = new Date(s + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TimePage() {
  const toast = useToast();
  const [timer, setTimer] = useState<Timer>(null);
  const [elapsed, setElapsed] = useState(0);
  const [desc, setDesc] = useState("");
  const [week, setWeek] = useState(mondayOf(new Date()));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [form, setForm] = useState({ date: "", minutes: "", description: "" });
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTimer = useCallback(async () => { try { setTimer(await api<Timer>("/timer", { org: true })); } catch { setTimer(null); } }, []);
  const loadSheet = useCallback(async () => { try { setSheet(await api<Sheet>(`/timesheet?week=${week}`, { org: true })); } catch (e) { if (e instanceof ApiError) toast({ message: e.message }); } }, [week, toast]);
  useEffect(() => { loadTimer(); }, [loadTimer]);
  useEffect(() => { loadSheet(); setForm((f) => ({ ...f, date: f.date || week })); }, [loadSheet, week]);

  useEffect(() => {
    if (tick.current) clearInterval(tick.current);
    if (timer) { const base = new Date(timer.startedAt).getTime(); const upd = () => setElapsed(Math.floor((Date.now() - base) / 1000)); upd(); tick.current = setInterval(upd, 1000); }
    else setElapsed(0);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [timer]);

  const fmtElapsed = `${String(Math.floor(elapsed / 3600)).padStart(2, "0")}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const locked = sheet && ["submitted", "approved", "locked"].includes(sheet.sheet.status);

  async function start() { await api("/timer/start", { method: "POST", org: true, body: JSON.stringify({ description: desc || undefined }) }); setDesc(""); loadTimer(); }
  async function stop() { await api("/timer/stop", { method: "POST", org: true }); toast({ message: "Time logged" }); loadTimer(); loadSheet(); }
  async function discard() { await api("/timer/discard", { method: "POST", org: true }); loadTimer(); }
  async function addEntry() {
    const minutes = Number(form.minutes); if (!form.date || !minutes) return;
    try { await api("/time-entries", { method: "POST", org: true, body: JSON.stringify({ date: form.date, minutes, description: form.description || undefined }) }); setForm({ date: week, minutes: "", description: "" }); loadSheet(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  async function del(id: string) { try { await api(`/time-entries/${id}`, { method: "DELETE", org: true }); loadSheet(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
  async function submit() { try { await api("/timesheet/submit", { method: "POST", org: true, body: JSON.stringify({ week }) }); toast({ message: "Timesheet submitted" }); loadSheet(); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }

  return (
    <>
      <h1 className="page-title">Time</h1>

      <div className="timer-card">
        <span className={`timer-dot ${timer ? "on" : ""}`} />
        {timer ? (
          <>
            <span className="timer-elapsed">{fmtElapsed}</span>
            <span className="muted ui-static-97445a8d" >{timer.description || "Running…"}</span>
            <UiButton variant="primary"  onClick={stop}>Stop &amp; log</UiButton>
            <UiButton variant="tertiary"  onClick={discard}>Discard</UiButton>
          </>
        ) : (
          <>
            <UiInput className="input ui-static-97445a8d" placeholder="What are you working on?" value={desc} onChange={(e) => setDesc(e.target.value)}  />
            <UiButton variant="primary"  onClick={start}>Start timer</UiButton>
          </>
        )}
      </div>

      <div className="wk-nav">
        <UiButton variant="tertiary"  onClick={() => setWeek(addDays(week, -7))}>←</UiButton>
        <strong>{week} → {sheet?.weekEnd ?? addDays(week, 6)}</strong>
        <UiButton variant="tertiary"  onClick={() => setWeek(addDays(week, 7))}>→</UiButton>
        {sheet && <span className={`pill ${sheet.sheet.status}`}>{sheet.sheet.status}</span>}
        <span className="ui-static-97445a8d" />
        <strong>{hm(sheet?.totalMinutes ?? 0)}</strong>
        {!locked && sheet && sheet.totalMinutes > 0 && <UiButton variant="primary"  onClick={submit}>Submit week</UiButton>}
      </div>

      <div className="ui-static-d0aeaad8">
        {DAYS.map((d, i) => { const date = addDays(week, i); const min = sheet?.byDay[date] ?? 0; return (
          <div key={d} className="ui-static-7aace258">
            <div className="muted ui-static-11a50812" >{d}</div><div className="ui-static-160b0675">{min ? hm(min) : "—"}</div>
          </div>); })}
      </div>

      {!locked && (
        <div className="ui-static-ec99483c">
          <div><div className="muted ui-static-6cb285c6" >Date</div><UiInput className="input" type="date" min={week} max={addDays(week, 6)} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><div className="muted ui-static-6cb285c6" >Minutes</div><UiInput className="input ui-static-581be415" type="number" min={1} placeholder="60" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })}  /></div>
          <UiInput className="input ui-static-97445a8d" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}  />
          <UiButton variant="secondary"  onClick={addEntry}>Add entry</UiButton>
        </div>
      )}

      <table className="ts-grid">
        <thead><tr><th>Date</th><th>Duration</th><th>Description</th><th>Source</th><th></th></tr></thead>
        <tbody>
          {sheet?.entries.length === 0 && <tr><td colSpan={5} className="muted">No time logged this week.</td></tr>}
          {sheet?.entries.map((e) => (
            <tr key={e.id}>
              <td className="mono">{e.date}</td><td>{hm(e.minutes)}</td><td>{e.description || "—"}</td>
              <td><span className="muted">{e.source}</span></td>
              <td className="ui-static-54c2afb7">{!locked && <UiButton variant="tertiary"  onClick={() => del(e.id)}>Delete</UiButton>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
