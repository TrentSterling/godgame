import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controls,Frame,pose,handSource,handPoints,controllerSource,flush} from './dom-xr-fixture.mjs';
await(await import('./generated/native.mjs')).ready;await flush();
const c=SETTLEMENTQA.context,T=c.THREE,xr=c.villageXR,checks=[];
assert(await xr.startSession());const session=controls.lastSession;let now=1000;
const viewer=pose({x:.2,y:1.65,z:.1}),controllers={left:controllerSource('left'),right:controllerSource('right')};
const positions={left:new T.Vector3(-.15,1.3,-.4),right:new T.Vector3(.15,1.3,-.4)};
const frame=(data={},ms=1000/72)=>{now+=ms;xr.update(now,new Frame({viewer,...data}));};
const snapshots=Object.fromEntries(['left','right'].map(side=>{const meshes=[];c.xrHands[side].group.traverse(o=>{if(o.isMesh)meshes.push({object:o,geometry:o.geometry,material:o.material});});return[side,meshes];}));
function controllerFrame({aim=true,valid=true}={}){const poses=new Map();for(const side of ['left','right']){poses.set(controllers[side].gripSpace,pose(positions[side],undefined,valid?{}:{emulatedPosition:true}));if(aim)poses.set(controllers[side].targetRaySpace,pose(positions[side].clone().add(new T.Vector3(.01,0,0)),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.3)));}frame({poses});}
frame();session.sources(Object.values(controllers));for(let i=0;i<4;i++)controllerFrame();
for(const side of ['left','right']){const rig=c.xrHands[side],d=xr.state().input.hands[side],marker=c.scene.getObjectByName(`Village ${side} tracked controller`);assert(rig.group.visible);assert.equal(d.visualKind,'controller-posed');assert.equal(d.articulatedHandTracking,false);assert(d.tracked);assert.equal(marker.children.length,1);assert(marker.children[0].isLine);
 const centre=new T.Vector3(0,-.22,.05).applyMatrix4(rig.group.matrixWorld);assert(centre.distanceTo(positions[side])<1e-8);
 const ray=marker.children[0],start=new T.Vector3().fromBufferAttribute(ray.geometry.attributes.position,0).applyMatrix4(ray.matrixWorld);assert(start.distanceTo(positions[side].clone().add(new T.Vector3(.01,0,0)))<1e-7);
}checks.push('both controller rigs visible, exact grip centres, independent native ray, no duplicate shells');
const open=c.xrHands.left.bones.map(b=>b.quaternion.clone());controllers.left.gamepad.buttons[0].value=.5;controllerFrame();assert(c.xrHands.left.bones.some((b,i)=>b.quaternion.angleTo(open[i])>.01));assert.equal(c.sim.xrGrabs.size,0);checks.push('analog finger curl has no inferred tracking or grab side effect');
controllerFrame({aim:false});for(const side of ['left','right']){assert(c.xrHands[side].group.visible);assert(!xr.state().input.hands[side].tracked);assert(!c.scene.getObjectByName(`Village ${side} tracked controller`).visible);}assert.equal(c.sim.xrGrabs.size,0);checks.push('valid grip remains visible when ray missing, with no ray/input activation');
for(let i=0;i<14;i++)controllerFrame({valid:false});assert(!c.xrHands.left.group.visible);assert(!c.xrHands.right.group.visible);checks.push('invalid grip visuals expire within bounded retention');
for(let cycle=0;cycle<8;cycle++){
 const hands={left:handSource('left'),right:handSource('right')};session.sources(Object.values(hands));for(let i=0;i<4;i++)frame({hands:new Map(['left','right'].map(side=>[hands[side],handPoints(positions[side],.055)]))});
 for(const side of ['left','right']){assert(c.xrHands[side].group.visible);assert.equal(xr.state().input.hands[side].visualKind,'tracked-hand');assert(xr.state().input.hands[side].articulatedHandTracking);assert(c.xrHands[side].bones.every(b=>b.matrixAutoUpdate===false));}
 session.sources(Object.values(controllers));for(let i=0;i<4;i++)controllerFrame();for(const side of ['left','right']){assert(c.xrHands[side].group.visible);assert(c.xrHands[side].bones.every(b=>b.matrixAutoUpdate));assert.equal(xr.state().input.hands[side].visualKind,'controller-posed');for(const item of snapshots[side]){assert.equal(item.object.geometry,item.geometry);assert.equal(item.object.material,item.material);}}
}checks.push('eight both-hand controller/tracked source cycles restore bone ownership and preserve mesh/material identity');
await xr.end();assert(!c.xrHands.left.group.visible);assert(!c.xrHands.right.group.visible);assert(await xr.startSession());frame();session.sources([]);frame();assert.equal(c.sim.xrGrabs.size,0);await xr.end();checks.push('exit/reentry hides stale visuals and clears ownership');
const report={pass:true,scope:'Production XR callbacks and existing rigs with synthetic WebXR poses; no browser or physical headset alignment claim.',checks};fs.writeFileSync(new URL('./generated/controller-visual-integration.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
