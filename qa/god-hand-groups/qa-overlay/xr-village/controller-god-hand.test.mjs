import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import {createGodHandRig} from '../../src/stone-hand-rig.js';
import {createControllerGodHand,controllerFingerAmount,CONTROLLER_HAND_GRIP_CENTER,CONTROLLER_HAND_METRES_PER_UNIT} from '../../src/controller-god-hand.js';
import {readHandJoints,retargetHand} from '../../src/xr-hand-math.js';
import {Frame,handSource,handPoints,pose} from './dom-xr-fixture.mjs';

const checks=[],rows=[];
const check=name=>checks.push(name);
const close=(a,b,message,epsilon=1e-9)=>assert(a.distanceTo(b)<epsilon,`${message}: ${a.toArray()} vs ${b.toArray()}`);
const qclose=(a,b,message)=>assert(1-Math.abs(a.dot(b))<1e-9,message);
const resources=group=>{const r={meshes:[],geometries:new Set(),materials:new Set(),textures:new Set()};group.traverse(o=>{if(!o.isMesh)return;r.meshes.push(o);r.geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){r.materials.add(m);for(const value of Object.values(m))if(value?.isTexture)r.textures.add(value);}});return r;};
assert.equal(controllerFingerAmount({value:.3,pressed:true}),.3);
assert.equal(controllerFingerAmount({value:0,pressed:true}),1);
assert.equal(controllerFingerAmount(undefined,true),1);
assert.equal(controllerFingerAmount(undefined),0);
assert.equal(controllerFingerAmount({value:NaN,pressed:false}),0);
assert.equal(controllerFingerAmount({value:2}),1);
assert.equal(controllerFingerAmount({value:-2}),0);
check('Analog/digital/event-only visual values are finite and bounded');

