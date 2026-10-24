import * as T from 'three';
import {RAPIER,XR_GRAB_GROUP_LIMIT} from './physics.js';
import {XR_SCALE} from './xr-hand-math.js';
import {currentShrine,shrineOwnsCollider} from './shrine-power-target.js';

export const XR_GRAB_REACH=.028,XR_POWER_REACH=.09;
export const XR_GROUP_REACH=.045;
// Fixed membership at acquisition, nearest distinct characters first. Loads and
// rocks remain singleton grabs. Every extra contact has its own occlusion test.
export function pickXRGroup(sim,side,point,primary,scale=XR_SCALE){
 if(!primary?.body)return[];
 const first=sim.colliderOwners.get(primary.handle)?.character;
 if(!first||!Number.isFinite(scale)||scale<=0)return[primary];
 const reach=XR_GROUP_REACH/scale,byCharacter=new Map();
 sim.world.collidersWithAabbIntersectingAabb(point,{x:reach,y:reach,z:reach},collider=>{
  const owner=sim.colliderOwners.get(collider.handle),body=collider.parent(),character=owner?.character;
  if(!character||character===first||!body?.isEnabled()||!collider.isEnabled()||collider.isSensor()||!sim.xrCanGrabBody(side,body))return true;
  const at=new T.Vector3().copy(collider.projectPoint(point,true).point),distance=at.distanceTo(point),old=byCharacter.get(character);
  if(distance<=reach&&(!old||distance<old.distance||distance===old.distance&&collider.handle<old.handle))byCharacter.set(character,{body,point:at,distance,handle:collider.handle,character});return true;
 });
 const candidates=[...byCharacter.values()].sort((a,b)=>a.distance-b.distance||a.character.id-b.character.id||a.handle-b.handle),result=[primary];
 for(const candidate of candidates){
  if(result.length>=XR_GRAB_GROUP_LIMIT)break;
  if(candidate.distance>1e-6){const direction=candidate.point.clone().sub(point).normalize();
   const blocked=sim.world.castRay(new RAPIER.Ray(point,direction),Math.max(0,candidate.distance-1e-4),true,undefined,undefined,undefined,candidate.body,c=>{const character=sim.colliderOwners.get(c.handle)?.character;return !c.isSensor()&&c.isEnabled()&&character!==candidate.character&&character!==first;});
   if(blocked)continue;
  }result.push(candidate);
 }return result;
}
// One small native broadphase query per eligible hand. Physical Grab retains
// its native segment test; powers additionally confirm exact visible surfaces.
export function pickXRTarget(sim,side,point,reachMetres=XR_GRAB_REACH,scale=XR_SCALE,shrine=null,isPowerPathBlocked=null){
 if(!Number.isFinite(reachMetres)||reachMetres<=0||reachMetres>XR_POWER_REACH||!Number.isFinite(scale)||scale<=0)return null;const REACH=reachMetres/scale;
 if(sim.disposed||sim.xrGrabs.has(side))return null;
 let best=null;
 const extent={x:REACH,y:REACH,z:REACH};
 sim.world.collidersWithAabbIntersectingAabb(point,extent,collider=>{
  if(shrineOwnsCollider(shrine,sim,collider)){
   const at=new T.Vector3().copy(collider.projectPoint(point,true).point),distance=at.distanceTo(point);
   if(distance<=REACH&&(!best||distance<best.distance||(distance===best.distance&&collider.handle<best.handle)))best={kind:'shrine',shrine,collider,point:at,distance,handle:collider.handle};
   return true;
  }
  const owner=sim.colliderOwners.get(collider.handle),body=collider.parent();
  if(!owner||!['character','rock'].includes(owner.type)||!body?.isEnabled()||!collider.isEnabled()||collider.isSensor()||!sim.xrCanGrabBody(side,body))return true;
  const at=new T.Vector3().copy(collider.projectPoint(point,true).point),distance=at.distanceTo(point);
  if(distance<=REACH&&(!best||distance<best.distance||(distance===best.distance&&collider.handle<best.handle)))best={body,point:at,distance,handle:collider.handle};
  return true;
 });
 if(best&&best.distance>1e-6){
  // The short physical reach cannot pass through scenery/another body. The
  // same rejected/accepted candidate is used by both hover and acquisition.
  const direction=best.point.clone().sub(point).normalize();
  const blocked=isPowerPathBlocked?isPowerPathBlocked(best,point):sim.world.castRay(new RAPIER.Ray(point,direction),Math.max(0,best.distance-1e-4),true,undefined,undefined,undefined,best.body,c=>!c.isSensor()&&c.isEnabled()&&!(best.kind==='shrine'&&currentShrine(shrine,sim)&&shrine.colliders.includes(c)));
  if(blocked)return null;
 }
 return best;
}

