"use client";

import { Button as UiButton } from "../../../../../components/ui";
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
      {msg && <div className="callout callout-info ui-static-2b583d73" >{msg}</div>}

      <div className="card card-p">
        <div className="cfg-form ui-static-87c136df" >
          <Field label="Key"><Input className="mono" value={t.key} onChange={(e) => setT({ ...t, key: e.target.value })} placeholder="bug" /></Field>
          <Field label="Name"><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Bug" /></Field>
          <Field label="Icon"><Input value={t.icon} onChange={(e) => setT({ ...t, icon: e.target.value })} placeholder="🐞" /></Field>
        </div>

        <div className="ui-static-8672e9a0">Attach fields</div>
        <div className="chips ui-static-87c136df" >
          {fields.length === 0 && <span className="ui-static-c3d3e812">No fields defined yet.</span>}
          {fields.map((fd) => (
            <span key={fd.id} className="ui-chip-choice">
              <button type="button" className="chip ui-reset-button" aria-pressed={!!selected[fd.id]} data-on={!!selected[fd.id]} onClick={() => setSelected({ ...selected, [fd.id]: !selected[fd.id] })}>{fd.name}</button>
              {selected[fd.id] && <button type="button" onClick={() => setRequired({ ...required, [fd.id]: !required[fd.id] })} className="ui-required-toggle ui-reset-button" aria-pressed={!!required[fd.id]} data-required={required[fd.id] || undefined}>{required[fd.id] ? "· required" : "· optional"}</button>}
            </span>
          ))}
        </div>
        <UiButton variant="primary"  disabled={!t.key || !t.name} onClick={create}>Create type</UiButton>
      </div>
    </>
  );
}
