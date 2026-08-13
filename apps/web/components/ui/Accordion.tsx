"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Accordion({
  title,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className = "",
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  return (
    <section className={`ui-accordion ${className}`.trim()} data-open={open || undefined}>
      <h3 className="ui-accordion-heading">
        <button type="button" aria-expanded={open} aria-controls={`accordion-${id}`} onClick={() => setOpen(!open)}>
          <span>{title}</span><Icon name="chevronDown" size={18} />
        </button>
      </h3>
      <div id={`accordion-${id}`} className="ui-accordion-panel" hidden={!open}>{children}</div>
    </section>
  );
}

export const Collapsible = Accordion;
