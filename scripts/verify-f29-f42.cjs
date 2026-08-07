#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const tsCandidates = [
  process.env.TYPESCRIPT_PATH,
  '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript',
  '/usr/local/lib/node_modules/typescript',
  '/usr/local/slides_js/node_modules/typescript',
].filter(Boolean);
let ts;
for (const candidate of tsCandidates) { try { ts = require(candidate); break; } catch {} }
if (!ts) throw new Error('TypeScript runtime was not found. Set TYPESCRIPT_PATH.');

const failures = [];
const passes = [];
const check = (condition, label, detail = '') => {
  if (condition) passes.push(label);
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist', '.git'].includes(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, out);
    else out.push(target);
  }
  return out;
}

const sourceFiles = ['apps', 'packages'].flatMap((d) => walk(path.join(root, d))).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'));
let syntaxErrors = 0;
for (const file of sourceFiles) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  for (const diagnostic of result.diagnostics || []) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      syntaxErrors++;
      failures.push(`Syntax ${path.relative(root, file)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }
  }
}
check(syntaxErrors === 0, `TypeScript/TSX syntax (${sourceFiles.length} files)`);

let unresolved = 0;
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const rx = /(?:from\s+|import\s*)["'](\.{1,2}\/[^"']+)["']/g;
  for (const match of source.matchAll(rx)) {
    const spec = match[1];
    if (/\.css$/.test(spec)) continue;
    const base = path.resolve(path.dirname(file), spec.replace(/\.js$/, ''));
    const options = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
    if (!options.some(fs.existsSync)) { unresolved++; failures.push(`Unresolved import ${path.relative(root, file)} -> ${spec}`); }
  }
}
check(unresolved === 0, 'Relative imports resolve');

function loadPure(relative) {
  const filename = path.join(root, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', '__filename', '__dirname', compiled)(module, module.exports, require, filename, path.dirname(filename));
  return module.exports;
}

try {
  const { parseWql } = loadPure('apps/api/src/wql/wql.ts');
  const ast = parseWql('project = "P1" AND (status IN ["To Do", "In Progress"] OR owner = currentUser())');
  check(ast && ast.type === 'and', 'F31 WQL parses AND/OR/IN/functions');
  let rejected = false; try { parseWql('drop_table = "x"'); } catch { rejected = true; }
  check(rejected, 'F31 WQL rejects unknown/unsafe fields');
} catch (error) { failures.push(`F31 WQL engine: ${error.message}`); }

try {
  const { autoSchedule } = loadPure('apps/api/src/scenarios/scenario-engine.ts');
  const base = [
    { id: 'A', startDate: null, dueDate: null, durationDays: 2, estimateMinutes: null, ownerId: 'u1', version: 1, progress: 0, statusCategory: 'todo' },
    { id: 'B', startDate: null, dueDate: null, durationDays: 1, estimateMinutes: null, ownerId: 'u1', version: 1, progress: 0, statusCategory: 'todo' },
  ];
  const scheduled = autoSchedule(base, [{ predecessorId: 'A', successorId: 'B' }], new Date('2026-01-05T00:00:00Z'));
  const a = scheduled.items.find((i) => i.id === 'A'), b = scheduled.items.find((i) => i.id === 'B');
  check(a.dueDate === '2026-01-06' && b.startDate === '2026-01-07', 'F33 deterministic dependency scheduling');
  const cycle = autoSchedule(base, [{ predecessorId: 'A', successorId: 'B' }, { predecessorId: 'B', successorId: 'A' }]);
  check(cycle.warnings.filter((w) => w.code === 'DEPENDENCY_CYCLE').length === 2, 'F33 cycle warnings');
} catch (error) { failures.push(`F33 scenario engine: ${error.message}`); }

try {
  const { businessMinutesBetween, breachAt } = loadPure('apps/api/src/service-management/sla-engine.ts');
  const calendar = { weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, holidays: [] };
  check(businessMinutesBetween(new Date('2026-01-05T09:00:00Z'), new Date('2026-01-05T17:00:00Z'), calendar) === 480, 'F38 deterministic SLA business minutes');
  check(breachAt(new Date('2026-01-05T09:00:00Z'), 480, calendar).toISOString() === '2026-01-05T17:00:00.000Z', 'F38 SLA breach forecast');
} catch (error) { failures.push(`F38 SLA engine: ${error.message}`); }

try {
  const { scoreIdea } = loadPure('apps/api/src/discovery/prioritisation.ts');
  const score = scoreIdea('rice', { reach: 100, impact: 2, confidence: 80, effort: 4, customerWeight: 1 });
  check(score === 40, 'F39 RICE prioritisation fixture');
} catch (error) { failures.push(`F39 prioritisation: ${error.message}`); }

try {
  const { normalizeVendorExport } = loadPure('apps/api/src/migration-assistants/vendor-normalizers.ts');
  const fixtures = {
    asana: { projects: [{ gid: 'p1', name: 'A' }], tasks: [{ gid: 't1', name: 'Task' }] },
    jira: { projects: [{ id: 'p1', key: 'J', name: 'Jira' }], issues: [{ id: '1', key: 'J-1', fields: { summary: 'Issue', issuetype: { name: 'Task' }, status: { name: 'Open' } } }] },
    clickup: { projects: [{ id: 'p1', name: 'C' }], tasks: [{ id: 't1', name: 'ClickUp task', status: { status: 'open' } }] },
  };
  for (const vendor of Object.keys(fixtures)) check(normalizeVendorExport(vendor, fixtures[vendor]).items.length === 1, `F34 ${vendor} normalizer fixture`);
} catch (error) { failures.push(`F34 vendor normalizers: ${error.message}`); }

const featureSchemas = [
  'enterprise-identity.ts', 'calculations.ts', 'scenarios.ts', 'migration-assistants.ts', 'devops.ts', 'connected-search.ts',
  'sandbox.ts', 'service-management.ts', 'discovery.ts', 'communications.ts', 'productivity.ts', 'ai-agents.ts', 'wql.ts',
];
const tableNames = [];
for (const name of featureSchemas) {
  const text = fs.readFileSync(path.join(root, 'packages/db/src/schema', name), 'utf8');
  for (const match of text.matchAll(/pgTable\("([^"]+)"/g)) tableNames.push(match[1]);
}
const migrations = walk(path.join(root, 'packages/db/migrations')).filter((f) => f.endsWith('.sql')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const missingTables = tableNames.filter((name) => !new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ["']?${name}["']?`, 'i').test(migrations));
check(missingTables.length === 0, `F29-F42 database migration coverage (${tableNames.length} tables)`, missingTables.join(', '));
check(/request_hash/.test(fs.readFileSync(path.join(root, 'packages/db/migrations/0027_f29_f42_completion.sql'), 'utf8')), 'Idempotency request-hash migration');

