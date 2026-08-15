"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../../../components/ui";
import { appPrompt } from "../../../components/ui/AppDialog";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../lib/api";
import { useToast } from "../../../components/ui/Toast";

type Meeting = { id: string; title: string; status: string; scheduledAt: string | null; notes: string | null; transcript?: string | null };
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
  const [transcript, setTranscript] = useState("");
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [action, setAction] = useState({ title: "", assigneeUserId: "", dueDate: "", projectId: "" });

  const load = useCallback(async () => setMeetings(await api<Meeting[]>("/meetings", { org: true }).catch(() => [])), []);
  useEffect(() => {
    load();
    api<Member[]>("/members", { org: true }).then((m) => setNames(Object.fromEntries(m.map((x) => [x.userId, x.displayName || x.email || x.userId.slice(0, 8)])))).catch(() => {});
    api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {});
  }, [load]);
  const open = useCallback(async (id: string) => { const dd = await api<Detail>(`/meetings/${id}`, { org: true }).catch(() => null); setSel(id); setD(dd); setNotes(dd?.meeting.notes ?? ""); setTranscript(dd?.meeting.transcript ?? ""); setCandidates(null); }, []);

  async function createMeeting() { const t = await appPrompt("Meeting title"); if (!t) return; const m = await api<Meeting>("/meetings", { method: "POST", org: true, body: JSON.stringify({ title: t, scheduledAt: new Date().toISOString() }) }); await load(); open(m.id); }
  async function saveNotes() { if (!sel) return; await api(`/meetings/${sel}/notes`, { method: "PUT", org: true, body: JSON.stringify({ notes }) }); toast({ message: "Notes saved" }); }
  async function saveTranscript() { if (!sel) return; await api(`/meetings/${sel}/transcript`, { method: "POST", org: true, body: JSON.stringify({ transcript }) }); toast({ message: "Transcript saved" }); }
  async function extract() { if (!sel) return; const r = await api<{ candidates: string[] }>(`/meetings/${sel}/extract-actions`, { method: "POST", org: true, body: JSON.stringify({}) }); setCandidates(r.candidates); if (!r.candidates.length) toast({ message: "No action-like lines found in the transcript" }); }
  async function candidateToAction(title: string) { if (!sel) return; await api(`/meetings/${sel}/actions`, { method: "POST", org: true, body: JSON.stringify({ title }) }); setCandidates((c) => c ? c.filter((x) => x !== title) : c); toast({ message: "Added as meeting action" }); open(sel); }
  async function addAgenda() { if (!sel) return; const t = await appPrompt("Agenda item"); if (!t) return; await api(`/meetings/${sel}/agenda`, { method: "POST", org: true, body: JSON.stringify({ title: t, position: (d?.agenda.length ?? 0) + 1 }) }); open(sel); }
  async function addDecision() { if (!sel) return; const t = await appPrompt("Decision"); if (!t) return; await api(`/meetings/${sel}/decisions`, { method: "POST", org: true, body: JSON.stringify({ text: t }) }); open(sel); }
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
      <div className="ui-static-13313b1a">
        <h1 className="page-title ui-static-c81ce4b2" >Meetings</h1>
        <UiButton variant="primary"  onClick={createMeeting}>+ New meeting</UiButton>
      </div>
      <div className="builder-grid">
        <div>
          {!d && <p className="muted">Select a meeting.</p>}
          {d && (
            <>
              <div className="ui-static-8d446200">
                <h3 className="ui-static-11696618">{d.meeting.title}</h3>
                <span className={`pill ${d.meeting.status === "held" ? "approved" : d.meeting.status === "cancelled" ? "rejected" : "submitted"}`}>{d.meeting.status}</span>
              </div>

              <div className="ui-static-f08f7c9e">
                <div className="ui-static-9405df25">
                  <div className="ui-static-a3d12b9b"><h4 className="ui-static-5e0faad2">Agenda</h4><UiButton variant="tertiary"  onClick={addAgenda}>+ Add</UiButton></div>
                  {d.agenda.map((a) => <div key={a.id} className="ui-static-39e0897e">{a.position}. {a.title}</div>)}

                  <div className="ui-static-73733a64"><h4 className="ui-static-5e0faad2">Decisions</h4><UiButton variant="tertiary"  onClick={addDecision}>+ Add</UiButton></div>
                  {d.decisions.map((x) => <div key={x.id} className="ui-static-39e0897e">✓ {x.text}</div>)}
                </div>

                <div className="ui-static-9405df25">
                  <h4 className="ui-static-5e0faad2">Notes</h4>
                  <UiTextarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
                  <h4 className="ui-static-5e0faad2">Transcript</h4>
                  <UiTextarea className="input mono" rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} onBlur={saveTranscript} placeholder={"Paste the meeting capture here.\nLines like \"Action: Ravi will…\", \"todo: …\" or \"Asha will …\" can be extracted."} />
                  <div className="transcript-toolbar"><UiButton variant="secondary" size="compact" disabled={!transcript.trim()} onClick={extract}>Extract action items</UiButton>{candidates && <span className="muted">{candidates.length} candidate{candidates.length === 1 ? "" : "s"}</span>}</div>
                  {candidates && candidates.length > 0 && <div className="transcript-candidates">{candidates.map((c) => <div key={c}><span>{c}</span><UiButton variant="primary" size="compact" onClick={() => candidateToAction(c)}>Add as action</UiButton></div>)}</div>}
                  <h4 className="ui-static-30a225d4">Attendance</h4>
                  {Object.entries(names).map(([id, n]) => {
                    const a = d.attendance.find((x) => x.userId === id);
                    return <div key={id} className="ui-static-45e93ee8">
                      <span>{n}</span>
                      <UiSelect className="input ui-static-465bfea3" value={a?.status ?? ""} onChange={(e) => setAtt(id, e.target.value)} ><option value="">—</option><option value="invited">invited</option><option value="attended">attended</option><option value="absent">absent</option></UiSelect>
                    </div>;
                  })}
                </div>
              </div>

              <div className="mtg-actions ui-static-1b0f4999" >
                <h4 className="ui-static-5e0faad2">Action items</h4>
                {d.actions.map((a) => (
                  <div key={a.id} className="row">
                    <span>{a.title}{a.assigneeUserId && <span className="muted"> · {names[a.assigneeUserId] ?? "?"}</span>}{a.dueDate && <span className="muted"> · due {a.dueDate}</span>}</span>
                    {a.status === "converted" ? <span className="pill approved">converted</span> : <UiButton variant="tertiary"  onClick={() => convert(a)}>→ Work item</UiButton>}
                  </div>
                ))}
                <div className="ui-static-39c4d386">
                  <UiInput className="input ui-static-f09611ef" placeholder="New action" value={action.title} onChange={(e) => setAction({ ...action, title: e.target.value })}  />
                  <UiSelect className="input ui-static-c6fffdfe" value={action.assigneeUserId} onChange={(e) => setAction({ ...action, assigneeUserId: e.target.value })} ><option value="">Assignee…</option>{Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</UiSelect>
                  <UiInput className="input ui-static-830eb986" type="date" value={action.dueDate} onChange={(e) => setAction({ ...action, dueDate: e.target.value })}  />
                  <UiButton variant="secondary"  onClick={addAction}>Add</UiButton>
                </div>
                <div className="ui-static-fe7b4979">
                  <UiSelect className="input ui-static-2acaf3b5" value={action.projectId} onChange={(e) => setAction({ ...action, projectId: e.target.value })} ><option value="">Convert target project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</UiSelect>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="gpanel">
          <h3>Meetings</h3>
          {meetings.map((m) => <UiButton variant="tertiary" key={m.id} className="ui-selection-row" data-selected={sel === m.id || undefined} onClick={() => open(m.id)}>{m.title}</UiButton>)}
        </div>
      </div>
    </>
  );
}
