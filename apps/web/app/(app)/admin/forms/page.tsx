"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Form = { id: string; key: string; name: string; status: string; publicEnabled: boolean; publicToken: string | null };
type Field = { key: string; label: string; type: string; required?: boolean; options?: string[]; visibleWhen?: { fieldKey: string; op: string; value: any } };
type Rule = { when?: { fieldKey: string; op: string; value: any }; projectId?: string; titleTemplate?: string };
type Project = { id: string; name: string };
type Sub = { id: string; source: string; status: string; createdAt: string; createdWorkItemId: string | null };

const FIELD_TYPES = ["text", "textarea", "select", "checkbox", "number", "date", "email"];

export default function FormsAdminPage() {
  const toast = useToast();
  const [forms, setForms] = useState<Form[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sel, setSel] = useState<Form | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [defaultProjectId, setDefaultProjectId] = useState("");
  const [subs, setSubs] = useState<Sub[]>([]);

  const loadForms = useCallback(async () => { setForms(await api<Form[]>("/forms", { org: true }).catch(() => [])); }, []);
  useEffect(() => { loadForms(); api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, [loadForms]);

  async function openForm(id: string) {
    const { form, version } = await api<{ form: any; version: any }>(`/forms/${id}`, { org: true });
    setSel(form); setFields((form.draftFields ?? []) as Field[]); setRules((form.draftRouting ?? []) as Rule[]); setDefaultProjectId(form.defaultProjectId ?? "");
    setSubs(await api<Sub[]>(`/forms/${id}/submissions`, { org: true }).catch(() => []));
  }
  async function createForm() {
    const name = prompt("Form name"); if (!name) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const f = await api<Form>("/forms", { method: "POST", org: true, body: JSON.stringify({ key, name }) });
    await loadForms(); openForm(f.id);
  }
  async function saveDraft() {
    if (!sel) return;
    await api(`/forms/${sel.id}`, { method: "PATCH", org: true, body: JSON.stringify({ draftFields: fields, draftRouting: rules, defaultProjectId: defaultProjectId || null }) });
    toast({ message: "Draft saved" }); loadForms();
  }
  async function publish() {
    if (!sel) return;
    try { await saveDraft(); const v = await api<{ version: number }>(`/forms/${sel.id}/publish`, { method: "POST", org: true }); toast({ message: `Published v${v.version}` }); openForm(sel.id); loadForms(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Failed" }); }
  }
  async function enablePublic() {
    if (!sel) return;
    try { const r = await api<{ publicToken: string }>(`/forms/${sel.id}/public`, { method: "POST", org: true }); toast({ message: "Public link enabled" }); openForm(sel.id); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Publish first" }); }
  }

  const addField = () => setFields([...fields, { key: `field${fields.length + 1}`, label: "New field", type: "text", required: false }]);
  const upField = (i: number, patch: Partial<Field>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addRule = () => setRules([...rules, { when: { fieldKey: fields[0]?.key ?? "", op: "eq", value: "" }, projectId: "", titleTemplate: "" }]);
  const upRule = (i: number, patch: Partial<Rule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const publicUrl = sel?.publicToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/f/${sel.publicToken}` : null;

  return (
    <>
      <h1 className="page-title">Forms</h1>
      <div className="builder-grid">
        <div>
          {!sel && <p className="muted">Select or create a form to build it.</p>}
          {sel && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <strong style={{ fontSize: 16 }}>{sel.name}</strong>
                <span className={`pill ${sel.status === "published" ? "approved" : "open"}`}>{sel.status}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button className="btn" onClick={saveDraft}>Save draft</button>
                  <button className="btn btn-primary" onClick={publish}>Publish</button>
                </div>
              </div>

              <div style={{ marginBottom: 8 }} className="muted">Default target project</div>
              <select className="input" value={defaultProjectId} onChange={(e) => setDefaultProjectId(e.target.value)} style={{ marginBottom: 16 }}>
                <option value="">— none —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <h3 style={{ fontSize: 14 }}>Fields</h3>
              {fields.map((f, i) => (
                <div key={i} className="fieldcard">
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input className="input" value={f.key} onChange={(e) => upField(i, { key: e.target.value })} placeholder="key" style={{ width: 120 }} />
                    <input className="input" value={f.label} onChange={(e) => upField(i, { label: e.target.value })} placeholder="label" style={{ flex: 1 }} />
                    <select className="input" value={f.type} onChange={(e) => upField(i, { type: e.target.value })} style={{ width: 110 }}>{FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                    <button className="btn btn-ghost" onClick={() => setFields(fields.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
                    <label><input type="checkbox" checked={!!f.required} onChange={(e) => upField(i, { required: e.target.checked })} /> required</label>
                    {f.type === "select" && <input className="input" placeholder="options, comma separated" value={(f.options ?? []).join(",")} onChange={(e) => upField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} style={{ flex: 1 }} />}
                  </div>
                </div>
              ))}
              <button className="btn btn-ghost" onClick={addField}>+ Add field</button>

              <h3 style={{ fontSize: 14, marginTop: 18 }}>Routing rules</h3>
              <p className="muted" style={{ fontSize: 12 }}>First matching rule wins; otherwise the default project is used.</p>
              {rules.map((r, i) => (
                <div key={i} className="rulecard">
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                    <span>When</span>
                    <select className="input" value={r.when?.fieldKey ?? ""} onChange={(e) => upRule(i, { when: { fieldKey: e.target.value, op: "eq", value: r.when?.value ?? "" } })} style={{ width: 120 }}>
                      <option value="">(always)</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
                    </select>
                    <span>=</span>
                    <input className="input" value={r.when?.value ?? ""} onChange={(e) => upRule(i, { when: { fieldKey: r.when?.fieldKey ?? "", op: "eq", value: e.target.value } })} style={{ width: 110 }} />
                    <span>→</span>
                    <select className="input" value={r.projectId ?? ""} onChange={(e) => upRule(i, { projectId: e.target.value })} style={{ width: 150 }}>
                      <option value="">(default)</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button className="btn btn-ghost" onClick={() => setRules(rules.filter((_, j) => j !== i))}>✕</button>
                  </div>
                  <input className="input" placeholder="Title template, e.g. BUG: {title}" value={r.titleTemplate ?? ""} onChange={(e) => upRule(i, { titleTemplate: e.target.value })} style={{ marginTop: 6 }} />
                </div>
              ))}
              <button className="btn btn-ghost" onClick={addRule}>+ Add rule</button>

              <div style={{ borderTop: "1px solid var(--line)", marginTop: 18, paddingTop: 14 }}>
                <h3 style={{ fontSize: 14 }}>Public access</h3>
                {publicUrl ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input className="input" readOnly value={publicUrl} style={{ flex: 1 }} onFocus={(e) => e.target.select()} />
                    <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(publicUrl); toast({ message: "Copied" }); }}>Copy</button>
                  </div>
                ) : <button className="btn" onClick={enablePublic}>Enable public link</button>}
              </div>

              {subs.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ fontSize: 14 }}>Submissions ({subs.length})</h3>
                  <table className="ts-grid"><tbody>
                    {subs.map((s) => <tr key={s.id}><td className="mono">{new Date(s.createdAt).toLocaleString()}</td><td>{s.source}</td><td><span className={`pill ${s.status === "routed" ? "approved" : "rejected"}`}>{s.status}</span></td></tr>)}
                  </tbody></table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="gpanel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3>Forms</h3><button className="btn btn-ghost" onClick={createForm}>+ New</button></div>
          {forms.map((f) => (
            <button key={f.id} className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, borderColor: sel?.id === f.id ? "var(--primary)" : undefined }} onClick={() => openForm(f.id)}>
              {f.name} <span className={`pill ${f.status === "published" ? "approved" : "open"}`} style={{ marginLeft: 4 }}>{f.status}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
