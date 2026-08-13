"use client";

import { Input as UiInput } from "../../../components/ui";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { RuntimeStyle } from "../../../components/ui/RuntimeStyle";

type WL = { userId: string; workingDays: number; holidayDays: number; leaveDays: number; netCapacityMin: number; allocatedMin: number; estimatedWorkMin: number; unestimatedItems: number; utilizationPct: number; overAllocated: boolean };
type Member = { userId: string; displayName?: string; email?: string };

const h = (m: number) => `${(m / 60).toFixed(1)}h`;
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); };
const monthEnd = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };

export default function WorkloadPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [rows, setRows] = useState<WL[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<"team" | "me">("team");

  const load = useCallback(async () => {
    try {
      const [team, members] = await Promise.all([
        api<WL[]>(`/workload/team?from=${from}&to=${to}`, { org: true }),
        api<Member[]>("/members", { org: true }).catch(() => []),
      ]);
      setRows(team); setScope("team");
      setNames(Object.fromEntries(members.map((m) => [m.userId, m.displayName || m.email || m.userId.slice(0, 8)])));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { const me = await api<WL>(`/me/workload?from=${from}&to=${to}`, { org: true }); setRows([me]); setScope("me"); }
    }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <h1 className="page-title">Workload</h1>
      <p className="page-sub">{scope === "me" ? "Your capacity and allocation." : "Team capacity, leave and allocation over a period."}</p>
      <div className="wk-nav">
        <span className="muted">From</span><UiInput className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted">To</span><UiInput className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="ui-static-d3a18013">
        <div className="wl-row ui-static-8510ee31" >
          <span>Member</span><span>Allocation vs net capacity</span><span className="ui-static-54c2afb7">Utilization</span>
        </div>
        {rows.length === 0 && <div className="muted ui-static-21568317" >No data for this range.</div>}
        {rows.map((r) => (
          <div key={r.userId} className="wl-row">
            <div>
              <div className="ui-static-02a2d333">{names[r.userId] ?? r.userId.slice(0, 8)}</div>
              <div className="muted ui-static-11a50812" >{r.workingDays}d · {h(r.netCapacityMin)} net{r.leaveDays ? ` · ${r.leaveDays}d leave` : ""}{r.holidayDays ? ` · ${r.holidayDays} hol` : ""}</div>
            </div>
            <div>
              <div className="util-bar"><RuntimeStyle className={`util-fill runtime-width ${r.overAllocated ? "over" : ""}`} vars={{ "--runtime-width": `${Math.min(100, r.utilizationPct)}%` }} /></div>
              <div className="muted ui-static-65480ca8" >
                {h(r.allocatedMin)} allocated · est {h(r.estimatedWorkMin)}
                {r.unestimatedItems > 0 && <span className="ui-static-497726e8"> · {r.unestimatedItems} unestimated</span>}
              </div>
            </div>
            <div className="ui-util-value" data-over={r.overAllocated || undefined}>{r.utilizationPct}%</div>
          </div>
        ))}
      </div>
    </>
  );
}
