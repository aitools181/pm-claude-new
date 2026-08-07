export default function ConfigureHub() {
  const cards = [
    { href: "/admin/configure/fields", h: "Custom Fields", d: "Typed fields with validation and field-level security." },
    { href: "/admin/configure/types", h: "Work Item Types", d: "Define types with icons and required fields." },
    { href: "/admin/configure/roles", h: "Roles & Permissions", d: "Build roles and preview a user's exact capabilities." },
    { href: "/admin/configure/workflows", h: "Workflows", d: "Statuses, transitions, publish and migrate." },
    { href: "/admin/configure/automation", h: "Automation", d: "WHEN–IF–THEN rules with logs, dry-run and replay." },
    { href: "/admin/configure/templates", h: "Templates", d: "Reusable project templates; instantiate on demand." },
    { href: "/admin/configure/recurrence", h: "Recurrence", d: "Recurring tasks with timezone-correct occurrences." },
    { href: "/admin/configure/calendars", h: "Working Calendars", d: "Working days and holidays for scheduling." },
    { href: "/admin/configure/data", h: "Import / Export", d: "CSV import with dry-run; export with a checksummed manifest." },
  ];
  return (
    <>
      <h1 className="page-title">Configure</h1>
      <p className="page-sub">Adapt the platform to each team — no code changes.</p>
      <div className="cfg-grid">
        {cards.map((c) => (
          <a key={c.href} href={c.href} className="cfg-card"><div className="h">{c.h}</div><div className="d">{c.d}</div></a>
        ))}
      </div>
    </>
  );
}
