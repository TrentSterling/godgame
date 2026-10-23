import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controls,Frame,pose,handSource,handPoints,controllerSource,flush} from './dom-xr-fixture.mjs';
await (await import('./generated/native.mjs')).ready;
await flush();
const qa=SETTLEMENTQA,c=qa.context,T=c.THREE,xr=c.villageXR,checks=[];
const hand=handSource('left'),originalRequest=navigator.xr.requestSession;
navigator.xr.requestSession=async(...args)=>{const s=await originalRequest(...args);s.inputSources=[hand];s.enabledFeatures=['local-floor','hand-tracking'];return s;};
assert(await xr.startSession());
let now=1000;const viewer=pose({x:.2,y:1.65,z:.1});
function frame(points=null,aim=null){now+=1000/72;xr.update(now,new Frame({viewer,hands:points?new Map([[hand,points]]):new Map(),poses:aim?new Map([[hand.targetRaySpace,aim]]):new Map()}));}
function button(id){c.scene.updateMatrixWorld(true);return c.scene.getObjectByName('Village XR '+id);}
function pointsAtTip(tip,gap=.055){return handPoints({x:tip.x-gap/2,y:tip.y,z:tip.z},gap);}
function pokeFrame(id,z){const tip=button(id).localToWorld(new T.Vector3(0,0,z));frame(pointsAtTip(tip));}
function poke(id){for(let i=0;i<4;i++)pokeFrame(id,.075);pokeFrame(id,.045);pokeFrame(id,.018);}
function check(name){checks.push({name,frame:xr.state().frames,input:xr.state().input});}
frame(handPoints());
assert(c.xrHands.left.group.visible,'Tracked hand is visible when present before session entry');
assert.equal(xr.state().input.handTrackingFeature,'enabled');
check('hands-present-before-session-and-visible');
assert(xr.shouldHoldSimulation());poke('done');
assert(!xr.shouldHoldSimulation());assert(qa.state().started);check('fingertip-poke-completes-placement-and-starts-game');
qa.pause(true);const pausedTime=c.sim.time;poke('pause');
assert.equal(qa.state().paused,false);assert.equal(c.sim.time,pausedTime);
for(let i=0;i<5;i++)pokeFrame('pause',.018);
assert.equal(qa.state().paused,false,'Holding fingertip contact does not toggle again');
poke('pause');assert(qa.state().paused);check('paused-ui-poke-resumes-withdrawal-rearms-and-held-contact-does-not-repeat');
// Meta documents an emulated target ray. Aim at the button while the index
// direction points away from it, proving native ray routing rather than fallback.
const target=button('grab').getWorldPosition(new T.Vector3()),origin=target.clone().add(new T.Vector3(-.30,-.20,.30));
const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),target.clone().sub(origin).normalize());
const aim=pose(origin,rotation,{emulatedPosition:true});
for(let i=0;i<4;i++)frame(handPoints(origin,.055),aim);
frame(handPoints(origin,.01),aim);
assert.equal(xr.state().mode,'grab','Native emulated hand ray selects UI while simulation paused');check('meta-emulated-ray-pinch-routes-to-ui-while-paused');
frame(handPoints(origin,.055));frame(handPoints(origin,.055));frame(handPoints(origin,.055));
assert(c.xrHands.left.group.visible);const before=c.sim.xrGrabs.size;
frame({});assert(c.xrHands.left.group.visible);assert.equal(xr.state().input.hands.left.tracked,false);assert.equal(c.sim.xrGrabs.size,0);
frame({});assert(c.xrHands.left.group.visible);frame({});assert(!c.xrHands.left.group.visible);
assert.equal(xr.state().input.hands.left.pose.wristPoseValid,false);assert.equal(xr.state().input.hands.left.missingJointFrames,3);assert.equal(c.sim.xrGrabs.size,before);
check('missing-joints-cancel-input-immediately-and-visual-expires-after-two-frames');
frame(handPoints(origin,.055));assert(c.xrHands.left.group.visible);
const visualOnlyLoss=handPoints(origin,.055);delete visualOnlyLoss['pinky-finger-tip'];
frame(visualOnlyLoss);assert(c.xrHands.left.group.visible);assert(xr.state().input.hands.left.tracked);assert.equal(xr.state().input.hands.left.visualRejectFrames,1);
now+=40;frame(visualOnlyLoss);assert(!c.xrHands.left.group.visible,'The 50ms limit expires even before three missed samples');
frame(handPoints(origin,.055));assert(c.xrHands.left.group.visible);
check('visual-only-joint-loss-is-distinct-from-grip-loss-and-time-grace-is-bounded');
controls.lastSession.sources([]);assert(!c.xrHands.left.group.visible,'Disconnect never retains stale visual');
const controller=controllerSource('right');controls.lastSession.sources([controller]);
const controllerFrame=new Frame({viewer,poses:new Map([[controller.targetRaySpace,pose(origin,rotation)],[controller.gripSpace,pose(origin,rotation)]])});
for(let i=0;i<4;i++)xr.update(now+=1000/72,controllerFrame);
assert(c.scene.getObjectByName('Village right tracked controller').visible);
for(let cycle=0;cycle<3;cycle++){
 controls.lastSession.sources([hand]);for(let i=0;i<4;i++)frame(handPoints(origin,.055));assert(c.xrHands.left.group.visible);
 controls.lastSession.sources([controller]);for(let i=0;i<4;i++)xr.update(now+=1000/72,controllerFrame);assert(!c.xrHands.left.group.visible);assert(c.scene.getObjectByName('Village right tracked controller').visible);
}
check('repeated-controller-hand-switches-preserve-controller-and-hand-visibility');
controls.lastSession.sources([hand]);frame(handPoints(origin,.055));
controls.lastSession.visibility('hidden');assert(!c.xrHands.left.group.visible);controls.lastSession.visibility('visible');
await xr.end();assert(!c.xrHands.left.group.visible);assert(await xr.startSession());frame(handPoints());assert(c.xrHands.left.group.visible);check('hidden-session-exit-and-hands-first-reentry');
const panel=c.scene.getObjectByName('Village XR anchored controls');let materials=0;
panel.traverse(o=>{if(o.isMesh){materials++;assert.equal(o.material.depthTest,true,'World UI must respect nearer hand depth');}});
assert(materials>15);check('world-ui-uses-depth-test-for-hand-occlusion');
await xr.end();
fs.writeFileSync(new URL('./generated/hand-ui.json',import.meta.url),JSON.stringify({pass:true,scope:'CPU-only production XR callbacks with synthetic hand/controller poses; no headset or GPU evidence',checks},null,2));
console.log(JSON.stringify({pass:true,suite:'hand-ui',checks:checks.map(x=>x.name)}));
