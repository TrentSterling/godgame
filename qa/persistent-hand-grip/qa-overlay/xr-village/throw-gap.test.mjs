import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controls,Frame,pose,handSource,handPoints,controllerSource,flush} from './dom-xr-fixture.mjs';
await (await import('./generated/native.mjs')).ready;await flush();
const qa=SETTLEMENTQA,c=qa.context,T=c.THREE,xr=c.villageXR,cases=[];
assert(await xr.startSession());const session=controls.lastSession;let now=1000;const viewer=pose({x:.2,y:1.65,z:.1});
function frame(data={},ms=1000/72){now+=ms;xr.update(now,new Frame({viewer,...data}));}
function world(point){c.scene.updateMatrixWorld(true);return new T.Vector3().copy(point).applyMatrix4(c.scene.matrixWorld);}
function aim(source,point){const origin=point.clone().add(new T.Vector3(0,0,.18)),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),point.clone().sub(origin).normalize());return new Map([[source.targetRaySpace,pose(origin,q)],[source.gripSpace,pose(point,q)]]);}
function ui(id){const source=controllerSource('right'),point=c.scene.getObjectByName('Village XR '+id).getWorldPosition(new T.Vector3()),poses=aim(source,point);session.sources([source]);for(let i=0;i<4;i++)frame({poses});source.gamepad.buttons[0].pressed=true;frame({poses});source.gamepad.buttons[0].pressed=false;frame({poses});}
frame();ui('done');qa.step(1/60);ui('grab');
const flicks=()=>c.sim.events.filter(e=>e.type==='flick').length;
for(const interval of [49,50,51,100,150])for(const side of ['left','right']){
 xr.releaseAll('fresh throw gap case');const source=handSource(side),at=world(c.loads[0].body.translation()),sign=side==='left'?1:-1;
 const hand=(gap=.01,ms=1000/72)=>frame({hands:new Map([[source,handPoints(at,gap)]])},ms);
 session.sources([source]);for(let i=0;i<4;i++)hand(.055);hand();const held=c.sim.xrGrabs.get(side);assert(held);
 for(let i=0;i<12;i++){at.x+=sign*.004;hand();qa.step(1/60);}
 hand(.055);qa.step(1/60);hand(.055);qa.step(1/60);
 const before=flicks(),nativeSampleAge=c.sim.time-held.lastMoveTime,speed=held.velocity.length()*xr.state().scale;
 assert(speed>.072);hand(.055,interval);assert(!c.sim.xrGrabs.has(side));
 const addedFlicks=flicks()-before;assert.equal(addedFlicks,interval<=50?1:0,`${side} ${interval}ms wall gap must govern throw freshness independently of ${nativeSampleAge}s native time`);
 cases.push({side,interval,nativeSampleAge,priorSampleSpeedMetres:speed,addedFlicks});
}
for(const interval of [49,50,51,100,150])for(const side of ['left','right']){
 xr.releaseAll('first sample after acquisition');const source=handSource(side),at=world(c.loads[0].body.translation());
 const hand=(gap=.01,ms=1000/72)=>frame({hands:new Map([[source,handPoints(at,gap)]])},ms);
 session.sources([source]);for(let i=0;i<4;i++)hand(.055);hand();const held=c.sim.xrGrabs.get(side);assert(held);const before=flicks();
 at.x+=.04;hand(.055,interval);assert(c.sim.xrGrabs.get(side)===held);assert.equal(held.velocity.length()>0,interval<=50,`${side}: acquisition timestamp must cover the first ${interval}ms gap`);
 for(let i=0;i<5;i++)hand(.055);assert(!c.sim.xrGrabs.has(side));const addedFlicks=flicks()-before;assert.equal(addedFlicks,interval<=50?1:0);cases.push({side,firstSampleGap:interval,addedFlicks});
}
for(const side of ['left','right']){
 xr.releaseAll('sparse valid open');const source=handSource(side),at=world(c.loads[0].body.translation());const hand=(gap,ms=1000/72)=>frame({hands:new Map([[source,handPoints(at,gap)]])},ms);
 session.sources([source]);for(let i=0;i<4;i++)hand(.055);hand(.01);const held=c.sim.xrGrabs.get(side);assert(held);const before=flicks();
 for(let i=0;i<2;i++){hand(.055,100);assert(c.sim.xrGrabs.get(side)===held);assert.equal(held.velocity.length(),0);}
 hand(.055,100);assert(!c.sim.xrGrabs.has(side));assert.equal(flicks(),before);cases.push({side,sparseValidOpenInterval:100,releasedWithoutFlick:true});
}
await xr.end();fs.writeFileSync(new URL('./generated/throw-gap.json',import.meta.url),JSON.stringify({pass:true,scope:'Native Rapier and production XR callbacks with synthetic timestamp gaps; no headset claim',cases},null,2));console.log(JSON.stringify({pass:true,suite:'throw-gap',cases:cases.length}));