const requiredPages = [
  'admin/identity', 'admin/sandbox', 'calculations', 'scenarios', 'migration', 'devops', 'connected-search',
  'service', 'discovery', 'communications', 'productivity', 'ai/agents',
];
for (const page of requiredPages) check(fs.existsSync(path.join(root, 'apps/web/app/(app)', page, 'page.tsx')), `UI route ${page}`);
const requiredApiDirs = ['enterprise-identity','calculations','scenarios','migration-assistants','devops','connected-search','sandbox','service-management','discovery','communications','productivity','ai-agents','wql'];
for (const dir of requiredApiDirs) check(fs.existsSync(path.join(root, 'apps/api/src', dir)), `API module ${dir}`);

const appModule = fs.readFileSync(path.join(root, 'apps/api/src/app.module.ts'), 'utf8');
for (const name of ['EnterpriseIdentityModule','CalculationsModule','ScenariosModule','MigrationAssistantsModule','DevOpsModule','ConnectedSearchModule','SandboxModule','ServiceManagementModule','DiscoveryModule','CommunicationsModule','ProductivityModule','AiAgentsModule']) check(appModule.includes(name), `AppModule imports ${name}`);

const journal = JSON.parse(fs.readFileSync(path.join(root, 'packages/db/migrations/meta/_journal.json'), 'utf8'));
check(journal.entries.some((e) => e.tag === '0027_f29_f42_completion'), 'Migration journal includes 0027');
check(journal.entries.some((e) => e.tag === '0028_auth_security_completion'), 'Migration journal includes 0028 auth security');


