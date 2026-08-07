/** Bundled release manifest — the source of truth for version + expected schema. */
export const APP_VERSION = "1.0.0";
export const EXPECTED_MIGRATIONS = 21; // 0000..0020

export type ChangelogEntry = { version: string; date: string; highlights: string[] };
export const CHANGELOG: ChangelogEntry[] = [
  { version: "1.0.0", date: "2026-01-15", highlights: ["V1 GA: multi-tenancy, auth + 2FA, work engine, collaboration, custom fields & workflow, automation, backup/restore, dependencies & timeline"] },
  { version: "1.1.0", date: "2026-02-10", highlights: ["Planning (CPM/Gantt), time & resource, forms & approvals, agile (backlog/sprints/reports)"] },
  { version: "1.2.0", date: "2026-03-05", highlights: ["Goals, portfolios, dashboards & reports; docs, meetings, proofing & request portal"] },
  { version: "1.3.0", date: "2026-04-01", highlights: ["Public API + scoped tokens, webhooks, integrations & credential vault, installable PWA"] },
  { version: "1.4.0", date: "2026-05-01", highlights: ["Enterprise hardening: advanced DR drills, retention & recycle bin, security self-audit, performance indexes"] },
];
