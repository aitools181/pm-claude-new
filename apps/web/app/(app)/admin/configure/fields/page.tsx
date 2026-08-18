"use client";


import { Button as UiButton } from "../../../../../components/ui";
import { Select as UiSelect } from "../../../../../components/ui";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { Field, Input } from "../../../../../components/ui/Field";

type FieldDef = { id: string; key: string; name: string; fieldType: string; required: boolean; visibility: string; cascadeParentFieldId?: string | null };
type FieldOption = { id: string; value: string; label: string };
const TYPES = ["text", "number", "date", "checkbox", "select", "user", "url", "formula"];

export default function FieldsBuilder() {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [f, setF] = useState({ key: "", name: "", fieldType: "text", required: false, visibility: "all", sensitivity: "normal" });
  const [expression, setExpression] = useState("");
  const [options, setOptions] = useState("");
  const [cascadeParent, setCascadeParent] = useState("");
  const [parentOptions, setParentOptions] = useState<FieldOption[]>([]);
  const [childOptionsByParent, setChildOptionsByParent] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [fieldsError, setFieldsError] = useState("");
  const load = () => api<FieldDef[]>("/custom-fields", { org: true }).then((r) => { setFields(r); setFieldsError(""); }).catch((e) => setFieldsError(e instanceof Error ? e.message : "Could not load fields."));
  useEffect(() => { load(); }, []);
  const selectFields = fields.filter((x) => x.fieldType === "select");
  useEffect(() => {
    if (!cascadeParent) { setParentOptions([]); setChildOptionsByParent({}); return; }
    api<FieldOption[]>(`/custom-fields/${cascadeParent}/options`, { org: true }).then(setParentOptions).catch(() => setParentOptions([]));
  }, [cascadeParent]);

  async function create() {
    setMsg(null);
    const body: any = { key: f.key, name: f.name, fieldType: f.fieldType, required: f.required, visibility: f.visibility, sensitivity: f.sensitivity };
    if (f.fieldType === "select" && cascadeParent) {
      body.cascadeParentFieldId = cascadeParent;
      body.options = parentOptions.flatMap((po) =>
        (childOptionsByParent[po.id] ?? "").split(",").map((v) => v.trim()).filter(Boolean).map((v) => ({ value: v, label: v, parentOptionId: po.id }))
      );
    } else if (f.fieldType === "select") {
      body.options = options.split(",").map((v) => v.trim()).filter(Boolean).map((v) => ({ value: v, label: v }));
    }
    if (f.fieldType === "formula") body.config = { expression: expression.trim() };
    if (f.visibility === "restricted") body.visibleToRoles = roles.split(",").map((r) => r.trim()).filter(Boolean);
    try {
      await api("/custom-fields", { method: "POST", org: true, body: JSON.stringify(body) });
      setF({ key: "", name: "", fieldType: "text", required: false, visibility: "all", sensitivity: "normal" });
      setOptions(""); setRoles(""); setCascadeParent(""); setChildOptionsByParent({}); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }

  return (
    <>
      <h1 className="page-title">Custom Fields</h1>
      <p className="page-sub">Typed fields validated on write; restricted fields are hidden from unauthorised users.</p>
      {msg && <div className="callout callout-danger ui-static-2b583d73" >{msg}</div>}

      <div className="card card-p ui-static-49f14f8f" >
        <div className="cfg-form">
          <Field label="Key"><Input className="mono" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder="severity" /></Field>
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Severity" /></Field>
          <Field label="Type"><UiSelect className="input" value={f.fieldType} onChange={(e) => setF({ ...f, fieldType: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</UiSelect></Field>
          <Field label="Required"><UiSelect className="input" value={String(f.required)} onChange={(e) => setF({ ...f, required: e.target.value === "true" })}><option value="false">No</option><option value="true">Yes</option></UiSelect></Field>
          <Field label="Visibility"><UiSelect className="input" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}><option value="all">Everyone</option><option value="restricted">Restricted</option></UiSelect></Field>
          <Field label="Sensitivity"><UiSelect className="input" value={f.sensitivity} onChange={(e) => setF({ ...f, sensitivity: e.target.value })}><option value="normal">Normal</option><option value="sensitive">Sensitive</option><option value="pii">PII</option><option value="financial">Financial</option></UiSelect></Field>
        </div>
        {f.fieldType === "select" && selectFields.length > 0 && <Field label="Cascades from (optional)"><UiSelect className="input" value={cascadeParent} onChange={(e) => setCascadeParent(e.target.value)}><option value="">No — independent field</option>{selectFields.map((sf) => <option key={sf.id} value={sf.id}>{sf.name}</option>)}</UiSelect></Field>}
        {f.fieldType === "select" && !cascadeParent && <Field label="Options (comma-separated)"><Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="low, medium, high" /></Field>}
        {f.fieldType === "select" && cascadeParent && <div className="cascade-options-group">
          <p className="muted">For each value of the parent field, list this field&rsquo;s options (comma-separated) that should be offered.</p>
          {parentOptions.map((po) => <Field label={`When parent = "${po.label}"`} key={po.id}><Input value={childOptionsByParent[po.id] ?? ""} onChange={(e) => setChildOptionsByParent({ ...childOptionsByParent, [po.id]: e.target.value })} placeholder="option a, option b" /></Field>)}
          {parentOptions.length === 0 && <p className="muted">The parent field has no options yet — add some to it first.</p>}
        </div>}
          {f.fieldType === "formula" && <Field label="Expression"><Input className="mono" value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="story_points * 2 + estimate_hours" /></Field>}
        {f.visibility === "restricted" && <Field label="Visible to roles (comma-separated keys)"><Input className="mono" value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="organization_admin, manager" /></Field>}
        <UiButton variant="primary" className="ui-static-8a77e5a3"  disabled={!f.key || !f.name} onClick={create}>Create field</UiButton>
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>Key</th><th>Name</th><th>Type</th><th>Required</th><th>Visibility</th></tr></thead>
          <tbody>
            {fieldsError && <tr><td colSpan={5} className="ui-static-fbeb64b6 config-load-error">{fieldsError} <button className="text-button" onClick={load}>Retry</button></td></tr>}
            {!fieldsError && fields.length === 0 && <tr><td colSpan={5} className="ui-static-fbeb64b6">No custom fields yet.</td></tr>}
            {fields.map((x) => (
              <tr key={x.id}><td className="mono">{x.key}</td><td>{x.name}</td><td>{x.fieldType}</td><td>{x.required ? "Yes" : "No"}</td>
                <td><span className="badge">{x.visibility === "restricted" ? "🔒 restricted" : "everyone"}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
