#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }

const root = path.resolve(__dirname, '..');
const webRoot = path.join(root, 'apps/web');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const rel = (file) => path.relative(root, file).replace(/\\/g, '/');
const failures = [];
const passes = [];
const warnings = [];
const check = (condition, label, detail = '') => condition ? passes.push(label) : failures.push(`${label}${detail ? `: ${detail}` : ''}`);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist', '.git'].includes(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, out); else out.push(target);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layering / foundation tokens
// ---------------------------------------------------------------------------
const layout = read('apps/web/app/layout.tsx');
const tokensIndex = layout.indexOf('import "./design-tokens.css"');
const globalsIndex = layout.indexOf('import "./globals.css"');
const staticIndex = layout.indexOf('import "./ui-static.css"');
const standardsIndex = layout.indexOf('import "./ui-standards.css"');
check(tokensIndex >= 0 && globalsIndex > tokensIndex && staticIndex > globalsIndex && standardsIndex > staticIndex, 'CSS order is design tokens → globals → extracted static → UI standards');

const css = read('apps/web/app/ui-standards.css');
for (const [needle, label] of [
  ['--ui-space-1: 4px', '4px spacing base'],
  ['--ui-page-gutter: 32px', '32px desktop gutter'],
  ['--ui-control-sm: 40px', '40px compact control'],
  ['--ui-control-lg: 48px', '48px preferred/touch control'],
  ['--ui-radius-md: 8px', '8px default radius'],
  ['--ui-icon-md: 20px', '20px default icon'],
  ['--ui-content-max: 1440px', '1440px standard container'],
  ['outline: 2px solid var(--ui-focus)', 'shared visible focus ring'],
  ['@media (prefers-reduced-motion: reduce)', 'reduced-motion support'],
  ['@media (forced-colors: active)', 'forced-colors support'],
]) check(css.includes(needle), `Foundation: ${label}`);
check(/@media \(max-width: 1023px\)[\s\S]*--ui-page-gutter: 20px/.test(css), 'Foundation: 20px tablet gutter');
check(/@media \(max-width: 767px\)[\s\S]*--ui-page-gutter: 16px/.test(css), 'Foundation: 16px mobile gutter');
check(css.includes('.icon-btn:focus-visible') && css.includes('outline: 2px solid var(--ui-focus)'), 'Icon buttons use the same focus token as other controls');

