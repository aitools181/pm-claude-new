"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput } from "../../../../components/ui";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Sub = { id: string; url: string; events: string[]; active: boolean; secretMasked: string };
type Delivery = { id: string; eventType: string; status: string; attempt: number; error: string | null; createdAt: string };
const EVENTS = ["work_item.created", "work_item.updated", "work_item.deleted"];

export default function WebhooksPage() {
  const toast = useToast();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [dels, setDels] = useState<Delivery[]>([]);
  const [form, setForm] = useState({ url: "", events: ["work_item.created"] as string[] });

  const load = useCallback(async () => setSubs(await api<Sub[]>("/webhooks", { org: true }).catch(() => [])), []);
  useEffect(() => { load(); }, [load]);
  const openDeliveries = useCallback(async (id: string) => { setSel(id); setDels(await api<Delivery[]>(`/webhooks/${id}/deliveries`, { org: true }).catch(() => [])); }, []);

  async function create() {
    if (!form.url || form.events.length === 0) { toast({ message: "URL + at least one event" }); return; }
    try { await api("/webhooks", { method: "POST", org: true, body: JSON.stringify(form) }); setForm({ url: "", events: ["work_item.created"] }); load(); toast({ message: "Subscription created" }); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  async function toggle(s: Sub) { await api(`/webhooks/${s.id}/active`, { method: "POST", org: true, body: JSON.stringify({ active: !s.active }) }); load(); }
  async function emit() { if (!sel) return; const s = subs.find((x) => x.id === sel); await api("/webhooks/emit", { method: "POST", org: true, body: JSON.stringify({ eventType: s?.events[0] ?? "work_item.created", payload: { test: true, at: new Date().toISOString() } }) }); toast({ message: "Test event emitted" }); openDeliveries(sel); }
  async function retry(id: string) { try { await api(`/webhooks/deliveries/${id}/retry`, { method: "POST", org: true }); if (sel) openDeliveries(sel); } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); } }
  async function replay(id: string) { await api(`/webhooks/deliveries/${id}/replay`, { method: "POST", org: true }); if (sel) openDeliveries(sel); toast({ message: "Replayed" }); }

  return (
    <>
      <h1 className="page-title">Webhooks</h1>
      <p className="page-sub">Signed event deliveries with retries and replay. Signing secrets are shown masked.</p>
      <div className="builder-grid">
        <div>
          {subs.map((s) => (
            <div key={s.id} className="fieldcard">
              <div className="ui-static-13313b1a">
                <span><strong>{s.url}</strong> <span className="pill open ui-static-391ef124" >{s.active ? "active" : "paused"}</span></span>
                <span className="ui-static-49cd0921"><UiButton variant="tertiary"  onClick={() => toggle(s)}>{s.active ? "Pause" : "Resume"}</UiButton><UiButton variant="tertiary"  onClick={() => openDeliveries(s.id)}>Deliveries</UiButton></span>
              </div>
              <div className="muted ui-static-70179e30" >{s.events.join(", ")} · secret {s.secretMasked}</div>
              {sel === s.id && (
                <div className="ui-static-03bfdfb1">
                  <div className="ui-static-a3d12b9b"><span className="muted ui-static-6cb285c6" >Recent deliveries</span><UiButton variant="tertiary"  onClick={emit}>Send test</UiButton></div>
                  {dels.length === 0 && <p className="muted ui-static-6cb285c6" >No deliveries yet.</p>}
                  {dels.map((dl) => (
                    <div key={dl.id} className="ui-static-b9d36068">
                      <span>{dl.eventType} · <span className={dl.status === "delivered" ? "h-on_track" : dl.status === "failed" ? "h-off_track" : "h-at_risk"}>{dl.status}</span> · attempt {dl.attempt}</span>
                      <span className="ui-static-74cac98b">
                        {(dl.status === "failed" || dl.status === "retry_scheduled") && <UiButton variant="tertiary" className="ui-static-7c699c10"  onClick={() => retry(dl.id)}>Retry</UiButton>}
                        <UiButton variant="tertiary" className="ui-static-7c699c10"  onClick={() => replay(dl.id)}>Replay</UiButton>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {subs.length === 0 && <div className="empty">No webhook subscriptions yet.</div>}
        </div>
        <div className="gpanel">
          <h3>New subscription</h3>
          <UiInput className="input ui-static-fdf33f23" placeholder="https://example.com/hook" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}  />
          <div className="ui-static-fdf33f23">{EVENTS.map((ev) => <label key={ev} className="ui-static-277e3db9"><input type="checkbox" checked={form.events.includes(ev)} onChange={(e) => setForm({ ...form, events: e.target.checked ? [...form.events, ev] : form.events.filter((x) => x !== ev) })} /> {ev}</label>)}</div>
          <UiButton variant="primary" className="ui-static-0466783d" onClick={create} >Create</UiButton>
        </div>
      </div>
    </>
  );
}
