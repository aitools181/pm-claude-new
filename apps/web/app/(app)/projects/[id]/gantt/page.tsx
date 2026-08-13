"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../../../components/ui";
import { appPrompt } from "../../../../../components/ui/AppDialog";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { useToast } from "../../../../../components/ui/Toast";
import { ProjectChrome } from "../../../../../components/project/ProjectChrome";
import { Icon } from "../../../../../components/ui/Icon";
import { useModalDialog } from "../../../../../components/ui/useModalDialog";

type Row = { id: string; key: string; title: string; parentId: string | null; isParent: boolean; start: string | null; end: string | null; critical: boolean; slack: number };
type SchedItem = { id: string; scheduleMode: string; es: string; ef: string; slack: number; critical: boolean };
type Edge = { id: string; from: string; to: string };
type Baseline = { id: string; name: string; createdAt: string };
type Variance = { itemId: string; baselineStart: string | null; baselineDue: string | null; startVarianceDays: number | null };
type Project = { id:string; name:string; keyPrefix:string; color?:string; health:string; status:string; privacy:string; version:number; description?:string|null; startDate?:string|null; dueDate?:string|null };
type Change = { itemId: string; key: string; title: string; oldStart: string | null; oldDue: string | null; newStart: string; newDue: string; changed: boolean; manualConflict: boolean; redacted: boolean };

