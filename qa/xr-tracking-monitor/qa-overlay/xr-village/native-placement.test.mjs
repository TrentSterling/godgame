import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controls, Frame, pose, controllerSource, flush, key} from './dom-xr-fixture.mjs';
await (await import('./generated/native.mjs')).ready;
const qa = SETTLEMENTQA, c = qa.context, T = c.THREE, xr = c.villageXR;
assert.ok(xr, 'Real application must expose its production bridge in the QA context');
await flush();
const report = {pass: false, scope: 'Real Village worker move/release through tracked controller poses and native spring physics. No position, velocity, jobs or recovery-state fabrication. No HMD/browser/GPU claim.', checks: []};
const checkpoint = (name, details = {}) => {report.checks.push({name, time: c.sim.time, ...details}); console.log(JSON.stringify({checkpoint: name, time: c.sim.time}));};
const desktop = {position: c.camera.position.toArray(), quaternion: c.camera.quaternion.toArray(), projection: c.camera.projectionMatrix.toArray(), scene: c.scene.matrixWorld.toArray()};
assert.equal(await xr.startSession(), true);
const session = controls.lastSession;
let now = 1000, viewer = pose({x: .2, y: 1.65, z: .1}, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), .4));
function frame(data = {}) {now += 1000 / 72; const value = new Frame({viewer, ...data}); xr.update(now, value); return value;}
function updateRender() {qa.step(0);}
function world(point) {c.scene.updateMatrixWorld(true); return new T.Vector3().copy(point).applyMatrix4(c.scene.matrixWorld);}
function rayData(source, target, {origin = target.clone().add(new T.Vector3(0, 0, .18)), grip = origin} = {}) {
  const quaternion = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), target.clone().sub(origin).normalize());
  return {poses: new Map([[source.targetRaySpace, pose(origin, quaternion)], [source.gripSpace, pose(grip, quaternion)]])};
}
function controller(target, options = {}) {const source = controllerSource(options.side || 'right'); session.sources([source]); const data = rayData(source, target, options); for (let i = 0; i < 3; i++) frame(data); return {source, data};}
function click(target, options = {}) {const input = controller(target, options); input.source.gamepad.buttons[0].pressed = true; frame(input.data); input.source.gamepad.buttons[0].pressed = false; frame(input.data); updateRender(); return input;}
function ui(id) {c.scene.updateMatrixWorld(true); const group = c.scene.getObjectByName(`Village XR ${id}`); assert.ok(group, id); return click(group.getWorldPosition(new T.Vector3()));}
function workerTarget(character = c.villagers[0]) {return new T.Vector3().copy(character.parts.find(part => part.bone.name === 'head').body.translation());}
function workerClick(character = c.villagers[0]) {const target = workerTarget(character); return click(world(target), {origin: world(target.clone().add(new T.Vector3(0, 3, 0)))});}
function siteClick(id) {updateRender(); const control = c.worldCues.getControl(id); assert.ok(control, id); const target = control.plate.getWorldPosition(new T.Vector3()); return click(target, {origin: target.clone().add(new T.Vector3(0, 0, .22).applyQuaternion(c.scene.quaternion))});}
function run(seconds) {for (let i = 0; i < seconds * 60; i++) qa.step(1 / 60);}
frame(); ui('done'); run(1); ui('grab');
const worker = c.villagers[0], site = c.jobs.snapshot().forageSources.find(source => source.id === 'mainland-forage');
function nearAt(nativePoint, side = 'right') {
  const source = controllerSource(side), point = world(nativePoint);
  return {source, data: rayData(source, point.clone().add(new T.Vector3(0, 0, -.1)), {origin: point, grip: point}), at: nativePoint.clone()};
}
function acquire() {
  const input = nearAt(workerTarget(worker)); session.sources([input.source]);
  for (let i = 0; i < 3; i++) frame(input.data);
  input.source.gamepad.buttons[0].pressed = true; frame(input.data);
  assert.ok(c.sim.xrGrabs.has('right'), 'Tracked open controller then trigger acquires actual native worker');
  assert.ok(worker.parts.some(part => part.body === c.sim.xrGrabs.get('right').body));
  return input;
}
function setAt(input, nativePoint) {
  const point = world(nativePoint); input.at.copy(nativePoint); input.data = rayData(input.source, point.clone().add(new T.Vector3(0, 0, -.1)), {origin: point, grip: point});
}
function heldFrame(input) {frame(input.data); qa.step(1 / 60);}
let held = acquire();
const from = held.at.clone(), to = new T.Vector3(site.position.x, c.environment.support(site.position.x, site.position.z) + 2.9, site.position.z);
const steps = Math.ceil(from.distanceTo(to) / 1.5 * 60);
for (let i = 1; i <= steps; i++) {setAt(held, from.clone().lerp(to, i / steps)); heldFrame(held);}
for (let i = 0; i < 150; i++) heldFrame(held);
const preview = c.worldActions.state().preview;
assert.equal(preview?.siteId, site.id); assert.equal(preview?.eligible, true, JSON.stringify({preview, held: c.sim.xrGrabs.get('right')?.target.toArray(), motion: c.motion.status(worker)}));
const pendingBefore = qa.state().events.filter(event => event.type === 'world-assignment-pending').length;
held.source.gamepad.buttons[0].pressed = false; frame(held.data);
assert.equal(c.sim.xrGrabs.size, 0); assert.equal(c.worldActions.state().pending?.villagerId, 'villager-0'); assert.equal(c.worldActions.state().pending?.siteId, site.id);
assert.equal(qa.state().events.filter(event => event.type === 'world-assignment-pending').length, pendingBefore + 1);
checkpoint('intentional-gentle-xr-release-creates-real-placement-intent', {preview, pending: c.worldActions.state().pending});
// Regrab supersedes pending placement; viewer loss never invents a new release.
held = acquire(); assert.equal(c.worldActions.state().pendingOrders.length, 0);
const pendingCount = () => qa.state().events.filter(event => event.type === 'world-assignment-pending').length;
const flickCount = () => c.sim.events.filter(event => event.type === 'flick').length;
const noPending = pendingCount(), noFlick = flickCount();
for(let i=0;i<13;i++)frame({...held.data, viewer: null}); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(c.worldActions.state().pendingOrders.length, 0); assert.equal(pendingCount(), noPending); assert.equal(flickCount(), noFlick);
checkpoint('viewer-loss-cancels-without-placement-or-flick');
frame(); held = acquire(); session.visibility('hidden'); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(pendingCount(), noPending); assert.equal(flickCount(), noFlick); session.visibility('visible'); frame();
checkpoint('session-hidden-cancels-without-placement-or-flick');
held = acquire(); controls.ref.reset(); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(pendingCount(), noPending); assert.equal(flickCount(), noFlick); frame(); ui('done');
checkpoint('reference-reset-cancels-without-placement-or-flick');
held = acquire();
// Second controller touches PAUSE while right remains tracked and physically
// held, proving the actual UI action performs the cancellation itself.
function leftUI(id, rightInput) {
  c.scene.updateMatrixWorld(true); const point = c.scene.getObjectByName(`Village XR ${id}`).getWorldPosition(new T.Vector3());
  const source = controllerSource('left'), data = rayData(source, point); session.sources([rightInput.source, source]);
  const both = {poses: new Map([...rightInput.data.poses, ...data.poses])};
  for (let i = 0; i < 3; i++) frame(both);
  assert.ok(c.sim.xrGrabs.has('right'), 'Right grab still active immediately before opposite-hand UI press');
  source.gamepad.buttons[0].pressed = true; frame(both);
}
leftUI('pause', held); assert.equal(qa.state().paused, true); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(pendingCount(), noPending); assert.equal(flickCount(), noFlick); ui('pause');
checkpoint('opposite-hand-pause-cancels-without-placement-or-flick');
held = acquire(); leftUI('select', held); assert.equal(xr.state().mode, 'select'); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(pendingCount(), noPending); assert.equal(flickCount(), noFlick);
checkpoint('opposite-hand-mode-ui-cancels-without-placement-or-flick');
await xr.end(); report.pass = true;
fs.writeFileSync(new URL('./generated/native-placement.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({pass: true, suite: 'native-placement', checks: report.checks.length, nativeSeconds: c.sim.time}));
