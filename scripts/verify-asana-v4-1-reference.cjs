const fs = require('fs');
const path = require('path');
const root = process.cwd();
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
const theme = read('apps/web/components/theme/themeTokens.ts');
const provider = read('apps/web/components/theme/ThemeProvider.tsx');
const display = read('apps/web/app/(app)/settings/display/page.tsx');
const settings = read('apps/web/components/settings/SettingsShell.tsx');
const css = read('apps/web/app/globals.css');
const checks = [
  ['Asana reference preset exists', theme.includes('id:"asana"')],
  ['Slack aubergine theme exists', theme.includes('id:"slack-aubergine"')],
  ['Slack lagoon theme exists', theme.includes('id:"slack-lagoon"')],
  ['Slack raspberry theme exists', theme.includes('id:"slack-raspberry"')],
  ['Slack mint theme exists', theme.includes('id:"slack-mint"')],
  ['At least sixteen built-in presets', (theme.match(/\{ id:/g)||[]).length >= 16],
  ['Custom theme supports full shell recipe', ['accent','secondary','topbar','rail','sidebar','sidebarHover'].every(k=>theme.includes(`${k}: string`))],
  ['Theme provider persists custom colors', provider.includes('customTheme: { ...(prefs.customTheme || {}), colors: cleanCustomTheme(next) }')],
  ['Topbar contrast is computed', provider.includes('--theme-topbar-ink') && provider.includes('readableInk(recipe.topbar)')],
  ['Rail contrast is computed', provider.includes('--theme-rail-ink') && provider.includes('readableInk(recipe.rail)')],
  ['Sidebar contrast is computed', provider.includes('--theme-sidebar-ink') && provider.includes('readableInk(recipe.sidebar)')],
  ['Sidebar hover contrast is computed', provider.includes('--theme-sidebar-hover-ink') && provider.includes('readableInk(recipe.sidebarHover)')],
  ['Browser theme color follows workspace theme', provider.includes('meta[name="theme-color"]') && provider.includes('themeMeta.content = recipe.topbar')],
  ['Display settings show theme preset grid', display.includes('Workspace color themes') && display.includes('theme-grid')],
  ['Display settings expose six custom shell colors', (display.match(/\["(accent|secondary|topbar|rail|sidebar|sidebarHover)"/g)||[]).length === 6],
  ['Display settings offers custom theme action', display.includes('Use custom theme')],
  ['Settings uses modal shell like reference', settings.includes('settings-modal-shell') && settings.includes('settings-modal-head')],
  ['Reference topbar height is 48px', css.includes('--asana-ref-topbar-h:48px')],
  ['Reference global rail width is 64px', css.includes('--asana-ref-rail-w:64px')],
  ['Reference workspace sidebar width is 180px', css.includes('--asana-ref-sidebar-w:180px')],
  ['Reference project header height is 48px', css.includes('--asana-ref-project-head-h:48px')],
  ['Reference project tabs height is 36px', css.includes('--asana-ref-tabs-h:36px')],
  ['Reference toolbar height is 56px', css.includes('--asana-ref-toolbar-h:56px')],
  ['Desktop search is centered and pill shaped', css.includes('left:50%;transform:translateX(-50%)') && css.includes('border-radius:18px')],
  ['Project list rows use compact reference geometry', css.includes('.asana-list-row{min-height:36px}')],
  ['Board columns use 304px reference width', css.includes('width:304px;min-width:304px')],
  ['Settings overlay dims app surface', css.includes('.settings-page{') && css.includes('color-mix(in srgb,var(--text) 26%,var(--panel))')],
  ['Theme preview shows shell + accents', css.includes('.theme-mini-preview') && css.includes('--runtime-theme-top') && css.includes('--runtime-theme-side')],
  ['Mobile settings becomes full-height surface', css.includes('.settings-modal-shell{width:100%;max-height:none;min-height:calc(100vh - var(--asana-ref-topbar-h))')],
  ['Mobile search compacts to 38px', css.includes('.asana-search{width:38px;min-width:38px;justify-content:center;padding:0}')],
];
let pass=0;
for(const [label, ok] of checks){ console.log(`${ok?'PASS':'FAIL'}  ${label}`); if(ok) pass++; }
console.log(`\n${pass}/${checks.length} Asana v4.1 reference/theme checks passed.`);
process.exit(pass===checks.length?0:1);