const day = 86_400_000;
const parse = (s: string) => new Date(s + "T00:00:00Z").getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export default function GanttPage() {
  const id = useParams().id as string;
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [sched, setSched] = useState<Record<string, SchedItem>>({});
  const [edges, setEdges] = useState<Edge[]>([]);
  const [pxPerDay, setPxPerDay] = useState(20);
  const [sel, setSel] = useState<Row | null>(null);
  const [selMeta, setSelMeta] = useState<{ version: number; scheduleMode: string; durationDays: number | null } | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [preview, setPreview] = useState<{ changes: Change[]; changedCount: number; conflicts: number } | null>(null);
  const [lastOp, setLastOp] = useState<{ id: string; applied: number } | null>(null);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [variance, setVariance] = useState<Record<string, Variance>>({});
  const previewDialogRef = useModalDialog<HTMLDivElement>(Boolean(preview), () => setPreview(null));

  const load = useCallback(async () => {
    const [p, g, s, dep, bl] = await Promise.all([
      api<Project>(`/projects/${id}`, { org: true }),
      api<Row[]>(`/projects/${id}/gantt`, { org: true }).catch(() => []),
      api<{ items: SchedItem[] }>(`/projects/${id}/schedule`, { org: true }).catch(() => ({ items: [] })),
      api<{ edges: Edge[] }>(`/projects/${id}/dependency-graph`, { org: true }).catch(() => ({ edges: [] })),
      api<Baseline[]>(`/projects/${id}/baselines`, { org: true }).catch(() => []),
    ]);
    setProject(p); setRows(g); setSched(Object.fromEntries(s.items.map((i) => [i.id, i]))); setEdges(dep.edges); setBaselines(bl);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!baselineId) { setVariance({}); return; }
    api<Variance[]>(`/projects/${id}/baselines/${baselineId}/variance`, { org: true })
      .then((v) => setVariance(Object.fromEntries(v.map((x) => [x.itemId, x])))).catch(() => setVariance({}));
  }, [baselineId, id]);

  async function selectItem(r: Row) {
    setSel(r); setMoveTo(r.start ?? ""); setSelMeta(null);
    try { const it = await api<any>(`/work-items/${r.id}`, { org: true }); setSelMeta({ version: it.version, scheduleMode: it.scheduleMode ?? "manual", durationDays: it.durationDays ?? null }); } catch {}
  }
  async function setMode(mode: string) {
    if (!sel || !selMeta) return;
    await api(`/work-items/${sel.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: selMeta.version, patch: { scheduleMode: mode } }) });
    toast({ message: `Schedule mode: ${mode}` }); await load(); selectItem(sel);
  }
  async function setDuration(dv: string) {
    if (!sel || !selMeta) return;
    const durationDays = dv ? Number(dv) : null;
    await api(`/work-items/${sel.id}`, { method: "PATCH", org: true, body: JSON.stringify({ version: selMeta.version, patch: { durationDays } }) });
    await load(); selectItem(sel);
  }
  async function runPreview() {
    if (!sel || !moveTo) return;
    try { setPreview(await api(`/work-items/${sel.id}/reschedule/preview`, { method: "POST", org: true, body: JSON.stringify({ newStart: moveTo }) })); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Preview failed" }); }
  }
  async function confirmReschedule() {
    if (!sel || !moveTo) return;
    try { const res = await api<{ operationId: string; applied: number }>(`/work-items/${sel.id}/reschedule/confirm`, { method: "POST", org: true, body: JSON.stringify({ newStart: moveTo }) });
      setPreview(null); setLastOp(res.operationId ? { id: res.operationId, applied: res.applied } : null); toast({ message: `Rescheduled ${res.applied} item(s)` }); load();
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  async function undo() {
    if (!lastOp) return;
    await api(`/reschedule/${lastOp.id}/undo`, { method: "POST", org: true }); toast({ message: "Reschedule undone" }); setLastOp(null); load();
  }
  async function captureBaseline() {
    const name = await appPrompt("Baseline name", `Baseline ${new Date().toLocaleDateString()}`); if (!name) return;
    const b = await api<{ id: string }>(`/projects/${id}/baselines`, { method: "POST", org: true, body: JSON.stringify({ name }) });
    toast({ message: "Baseline captured" }); const bl = await api<Baseline[]>(`/projects/${id}/baselines`, { org: true }); setBaselines(bl); setBaselineId(b.id);
  }

  const depth = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r])); const dcache = new Map<string, number>();
    const dp = (r: Row): number => { if (dcache.has(r.id)) return dcache.get(r.id)!; const d = r.parentId && byId.get(r.parentId) ? dp(byId.get(r.parentId)!) + 1 : 0; dcache.set(r.id, d); return d; };
    return (r: Row) => dp(r);
  }, [rows]);

  const model = useMemo(() => {
    const dated = rows.filter((r) => r.start && r.end);
    const allStarts = dated.map((r) => parse(r.start!)); const allEnds = dated.map((r) => parse(r.end!));
    Object.values(variance).forEach((v) => { if (v.baselineStart) allStarts.push(parse(v.baselineStart)); if (v.baselineDue) allEnds.push(parse(v.baselineDue)); });
    if (allStarts.length === 0) return null;
    const min = Math.min(...allStarts), max = Math.max(...allEnds);
    const leftPad = 230, rowH = 30, top = 44;
    const xOf = (t: number) => leftPad + ((t - min) / day) * pxPerDay;
    const rowIndex = new Map(rows.map((r, i) => [r.id, i]));
    const width = xOf(max) + 60, height = top + rows.length * rowH + 20;
    const months: { x: number; label: string }[] = []; const dt = new Date(min); dt.setUTCDate(1);
    while (dt.getTime() <= max + 31 * day) { months.push({ x: xOf(dt.getTime()), label: dt.toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" }) }); dt.setUTCMonth(dt.getUTCMonth() + 1); }
    return { min, max, leftPad, rowH, top, xOf, rowIndex, width, height, months, todayX: xOf(Date.now()) };
  }, [rows, variance, pxPerDay]);

  return (
    <>
      {project && <ProjectChrome project={project} view="gantt" onProjectChange={load} />}
      <div className="view-toolbar project-toolbar"><button className="toolbar-button" disabled={!model} onClick={()=>{const el=document.querySelector<HTMLElement>('.gantt-wrap');if(el&&model)el.scrollTo({left:Math.max(0,model.todayX-el.clientWidth/2),behavior:'smooth'})}}>Today</button><UiSelect className="toolbar-select" value={baselineId} onChange={(e) => setBaselineId(e.target.value)}><option value="">No baseline</option>{baselines.map((base)=><option key={base.id} value={base.id}>{base.name}</option>)}</UiSelect><button className="toolbar-button" onClick={captureBaseline}>Capture baseline</button><button className="toolbar-button" aria-label="Zoom out timeline" onClick={() => setPxPerDay((p) => Math.max(6, p - 4))}>−</button><button className="toolbar-button" aria-label="Zoom in timeline" onClick={() => setPxPerDay((p) => Math.min(56, p + 4))}>+</button></div>

      {lastOp && <div className="undo-banner"><span>Rescheduled {lastOp.applied} item(s).</span><UiButton variant="tertiary"  onClick={undo}>Undo</UiButton></div>}
      <div className="legend">
        <span><span className="sw ui-static-047b234a"  />Critical path</span>
        <span><span className="sw ui-static-1eab90a5"  />On schedule</span>
        <span><span className="sw ui-static-a5da49b6"  />Slack</span>
        {baselineId && <span><span className="sw ui-static-cf8a9074"  />Baseline</span>}
      </div>

      <div className="gantt-layout">
        <div className="gantt-wrap">
          {!model && <div className="empty ui-static-ddaf9ee3" >No scheduled items yet. Set start/due dates or durations.</div>}
          {model && (
            <svg width={model.width} height={model.height} className="ui-static-2a1b75c9">
              <defs><marker id="gtarrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="var(--ink-3)" /></marker></defs>
              {model.months.map((m, i) => (<g key={i}><line className="gt-grid" x1={m.x} y1={model.top - 12} x2={m.x} y2={model.height - 8} /><text className="gt-month" x={m.x + 3} y={model.top - 16}>{m.label}</text></g>))}
              <line className="gt-today" x1={model.todayX} y1={model.top - 12} x2={model.todayX} y2={model.height - 8} />
              {edges.map((e) => {
                const a = rows.find((r) => r.id === e.from), b = rows.find((r) => r.id === e.to);
                if (!a?.end || !b?.start) return null;
                const ai = model.rowIndex.get(e.from)!, bi = model.rowIndex.get(e.to)!;
                const ax = model.xOf(parse(a.end)) + 2, ay = model.top + ai * model.rowH + 15;
                const bx = model.xOf(parse(b.start)), by = model.top + bi * model.rowH + 15;
                return <path key={e.id} className="gt-dep" d={`M${ax},${ay} C${ax + 16},${ay} ${bx - 16},${by} ${bx},${by}`} />;
              })}
              {rows.map((r, i) => {
                const y = model.top + i * model.rowH; const ind = Math.min(depth(r), 6) * 14;
                const v = variance[r.id];
                const hasBar = r.start && r.end;
                const x1 = hasBar ? model.xOf(parse(r.start!)) : 0;
                const x2 = hasBar ? model.xOf(parse(r.end!)) : 0;
                const slackW = !r.isParent && r.slack > 0 ? r.slack * pxPerDay : 0;
                return (
                  <g key={r.id}>
                    <text className="gt-row-key" x={10 + ind} y={y + 15}>{r.key}</text>
                    <text className="gt-row-label" x={54 + ind} y={y + 15}>{r.title.slice(0, 16)}</text>
                    {v?.baselineStart && v?.baselineDue && (
                      <rect className="gt-baseline" x={model.xOf(parse(v.baselineStart))} y={y + 20} width={Math.max(3, model.xOf(parse(v.baselineDue)) - model.xOf(parse(v.baselineStart)))} height={5} />
                    )}
                    {hasBar && slackW > 0 && <rect className="gt-slack" x={x2} y={y + 5} width={slackW} height={13} />}
                    {hasBar && (r.isParent
                      ? <rect className="gt-parent" x={x1} y={y + 8} width={Math.max(4, x2 - x1)} height={6} rx={2} />
                      : <rect className={`gt-bar ${r.critical ? "crit" : "norm"} ${sel?.id === r.id ? "sel" : ""}`} x={x1} y={y + 5} width={Math.max(6, x2 - x1)} height={14} onClick={() => selectItem(r)} />)}
                    {v && v.startVarianceDays != null && v.startVarianceDays !== 0 && (
                      <text x={(hasBar ? x2 : model.leftPad) + slackW + 6} y={y + 16} fontSize="10" fill={v.startVarianceDays > 0 ? "var(--danger)" : "var(--success)"}>{v.startVarianceDays > 0 ? `+${v.startVarianceDays}d` : `${v.startVarianceDays}d`}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <div className="gpanel">
          {!sel && <p className="muted">Select a task bar to see details, change its schedule mode, or reschedule it (with a cascade preview).</p>}
          {sel && (
            <>
              <h3><span className="mono ui-static-e449b31d" >{sel.key}</span> {sel.title}</h3>
              <p className="muted">{sel.critical ? "On the critical path" : `Slack: ${sel.slack} working day(s)`}</p>

              <div className="ui-static-72373b55">
                <div className="muted ui-static-2e003268" >Schedule mode</div>
                <div className="seg">
                  <button data-on={selMeta?.scheduleMode === "manual"} onClick={() => setMode("manual")}>Manual</button>
                  <button data-on={selMeta?.scheduleMode === "auto"} onClick={() => setMode("auto")}>Auto</button>
                </div>
              </div>
              <div className="ui-static-72373b55">
                <div className="muted ui-static-2e003268" >Duration (working days)</div>
                <UiInput className="input ui-static-465bfea3" type="number" min={1} defaultValue={selMeta?.durationDays ?? ""} placeholder="from dates"
                  onBlur={(e) => e.target.value !== String(selMeta?.durationDays ?? "") && setDuration(e.target.value)}  />
              </div>

              <div className="ui-static-1304b640">
                <div className="muted ui-static-2e003268" >Reschedule start to</div>
                <div className="ui-static-a76d597a">
                  <UiInput className="input" type="date" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
                  <UiButton variant="primary"  disabled={!moveTo} onClick={runPreview}>Preview</UiButton>
                </div>
                <p className="muted ui-static-fe7b4979" >Preview shows the cascade before anything is saved.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {preview && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div ref={previewDialogRef} tabIndex={-1} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reschedule-impact-title">
            <h2 id="reschedule-impact-title" className="page-title ui-static-4ff818ff" >Reschedule impact</h2>
            <p className="page-sub">{preview.changedCount} item(s) would move{preview.conflicts > 0 ? ` · ${preview.conflicts} manual conflict(s)` : ""}. Nothing is saved until you confirm.</p>
            <div className="ui-static-f4e719ae">
              {preview.changes.length === 0 && <div className="muted">No downstream changes.</div>}
              {preview.changes.map((c) => (
                <div key={c.itemId} className={`diff-row ${c.manualConflict ? "conflict" : ""}`}>
                  <span className="mono ui-static-63e481c4" >{c.key}</span>
                  <span>{c.title}{c.manualConflict && <span className="badge ui-static-c0a41888" >manual conflict</span>}</span>
                  <span><span className="old">{c.oldStart ?? "—"}</span> <span className="new">→ {c.manualConflict ? "needs " + c.newStart : c.newStart}</span></span>
                </div>
              ))}
            </div>
            <div className="ui-static-f5df2830">
              <UiButton variant="secondary"  onClick={() => setPreview(null)}>Cancel</UiButton>
              <UiButton variant="primary"  onClick={confirmReschedule} disabled={preview.changedCount === 0}>Confirm & apply</UiButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
