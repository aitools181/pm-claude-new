# Asana Missing Features — Full-Stack Implementation

Date: 2026-08-13

All 40 items previously listed in `ASANA_UI_FIELD_GAP_DECISION.md` are now implemented with frontend + backend persistence/connectivity where the feature requires it.

## Implementation matrix

| # | Feature | Frontend | Backend / persistence | Status |
|---|---|---|---|---|
| 1 | Display language | Display selector; document locale/Intl consumers | `user_ui_preferences.locale` + `/ui/preferences` | Developed |
| 2 | Personal first day of week | Display selector; My Tasks/project calendars consume it | `personal_week_start`, workspace fallback | Developed |
| 3 | Notification pop-up duration | Display selector; Toast reads persisted duration | `notification_popup_seconds` | Developed |
| 4 | Default landing destination | Display selector; login resolves preferred landing unless `next=` is explicit | `default_landing` | Developed |
| 5 | Show row numbers | Project List, My Tasks and Browse Projects use preference | `show_row_numbers` | Developed |
| 6 | Color-blind friendly mode | Toggle + shape/text status cues, not color-only | `color_blind_mode` | Developed |
| 7 | Celebrations | Display toggle; completion celebration layer honors preference | `celebrations` | Developed |
| 8 | Navigation settings | Favorites, Recents, compact sections, collapsed launch, default project view | JSON `navigation_preferences` | Developed* |
| 9 | Rename project view | Saved-view menu | `PATCH /ui/saved-views/:id` | Developed |
| 10 | Set default project view | Saved-view menu | transactional single-default handling | Developed |
| 11 | Make view copy | Saved-view menu | `POST /ui/saved-views/:id/duplicate` | Developed |
| 12 | Copy per-view link | Deep link with `savedView` | persisted view id | Developed |
| 13 | Remove custom view | Saved-view menu | `DELETE /ui/saved-views/:id` | Developed |
| 14 | Add/manage custom tab/view | Custom tabs in ProjectChrome | saved view CRUD | Developed |
| 15 | Project icon | Customize drawer icon selector | `projects.icon` + migration + project patch | Developed |
| 16 | Connect existing goal | Overview goal selector | existing goal-link API | Developed |
| 17 | Create goal in project context | Overview create-and-connect flow | goal create + link API | Developed |
| 18 | Add project to portfolio | Overview portfolio selector | portfolio-project link API | Developed |
| 19 | Rich project brief editor | Toolbar for object/link/bold/italic/underline/highlight/strike/list/quote/code/heading + undo/redo workflow | `/projects/:id/brief`, persisted project resource body | Developed |
| 20 | Project AI summary controls | Sources, risk report, regular updates, timeframe, generate/regenerate | project AI summary settings + generate endpoint + worker schedule | Developed |
| 21 | Project activity/status timeline | Overview right-side lifecycle/activity stream | `/projects/:id/activity-timeline` | Developed |
| 22 | Inbox Newest/Relevance sort | Sort selector | backend relevance rank using unread/bookmark/type/recency | Developed |
| 23 | Inbox Summary | Summary panel + refresh | `/ai/inbox-summary` | Developed |
| 24 | Inbox summary timeframe | Today / 7 days / 30 days | persisted `inbox_summary_timeframe` | Developed |
| 25 | Turn off summaries | Turn off/on controls | persisted `inbox_summary_enabled` | Developed |
| 26 | Archive all notifications | Inbox toolbar action | `POST /notifications/archive-all` | Developed |
| 27 | Clear filters empty state | Empty-state recovery action | client filter state | Developed |
| 28 | Browse Projects Portfolios filter | Portfolio filter | `/portfolio-projects` membership response | Developed |
| 29 | Browse Projects Portfolios column | Portfolio memberships column | same membership response | Developed |
| 30 | Last modified sort | Selector + clickable header | local sorting over API `updatedAt` | Developed |
| 31 | Quick Star/Favorite | Row star action | project favorite API | Developed |
| 32 | Template suggestion strip | Suggestions, dismiss, gallery, use-template | `/templates/suggestions` + template use API | Developed |
| 33 | Additional email addresses | Add, verify, remove, make primary | `user_email_addresses`, verification mail, login alias support | Developed |
| 34 | Merge account identities | Account merge form | password-verified merge + membership/ownership transfer | Developed |
| 35 | Organizations/workspaces in Account | Switch org, list/create workspace | `/me/workspaces`, existing workspace API | Developed |
| 36 | Portfolio Owner column | Owner cell | rollup returns `ownerUserId` | Developed |
| 37 | Portfolio Status column | Status/health cell | rollup returns status + health | Developed |
| 38 | Portfolio Budget | Editable budget column | `portfolio_projects.budget_cents` | Developed |
| 39 | Portfolio Service line | Editable service-line column | `portfolio_projects.service_line` | Developed |
| 40 | Custom portfolio columns | Create/remove columns + editable cells | `portfolio_columns`, `custom_fields`, CRUD endpoints | Developed |

\* The Asana screenshot only proved that a Navigation settings tab exists; it did not capture its internal controls. The implemented controls are explicitly PM Platform product decisions, not claimed pixel/field parity with uncaptured Asana content.

## Database migration

`packages/db/migrations/0033_asana_missing_features.sql` adds the required preference fields, project icon, portfolio metadata/custom columns, project AI summary settings, and secondary email identities. It is registered in the Drizzle migration journal.

## Verification

Run:

```bash
node scripts/verify-asana-missing-features.cjs
node scripts/verify-f29-f42.cjs
node scripts/verify-asana-screenshot-parity.cjs
node scripts/verify-asana-v4-1-reference.cjs
node scripts/verify-ui-standards.cjs
node scripts/verify-production-readiness.cjs
```

The dependency-free source gates all pass in this package. Full semantic `pnpm` build/typecheck, migrations against a real PostgreSQL instance, Docker stack startup, SMTP/AI provider certification, and Playwright/axe browser execution still require the release environment documented in `HANDOFF.md`.
