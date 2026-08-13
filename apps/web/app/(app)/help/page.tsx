"use client";


import { Input as UiInput } from "../../../components/ui";
import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";

const topics = [
  ["Getting started", "Create projects, invite teammates, build sections and add work."],
  ["Tasks & subtasks", "Use task details for assignees, dates, projects, sections, custom fields, dependencies, files and subtasks."],
  ["Views", "Switch the same project between List, Board, Timeline, Gantt, Dashboard, Calendar, Messages and Files."],
  ["Inbox", "Review activity, bookmarks, archive and mentions, and tune notification preferences."],
  ["Customize", "Configure project fields, forms, apps, task types, bundles, status templates, rules and AI tools."],
  ["Account & workspace", "Manage profile, display, notifications, email forwarding, sessions, apps and workspace settings."],
] as const;

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const shown = topics.filter(([title, body]) => `${title} ${body}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="asana-page help-page">
    <header className="simple-page-head"><div><h1>Help</h1><p>Learn the workspace without leaving your work.</p></div></header>
    <div className="help-search"><Icon name="search" size={18}/><UiInput value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search help" autoFocus /></div>
    <div className="help-grid">{shown.map(([title, body])=><article className="help-card" key={title}><span className="help-card-icon"><Icon name="help" size={18}/></span><div><h2>{title}</h2><p>{body}</p></div><Icon name="chevronRight" size={16}/></article>)}</div>
    <section className="help-shortcuts"><h2>Keyboard shortcuts</h2><div><span>Open search</span><kbd>⌘ K</kbd></div><div><span>Create work</span><kbd>C</kbd></div><div><span>Close task or menu</span><kbd>Esc</kbd></div></section>
  </div>;
}
