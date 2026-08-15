"use client";


import { Button as UiButton } from "../ui";
import { Input as UiInput, Select as UiSelect, Textarea as UiTextarea } from "../ui";
import { appPrompt, appConfirm } from "../ui/AppDialog";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiDownload, apiUpload, ApiError } from "../../lib/api";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/Toast";
import { useModalDialog } from "../ui/useModalDialog";
import { RuntimeStyle } from "../ui/RuntimeStyle";
import { celebrateIfEnabled } from "../ui/celebration";

type Item = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  status: string;
  statusCategory: string;
  priority: string;
  progress: number;
  version: number;
  parentId: string | null;
  owningProjectId: string;
  primaryOwnerUserId: string | null;
  startDate: string | null;
  dueDate: string | null;
  typeKey: string;
  typeName: string;
  subtaskCount: number;
  estimateMinutes?: number | null;
  storyPoints?: number | null;
  publicToOrganization?: boolean;
};

type Subtask = Pick<Item, "id" | "key" | "title" | "status" | "statusCategory" | "priority" | "progress" | "parentId">;
type Comment = { id: string; body: string; authorUserId: string; createdAt: string };
type Activity = { id: string; action: string; data: string | null; createdAt: string };
type Dependency = { id: string; predecessorId: string; successorId: string };
type SearchItem = { id: string; key: string; title: string };
type ChecklistItem = { id: string; text: string; done: boolean; rank: string; checklistTitle: string };
type Tag = { id: string; name: string };
type Attachment = { id: string; filename: string; currentVersionId: string | null };
type CustomField = { id: string; key: string; name: string; type: string; value: unknown; required?: boolean; options?: { id: string; value: string; label: string }[] };
type DirectoryMember = { id: string; displayName: string; email: string };
type Project = { id: string; name: string; color?: string };
type WorkContext = { placements: { id: string; projectId: string; projectName: string; color?: string; isOwning: boolean; sectionId: string | null }[]; collaborators: { userId: string; displayName: string; email: string }[]; liked: boolean; likeCount: number };
type Profile = { id: string; displayName: string; email: string };
type Section = { id: string; name: string; rank: string };

const STATUSES = ["To Do", "In Progress", "Done"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "work_item.created": "created this task",
    "work_item.subtask_created": "created a subtask",
    "work_item.updated": "updated task details",
    "work_item.assigned": "changed the assignee",
    "work_item.deleted": "moved this task to the recycle bin",
    "work_item.restored": "restored this task",
    "work_item.cloned": "duplicated this task",
    "board.moved": "moved this task on the board",
  };
  return labels[action] ?? action.replaceAll("_", " ").replaceAll(".", " · ");
}

