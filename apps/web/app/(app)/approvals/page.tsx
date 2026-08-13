"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../components/ui";
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
              <div className="ui-static-8d446200">
                <span className={`pill ${detail.request.status}`}>{detail.request.status}</span>
                <span className="muted">{detail.request.mode} · round {detail.request.round}</span>
                <a className="btn btn-ghost ui-static-6d000617" href={`/projects`} >Open item ↗</a>
              </div>
              {detail.stages.map((st) => (
                <div key={st.id} className="stagebox" data-active={st.status === "active"}>
                  <div className="ui-static-dd15bb92">
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
                    <div className="ui-static-d2c171b1">
                      <UiInput className="input ui-static-fdf33f23" placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)}  />
                      <div className="ui-static-3de8f987">
                        <UiButton variant="primary"  onClick={() => decide(st.id, "approved")}>Approve</UiButton>
                        <UiButton variant="secondary"  onClick={() => decide(st.id, "rejected")}>Reject</UiButton>
                        <UiSelect className="input ui-static-7c07cdf8" value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)} >
                          <option value="">Delegate to…</option>
                          {Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                        </UiSelect>
                        <UiButton variant="tertiary"  disabled={!delegateTo} onClick={() => delegate(st.id)}>Delegate</UiButton>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {history.length > 0 && (
                <div className="ui-static-d6f2af6e">
                  <div className="muted ui-static-a42d5f9e" >History</div>
                  {history.map((e) => <div key={e.id} className="ui-static-0936530b">{new Date(e.at).toLocaleString()} — {e.type}{e.data ? ` (${e.data})` : ""}</div>)}
                </div>
              )}
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>My queue</h3>
          {queue.length === 0 && <p className="muted">Nothing awaits your decision.</p>}
          {queue.map((q) => (
            <UiButton variant="tertiary" key={q.stageId} className="ui-selection-row" data-selected={sel === q.requestId || undefined} onClick={() => open(q.requestId)}>
              {q.stageName} {q.delegated && <span className="pill submitted ui-static-46cec891" >delegated</span>}
            </UiButton>
          ))}
        </div>
      </div>
    </>
  );
}
