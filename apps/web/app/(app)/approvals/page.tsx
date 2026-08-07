"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type QItem = { stageId: string; requestId: string; stageName: string; delegated: boolean };
type Slot = { id: string; approverUserId: string; delegateToUserId: string | null; decision: string | null };
type Stage = { id: string; index: number; name: string; rule: string; status: string; approvers: Slot[] };
type Detail = { request: { id: string; status: string; mode: string; round: number; workItemId: string }; stages: Stage[] };
type Ev = { id: string; type: string; data: string | null; at: string };
type Member = { userId: string; displayName?: string; email?: string };

export default function ApprovalsPage() {
  const toast = useToast();
  const [queue, setQueue] = useState<QItem[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState<Ev[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [delegateTo, setDelegateTo] = useState("");

  const loadQueue = useCallback(async () => { try { setQueue(await api<QItem[]>("/approvals/queue/me", { org: true })); } catch {} }, []);
  useEffect(() => { loadQueue(); api<Member[]>("/members", { org: true }).then((m) => setNames(Object.fromEntries(m.map((x) => [x.userId, x.displayName || x.email || x.userId.slice(0, 8)])))).catch(() => {}); }, [loadQueue]);

  const open = useCallback(async (requestId: string) => {
    setSel(requestId);
    const [d, h] = await Promise.all([api<Detail>(`/approvals/${requestId}`, { org: true }), api<Ev[]>(`/approvals/${requestId}/history`, { org: true }).catch(() => [])]);
    setDetail(d); setHistory(h); setComment("");
  }, []);

  const myPending = queue.find((q) => q.requestId === sel);
  async function decide(stageId: string, decision: "approved" | "rejected") {
    try { await api(`/approval-stages/${stageId}/decide`, { method: "POST", org: true, body: JSON.stringify({ decision, comment: comment || undefined }) });
      toast({ message: `You ${decision} this stage` }); await loadQueue(); if (sel) open(sel);
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  async function delegate(stageId: string) {
    if (!delegateTo) return;
    try { await api(`/approval-stages/${stageId}/delegate`, { method: "POST", org: true, body: JSON.stringify({ toUserId: delegateTo }) });
      toast({ message: "Delegated" }); setDelegateTo(""); await loadQueue(); if (sel) open(sel);
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  const nm = (id: string | null) => (id ? names[id] ?? id.slice(0, 8) : "");

  return (
    <>
      <h1 className="page-title">Approvals</h1>
      <div className="builder-grid">
        <div>
          {!detail && <p className="muted">Select an item from your approval queue.</p>}
          {detail && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span className={`pill ${detail.request.status}`}>{detail.request.status}</span>
                <span className="muted">{detail.request.mode} · round {detail.request.round}</span>
                <a className="btn btn-ghost" href={`/projects`} style={{ marginLeft: "auto" }}>Open item ↗</a>
              </div>
              {detail.stages.map((st) => (
                <div key={st.id} className="stagebox" data-active={st.status === "active"}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <strong>{st.index + 1}. {st.name}</strong>
                    <span className="muted">{st.rule === "all" ? "all must approve" : "any approver"} · <span className={`pill ${st.status === "approved" ? "approved" : st.status === "rejected" ? "rejected" : st.status === "active" ? "submitted" : "open"}`}>{st.status}</span></span>
                  </div>
                  {st.approvers.map((a) => (
                    <div key={a.id} className="appr-slot">
                      <span>{nm(a.approverUserId)}{a.delegateToUserId && <span className="muted"> → {nm(a.delegateToUserId)}</span>}</span>
                      <span className={`pill ${a.decision === "approved" ? "approved" : a.decision === "rejected" ? "rejected" : "open"}`}>{a.decision ?? "pending"}</span>
                    </div>
                  ))}
                  {myPending?.stageId === st.id && st.status === "active" && detail.request.status === "pending" && (
                    <div style={{ marginTop: 10 }}>
                      <input className="input" placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} style={{ marginBottom: 8 }} />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn btn-primary" onClick={() => decide(st.id, "approved")}>Approve</button>
                        <button className="btn" onClick={() => decide(st.id, "rejected")}>Reject</button>
                        <select className="input" value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)} style={{ width: 150 }}>
                          <option value="">Delegate to…</option>
                          {Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                        </select>
                        <button className="btn btn-ghost" disabled={!delegateTo} onClick={() => delegate(st.id)}>Delegate</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {history.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>History</div>
                  {history.map((e) => <div key={e.id} style={{ fontSize: 12, color: "var(--ink-2)", padding: "3px 0" }}>{new Date(e.at).toLocaleString()} — {e.type}{e.data ? ` (${e.data})` : ""}</div>)}
                </div>
              )}
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>My queue</h3>
          {queue.length === 0 && <p className="muted">Nothing awaits your decision.</p>}
          {queue.map((q) => (
            <button key={q.stageId} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel === q.requestId ? "var(--primary)" : undefined }} onClick={() => open(q.requestId)}>
              {q.stageName} {q.delegated && <span className="pill submitted" style={{ marginLeft: 4 }}>delegated</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
