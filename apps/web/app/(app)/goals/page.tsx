"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Goal = { id: string; parentId: string | null; name: string; targetType: string; unit: string | null; currentValue: number | null; targetValue: number | null; confidence: string; status: string; progress: number; expectedProgress: number | null; health: string };
type Link = { id: string; kind: string; name: string; redacted: boolean };
type Update = { id: string; currentValue: number | null; progress: number | null; confidence: string | null; note: string | null; at: string };
type Detail = { goal: Goal; links: Link[]; updates: Update[] };

export default function GoalsPage() {
  const toast = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ci, setCi] = useState({ currentValue: "", confidence: "on_track", note: "" });

  const load = useCallback(async () => setGoals(await api<Goal[]>("/goals", { org: true }).catch(() => [])), []);
  useEffect(() => { load(); }, [load]);
  const open = useCallback(async (id: string) => { setSel(id); setDetail(await api<Detail>(`/goals/${id}`, { org: true }).catch(() => null)); }, []);

  async function create() {
    const name = prompt("Goal / objective name"); if (!name) return;
    const isObjective = confirm("Is this a rollup objective (OK) or a measurable key result (Cancel)?");
    await api("/goals", { method: "POST", org: true, body: JSON.stringify(isObjective ? { name, targetType: "rollup" } : { name, targetType: "percent", currentValue: 0, targetValue: 100 }) });
    load();
  }
  async function addChild(parentId: string) {
    const name = prompt("Key result name"); if (!name) return;
    await api("/goals", { method: "POST", org: true, body: JSON.stringify({ name, parentId, targetType: "percent", currentValue: 0, targetValue: 100 }) });
    load(); open(parentId);
  }
  async function checkIn() {
    if (!sel) return;
    try {
      await api(`/goals/${sel}/check-in`, { method: "POST", org: true, body: JSON.stringify({ currentValue: ci.currentValue === "" ? undefined : Number(ci.currentValue), confidence: ci.confidence, note: ci.note || undefined }) });
      toast({ message: "Check-in recorded" }); setCi({ currentValue: "", confidence: "on_track", note: "" }); load(); open(sel);
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }

  const roots = goals.filter((g) => !g.parentId || !goals.find((x) => x.id === g.parentId));
  const kids = (id: string) => goals.filter((g) => g.parentId === id);

  const Row = ({ g, depth }: { g: Goal; depth: number }) => (
    <>
      <div className="goal-row" style={{ marginLeft: depth * 20, borderColor: sel === g.id ? "var(--primary)" : undefined }} onClick={() => open(g.id)}>
        <span className={`dot ${g.health}`} title={g.health} />
        <span style={{ minWidth: 160, fontWeight: depth === 0 ? 600 : 400 }}>{g.name}</span>
        <span className="prog"><div className="prog-bar"><div className="prog-fill" style={{ width: `${g.progress}%`, background: g.health === "off_track" ? "var(--danger)" : g.health === "at_risk" ? "#F5B841" : "var(--primary)" }} /></div></span>
        <span className="mono" style={{ width: 44, textAlign: "right" }}>{g.progress}%</span>
      </div>
      {kids(g.id).map((k) => <Row key={k.id} g={k} depth={depth + 1} />)}
    </>
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Goals &amp; OKRs</h1>
        <button className="btn btn-primary" onClick={create}>+ New goal</button>
      </div>
      <div className="builder-grid">
        <div>
          {goals.length === 0 && <div className="empty">No goals yet. Create an objective to start.</div>}
          {roots.map((g) => <Row key={g.id} g={g} depth={0} />)}
        </div>

        <div className="gpanel">
          {!detail && <p className="muted">Select a goal to check in and see history.</p>}
          {detail && (
            <>
              <h3>{detail.goal.name}</h3>
              <p className="muted">{detail.goal.progress}% · <span className={`h-${detail.goal.health}`}>{detail.goal.health.replace("_", " ")}</span>{detail.goal.expectedProgress != null && ` · expected ${Math.round(detail.goal.expectedProgress)}%`}</p>
              {detail.goal.targetType === "rollup" && <button className="btn btn-ghost" onClick={() => addChild(detail.goal.id)}>+ Add key result</button>}

              {detail.goal.targetType !== "rollup" && (
                <div style={{ borderTop: "1px solid var(--line)", margin: "12px 0", paddingTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Check in</div>
                  <input className="input" type="number" placeholder={`Current ${detail.goal.unit ?? "value"}`} value={ci.currentValue} onChange={(e) => setCi({ ...ci, currentValue: e.target.value })} style={{ marginBottom: 6 }} />
                  <select className="input" value={ci.confidence} onChange={(e) => setCi({ ...ci, confidence: e.target.value })} style={{ marginBottom: 6 }}>
                    <option value="on_track">On track</option><option value="at_risk">At risk</option><option value="off_track">Off track</option>
                  </select>
                  <input className="input" placeholder="Note (optional)" value={ci.note} onChange={(e) => setCi({ ...ci, note: e.target.value })} style={{ marginBottom: 8 }} />
                  <button className="btn btn-primary" onClick={checkIn} style={{ width: "100%" }}>Record check-in</button>
                </div>
              )}

              {detail.links.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Linked</div>
                  {detail.links.map((l) => <div key={l.id} style={{ fontSize: 12, padding: "2px 0", color: l.redacted ? "var(--ink-3)" : "var(--ink)" }}>{l.kind}: {l.name}</div>)}
                </div>
              )}

              {detail.updates.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Update history</div>
                  {detail.updates.map((u) => <div key={u.id} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--line)" }}>{new Date(u.at).toLocaleDateString()} — {u.progress}%{u.confidence ? ` · ${u.confidence.replace("_", " ")}` : ""}{u.note ? ` · ${u.note}` : ""}</div>)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
