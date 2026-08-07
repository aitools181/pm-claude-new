"use client";
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span><strong>{s.url}</strong> <span className="pill open" style={{ marginLeft: 6 }}>{s.active ? "active" : "paused"}</span></span>
                <span style={{ display: "flex", gap: 6 }}><button className="btn btn-ghost" onClick={() => toggle(s)}>{s.active ? "Pause" : "Resume"}</button><button className="btn btn-ghost" onClick={() => openDeliveries(s.id)}>Deliveries</button></span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{s.events.join(", ")} · secret {s.secretMasked}</div>
              {sel === s.id && (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted" style={{ fontSize: 12 }}>Recent deliveries</span><button className="btn btn-ghost" onClick={emit}>Send test</button></div>
                  {dels.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No deliveries yet.</p>}
                  {dels.map((dl) => (
                    <div key={dl.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" }}>
                      <span>{dl.eventType} · <span className={dl.status === "delivered" ? "h-on_track" : dl.status === "failed" ? "h-off_track" : "h-at_risk"}>{dl.status}</span> · attempt {dl.attempt}</span>
                      <span style={{ display: "flex", gap: 4 }}>
                        {(dl.status === "failed" || dl.status === "retry_scheduled") && <button className="btn btn-ghost" style={{ padding: "0 6px" }} onClick={() => retry(dl.id)}>Retry</button>}
                        <button className="btn btn-ghost" style={{ padding: "0 6px" }} onClick={() => replay(dl.id)}>Replay</button>
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
          <input className="input" placeholder="https://example.com/hook" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={{ marginBottom: 8 }} />
          <div style={{ marginBottom: 8 }}>{EVENTS.map((ev) => <label key={ev} style={{ display: "block", fontSize: 13 }}><input type="checkbox" checked={form.events.includes(ev)} onChange={(e) => setForm({ ...form, events: e.target.checked ? [...form.events, ev] : form.events.filter((x) => x !== ev) })} /> {ev}</label>)}</div>
          <button className="btn btn-primary" onClick={create} style={{ width: "100%" }}>Create</button>
        </div>
      </div>
    </>
  );
}
