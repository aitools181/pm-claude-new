#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'apps/web');
const outCss = path.join(web, 'app/ui-static.css');
const unitless = new Set(['animationIterationCount','borderImageOutset','borderImageSlice','borderImageWidth','boxFlex','boxFlexGroup','boxOrdinalGroup','columnCount','columns','flex','flexGrow','flexPositive','flexShrink','flexNegative','flexOrder','gridArea','gridColumn','gridColumnEnd','gridColumnSpan','gridColumnStart','gridRow','gridRowEnd','gridRowSpan','gridRowStart','fontWeight','lineClamp','lineHeight','opacity','order','orphans','tabSize','widows','zIndex','zoom','fillOpacity','floodOpacity','stopOpacity','strokeDasharray','strokeDashoffset','strokeMiterlimit','strokeOpacity','strokeWidth']);
const replacements = [
  [/var\(--ink-3\)/g, 'var(--ui-text-muted)'], [/var\(--ink-2\)/g, 'var(--ui-text-secondary)'],
  [/var\(--muted-2\)/g, 'var(--ui-text-muted)'], [/var\(--muted\)/g, 'var(--ui-text-secondary)'],
  [/var\(--text\)/g, 'var(--ui-text)'], [/var\(--panel\)/g, 'var(--ui-surface)'],
  [/var\(--surface\)/g, 'var(--ui-surface)'], [/var\(--hair\)/g, 'var(--ui-border)'],
  [/var\(--line\)/g, 'var(--ui-border)'], [/var\(--accent\)/g, 'var(--ui-action)'],
  [/var\(--primary\)/g, 'var(--ui-action)'], [/var\(--accent-soft\)/g, 'var(--ui-action-soft)'],
  [/var\(--primary-weak\)/g, 'var(--ui-action-soft)'], [/var\(--danger\)/g, 'var(--ui-danger)'],
  [/var\(--success\)/g, 'var(--ui-success)']
];
function walk(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules','.next','dist'].includes(e.name)) continue; const p = path.join(dir,e.name); if (e.isDirectory()) walk(p,out); else if (p.endsWith('.tsx')) out.push(p); } return out; }
function cssProp(name) { if (name.startsWith('--')) return name; if (name === 'cssFloat') return 'float'; return name.replace(/^ms([A-Z])/, 'ms-$1').replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase(); }
function cssValue(prop, node) { if (ts.isNumericLiteral(node)) { const n = Number(node.text); if (n === 0 || unitless.has(prop)) return String(n); return `${node.text}px`; } let value = node.text; for (const [from,to] of replacements) value = value.replace(from,to); return value; }
function staticStyle(obj) { const declarations = []; for (const p of obj.properties) { if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return null; const v=p.initializer; if (!(ts.isStringLiteral(v)||ts.isNoSubstitutionTemplateLiteral(v)||ts.isNumericLiteral(v))) return null; const name=p.name.text; declarations.push([cssProp(name), cssValue(name,v)]); } return declarations; }
const rules = new Map();
// Preserve previously extracted classes so the migration is safe to re-run.
// Newly encountered classes are merged rather than replacing the generated file.
if (fs.existsSync(outCss)) {
  const existing = fs.readFileSync(outCss, 'utf8');
  const ruleRe = /\.([A-Za-z0-9_-]+)\{([^{}]*)\}/g;
  let match;
  while ((match = ruleRe.exec(existing))) {
    if (match[1].startsWith('ui-static-')) rules.set(match[1], match[2]);
  }
}
let converted=0; let dynamic=0; let filesChanged=0;
for (const file of walk(web)) {
  const source = fs.readFileSync(file,'utf8'); const sf = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX); const replacementsText=[];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf); if (/^[a-z]/.test(tag)) {
        const attrs = node.attributes.properties; const style = attrs.find(a => ts.isJsxAttribute(a) && a.name.text === 'style');
        if (style && ts.isJsxAttribute(style) && style.initializer && ts.isJsxExpression(style.initializer) && style.initializer.expression && ts.isObjectLiteralExpression(style.initializer.expression)) {
          const decl = staticStyle(style.initializer.expression); if (decl) {
            const body = decl.map(([k,v]) => `${k}:${v}`).join(';'); const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0,8); const cls=`ui-static-${hash}`; rules.set(cls, body);
            const classAttr = attrs.find(a => ts.isJsxAttribute(a) && a.name.text === 'className');
            if (classAttr && ts.isJsxAttribute(classAttr) && classAttr.initializer) {
              const c = classAttr.initializer;
              if (ts.isStringLiteral(c)) replacementsText.push({ start: classAttr.getStart(sf), end: classAttr.getEnd(), text: `className="${c.text} ${cls}"` });
              else if (ts.isJsxExpression(c) && c.expression) replacementsText.push({ start: classAttr.getStart(sf), end: classAttr.getEnd(), text: `className={[${c.expression.getText(sf)}, "${cls}"].filter(Boolean).join(" ")}` });
              else return;
              replacementsText.push({ start: style.getStart(sf), end: style.getEnd(), text: '' });
            } else replacementsText.push({ start: style.getStart(sf), end: style.getEnd(), text: `className="${cls}"` });
            converted++;
          } else dynamic++;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (replacementsText.length) {
    let next=source; for (const r of replacementsText.sort((a,b)=>b.start-a.start)) next=next.slice(0,r.start)+r.text+next.slice(r.end); if(next!==source){fs.writeFileSync(file,next);filesChanged++;}
  }
}
const css = `/* Generated by scripts/extract-static-ui-styles.cjs.\n   Static JSX presentation is centralized here so route components do not own\n   one-off visual declarations. Core components are still normalized by\n   ui-standards.css, which loads after this file. */\n` + [...rules.entries()].sort().map(([cls,body]) => `.${cls}{${body}}`).join('\n') + '\n';
fs.writeFileSync(outCss,css);
console.log(JSON.stringify({converted,dynamic,uniqueClasses:rules.size,filesChanged,output:path.relative(root,outCss)},null,2));
