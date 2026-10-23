import assert from 'node:assert/strict';
import fs from 'node:fs';
import {controls, Frame, pose, controllerSource, flush, key} from './dom-xr-fixture.mjs';
await (await import('./generated/native.mjs')).ready;
const qa = SETTLEMENTQA, c = qa.context, T = c.THREE, xr = c.villageXR;
assert.ok(xr, 'Real application must expose its production bridge in the QA context');
await flush();
const report = {pass: false, scope: 'Original Village application callbacks, visible GLB picker and native Rapier exercised through mocked WebXR input/session API. No browser/GPU/HMD claims.', fixtures: ['One villager HP is set to 40 only for explicit bless contract; no jobs/resources/physics are fabricated.'], checks: []};
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
frame(); assert.equal(qa.state().started, false);
const timeBefore = c.sim.time; run(.2); assert.equal(c.sim.time, timeBefore, 'Native simulation held while XR placement is unfinished');
ui('done'); assert.equal(qa.state().started, true); assert.equal(xr.shouldHoldSimulation(), false);
run(1); updateRender();
const physicsBefore = Buffer.from(c.world.takeSnapshot()), jobsBefore = JSON.stringify(c.jobs.snapshot());
workerClick(); assert.equal(qa.state().workerOrders.selectedWorkerId, 'villager-0');
assert.deepEqual(Buffer.from(c.world.takeSnapshot()), physicsBefore, 'XR ray selection is not a physics grab');
assert.equal(JSON.stringify(c.jobs.snapshot()), jobsBefore, 'XR ray selection does not mutate jobs');
siteClick('quarry'); assert.equal(c.jobs.snapshot().villagers[0].preferredSourceId, 'quarry');
siteClick('island-garden'); assert.equal(c.jobs.snapshot().villagers[0].preferredSourceId, 'quarry', 'Unbuilt bridge cannot be bypassed by XR ray order');
siteClick('mainland-forage'); assert.equal(c.jobs.snapshot().villagers[0].preferredSourceId, 'mainland-forage');
assert.equal(c.sim.activeGrabs().length, 0);
checkpoint('select-worker-and-order-existing-source', {selected: qa.state().workerOrders.selectedWorkerId, preferredSourceId: c.jobs.snapshot().villagers[0].preferredSourceId});
// Desktop events during an active XR session must not change camera/jobs/pause.
const cameraDuring = c.camera.position.toArray(), jobsDuring = JSON.stringify(c.jobs.snapshot());
key('Space'); key('Digit1'); key('Home');
c.renderer.domElement.dispatchEvent(Object.assign(new Event('mousedown'), {button: 0, clientX: 500, clientY: 400}));
assert.equal(qa.state().paused, false); assert.deepEqual(c.camera.position.toArray(), cameraDuring); assert.equal(JSON.stringify(c.jobs.snapshot()), jobsDuring);
checkpoint('desktop-input-isolated-during-xr');
ui('grab');
let loose = c.loads.filter(load => load.owner === null).slice(0, 2); assert.equal(loose.length, 2);
function nearInput(resource, side = 'right') {const point = world(resource.body.translation()), source = controllerSource(side); return {source, data: rayData(source, point.clone().add(new T.Vector3(0, 0, -.1)), {origin: point, grip: point})};}
let right = nearInput(loose[0]); session.sources([right.source]); for (let i = 0; i < 3; i++) frame(right.data); right.source.gamepad.buttons[0].pressed = true; frame(right.data);
assert.equal(c.sim.xrGrabs.get('right')?.body, loose[0].body); assert.equal(c.sim.grab, null); assert.equal(loose[0].owner, 'player'); assert.equal(c.jobs.snapshot().stones.find(row => row.id === loose[0].id).status, 'player-held');
run(.1); assert.equal(loose[0].owner, 'player', 'Native economy observe retains XR owner across stepping');
let left = nearInput(loose[1], 'left'); session.sources([right.source, left.source]); let both = {poses: new Map([...right.data.poses, ...left.data.poses])}; for (let i = 0; i < 3; i++) frame(both); left.source.gamepad.buttons[0].pressed = true; frame(both);
assert.equal(c.sim.xrGrabs.size, 2, 'Separate hands own separate native spring grabs'); assert.equal(loose[1].owner, 'player');
assert.equal(c.sim.xrCanGrabBody('left', loose[0].body), false, 'One native body cannot be acquired twice');
run(.1); for (const load of loose) assert.equal(c.jobs.snapshot().stones.find(row => row.id === load.id).status, 'player-held');
for(let i=0;i<13;i++)frame({...both, viewer: null}); assert.equal(c.sim.xrGrabs.size, 0);
for (const load of loose) {assert.equal(load.owner, null); const row = c.jobs.snapshot().stones.find(row => row.id === load.id); assert.notEqual(row.status, 'player-held'); assert.equal(row.owner, null);}
checkpoint('two-hand-load-native-economy-ownership-and-viewer-loss-release', {loads: loose.map(load => ({id: load.id, owner: load.owner, job: c.jobs.snapshot().stones.find(row => row.id === load.id).status}))});
// Pause uses the same real app transition and holds both simulation and input.
frame(); ui('pause'); assert.equal(qa.state().paused, true); const pausedAt = c.sim.time; run(.2); assert.equal(c.sim.time, pausedAt); ui('pause'); assert.equal(qa.state().paused, false);
checkpoint('xr-world-pause-resume');
ui('bless'); const villager = c.villagers[0]; villager.hp = 40;
// Put only the fake viewer above the target for an explicitly clear real path;
// moving a viewer must not move the already placed scene.
const nativeViewer = workerTarget(villager).add(new T.Vector3(0, 9, 0)); viewer = pose(world(nativeViewer), {x: 0, y: 0, z: 0, w: 1}); frame();
const blessWorld = Buffer.from(c.world.takeSnapshot()), blessJobs = JSON.stringify(c.jobs.snapshot());
workerClick(villager); assert.equal(villager.hp, 70); assert.equal(c.blessing.state().casts, 1); assert.equal(c.blessing.state().last.source, 'xr-right'); assert.equal(c.blessing.state().last.power, 'bless');
assert.deepEqual(Buffer.from(c.world.takeSnapshot()), blessWorld, 'XR Bless changes HP only, not Rapier'); assert.equal(JSON.stringify(c.jobs.snapshot()), blessJobs, 'XR Bless does not change economy');
const origin = c.blessing.state().last.origin; assert.ok(new T.Vector3(...origin).distanceTo(nativeViewer) < 1e-8, 'XR cast viewer is converted from metres into native coordinates');
workerClick(villager); assert.equal(villager.hp, 70, 'Same native-time shared cooldown rejects repeat heal');
ui('lightning'); workerClick(villager); assert.equal(villager.hp, 70, 'Lightning cannot target friendly villagers');
checkpoint('xr-bless-exact-native-target-hp-only-cooldown-and-mode-gates', {event: c.blessing.state().last});
// Natural native economy produces food and a carrier; XR takes and releases the
// actual load through take-stone/release-stone, without creating resources.
ui('select'); session.sources([]); frame();
for (let second = 0; second < 24 && !c.loads.some(load => load.kind === 'food' && /^villager-/.test(load.owner || '')); second++) run(1);
const food = c.loads.find(load => load.kind === 'food' && /^villager-/.test(load.owner || ''));
assert.ok(food, 'Native production must produce a genuinely carried food load');
const formerOwner = food.owner, foodId = food.id, quantity = food.quantity;
ui('grab'); right = nearInput(food); session.sources([right.source]); for (let i = 0; i < 3; i++) frame(right.data); right.source.gamepad.buttons[1].pressed = true; frame(right.data);
assert.equal(c.sim.xrGrabs.get('right')?.body, food.body, 'Controller squeeze near real carried food acquires that load'); assert.equal(food.owner, 'player'); assert.equal(c.jobs.snapshot().stones.find(row => row.id === foodId).status, 'player-held');
right.source.gamepad.buttons[1].pressed = false; frame(right.data); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(food.owner, null); assert.equal(food.quantity, quantity);
checkpoint('controller-squeeze-takes-and-releases-real-carried-food', {foodId, formerOwner, quantity});
// A naturally triggered raid supplies an existing offensive target for real
// Lightning. No raider/body is fabricated and no economy clock is skipped.
ui('select'); session.sources([]); frame();
for (let second = 0; second < 48 && !c.raid.raiders.some(enemy => enemy.hp > 0); second++) run(1);
let enemy = null;
for (let second = 0; second < 18 && !enemy; second++) {
  for (const candidate of c.raid.raiders.filter(enemy => enemy.hp > 0)) {
    const at = workerTarget(candidate), from = at.clone().add(new T.Vector3(0, 6, 0));
    const origin = world(from), target = world(at), picked = qa.context.picker.pick(new T.Raycaster(origin, target.sub(origin).normalize()));
    if (picked?.character === candidate && c.blessing.targetPower(picked) === 'lightning' && !qa.context.picker.powerPathBlocked(from, picked.point, {kind: 'character', character: candidate, sim: c.sim})) {enemy = candidate; break;}
  }
  if (!enemy) run(1);
}
assert.ok(enemy, 'Native raider must walk out from tree cover into a clear Lightning path');
ui('lightning'); const enemyTarget = workerTarget(enemy); viewer = pose(world(enemyTarget.clone().add(new T.Vector3(0, 9, 0)))); frame();
const enemyHp = enemy.hp, casts = c.blessing.state().casts;
workerClick(enemy); assert.equal(c.blessing.state().casts, casts + 1, 'Tracked XR ray invokes actual raider Lightning'); assert.ok(enemy.hp < enemyHp); assert.equal(c.blessing.state().last.power, 'lightning'); assert.equal(c.blessing.state().last.source, 'xr-right'); assert.ok(c.blessing.state().last.impulses.length > 0);
checkpoint('xr-lightning-real-native-raider', {event: c.blessing.state().last});
await xr.end(); assert.equal(c.sim.xrGrabs.size, 0); assert.equal(xr.isActive(), false); assert.deepEqual(c.camera.position.toArray(), desktop.position); assert.deepEqual(c.camera.quaternion.toArray(), desktop.quaternion); assert.deepEqual(c.camera.projectionMatrix.toArray(), desktop.projection); assert.deepEqual(c.scene.matrixWorld.toArray(), desktop.scene);
checkpoint('integrated-session-exit-restores-desktop');
report.pass = true; report.final = {time: c.sim.time, xr: xr.state(), workerOrders: qa.state().workerOrders, jobs: c.jobs.snapshot(), powers: c.blessing.state(), raid: c.raid.state()};
fs.writeFileSync(new URL('./generated/native-interactions.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({pass: true, suite: 'native-interactions', checks: report.checks.length, nativeSeconds: c.sim.time}));
