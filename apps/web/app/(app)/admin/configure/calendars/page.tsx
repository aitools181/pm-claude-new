"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { Field, Input } from "../../../../../components/ui/Field";
import { useToast } from "../../../../../components/ui/Toast";

type Cal = { id: string; name: string; workingDays: number[]; timezone: string; isDefault: boolean };
const DOW = [["0", "Sun"], ["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"]];

export default function CalendarsAdmin() {
  const toast = useToast();
  const [cals, setCals] = useState<Cal[]>([]);
  const [nc, setNc] = useState({ name: "", timezone: "UTC", days: { 1: true, 2: true, 3: true, 4: true, 5: true } as Record<number, boolean> });
  const [hol, setHol] = useState<Record<string, { date: string; name: string }>>({});
  const [calc, setCalc] = useState<Record<string, { start: string; end: string; result?: number }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api<Cal[]>("/calendars", { org: true }).then(setCals).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create() {
    setMsg(null);
    const workingDays = Object.keys(nc.days).filter((d) => nc.days[+d]).map(Number);
    try { await api("/calendars", { method: "POST", org: true, body: JSON.stringify({ name: nc.name, workingDays, timezone: nc.timezone }) }); setNc({ name: "", timezone: "UTC", days: { 1: true, 2: true, 3: true, 4: true, 5: true } }); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }
  async function addHoliday(calId: string) {
    const h = hol[calId]; if (!h?.date || !h?.name) return;
    await api(`/calendars/${calId}/holidays`, { method: "POST", org: true, body: JSON.stringify(h) });
    setHol({ ...hol, [calId]: { date: "", name: "" } }); toast({ message: "Holiday added" });
  }
  async function computeDays(calId: string) {
    const c = calc[calId]; if (!c?.start || !c?.end) return;
    const res = await api<{ count: number }>(`/calendars/${calId}/working-days?start=${c.start}&end=${c.end}`, { org: true });
    setCalc({ ...calc, [calId]: { ...c, result: res.count } });
  }

  return (
    <>
      <h1 className="page-title">Working Calendars</h1>
      <p className="page-sub">Define working days and holidays; used for working-day calculations.</p>
      {msg && <div className="callout callout-danger" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className="card card-p" style={{ marginBottom: 20 }}>
        <strong>New calendar</strong>
        <div className="cfg-form" style={{ margin: "12px 0" }}>
          <Field label="Name"><Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="India (Mon–Fri)" /></Field>
          <Field label="Timezone"><Input className="mono" value={nc.timezone} onChange={(e) => setNc({ ...nc, timezone: e.target.value })} /></Field>
        </div>
        <div className="chips" style={{ marginBottom: 14 }}>
          {DOW.map(([n, label]) => <span key={n} className="chip" data-on={!!nc.days[+n]} onClick={() => setNc({ ...nc, days: { ...nc.days, [+n]: !nc.days[+n] } })}>{label}</span>)}
        </div>
        <button className="btn btn-primary" disabled={!nc.name} onClick={create}>Create calendar</button>
      </div>

      {cals.map((c) => (
        <div key={c.id} className="card card-p" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><strong>{c.name}</strong><span className="badge mono">{(c.workingDays as number[]).map((d) => DOW[d][1]).join(" ")}</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "end", marginTop: 12, flexWrap: "wrap" }}>
            <Field label="Holiday date"><Input type="date" value={hol[c.id]?.date ?? ""} onChange={(e) => setHol({ ...hol, [c.id]: { ...(hol[c.id] ?? { name: "" }), date: e.target.value } })} /></Field>
            <Field label="Name"><Input value={hol[c.id]?.name ?? ""} onChange={(e) => setHol({ ...hol, [c.id]: { ...(hol[c.id] ?? { date: "" }), name: e.target.value } })} placeholder="Diwali" /></Field>
            <button className="btn" style={{ marginBottom: 16 }} onClick={() => addHoliday(c.id)}>Add holiday</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <Field label="From"><Input type="date" value={calc[c.id]?.start ?? ""} onChange={(e) => setCalc({ ...calc, [c.id]: { ...(calc[c.id] ?? { end: "" }), start: e.target.value } })} /></Field>
            <Field label="To"><Input type="date" value={calc[c.id]?.end ?? ""} onChange={(e) => setCalc({ ...calc, [c.id]: { ...(calc[c.id] ?? { start: "" }), end: e.target.value } })} /></Field>
            <button className="btn btn-ghost" style={{ marginBottom: 16 }} onClick={() => computeDays(c.id)}>Count working days</button>
            {calc[c.id]?.result != null && <span className="badge" style={{ marginBottom: 16 }}>{calc[c.id].result} working days</span>}
          </div>
        </div>
      ))}
    </>
  );
}
