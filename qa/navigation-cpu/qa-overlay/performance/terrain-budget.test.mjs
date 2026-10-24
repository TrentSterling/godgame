import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
const root=fileURLToPath(new URL('../..',import.meta.url)),out=new URL('./generated/',import.meta.url),baseline='8e51eabecb36fd852b684461d45e9d43ba9d1f54';
fs.mkdirSync(out,{recursive:true});
for(const mode of ['baseline','candidate']){
 const plugin={name:'reviewed-source',setup(b){if(mode==='baseline')b.onLoad({filter:/\.js$/},args=>{if(path.dirname(args.path)!==path.join(root,'src'))return;return{contents:execFileSync('git',['show',baseline+':src/'+path.basename(args.path)],{cwd:root,encoding:'utf8'}),loader:'js'};});}};
 await build({stdin:{contents:"export * as terrain from './terrain.js'; export * as regions from './settlement-land-regions.js'; export * as ground from './civilian-ground-point.js'; export {createSettlementWorld} from './settlement-world.js';",resolveDir:path.join(root,'src')},bundle:true,platform:'node',format:'esm',packages:'external',outfile:fileURLToPath(new URL('terrain-'+mode+'.mjs',out)),plugins:[plugin]});
}
const b=await import(new URL('terrain-baseline.mjs',out)),c=await import(new URL('terrain-candidate.mjs',out));
let pointChecks=0,footprints=0,seed=2387913;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
function point(x,z){assert.equal(c.terrain.inArena(x,z),b.terrain.inArena(x,z));assert(Object.is(c.terrain.terrainHeight(x,z),b.terrain.terrainHeight(x,z)),`exact height at ${x},${z}`);pointChecks++;}
for(const scale of [1,1.25,1.5,2]){
 b.terrain.configureArenaScale(scale);c.terrain.configureArenaScale(scale);
 const bs=b.terrain.getArenaSurface(),cs=c.terrain.getArenaSurface();assert.deepEqual(cs,bs,'Same Float32 collision/render mesh');
 for(let i=0;i<bs.vertices.length;i+=3){const x=bs.vertices[i],z=bs.vertices[i+2];for(const factor of [1-1e-8,1,1+1e-8])point(x*factor,z*factor);}
 for(let i=0;i<30000;i++)point((random()*2-1)*32,(random()*2-1)*25);
 for(const [x,z]of [[0,0],[-0,-0],[1e-11,-1e-11],[NaN,0],[Infinity,0],[-Infinity,Infinity],[1e308,1e308]])point(x,z);
}
function compareFootprint(be,ce,x,z){
 const expected=b.ground.supportedCivilianPoint(be,x,z),actual=c.ground.supportedCivilianPoint(ce,x,z);
 assert.deepEqual(actual,expected);assert.equal(c.ground.supportedCivilianHeight(ce,x,z),expected?.y??null);
 assert.deepEqual(c.ground.supportedCivilianRoot(ce,x,z),b.ground.supportedCivilianRoot(be,x,z));footprints++;
}
// Generic callbacks keep their independent bounds contract and callback order.
for(const height of [-50,-20,0,.13,NaN,Infinity])for(const bounded of [false,true]){
 const be={support:()=>height,inBounds:()=>bounded},ce={...be};compareFootprint(be,ce,0,0);
}
for(let i=0;i<1000;i++){
 const be={support:(x,z)=>Math.sin(x)*.15+z*.08,inBounds:(x,z)=>x>=-.8&&z<=.9},ce={...be};compareFootprint(be,ce,random()*3-1.5,random()*3-1.5);
}
let oldReads=0,newReads=0;
function flat(module,count){return module.regions.createLandRegionRegistry({regions:[{id:'flat',bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},contains:()=>true,support:()=>{count();return .1;}}]});}
const oldFlat=flat(b,()=>oldReads++),newFlat=flat(c,()=>newReads++);
assert.deepEqual(c.ground.supportedCivilianPoint(newFlat,0,0),b.ground.supportedCivilianPoint(oldFlat,0,0));assert.equal(oldReads,18);assert.equal(newReads,9);
const fullFootprintSupportReads={baseline:oldReads,candidate:newReads};
for(const replacement of [{inBounds:()=>false},{inBounds:(x,z)=>x>=0},{support:(x,z)=>Math.abs(x)>.6?2:.1}]){
 // A spread keeps the metadata but replacing either callback must disable reuse.
 for(const x of [-.5,0,.5])compareFootprint({...oldFlat,...replacement},{...newFlat,...replacement},x,0);
}
// A mutable bridge support closure is read on every call. No spatial or frame cache.
await RAPIER.init();b.terrain.configureArenaScale(1);c.terrain.configureArenaScale(1);
const bw=new RAPIER.World({x:0,y:-9.81,z:0}),cw=new RAPIER.World({x:0,y:-9.81,z:0});
try{
 const be=b.createSettlementWorld(new THREE.Scene(),bw,RAPIER),ce=c.createSettlementWorld(new THREE.Scene(),cw,RAPIER);
 for(let delivery=0;delivery<=5;delivery++){
  be.update(delivery);ce.update(delivery);
  for(let x=11.9;x<=19.4;x+=.125)for(const z of [-3.8,-3.75,-3.5,-2,-.5,-.25,-.2]){
   assert.equal(ce.support(x,z),be.support(x,z));assert.equal(ce.inBounds(x,z),be.inBounds(x,z));compareFootprint(be,ce,x,z);
  }
  for(let i=0;i<1500;i++){const x=random()*45-16,z=random()*35-24;assert.equal(ce.support(x,z),be.support(x,z));compareFootprint(be,ce,x,z);}
 }
}finally{bw.free();cw.free();}
const report={pass:true,baseline,pointChecks,footprintChecks:footprints,bridgeStates:6,fullFootprintSupportReads,scope:'Exact JavaScript numeric results, original Float32 terrain, custom bounds, callback replacement and native dynamic bridge topology. No browser/GPU or Quest performance.'};
fs.writeFileSync(new URL('terrain-budget.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
