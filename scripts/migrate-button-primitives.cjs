#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=path.resolve(__dirname,'..'),web=path.join(root,'apps/web'),ui=path.join(web,'components/ui');
function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.next'].includes(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p,o);else if(p.endsWith('.tsx')&&!p.startsWith(ui+path.sep))o.push(p)}return o}
function mod(file){let rel=path.relative(path.dirname(file),ui).replace(/\\/g,'/');if(!rel.startsWith('.'))rel='./'+rel;return rel}
let files=0,buttons=0;
for(const file of walk(web)){
 const src=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const reps=[];
 function visit(n,insideForm=false){
  const nowForm=insideForm || ((ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))&&n.tagName.getText(sf)==='form');
  if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
    if(n.tagName.getText(sf)==='button'){
      const attrs=n.attributes.properties; const c=attrs.find(a=>ts.isJsxAttribute(a)&&a.name.text==='className');
      if(c&&ts.isJsxAttribute(c)&&c.initializer&&ts.isStringLiteral(c.initializer)&&/(^|\s)btn(?:\s|$|-)/.test(c.initializer.text)){
        const tokens=c.initializer.text.split(/\s+/).filter(Boolean); let variant='secondary',size=null;
        if(tokens.includes('btn-primary'))variant='primary'; else if(tokens.includes('btn-danger'))variant='destructive'; else if(tokens.includes('btn-ghost'))variant='tertiary';
        if(tokens.includes('btn-small'))size='compact';
        const keep=tokens.filter(x=>!['btn','btn-primary','btn-danger','btn-ghost','btn-small'].includes(x));
        reps.push({start:n.tagName.getStart(sf),end:n.tagName.getEnd(),text:'UiButton'});
        reps.push({start:c.getStart(sf),end:c.getEnd(),text:keep.length?`className="${keep.join(' ')}"`:''});
        const insert=n.tagName.getEnd(); let extra=` variant="${variant}"`; if(size)extra+=` size="${size}"`;
        const type=attrs.find(a=>ts.isJsxAttribute(a)&&a.name.text==='type'); if(!type&&nowForm)extra+=' type="submit"';
        reps.push({start:insert,end:insert,text:extra}); buttons++;
        n.__uiConverted=true;
      }
    }
  }
  if(ts.isJsxClosingElement(n)&&n.tagName.getText(sf)==='button'){
    // Match closing tags whose corresponding opening element was converted by inspecting parent.
    const parent=n.parent; if(ts.isJsxElement(parent)){
      const o=parent.openingElement; const c=o.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.text==='className');
      if(c&&ts.isJsxAttribute(c)&&c.initializer&&ts.isStringLiteral(c.initializer)&&/(^|\s)btn(?:\s|$|-)/.test(c.initializer.text)) reps.push({start:n.tagName.getStart(sf),end:n.tagName.getEnd(),text:'UiButton'});
    }
  }
  ts.forEachChild(n,ch=>visit(ch,nowForm));
 } visit(sf,false);
 if(!reps.length)continue;let next=src;for(const r of reps.sort((a,b)=>b.start-a.start))next=next.slice(0,r.start)+r.text+next.slice(r.end);
 const directive=next.match(/^\s*["']use client["'];\s*/);const pos=directive?directive[0].length:0;next=next.slice(0,pos)+`\nimport { Button as UiButton } from "${mod(file)}";\n`+next.slice(pos);fs.writeFileSync(file,next);files++;
}
console.log(JSON.stringify({files,buttons},null,2));
