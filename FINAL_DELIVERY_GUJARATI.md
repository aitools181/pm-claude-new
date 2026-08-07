# PM Platform Final Delivery - Gujarati Summary

આ packageમાં Master Blueprint v3.0 મુજબ F29 થી F42 માટે database, API, module activation, permissions, audit-oriented services અને user-facing screens ઉમેરવામાં આવ્યા છે. Core Task/Subtask lifecycleમાં clone, bulk create, promote/demote/re-parent, Move Wizard, rollback, idempotency અને hierarchy validation ઉમેરાયા છે.

સાથે core security અને usability hardening પણ કરવામાં આવ્યું છે:

- Password reset અને email verification માટે hashed, expiring, single-use tokens.
- Failed login lockout અને rate limiting.
- Active sessionsમાંથી token hash expose થતું નથી; individual/all session revoke.
- 2FA recovery codes hashed અને one-time છે.
- Task Drawerમાં checklist, tags, secure attachments, visible custom fields, subtasks, comments, activity અને dependencies.
- Files/custom fields/checklists/tagsમાં Work Item permission re-check.
- Mail adapter secret-bearing email body log કરતું નથી.

## External activation નોંધ

Live SAML/OIDC, LDAP/AD, Git/CI, SMTP/inbound email, Google/Microsoft/CalDAV, connected-search sources, AI providers અને signed native desktop/mobile binaries માટે target environment credentials અને provider-specific acceptance testing જરૂરી છે. Repositoryમાં તેમના contracts, persistence, UI, hooks અને security boundaries છે; provider વગર success fake કરવામાં આવ્યો નથી.

## Verification

`node scripts/verify-f29-f42.cjs` પરિણામ: 65 pass, 0 fail; 473 TS/TSX files parse થયા, 96 advanced tables migration coverageમાં check થયા અને relative imports resolve થયા.

Production પહેલાં dependencies install કરીને full typecheck/build, PostgreSQL migrations, Testcontainers/API tests, Playwright/accessibility tests, provider conformance tests અને isolated backup/restore drill ચલાવવો ફરજિયાત છે.

## Asana Screenshot UI Parity Pass — 2026-08-07

User supplied `Asana Screen Shorts.zip` ના 23 PNG reference screenshots સામે UI ફરી audit કરવામાં આવી.

આ pass માં:
- Asana જેવા charcoal top bar + dual sidebar navigation refinement.
- Home માટે screenshot જેવા warm golden default background અને floating widgets.
- Project List માં actual Group by Section/Assignee/Priority/Status.
- Options menu: completed visibility, nested subtasks, text wrap, compact rows.
- Slack-inspired built-in color combinations: Aubergine, Huddle, Lagoon, Mocha, Banana સહિત presets.
- Custom HEX accent color.
- Theme state duplicate provider issue દૂર.
- Screenshotમાં દેખાતા Task menu actions, Share, Customize, Inbox tabs, project views, Files/Calendar/Timeline/Gantt/Dashboard/Overview controls source-level audit.

Detailed mapping: `docs/ASANA_SCREENSHOT_PARITY_AUDIT.md`.
