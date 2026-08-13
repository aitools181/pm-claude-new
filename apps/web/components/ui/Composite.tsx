import type { HTMLAttributes, ReactNode } from "react";
import { RuntimeStyle } from "./RuntimeStyle";

export function Avatar({ name, src, size = "default", className = "" }: { name: string; src?: string | null; size?: "small" | "default" | "large"; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
  return <span className={`ui-avatar ${className}`.trim()} data-size={size} aria-label={name}>{src ? <img src={src} alt="" /> : <span aria-hidden="true">{initials}</span>}</span>;
}

export function ButtonGroup({ children, joined = false, className = "", ariaLabel = "Actions" }: { children: ReactNode; joined?: boolean; className?: string; ariaLabel?: string }) {
  return <div className={`ui-button-group ${className}`.trim()} data-joined={joined || undefined} role="group" aria-label={ariaLabel}>{children}</div>;
}

export type BreadcrumbItem = { label: ReactNode; href?: string };
export function Breadcrumb({ items, className = "", ariaLabel = "Breadcrumb" }: { items: BreadcrumbItem[]; className?: string; ariaLabel?: string }) {
  return <nav className={`ui-breadcrumb ${className}`.trim()} aria-label={ariaLabel}><ol>{items.map((item, index) => <li key={index}>{index ? <span className="ui-breadcrumb-separator" aria-hidden="true">/</span> : null}{index === items.length - 1 || !item.href ? <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span> : <a href={item.href}>{item.label}</a>}</li>)}</ol></nav>;
}

export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) { return <kbd className={`ui-kbd ${className}`.trim()}>{children}</kbd>; }
export function Separator({ orientation = "horizontal", className = "" }: { orientation?: "horizontal" | "vertical"; className?: string }) { return <span className={`ui-separator ${className}`.trim()} data-orientation={orientation} role="separator" aria-orientation={orientation} />; }

export function Item({ leading, title, description, trailing, className = "", interactive = false, ...props }: HTMLAttributes<HTMLDivElement> & { leading?: ReactNode; title: ReactNode; description?: ReactNode; trailing?: ReactNode; interactive?: boolean }) {
  return <div className={`ui-item ${className}`.trim()} data-interactive={interactive || undefined} {...props}>{leading ? <span className="ui-item-leading">{leading}</span> : null}<span className="ui-item-copy"><strong>{title}</strong>{description ? <small>{description}</small> : null}</span>{trailing ? <span className="ui-item-trailing">{trailing}</span> : null}</div>;
}

export function Marker({ tone = "neutral", label, className = "" }: { tone?: "neutral" | "info" | "success" | "warning" | "error"; label: string; className?: string }) { return <span className={`ui-marker ${className}`.trim()} data-tone={tone}><span aria-hidden="true" />{label}</span>; }

export function Heading({ level = 2, children, className = "" }: { level?: 1 | 2 | 3; children: ReactNode; className?: string }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return <Tag className={`ui-heading ui-heading-${level} ${className}`.trim()}>{children}</Tag>;
}
export function Text({ children, tone = "primary", size = "body", className = "" }: { children: ReactNode; tone?: "primary" | "secondary" | "muted"; size?: "body" | "compact" | "helper"; className?: string }) { return <span className={`ui-text ${className}`.trim()} data-tone={tone} data-size={size}>{children}</span>; }

export function Direction({ dir, children }: { dir: "ltr" | "rtl" | "auto"; children: ReactNode }) { return <span dir={dir}>{children}</span>; }
export function ScrollArea({ children, className = "", maxHeight }: { children: ReactNode; className?: string; maxHeight?: number | string }) { return <RuntimeStyle className={`ui-scroll-area ${className}`.trim()} vars={{ "--ui-scroll-max": maxHeight === undefined ? undefined : typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight }}>{children}</RuntimeStyle>; }