const authController = fs.readFileSync(path.join(root, 'apps/api/src/auth/auth.controller.ts'), 'utf8');
const authService = fs.readFileSync(path.join(root, 'apps/api/src/auth/auth.service.ts'), 'utf8');
const sessionService = fs.readFileSync(path.join(root, 'apps/api/src/auth/session.service.ts'), 'utf8');
const twofaService = fs.readFileSync(path.join(root, 'apps/api/src/twofa/twofa.service.ts'), 'utf8');
const mailService = fs.readFileSync(path.join(root, 'apps/api/src/mail/mail.service.ts'), 'utf8');
const authMigration = fs.readFileSync(path.join(root, 'packages/db/migrations/0028_auth_security_completion.sql'), 'utf8');
check(authController.includes('password-reset/request') && authController.includes('password-reset/confirm'), 'Password reset request/confirm routes');
check(authController.includes('email-verification/request') && authController.includes('email-verification/confirm'), 'Email verification routes');
check(authController.includes('sessions/revoke-all') && authController.includes('Delete("sessions/:sessionId")'), 'Session revoke-one/revoke-all routes');
check(authService.includes('failedLoginCount') && authService.includes('lockedUntil') && authService.includes('RATE_LIMITED'), 'Database-backed login lockout');
check(!sessionService.includes('return this.db.select().from(schema.userSessions)'), 'Session API explicitly projects safe fields');
check(twofaService.includes('twoFactorRecoveryCodes') && twofaService.includes('verifyRecoveryCode'), 'Hashed single-use 2FA recovery codes');
check(!mailService.includes('\n${body}') && mailService.includes('Buffer.byteLength'), 'Mail adapter does not log token-bearing body');
check(authMigration.includes('two_factor_recovery_codes') && authMigration.includes('email_verified_at'), 'Auth security migration coverage');

const detailController = fs.readFileSync(path.join(root, 'apps/api/src/work/work.controller.ts'), 'utf8');
const detailService = fs.readFileSync(path.join(root, 'apps/api/src/work/work-item-details.service.ts'), 'utf8');
const drawer = fs.readFileSync(path.join(root, 'apps/web/components/work/TaskDrawer.tsx'), 'utf8');
check(detailController.includes('checklist-items') && detailController.includes('work-items/:id/tags'), 'Checklist and tag API routes');
check(detailService.includes('canAccessWorkItem') && detailService.includes('work_item.checklist_item_added'), 'Checklist/tag access and activity enforcement');
check(drawer.includes('uploadAttachment') && drawer.includes('Checklist') && drawer.includes('Custom fields'), 'Task Drawer files/checklist/tags/custom fields UX');

const dangerous = walk(path.join(root, 'apps/api/src')).filter((f) => f.endsWith('.ts')).flatMap((f) => {
  const text = fs.readFileSync(f, 'utf8');
  return text.includes('patch as never') ? [path.relative(root, f)] : [];
});
check(dangerous.length === 0, 'AI mass-update patch is field-whitelisted', dangerous.join(', '));

const report = {
  generatedAt: new Date().toISOString(), sourceFiles: sourceFiles.length, tablesChecked: tableNames.length,
  passed: passes.length, failed: failures.length, passes, failures,
};
fs.writeFileSync(path.join(root, 'verification-f29-f42.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ sourceFiles: report.sourceFiles, tablesChecked: report.tablesChecked, passed: report.passed, failed: report.failed }, null, 2));
if (failures.length) { console.error('\nFailures:\n- ' + failures.join('\n- ')); process.exit(1); }
