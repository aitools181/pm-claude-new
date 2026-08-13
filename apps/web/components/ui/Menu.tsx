"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from "react";
import { Icon } from "./Icon";
import { RuntimeStyle } from "./RuntimeStyle";

type MenuItem = { id: string; label: ReactNode; icon?: ReactNode; disabled?: boolean; destructive?: boolean; onSelect: () => void };

function enabledIndexes(items: MenuItem[]) { return items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled).map(({ index }) => index); }
function moveMenuFocus(event: KeyboardEvent<HTMLButtonElement>, items: MenuItem[], refs: MutableRefObject<Array<HTMLButtonElement | null>>, index: number) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  const enabled = enabledIndexes(items); if (!enabled.length) return true;
  event.preventDefault();
  const current = Math.max(0, enabled.indexOf(index));
  let next = current;
  if (event.key === "ArrowDown") next = (current + 1) % enabled.length;
  if (event.key === "ArrowUp") next = (current - 1 + enabled.length) % enabled.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = enabled.length - 1;
  refs.current[enabled[next]!]?.focus();
  return true;
}

export function DropdownMenu({ label, items, trigger, className = "" }: { label: string; items: MenuItem[]; trigger: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusItem = (last = false) => requestAnimationFrame(() => { const enabled = enabledIndexes(items); refs.current[enabled[last ? enabled.length - 1 : 0] ?? -1]?.focus(); });
  const close = (restore = false) => { setOpen(false); if (restore) requestAnimationFrame(() => triggerRef.current?.focus()); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) close(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(true); } };
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className={`ui-menu-root ${className}`.trim()} onBlurCapture={(event) => { if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={triggerRef} type="button" className="ui-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) focusItem(false); }} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); focusItem(event.key === "ArrowUp"); }
    }}>{trigger}</button>
    {open ? <div className="ui-menu" role="menu" aria-label={label}>{items.map((item, index) => <button key={item.id} ref={(node) => { refs.current[index] = node; }} type="button" role="menuitem" disabled={item.disabled} data-destructive={item.destructive || undefined}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(true); return; } moveMenuFocus(event, items, refs, index); }}
      onClick={() => { item.onSelect(); close(true); }}>{item.icon ? <span className="ui-menu-icon">{item.icon}</span> : null}<span>{item.label}</span></button>)}</div> : null}
  </div>;
}

export function ContextMenu({ children, items, label = "Context menu" }: { children: ReactNode; items: MenuItem[]; label?: string }) {
  const [state, setState] = useState<{ x: number; y: number } | null>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const openAt = (x: number, y: number) => { setState({ x, y }); requestAnimationFrame(() => { const enabled = enabledIndexes(items); refs.current[enabled[0] ?? -1]?.focus(); }); };
  const close = (restore = false) => { setState(null); if (restore) requestAnimationFrame(() => targetRef.current?.focus()); };
  useEffect(() => {
    if (!state) return;
    const outside = (event: MouseEvent) => { if (!(event.target as Element)?.closest?.(".ui-context-menu")) close(false); };
    const blur = () => close(false);
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(true); } };
    window.addEventListener("mousedown", outside); window.addEventListener("blur", blur); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", outside); window.removeEventListener("blur", blur); window.removeEventListener("keydown", key); };
  }, [state]);
  return <div ref={targetRef} className="ui-context-target" tabIndex={0} aria-label={label}
    onContextMenu={(event) => { event.preventDefault(); openAt(event.clientX, event.clientY); }}
    onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openAt(rect.left + 12, rect.top + 12); } }}>
    {children}
    {state ? <RuntimeStyle className="ui-menu ui-context-menu" role="menu" aria-label={label} vars={{ "--ui-context-x": `${state.x}px`, "--ui-context-y": `${state.y}px` }} onMouseDown={(event: ReactMouseEvent) => event.stopPropagation()}>{items.map((item, index) => <button key={item.id} ref={(node) => { refs.current[index] = node; }} type="button" role="menuitem" disabled={item.disabled} data-destructive={item.destructive || undefined}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(true); return; } moveMenuFocus(event, items, refs, index); }}
      onClick={() => { item.onSelect(); close(true); }}>{item.icon ? <span className="ui-menu-icon">{item.icon}</span> : null}<span>{item.label}</span></button>)}</RuntimeStyle> : null}
  </div>;
}

export function Menubar({ items, ariaLabel = "Menu bar" }: { items: Array<{ id: string; label: string; items: MenuItem[] }>; ariaLabel?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);
  const menuRefs = useRef<Record<string, Array<HTMLButtonElement | null>>>({});
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", outside); return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  const focusFirst = (groupIndex: number, last = false) => requestAnimationFrame(() => {
    const group = items[groupIndex]; if (!group) return;
    const enabled = enabledIndexes(group.items); const index = enabled[last ? enabled.length - 1 : 0]; if (index !== undefined) menuRefs.current[group.id]?.[index]?.focus();
  });
  function triggerKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault(); const next = event.key === "ArrowRight" ? (index + 1) % items.length : (index - 1 + items.length) % items.length; triggers.current[next]?.focus(); setOpen(null);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setOpen(items[index]?.id || null); focusFirst(index, event.key === "ArrowUp");
    } else if (event.key === "Escape") setOpen(null);
  }
  return <div ref={root} className="ui-menubar" role="menubar" aria-label={ariaLabel}>{items.map((group, groupIndex) => <div key={group.id} className="ui-menubar-group">
    <button ref={(node) => { triggers.current[groupIndex] = node; }} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open === group.id}
      onClick={() => { const next = open === group.id ? null : group.id; setOpen(next); if (next) focusFirst(groupIndex); }} onKeyDown={(event) => triggerKey(event, groupIndex)}>{group.label}<Icon name="chevronDown" size={16} /></button>
    {open === group.id ? <div className="ui-menu" role="menu" aria-label={group.label}>{group.items.map((item, itemIndex) => <button key={item.id} ref={(node) => { (menuRefs.current[group.id] ||= [])[itemIndex] = node; }} type="button" role="menuitem" disabled={item.disabled} data-destructive={item.destructive || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(null); triggers.current[groupIndex]?.focus(); return; }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); const nextGroup = event.key === "ArrowRight" ? (groupIndex + 1) % items.length : (groupIndex - 1 + items.length) % items.length; setOpen(items[nextGroup]?.id || null); triggers.current[nextGroup]?.focus(); return; }
        moveMenuFocus(event, group.items, { current: menuRefs.current[group.id] || [] }, itemIndex);
      }} onClick={() => { item.onSelect(); setOpen(null); triggers.current[groupIndex]?.focus(); }}>{item.icon ? <span className="ui-menu-icon">{item.icon}</span> : null}<span>{item.label}</span></button>)}</div> : null}
  </div>)}</div>;
}

export function NavigationMenu({ items, currentHref, ariaLabel = "Primary navigation", className = "" }: { items: Array<{ label: ReactNode; href: string; icon?: ReactNode }>; currentHref?: string; ariaLabel?: string; className?: string }) {
  return <nav className={`ui-navigation-menu ${className}`.trim()} aria-label={ariaLabel}>{items.map((item) => <a key={item.href} href={item.href} aria-current={currentHref === item.href ? "page" : undefined}>{item.icon ? <span>{item.icon}</span> : null}<span>{item.label}</span></a>)}</nav>;
}
