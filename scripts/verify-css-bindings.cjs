/**
 * verify-css-bindings.cjs
 * Fails when any className used in apps/web TSX has no selector in the CSS layers.
 * This is the guard against the v6.4-era regression where markup shipped without
 * layout CSS and pages rendered in default inline flow.
 */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "apps", "web");

// Dynamic families resolve at runtime (`bg-${x}`) and marker classes carry only
// CSS variables applied inline by RuntimeStyle — both are exempt by prefix.
const DYNAMIC_PREFIXES = ["bg-", "col-", "h-", "health-", "priority-", "project-health-", "st-", "runtime-", "ui-static-"];

function walk(dir) {
  let out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (f === "node_modules" || f.startsWith(".")) continue; out = out.concat(walk(p)); }
    else if (f.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const cssFiles = ["app/design-tokens.css", "app/globals.css", "app/ui-static.css", "app/ui-standards.css"].map((f) => path.join(root, f));
const defined = new Set();
for (const f of cssFiles) {
  const css = fs.readFileSync(f, "utf8");
  for (const m of css.matchAll(/\.([A-Za-z_][\w-]*)/g)) defined.add(m[1]);
}

const used = new Map();
for (const f of walk(path.join(root, "app")).concat(walk(path.join(root, "components")))) {
  const src = fs.readFileSync(f, "utf8");
  const rel = path.relative(root, f);
  const add = (cls) => {
    for (const c of cls.split(/\s+/)) {
      const t = c.trim();
      if (!t || t.includes("$") || t.includes("{") || t.includes("(") || /^[A-Z]/.test(t)) continue;
      if (!used.has(t)) used.set(t, new Set());
      used.get(t).add(rel);
    }
  };
  for (const m of src.matchAll(/className\s*=\s*"([^"]+)"/g)) add(m[1]);
  for (const m of src.matchAll(/className\s*=\s*\{`([^`]+)`\}/g)) add(m[1].replace(/\$\{[^}]*\}/g, " "));
  for (const m of src.matchAll(/className\s*=\s*\{"([^"]+)"\}/g)) add(m[1]);
}

const missing = [];
for (const [cls, files] of used) {
  if (defined.has(cls)) continue;
  if (DYNAMIC_PREFIXES.some((p) => cls === p || cls.startsWith(p))) continue;
  missing.push([cls, [...files]]);
}

console.log(`Used classes: ${used.size} | Defined selectors: ${defined.size}`);
if (missing.length) {
  console.log(`\nFAIL — ${missing.length} class(es) used in TSX but absent from every CSS layer:`);
  for (const [cls, files] of missing.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ✗ ${cls.padEnd(34)} ${files.slice(0, 2).join(", ")}${files.length > 2 ? ` (+${files.length - 2})` : ""}`);
  }
  process.exitCode = 1;
} else {
  console.log("PASS — every className used in apps/web resolves to a CSS selector (or an approved dynamic/marker prefix).");
}
