import type { ReactNode } from "react";
export function Callout({ tone = "info", title, children, action, className = "" }: { tone?: "neutral" | "info" | "success" | "warning" | "danger"; title?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  const cls = `callout ui-alert ${className}`.trim();
  return <div className={cls} data-tone={tone} role={tone === "danger" ? "alert" : tone === "success" ? "status" : undefined}>{title ? <strong>{title}</strong> : null}<div>{children}</div>{action ? <div className="ui-alert-action">{action}</div> : null}</div>;
}
export const Alert = Callout;
