"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { IconButton } from "./Button";
import { Dialog } from "./Dialog";
import { useModalDialog } from "./useModalDialog";
import { useRuntimeCssVars } from "./RuntimeStyle";

export function AlertDialog(props: Omit<Parameters<typeof Dialog>[0], "role" | "closeOnBackdrop">) {
  return <Dialog {...props} role="alertdialog" closeOnBackdrop={false} />;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  footer,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  side?: "left" | "right";
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = `drawer-${useId().replace(/:/g, "")}`;
  const ref = useModalDialog<HTMLElement>(open, onClose);
  if (!open) return null;
  return (
    <div className="modal-backdrop ui-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        ref={ref}
        className={`ui-drawer ${className}`.trim()}
        data-side={side}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <IconButton label="Close drawer" icon="close" onClick={onClose} />
        </header>
        <div className="ui-drawer-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </aside>
    </div>
  );
}
export const Sheet = Drawer;

type PopoverPosition = { top: number; left: number; placement: "top" | "bottom" };

export function Popover({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  align = "start",
  className = "",
  ariaLabel = "Popover",
}: {
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  className?: string;
  ariaLabel?: string;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const open = controlledOpen ?? localOpen;
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `popover-${useId().replace(/:/g, "")}`;

  const setOpen = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
    if (!next) setPosition(null);
  }, [controlledOpen, onOpenChange]);

  const updatePosition = useCallback(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const triggerNode = triggerRef.current;
      const panelNode = panelRef.current;
      if (!triggerNode || !panelNode) return;
      const triggerRect = triggerNode.getBoundingClientRect();
      const panelRect = panelNode.getBoundingClientRect();
      const inset = 8;
      const gap = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = triggerRect.left;
      if (align === "center") left = triggerRect.left + (triggerRect.width - panelRect.width) / 2;
      if (align === "end") left = triggerRect.right - panelRect.width;
      left = Math.max(inset, Math.min(left, viewportWidth - panelRect.width - inset));

      let top = triggerRect.bottom + gap;
      let placement: PopoverPosition["placement"] = "bottom";
      if (top + panelRect.height > viewportHeight - inset && triggerRect.top - panelRect.height - gap >= inset) {
        top = triggerRect.top - panelRect.height - gap;
        placement = "top";
      }
      top = Math.max(inset, Math.min(top, viewportHeight - panelRect.height - inset));
      setPosition({ top, left, placement });
    });
  }, [align, open]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const outside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const focusOutside = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("focusin", focusOutside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("focusin", focusOutside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, setOpen, updatePosition]);

  const child = isValidElement(trigger) ? cloneElement(trigger as ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const originalRef = (trigger as any).ref;
      if (typeof originalRef === "function") originalRef(node);
      else if (originalRef) originalRef.current = node;
    },
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": open ? panelId : undefined,
    onClick: (event: ReactMouseEvent) => {
      (trigger.props as any).onClick?.(event);
      if (!event.defaultPrevented) setOpen(!open);
    },
  }) : trigger;

  useRuntimeCssVars(panelRef, {
    "--ui-popover-top": position ? `${position.top}px` : undefined,
    "--ui-popover-left": position ? `${position.left}px` : undefined,
  });

  return (
    <span ref={rootRef} className="ui-popover-root">
      {child}
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className={`ui-popover ${className}`.trim()}
          data-align={align}
          data-positioned={position ? "true" : undefined}
          data-placement={position?.placement}
          role="dialog"
          aria-label={ariaLabel}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

export function Tooltip({ content, children, delayMs = 350 }: { content: ReactNode; children: ReactElement; delayMs?: number }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = `tooltip-${useId().replace(/:/g, "")}`;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const showDelayed = () => {
    clearTimer();
    timer.current = setTimeout(() => setOpen(true), delayMs);
  };
  const showNow = () => { clearTimer(); setOpen(true); };
  const hide = () => { clearTimer(); setOpen(false); };
  useEffect(() => () => clearTimer(), []);

  const existingDescription = (children.props as any)["aria-describedby"];
  const describedBy = open ? [existingDescription, id].filter(Boolean).join(" ") : existingDescription;
  const child = cloneElement(children as ReactElement<any>, {
    "aria-describedby": describedBy,
    onMouseEnter: (event: any) => { (children.props as any).onMouseEnter?.(event); showDelayed(); },
    onMouseLeave: (event: any) => { (children.props as any).onMouseLeave?.(event); hide(); },
    onFocus: (event: any) => { (children.props as any).onFocus?.(event); showNow(); },
    onBlur: (event: any) => { (children.props as any).onBlur?.(event); hide(); },
    onKeyDown: (event: any) => {
      (children.props as any).onKeyDown?.(event);
      if (!event.defaultPrevented && event.key === "Escape") hide();
    },
  });
  return <span className="ui-tooltip-root">{child}{open ? <span id={id} role="tooltip" className="ui-tooltip">{content}</span> : null}</span>;
}

export function HoverCard({ trigger, children, delayMs = 350 }: { trigger: ReactElement; children: ReactNode; delayMs?: number }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = `hover-card-${useId().replace(/:/g, "")}`;
  const later = (next: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), next ? delayMs : 120);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const existingDescription = (trigger.props as any)["aria-describedby"];
  const child = cloneElement(trigger as ReactElement<any>, {
    "aria-describedby": open ? [existingDescription, id].filter(Boolean).join(" ") : existingDescription,
    onMouseEnter: (event: any) => { (trigger.props as any).onMouseEnter?.(event); later(true); },
    onMouseLeave: (event: any) => { (trigger.props as any).onMouseLeave?.(event); later(false); },
    onFocus: (event: any) => { (trigger.props as any).onFocus?.(event); setOpen(true); },
    onBlur: (event: any) => { (trigger.props as any).onBlur?.(event); later(false); },
    onKeyDown: (event: any) => {
      (trigger.props as any).onKeyDown?.(event);
      if (!event.defaultPrevented && event.key === "Escape") setOpen(false);
    },
  });
  return (
    <span
      className="ui-hover-card-root"
      onMouseEnter={() => later(true)}
      onMouseLeave={() => later(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) later(false); }}
    >
      {child}
      {open ? <span id={id} className="ui-hover-card" role="group">{children}</span> : null}
    </span>
  );
}
