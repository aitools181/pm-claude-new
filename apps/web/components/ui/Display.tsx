import type { HTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { RuntimeStyle } from "./RuntimeStyle";

export function Card({ className = "", padded = false, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={`card${padded ? " card-p" : ""} ${className}`.trim()} {...props} />;
}

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "info" | "success" | "warning" | "error"; className?: string }) {
  return <span className={`badge ui-badge ${className}`.trim()} data-tone={tone}>{children}</span>;
}

export function EmptyState({ title, description, icon = "inbox", action }: { title: string; description?: ReactNode; icon?: IconName; action?: ReactNode }) {
  return <div className="empty ui-empty-state"><Icon name={icon} size={32} /><strong>{title}</strong>{description ? <p>{description}</p> : null}{action ? <div>{action}</div> : null}</div>;
}

export function Skeleton({ width, height = 16, className = "" }: { width?: number | string; height?: number | string; className?: string }) {
  return <RuntimeStyle as="span" className={`ui-skeleton runtime-size ${className}`.trim()} aria-hidden="true" vars={{ "--runtime-width": typeof width === "number" ? `${width}px` : width, "--runtime-height": typeof height === "number" ? `${height}px` : height }} />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span role="status" aria-label={label}><span className="ui-spinner" aria-hidden="true" /><span className="sr-only">{label}</span></span>;
}

export function Progress({ value, label = "Progress" }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className="ui-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe}><RuntimeStyle as="span" className="runtime-width" vars={{ "--runtime-width": `${safe}%` }} /></div>;
}