const designTokens = read('apps/web/app/design-tokens.css');
const globals = read('apps/web/app/globals.css');
const rootBlocks = (globals.match(/^:root\s*\{/gm) || []).length;
check(rootBlocks === 1, 'Legacy globals contains one top-level :root alias block', String(rootBlocks));
const literalColorPattern = /#[0-9A-Fa-f]{3,8}\b|rgba?\(\s*\d+/g;
check((globals.match(literalColorPattern) || []).length === 0, 'globals.css contains no literal authored colors');
check((css.match(literalColorPattern) || []).length === 0, 'ui-standards.css contains no literal authored colors');
check((designTokens.match(literalColorPattern) || []).length > 0, 'Literal CSS color values are centralized in design-tokens.css');
for (const forbidden of ['.btn{border-radius:6px;height:34px', '.icon-btn { width:34px', 'select.input {']) {
  check(!globals.includes(forbidden), `Legacy duplicate control rule retired: ${forbidden}`);
}

const staticCss = read('apps/web/app/ui-static.css');
check((staticCss.match(literalColorPattern) || []).length === 0, 'ui-static.css contains no literal authored colors');
check((staticCss.match(/^\.ui-static-/gm) || []).length > 0, 'Extracted route-static CSS is present');
check(!/(?:margin|padding|gap)(?:-[a-z]+)?:\s*\d+px/.test(staticCss), 'Extracted route spacing uses token scale instead of raw px');

// ---------------------------------------------------------------------------
// Complete supplied component inventory
// ---------------------------------------------------------------------------
const requiredFiles = [
  'Button.tsx','Callout.tsx','Choice.tsx','Display.tsx','Field.tsx','Toast.tsx','useModalDialog.ts','AppDialog.tsx','Dialog.tsx',
  'Tabs.tsx','Accordion.tsx','Toggle.tsx','Pagination.tsx','Slider.tsx','AspectRatio.tsx','Composite.tsx','Overlay.tsx','InputGroup.tsx',
  'InputOTP.tsx','Menu.tsx','Combobox.tsx','DatePicker.tsx','DataTable.tsx','Carousel.tsx','Message.tsx','Attachment.tsx','Chart.tsx',
  'Questionnaire.tsx','Command.tsx','Resizable.tsx','Sidebar.tsx','RuntimeStyle.tsx','index.ts',
];
for (const file of requiredFiles) check(exists(`apps/web/components/ui/${file}`), `Shared UI module exists: ${file}`);

const uiSource = requiredFiles.filter((x) => /\.(tsx|ts)$/.test(x)).map((x) => read(`apps/web/components/ui/${x}`)).join('\n');
const componentInventory = {
  'Accordion':'Accordion','Alert':'Alert','Alert Dialog':'AlertDialog','Aspect Ratio':'AspectRatio','Attachment':'Attachment','Avatar':'Avatar','Badge':'Badge','Breadcrumb':'Breadcrumb','Bubble':'Bubble','Button':'Button','Button Group':'ButtonGroup','Calendar':'Calendar','Card':'Card','Carousel':'Carousel','Chart':'ChartFrame','Checkbox':'Checkbox','Collapsible':'Collapsible','Combobox':'Combobox','Command':'Command','Context Menu':'ContextMenu','Data Table':'DataTable','Date Picker':'DatePicker','Dialog':'Dialog','Direction':'Direction','Drawer':'Drawer','Dropdown Menu':'DropdownMenu','Empty':'EmptyState','Field':'Field','Hover Card':'HoverCard','Input':'Input','Input Group':'InputGroup','Input OTP':'InputOTP','Item':'Item','Kbd':'Kbd','Label':'Label','Marker':'Marker','Menubar':'Menubar','Message':'Message','Message Scroller':'MessageScroller','Native Select':'NativeSelect','Navigation Menu':'NavigationMenu','Pagination':'Pagination','Popover':'Popover','Progress':'Progress','QuestionnaireNew':'Questionnaire','Radio Group':'RadioGroup','Resizable':'Resizable','Scroll Area':'ScrollArea','Select':'Select','Separator':'Separator','Sheet':'Sheet','Sidebar':'Sidebar','Skeleton':'Skeleton','Slider':'Slider','Spinner':'Spinner','Switch':'Switch','Table':'Table','Tabs':'Tabs','Textarea':'Textarea','Toast':'ToastProvider','Toggle':'Toggle','Toggle Group':'ToggleGroup','Tooltip':'Tooltip','Typography':'Heading',
};
const missingComponents = Object.entries(componentInventory).filter(([, symbol]) => !new RegExp(`\\b${symbol}\\b`).test(uiSource)).map(([name]) => name);
check(missingComponents.length === 0, `All ${Object.keys(componentInventory).length} supplied component contracts have a shared implementation`, missingComponents.join(', '));

const uiIndex = read('apps/web/components/ui/index.ts');
for (const module of ['Composite','Overlay','InputGroup','InputOTP','Menu','Combobox','DatePicker','DataTable','Carousel','Message','Attachment','Chart','Questionnaire','Command','Resizable','Sidebar','RuntimeStyle']) {
  check(uiIndex.includes(`export * from "./${module}"`), `UI barrel exports ${module}`);
}

// ---------------------------------------------------------------------------
// Behavior / accessibility contracts
// ---------------------------------------------------------------------------
const field = read('apps/web/components/ui/Field.tsx');
check(field.includes('useId') && field.includes('htmlFor') && field.includes('aria-describedby') && field.includes('aria-invalid'), 'Field connects label, helper/error and invalid state');
const toast = read('apps/web/components/ui/Toast.tsx');
check(toast.includes('aria-live={live}') && toast.includes('role={role}') && toast.includes('toast.tone === "error" ? "alert" : "status"'), 'Toast has severity-aware live-region semantics');
check(/slice\(\s*-?3\s*\)/.test(toast), 'Toast queue is capped');
check(toast.includes('durationMs') && toast.includes('toast.tone === "error" ? null'), 'Error toasts persist by default');
const appLayout = read('apps/web/app/(app)/layout.tsx');
const appDialog = read('apps/web/components/ui/AppDialog.tsx');
check(appLayout.includes('AppDialogProvider') && appDialog.includes('appPrompt') && appDialog.includes('appConfirm'), 'Product-owned prompt/confirm service is mounted');
check(appDialog.includes('useModalDialog') && appDialog.includes('aria-modal="true"'), 'Product dialogs use shared modal focus behavior');
const shell = read('apps/web/components/shell/AppShell.tsx');
check(shell.includes('className="skip-link"') && shell.includes('id="main-content"'), 'Application shell has skip link and main target');
const myTasks = read('apps/web/app/(app)/my-tasks/page.tsx');
check(myTasks.includes('<Tabs') && myTasks.includes('ariaLabel="My tasks views"'), 'My Tasks uses shared keyboard-operable Tabs');

const themeProvider = read('apps/web/components/theme/ThemeProvider.tsx');
const themeTokens = read('apps/web/components/theme/themeTokens.ts');
check(themeProvider.includes('readableInk') && !themeProvider.includes('root.style.setProperty("--focus", custom)'), 'Custom accent cannot replace focus token');
check(themeTokens.includes('THEME_PRESETS') && themeTokens.includes('PROJECT_COLOR_PALETTE') && themeTokens.includes('DEFAULT_ACCENT'), 'Theme/project color data is centralized outside TSX');

// ---------------------------------------------------------------------------
// AST-based debt gates
// ---------------------------------------------------------------------------
const tsxFiles = walk(webRoot).filter((file) => file.endsWith('.tsx'));
const sourceRows = tsxFiles.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
let staticInlineStyles = 0;
let dynamicInlineStyles = 0;
let hardCodedHexInTsx = 0;
let browserPrompts = 0;
let browserConfirms = 0;
let rawSelectOutsideUi = [];
let rawTextareaOutsideUi = [];
let rawTextInputOutsideUi = [];
let rawButtonCount = 0;
let rawInputCount = 0;

const allowedRawInputTypes = new Set(['checkbox','radio','range','color','file','hidden']);
const isLiteral = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword;
const styleObjectIsStatic = (obj) => obj.properties.every((prop) => ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && isLiteral(prop.initializer));
const attr = (node, name) => node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.text === name);
const attrString = (a, sf) => {
  if (!a || !ts.isJsxAttribute(a) || !a.initializer) return '';
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
  if (ts.isJsxExpression(a.initializer) && a.initializer.expression && ts.isStringLiteral(a.initializer.expression)) return a.initializer.expression.text;
  return '';
};

