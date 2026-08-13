"use client";

import { Input as UiInput } from "../ui";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useModalDialog } from "../ui/useModalDialog";

type Results = { projects: any[]; workItems: any[]; comments: any[] };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>({ projects: [], workItems: [], comments: [] });

  const onKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
  }, []);
  useEffect(() => { window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onKey]);

  useEffect(() => {
    if (!q.trim()) { setRes({ projects: [], workItems: [], comments: [] }); return; }
    const t = setTimeout(() => { api<Results>(`/search?q=${encodeURIComponent(q)}`, { org: true }).then(setRes).catch(() => {}); }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const dialogRef = useModalDialog<HTMLDivElement>(open, () => setOpen(false), "input");

  if (!open) return null;
  const go = (url: string) => { setOpen(false); setQ(""); router.push(url); };

  return (
    <div className="palette-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div ref={dialogRef} tabIndex={-1} className="palette" role="dialog" aria-modal="true" aria-label="Search workspace">
        <UiInput autoFocus aria-label="Search projects, work items, and comments" placeholder="Search projects, work items, comments…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="palette-results">
          {res.projects.length > 0 && <div className="palette-group">Projects</div>}
          {res.projects.map((p) => <button type="button" key={p.id} className="palette-item" onClick={() => go(`/projects/${p.id}`)}><span className="mono muted">{p.keyPrefix}</span><span>{p.name}</span></button>)}
          {res.workItems.length > 0 && <div className="palette-group">Work items</div>}
          {res.workItems.map((w) => <button type="button" key={w.id} className="palette-item" onClick={() => go(`/projects/${w.owningProjectId}`)}><span className="mono muted">{w.key}</span><span>{w.title}</span></button>)}
          {res.comments.length > 0 && <div className="palette-group">Comments</div>}
          {res.comments.map((c) => <button type="button" key={c.id} className="palette-item" onClick={() => go(`/projects`)}><span aria-hidden="true">💬</span><span>{c.body.slice(0, 60)}</span></button>)}
          {q && res.projects.length + res.workItems.length + res.comments.length === 0 && <div className="palette-empty muted" role="status">No matches</div>}
          {!q && <div className="palette-empty muted">Type to search across this organization</div>}
        </div>
      </div>
    </div>
  );
}