export function createGrabFeedback(scene,side,getScale=()=>XR_SCALE){
 const root=new T.Group();root.name=`XR ${side} grab feedback`;root.visible=false;scene.add(root);
 const material=new T.MeshBasicMaterial({color:'#cee8e9',depthTest:true,depthWrite:true,toneMapped:false});
 const ring=new T.InstancedMesh(new T.TorusGeometry(.009/XR_SCALE,.0014/XR_SCALE,5,20),material,XR_GRAB_GROUP_LIMIT);ring.count=1;ring.instanceMatrix.setUsage(T.DynamicDrawUsage);ring.name='Target attachment ring';root.add(ring);
 const anchor=new T.Mesh(new T.IcosahedronGeometry(.0038/XR_SCALE,0),material);anchor.name='Live pinch anchor';root.add(anchor);
 const tether=new T.Mesh(new T.CylinderGeometry(.0009/XR_SCALE,.0009/XR_SCALE,1,5,1),material);tether.name='Physical grip tether';root.add(tether);
 const readyGeometry=ring.geometry,waitGeometry=new T.TorusGeometry(.009/XR_SCALE,.0014/XR_SCALE,5,16,Math.PI*1.5);
 // Merge both pause strokes into one mesh: one extra draw only while unready.
 const stroke=new T.BoxGeometry(.002/XR_SCALE,.008/XR_SCALE,.0016/XR_SCALE).toNonIndexed(),positions=[];
 for(const sign of [-1,1])for(let i=0;i<stroke.attributes.position.count;i++)positions.push(stroke.attributes.position.getX(i)+sign*.0021/XR_SCALE,stroke.attributes.position.getY(i),stroke.attributes.position.getZ(i));stroke.dispose();
 const pauseGeometry=new T.BufferGeometry();pauseGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 const pause=new T.Mesh(pauseGeometry,material);pause.name='Power unavailable pause bars';root.add(pause);pause.visible=false;
 let mode='none',body=null,targetKind=null,lastViewer=null,lastMembers=null;
 const ringMatrix=new T.Matrix4(),ringRotation=new T.Quaternion(),ringScale=new T.Vector3();
 function hide(){root.visible=false;mode='none';body=null;targetKind=null;lastViewer=null;lastMembers=null;}
 function show({picked,grab,members=null,viewer,power,cooldown=0,armed=true}){
  if(!picked&&!grab){hide();return;}
  const metric=XR_SCALE/getScale();anchor.scale.setScalar(metric);pause.scale.setScalar(metric);lastMembers=members;
  lastViewer=viewer;const isPower=power&&power!=='grab';mode=grab?'held':isPower&&cooldown>1e-7?'cooldown':isPower&&!armed?'rearm':'ready';body=grab?.body||picked.body;targetKind=picked?.kind==='shrine'?'shrine':'body';root.visible=true;
  const unavailable=mode==='cooldown'||mode==='rearm';ring.geometry=unavailable?waitGeometry:readyGeometry;pause.visible=unavailable;material.color.set(grab?'#eef5f7':unavailable?'#8d9ca5':power==='bless'?'#a7c4b5':'#cee8e9');
  const point=grab?grab.local.clone().applyQuaternion(new T.Quaternion().copy(grab.body.rotation())).add(new T.Vector3().copy(grab.body.translation())):picked.point;
  ring.count=grab&&members?Math.min(XR_GRAB_GROUP_LIMIT,members.length):1;ringScale.setScalar(metric);
  for(let i=0;i<ring.count;i++){const g=members?.[i],at=g?g.local.clone().applyQuaternion(new T.Quaternion().copy(g.body.rotation())).add(new T.Vector3().copy(g.body.translation())):point;
   ringRotation.setFromUnitVectors(new T.Vector3(0,0,1),viewer.clone().sub(at).normalize());ringMatrix.compose(at,ringRotation,ringScale);ring.setMatrixAt(i,ringMatrix);if(i===0){pause.position.copy(at);pause.quaternion.copy(ringRotation);}}
  ring.instanceMatrix.needsUpdate=true;ring.computeBoundingSphere();
  anchor.visible=tether.visible=!!grab;
  if(grab){
   anchor.position.copy(grab.target);
   const delta=point.clone().sub(grab.target),length=delta.length();
   tether.visible=length>1e-5;
   if(tether.visible){tether.position.copy(point).add(grab.target).multiplyScalar(.5);tether.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.divideScalar(length));tether.scale.set(metric,length,metric);}
  }
 }
 function refreshHeld(grab){if(mode!=='held')return;if(!grab||grab.body!==body){hide();return;}show({grab,members:lastMembers,viewer:lastViewer});}
 return{hide,show,refreshHeld,state:()=>({mode,targetKind,bodyHandle:body?.handle??null,memberCount:mode==='held'?lastMembers?.length??1:0,visible:root.visible,shape:mode==='cooldown'||mode==='rearm'?'broken-ring-pause':mode==='none'?'none':'closed-ring',depthTest:material.depthTest})};
}
