"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Meeting = { id: string; title: string; status: string; scheduledAt: string | null; notes: string | null };
type Agenda = { id: string; title: string; position: number };
type Decision = { id: string; text: string };
type Attendance = { id: string; userId: string; status: string };
type Action = { id: string; title: string; assigneeUserId: string | null; dueDate: string | null; status: string; workItemId: string | null };
type Detail = { meeting: Meeting; agenda: Agenda[]; decisions: Decision[]; attendance: Attendance[]; actions: Action[] };
type Member = { userId: string; displayName?: string; email?: string };
type Project = { id: string; name: string };

export default function MeetingsPage() {
  const toast = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState({ title: "", assigneeUserId: "", dueDate: "", projectId: "" });

  const load = useCallback(async () => setMeetings(await api<Meeting[]>("/meetings", { org: true }).catch(() => [])), []);
  useEffect(() => {
    load();
    api<Member[]>("/members", { org: true }).then((m) => setNames(Object.fromEntries(m.map((x) => [x.userId, x.displayName || x.email || x.userId.slice(0, 8)])))).catch(() => {});
    api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {});
  }, [load]);
  const open = useCallback(async (id: string) => { const dd = await api<Detail>(`/meetings/${id}`, { org: true }).catch(() => null); setSel(id); setD(dd); setNotes(dd?.meeting.notes ?? ""); }, []);

  async function createMeeting() { const t = prompt("Meeting title"); if (!t) return; const m = await api<Meeting>("/meetings", { method: "POST", org: true, body: JSON.stringify({ title: t, scheduledAt: new Date().toISOString() }) }); await load(); open(m.id); }
  async function saveNotes() { if (!sel) return; await api(`/meetings/${sel}/notes`, { method: "PUT", org: true, body: JSON.stringify({ notes }) }); toast({ message: "Notes saved" }); }
  async function addAgenda() { if (!sel) return; const t = prompt("Agenda item"); if (!t) return; await api(`/meetings/${sel}/agenda`, { method: "POST", org: true, body: JSON.stringify({ title: t, position: (d?.agenda.length ?? 0) + 1 }) }); open(sel); }
  async function addDecision() { if (!sel) return; const t = prompt("Decision"); if (!t) return; await api(`/meetings/${sel}/decisions`, { method: "POST", org: true, body: JSON.stringify({ text: t }) }); open(sel); }
  async function setAtt(userId: string, status: string) { if (!sel) return; await api(`/meetings/${sel}/attendance`, { method: "POST", org: true, body: JSON.stringify({ userId, status }) }); open(sel); }
  async function addAction() {
    if (!sel || !action.title) return;
    await api(`/meetings/${sel}/actions`, { method: "POST", org: true, body: JSON.stringify({ title: action.title, assigneeUserId: action.assigneeUserId || undefined, dueDate: action.dueDate || undefined }) });
    setAction({ title: "", assigneeUserId: "", dueDate: "", projectId: action.projectId }); open(sel);
  }
  async function convert(a: Action) {
    if (!action.projectId) { toast({ message: "Pick a project for the task" }); return; }
    try { await api(`/meeting-actions/${a.id}/convert`, { method: "POST", org: true, body: JSON.stringify({ projectId: action.projectId }) }); toast({ message: "Converted to work item" }); open(sel!); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Meetings</h1>
        <button className="btn btn-primary" onClick={createMeeting}>+ New meeting</button>
      </div>
      <div className="builder-grid">
        <div>
          {!d && <p className="muted">Select a meeting.</p>}
          {d && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>{d.meeting.title}</h3>
                <span className={`pill ${d.meeting.status === "held" ? "approved" : d.meeting.status === "cancelled" ? "rejected" : "submitted"}`}>{d.meeting.status}</span>
              </div>

              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><h4 style={{ fontSize: 13 }}>Agenda</h4><button className="btn btn-ghost" onClick={addAgenda}>+ Add</button></div>
                  {d.agenda.map((a) => <div key={a.id} style={{ fontSize: 13, padding: "3px 0" }}>{a.position}. {a.title}</div>)}

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}><h4 style={{ fontSize: 13 }}>Decisions</h4><button className="btn btn-ghost" onClick={addDecision}>+ Add</button></div>
                  {d.decisions.map((x) => <div key={x.id} style={{ fontSize: 13, padding: "3px 0" }}>✓ {x.text}</div>)}
                </div>

                <div style={{ flex: 1, minWidth: 240 }}>
                  <h4 style={{ fontSize: 13 }}>Notes</h4>
                  <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
                  <h4 style={{ fontSize: 13, marginTop: 12 }}>Attendance</h4>
                  {Object.entries(names).map(([id, n]) => {
                    const a = d.attendance.find((x) => x.userId === id);
                    return <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "2px 0" }}>
                      <span>{n}</span>
                      <select className="input" value={a?.status ?? ""} onChange={(e) => setAtt(id, e.target.value)} style={{ width: 120 }}><option value="">—</option><option value="invited">invited</option><option value="attended">attended</option><option value="absent">absent</option></select>
                    </div>;
                  })}
                </div>
              </div>

              <div className="mtg-actions" style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 13 }}>Action items</h4>
                {d.actions.map((a) => (
                  <div key={a.id} className="row">
                    <span>{a.title}{a.assigneeUserId && <span className="muted"> · {names[a.assigneeUserId] ?? "?"}</span>}{a.dueDate && <span className="muted"> · due {a.dueDate}</span>}</span>
                    {a.status === "converted" ? <span className="pill approved">converted</span> : <button className="btn btn-ghost" onClick={() => convert(a)}>→ Work item</button>}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <input className="input" placeholder="New action" value={action.title} onChange={(e) => setAction({ ...action, title: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                  <select className="input" value={action.assigneeUserId} onChange={(e) => setAction({ ...action, assigneeUserId: e.target.value })} style={{ width: 130 }}><option value="">Assignee…</option>{Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
                  <input className="input" type="date" value={action.dueDate} onChange={(e) => setAction({ ...action, dueDate: e.target.value })} style={{ width: 140 }} />
                  <button className="btn" onClick={addAction}>Add</button>
                </div>
                <div style={{ marginTop: 6 }}>
                  <select className="input" value={action.projectId} onChange={(e) => setAction({ ...action, projectId: e.target.value })} style={{ width: 200 }}><option value="">Convert target project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>Meetings</h3>
          {meetings.map((m) => <button key={m.id} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel === m.id ? "var(--primary)" : undefined }} onClick={() => open(m.id)}>{m.title}</button>)}
        </div>
      </div>
    </>
  );
}
