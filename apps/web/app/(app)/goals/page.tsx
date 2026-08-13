"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../components/ui";
import { appPrompt, appConfirm } from "../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";
import { RuntimeStyle } from "../../../components/ui/RuntimeStyle";

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
    const name = await appPrompt("Goal / objective name"); if (!name) return;
    const isObjective = await appConfirm("Is this a rollup objective (OK) or a measurable key result (Cancel)?");
    await api("/goals", { method: "POST", org: true, body: JSON.stringify(isObjective ? { name, targetType: "rollup" } : { name, targetType: "percent", currentValue: 0, targetValue: 100 }) });
    load();
  }
  async function addChild(parentId: string) {
    const name = await appPrompt("Key result name"); if (!name) return;
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
      <RuntimeStyle as="button" type="button" className="goal-row ui-reset-button runtime-indent" aria-pressed={sel === g.id} data-selected={sel === g.id || undefined} vars={{ "--runtime-indent": `${depth * 20}px` }} onClick={() => open(g.id)}>
        <span className={`dot ${g.health}`} title={g.health} />
        <span className="ui-goal-name" data-root={depth === 0 || undefined}>{g.name}</span>
        <span className="prog"><span className="prog-bar"><RuntimeStyle as="span" className="prog-fill runtime-width" data-health={g.health} vars={{ "--runtime-width": `${g.progress}%` }} /></span></span>
        <span className="mono ui-static-408657fe">{g.progress}%</span>
      </RuntimeStyle>
      {kids(g.id).map((k) => <Row key={k.id} g={k} depth={depth + 1} />)}
    </>
  );

  return (
    <>
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Goals &amp; OKRs</h1>
        <UiButton variant="primary"  onClick={create}>+ New goal</UiButton>
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
              {detail.goal.targetType === "rollup" && <UiButton variant="tertiary"  onClick={() => addChild(detail.goal.id)}>+ Add key result</UiButton>}

              {detail.goal.targetType !== "rollup" && (
                <div className="ui-static-88fa1b71">
                  <div className="muted ui-static-a42d5f9e" >Check in</div>
                  <UiInput className="input ui-static-4e420aff" type="number" placeholder={`Current ${detail.goal.unit ?? "value"}`} value={ci.currentValue} onChange={(e) => setCi({ ...ci, currentValue: e.target.value })}  />
                  <UiSelect className="input ui-static-4e420aff" value={ci.confidence} onChange={(e) => setCi({ ...ci, confidence: e.target.value })} >
                    <option value="on_track">On track</option><option value="at_risk">At risk</option><option value="off_track">Off track</option>
                  </UiSelect>
                  <UiInput className="input ui-static-fdf33f23" placeholder="Note (optional)" value={ci.note} onChange={(e) => setCi({ ...ci, note: e.target.value })}  />
                  <UiButton variant="primary" className="ui-static-0466783d" onClick={checkIn} >Record check-in</UiButton>
                </div>
              )}

              {detail.links.length > 0 && (
                <div className="ui-static-56f43562">
                  <div className="muted ui-static-86c64b5c" >Linked</div>
                  {detail.links.map((l) => <div key={l.id} className="ui-goal-link" data-redacted={l.redacted || undefined}>{l.kind}: {l.name}</div>)}
                </div>
              )}

              {detail.updates.length > 0 && (
                <div className="ui-static-56f43562">
                  <div className="muted ui-static-86c64b5c" >Update history</div>
                  {detail.updates.map((u) => <div key={u.id} className="ui-static-c85fb1c3">{new Date(u.at).toLocaleDateString()} — {u.progress}%{u.confidence ? ` · ${u.confidence.replace("_", " ")}` : ""}{u.note ? ` · ${u.note}` : ""}</div>)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