for(const handedness of ['left','right']){
 const rig=createGodHandRig({THREE:T,handedness}),scene=new T.Scene();scene.add(rig.group);
 const baseline=resources(scene),authored={};
 for(const name of ['open','point','pinch','fist']){rig.applyPose(name);authored[name]=rig.bones.map(b=>b.quaternion.clone());}
 const helper=createControllerGodHand(rig);assert.equal(rig.group.visible,false);
 const inverse=new T.Matrix4(),rotation=new T.Quaternion().setFromEuler(new T.Euler(.2,-.65,.11)),position=new T.Vector3(.23,1.25,-.46),grip=pose(position,rotation);
 const restPositions=rig.bones.map(b=>b.position.clone()),restScales=rig.bones.map(b=>b.scale.clone());
 for(const [trigger,squeeze,name]of [[0,0,'open'],[0,1,'point'],[1,0,'pinch'],[1,1,'fist']]){
  assert(helper.update(grip,inverse,{trigger,squeeze}));assert(helper.isControllerPosed());
  rig.bones.forEach((b,i)=>qclose(b.quaternion,authored[name][i],`${handedness}/${name}/${b.name}`));
  assert.deepEqual(helper.state(),{mode:'controller-posed',poseValid:true,handTracking:false,visible:true,trigger,squeeze});
 }
 // Compare interpolated output to independent interpolation of authored poses.
 for(const trigger of [0,.25,.5,.75,1])for(const squeeze of [0,.25,.5,.75,1]){
  helper.update(grip,inverse,{trigger,squeeze});
  rig.bones.forEach((b,i)=>{const expected=authored.open[i].clone().slerp(authored.pinch[i],trigger),closed=authored.point[i].clone().slerp(authored.fist[i],trigger);expected.slerp(closed,squeeze);qclose(b.quaternion,expected,`${handedness} interpolated ${b.name}`);assert(Math.abs(b.quaternion.lengthSq()-1)<1e-9);});
 }
 rows.push({side:handedness,poseCorners:4,analogCombinations:25,bones:rig.bones.length});
 // Authored group transform maps a fixed grip centre to the real grip pose,
 // regardless of tabletop scene transforms. Unit scale is physical metres.
 for(const transform of [
  {position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},
  {position:[.3,.9,-1],rotation:[0,.85,0],scale:[.027,.027,.027]},
  {position:[-.4,1.1,.2],rotation:[.2,-.7,.1],scale:[.024,.031,.036]},
 ]){
  scene.position.fromArray(transform.position);scene.rotation.set(...transform.rotation);scene.scale.fromArray(transform.scale);scene.updateMatrixWorld(true);inverse.copy(scene.matrixWorld).invert();
  helper.update(grip,inverse,{trigger:.4,squeeze:.6});
  const centre=new T.Vector3().fromArray(CONTROLLER_HAND_GRIP_CENTER).applyMatrix4(rig.group.matrixWorld);close(centre,position,handedness+' grip centre');
  const dorsal=new T.Vector3(0,1,0).transformDirection(rig.group.matrixWorld),fingers=new T.Vector3(0,0,1).transformDirection(rig.group.matrixWorld);
  close(dorsal,new T.Vector3(handedness==='right'?1:-1,0,0).applyQuaternion(rotation),handedness+' dorsal alignment');
  close(fingers,new T.Vector3(0,-1,0).applyQuaternion(rotation),handedness+' fingertip axis');
  const unit=new T.Vector3(1,0,0).applyMatrix4(rig.group.matrixWorld),zero=new T.Vector3().applyMatrix4(rig.group.matrixWorld);assert(Math.abs(unit.distanceTo(zero)-CONTROLLER_HAND_METRES_PER_UNIT)<1e-9);
  assert(rig.group.matrixWorld.determinant()>0,'No negative scale to swap handedness');
  // A separate native targetRaySpace is not derived from the visual hand.
  const rayOrigin=new T.Vector3(.1,1.33,-.52),rayRotation=new T.Quaternion().setFromEuler(new T.Euler(-.1,.4,.03)),rayEnd=rayOrigin.clone().add(new T.Vector3(0,0,-1).applyQuaternion(rayRotation));
  const marker=new T.Group();scene.add(marker);marker.matrixAutoUpdate=false;marker.matrix.copy(inverse).multiply(new T.Matrix4().compose(position,rotation,new T.Vector3(1,1,1)));marker.updateMatrixWorld(true);
  const localStart=marker.worldToLocal(rayOrigin.clone()),localEnd=marker.worldToLocal(rayEnd.clone()),before=marker.matrixWorld.toArray();
  helper.update(grip,inverse,{trigger:1,squeeze:0});
  close(marker.localToWorld(localStart.clone()),rayOrigin,'Target-ray origin preserved');close(marker.localToWorld(localEnd.clone()),rayEnd,'Target-ray direction preserved');assert.deepEqual(marker.matrixWorld.toArray(),before,'Hand posing cannot change ray marker');scene.remove(marker);
 }
 // Retargeting leaves manual matrices and nonuniform/sheared bone transforms.
 // Alternate repeatedly to expose state retained from either source.
 const source=handSource(handedness),nativePoints=handPoints({x:position.x,y:position.y,z:position.z});
 for(let transition=0;transition<8;transition++){
  helper.releaseToTracking();assert.equal(rig.group.visible,false);assert.equal(rig.group.matrixAutoUpdate,true);assert.equal(helper.state().mode,'unassigned');assert(!helper.isControllerPosed());
  const points=readHandJoints(new Frame({hands:new Map([[source,nativePoints]])}),source,{});assert(points);
  assert(retargetHand(rig,points,inverse));rig.group.visible=true;assert(rig.bones.every(b=>b.matrixAutoUpdate===false));
  // Save exact tracked matrices; releasing the visual hand helper never invents
  // hand joint positions or changes the fresh retargeting results.
  const tracked=rig.bones.map(b=>b.matrix.toArray());assert(retargetHand(rig,points,inverse));assert.deepEqual(rig.bones.map(b=>b.matrix.toArray()),tracked);
  assert(helper.update(grip,inverse,{trigger:.5,squeeze:.8}));
  rig.bones.forEach((b,i)=>{assert(b.matrixAutoUpdate);close(b.position,restPositions[i],'Authored bone translation restored');close(b.scale,restScales[i],'Authored bone scale restored');});
  const current=resources(scene);assert.deepEqual(current,baseline,'Controller/tracked switching reuses the exact original meshes/materials/textures');
 }
 for(const invalid of [null,pose(position,rotation,{emulatedPosition:true}),pose({x:NaN,y:1,z:0}),pose(position,{x:0,y:0,z:0,w:0})]){
  assert.equal(helper.update(invalid,inverse),false);assert.equal(rig.group.visible,false);assert.equal(helper.state().poseValid,false);assert.equal(helper.state().handTracking,false);
  assert(helper.update(grip,inverse));assert(rig.group.visible);
 }
 const badInverse=new T.Matrix4();badInverse.elements[7]=Infinity;assert.equal(helper.update(grip,badInverse),false);assert(!rig.group.visible);assert.equal(helper.update(grip,new T.Matrix4().makeScale(0,0,0)),false);
 helper.releaseToTracking();const final=resources(scene);assert.deepEqual(final,baseline);
 rows.at(-1).originalResources={meshes:baseline.meshes.length,geometries:baseline.geometries.size,materials:baseline.materials.size,textures:baseline.textures.size};rig.dispose();
}
check('Both hands reproduce four authored endpoints and25 analog blends');
check('Metre-space grip centres, axes and size survive tabletop translation/rotation/nonuniform scale');
check('Native target-ray endpoints survive independent visual transforms unchanged');
check('Eight controller/tracked-hand transitions per side restore correct matrix ownership');
check('Invalid/emulated poses hide controller visuals and never claim hand tracking');
check('No meshes, geometries, materials or textures added; original identities preserved');
const report={pass:true,scope:'CPU-only Three0.160 rig/matrix tests with synthetic grip/joint samples. No browser, GPU, physical controller alignment or Quest acceptance claim.',checks,rows,helperSHA256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../../src/controller-god-hand.js',import.meta.url))).digest('hex')};
fs.mkdirSync(new URL('./generated/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./generated/controller-god-hand.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