export function TaskDrawer({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [currentId, setCurrentId] = useState(id);
  const [history, setHistory] = useState<string[]>([]);
  const [item, setItem] = useState<Item | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [tab, setTab] = useState<"comments" | "activity" | "dependencies">("comments");
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [picker, setPicker] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [dir, setDir] = useState<"blocks" | "blocked_by">("blocked_by");
  const [commentDraft, setCommentDraft] = useState("");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [watching, setWatching] = useState(false);
  const [context, setContext] = useState<WorkContext>({ placements: [], collaborators: [], liked: false, likeCount: 0 });
  const [directory, setDirectory] = useState<DirectoryMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [wide, setWide] = useState<"normal" | "wide" | "full">("normal");
  const [collabQuery, setCollabQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useModalDialog<HTMLElement>(true, () => {
    if (history.length) goBack();
    else onClose();
  }, ".drawer-title");
  const shareDialogRef = useModalDialog<HTMLDivElement>(shareOpen, () => setShareOpen(false), ".share-collab-picker input");

  useEffect(() => {
    setCurrentId(id);
    setHistory([]);
  }, [id]);

  async function load(targetId = currentId) {
    setLoading(true);
    setError(null);
    try {
      const [nextItem, nextSubtasks, nextComments, nextActivity, nextDeps, nextBlocked, nextChecklist, nextTags, nextAttachments, nextFields, nextContext, nextDirectory, nextProjects, nextProfile] = await Promise.all([
        api<Item>(`/work-items/${targetId}`, { org: true }),
        api<Subtask[]>(`/work-items/${targetId}/subtasks`, { org: true }).catch(() => []),
        api<Comment[]>(`/work-items/${targetId}/comments`, { org: true }).catch(() => []),
        api<Activity[]>(`/work-items/${targetId}/activity`, { org: true }).catch(() => []),
        api<Dependency[]>(`/work-items/${targetId}/dependencies`, { org: true }).catch(() => []),
        api<{ blocked: boolean }>(`/work-items/${targetId}/blocked`, { org: true }).catch(() => ({ blocked: false })),
        api<ChecklistItem[]>(`/work-items/${targetId}/checklist-items`, { org: true }).catch(() => []),
        api<Tag[]>(`/work-items/${targetId}/tags`, { org: true }).catch(() => []),
        api<Attachment[]>(`/work-items/${targetId}/attachments`, { org: true }).catch(() => []),
        api<CustomField[]>(`/work-items/${targetId}/custom-fields`, { org: true }).catch(() => []),
        api<WorkContext>(`/work-items/${targetId}/context`, { org: true }).catch(() => ({ placements: [], collaborators: [], liked: false, likeCount: 0 })),
        api<DirectoryMember[]>(`/directory/members`, { org: true }).catch(() => []),
        api<Project[]>(`/projects`, { org: true }).catch(() => []),
        api<Profile>(`/me/profile`, { org: true }).catch(() => null),
      ]);
      const nextSections = await api<Section[]>(`/projects/${nextItem.owningProjectId}/sections`, { org: true }).catch(() => []);
      setItem(nextItem);
      setSections(nextSections);
      setTitleDraft(nextItem.title);
      setDescriptionDraft(nextItem.description ?? "");
      setSubtasks(nextSubtasks);
      setChecklist(nextChecklist);
      setTags(nextTags);
      setAttachments(nextAttachments);
      setCustomFields(nextFields);
      setComments(nextComments);
      setActivity(nextActivity);
      setDeps(nextDeps);
      setBlocked(nextBlocked.blocked);
      setContext(nextContext); setDirectory(nextDirectory); setProjects(nextProjects); setProfile(nextProfile);
      setWatching(Boolean(nextProfile && nextContext.collaborators.some((row) => row.userId === nextProfile.id)));
    } catch (e) {
      setError(errorMessage(e, "Could not load this task"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(currentId); }, [currentId]);


  useEffect(() => {
    if (!picker.trim()) { setResults([]); return; }
    const timer = window.setTimeout(() => {
      api<{ workItems: SearchItem[] }>(`/search?q=${encodeURIComponent(picker)}`, { org: true })
        .then((response) => setResults(response.workItems.filter((row) => row.id !== currentId).slice(0, 6)))
        .catch(() => setResults([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [picker, currentId]);

  const completedSubtasks = useMemo(() => subtasks.filter((row) => row.statusCategory === "done").length, [subtasks]);
  const isDone = item?.statusCategory === "done";

  function openChild(childId: string) {
    setHistory((rows) => [...rows, currentId]);
    setCurrentId(childId);
    setTab("comments");
  }

  function goBack() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((rows) => rows.slice(0, -1));
    setCurrentId(previous);
  }

  async function patch(patch: Partial<Item>, successMessage?: string) {
    if (!item || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Item>(`/work-items/${currentId}`, {
        method: "PATCH",
        org: true,
        body: JSON.stringify({ version: item.version, patch }),
      });
      setItem(updated);
      setTitleDraft(updated.title);
      setDescriptionDraft(updated.description ?? "");
      onSaved();
      if (successMessage) toast({ message: successMessage });
      if (patch.status && updated.statusCategory === "done" && item.statusCategory !== "done") celebrateIfEnabled({ label: updated.title });
      await load(currentId);
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLICT") {
        setError("Someone else updated this task. The latest version has been loaded.");
        await load(currentId);
      } else setError(errorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function saveTitle() {
    const next = titleDraft.trim();
    if (!item || !next || next === item.title) { setTitleDraft(item?.title ?? ""); return; }
    await patch({ title: next });
  }

  async function saveDescription() {
    if (!item || descriptionDraft === (item.description ?? "")) return;
    await patch({ description: descriptionDraft });
  }

  async function addSubtask(event?: React.FormEvent) {
    event?.preventDefault();
    const title = subtaskDraft.trim();
    if (!title || addingSubtask) return;
    setAddingSubtask(true);
    setError(null);
    try {
      await api(`/work-items/${currentId}/subtasks`, {
        method: "POST",
        org: true,
        body: JSON.stringify({ title }),
      });
      setSubtaskDraft("");
      await load(currentId);
      onSaved();
      toast({ message: "Subtask added" });
    } catch (e) {
      setError(errorMessage(e, "Could not add the subtask"));
    } finally {
      setAddingSubtask(false);
    }
  }

  async function addChecklistItem(event?: React.FormEvent) {
    event?.preventDefault();
    const text = checklistDraft.trim();
    if (!text) return;
    try {
      await api(`/work-items/${currentId}/checklist-items`, { method: "POST", org: true, body: JSON.stringify({ text }) });
      setChecklistDraft(""); await load(currentId);
    } catch (e) { setError(errorMessage(e, "Could not add checklist item")); }
  }

  async function updateChecklistItem(row: ChecklistItem, patch: { text?: string; done?: boolean }) {
    try {
      await api(`/work-items/${currentId}/checklist-items/${row.id}`, { method: "PATCH", org: true, body: JSON.stringify(patch) });
      await load(currentId);
    } catch (e) { setError(errorMessage(e, "Could not update checklist item")); }
  }

  async function removeChecklistItem(row: ChecklistItem) {
    try { await api(`/work-items/${currentId}/checklist-items/${row.id}`, { method: "DELETE", org: true }); await load(currentId); }
    catch (e) { setError(errorMessage(e, "Could not remove checklist item")); }
  }

  async function addTag(event?: React.FormEvent) {
    event?.preventDefault();
    const name = tagDraft.trim();
    if (!name) return;
    try { await api(`/work-items/${currentId}/tags`, { method: "POST", org: true, body: JSON.stringify({ name }) }); setTagDraft(""); await load(currentId); }
    catch (e) { setError(errorMessage(e, "Could not add tag")); }
  }

  async function removeTag(tagId: string) {
    try { await api(`/work-items/${currentId}/tags/${tagId}`, { method: "DELETE", org: true }); await load(currentId); }
    catch (e) { setError(errorMessage(e, "Could not remove tag")); }
  }

  async function uploadAttachment(file: File) {
    setUploading(true); setError(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
      const grant = await api<{ uploadToken: string }>(`/work-items/${currentId}/attachments`, {
        method: "POST", org: true,
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", bytes: file.size, sha256 }),
      });
      await apiUpload(`/files/upload/${grant.uploadToken}`, file);
      await load(currentId); toast({ message: `${file.name} uploaded` });
    } catch (e) { setError(errorMessage(e, "Could not upload file")); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function downloadAttachment(row: Attachment) {
    if (!row.currentVersionId) return;
    try {
      const grant = await api<{ token: string }>(`/attachments/${row.currentVersionId}/download-grant`, { method: "POST", org: true });
      await apiDownload(`/files/download/${grant.token}`, row.filename);
    } catch (e) { setError(errorMessage(e, "Could not download file")); }
  }

  async function updateCustomField(field: CustomField, value: unknown) {
    try { await api(`/work-items/${currentId}/custom-fields`, { method: "PUT", org: true, body: JSON.stringify({ fieldId: field.id, value }) }); await load(currentId); }
    catch (e) { setError(errorMessage(e, "Could not update custom field")); }
  }

  async function addComment() {
    if (!commentDraft.trim()) return;
    try {
      await api(`/work-items/${currentId}/comments`, { method: "POST", org: true, body: JSON.stringify({ body: commentDraft.trim() }) });
      setCommentDraft("");
      await load(currentId);
    } catch (e) { setError(errorMessage(e, "Could not post the comment")); }
  }

  async function toggleWatch() {
    try {
      if (watching) await api(`/work-items/${currentId}/watch`, { method: "DELETE", org: true });
      else await api(`/work-items/${currentId}/watch`, { method: "POST", org: true });
      setWatching(!watching);
      toast({ message: watching ? "Stopped watching" : "You are watching this task" });
    } catch (e) { setError(errorMessage(e, "Could not update watchers")); }
  }

  async function duplicate() {
    try {
      const response = await api<{ clone: Item }>(`/work-items/${currentId}/clone`, {
        method: "POST",
        org: true,
        body: JSON.stringify({ includeSubtasks: true, keepOwner: true, keepDates: true }),
      });
      onSaved();
      toast({ message: `Created ${response.clone.key}` });
      setHistory((rows) => [...rows, currentId]);
      setCurrentId(response.clone.id);
    } catch (e) { setError(errorMessage(e, "Could not duplicate the task")); }
  }

  async function remove() {
    if (!await appConfirm(`Move ${item?.key ?? "this task"} to the recycle bin?`)) return;
    try {
      await api(`/work-items/${currentId}`, { method: "DELETE", org: true });
      onSaved();
      toast({ message: "Task moved to the recycle bin" });
      if (history.length) goBack(); else onClose();
    } catch (e) { setError(errorMessage(e, "Could not delete the task")); }
  }

  async function addDependency(otherId: string) {
    const body = dir === "blocked_by"
      ? { predecessorId: otherId, successorId: currentId }
      : { predecessorId: currentId, successorId: otherId };
    try {
      await api("/dependencies", { method: "POST", org: true, body: JSON.stringify(body) });
      setPicker("");
      setResults([]);
      await load(currentId);
    } catch (e) { setError(errorMessage(e, "Could not add the dependency")); }
  }

  async function toggleLike() {
    try { const next = await api<{ liked: boolean; likeCount: number }>(`/work-items/${currentId}/like`, { method: "PUT", org: true, body: JSON.stringify({ liked: !context.liked }) }); setContext((c) => ({ ...c, ...next })); }
    catch (e) { setError(errorMessage(e, "Could not update like")); }
  }

  async function addCollaborator(userId: string) {
    try { await api(`/work-items/${currentId}/collaborators/${userId}`, { method: "PUT", org: true }); setCollabQuery(""); await load(currentId); }
    catch (e) { setError(errorMessage(e, "Could not add collaborator")); }
  }

  async function removeCollaborator(userId: string) {
    try { await api(`/work-items/${currentId}/collaborators/${userId}`, { method: "DELETE", org: true }); await load(currentId); }
    catch (e) { setError(errorMessage(e, "Could not remove collaborator")); }
  }

  async function addToProject(projectId: string) {
    try { await api(`/work-items/${currentId}/links`, { method: "POST", org: true, body: JSON.stringify({ targetProjectId: projectId }) }); setProjectQuery(""); await load(currentId); toast({ message: "Added to another project" }); }
    catch (e) { setError(errorMessage(e, "Could not add to project")); }
  }

  async function moveSection(sectionId: string | null) {
    try {
      await api(`/work-items/${currentId}/section`, { method: "PATCH", org: true, body: JSON.stringify({ sectionId }) });
      await load(currentId);
      onSaved();
      toast({ message: sectionId ? "Section updated" : "Removed from section" });
    } catch (e) { setError(errorMessage(e, "Could not update section")); }
  }

  async function unlinkPlacement(placementId: string) {
    try { await api(`/placements/${placementId}`, { method: "DELETE", org: true }); await load(currentId); }
    catch (e) { setError(errorMessage(e, "Could not remove project link")); }
  }

  async function followUp() {
    try { const next = await api<Item>(`/work-items/${currentId}/follow-up`, { method: "POST", org: true }); toast({ message: `Created ${next.key}` }); setHistory((h) => [...h, currentId]); setCurrentId(next.id); }
    catch (e) { setError(errorMessage(e, "Could not create follow-up")); }
  }

  async function convert(typeKey: "task" | "milestone" | "approval") {
    try { await api(`/work-items/${currentId}/convert`, { method: "POST", org: true, body: JSON.stringify({ typeKey }) }); setMoreOpen(false); await load(currentId); onSaved(); toast({ message: `Converted to ${typeKey}` }); }
    catch (e) { setError(errorMessage(e, "Could not convert task type")); }
  }

  async function mergeDuplicate() {
    const query = await appPrompt("Search for the task to keep (key or title)"); if (!query?.trim()) return;
    try { const found = await api<{ workItems: SearchItem[] }>(`/search?q=${encodeURIComponent(query.trim())}`, { org: true }); const target = found.workItems.find((row) => row.id !== currentId); if (!target) throw new Error("No matching task found"); if (!await appConfirm(`Merge ${item?.key} into ${target.key}? The duplicate will be closed and removed.`)) return; await api(`/work-items/${currentId}/merge`, { method: "POST", org: true, body: JSON.stringify({ targetId: target.id }) }); toast({ message: `Merged into ${target.key}` }); onSaved(); onClose(); }
    catch (e) { setError(errorMessage(e, "Could not merge duplicate")); }
  }

  async function togglePublic() {
    try { await api(`/work-items/${currentId}/public`, { method: "PUT", org: true, body: JSON.stringify({ public: !item?.publicToOrganization }) }); setMoreOpen(false); await load(currentId); toast({ message: item?.publicToOrganization ? "Task is private to project access" : "Task is visible to workspace members with access" }); }
    catch (e) { setError(errorMessage(e, "Could not change task visibility")); }
  }

  async function removeDependency(depId: string) {
    try { await api(`/dependencies/${depId}`, { method: "DELETE", org: true }); await load(currentId); }
    catch (e) { setError(errorMessage(e, "Could not remove the dependency")); }
  }

  return (
    <>
      <button className="drawer-overlay" aria-label="Close task" onClick={onClose} />
      <aside ref={drawerRef} tabIndex={-1} className={`drawer task-drawer asana-task-drawer ${wide !== "normal" ? "wide" : ""}`} data-wide={wide === "full" ? "true" : undefined} role="dialog" aria-modal="true" aria-label={item ? `${item.key}: ${item.title}` : "Work item"}>
        <header className="drawer-head task-drawer-head asana-task-head">
          <div className="drawer-breadcrumb">
            {history.length > 0 && <button className="icon-btn" aria-label="Back to parent task" onClick={goBack}><Icon name="arrowLeft" /></button>}
            <button className={`mark-complete-btn ${isDone ? "done" : ""}`} onClick={() => item && patch({ status: isDone ? "To Do" : "Done" }, isDone ? "Task reopened" : "Task completed")}><Icon name={isDone ? "check" : "circle"} size={17} />{isDone ? "Completed" : "Mark complete"}</button>
            <span className="task-head-key mono">{item?.key ?? "Loading…"}</span>
          </div>
          <div className="drawer-actions task-head-actions">
            <button className={`task-like-btn ${context.liked ? "liked" : ""}`} title="Like task" onClick={toggleLike}><span>♡</span>{context.likeCount > 0 && <small>{context.likeCount}</small>}</button>
            <button className="icon-btn" title="Copy task link" aria-label="Copy task link" onClick={() => { navigator.clipboard.writeText(location.href); toast({ message: "Task link copied" }); }}><Icon name="link" /></button>
            <UiButton variant="secondary" size="compact" className="task-share-btn" onClick={() => setShareOpen(true)}><Icon name="people" size={15} />Share</UiButton>
            <button className="icon-btn task-expand-btn" title={wide === "normal" ? "Expand task" : wide === "wide" ? "Full screen" : "Exit full screen"} aria-label={wide === "normal" ? "Expand task view" : wide === "wide" ? "Full screen task view" : "Exit full screen task view"} onClick={() => setWide(wide === "normal" ? "wide" : wide === "wide" ? "full" : "normal")}><span className="expand-glyph" data-state={wide} aria-hidden="true">⤢</span></button>
            <div className="task-more-wrap"><button className="icon-btn" title="More actions" aria-label="More task actions" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}><Icon name="more" /></button>{moreOpen && <div className="task-more-menu">
              <button onClick={() => { setMoreOpen(false); document.querySelector<HTMLInputElement>('.project-picker-input')?.focus(); }}><Icon name="projects" size={15} />Add to another project</button>
              <button onClick={() => { setMoreOpen(false); document.querySelector<HTMLInputElement>('.subtask-create input')?.focus(); }}><Icon name="subtask" size={15} />Add subtask</button>
              <button onClick={() => { setMoreOpen(false); setTab("dependencies"); }}><Icon name="link" size={15} />Add dependencies</button>
              <button onClick={() => { setMoreOpen(false); document.querySelector<HTMLInputElement>('.inline-detail-form input')?.focus(); }}><Icon name="tag" size={15} />Add tags</button>
              <button onClick={() => { setMoreOpen(false); fileInputRef.current?.click(); }}><Icon name="paperclip" size={15} />Attach files</button>
              <button onClick={() => { setMoreOpen(false); followUp(); }}><Icon name="copy" size={15} />Create follow-up task</button>
              <button onClick={() => { setMoreOpen(false); mergeDuplicate(); }}><Icon name="integration" size={15} />Merge duplicate tasks</button>
              <span className="task-menu-label">Convert to</span>
              <button onClick={() => convert("task")}><Icon name="check" size={15} />Task</button>
              <button onClick={() => convert("milestone")}><span className="diamond-mini">◆</span>Milestone</button>
              <button onClick={() => convert("approval")}><Icon name="approval" size={15} />Approval</button>
              <div className="menu-sep" />
              <button onClick={() => { setMoreOpen(false); duplicate(); }}><Icon name="copy" size={15} />Duplicate task</button>
              <button onClick={() => { setMoreOpen(false); window.print(); }}><Icon name="docs" size={15} />Print task</button>
              <button onClick={togglePublic}><Icon name={item?.publicToOrganization ? "lock" : "people"} size={15} />{item?.publicToOrganization ? "Make private" : "Make public to workspace"}</button>
              <button className="danger-menu-item" onClick={() => { setMoreOpen(false); remove(); }}><Icon name="trash" size={15} />Delete task</button>
            </div>}</div>
            <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
          </div>
        </header>

        {loading && <div className="drawer-loading"><span className="skeleton skeleton-title" /><span className="skeleton" /><span className="skeleton" /></div>}

        {!loading && item && (
          <div className="drawer-body task-drawer-body">
            {error && <div className="callout callout-danger drawer-error"><span>{error}</span><button className="icon-btn" aria-label="Dismiss error" onClick={() => setError(null)}><Icon name="close" size={15} /></button></div>}

            <div className={`task-privacy-banner ${item.publicToOrganization ? "public" : ""}`}><span><Icon name={item.publicToOrganization ? "people" : "lock"} size={14}/>{item.publicToOrganization ? "This task is visible to workspace members with access." : "This task is private to members of this project."}<span className="privacy-type">· {item.typeName}</span></span><button className="text-button" onClick={togglePublic}>{item.publicToOrganization ? "Make private" : "Make public"}</button></div>
            <div className="task-title-row asana-task-title-row">
              <UiInput ref={titleRef} className="drawer-title" aria-label="Task title" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                if (e.key === "Escape") { setTitleDraft(item.title); e.currentTarget.blur(); }
              }} />
            </div>

            {blocked && <div className="blocked-banner"><Icon name="lock" size={15} /><span>Blocked by an incomplete dependency</span></div>}

            <section className="task-meta-card asana-task-fields" aria-label="Task details">
              <label className="task-meta-row"><span><Icon name="user" size={16}/>Assignee</span><UiSelect value={item.primaryOwnerUserId ?? ""} onChange={(e)=>patch({primaryOwnerUserId:e.target.value||null})}><option value="">Unassigned</option>{directory.map((member)=><option key={member.id} value={member.id}>{member.displayName}</option>)}</UiSelect></label>
              <label className="task-meta-row"><span><Icon name="calendar" size={16}/>Due date</span><UiInput type="date" value={item.dueDate ?? ""} onChange={(e)=>patch({dueDate:e.target.value||null})}/></label>
              <label className="task-meta-row"><span><Icon name="calendar" size={16}/>Start date</span><UiInput type="date" value={item.startDate ?? ""} onChange={(e)=>patch({startDate:e.target.value||null})}/></label>
              <div className="task-meta-row project-field-row"><span><Icon name="projects" size={16}/>Projects</span><div className="task-project-stack">{context.placements.map((placement)=><span className="task-project-pill" key={placement.id}><RuntimeStyle as="i" className="runtime-bg" vars={{ "--runtime-bg": placement.color || "var(--ui-action)" }} />{placement.projectName}{!placement.isOwning&&<button onClick={()=>unlinkPlacement(placement.id)} aria-label={`Remove from ${placement.projectName}`}>×</button>}</span>)}<div className="task-project-picker"><UiInput className="project-picker-input" value={projectQuery} onChange={(e)=>setProjectQuery(e.target.value)} placeholder="Add to project"/>{projectQuery&&<div className="task-picker-results">{projects.filter((p)=>!context.placements.some((x)=>x.projectId===p.id)&&p.name.toLowerCase().includes(projectQuery.toLowerCase())).slice(0,7).map((p)=><button key={p.id} onClick={()=>addToProject(p.id)}><RuntimeStyle as="span" className="project-glyph runtime-bg" vars={{ "--runtime-bg": p.color }}>{p.name.slice(0,1)}</RuntimeStyle>{p.name}</button>)}</div>}</div></div></div>
              <label className="task-meta-row"><span><Icon name="list" size={16}/>Section</span><UiSelect value={context.placements.find((p)=>p.isOwning)?.sectionId ?? ""} onChange={(e)=>moveSection(e.target.value || null)}><option value="">No section</option>{sections.map((section)=><option key={section.id} value={section.id}>{section.name}</option>)}</UiSelect></label>
              <label className="task-meta-row"><span><Icon name="check" size={16}/>Status</span><UiSelect value={item.status} onChange={(e)=>patch({status:e.target.value})}>{STATUSES.map((status)=><option key={status}>{status}</option>)}</UiSelect></label>
              <label className="task-meta-row"><span><Icon name="flag" size={16}/>Priority</span><UiSelect value={item.priority} onChange={(e)=>patch({priority:e.target.value})}>{PRIORITIES.map((priority)=><option key={priority} value={priority}>{priority[0].toUpperCase()+priority.slice(1)}</option>)}</UiSelect></label>
              <label className="task-meta-row"><span><Icon name="time" size={16}/>Estimated time</span><UiInput className="number-field" type="number" min="0" step="15" value={item.estimateMinutes ?? ""} placeholder="minutes" onChange={(e)=>patch({estimateMinutes:e.target.value?Number(e.target.value):null})}/></label>
              <label className="task-meta-row"><span><Icon name="chart" size={16}/>Story points</span><UiInput className="number-field" type="number" min="0" step="1" value={item.storyPoints ?? ""} placeholder="points" onChange={(e)=>patch({storyPoints:e.target.value?Number(e.target.value):null})}/></label>
              <label className="task-meta-row task-progress-row"><span><Icon name="chart" size={16}/>Progress</span><span className="progress-control"><input type="range" min="0" max="100" step="10" value={item.progress} onChange={(e)=>setItem({...item,progress:Number(e.target.value)})} onMouseUp={(e)=>patch({progress:Number((e.target as HTMLInputElement).value)})}/><strong>{item.progress}%</strong></span></label>
              <div className="task-meta-row collaborator-field-row"><span><Icon name="people" size={16}/>Collaborators</span><div className="collaborator-stack"><div className="collaborator-faces">{context.collaborators.slice(0,6).map((c)=><button key={c.userId} title={c.displayName} onClick={()=>removeCollaborator(c.userId)}>{c.displayName.slice(0,1).toUpperCase()}</button>)}<button className="collab-add" type="button" aria-label="Add collaborator" title="Add collaborator" onClick={()=>document.querySelector<HTMLInputElement>('.collaborator-field-row .collab-picker input')?.focus()}>+</button></div><div className="collab-picker"><UiInput value={collabQuery} onChange={(e)=>setCollabQuery(e.target.value)} placeholder="Add collaborator"/>{collabQuery&&<div className="task-picker-results">{directory.filter((m)=>!context.collaborators.some((c)=>c.userId===m.id)&&m.displayName.toLowerCase().includes(collabQuery.toLowerCase())).slice(0,6).map((m)=><button key={m.id} onClick={()=>addCollaborator(m.id)}><span className="mini-avatar">{m.displayName.slice(0,1)}</span>{m.displayName}</button>)}</div>}</div><button className="follow-task-button" data-on={watching} onClick={toggleWatch}>{watching?"Following":"Follow"}</button></div></div>
            </section>
            {customFields.length === 0 && <div className="task-custom-empty">No custom fields in this project</div>}

            <section className="drawer-section">
              <h3><Icon name="docs" size={17} />Description</h3>
              <UiTextarea className="description-editor" value={descriptionDraft} onChange={(e) => setDescriptionDraft(e.target.value)} onBlur={saveDescription} placeholder="Add a description, context, or acceptance criteria…" />
            </section>

            <section className="drawer-section subtask-section">
              <div className="drawer-section-head">
                <h3><Icon name="subtask" size={17} />Subtasks</h3>
                <span>{completedSubtasks}/{subtasks.length} complete</span>
              </div>
              {subtasks.length > 0 && <div className="subtask-progress" aria-label={`${completedSubtasks} of ${subtasks.length} subtasks complete`}><RuntimeStyle as="span" className="runtime-width" vars={{ "--runtime-width": `${subtasks.length ? (completedSubtasks / subtasks.length) * 100 : 0}%` }} /></div>}
              <div className="subtask-list">
                {subtasks.map((subtask) => (
                  <button type="button" className="subtask-row" key={subtask.id} onClick={() => openChild(subtask.id)}>
                    <span className={`subtask-check ${subtask.statusCategory === "done" ? "done" : ""}`}><Icon name={subtask.statusCategory === "done" ? "check" : "circle"} size={17} /></span>
                    <span className="subtask-title">{subtask.title}</span>
                    <span className="mono">{subtask.key}</span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                ))}
              </div>
              <form className="subtask-create" onSubmit={addSubtask}>
                <Icon name="plus" size={17} />
                <UiInput value={subtaskDraft} onChange={(e) => setSubtaskDraft(e.target.value)} placeholder="Add a subtask and press Enter" aria-label="New subtask title" />
                {subtaskDraft.trim() && <UiButton type="submit" variant="primary" size="compact"  disabled={addingSubtask}>{addingSubtask ? "Adding…" : "Add"}</UiButton>}
              </form>
            </section>

            <section className="drawer-section compact-detail-section">
              <div className="drawer-section-head"><h3><Icon name="check" size={17} />Checklist</h3><span>{checklist.filter((row) => row.done).length}/{checklist.length} complete</span></div>
              <div className="checklist-list">
                {checklist.map((row) => <div className="checklist-row" key={row.id}>
                  <button className={`subtask-check ${row.done ? "done" : ""}`} aria-label={row.done ? "Mark incomplete" : "Mark complete"} onClick={() => updateChecklistItem(row, { done: !row.done })}><Icon name={row.done ? "check" : "circle"} size={17} /></button>
                  <UiInput value={row.text} onChange={(e) => setChecklist((items) => items.map((item) => item.id === row.id ? { ...item, text: e.target.value } : item))} onBlur={(e) => e.target.value.trim() && updateChecklistItem(row, { text: e.target.value.trim() })} />
                  <button className="icon-btn" aria-label="Remove checklist item" onClick={() => removeChecklistItem(row)}><Icon name="close" size={14} /></button>
                </div>)}
              </div>
              <form className="subtask-create" onSubmit={addChecklistItem}><Icon name="plus" size={17} /><UiInput value={checklistDraft} onChange={(e) => setChecklistDraft(e.target.value)} placeholder="Add checklist item" />{checklistDraft.trim() && <UiButton type="submit" variant="primary" size="compact" >Add</UiButton>}</form>
            </section>

            <section className="drawer-section compact-detail-section">
              <div className="drawer-section-head"><h3><Icon name="tag" size={17} />Tags</h3><span>{tags.length}</span></div>
              <div className="task-tags">{tags.map((tag) => <span className="task-tag" key={tag.id}>{tag.name}<button aria-label={`Remove ${tag.name}`} onClick={() => removeTag(tag.id)}>×</button></span>)}</div>
              <form className="inline-detail-form" onSubmit={addTag}><UiInput value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="Add a tag" /><UiButton type="submit" variant="secondary" size="compact" className="btn-secondary" disabled={!tagDraft.trim()}>Add</UiButton></form>
            </section>

            <section className="drawer-section compact-detail-section">
              <div className="drawer-section-head"><h3><Icon name="paperclip" size={17} />Files</h3><UiButton variant="secondary" size="compact" className="btn-secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? "Uploading…" : "Attach file"}</UiButton></div>
              <input ref={fileInputRef} type="file" hidden onChange={(e) => e.target.files?.[0] && uploadAttachment(e.target.files[0])} />
              {attachments.length === 0 ? <p className="muted compact-copy">No files attached.</p> : <div className="attachment-list">{attachments.map((row) => <button key={row.id} className="attachment-row" disabled={!row.currentVersionId} onClick={() => downloadAttachment(row)}><Icon name="paperclip" size={15} /><span>{row.filename}</span><Icon name="download" size={15} /></button>)}</div>}
            </section>

            {customFields.length > 0 && <section className="drawer-section compact-detail-section">
              <div className="drawer-section-head"><h3><Icon name="sliders" size={17} />Custom fields</h3><span>{customFields.length}</span></div>
              <div className="custom-field-grid asana-custom-field-grid">{customFields.map((field) => <label key={field.key}><span>{field.name}{field.required ? <em>Required</em> : null}</span>{field.type === "formula" ? <span className="formula-value" title="Computed automatically">{field.value == null ? "—" : String(field.value)} <em>ƒ</em></span> : field.type === "checkbox" ? <input type="checkbox" checked={Boolean(field.value)} onChange={(e)=>updateCustomField(field,e.target.checked)}/> : field.type === "number" ? <UiInput type="number" defaultValue={field.value == null ? "" : String(field.value)} onBlur={(e)=>updateCustomField(field,e.target.value === "" ? null : Number(e.target.value))}/> : field.type === "date" ? <UiInput type="date" defaultValue={String(field.value ?? "")} onBlur={(e)=>updateCustomField(field,e.target.value || null)}/> : field.type === "select" ? <UiSelect value={String(field.value ?? "")} onChange={(e)=>updateCustomField(field,e.target.value || null)}><option value="">None</option>{(field.options ?? []).map((option)=><option key={option.id} value={option.id}>{option.label}</option>)}</UiSelect> : field.type === "user" ? <UiSelect value={String(field.value ?? "")} onChange={(e)=>updateCustomField(field,e.target.value || null)}><option value="">No one</option>{directory.map((member)=><option key={member.id} value={member.id}>{member.displayName}</option>)}</UiSelect> : <UiInput type={field.type === "url" ? "url" : "text"} defaultValue={Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "")} onBlur={(e)=>updateCustomField(field,e.target.value || null)}/>}</label>)}</div>
            </section>}

            <nav className="drawer-tabs" aria-label="Task collaboration tabs">
              {([[
                "comments", "Comments", "comment"
              ], ["activity", "Activity", "activity"], ["dependencies", "Dependencies", "link"]] as const).map(([value, label, icon]) => (
                <button key={value} data-active={tab === value} onClick={() => setTab(value)}><Icon name={icon} size={16} />{label}{value === "comments" && comments.length > 0 ? <span>{comments.length}</span> : null}</button>
              ))}
            </nav>

            <section className="drawer-tab-panel">
              {tab === "comments" && (
                <>
                  {comments.length === 0 && <div className="compact-empty"><Icon name="comment" /><strong>Start the conversation</strong><span>Share an update, decision, or question with the team.</span></div>}
                  {comments.map((comment) => (
                    <article key={comment.id} className="comment modern-comment">
                      <span className="comment-avatar">{comment.authorUserId.slice(0, 1).toUpperCase()}</span>
                      <div><div className="meta"><strong>{comment.authorUserId.slice(0, 8)}</strong><span>{new Date(comment.createdAt).toLocaleString()}</span></div><div className="body">{comment.body}</div></div>
                    </article>
                  ))}
                  <div className="comment-box modern-comment-box">
                    <UiTextarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Write a comment…" onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addComment();
                    }} />
                    <div><span><kbd>⌘</kbd> + <kbd>Enter</kbd> to send</span><UiButton variant="primary" size="compact"  onClick={addComment} disabled={!commentDraft.trim()}>Comment</UiButton></div>
                  </div>
                </>
              )}

              {tab === "activity" && (
                <div className="activity-timeline">
                  {activity.length === 0 && <div className="compact-empty"><Icon name="activity" /><strong>No activity yet</strong></div>}
                  {activity.map((entry) => (
                    <div key={entry.id} className="timeline-entry"><span className="timeline-dot" /><div><strong>{activityLabel(entry.action)}</strong>{entry.data && <span>{entry.data}</span>}<time>{new Date(entry.createdAt).toLocaleString()}</time></div></div>
                  ))}
                </div>
              )}

              {tab === "dependencies" && (
                <>
                  {deps.length === 0 && <div className="compact-empty"><Icon name="link" /><strong>No dependencies</strong><span>Connect work to make blockers visible.</span></div>}
                  {deps.map((dep) => {
                    const otherId = dep.predecessorId === currentId ? dep.successorId : dep.predecessorId;
                    return <div key={dep.id} className="dependency-row"><span className="dependency-direction">{dep.predecessorId === currentId ? "Blocks" : "Blocked by"}</span><span className="mono">{otherId.slice(0, 8)}</span><button className="icon-btn" aria-label="Remove dependency" onClick={() => removeDependency(dep.id)}><Icon name="close" size={15} /></button></div>;
                  })}
                  <div className="dependency-picker"><UiSelect value={dir} onChange={(e) => setDir(e.target.value as "blocks" | "blocked_by")}><option value="blocked_by">Blocked by</option><option value="blocks">Blocks</option></UiSelect><UiInput placeholder="Search tasks…" value={picker} onChange={(e) => setPicker(e.target.value)} /></div>
                  {results.length > 0 && <div className="dependency-results">{results.map((result) => <button key={result.id} onClick={() => addDependency(result.id)}><span className="mono">{result.key}</span><span>{result.title}</span></button>)}</div>}
                </>
              )}
            </section>
          </div>
        )}
      </aside>
      {shareOpen && <div className="modal-backdrop task-share-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setShareOpen(false)}><div ref={shareDialogRef} tabIndex={-1} className="task-share-modal" role="dialog" aria-modal="true" aria-labelledby="task-share-title"><div className="modal-title-row"><div><h2 id="task-share-title">Share task</h2><p>{item?.key} · {item?.title}</p></div><button className="icon-btn" aria-label="Close share task dialog" onClick={()=>setShareOpen(false)}><Icon name="close"/></button></div><div className="task-share-link"><UiInput className="input" aria-label="Task link" readOnly value={typeof location!=="undefined"?location.href:""}/><UiButton variant="secondary"  onClick={()=>{navigator.clipboard.writeText(location.href);toast({message:"Task link copied"})}}>Copy link</UiButton></div><div className="share-section-title">Collaborators</div><div className="member-access-list compact-members">{context.collaborators.map((c)=><div key={c.userId}><span className="mini-avatar">{c.displayName.slice(0,1)}</span><span className="member-copy"><strong>{c.displayName}</strong><small>{c.email}</small></span><button className="text-button" onClick={()=>removeCollaborator(c.userId)}>Remove</button></div>)}</div><div className="collab-picker share-collab-picker"><UiInput className="input" aria-label="Add collaborators" value={collabQuery} onChange={(e)=>setCollabQuery(e.target.value)} placeholder="Add people by name"/>{collabQuery&&<div className="task-picker-results static-results">{directory.filter((m)=>!context.collaborators.some((c)=>c.userId===m.id)&&(`${m.displayName} ${m.email}`).toLowerCase().includes(collabQuery.toLowerCase())).slice(0,6).map((m)=><button key={m.id} onClick={()=>addCollaborator(m.id)}><span className="mini-avatar">{m.displayName.slice(0,1)}</span>{m.displayName}<small>{m.email}</small></button>)}</div>}</div><label className="share-public-toggle"><input type="checkbox" checked={Boolean(item?.publicToOrganization)} onChange={togglePublic}/> Visible to workspace members who can access the project</label><div className="modal-foot right"><UiButton variant="primary"  onClick={()=>setShareOpen(false)}>Done</UiButton></div></div></div>}
    </>
  );
}
