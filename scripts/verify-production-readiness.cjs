#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const passes = [], failures = [], warnings = [];
const check = (ok, label, detail = '') => ok ? passes.push(label) : failures.push(`${label}${detail ? `: ${detail}` : ''}`);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist', '.git'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    e.isDirectory() ? walk(f, out) : out.push(f);
  }
  return out;
}
const rel = (f) => path.relative(root, f).replace(/\\/g, '/');

// 1. Compile-blocker regression and source syntax.
const workflow = read('apps/web/app/(app)/admin/configure/workflows/[id]/page.tsx');
check(!/<[^>]+\bclassName=[^>]+\bclassName=/.test(workflow), 'Workflow editor has no duplicate JSX className attributes');
const sourceFiles = ['apps', 'packages'].flatMap(d => walk(path.join(root, d))).filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'));
let syntaxErrors = 0;
for (const file of sourceFiles) {
  try {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    for (const d of out.diagnostics || []) if (d.category === ts.DiagnosticCategory.Error) {
      syntaxErrors++;
      if (syntaxErrors <= 8) failures.push(`Syntax ${rel(file)}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    }
  } catch (e) {
    syntaxErrors++;
    if (syntaxErrors <= 8) failures.push(`Transpile ${rel(file)}: ${e.message}`);
  }
}
check(syntaxErrors === 0, `TypeScript/TSX transpile syntax (${sourceFiles.length} files)`, `${syntaxErrors} error(s)`);

// 2. Automation tenant boundaries.
const automation = read('apps/api/src/automation/automation.service.ts');
const automationController = read('apps/api/src/automation/automation.controller.ts');
check(automation.includes('assertRuleInOrg(organizationId, ruleId)') && automation.includes('private async assertRuleInOrg'), 'Automation authoring verifies rule ownership');
check(automation.includes('async steps(organizationId: string, runId: string)') && automation.includes('eq(schema.automationRunSteps.organizationId, organizationId)'), 'Automation run-step reads are organization-scoped');
check(automationController.includes('this.auto.steps(r.organizationId, id)'), 'Automation controller passes organization scope to run-step reads');

// 3. Browser-to-API/realtime topology.
const nextConfig = read('apps/web/next.config.mjs');
const apiClient = read('apps/web/lib/api.ts');
const realtime = read('apps/web/lib/realtime.ts');
const apiMain = read('apps/api/src/main.ts');
const gateway = read('apps/api/src/realtime/realtime.gateway.ts');
check(nextConfig.includes('source: "/api/:path*"') && nextConfig.includes('source: "/socket.io/:path*"'), 'Next proxies both REST and Socket.IO same-origin paths');
check(apiClient.includes('process.env.NEXT_PUBLIC_API_URL?.trim() ?? ""') && apiClient.includes('credentials: "include"'), 'Web API client defaults to same-origin credentialed requests');
check(realtime.includes('path: "/socket.io"') && realtime.includes('"polling", "websocket"'), 'Realtime client has same-origin Socket.IO path with polling/websocket fallback');
check(apiMain.includes('credentials: true') && apiMain.includes('CORS_ORIGINS'), 'API CORS is credential-aware and allow-list driven');
check(!gateway.includes('origin: true') && gateway.includes('APP_URL'), 'Realtime gateway no longer allows arbitrary origins');

// 4. Deployment readiness, migrations, storage and deterministic dependency install.
const compose = read('docker-compose.yml');
check(compose.includes("/api/v1/health/ready") && !compose.includes('MIGRATE_FAILED') && !/drizzle-kit migrate[^\n]*\|\|/.test(compose), 'Container API health uses readiness and migration failures are fatal');
check(compose.includes('minio-init:') && compose.includes('mc mb --ignore-existing') && compose.includes('mc anonymous set none'), 'Fresh deployment creates a private MinIO bucket');
for (const secret of ['POSTGRES_PASSWORD:?','MINIO_ROOT_USER:?','MINIO_ROOT_PASSWORD:?','SESSION_SECRET:?']) check(compose.includes(secret), `Compose requires ${secret.replace(':?','')}`);
for (const dockerfile of ['apps/api/Dockerfile','apps/web/Dockerfile','apps/worker/Dockerfile','apps/maintenance/Dockerfile']) {
  const text = read(dockerfile);
  check(text.includes('pnpm install --frozen-lockfile') && !text.includes('--frozen-lockfile=false'), `Deterministic install in ${dockerfile}`);
}
const storage = read('apps/api/src/files/storage.gateway.ts');
const health = read('apps/api/src/ops/health.service.ts');
check(storage.includes('HeadBucketCommand') && storage.includes('CreateBucketCommand') && storage.includes('ensureBucket()'), 'Object storage validates/creates its configured bucket');
check(health.includes('probe("database"') && health.includes('probe("redis"') && health.includes('probe("storage"'), 'Readiness probes database, Redis and object storage');

// 5. Auth/navigation safety.
const middleware = read('apps/web/middleware.ts');
const appDir = path.join(root, 'apps/web/app/(app)');
const appRoutes = fs.readdirSync(appDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => `/${e.name}`).sort();
const missingProtected = appRoutes.filter(route => !middleware.includes(`"${route}"`));
check(missingProtected.length === 0, `Middleware covers every top-level authenticated app route (${appRoutes.length})`, missingProtected.join(', '));
const login = read('apps/web/app/login/page.tsx');
const userMenu = read('apps/web/components/shell/UserMenu.tsx');
check(!login.includes('document.cookie = "pm_session') && !login.includes("document.cookie = 'pm_session"), 'Login does not forge a client-side session sentinel');
check(userMenu.includes('/auth/logout') && userMenu.includes('disconnectSocket()'), 'User menu provides server logout and realtime cleanup');
const breakglass = read('apps/api/src/enterprise-identity/enterprise-identity-public.controller.ts');
check(breakglass.includes('secure: this.env.NODE_ENV === "production"'), 'Break-glass session cookie is Secure in production');

// 6. UI interaction/accessibility regressions.
const webTsx = walk(path.join(root, 'apps/web')).filter(f => f.endsWith('.tsx'));
let nonInteractiveClick = [];
let nestedInteractive = [];
let deadButtons = [];
const allowedDeadFiles = new Set(['apps/web/components/shell/OrgSwitcher.tsx','apps/web/components/shell/UserMenu.tsx','apps/web/components/ui/Button.tsx']);
for (const file of webTsx) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function tagOf(node) { return (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText(sf); }
  function attrsOf(node) { return (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties.filter(ts.isJsxAttribute); }
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagOf(node), attrs = attrsOf(node), names = new Set(attrs.map(a => a.name.text));
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (['div','span','tr','article'].includes(tag) && names.has('onClick') && !names.has('onKeyDown') && !names.has('onKeyUp') && !names.has('role')) {
        nonInteractiveClick.push(`${rel(file)}:${line}`);
      }
      if (tag === 'button' && ts.isJsxElement(node)) {
        const bad = [];
        function inner(x) {
          if (x !== node && (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x))) {
            const t = tagOf(x);
            if (['button','a','input','select','textarea','UiSelect','UiInput','UiButton'].includes(t)) bad.push(t);
          }
          ts.forEachChild(x, inner);
        }
        node.children.forEach(inner);
        if (bad.length) nestedInteractive.push(`${rel(file)}:${line} -> ${[...new Set(bad)].join(',')}`);

        const action = [...names].some(n => /^on(Key|Click|Mouse|Pointer|Touch|Submit)/.test(n)) || names.has('formAction') || attrs.some(a => a.name.text === 'type' && a.initializer?.getText(sf).includes('submit'));
        if (!action && !names.has('disabled') && !allowedDeadFiles.has(rel(file))) deadButtons.push(`${rel(file)}:${line}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
check(nonInteractiveClick.length === 0, 'No click-only non-interactive div/span/tr/article remains', nonInteractiveClick.slice(0, 12).join(', '));
check(nestedInteractive.length === 0, 'No button contains a nested interactive control', nestedInteractive.slice(0, 12).join(', '));
check(deadButtons.length === 0, 'No misleading raw buttons without an action remain', deadButtons.slice(0, 12).join(', '));

// 7. Central error/session handling.
check(apiClient.includes('new ApiError(0, "NETWORK"') && apiClient.includes('window.location.assign(`/login?expired=1&next=${next}`)'), 'API and download clients surface network failures and centralize 401 recovery');

// 8. Durable background work and idempotency.
const jobRunner = read('apps/worker/src/job-runner.ts');
const worker = read('apps/worker/src/main.ts');
const producer = read('apps/api/src/background-jobs/background-jobs.service.ts');
const appModule = read('apps/api/src/app.module.ts');
check(jobRunner.includes('pg_advisory_xact_lock') && jobRunner.indexOf('pg_advisory_xact_lock') < jobRunner.indexOf('const [seen]'), 'Worker idempotency lock is acquired before prior-result check/effect');
check(worker.includes('retention-auto-purge') && worker.includes('retention-purge') && !worker.includes('case "noop"'), 'Worker executes real retention domain jobs');
check(producer.includes('new Queue') && producer.includes('enqueueRetentionPurge') && appModule.includes('BackgroundJobsModule'), 'API has a real BullMQ producer wired into AppModule');

// 9. AI/integration/report/webhook boundaries are real or explicitly disabled.
const env = read('packages/shared/src/env.ts');
const aiProvider = read('apps/api/src/ai/provider.ts');
const integration = read('apps/api/src/integrations/adapter.ts');
const reportDeliverer = read('apps/api/src/reports/deliverer.ts');
const webhookSender = read('apps/api/src/webhooks/webhook-sender.ts');
check(env.includes('Mock AI provider is not allowed in production') && aiProvider.includes('/chat/completions'), 'Production AI cannot silently use a mock and has configurable real HTTP provider');
check(integration.includes('https://api.github.com') && integration.includes('https://gitlab.com/api/v4') && integration.includes('config.healthUrl') && integration.includes('return probe(`${base}/user`'), 'Integration health checks perform real provider/health endpoint probes');
check(reportDeliverer.includes('MailReportDeliverer') && !reportDeliverer.includes('LogDeliverer'), 'Scheduled report delivery uses the real mail boundary, not a log-only success');
check(webhookSender.includes('FetchWebhookSender') && webhookSender.includes('lookup') && !webhookSender.includes('LogWebhookSender'), 'Outbound webhooks use real HTTP delivery with private-address SSRF guard');

// 10. Static frontend API route contract check.
function decorators(node) { return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : []; }
function decoratorCallName(d, sf) { return ts.isCallExpression(d.expression) ? d.expression.expression.getText(sf) : null; }
function firstLiteral(call) {
  if (!call.arguments.length) return '';
  const a = call.arguments[0];
  return ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) ? a.text : null;
}
const backendRoutes = [];
for (const file of walk(path.join(root, 'apps/api/src')).filter(f => f.endsWith('.controller.ts'))) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const st of sf.statements) {
    if (!ts.isClassDeclaration(st)) continue;
    let base = '';
    for (const d of decorators(st)) if (decoratorCallName(d, sf) === 'Controller') {
      const v = firstLiteral(d.expression); if (v !== null) base = v;
    }
    for (const member of st.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      for (const d of decorators(member)) {
        const map = { Get:'GET', Post:'POST', Put:'PUT', Patch:'PATCH', Delete:'DELETE' };
        const verb = map[decoratorCallName(d, sf)]; if (!verb) continue;
        const tail = firstLiteral(d.expression); if (tail === null) continue;
        backendRoutes.push({ verb, path: '/' + [base, tail].filter(Boolean).join('/').replace(/^\/+|\/+$/g, '') });
      }
    }
  }
}
function staticPath(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) out += ':dyn' + span.literal.text;
    return out;
  }
  return null;
}
function requestMethods(name, arg) {
  if (name === 'apiUpload') return ['PUT'];
  if (name === 'apiDownload') return ['GET'];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return ['GET'];
  const prop = arg.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText().replace(/["']/g, '') === 'method');
  if (!prop) return ['GET'];
  const x = prop.initializer;
  if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) return [x.text.toUpperCase()];
  if (ts.isConditionalExpression(x)) {
    const v = [x.whenTrue, x.whenFalse].filter(ts.isStringLiteral).map(n => n.text.toUpperCase());
    if (v.length) return v;
  }
  return ['*'];
}
const frontendCalls = [];
for (const file of walk(path.join(root, 'apps/web')).filter(f => /\.(ts|tsx)$/.test(f))) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(sf);
      if (['api','apiUpload','apiDownload'].includes(name) && node.arguments[0]) {
        const p = staticPath(node.arguments[0]);
        if (p?.startsWith('/')) for (const verb of requestMethods(name, node.arguments[1])) frontendCalls.push({ verb, path: p.split('?')[0], file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
function routeRegex(routePath) {
  let p = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z0-9_]+/g, '[^/]+');
  return new RegExp('^' + p + '/?$');
}
const routeMisses = frontendCalls.filter(c => !backendRoutes.some(r => (c.verb === '*' || r.verb === c.verb) && routeRegex(r.path).test(c.path)));
check(routeMisses.length === 0, `All ${frontendCalls.length} statically-resolvable frontend API calls map to ${backendRoutes.length} backend routes`, routeMisses.slice(0, 12).map(x => `${x.verb} ${x.path} ${rel(x.file)}:${x.line}`).join('; '));


// AdvancedModuleHub receives endpoints as data, so those calls are not visible as literal api(...) arguments.
const hubEndpointConfigs = [];
for (const file of walk(path.join(root, 'apps/web/app')).filter(f => f.endsWith('.tsx'))) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/overviewEndpoint="([^"]+)"/g)) hubEndpointConfigs.push({ verb: 'GET', path: m[1], file });
  for (const m of src.matchAll(/\{\s*label:\s*"[^"]+"\s*,\s*endpoint:\s*"([^"]+)"([^}]*)\}/g)) {
    const tail = m[2] || '';
    const method = /method:\s*"(POST|PATCH)"/.exec(tail)?.[1] || 'POST';
    hubEndpointConfigs.push({ verb: method, path: m[1], file });
  }
}
const hubMisses = hubEndpointConfigs.filter(c => !backendRoutes.some(r => r.verb === c.verb && routeRegex(r.path).test(c.path)));
check(hubMisses.length === 0, `All ${hubEndpointConfigs.length} configured AdvancedModuleHub endpoints map to backend routes`, hubMisses.slice(0, 12).map(x => `${x.verb} ${x.path} ${rel(x.file)}`).join('; '));

// Runtime certification is intentionally separated from static verification.
warnings.push('Full semantic typecheck/build, Docker integration tests and browser Playwright/axe runs require the project dependencies, Node 20 and Docker. This verifier proves source/static contracts only.');

console.log(`PASS ${passes.length} production-readiness source checks`);
for (const p of passes) console.log(`  ✓ ${p}`);
if (warnings.length) { console.log('\nNotes:'); for (const w of warnings) console.log(`  ! ${w}`); }
if (failures.length) { console.error(`\nFAIL ${failures.length}`); for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }
console.log('\nProduction-readiness source verification passed.');
