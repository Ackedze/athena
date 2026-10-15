const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const esbuild=require('esbuild');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'athena-structure-'));
try {
 const outfile=path.join(directory,'pipelines.cjs');
 esbuild.buildSync({stdin:{contents:`
  export { buildVariantOverrides as plugin } from './src/engine/component/describeComponentSet.ts';
  export { buildVariantOverrides as cli } from '../../Athena CLI/src/athena-normalizer.ts';
  export { sanitizeExportPayload } from './src/exportSanitizer.ts';
 `,resolveDir:path.resolve(__dirname,'..'),loader:'ts'},outfile,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
 const {plugin,cli,sanitizeExportPayload}=require(outfile);
 const node=(id,parentId,p)=>({id,parentId,path:p,name:p.split(' / ').at(-1),type:parentId===null?'COMPONENT':'FRAME',visible:true});
 const shape=nodes=>nodes.map(({id,parentId,...n})=>({...n,parentPath:parentId===null?null:nodes.find(p=>p.id===parentId)?.path})).sort((a,b)=>a.path.localeCompare(b.path));
 const apply=(base,patches)=>{const tree=new Map(base.map(n=>[n.id,structuredClone(n)]));for(const p of patches){if(p.op==='add'){assert.ok(!tree.has(p.node.id));tree.set(p.node.id,p.node);}else if(p.op==='remove')assert.ok(tree.delete(p.id));else {assert.ok(tree.has(p.id));tree.set(p.id,{...tree.get(p.id),...p.value});}}return [...tree.values()];};
 const base=[node(1,null,'Base'),node(2,1,'Base / Fixer'),node(6,2,'Base / Fixer / Head')];
 const moved=[node(1,null,'Next'),node(2,1,'Next / Fixer'),node(6,1,'Next / Head')];
 const cases=[[base,moved],[base,[]],[[],moved],[[],[]],
  [[node(1,null,'Base'),node(2,1,'Base / Box'),node(3,2,'Base / Box / Leaf'),node(4,1,'Base / Box'),node(5,4,'Base / Box / Leaf')],
   [node(1,null,'Next'),node(2,1,'Next / Box'),node(3,1,'Next / Box'),node(4,3,'Next / Box / Leaf')]],
  [[node(1,null,'Base'),node(2,1,'Base / X'),node(3,1,'Base / X'),node(4,1,'Base / X@@2')],
   [node(10,null,'Next'),node(11,10,'Next / X@@2'),node(12,10,'Next / X'),node(13,10,'Next / X')]]];
 for(let seed=1;seed<=50;seed++){
  const b=[node(1,null,'Base'),...Array.from({length:8},(_,i)=>node(i+2,1,`Base / N${i}`))];
  let id=20;const v=[node(id,null,'Next')];
  for(let i=0;i<8;i++){if((seed+i)%3===0)continue;const p=node(++id,20,`Next / N${i}`);v.push(p);if((seed+i)%2===0)v.push(node(++id,p.id,p.path+' / New'));}
  cases.push([b,v]);
 }
 for(const [b,v] of cases){
  const before=JSON.stringify({b,v}),patches=plugin(b,v);assert.deepEqual(patches,cli(b,v));
  assert.deepEqual(shape(apply(b,patches)),shape(v));assert.equal(JSON.stringify({b,v}),before);
  const sanitized=JSON.parse(JSON.stringify(sanitizeExportPayload({components:[{structure:b,variantStructures:{v:patches}}]})));
  assert.deepEqual(shape(apply(b,sanitized.components[0].variantStructures.v)),shape(v));
 }
 for(const bad of [[base[0],base[0]],[base[0],node(2,99,'Base / X')],[base[0],node(2,3,'Base / X'),node(3,2,'Base / Y')]]) assert.throws(()=>plugin(base,bad));
 console.log(`PASS ${cases.length} CLI/plugin parity + sanitized topology replays; malformed input rejected.`);
} finally {fs.rmSync(directory,{recursive:true,force:true});}
