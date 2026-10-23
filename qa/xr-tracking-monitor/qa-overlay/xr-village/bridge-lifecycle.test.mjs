import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controls, Frame, pose, controllerSource, handSource, handPoints, flush} from './dom-xr-fixture.mjs';
await (await import('./generated/native.mjs')).ready;
const {createVillageXR, createGodHandRig, probeVillageXR} = await import('./generated/native.mjs');
const qa = SETTLEMENTQA, c = qa.context, T = c.THREE;
qa.start(); qa.step(1 / 60);
const calls = [], status = {started: true, paused: false, ended: false, message: '', cooldown: 0, selectedWorkerId: null};
const hands = Object.fromEntries(['left', 'right'].map(side => {const rig = createGodHandRig({THREE: T, handedness: side}); c.scene.add(rig.group); return [side, rig];}));
const bridge = createVillageXR({renderer: c.renderer, scene: c.scene, camera: c.camera, sim: c.sim, playerHands: hands, bounds: c.environment.bounds,
  pick: ray => c.picker.pick(ray), worldHit: () => null,
  select: selected => calls.push({type: 'select', body: selected?.body.handle}),
  activate: id => {calls.push({type: 'activate', id}); if (id === 'start') status.started = true; if (id === 'pause') status.paused = !status.paused;},
  grab: (side, selected, scale) => {calls.push({type: 'grab', side, body: selected.body.handle}); return c.sim.xrGrabBody(side, selected.body, selected.point, selected.point, scale);},
  release: (side, flick) => {if (c.sim.xrGrabs.has(side)) calls.push({type: 'release', side, flick}); c.sim.xrReleaseGrab(side, flick);},
  cast: (selected, viewer, side, mode) => calls.push({type: 'cast', body: selected.body.handle, viewer: viewer.toArray(), side, mode}),
  getStatus: () => status, onSessionChange: active => calls.push({type: 'session', active}), onCancel: reason => calls.push({type: 'cancel', reason}),
});
await flush();
const report = {pass: false, scope: 'Real createVillageXR entry/update/end and fake WebXR host with native Rapier. Application callbacks are instrumented for this suite. No browser/GPU/HMD evidence.', checks: []};
assert.equal((await probeVillageXR({}, false)).supported, false);
assert.equal((await probeVillageXR({}, true)).supported, false);
assert.equal((await probeVillageXR({xr: {isSessionSupported: async mode => mode === 'immersive-vr'}}, true)).mode, 'immersive-vr');
assert.equal((await probeVillageXR({xr: {isSessionSupported: async () => {throw new Error('Probe failed');}}}, true)).supported, false);
const checkpoint = name => report.checks.push({name, state: bridge.state(), callbackCount: calls.length});
const before = {scenePosition: c.scene.position.toArray(), sceneQuaternion: c.scene.quaternion.toArray(), sceneScale: c.scene.scale.toArray(), sceneBackground: c.scene.background, cameraPosition: c.camera.position.toArray(), cameraQuaternion: c.camera.quaternion.toArray(), cameraNear: c.camera.near, cameraFar: c.camera.far, size: c.renderer.getSize(new T.Vector2()).toArray(), ratio: c.renderer.getPixelRatio(), shadow: c.renderer.shadowMap.enabled};
assert.equal(bridge.state().hardwareVerified, false);
assert.equal(await bridge.startSession(), true);
assert.equal(controls.requests.at(-1).type, 'immersive-ar');
assert.ok(controls.requests.at(-1).options.requiredFeatures.includes('local-floor'));
assert.ok(controls.requests.at(-1).options.optionalFeatures.includes('hand-tracking'));
assert.equal(controls.setSessionCalls.at(-1), controls.lastSession);
assert.equal(bridge.shouldHoldSimulation(), true, 'Session starts held until a valid viewer and placement completion');
const session = controls.lastSession;
let now = 1000;
const viewer = pose({x: .2, y: 1.65, z: .1}, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), .4));
function frame(data = {}) {now += 1000 / 72; const value = new Frame({viewer, ...data}); bridge.update(now, value); return value;}
frame(); assert.equal(bridge.state().placed, true);
function named(name) {const matches = []; c.scene.traverse(object => {if (object.name === name) matches.push(object);}); assert.ok(matches.length, name); return matches.at(-1);}
function aiming(source, point, {origin = point.clone().add(new T.Vector3(0, 0, .18)), grip = origin, gap = null} = {}) {
  const quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), point.clone().sub(origin).normalize());
  return {poses: new Map([[source.targetRaySpace, pose(origin, quaternion)], ...(source.gripSpace ? [[source.gripSpace, pose(grip, quaternion)]] : [])]), hands: gap === null ? new Map() : new Map([[source, handPoints(grip, gap)]])};
}
function controllerAt(point, {held = false, grip = null} = {}) {
  const source = controllerSource('right'); source.gamepad.buttons[0].pressed = held;
  session.sources([source]); const data = aiming(source, point, grip ? {grip} : {});
  for (let i = 0; i < 3; i++) frame(data);
  return {source, data};
}
function uiClick(id) {
  c.scene.updateMatrixWorld(true); const point = named(`Village XR ${id}`).getWorldPosition(new T.Vector3());
  const {source, data} = controllerAt(point); source.gamepad.buttons[0].pressed = true; frame(data); source.gamepad.buttons[0].pressed = false; frame(data);
}
uiClick('done'); assert.equal(bridge.state().placing, false); assert.equal(bridge.shouldHoldSimulation(), false); checkpoint('trusted-session-entry-and-placement');
uiClick('grab'); assert.equal(bridge.state().mode, 'grab');
const resource = c.loads[0];
function resourcePoint() {c.scene.updateMatrixWorld(true); return new T.Vector3().copy(resource.body.translation()).applyMatrix4(c.scene.matrixWorld);}
function grabController({held = false} = {}) {
  const point = resourcePoint(), {source, data} = controllerAt(point, {held, grip: point});
  if (!held) {source.gamepad.buttons[0].pressed = true; frame(data);}
  return {source, data};
}
let held = grabController(); assert.ok(c.sim.xrGrabs.has('right'), 'Open controller followed by trigger creates native grab');
const grabs = () => calls.filter(call => call.type === 'grab').length;
let count = grabs();
for(let i=0;i<13;i++)frame({viewer: null, ...held.data}); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(bridge.shouldHoldSimulation(), true);
for (let i = 0; i < 4; i++) frame(held.data);
assert.equal(grabs(), count, 'Held trigger must not reacquire after viewer loss');
held.source.gamepad.buttons[0].pressed = false; for (let i = 0; i < 3; i++) frame(held.data);
held.source.gamepad.buttons[0].pressed = true; frame(held.data); assert.equal(c.sim.xrGrabs.size, 1);
assert.doesNotThrow(() => {for(let i=0;i<13;i++)frame({...held.data, throwViewer: true});}); assert.equal(c.sim.xrGrabs.size, 0);
checkpoint('viewer-null-and-throw-cancel-with-open-to-rearm');
held = grabController(); assert.equal(c.sim.xrGrabs.size, 1);
session.sources([]); assert.equal(c.sim.xrGrabs.size, 0, 'Source removal cancels immediately without waiting for another pose');
held = grabController({held: true}); assert.equal(c.sim.xrGrabs.size, 0, 'Replacement controller acquired while held must not grab');
held.source.gamepad.buttons[0].pressed = false; for (let i = 0; i < 3; i++) frame(held.data);
held.source.gamepad.buttons[0].pressed = true; frame(held.data); assert.equal(c.sim.xrGrabs.size, 1);
session.visibility('hidden'); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(bridge.shouldHoldSimulation(), true);
session.visibility('visible'); for (let i = 0; i < 3; i++) frame(held.data); assert.equal(c.sim.xrGrabs.size, 0);
checkpoint('controller-removal-replacement-and-hidden-session');
held = grabController(); assert.equal(c.sim.xrGrabs.size, 1);
controls.ref.reset(); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(bridge.shouldHoldSimulation(), true); assert.equal(bridge.state().placed, false);
assert.doesNotThrow(() => frame({...held.data, throwPose: true}));
frame(); uiClick('done');
assert.equal(bridge.shouldHoldSimulation(), false);
checkpoint('reference-reset-and-input-pose-exception');
// WebXR event-only fallback is supported when a controller exposes no gamepad.
const eventOnlyPoint=resourcePoint(),eventOnly=controllerSource('right');eventOnly.gamepad=null;session.sources([eventOnly]);
const eventOnlyData=aiming(eventOnly,eventOnlyPoint,{grip:eventOnlyPoint});for(let i=0;i<3;i++)frame(eventOnlyData);
session.select('selectstart',eventOnly);frame(eventOnlyData);assert.equal(c.sim.xrGrabs.size,1,'Session selectstart event acquires without gamepad');
session.select('selectend',eventOnly);frame(eventOnlyData);assert.equal(c.sim.xrGrabs.size,0,'Session selectend event releases without gamepad');
checkpoint('event-only-controller-session-fallback');
// Hand acquisition while pinched cannot act, and sustained joint loss releases the same
// native spring. Three real open samples, then a pinch, are mandatory.
const left = handSource('left'); session.sources([left]);
const handAt = resourcePoint();
const handData = gap => aiming(left, handAt.clone().add(new T.Vector3(0, 0, -.2)), {origin: handAt.clone(), grip: handAt, gap});
for (let i = 0; i < 4; i++) frame(handData(.01));
assert.equal(c.sim.xrGrabs.size, 0, 'Initially pinched hand cannot acquire');
for (let i = 0; i < 3; i++) frame(handData(.055));
frame(handData(.01)); assert.equal(c.sim.xrGrabs.size, 1, 'Open tracked hand then pinch acquires native body');
assert.ok(c.sim.xrGrabs.has('left')); for(let i=0;i<13;i++)frame({hands: new Map([[left, {}]])}); assert.equal(c.sim.xrGrabs.size, 0, 'Sustained missing grip joints cancel');
for (let i = 0; i < 4; i++) frame(handData(.01)); assert.equal(c.sim.xrGrabs.size, 0, 'Returning held pinch cannot reacquire');
for (let i = 0; i < 3; i++) frame(handData(.055)); frame(handData(.01)); assert.equal(c.sim.xrGrabs.size, 1);
assert.doesNotThrow(() => {for(let i=0;i<13;i++)frame({...handData(.01), throwJoint: true});}); assert.equal(c.sim.xrGrabs.size, 0);
checkpoint('hand-joint-lifecycle-and-open-to-rearm');
held = grabController(); assert.equal(c.sim.xrGrabs.size, 1);
// Three's renderer is permitted to update the supplied camera during XR.
c.camera.position.set(99, 88, 77); c.camera.near = .003; c.camera.far = 2;
assert.equal(await bridge.end(), true); assert.equal(session.ended, true); assert.equal(c.sim.xrGrabs.size, 0);
assert.equal(bridge.isActive(), false); assert.equal(bridge.shouldHoldSimulation(), false);
assert.deepEqual(c.scene.position.toArray(), before.scenePosition); assert.deepEqual(c.scene.quaternion.toArray(), before.sceneQuaternion); assert.deepEqual(c.scene.scale.toArray(), before.sceneScale); assert.equal(c.scene.background, before.sceneBackground);
assert.deepEqual(c.camera.position.toArray(), before.cameraPosition); assert.deepEqual(c.camera.quaternion.toArray(), before.cameraQuaternion); assert.equal(c.camera.near, before.cameraNear); assert.equal(c.camera.far, before.cameraFar);
assert.deepEqual(c.renderer.getSize(new T.Vector2()).toArray(), before.size); assert.equal(c.renderer.getPixelRatio(), before.ratio); assert.equal(c.renderer.shadowMap.enabled, before.shadow);
assert.equal(controls.ends, 1); checkpoint('session-end-restores-exact-desktop-camera-and-scene');
controls.requestError = Object.assign(new Error('Denied'), {name: 'NotAllowedError'});
assert.equal(await bridge.startSession(), false); assert.equal(bridge.isActive(), false); assert.equal(bridge.state().busy, false); assert.deepEqual(c.camera.position.toArray(), before.cameraPosition); controls.requestError = null;
controls.setSessionError = Object.assign(new Error('Renderer failed'), {name: 'OperationError'});
assert.equal(await bridge.startSession(), false); assert.equal(bridge.isActive(), false); assert.equal(bridge.state().busy, false); assert.deepEqual(c.camera.position.toArray(), before.cameraPosition); controls.setSessionError = null;
const validReference=controls.ref;controls.ref=null;
assert.equal(await bridge.startSession(),false);assert.equal(bridge.isActive(),false);assert.equal(bridge.state().busy,false);assert.deepEqual(c.camera.position.toArray(),before.cameraPosition);controls.ref=validReference;
assert.equal(await bridge.startSession(), true); frame(); assert.equal(await bridge.end(), true); checkpoint('request-renderer-and-reference-failure-recoverable-reentry');
report.pass = true; report.calls = calls;
fs.writeFileSync(new URL('./generated/bridge-lifecycle.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({pass: true, suite: 'bridge-lifecycle', checks: report.checks.length, requests: controls.requests.length, ends: controls.ends}));
