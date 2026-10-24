import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Session} from 'node:inspector/promises';
import * as f from '../xr-village/dom-xr-fixture.mjs';
import {createXRRenderBudget} from '../../src/xr-render-budget.js';
let now=1000;Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});location.search='';
await (await import('../xr-village/generated/native.mjs')).ready;await f.flush();
const c=SETTLEMENTQA.context,T=c.THREE,budget=createXRRenderBudget({scene:c.scene,THREE:T});
await c.villageXR.startSession();const left=f.handSource('left'),right=f.handSource('right');f.controls.lastSession.sources([left,right]);
const viewer=f.pose({x:.2,y:1.65,z:.1}),frame=new f.Frame({viewer,hands:new Map([[left,f.handPoints({x:.02,y:1.35,z:-.36})],[right,f.handPoints({x:.35,y:1.35,z:-.36})]])});
now+=1000/72;c.renderer.frame(now,frame);
function census(){const rows={};c.scene.traverseVisible(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){if(!m.visible)continue;const r=rows[m.type]??={objects:0,triangles:0};r.objects++;r.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return rows;}
const before=census(),originals=[];c.scene.traverse(o=>{if(o.isMesh)originals.push([o,o.material,o.geometry,o.skeleton]);});
budget.beginFrame(true);const after=census(),warm=budget.stats();budget.endFrame();
for(let i=0;i<500;i++){budget.beginFrame(true);budget.endFrame();}
const inspector=new Session();inspector.connect();globalThis.gc?.();await inspector.post('HeapProfiler.startSampling',{samplingInterval:16384,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
const frames=20000,start=process.hrtime.bigint();for(let i=0;i<frames;i++){budget.beginFrame(true);budget.endFrame();}const elapsedMs=Number(process.hrtime.bigint()-start)/1e6;
const profile=(await inspector.post('HeapProfiler.stopSampling')).profile;let allocated=0;const allocators=new Map();function walk(n){allocated+=n.selfSize;const key=n.callFrame.functionName||n.callFrame.url;allocators.set(key,(allocators.get(key)||0)+n.selfSize);for(const child of n.children)walk(child);}walk(profile.head);inspector.disconnect();
const final=budget.stats();assert.equal(final.createdMaterials,warm.createdMaterials);
for(const[o,m,g,s]of originals){assert.equal(o.material,m);assert.equal(o.geometry,g);assert.equal(o.skeleton,s);}
const report={pass:true,three:T.REVISION,scope:'CPU-only real production scene with native Rapier, mock XR/DOM and no renderer/GPU. Counts are uncropped visible-scene candidates, not renderer draw calls. begin/end timing includes host allocation sampler overhead, not Quest timings or shader cost.',before,after,warm,overhead:{frames,elapsedMs,meanMs:elapsedMs/frames,estimatedTransientAllocationBytes:allocated,topAllocators:[...allocators].sort((a,b)=>b[1]-a[1]).slice(0,8),createdMaterialsAfterWarmup:final.createdMaterials-warm.createdMaterials},shaderEvidence:{standard:'Three0.160 lights_physical_pars_fragment RE_Direct_Physical invokes BRDF_GGX for direct specular',lambert:'Three0.160 lights_lambert_pars_fragment RE_Direct_Lambert accumulates diffuse only; still per-fragment lighting'},remainingGates:['Matched real-renderer calls/triangles and captures','Visual/readability review with shadows already off in XR','GPU timing only under coordinated owned muted browser lease','Physical Quest acceptance remains user-owned']};
fs.writeFileSync(new URL('./generated/xr-render-budget-profile.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));budget.dispose();await c.villageXR.end();
