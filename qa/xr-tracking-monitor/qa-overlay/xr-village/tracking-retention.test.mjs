import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controls,Frame,pose,handSource,handPoints,controllerSource,flush} from './dom-xr-fixture.mjs';
await (await import('./generated/native.mjs')).ready;await flush();
const qa=SETTLEMENTQA,c=qa.context,T=c.THREE,xr=c.villageXR,checks=[];
assert(await xr.startSession());const session=controls.lastSession;
let now=1000,viewer=pose({x:.2,y:1.65,z:.1});
const check=name=>checks.push({name,now,diagnostics:xr.state().input});
function frame(data={},ms=1000/72){now+=ms;xr.update(now,new Frame({viewer,...data}));}
function world(point){c.scene.updateMatrixWorld(true);return new T.Vector3().copy(point).applyMatrix4(c.scene.matrixWorld);}
function aim(source,point){const origin=point.clone().add(new T.Vector3(0,0,.18)),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),point.clone().sub(origin).normalize());return new Map([[source.targetRaySpace,pose(origin,q)],[source.gripSpace,pose(point,q)]]);}
function ui(id){c.scene.updateMatrixWorld(true);const source=controllerSource('right'),point=c.scene.getObjectByName('Village XR '+id).getWorldPosition(new T.Vector3()),poses=aim(source,point);session.sources([source]);for(let i=0;i<3;i++)frame({poses});source.gamepad.buttons[0].pressed=true;frame({poses});source.gamepad.buttons[0].pressed=false;frame({poses});}
frame();ui('done');qa.step(1/60);ui('grab');
const hand=handSource('left');let at;
function handFrame(gap=.01,{missing=false,viewerLost=false,ms=1000/72}={}){frame({viewer:viewerLost?null:viewer,hands:new Map([[hand,missing?{}:handPoints(at,gap)]])},ms);}
function acquire(){
 session.sources([hand]);at=world(c.loads[0].body.translation());
 for(let i=0;i<4;i++)handFrame(.055);handFrame();
 assert(c.sim.xrGrabs.has('left'),JSON.stringify({message:'Fresh open hand then pinch acquires actual load',mode:xr.state().mode,placing:xr.state().placing,started:qa.state().started,hand:xr.state().input.hands.left,at}));return c.sim.xrGrabs.get('left');
}
let held=acquire();const bodies=c.world.bodies.len(),joints=c.world.impulseJoints.len();
const initialTarget=held.target.clone();handFrame(.01,{missing:true});
assert.equal(c.sim.xrGrabs.get('left'),held);assert(!xr.state().input.hands.left.tracked);assert(c.xrHands.left.group.visible);assert.equal(held.velocity.length(),0);assert.equal(held.lastMoveTime,-99);
handFrame(.01,{missing:true});assert.equal(c.sim.xrGrabs.get('left'),held);assert.equal(c.world.bodies.len(),bodies);assert.equal(c.world.impulseJoints.len(),joints);
handFrame();assert.equal(c.sim.xrGrabs.get('left'),held);assert(xr.state().input.hands.left.tracked);assert.equal(held.velocity.length(),0);
check('one-and-two-joint-sample-gaps-retain-exact-native-joint-without-throw-samples');
// Time-based grace remains valid at low / irregular cadence, not a two-frame cap.
for(const intervals of [[11,11,11,11],[38,47,31],[66,66]]){
 handFrame();for(const ms of intervals){handFrame(.01,{missing:true,ms});assert.equal(c.sim.xrGrabs.get('left'),held);assert(c.xrHands.left.group.visible);}
 handFrame();assert.equal(c.sim.xrGrabs.get('left'),held);
}
check('irregular-cadence-grace-is-time-based');
// During viewer loss there is no simulation, input routing or invented current pose.
const sceneMatrix=c.scene.matrixWorld.toArray(),viewMatrix=xr.getViewerMatrix().toArray(),time=c.sim.time;
handFrame(.01,{viewerLost:true});qa.step(1/60);assert.equal(c.sim.time,time);assert(xr.shouldHoldSimulation());assert.equal(xr.state().input.viewer.valid,false);assert.equal(xr.trackingMode(),'held');assert(c.scene.visible);assert.deepEqual(xr.getViewerMatrix().toArray(),viewMatrix);assert.deepEqual(c.scene.matrixWorld.toArray(),sceneMatrix);assert.equal(c.sim.xrGrabs.get('left'),held);
handFrame(.01,{viewerLost:true});assert.equal(c.sim.xrGrabs.get('left'),held);handFrame();assert(!xr.shouldHoldSimulation());assert.equal(c.sim.xrGrabs.get('left'),held);
check('short-viewer-loss-retains-render-pose-and-world-but-pauses-simulation-and-input');
// Open on reacquisition is a real release, never a flick or placement action from stale motion.
const flicks=()=>c.sim.events.filter(e=>e.type==='flick').length,beforeFlick=flicks();
handFrame(.01,{missing:true});at.x+=.03;handFrame(.055);assert.equal(c.sim.xrGrabs.size,0);assert.equal(flicks(),beforeFlick);
check('intentional-open-after-gap-releases-without-stale-flick');
held=acquire();for(let i=0;i<13;i++)handFrame(.01,{missing:true});assert.equal(c.sim.xrGrabs.size,0);assert(!c.xrHands.left.group.visible);
for(let i=0;i<5;i++)handFrame();assert.equal(c.sim.xrGrabs.size,0,'Closed pinch after timeout cannot reacquire');assert.equal(flicks(),beforeFlick);
check('sustained-hand-loss-expires-and-requires-open-before-new-grab');
held=acquire();for(let i=0;i<13;i++)handFrame(.01,{viewerLost:true});assert(!c.scene.visible);assert.equal(xr.getViewerMatrix(),null);assert.equal(c.sim.xrGrabs.size,0);assert.equal(xr.trackingMode(),'lost');handFrame();assert(c.scene.visible);assert.equal(c.sim.xrGrabs.size,0);
check('sustained-viewer-loss-hides-stale-world-and-recovery-keeps-placement');
held=acquire();handFrame(.01,{missing:true});session.visibility('visible-blurred');assert.equal(c.sim.xrGrabs.size,0);assert.equal(xr.getViewerMatrix(),null);assert(!c.xrHands.left.group.visible);session.visibility('visible');handFrame();assert.equal(c.sim.xrGrabs.size,0);
check('visibility-change-immediately-invalidates-retention');
held=acquire();handFrame(.01,{missing:true});controls.ref.reset();assert.equal(c.sim.xrGrabs.size,0);assert(!xr.state().placed);assert.equal(xr.getViewerMatrix(),null);frame();ui('done');ui('grab');
check('reference-reset-never-reuses-an-old-space-pose');
held=acquire();handFrame(.01,{missing:true});session.sources([]);assert.equal(c.sim.xrGrabs.size,0);assert(!c.xrHands.left.group.visible);
check('disconnect-immediately-releases-retained-grab');
// Explicit controller button state is authoritative even when its pose fails.
const controller=controllerSource('right');session.sources([controller]);const controllerPoint=world(c.loads[0].body.translation()),poses=aim(controller,controllerPoint);
for(let i=0;i<4;i++)frame({poses});controller.gamepad.buttons[0].pressed=true;frame({poses});assert(c.sim.xrGrabs.has('right'));
frame();assert(c.sim.xrGrabs.has('right'));assert(!xr.state().input.hands.right.tracked);
controller.gamepad.buttons[0].pressed=false;frame();assert.equal(c.sim.xrGrabs.size,0);assert.equal(flicks(),beforeFlick);
check('controller-gap-retains-held-button-but-explicit-release-terminates-without-throw');
// Recovery must expire from the previous valid sample, before recording a new
// sample. Test both sides of the inclusive 160 ms boundary with native joints.
const recoveryCases=[];
function controllerAcquire(source=controllerSource('right'),start=()=>{source.gamepad.buttons[0].pressed=true;}){
 session.sources([source]);const poses=aim(source,world(c.loads[0].body.translation()));
 for(let i=0;i<4;i++)frame({poses});start();frame({poses});
 assert(c.sim.xrGrabs.has('right'));return{source,poses,held:c.sim.xrGrabs.get('right')};
}
for(const loss of ['hand','viewer','controller'])for(const missingAt of [[150],[11,49,96,150],[]])for(const age of [159,160,161,200]){
 let native,controllerCase;
 if(loss==='controller'){controllerCase=controllerAcquire();native=controllerCase.held;frame({poses:controllerCase.poses},Math.ceil(now)+1-now);}
 else{native=acquire();handFrame(.01,{ms:Math.ceil(now)+1-now});}
 const start=now,side=loss==='controller'?'right':'left',flickCount=flicks();
 for(const offset of missingAt){
  if(loss==='controller')frame({},start+offset-now);
  else handFrame(.01,{missing:loss==='hand',viewerLost:loss==='viewer',ms:start+offset-now});
  assert.equal(c.sim.xrGrabs.get(side),native,'A missing sample inside the grace retains the joint');
 }
 if(loss==='controller')frame({poses:controllerCase.poses},start+age-now);
 else handFrame(.01,{ms:start+age-now});
 if(age<=160)assert.equal(c.sim.xrGrabs.get(side),native,`${loss} recovery at ${age} ms retains the exact joint`);
 else{
  assert(!c.sim.xrGrabs.has(side),`${loss} recovery at ${age} ms expires the old joint before processing fresh input`);
  for(let i=0;i<4;i++)if(loss==='controller')frame({poses:controllerCase.poses});else handFrame();
  assert(!c.sim.xrGrabs.has(side),'Still-held input cannot reacquire after timeout');
  if(loss==='controller'){
   controllerCase.source.gamepad.buttons[0].pressed=false;for(let i=0;i<4;i++)frame({poses:controllerCase.poses});
   controllerCase.source.gamepad.buttons[0].pressed=true;frame({poses:controllerCase.poses});
  }else{for(let i=0;i<4;i++)handFrame(.055);handFrame();}
  assert(c.sim.xrGrabs.has(side),'Fresh open input rearms a subsequent deliberate grab');
 }
 assert.equal(flicks(),flickCount,'Timeout/recovery must not create a flick');
 recoveryCases.push({loss,missingAt,age,retained:age<=160});xr.releaseAll('next recovery boundary case');
}
check('36-recovery-boundaries-use-last-valid-age-for-hand-viewer-and-controller');
// Exercise production event callbacks with each button alone and both release
// orders, for event-only, gamepad-only and mixed sources. No physical input.
const buttonCases=[];
for(const input of ['events','gamepad','mixed-trigger-pad','mixed-squeeze-pad'])for(const order of [[0],[1],[0,1],[1,0]]){
 const source=controllerSource('right');if(input==='events')delete source.gamepad;
 const heldButtons=[false,false],usesPad=button=>input==='gamepad'||input===(button===0?'mixed-trigger-pad':'mixed-squeeze-pad');
 const eventNames=[['selectstart','selectend'],['squeezestart','squeezeend']];
 function setButton(button,down){heldButtons[button]=down;if(usesPad(button)){source.gamepad.buttons[button].pressed=down;source.gamepad.buttons[button].value=down?1:0;}else session.select(eventNames[button][down?0:1],source);}
 const test=controllerAcquire(source,()=>{for(const button of order)setButton(button,true);});
 frame();assert.equal(c.sim.xrGrabs.get('right'),test.held);assert(xr.state().input.hands.right.gap);
 for(const button of order){
  setButton(button,false);if(usesPad(button))session.select(eventNames[button][1],source);
  const stillHeld=heldButtons.some(Boolean);
  assert.equal(c.sim.xrGrabs.has('right'),stillHeld,`${input}: ending ${button} preserves the other held button`);
  if(stillHeld){assert.equal(c.sim.xrGrabs.get('right'),test.held);frame();assert.equal(c.sim.xrGrabs.get('right'),test.held);}
 }
 assert.equal(c.sim.xrGrabs.size,0);buttonCases.push({input,order});xr.releaseAll('next combined-button case');
}
check('16-controller-release-combinations-preserve-trigger-or-squeeze-during-gap');
held=acquire();handFrame(.01,{ms:230});assert.equal(c.sim.xrGrabs.size,0);assert(xr.shouldHoldSimulation());handFrame();assert.equal(c.sim.xrGrabs.size,0);
check('long-callback-interruption-cannot-retain-or-reacquire');
// No new press may be completed from stale pinch/poke samples while paused.
qa.pause(true);const pauseButton=c.scene.getObjectByName('Village XR pause');c.scene.updateMatrixWorld(true);
at=pauseButton.localToWorld(new T.Vector3(0,0,.08));for(let i=0;i<4;i++)handFrame(.055);
at=pauseButton.localToWorld(new T.Vector3(0,0,.018));handFrame(.055,{missing:true});assert(qa.state().paused);handFrame(.055);assert(qa.state().paused,'Reacquired contact must withdraw before rearming poke');
check('missing-poke-contact-does-not-activate-paused-ui');qa.pause(false);
// r160's eye cache is render-only, including emulated-position rejection.
const leftEye=new T.PerspectiveCamera(),rightEye=new T.PerspectiveCamera();leftEye.position.set(.17,1.65,.1);rightEye.position.set(.23,1.65,.1);leftEye.updateMatrix();rightEye.updateMatrix();leftEye.viewport=new T.Vector4(0,0,900,900);rightEye.viewport=new T.Vector4(900,0,900,900);c.renderer.xr.camera=new T.ArrayCamera([leftEye,rightEye]);
frame();const eyeMatrix=leftEye.matrix.toArray();leftEye.position.set(50,50,50);leftEye.updateMatrix();frame({viewer:pose({x:50,y:50,z:50},undefined,{emulatedPosition:true})});assert.deepEqual(leftEye.matrix.toArray(),eyeMatrix);assert(!xr.state().input.viewer.valid);assert.equal(xr.state().input.viewer.viewerEmulatedFrames,1);frame();
check('last-good-stereo-eye-transform-restored-without-fabricating-tracking');
held=acquire();handFrame(.01,{missing:true});await xr.end();assert.equal(c.sim.xrGrabs.size,0);assert.equal(xr.getViewerMatrix(),null);
check('session-end-clears-retained-pose-and-grab');
fs.writeFileSync(new URL('./generated/tracking-retention.json',import.meta.url),JSON.stringify({pass:true,scope:'Production callbacks with synthetic poses and native Rapier, no Quest/compositor claim',checks,recoveryCases,buttonCases},null,2));console.log(JSON.stringify({pass:true,suite:'tracking-retention',checks:checks.map(c=>c.name),recoveryCases:recoveryCases.length,buttonCases:buttonCases.length}));
