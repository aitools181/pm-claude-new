"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { Field, Input } from "../../../../../components/ui/Field";

type FieldDef = { id: string; key: string; name: string };

export default function TypesBuilder() {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [t, setT] = useState({ key: "", name: "", icon: "" });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [required, setRequired] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { api<FieldDef[]>("/custom-fields", { org: true }).then(setFields).catch(() => {}); }, []);

  async function create() {
    setMsg(null);
    const attached = Object.keys(selected).filter((id) => selected[id]).map((fieldId) => ({ fieldId, required: !!required[fieldId] }));
    try {
      await api("/work-item-types", { method: "POST", org: true, body: JSON.stringify({ key: t.key, name: t.name, icon: t.icon || undefined, fields: attached }) });
      setT({ key: "", name: "", icon: "" }); setSelected({}); setRequired({}); setMsg("Type created.");
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Failed"); }
  }

  return (
    <>
      <h1 className="page-title">Work Item Types</h1>
      <p className="page-sub">Define types with an icon and attach fields (optionally required for the type).</p>
      {msg && <div className="callout callout-info" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className="card card-p">
        <div className="cfg-form" style={{ marginBottom: 16 }}>
          <Field label="Key"><Input className="mono" value={t.key} onChange={(e) => setT({ ...t, key: e.target.value })} placeholder="bug" /></Field>
          <Field label="Name"><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Bug" /></Field>
          <Field label="Icon"><Input value={t.icon} onChange={(e) => setT({ ...t, icon: e.target.value })} placeholder="🐞" /></Field>
        </div>

        <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 8 }}>Attach fields</div>
        <div className="chips" style={{ marginBottom: 16 }}>
          {fields.length === 0 && <span style={{ color: "var(--ink-3)", fontSize: 13 }}>No fields defined yet.</span>}
          {fields.map((fd) => (
            <span key={fd.id} className="chip" data-on={!!selected[fd.id]} onClick={() => setSelected({ ...selected, [fd.id]: !selected[fd.id] })}>
              {fd.name}
              {selected[fd.id] && <em onClick={(e) => { e.stopPropagation(); setRequired({ ...required, [fd.id]: !required[fd.id] }); }} style={{ fontStyle: "normal", color: required[fd.id] ? "var(--danger)" : "var(--ink-3)" }}>{required[fd.id] ? "· required" : "· optional"}</em>}
            </span>
          ))}
        </div>
        <button className="btn btn-primary" disabled={!t.key || !t.name} onClick={create}>Create type</button>
      </div>
    </>
  );
}
