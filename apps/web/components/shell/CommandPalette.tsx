"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

type Results = { projects: any[]; workItems: any[]; comments: any[] };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>({ projects: [], workItems: [], comments: [] });

  const onKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    if (e.key === "Escape") setOpen(false);
  }, []);
  useEffect(() => { window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onKey]);

  useEffect(() => {
    if (!q.trim()) { setRes({ projects: [], workItems: [], comments: [] }); return; }
    const t = setTimeout(() => { api<Results>(`/search?q=${encodeURIComponent(q)}`, { org: true }).then(setRes).catch(() => {}); }, 180);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) return null;
  const go = (url: string) => { setOpen(false); setQ(""); router.push(url); };

  return (
    <div className="palette-overlay" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Search projects, work items, comments…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="palette-results">
          {res.projects.length > 0 && <div className="palette-group">Projects</div>}
          {res.projects.map((p) => <div key={p.id} className="palette-item" onClick={() => go(`/projects/${p.id}`)}><span className="mono" style={{ color: "var(--ink-3)" }}>{p.keyPrefix}</span> {p.name}</div>)}
          {res.workItems.length > 0 && <div className="palette-group">Work items</div>}
          {res.workItems.map((w) => <div key={w.id} className="palette-item" onClick={() => go(`/projects/${w.owningProjectId}`)}><span className="mono" style={{ color: "var(--ink-3)" }}>{w.key}</span> {w.title}</div>)}
          {res.comments.length > 0 && <div className="palette-group">Comments</div>}
          {res.comments.map((c) => <div key={c.id} className="palette-item" onClick={() => go(`/projects`)}>💬 {c.body.slice(0, 60)}</div>)}
          {q && res.projects.length + res.workItems.length + res.comments.length === 0 && <div className="palette-item" style={{ color: "var(--ink-3)" }}>No matches</div>}
          {!q && <div className="palette-item" style={{ color: "var(--ink-3)" }}>Type to search across this organization</div>}
        </div>
      </div>
    </div>
  );
}
