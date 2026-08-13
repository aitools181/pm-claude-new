"use client";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../../lib/api";
import { appPrompt } from "../../../components/ui/AppDialog";
import { Button, Icon, Input, Select } from "../../../components/ui";
import { useToast } from "../../../components/ui/Toast";

type Template = { id: string; name: string; kind: string; publishedVersionId: string };
type Workspace = { id: string; name: string };

export default function TemplateGalleryPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api<Template[]>("/templates/gallery", { org: true }), api<Workspace[]>("/workspaces", { org: true })])
      .then(([rows, spaces]) => { setTemplates(rows); setWorkspaces(spaces); setWorkspaceId((current) => current || spaces[0]?.id || ""); })
      .catch((error) => toast({ message: error instanceof ApiError ? error.message : "Could not load templates", tone: "error" }));
  }, [toast]);
  const visible = useMemo(() => templates.filter((row) => `${row.name} ${row.kind}`.toLowerCase().includes(query.trim().toLowerCase())), [templates, query]);
  async function useTemplate(row: Template) {
    if (!workspaceId) { toast({ message: "Choose a workspace first", tone: "warning" }); return; }
    const name = await appPrompt("Project name", row.name); if (!name?.trim()) return;
    setBusy(row.id);
    try {
      const result = await api<{ projectId: string }>(`/templates/${row.id}/use-project`, { method: "POST", org: true, body: JSON.stringify({ workspaceId, name: name.trim() }) });
      location.assign(`/projects/${result.projectId}`);
    } catch (error) { toast({ message: error instanceof ApiError ? error.message : "Could not create project from template", tone: "error" }); }
    finally { setBusy(null); }
  }
  return <div className="template-gallery-page">
    <header className="page-heading template-gallery-head"><div><h1>Template gallery</h1><p>Start a project from a published workspace template.</p></div><Select aria-label="Target workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select></header>
    <label className="template-gallery-search"><Icon name="search" size={16}/><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" aria-label="Search templates"/></label>
    <div className="template-gallery-grid">{visible.map((row) => <article className="template-gallery-card" key={row.id}><span className="template-project-icon"><Icon name="projects" size={20}/></span><div><h2>{row.name}</h2><p>{row.kind} template</p></div><Button variant="primary" size="compact" disabled={busy === row.id || !workspaceId} onClick={() => useTemplate(row)}>{busy === row.id ? "Creating…" : "Use template"}</Button></article>)}</div>
    {!visible.length && <div className="empty-state"><Icon name="search" size={24}/><strong>No templates found</strong><span>Try another search or ask a workspace admin to publish a template.</span></div>}
  </div>;
}
