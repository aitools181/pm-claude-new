"use client";
import { appPrompt, appConfirm } from "../../../../../components/ui/AppDialog";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { ProjectChrome } from "../../../../../components/project/ProjectChrome";
import { Button as UiButton, Select as UiSelect } from "../../../../../components/ui";
import { Field, Input } from "../../../../../components/ui/Field";
import { useToast } from "../../../../../components/ui/Toast";

type Project = { id: string; name: string; keyPrefix: string; color?: string; health: string; status: string; privacy: string; version: number };
type Grant = { id: string; granteeType: "user" | "role"; userId: string | null; roleKey: string | null };
type Level = { id: string; name: string; rank: number; grants: Grant[] };
type Member = { id: string; displayName: string };

export default function SecurityLevelsPage() {
  const id = useParams().id as string;
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [grantType, setGrantType] = useState<"user" | "role">("user");
  const [grantUserId, setGrantUserId] = useState("");
  const [grantRoleKey, setGrantRoleKey] = useState("organization_admin");

  async function load() {
    const [p, l, m] = await Promise.all([
      api<Project>(`/projects/${id}`, { org: true }),
      api<Level[]>(`/projects/${id}/security-levels`, { org: true }).catch(() => []),
      api<Member[]>("/directory/members", { org: true }).catch(() => []),
    ]);
    setProject(p); setLevels(l); setMembers(m);
  }
  useEffect(() => { load().catch(() => {}); }, [id]);

  async function addLevel() {
    const name = await appPrompt("Security level name", "Restricted");
    if (!name?.trim()) return;
    try { await api(`/projects/${id}/security-levels`, { method: "POST", org: true, body: JSON.stringify({ name: name.trim(), rank: levels.length }) }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not create level", tone: "error" }); }
  }
  async function renameLevel(level: Level) {
    const name = await appPrompt("Rename security level", level.name);
    if (!name?.trim() || name === level.name) return;
    try { await api(`/security-levels/${level.id}/rename`, { method: "POST", org: true, body: JSON.stringify({ name: name.trim() }) }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not rename", tone: "error" }); }
  }
  async function removeLevel(level: Level) {
    if (!await appConfirm(`Delete "${level.name}"? Any task using it becomes unrestricted again.`)) return;
    try { await api(`/security-levels/${level.id}`, { method: "DELETE", org: true }); toast({ message: "Level deleted" }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not delete", tone: "error" }); }
  }
  async function addGrant(levelId: string) {
    if (grantType === "user" && !grantUserId) return;
    try {
      await api(`/security-levels/${levelId}/grants`, { method: "POST", org: true, body: JSON.stringify({ granteeType: grantType, userId: grantType === "user" ? grantUserId : undefined, roleKey: grantType === "role" ? grantRoleKey : undefined }) });
      setGrantUserId(""); setGrantFor(null); load();
    } catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not add grant", tone: "error" }); }
  }
  async function removeGrant(grantId: string) {
    try { await api(`/security-levels/grants/${grantId}`, { method: "DELETE", org: true }); load(); }
    catch (e) { toast({ message: e instanceof ApiError ? e.message : "Could not remove grant", tone: "error" }); }
  }
  const nameOf = (userId: string) => members.find((m) => m.id === userId)?.displayName ?? userId.slice(0, 8);

  return <>
    {project && <ProjectChrome project={project} view="overview" onProjectChange={load} />}
    <div className="security-levels-page">
      <header className="security-levels-head">
        <div><h2>Security levels</h2><p>Restrict who can see specific tasks beyond ordinary project access. A task&rsquo;s own owner and reporter can always see it; everyone else needs an explicit grant here.</p></div>
        <UiButton variant="primary" onClick={addLevel}>Add security level</UiButton>
      </header>

      {levels.length === 0 && <div className="empty">No security levels yet. Tasks in this project are visible to everyone with project access.</div>}

      {levels.map((level) => (
        <div className="security-level-card" key={level.id}>
          <div className="security-level-card-head">
            <strong>{level.name}</strong>
            <div className="button-row">
              <UiButton variant="secondary" size="compact" onClick={() => renameLevel(level)}>Rename</UiButton>
              <UiButton variant="destructive" size="compact" onClick={() => removeLevel(level)}>Delete</UiButton>
            </div>
          </div>
          <div className="security-level-grants">
            {level.grants.length === 0 && <span className="muted">No one granted yet — only the task&rsquo;s own owner/reporter can see restricted tasks.</span>}
            {level.grants.map((g) => (
              <span className="security-grant-chip" key={g.id}>
                {g.granteeType === "user" ? nameOf(g.userId ?? "") : `Role: ${g.roleKey}`}
                <button type="button" aria-label="Remove grant" onClick={() => removeGrant(g.id)}>✕</button>
              </span>
            ))}
          </div>
          {grantFor === level.id ? (
            <div className="security-grant-form">
              <UiSelect className="input" value={grantType} onChange={(e) => setGrantType(e.target.value as "user" | "role")}>
                <option value="user">Specific person</option>
                <option value="role">Anyone with a role</option>
              </UiSelect>
              {grantType === "user"
                ? <UiSelect className="input" value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)}><option value="">Select…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</UiSelect>
                : <Input value={grantRoleKey} onChange={(e) => setGrantRoleKey(e.target.value)} placeholder="organization_admin" />}
              <UiButton variant="primary" size="compact" onClick={() => addGrant(level.id)}>Add</UiButton>
              <UiButton variant="tertiary" size="compact" onClick={() => setGrantFor(null)}>Cancel</UiButton>
            </div>
          ) : <UiButton variant="tertiary" size="compact" onClick={() => setGrantFor(level.id)}>Grant access…</UiButton>}
        </div>
      ))}
    </div>
  </>;
}
