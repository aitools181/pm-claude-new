"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Icon } from "../ui/Icon";
import { RuntimeStyle } from "../ui/RuntimeStyle";

type Item = { key: string; done: boolean; doneAt: string | null };
type Progress = { isAdmin: boolean; dismissed: boolean; items: Item[]; completedCount: number; totalCount: number };

const LABELS: Record<string, string> = {
  invite_teammate: "Invite a teammate", create_project: "Create your first project", create_task: "Create your first task",
  customize_field: "Add a custom field", enable_module: "Enable an optional module",
  complete_profile: "Complete your profile", comment_on_task: "Comment on a task", customize_my_tasks: "Customize My tasks",
};
const LINKS: Record<string, string> = {
  invite_teammate: "/admin/people", create_project: "/projects", create_task: "/quick", customize_field: "/admin/configure/fields",
  enable_module: "/admin/modules", complete_profile: "/settings/profile", comment_on_task: "/my-tasks", customize_my_tasks: "/my-tasks",
};

export function OnboardingChecklist() {
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => { api<Progress>("/onboarding/progress", { org: true }).then(setProgress).catch(() => {}); }, []);

  async function dismiss() {
    try { await api("/onboarding/dismiss", { method: "POST", org: true }); setProgress((p) => p ? { ...p, dismissed: true } : p); }
    catch { /* leave the checklist visible; failing to dismiss is low-stakes and self-evident (nothing changes) */ }
  }

  if (!progress || progress.dismissed || progress.completedCount === progress.totalCount) return null;

  return (
    <section className="onboarding-checklist">
      <div className="onboarding-checklist-head">
        <strong>Getting started</strong>
        <span className="muted">{progress.completedCount}/{progress.totalCount}</span>
        <button className="icon-btn" aria-label="Dismiss checklist" onClick={dismiss}><Icon name="close" size={14} /></button>
      </div>
      <div className="onboarding-checklist-bar"><RuntimeStyle vars={{ "--checklist-pct": `${(progress.completedCount / progress.totalCount) * 100}%` }} /></div>
      <div className="onboarding-checklist-items">
        {progress.items.map((item) => (
          <a key={item.key} href={LINKS[item.key] ?? "#"} className={item.done ? "done" : ""}>
            <Icon name={item.done ? "check" : "circle"} size={15} />
            <span>{LABELS[item.key] ?? item.key}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
