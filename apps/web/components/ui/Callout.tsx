import type { ReactNode } from "react";
export function Callout({ tone = "info", children }: { tone?: "info" | "danger" | "muted"; children: ReactNode }) {
  const cls = tone === "danger" ? "callout callout-danger" : tone === "info" ? "callout callout-info" : "callout";
  return <div className={cls} role={tone === "danger" ? "alert" : undefined}>{children}</div>;
}
