"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "../../../../lib/api";
import { useToast } from "../../../../components/ui/Toast";

type Modules = Record<string, boolean>;
const META: Record<string, string> = {
  chat: "Channels, DMs and threads with message-to-task.",
  whiteboard: "Freeform canvas with element-to-task and frame-to-doc.",
  ai: "Permission-aware drafting assistant with confirmed actions.",
  enterprise_identity: "SAML/OIDC SSO, LDAP/AD and SCIM directory governance.",
  calculations: "Lookup, mirror and rollup relationship calculations.",
  scenarios: "Plan-only what-if schedules and selective commit.",
  migration: "Asana, Jira and ClickUp discovery, mapping and reconciliation.",
  devops: "Code, pull request, build, deployment and engineering metrics.",
  connected_search: "ACL-preserving external knowledge and federated search.",
  sandbox: "Isolated configuration testing, promotion and rollback.",
  service_management: "SLA, queues, incidents, changes, on-call and CMDB.",
  discovery: "Ideas, insights, prioritisation and public roadmaps.",
  communications: "Email-in-task, calendar sync and meeting capture.",
  productivity: "Notes, reminders, mind maps, map view and offline queues.",
  ai_agents: "Governed AI teammates, tools, memory, budgets and checkpoints.",
}

export default function ModulesPage() {
  const toast = useToast();
  const [mods, setMods] = useState<Modules>({});
  const load = useCallback(async () => setMods(await api<Modules>("/modules", { org: true }).catch(() => ({}))), []);
  useEffect(() => { load(); }, [load]);
  async function toggle(module: string, enabled: boolean) { await api("/modules", { method: "POST", org: true, body: JSON.stringify({ module, enabled }) }); toast({ message: `${module} ${enabled ? "enabled" : "disabled"}` }); load(); }

  return (
    <>
      <h1 className="page-title">Optional modules</h1>
      <p className="page-sub">Enable or disable optional modules. Core project management is never affected.</p>
      {Object.keys(META).map((m) => (
        <div key={m} className="fieldcard ui-static-13313b1a" >
          <span className="ui-static-6fedee39"><strong>{m}</strong><span className="muted ui-static-31b1b5a9" >{META[m]}</span></span>
          <button className={mods[m] ? "btn btn-primary" : "btn"} onClick={() => toggle(m, !mods[m])}>{mods[m] ? "Enabled" : "Disabled"}</button>
        </div>
      ))}
    </>
  );
}
