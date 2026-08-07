# v3 F31 — Advanced Work Query Language, Schemes & Configurable Screens

Jira-class structured search + reusable screen configuration, without exposing unsafe SQL.
Additive; migration 0025 adds saved_queries and screen_schemes.

## Delivered (backend)
- **WQL parser** (`wql/wql.ts`): a recursive-descent parser producing a safe AST from queries
  like `status = "todo" AND (priority = "high" OR owner = currentUser())`. Supports AND/OR/NOT
  groups, comparison operators (= != > < >= <= ~), IN [lists], the currentUser() function and
  relative dates (-7d/-24h/-2w) on created/updated. Fields are whitelisted (status, priority,
  title, owner, project, parent, key, created, updated); unknown fields raise a safe error, so
  hidden columns can never leak.
- **Executor** (`WqlService`): maps the AST to parameterised Drizzle conditions (never raw SQL),
  scopes to the org, applies a result cap, and permission-filters every row through
  canAccessWorkItem so a query can't surface items the viewer cannot access. An explain endpoint
  validates/returns the AST without running.
- **Saved queries**: validated on save, listed for reuse.
- **Screen schemes**: create/view/edit/quick_create field layouts per work item type, with a
  sensible default when none is configured. Capability: screen.manage for layout edits.

## Delivered (frontend)
- Advanced search (/search): WQL box with Run/Save, saved-query chips, a results table and safe
  inline error display.
- Item tools (/mobility, F30): per-item Clone / Re-parent / Move (with destination + hierarchy
  handling + dry-run preview + confirm) and a bulk-add box — wiring the F30 mobility backend.

## Verification (real Postgres)
Equality, AND + contains, currentUser(), IN, and OR/NOT grouping all return the expected rows;
a private-project item is excluded from another user's results; unknown fields and syntax errors
raise safe VALIDATION errors; explain returns the AST; a saved query round-trips; and a screen
scheme is stored and read back with a default fallback. All checks pass; both frontends compile
(50/50 routes).
