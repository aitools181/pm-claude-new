"use client";
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
    <div style={{ maxWidth: 620, margin: "48px auto", padding: "0 20px" }}>
      {error && !form && <div className="empty">{error}</div>}
      {done ? (
        <div className="fieldcard" style={{ textAlign: "center", padding: 28 }}>
          <h2 className="page-title">Thank you</h2>
          <p className="page-sub">Your request has been received.</p>
          {done.ref && <a className="btn btn-primary" href={`/requests/${done.ref}`}>Track your request →</a>}
        </div>
      ) : form && (
        <>
          <h1 className="page-title">{form.name}</h1>
          {form.description && <p className="page-sub">{form.description}</p>}
          {form.fields.filter((f) => visible(f, answers)).map((f) => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{f.label}{f.required && <span style={{ color: "var(--danger)" }}> *</span>}</label>
              {f.type === "textarea" ? <textarea className="input" rows={4} onChange={(e) => set(f.key, e.target.value)} style={{ width: "100%" }} />
                : f.type === "select" ? <select className="input" onChange={(e) => set(f.key, e.target.value)} style={{ width: "100%" }}><option value="">— select —</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</select>
                : f.type === "checkbox" ? <input type="checkbox" onChange={(e) => set(f.key, e.target.checked)} />
                : <input className="input" type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"} onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)} style={{ width: "100%" }} />}
            </div>
          ))}
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <button className="btn btn-primary" onClick={submit} style={{ marginTop: 8 }}>Submit</button>
        </>
      )}
    </div>
  );
}
