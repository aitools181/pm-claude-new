# Asana Screenshot Parity Audit

Reference set: `Asana Screen Shorts.zip` supplied by the user (23 PNG screenshots).

This pass treats the screenshots as the UI/interaction source of truth for the visible Asana-style shell and checks each visible control against this repository. It does not copy Asana trademarks, logos, source code or proprietary assets.

## Screenshot surfaces covered

- Home: greeting, My Tasks widget tabs, projects widget, people widget, customizable background and widgets.
- Inbox: Activity, Bookmarks, Archive, @Mentioned, saved tabs, filters, density, read/archive/bookmark actions.
- Browse projects: searchable/filterable project directory, member avatars, join/leave, create project.
- Project header: project icon/name, favorite, health/status, member faces, Share and Customize.
- Project views: Overview, List, Board, Timeline, Gantt, Dashboard, Calendar, Files and Messages.
- Project List: sections, inline add, nested subtasks, task completion, configurable columns, filter, sort, group, options and saved views.
- Share dialog: invite by member/email, access level, notification preference, access roster and copy project link.
- Task detail: assignee, due date, projects, custom fields, description, subtasks, attachments, comments/activity, dependencies and task menu actions.
- Task menu: add to project, add subtask, add dependency, add tags, attach files, follow-up task, merge duplicate, convert item type, duplicate, print, public/private toggle and delete.
- Board: sections/columns, cards, status/rank movement, quick add and task detail opening.
- Calendar: month/week style placement, task opening and date-based creation.
- Timeline/Gantt: schedule bars, dependencies, baseline/critical-path related planning UI.
- Files: grid/list modes, filtering, grouping, task attachment source and download.
- Overview: project description, roles, connected goals/portfolios, status and activity.
- Dashboard: task counts, completion/status distribution and chart widgets.
- Settings: profile, notifications, email forwarding, account, display, apps, workspace and session/security controls.

## Gaps closed in this pass

1. Project List `Group` now changes the actual grouping: Sections, Assignee, Priority or Status.
2. Project List `Options` now controls completed task visibility, nested subtasks, text wrapping and compact row density.
3. Display settings now include multiple Slack-inspired color combinations in addition to the Asana-style default.
4. Users can set a custom hexadecimal accent color without changing the interaction layout.
5. Home default background is now a warm golden treatment matching the supplied Home screenshot more closely.
6. The header/search/sidebar chrome has been refined to the compact charcoal layout visible in the supplied screenshots.
7. Duplicate nested ThemeProvider state was removed so theme settings are applied consistently across Home, project views and settings.
8. Responsive overrides were retained for the dual-rail sidebar and wide task/detail experience.

## Existing functionality verified in source

The repository already contained implementations for the screenshot-visible functions that had been missing in earlier revisions, including Add Subtask, nested subtask navigation, task menu actions, configurable list columns, project share/access management, project customization, saved views, Inbox tabs, Home widgets, Files views, Board, Calendar, Timeline/Gantt, Overview, Dashboard, user settings and workspace settings.

## External-service note

Email delivery, calendar-provider synchronization, SSO/directory providers, Git/CI providers and AI providers still require real target credentials/infrastructure to become live. Their application-side contracts/adapters remain in the repository; the UI does not pretend that an unavailable external provider is connected.
