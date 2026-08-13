const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const checks = [
  ['dual shell', 'apps/web/components/shell/AppShell.tsx', 'GlobalRail'],
  ['asana topbar', 'apps/web/components/shell/TopbarClient.tsx', 'asana-topbar'],
  ['home widgets', 'apps/web/app/(app)/home/page.tsx', 'home-widgets'],
  ['inbox bookmarks', 'apps/web/app/(app)/inbox/page.tsx', 'bookmarks'],
  ['project share', 'apps/web/components/project/ProjectChrome.tsx', 'ProjectShareModal'],
  ['project customize', 'apps/web/components/project/ProjectChrome.tsx', 'CustomizeDrawer'],
  ['list custom columns', 'apps/web/app/(app)/projects/[id]/page.tsx', 'column-menu'],
  ['list grouping', 'apps/web/app/(app)/projects/[id]/page.tsx', "groupBy"],
  ['list options', 'apps/web/app/(app)/projects/[id]/page.tsx', 'view-options-menu'],
  ['add subtask', 'apps/web/components/work/TaskDrawer.tsx', 'Add subtask'],
  ['task duplicate', 'apps/web/components/work/TaskDrawer.tsx', 'Duplicate task'],
  ['task dependencies', 'apps/web/components/work/TaskDrawer.tsx', 'Add dependencies'],
  ['task tags', 'apps/web/components/work/TaskDrawer.tsx', 'Add tags'],
  ['task files', 'apps/web/components/work/TaskDrawer.tsx', 'Attach files'],
  ['task follow-up', 'apps/web/components/work/TaskDrawer.tsx', 'Create follow-up task'],
  ['task merge duplicate', 'apps/web/components/work/TaskDrawer.tsx', 'Merge duplicate tasks'],
  ['board', 'apps/web/app/(app)/projects/[id]/board/page.tsx', 'ProjectChrome'],
  ['calendar', 'apps/web/app/(app)/projects/[id]/calendar/page.tsx', 'ProjectChrome'],
  ['timeline', 'apps/web/app/(app)/projects/[id]/timeline/page.tsx', 'ProjectChrome'],
  ['gantt', 'apps/web/app/(app)/projects/[id]/gantt/page.tsx', 'ProjectChrome'],
  ['dashboard', 'apps/web/app/(app)/projects/[id]/reports/page.tsx', 'ProjectChrome'],
  ['files', 'apps/web/app/(app)/projects/[id]/files/page.tsx', 'ProjectChrome'],
  ['theme combinations', 'apps/web/components/theme/themeTokens.ts', 'slack-huddle'],
  ['custom accent', 'apps/web/components/theme/ThemeProvider.tsx', 'setCustomAccent'],
  ['workspace settings', 'apps/web/app/(app)/settings/workspace/page.tsx', 'SettingsShell'],
];
let failed = 0;
for (const [name, file, needle] of checks) {
  const p = path.join(root, file);
  const ok = fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes(needle);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} screenshot-parity source checks passed.`);
process.exitCode = failed ? 1 : 0;
