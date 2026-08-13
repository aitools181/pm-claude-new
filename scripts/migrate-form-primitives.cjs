#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=path.resolve(__dirname,'..'); const web=path.join(root,'apps/web'); const ui=path.join(web,'components/ui');
function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.next'].includes(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p,o);else if(p.endsWith('.tsx')&&!p.startsWith(ui+path.sep))o.push(p)}return o}
function modulePath(file){let rel=path.relative(path.dirname(file),ui).replace(/\\/g,'/'); if(!rel.startsWith('.'))rel='./'+rel; return rel;}
let changedFiles=0,inputs=0,selects=0,textareas=0;
for(const file of walk(web)){
  const source=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const reps=[];let needI=false,needS=false,needT=false;
  function inputAllowed(node){const typeAttr=node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.text==='type');if(!typeAttr)return true;if(!ts.isJsxAttribute(typeAttr)||!typeAttr.initializer||!ts.isStringLiteral(typeAttr.initializer))return false;return !['checkbox','radio','range','color','file','hidden'].includes(typeAttr.initializer.text);}
  function visit(n){
    if(ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n)){const tag=n.tagName.getText(sf);if(tag==='input'&&inputAllowed(n)){reps.push({start:n.tagName.getStart(sf),end:n.tagName.getEnd(),text:'UiInput'});needI=true;inputs++;}else if(tag==='select'){reps.push({start:n.tagName.getStart(sf),end:n.tagName.getEnd(),text:'UiSelect'});needS=true;selects++;}else if(tag==='textarea'){reps.push({start:n.tagName.getStart(sf),end:n.tagName.getEnd(),text:'UiTextarea'});needT=true;textareas++;}}
    if(ts.isJsxClosingElement(n)){const tag=n.tagName.getText(sf);if(tag==='select'){reps.push({start:n.tagName.getStart(sf),end:n.tagName.getEnd(),text:'UiSelect'});}else if(tag==='textarea'){reps.push({start:n.tagName.getStart(sf),end:n.tagName.getEnd(),text:'UiTextarea'});}}
    ts.forEachChild(n,visit);
  } visit(sf);
  if(!reps.length)continue;
  let next=source;for(const r of reps.sort((a,b)=>b.start-a.start))next=next.slice(0,r.start)+r.text+next.slice(r.end);
  const names=[needI?'Input as UiInput':'',needS?'Select as UiSelect':'',needT?'Textarea as UiTextarea':''].filter(Boolean).join(', ');
  const directive=next.match(/^\s*["']use client["'];\s*/); const pos=directive?directive[0].length:0;
  next=next.slice(0,pos)+`\nimport { ${names} } from "${modulePath(file)}";\n`+next.slice(pos);
  fs.writeFileSync(file,next);changedFiles++;
}
console.log(JSON.stringify({changedFiles,inputs,selects,textareas},null,2));