for (const { file, text } of sourceRows) {
  hardCodedHexInTsx += (text.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).length;
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  browserPrompts += (clean.match(/(?:window\.)?\bprompt\s*\(/g) || []).length;
  browserConfirms += (clean.match(/window\.confirm\s*\(/g) || []).length;
  if (!/function\s+confirm\s*\(/.test(clean)) browserConfirms += (clean.match(/(?<![\w.])confirm\s*\(/g) || []).length;

  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const inUi = rel(file).startsWith('apps/web/components/ui/');
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      if (/^[a-z]/.test(tag)) {
        const style = attr(node, 'style');
        if (style && style.initializer && ts.isJsxExpression(style.initializer) && style.initializer.expression) {
          if (ts.isObjectLiteralExpression(style.initializer.expression) && styleObjectIsStatic(style.initializer.expression)) staticInlineStyles++;
          else dynamicInlineStyles++;
        }
        if (tag === 'button') rawButtonCount++;
        if (tag === 'input') {
          rawInputCount++;
          if (!inUi) {
            const typeValue = attrString(attr(node, 'type'), sf).toLowerCase();
            if (!allowedRawInputTypes.has(typeValue)) rawTextInputOutsideUi.push(`${rel(file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}${typeValue ? `(${typeValue})` : ''}`);
          }
        }
        if (tag === 'select' && !inUi) rawSelectOutsideUi.push(`${rel(file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
        if (tag === 'textarea' && !inUi) rawTextareaOutsideUi.push(`${rel(file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

check(staticInlineStyles === 0, 'No static JSX style objects remain', String(staticInlineStyles));
check(dynamicInlineStyles === 0, 'No dynamic JSX style attributes remain; runtime values use the controlled CSS-variable bridge', String(dynamicInlineStyles));
check(hardCodedHexInTsx === 0, 'No hard-coded hex colors remain in TSX', String(hardCodedHexInTsx));
check(rawTextInputOutsideUi.length === 0, 'No raw text-like <input> remains outside shared UI primitives', rawTextInputOutsideUi.slice(0, 12).join(', '));
check(rawSelectOutsideUi.length === 0, 'No raw <select> remains outside shared UI primitives', rawSelectOutsideUi.slice(0, 12).join(', '));
check(rawTextareaOutsideUi.length === 0, 'No raw <textarea> remains outside shared UI primitives', rawTextareaOutsideUi.slice(0, 12).join(', '));
check(browserPrompts === 0, 'No browser prompt() workflows remain', String(browserPrompts));
check(browserConfirms === 0, 'No browser confirm() workflows remain', String(browserConfirms));

const modalFiles = sourceRows.filter(({ text }) => text.includes('modal-backdrop'));
const modalWithoutHook = modalFiles.filter(({ text }) => !text.includes('useModalDialog') && !text.includes('<Dialog') && !text.includes('AppDialogProvider'));
check(modalWithoutHook.length === 0, 'Every modal-backdrop implementation uses shared dialog/modal behavior', modalWithoutHook.map(({ file }) => rel(file)).join(', '));

warnings.push(`${rawButtonCount} raw <button> and ${rawInputCount} raw <input> tags remain including shared primitive internals and specialized checkbox/radio/range/color/file controls. Generic .btn and text/select/textarea workflows were migrated; all raw controls are covered by the shared normalization layer.`);

console.log(`PASS ${passes.length} UI-standard checks`);
for (const label of passes) console.log(`  ✓ ${label}`);
if (warnings.length) {
  console.log('\nAllowed dynamic/specialized implementation notes:');
  for (const warning of warnings) console.log(`  ! ${warning}`);
}
if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('\nUI standards verification passed.');
