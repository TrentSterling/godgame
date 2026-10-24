import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controls,Frame,pose,handSource,handPoints,controllerSource,flush,elements} from './dom-xr-fixture.mjs';
await (await import(process.env.NATIVE_FIXTURE_URL||'./generated/native.mjs')).ready;await flush();
const qa=SETTLEMENTQA,c=qa.context,T=c.THREE,xr=c.villageXR,checks=[];
assert(await xr.startSession());const session=controls.lastSession;
let now=1000;const viewer=pose({x:.2,y:1.65,z:.1}),sources={left:handSource('left'),right:handSource('right')},at={};
function frame(data={},ms=1000/72){now+=ms;xr.update(now,new Frame({viewer,...data}));}
function world(point){c.scene.updateMatrixWorld(true);return new T.Vector3().copy(point).applyMatrix4(c.scene.matrixWorld);}
function aim(source,point){const origin=point.clone().add(new T.Vector3(0,0,.18)),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),point.clone().sub(origin).normalize());return new Map([[source.targetRaySpace,pose(origin,q)],[source.gripSpace,pose(point,q)]]);}
function ui(id){const source=controllerSource('right'),point=c.scene.getObjectByName('Village XR '+id).getWorldPosition(new T.Vector3()),poses=aim(source,point);session.sources([source]);for(let i=0;i<4;i++)frame({poses});source.gamepad.buttons[0].pressed=true;frame({poses});source.gamepad.buttons[0].pressed=false;frame({poses});}
frame();ui('done');qa.step(1/60);ui('grab');
function hands(gaps={},missing=[],extra={},ms=1000/72){const maps=new Map();for(const side of ['left','right'])if(at[side])maps.set(sources[side],missing.includes(side)?{}:handPoints(at[side],gaps[side]??.01));frame({hands:maps,...extra},ms);}
function acquire(sides=['left']){
 xr.releaseAll('fresh test setup');at.left=at.right=null;
 for(const [i,side]of sides.entries())at[side]=world(c.loads[i].body.translation());
 session.sources(sides.map(side=>sources[side]));for(let i=0;i<4;i++)hands({left:.055,right:.055});hands();
 const held=Object.fromEntries(sides.map(side=>[side,c.sim.xrGrabs.get(side)]));for(const side of sides)assert(held[side],`Acquire ${side}`);return held;
}
const flicks=()=>c.sim.events.filter(e=>e.type==='flick').length;
const check=name=>checks.push({name,now});
let held=acquire(),flickBefore=flicks();
for(const gapMs of [14,160,161,1000,5000,30000]){
 hands({},['left'],{},gapMs);assert.equal(c.sim.xrGrabs.get('left'),held.left);
 const frozen=held.left.anchor.translation();for(let i=0;i<8;i++){hands({},['left']);assert(c.sim.xrGrabs.get('left')===held.left,'Missing tracking must not release ownership');qa.step(1/60);assert.deepEqual(held.left.anchor.translation(),frozen);}
 at.left.x+=.005;hands();assert.equal(c.sim.xrGrabs.get('left'),held.left);assert.equal(held.left.velocity.length(),0);
}
assert.equal(flicks(),flickBefore);check('one-frame-to-thirty-second-loss-freezes-anchor-and-keeps-exact-native-joint');
held=acquire();flickBefore=flicks();
for(let i=0;i<180;i++){
 at.left.x+=i<90?.0008:-.0008;
 if(i%5===0)hands({},['left']);else hands({left:i%7===0?.055:.01});
 assert.equal(c.sim.xrGrabs.get('left'),held.left);assert.equal(xr.state().input.hands.left.uiTarget,null);
}
assert.equal(flicks(),flickBefore);check('intermittent-null-joints-and-open-noise-do-not-accumulate-release-evidence');
held=acquire();flickBefore=flicks();const startAt=at.left.clone();
for(let i=0;i<24;i++){
 at.left.copy(startAt).add(new T.Vector3(Math.sin(i*Math.PI/4)*.07,0,0));
 hands({left:i%4===0?.055:.01});qa.step(1/60);assert.equal(c.sim.xrGrabs.get('left'),held.left);
}
for(let i=0;i<6;i++){at.left.x+=.004;hands({left:.055});if(c.sim.xrGrabs.has('left'))qa.step(1/60);}
assert(!c.sim.xrGrabs.has('left'));assert.equal(flicks(),flickBefore+1);
check('fast-continuous-motion-with-open-noise-keeps-grip-and-confirmed-release-can-throw');
held=acquire();
for(const gap of [.023,.034,.035,.044,.045])for(let i=0;i<10;i++){hands({left:gap});assert.equal(c.sim.xrGrabs.get('left'),held.left);}
for(const count of [1,2,3,4]){for(let i=0;i<count;i++)hands({left:.055});assert.equal(c.sim.xrGrabs.get('left'),held.left);hands();}
for(let i=0;i<5;i++){hands({left:.055});assert.equal(c.sim.xrGrabs.get('left'),held.left);}
hands({left:.055});assert(!c.sim.xrGrabs.has('left'));check('45mm-release-threshold-and60ms-confirmation-reject-ambiguous-and-short-open-blips');
for(const ms of [1000/120,1000/90,1000/72,1000/30]){
 held=acquire();let started=now,opened=0;while(c.sim.xrGrabs.has('left')){hands({left:.055},[],{},ms);opened++;assert(opened<20);}
 const duration=now-started-ms;assert(duration>=60-1e-7);assert(duration<60+ms+1e-7);
}
check('release-confirmation-time-consistent-at30-72-90-120Hz');
held=acquire();hands({left:.055});hands({left:.055});hands({},['left']);
for(let i=0;i<5;i++)hands({left:.055});assert.equal(c.sim.xrGrabs.get('left'),held.left);hands({left:.055});assert(!c.sim.xrGrabs.has('left'));
check('missing-sample-resets-open-confirmation-without-releasing');
held=acquire();flickBefore=flicks();hands({},['left'],{},5000);at.left.x+=.2;
for(let i=0;i<6;i++)hands({left:.055});assert(!c.sim.xrGrabs.has('left'));assert.equal(flicks(),flickBefore);
check('open-on-distant-reacquisition-releases-without-stale-throw');
held=acquire();flickBefore=flicks();hands({},['left'],{},5000);at.left.x+=.12;
hands();let previous=new T.Vector3().copy(held.left.anchor.translation());
for(let i=0;i<30;i++){hands();qa.step(1/60);const current=new T.Vector3().copy(held.left.anchor.translation());assert(current.distanceTo(previous)*xr.state().scale<=1.2/60+1e-6);previous=current;assert.equal(c.sim.xrGrabs.get('left'),held.left);}
assert.equal(flicks(),flickBefore);check('pinched-reacquisition-catches-up-at-bounded-native-anchor-speed');
held=acquire();flickBefore=flicks();const old=sources.left;
session.sources([]);session.select('selectend',old);session.select('squeezeend',old);
for(let i=0;i<240;i++)frame();assert.equal(c.sim.xrGrabs.get('left'),held.left);assert(!xr.state().input.hands.left.tracked);
sources.left=handSource('left');session.sources([sources.left]);for(let i=0;i<4;i++)hands();assert.equal(c.sim.xrGrabs.get('left'),held.left);
session.select('selectend',old);assert.equal(c.sim.xrGrabs.get('left'),held.left);assert.equal(flicks(),flickBefore);
hands({},['left']);session.select('selectend',sources.left);session.select('squeezeend',sources.left);assert.equal(c.sim.xrGrabs.get('left'),held.left);
check('removed-and-replaced-hand-sources-rebind-by-side-old-end-events-ignored');
held=acquire();const controller=controllerSource('left'),poses=aim(controller,at.left);
session.sources([controller]);for(let i=0;i<8;i++)frame({poses});assert.equal(c.sim.xrGrabs.get('left'),held.left);
controller.gamepad.buttons[1].pressed=true;frame({poses});assert.notEqual(c.sim.xrGrabs.get('left'),held.left);assert(c.sim.xrGrabs.has('left'));
controller.gamepad.buttons[1].pressed=false;frame({poses});assert(!c.sim.xrGrabs.has('left'));check('passive-controller-presence-keeps-hand-grip-fresh-squeeze-explicitly-hands-over');
held=acquire(['left','right']);assert.notEqual(held.left.body,held.right.body);
for(let i=0;i<120;i++){hands({right:.01},['left']);assert.equal(c.sim.xrGrabs.get('left'),held.left);assert.equal(c.sim.xrGrabs.get('right'),held.right);}
for(let i=0;i<6;i++)hands({right:.055},['left']);assert.equal(c.sim.xrGrabs.get('left'),held.left);assert(!c.sim.xrGrabs.has('right'));
for(let i=0;i<6;i++)hands({left:.055});assert(!c.sim.xrGrabs.size);check('both-hands-own-independent-grips-and-independent-release-evidence');
held=acquire();session.visibility('visible-blurred');for(let i=0;i<100;i++)hands();assert.equal(c.sim.xrGrabs.get('left'),held.left);assert(!xr.state().input.viewer.valid);
session.visibility('visible');hands();assert.equal(c.sim.xrGrabs.get('left'),held.left);
c.renderer.domElement.dispatchEvent(new Event('pointercancel'));assert.equal(c.sim.xrGrabs.get('left'),held.left);
qa.pause(true);for(let i=0;i<6;i++)hands({left:.055});assert(!c.sim.xrGrabs.has('left'));qa.pause(false);
check('visibility-and-desktop-pointer-cancel-do-not-drop-valid-hand-grip-open-release-works-while-paused');
held=acquire();const button=c.scene.getObjectByName('Village XR pause');at.left=button.getWorldPosition(new T.Vector3());
for(let i=0;i<8;i++)hands();assert.equal(c.sim.xrGrabs.get('left'),held.left);assert.equal(xr.state().input.hands.left.uiTarget,null);assert(!qa.state().paused);
check('held-hand-ui-overlap-neither-releases-nor-presses-a-button');
held=acquire();hands({},['left']);controls.ref.reset();assert(!c.sim.xrGrabs.size);assert(!xr.state().placed);frame();ui('done');ui('grab');
check('explicit-reference-reset-cleans-up');
held=acquire();const anchor=held.left.anchor;
// The game already cleans up destroyed world objects. Exercise an external body
// deletion too: bridge and physics must not dereference its stale grab handles.
c.world.removeRigidBody(held.left.body);assert.doesNotThrow(()=>hands({},['left']));assert(!c.sim.xrGrabs.has('left'));assert(!anchor.isValid());
check('destroyed-body-cleans-native-joint-and-anchor-without-stale-access');
await xr.end();assert(!c.sim.xrGrabs.size);check('explicit-session-end-cleans-up');
const report={pass:true,scope:'Production XR callbacks and real Rapier with synthetic poses; no Quest acceptance or FPS claim',checks};fs.writeFileSync(new URL('./generated/sticky-grip.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,suite:'sticky-grip',checks:checks.map(c=>c.name)}));
