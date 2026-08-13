"use client";


import { Button as UiButton } from "../../../components/ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../../../components/ui";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../lib/api";

type Field = { key: string; label: string; type: string; required?: boolean; options?: string[]; visibleWhen?: { fieldKey: string; op: string; value: any } };
const visible = (f: Field, a: Record<string, any>) => { const w = f.visibleWhen; if (!w) return true; const v = a[w.fieldKey]; return w.op === "eq" ? v === w.value : w.op === "ne" ? v !== w.value : w.op === "truthy" ? !!v : true; };

export default function PublicFormPage() {
  const token = useParams().token as string;
  const [form, setForm] = useState<{ name: string; description: string | null; fields: Field[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ ref?: string } | null>(null);

  useEffect(() => { api<any>(`/public/forms/${token}`).then(setForm).catch(() => setError("This form is not available.")); }, [token]);
  const set = (k: string, v: any) => setAnswers((a) => ({ ...a, [k]: v }));

  async function submit() {
    setError("");
    try { const r = await api<{ requesterRef?: string }>(`/public/forms/${token}/submit`, { method: "POST", body: JSON.stringify({ answers }) }); setDone({ ref: r.requesterRef }); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Submission failed"); }
  }

  return (
    <div className="ui-static-fd9aae72">
      {error && !form && <div className="empty">{error}</div>}
      {done ? (
        <div className="fieldcard ui-static-18e2afef" >
          <h2 className="page-title">Thank you</h2>
          <p className="page-sub">Your request has been received.</p>
          {done.ref && <a className="btn btn-primary" href={`/requests/${done.ref}`}>Track your request →</a>}
        </div>
      ) : form && (
        <>
          <h1 className="page-title">{form.name}</h1>
          {form.description && <p className="page-sub">{form.description}</p>}
          {form.fields.filter((f) => visible(f, answers)).map((f) => (
            <div key={f.key} className="ui-static-2b583d73">
              <label className="ui-static-6cbc05e9">{f.label}{f.required && <span className="ui-static-497726e8"> *</span>}</label>
              {f.type === "textarea" ? <UiTextarea className="input ui-static-0466783d" rows={4} onChange={(e) => set(f.key, e.target.value)}  />
                : f.type === "select" ? <UiSelect className="input ui-static-0466783d" onChange={(e) => set(f.key, e.target.value)} ><option value="">— select —</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</UiSelect>
                : f.type === "checkbox" ? <input type="checkbox" onChange={(e) => set(f.key, e.target.checked)} />
                : <UiInput className="input ui-static-0466783d" type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"} onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}  /> }
            </div>
          ))}
          {error && <p className="ui-static-8763236a">{error}</p>}
          <UiButton variant="primary" className="ui-static-8a77e5a3" onClick={submit} >Submit</UiButton>
        </>
      )}
    </div>
  );
}
