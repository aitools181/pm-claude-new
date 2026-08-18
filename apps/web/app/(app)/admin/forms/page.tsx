"use client";


import { Button as UiButton } from "../../../../components/ui";
import { Input as UiInput, Select as UiSelect } from "../../../../components/ui";
import { appPrompt } from "../../../../components/ui/AppDialog";
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

  const [formsError, setFormsError] = useState("");
  const loadForms = useCallback(async () => {
    try { setForms(await api<Form[]>("/forms", { org: true })); setFormsError(""); }
    catch (e) { setFormsError(e instanceof Error ? e.message : "Could not load forms."); }
  }, []);
  useEffect(() => { loadForms(); api<Project[]>("/projects", { org: true }).then(setProjects).catch(() => {}); }, [loadForms]);

  async function openForm(id: string) {
    const { form, version } = await api<{ form: any; version: any }>(`/forms/${id}`, { org: true });
    setSel(form); setFields((form.draftFields ?? []) as Field[]); setRules((form.draftRouting ?? []) as Rule[]); setDefaultProjectId(form.defaultProjectId ?? "");
    setSubs(await api<Sub[]>(`/forms/${id}/submissions`, { org: true }).catch(() => []));
  }
  async function createForm() {
    const name = await appPrompt("Form name"); if (!name) return;
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
              <div className="ui-static-a522af54">
                <strong className="ui-static-1444c6ea">{sel.name}</strong>
                <span className={`pill ${sel.status === "published" ? "approved" : "open"}`}>{sel.status}</span>
                <div className="ui-static-ff2ab46b">
                  <UiButton variant="secondary"  onClick={saveDraft}>Save draft</UiButton>
                  <UiButton variant="primary"  onClick={publish}>Publish</UiButton>
                </div>
              </div>

              <div  className="muted ui-static-fdf33f23">Default target project</div>
              <UiSelect className="input ui-static-87c136df" value={defaultProjectId} onChange={(e) => setDefaultProjectId(e.target.value)} >
                <option value="">— none —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </UiSelect>

              <h3 className="ui-static-433de30b">Fields</h3>
              {fields.map((f, i) => (
                <div key={i} className="fieldcard">
                  <div className="ui-static-9d6820f7">
                    <UiInput className="input ui-static-465bfea3" value={f.key} onChange={(e) => upField(i, { key: e.target.value })} placeholder="key"  />
                    <UiInput className="input ui-static-97445a8d" value={f.label} onChange={(e) => upField(i, { label: e.target.value })} placeholder="label"  />
                    <UiSelect className="input ui-static-60746827" value={f.type} onChange={(e) => upField(i, { type: e.target.value })} >{FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}</UiSelect>
                    <UiButton variant="tertiary"  onClick={() => setFields(fields.filter((_, j) => j !== i))}>✕</UiButton>
                  </div>
                  <div className="ui-static-86f3a074">
                    <label><input type="checkbox" checked={!!f.required} onChange={(e) => upField(i, { required: e.target.checked })} /> required</label>
                    {f.type === "select" && <UiInput className="input ui-static-97445a8d" placeholder="options, comma separated" value={(f.options ?? []).join(",")} onChange={(e) => upField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}  />}
                  </div>
                </div>
              ))}
              <UiButton variant="tertiary"  onClick={addField}>+ Add field</UiButton>

              <h3 className="ui-static-fb893596">Routing rules</h3>
              <p className="muted ui-static-6cb285c6" >First matching rule wins; otherwise the default project is used.</p>
              {rules.map((r, i) => (
                <div key={i} className="rulecard">
                  <div className="ui-static-209300ac">
                    <span>When</span>
                    <UiSelect className="input ui-static-465bfea3" value={r.when?.fieldKey ?? ""} onChange={(e) => upRule(i, { when: { fieldKey: e.target.value, op: "eq", value: r.when?.value ?? "" } })} >
                      <option value="">(always)</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
                    </UiSelect>
                    <span>=</span>
                    <UiInput className="input ui-static-60746827" value={r.when?.value ?? ""} onChange={(e) => upRule(i, { when: { fieldKey: r.when?.fieldKey ?? "", op: "eq", value: e.target.value } })}  />
                    <span>→</span>
                    <UiSelect className="input ui-static-7c07cdf8" value={r.projectId ?? ""} onChange={(e) => upRule(i, { projectId: e.target.value })} >
                      <option value="">(default)</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </UiSelect>
                    <UiButton variant="tertiary"  onClick={() => setRules(rules.filter((_, j) => j !== i))}>✕</UiButton>
                  </div>
                  <UiInput className="input ui-static-fe7b4979" placeholder="Title template, e.g. BUG: {title}" value={r.titleTemplate ?? ""} onChange={(e) => upRule(i, { titleTemplate: e.target.value })}  />
                </div>
              ))}
              <UiButton variant="tertiary"  onClick={addRule}>+ Add rule</UiButton>

              <div className="ui-static-45183579">
                <h3 className="ui-static-433de30b">Public access</h3>
                {publicUrl ? (
                  <div className="ui-static-01ef7fc9">
                    <UiInput className="input ui-static-97445a8d" readOnly value={publicUrl}  onFocus={(e) => e.target.select()} />
                    <UiButton variant="tertiary"  onClick={() => { navigator.clipboard?.writeText(publicUrl); toast({ message: "Copied" }); }}>Copy</UiButton>
                  </div>
                ) : <UiButton variant="secondary"  onClick={enablePublic}>Enable public link</UiButton>}
              </div>

              {subs.length > 0 && (
                <div className="ui-static-86de7ac6">
                  <h3 className="ui-static-433de30b">Submissions ({subs.length})</h3>
                  <table className="ts-grid"><tbody>
                    {subs.map((s) => <tr key={s.id}><td className="mono">{new Date(s.createdAt).toLocaleString()}</td><td>{s.source}</td><td><span className={`pill ${s.status === "routed" ? "approved" : "rejected"}`}>{s.status}</span></td></tr>)}
                  </tbody></table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="gpanel">
          <div className="ui-static-13313b1a"><h3>Forms</h3><UiButton variant="tertiary"  onClick={createForm}>+ New</UiButton></div>
          {formsError && <div className="callout callout-danger forms-list-error"><span>{formsError}</span><UiButton variant="secondary" size="compact" onClick={loadForms}>Retry</UiButton></div>}
          {!formsError && forms.map((f) => (
            <UiButton variant="tertiary" key={f.id} className="ui-selection-row" data-selected={sel?.id === f.id || undefined} onClick={() => openForm(f.id)}>
              {f.name} <span className={[`pill ${f.status === "published" ? "approved" : "open"}`, "ui-static-46cec891"].filter(Boolean).join(" ")} >{f.status}</span>
            </UiButton>
          ))}
        </div>
      </div>
    </>
  );
}
