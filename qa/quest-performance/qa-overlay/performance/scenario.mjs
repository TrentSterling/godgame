import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Session as InspectorSession} from 'node:inspector/promises';
import {controls,Frame,pose,handSource,handPoints,flush} from '../xr-village/dom-xr-fixture.mjs';
const mode=process.argv[2],sample=process.argv[3]==='sample';
assert(['baseline','candidate'].includes(mode));
let now=1000;Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true});
location.search=''; // Exercise the production animation callback and accumulator.
globalThis.__perf={snapshots:0,economyUpdates:0,commands:0,beforeSteps:0,observations:0,renders:0,hudUpdates:0,worldCueUpdates:0};
const app=await import(`./generated/${mode}.mjs`);await app.ready;await flush();
const qa=SETTLEMENTQA,c=qa.context,T=c.THREE,xr=c.villageXR,rows=[];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
for(const [object,method,count]of [[c.hud,'update','hudUpdates'],[c.worldCues,'update','worldCueUpdates']]){
 const original=object[method];object[method]=function(...args){__perf[count]++;return original.apply(this,args);};
}
const inspector=new InspectorSession();if(sample)inspector.connect();
const identity=JSON.parse(fs.readFileSync(new URL(`./generated/${mode}-identity.json`,import.meta.url)));
const viewer=pose({x:.2,y:1.65,z:.1}),emptyFrame=new Frame({viewer});
function frames(n,hz=60,frame=null){for(let i=0;i<n;i++){now+=1000/hz;c.renderer.frame(now,frame);}}
function digest(){
 const s=qa.state();
 // HUD is intentionally stale while hidden. All gameplay and world-space UI
 // state remains comparable; desktop HUD is compared separately after exit.
 return{stateSHA256:hash(JSON.stringify(s)),physicsSHA256:hash(Buffer.from(c.world.takeSnapshot())),state:s};
}
function allocations(profile){
 let total=0,economySnapshot=0;
 function visit(node,within=false){
  const f=node.callFrame;within ||= f.functionName==='snapshot'&&f.url.endsWith('/'+mode+'.mjs');
  total+=node.selfSize;if(within)economySnapshot+=node.selfSize;
  for(const child of node.children)visit(child,within);
 }visit(profile.head);
 return{estimatedTotalBytes:total,estimatedEconomySnapshotBytes:economySnapshot,samples:profile.samples.length,samplingInterval:16384,includesCollectedObjects:true};
}
async function phase(name,run){
 const before={...__perf},tick=c.sim.tick,time=c.sim.time;
 const profile=sample&&['cold-desktop-render-72','desktop-running-120','xr-placement-72','xr-running-360','xr-paused-72'].includes(name);
 if(profile){globalThis.gc?.();await inspector.post('HeapProfiler.startSampling',{samplingInterval:16384,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});}
 const start=process.hrtime.bigint();run();const elapsedMs=Number(process.hrtime.bigint()-start)/1e6;
 const allocation=profile?allocations((await inspector.post('HeapProfiler.stopSampling')).profile):null;
 const counts=Object.fromEntries(Object.entries(__perf).map(([k,v])=>[k,v-before[k]]));
 rows.push({name,counts,physicsSteps:c.sim.tick-tick,simulatedSeconds:c.sim.time-time,elapsedMs,allocation,...digest()});
}
await phase('cold-desktop-render-72',()=>frames(72,72));assert.equal(c.sim.time,0);
qa.start();await phase('desktop-running-120',()=>frames(120));
qa.pause(true);const pausedAt=c.sim.time;await phase('desktop-paused-72',()=>frames(72,72));assert.equal(c.sim.time,pausedAt);qa.pause(false);
// Commands between renders must immediately appear in both presentation consumers.
assert(qa.setRole('villager-0','stone').ok);assert(qa.setPriority('brace').ok);
await phase('commands-next-frame',()=>frames(1));assert.equal(c.jobs.snapshot().prioritySiteId,'brace');
const hand=handSource('left'),request=navigator.xr.requestSession;
navigator.xr.requestSession=async(...args)=>{const s=await request(...args);s.inputSources=[hand];s.enabledFeatures=['local-floor','hand-tracking'];return s;};
assert(await xr.startSession());xr.update(now,emptyFrame);
const heldAt=c.sim.time;await phase('xr-placement-72',()=>frames(72,72,emptyFrame));assert.equal(c.sim.time,heldAt);
function poke(id){
 c.scene.updateMatrixWorld(true);const b=c.scene.getObjectByName('Village XR '+id);assert(b);
 for(const z of [.075,.075,.075,.075,.045,.018]){const tip=b.localToWorld(new T.Vector3(0,0,z));const points=handPoints({x:tip.x-.055/2,y:tip.y,z:tip.z},.055);now+=1000/72;xr.update(now,new Frame({viewer,hands:new Map([[hand,points]])}));}
}
poke('done');assert(!xr.shouldHoldSimulation());
// Flush setup's callback time before measurement, preserving the real catch-up cap.
frames(1,72,emptyFrame);
await phase('xr-running-360',()=>frames(360,72,emptyFrame));
qa.pause(true);const xrPauseAt=c.sim.time;await phase('xr-paused-72',()=>frames(72,72,emptyFrame));assert.equal(c.sim.time,xrPauseAt);
poke('pause');assert.equal(qa.state().paused,false,'World-space hand UI still resumes while desktop HUD is skipped');
await phase('xr-gap-80ms',()=>{now+=80;c.renderer.frame(now,emptyFrame);});
// Desktop resize during XR is deferred, but exit must refresh on its first render.
globalThis.innerWidth=1440;globalThis.innerHeight=900;
await xr.end();await phase('desktop-after-xr-exit',()=>frames(1));
assert.equal(c.hud.layout.width,1440);assert.equal(c.hud.layout.height,900);
rows.at(-1).hud=JSON.parse(JSON.stringify(c.hud.layout));
// Native running simulation through resource creation, deliveries, a meal and raid.
await phase('desktop-economy-1800',()=>frames(1800));
assert(c.jobs.snapshot().meal.count>0,'Cross a real meal boundary');
assert(c.jobs.snapshot().production.food>0,'Cross real resource production');
const lost=c.loads.find(r=>r.owner===null);if(lost)lost.body.setTranslation({x:0,y:-20,z:0},true);
await phase('lost-load-command',()=>frames(1));
// A real zero-time loss observation ends this fixture; the next frame must hold.
for(const v of c.villagers)if(v!==c.recruit.character)v.hp=0;
await phase('terminal-transition',()=>frames(1));assert.equal(c.jobs.snapshot().outcome.status,'failed');
const terminalAt=c.sim.time;await phase('terminal-held-72',()=>frames(72,72));assert.equal(c.sim.time,terminalAt);
if(mode==='candidate'){
 for(const r of rows)assert.equal(r.counts.hudUpdates,r.name.startsWith('xr-')?0:r.counts.renders,r.name+' HUD gate');
}
if(sample)inspector.disconnect();
const report={pass:true,mode,sampled:sample,node:process.version,scope:'CPU-only deterministic production callbacks, native Rapier, mock DOM/WebXR. No browser rendering, physical input, audio, GPU or Quest timing. Inspector sampling is in-process with no listening port.',rows};
fs.writeFileSync(new URL(`./generated/${mode}${sample?'-sample':''}.json`,import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({mode,sample,pass:true,phases:rows.length}));
