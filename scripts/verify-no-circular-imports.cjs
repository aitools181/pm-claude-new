/**
 * verify-no-circular-imports.cjs
 *
 * Guards against the exact production crash class hit in v7.7:
 * `ReferenceError: Cannot access 'X' before initialization` at boot, caused by
 * a circular ES-module import chain combined with TypeScript's
 * emitDecoratorMetadata (which emits a live runtime reference to a
 * constructor-parameter's class for NestJS DI - so a cycle that is completely
 * harmless for types becomes a real TDZ crash at process start).
 *
 * Only apps/api is checked: it is the only package built with
 * emitDecoratorMetadata (NestJS). Dependency-free DFS cycle detector over
 * `import ... from "./relative"` specifiers, resolved to real files.
 */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "apps", "api", "src");

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (f.endsWith(".ts") && !f.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null; // external package — not our concern
  let target = path.normalize(path.join(path.dirname(fromFile), spec)).replace(/\.js$/, ".ts");
  if (fs.existsSync(target)) return target;
  const asIndex = target.replace(/\.ts$/, "/index.ts");
  if (fs.existsSync(asIndex)) return asIndex;
  return null;
}

const files = walk(root);
const graph = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const deps = new Set();
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
    const resolved = resolveImport(f, m[1]);
    if (resolved) deps.add(resolved);
  }
  graph.set(f, deps);
}

const WHITE = 0, GRAY = 1, BLACK = 2;
const color = new Map(files.map((f) => [f, WHITE]));
const cycles = [];

function dfs(node, stack) {
  color.set(node, GRAY);
  stack.push(node);
  for (const dep of graph.get(node) || []) {
    if (color.get(dep) === GRAY) {
      const idx = stack.indexOf(dep);
      cycles.push(stack.slice(idx).concat(dep).map((x) => path.relative(root, x)));
    } else if (color.get(dep) === WHITE) {
      dfs(dep, stack);
    }
  }
  stack.pop();
  color.set(node, BLACK);
}
for (const f of files) if (color.get(f) === WHITE) dfs(f, []);

console.log(`Scanned ${files.length} files in apps/api/src.`);
if (cycles.length) {
  console.log(`\nFAIL — ${cycles.length} circular import chain(s) found (these crash at boot under NestJS emitDecoratorMetadata):`);
  for (const c of cycles) console.log(`  ✗ ${c.join(" -> ")}`);
  process.exitCode = 1;
} else {
  console.log("PASS — no circular imports in apps/api/src.");
}
