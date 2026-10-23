import * as THREE from 'three';
import {createPlayerThrowImpacts} from './player-throw-impact.js';
import {applySuccessfulStrike} from './hit-knockback.js';
import {applySuccessfulStrike as applyShieldStrike} from './shield-hit-knockback.js';
import {isPowerClub,strikeEndFor,selectHeavyClub,earnedCritical,opponentClubThreat,POWER_CLUB_TIMING as PC} from './power-combat-policy.js';
import {beginSweepStep,finishSweepStep,evaluateSweep,physicalContact} from './swept-melee.js';
import {beginCausalContactBatch,endCausalContactBatch,evaluateCausalStrike,invalidateCausalCharacter} from './causal-strike-contact.js';
import RAPIER from '@dimforge/rapier3d-compat';
import {terrainHeight,inArena} from './terrain.js';
import {createSurfaceSampler} from './surface-support.js';
import weapons from '../blender-art/weapon-collider-metadata.json';
import {createAnatomicalJoint,measureAnatomicalJoint} from './anatomical-joints.js';
import {createArmyContactHooks,characterCollisionGroup,requiresWeaponContactHook} from './army-formation.js';
import {MELEE_PROFILE} from './melee-profile.js';
import {applyReachableClub} from './reachable-club.js';
import {crowdApproachHeading,crowdTurnReady} from './crowd-approach.js';
import {predictApproachLanding,constrainApproachTrajectory} from './predictive-landing.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion(),UP=V(0,1,0),clamp=THREE.MathUtils.clamp;
export {RAPIER};
// XR follow is bounded independently from the unchanged .24 m/s sampled flick cap.
const safeXRScale=value=>Number.isFinite(value)&&value>=.024&&value<=.045?value:.03;
const xrSpeed=g=>g.xrMetresPerUnit===undefined?(g.inputSource==='touch'?8:32):.24/safeXRScale(g.xrMetresPerUnit);
const grabFollowSpeed=g=>g.xrMetresPerUnit===undefined?xrSpeed(g):1.2/safeXRScale(g.xrMetresPerUnit);
export async function initializePhysics(){await RAPIER.init();const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/120;world.numSolverIterations=10;world.numAdditionalFrictionIterations=4;return world;}
function vec(v){return Array.isArray(v)?V(...v):V(v.x,v.y,v.z);}
function quat(v){return Array.isArray(v)?new THREE.Quaternion(...v):new THREE.Quaternion(v.x,v.y,v.z,v.w);}
function ik(start,end,l1,l2,pole){const d=end.clone().sub(start),distance=clamp(d.length(),.02,l1+l2-.008);d.normalize();let p=pole.clone().addScaledVector(d,-pole.dot(d));if(p.lengthSq()<1e-7)p=V(0,0,1).addScaledVector(d,-d.z);p.normalize();const along=(l1*l1+distance*distance-l2*l2)/(2*distance),height=Math.sqrt(Math.max(.001,l1*l1-along*along));return start.clone().addScaledVector(d,along).addScaledVector(p,height);}
const segmentQ=(a,b)=>Q().setFromUnitVectors(UP,a.clone().sub(b).normalize());
function hingeFrames(a,b,c,right){const ay=a.clone().sub(b).normalize(),by=b.clone().sub(c).normalize();let x=ay.clone().cross(by);if(x.lengthSq()<1e-6)x.copy(right);x.normalize();if(x.dot(right)<0)x.negate();const make=y=>{const xx=x.clone().addScaledVector(y,-x.dot(y)).normalize(),z=xx.clone().cross(y).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx,y,z));};return [make(ay),make(by)];}
export class BattlePhysics{
 constructor(world,rig){this.world=world;this.rig=rig;this.characters=[];this.rocks=[];this.colliderOwners=new Map();this.queue=new RAPIER.EventQueue(true);this.time=0;this.events=[];this.grab=null;this.xrGrabs=new Map();this.combat=true;this.tick=0;this.poseMode='native';this.physicsHooks=createArmyContactHooks(this.colliderOwners);this.playerThrowImpacts=createPlayerThrowImpacts(this);}
 spawn(team,x,z,id){const yaw=team===0?Math.PI/2:-Math.PI/2,rotation=Q().setFromAxisAngle(UP,yaw),offset=V(x,terrainHeight(x,z)+.07,z),parts=[],massList=[5,4,1.8,1.1,.8,.5,1.8,1.2,.8,1.1,.8,.5,1.8,1.2,.8];
  const c={id,team,parts,joints:[],yaw,hp:100,state:'march',stun:0,recover:1,attack:0,attackId:0,strikeGeometry:[],attackCooldown:.6+id*.17,hit:false,gait:id*.137,feet:[],lastHalf:-1,phase:0,footPhase:0,footMoveSign:0,target:null,totalMass:massList.reduce((a,b)=>a+b,0),impacts:0,lastHit:-99};
  for(const bone of this.rig.restBones){const p=vec(bone.position).applyQuaternion(rotation).add(offset),q=rotation.clone().multiply(quat(bone.quaternion));const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setRotation(q).setLinearDamping(.12).setAngularDamping(.5).setCcdEnabled(true).setAdditionalSolverIterations(4));
   let desc;if([0,1,2,5,8,11,14].includes(bone.index)){const h=bone.halfExtents||([0,1].includes(bone.index)?[.26,.25,.16]:[.12,.12,.13]);desc=RAPIER.ColliderDesc.roundCuboid(Math.max(.025,h[0]-.035),Math.max(.025,h[1]-.035),Math.max(.025,h[2]-.035),.035);}else{desc=RAPIER.ColliderDesc.capsule(Math.max(.03,bone.length*.5-(bone.radius||.10)*.65),bone.radius||.10);}
   desc.setMass(massList[bone.index]).setFriction(.85).setRestitution(.04).setCollisionGroups(characterCollisionGroup(id)).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(15);
   const collider=this.world.createCollider(desc,body);const part={body,collider,bone,mass:massList[bone.index],targetQ:q.clone()};parts.push(part);this.colliderOwners.set(collider.handle,{type:'character',character:c,index:bone.index});
  }
  for(const j of this.rig.joints)c.joints.push(createAnatomicalJoint({THREE,RAPIER,world:this.world,definition:j,parts,rig:this.rig,powerClub:id%2===0}));
  for(const i of [8,14]){const p=vec(parts[i].body.translation());c.feet.push({point:p.clone(),start:p.clone(),end:p.clone(),swing:false});}
  this.characters.push(c);return c;
 }
 equipWeapons(c){
  const attach=(index,desc,center,rotation,mass)=>{const part=c.parts[index],bone=part.bone,local=vec(center).applyMatrix4(bone.inverseBindMatrix),localQ=quat(bone.quaternion).invert().multiply(rotation);desc.setTranslation(local.x,local.y,local.z).setRotation(localQ).setMass(mass).setFriction(.6).setRestitution(.08).setCollisionGroups(characterCollisionGroup(c.id,true)).setActiveHooks(requiresWeaponContactHook(c.id)?RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS:0).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(15);const collider=this.world.createCollider(desc,part.body);const strikeGeometry={colliderHandle:collider.handle,index,local:local.clone(),kind:index===5?'club':'shield'};c.strikeGeometry.push(strikeGeometry);this.colliderOwners.set(collider.handle,{type:'character',character:c,index,weapon:true,strikeGeometry});part.mass+=mass;c.totalMass+=mass;};
  const a=vec(weapons.club.shaft_start),b=vec(weapons.club.shaft_end),mid=a.clone().add(b).multiplyScalar(.5),shaftQ=Q().setFromUnitVectors(UP,b.clone().sub(a).normalize());attach(5,RAPIER.ColliderDesc.capsule(a.distanceTo(b)*.5,.045),mid.toArray(),shaftQ,.18);
  attach(5,RAPIER.ColliderDesc.ball(.152),weapons.club.head_center,Q(),.60);
  attach(11,RAPIER.ColliderDesc.cylinder(weapons.shield.half_depth,weapons.shield.radius),weapons.shield.center,Q().setFromUnitVectors(UP,V(0,0,1)),.55);c.weapons=true;
 }
 addRock(x,z,r=.42){const p=V(x,terrainHeight(x,z)+r+.05,z),body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setLinearDamping(.15).setAngularDamping(.5).setCcdEnabled(true));const collider=this.world.createCollider(RAPIER.ColliderDesc.convexHull(new THREE.DodecahedronGeometry(r,0).attributes.position.array).setMass(7).setFriction(.9).setRestitution(.10).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(40),body);const rock={body,collider,radius:r};this.rocks.push(rock);this.colliderOwners.set(collider.handle,{type:'rock',rock});return rock;}
 event(type,data={}){this.events.push({t:+this.time.toFixed(3),type,...data});if(this.events.length>150)this.events.shift();}
 activeGrabs(){return [this.grab,...this.xrGrabs.values()].filter(Boolean);}
 isCharacterHeld(c){return this.activeGrabs().some(g=>c.parts.some(p=>p.body===g.body));}
 get rootBodies(){return this.characters.map(c=>c.parts[1].body);}
 impulseCharacter(c,impulse,index=0){c.parts[index].body.applyImpulse(impulse,true);c.stun=Math.max(c.stun,.7);c.recover=0;c.state='stumble';this.event('stumble',{id:c.id,impulse:[impulse.x,impulse.y,impulse.z]});}
 grabBody(body,point,target,{inputSource='desktop'}={}){if(this.grab)this.releaseGrab(false);const local=vec(point).sub(vec(body.translation())).applyQuaternion(quat(body.rotation()).invert());this.grab={body,local,inputSource,target:vec(target),last:vec(target),velocity:V(),age:0,lastMoveTime:-99,kind:this.rocks.some(r=>r.body===body)?'rock':'character',supportMass:body.mass()};for(const c of this.characters)if(c.parts.some(p=>p.body===body)){invalidateCausalCharacter(this,c);this.playerThrowImpacts.cancel(c);c.stun=1;c.state='held';c.recover=0;this.grab.supportMass=c.totalMass;}const g=this.grab,responsive=inputSource==='desktop'||inputSource==='left'||inputSource==='right';g.anchor=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x,point.y,point.z));g.joint=this.world.createImpulseJoint(RAPIER.JointData.spring(0,g.supportMass*(responsive?480:55),g.supportMass*(responsive?40:9),{x:0,y:0,z:0},local),g.anchor,body,true);g.joint.setContactsEnabled(false);this.event('grab');}
 moveGrab(target,dt=1/60,{sampleThrow=true}={}){if(!this.grab)return;const g=this.grab,delta=vec(target).sub(g.target).divideScalar(dt);if(sampleThrow){g.velocity.lerp(delta.clampLength(0,18),g.inputSource==='touch'?.28:1-Math.exp(-Math.max(.001,dt)/.05));g.lastMoveTime=this.time;}else{g.velocity.set(0,0,0);g.lastMoveTime=-99;}g.last.copy(g.target);g.target.copy(vec(target));}
 releaseGrab(flick=true){if(!this.grab)return;const g=this.grab;if(g.inputSource==='desktop')g.velocity.multiplyScalar(Math.exp(-Math.max(0,this.time-g.lastMoveTime-.025)/.045));if(flick&&this.time-g.lastMoveTime<.14&&g.velocity.length()>(g.xrMetresPerUnit===undefined?2.4:.072/safeXRScale(g.xrMetresPerUnit))){const add=g.velocity.clone().multiplyScalar(g.body.mass()*.75);g.body.applyImpulse(add,true);this.event('flick',{speed:g.velocity.length()});this.playerThrowImpacts.register(g.body,g.inputSource==='touch'?'desktop':g.inputSource??'desktop');}else this.event('release');if(g.joint)this.world.removeImpulseJoint(g.joint,true);if(g.anchor)this.world.removeRigidBody(g.anchor);this.grab=null;}
 // XR owns independent existing spring grabs. Desktop singleton semantics are unchanged.
 xrCanGrabBody(owner,body){
  if(this.disposed||!['left','right'].includes(owner)||!body||this.xrGrabs.has(owner))return false;
  const ownerCharacter=this.characters.find(c=>c.parts.some(p=>p.body===body));
  if(!ownerCharacter&&!this.rocks.some(r=>r.body===body))return false;
  if(this.world.getRigidBody(body.handle)!==body)return false;
  if([this.grab,...this.xrGrabs.values()].some(g=>g&&(g.body===body||(ownerCharacter&&ownerCharacter.parts.some(p=>p.body===g.body)))))return false;
  return true;
 }
 xrGrabBody(owner,body,point,target,metresPerUnit=.03){
  metresPerUnit=safeXRScale(metresPerUnit);
  if(!this.xrCanGrabBody(owner,body))return false;
  const desktop=this.grab;this.grab=null;try{this.grabBody(body,point,target,{inputSource:owner});this.grab.xrMetresPerUnit=metresPerUnit;this.grab.inputSource=owner;this.xrGrabs.set(owner,this.grab);return true;}finally{this.grab=desktop;}
 }
 // Missing tracking freezes only the anchor target and invalidates throw history.
 // The existing dynamic body and spring stay in the solver; no pose is fabricated.
 xrSuspendGrab(owner){const g=this.xrGrabs.get(owner);if(!g)return;g.target.copy(g.anchor.translation());g.last.copy(g.target);g.velocity.set(0,0,0);g.lastMoveTime=-99;}
 xrMoveGrab(owner,target,dt=1/60,{sampleThrow=true}={}){
  const g=this.xrGrabs.get(owner);if(!g)return;
  if(!target||!Number.isFinite(target.x)||!Number.isFinite(target.y)||!Number.isFinite(target.z)||!Number.isFinite(dt)||dt<=0){this.xrSuspendGrab(owner);return;}
  const elapsed=clamp(dt,1/240,.05),scale=safeXRScale(g.xrMetresPerUnit);
  if(sampleThrow){const delta=vec(target).sub(g.target).divideScalar(elapsed);g.velocity.lerp(delta.clampLength(0,.54/scale),1-Math.exp(-elapsed/.05)).clampLength(0,xrSpeed(g));g.lastMoveTime=this.time;}
  else{g.velocity.set(0,0,0);g.lastMoveTime=-99;}
  g.last.copy(g.target);g.target.copy(target);
 }
 xrReleaseGrab(owner,flick=false){if(!flick)this.playerThrowImpacts.cancelSource(owner);const g=this.xrGrabs.get(owner);if(!g)return;const desktop=this.grab;this.grab=g;try{g.velocity.clampLength(0,xrSpeed(g));this.releaseGrab(flick);}finally{this.grab=desktop;this.xrGrabs.delete(owner);}}
 xrReleaseAll(){this.playerThrowImpacts.cancel();for(const owner of [...this.xrGrabs.keys()])this.xrReleaseGrab(owner,false);}
 torque(part,target,strength,dt){if(strength<=0)return;const current=quat(part.body.rotation()),err=target.clone().multiply(current.invert());if(err.w<0){err.x*=-1;err.y*=-1;err.z*=-1;err.w*=-1;}const av=vec(part.body.angvel()),scale=[0,1,2].includes(part.bone.index)?1:.35;const torque=V(err.x,err.y,err.z).multiplyScalar(part.mass*70*scale*strength).addScaledVector(av,-part.mass*4*scale*strength).clampLength(0,part.mass*24);part.body.applyTorqueImpulse(torque.multiplyScalar(dt),true);}
 disablePose(c){if(!c.poseActive)return;const raw=this.world.impulseJoints.raw;for(const entry of c.joints)for(const axis of entry.anatomy.limitAxes)raw.jointSetMotorMaxForce(entry.joint.handle,{x:3,y:4,z:5}[axis],0);c.poseActive=false;}
 nativePose(c,targets,strength,stumbling,dt){const raw=this.world.impulseJoints.raw;
  for(let i=0;i<15;i++)c.parts[i].targetQ.copy(targets[i]);
  for(const entry of c.joints){const {joint,definition:j,anatomy:a}=entry,name=j.name.toLowerCase();const parentPose=name.includes('ankle')?quat(c.parts[j.parent].body.rotation()):targets[j.parent].clone();const parentFrame=parentPose.multiply(quat(a.localFrameA)),childFrame=targets[j.child].clone().multiply(quat(a.localFrameB));const rel=parentFrame.invert().multiply(childFrame).normalize();if(rel.w<0){rel.x*=-1;rel.y*=-1;rel.z*=-1;rel.w*=-1;}
   const safe={};for(const axis of ['x','y','z']){const range=a.limits[axis]||[0,0];safe[axis]=clamp(2*Math.atan2(rel[axis],rel.w),range[0]+.015,range[1]-.015);}
   const sq=new THREE.Quaternion(Math.tan(safe.x/2),Math.tan(safe.y/2),Math.tan(safe.z/2),1).normalize();let k=40,d=4,max=18;
   if(name.includes('knee')){k=180;d=10;max=45;}else if(name.includes('hip')){k=110;d=8;max=40;}else if(name.includes('ankle')){k=75;d=6;max=25;}else if(name.includes('waist')){k=100;d=9;max=42;}else if(name.includes('neck')){k=14;d=2;max=6;}else if(name.includes('elbow')){k=40;d=3;max=14;}else if(name.includes('wrist')){k=20;d=1.8;max=8;}
   if(c.attack>0&&c.id%2===0&&/^left(Shoulder|Elbow|Wrist)$/i.test(j.name)){const powered=c.attack>=.47&&c.attack<1.15;k*=powered?10:5;d*=powered?3.0:1.6;max*=powered?10:5;}if(c.attack>0&&isPowerClub(c)&&name.includes('waist')){k*=2;max*=2;}
   const leg=name.includes('hip')||name.includes('knee')||name.includes('ankle'),support=stumbling?(leg?.70:.30):Math.max(leg?.65:.30,strength);
   for(const axis of a.limitAxes){const rawAxis={x:3,y:4,z:5}[axis],target=a.kind==='hinge'?safe[axis]:2*Math.asin(clamp(sq[axis],-1,1));if(!c.poseConfigured)raw.jointConfigureMotorModel(joint.handle,rawAxis,RAPIER.MotorModel.ForceBased);raw.jointSetMotorMaxForce(joint.handle,rawAxis,max*support);raw.jointConfigureMotorPosition(joint.handle,rawAxis,target,k*support,d*Math.sqrt(support));}
  }
  c.poseConfigured=true;c.poseActive=true;this.torque(c.parts[1],targets[1],strength*(c.attack>0&&isPowerClub(c)?2:.8),dt);this.torque(c.parts[0],targets[0],strength*(c.attack>0&&isPowerClub(c)?2.5:.35),dt);
 }
 controlCharacter(c,dt){const root=c.parts[1].body,p=vec(root.translation()),vel=vec(root.linvel());
  if(c.hp<=0||p.y<-4){c.footMoveSign=0;this.disablePose(c);if(c.state!=='fallen'){c.state='fallen';c.hp=0;this.event('death',{id:c.id});}return;}
  const held=this.isCharacterHeld(c);if(held){c.footMoveSign=0;this.disablePose(c);c.stun=.75;c.state='held';c.supportFeet=[];return;}
  if(c.ragdollUntil>this.time){this.disablePose(c);c.attack=0;c.state='launched';c.stun=Math.max(c.stun,.6);c.needsRecovery=true;return;}
  c.stun=Math.max(0,c.stun-dt);const stumbling=c.stun>0,rootUp=UP.clone().applyQuaternion(quat(root.rotation())).y;
  const surface=createSurfaceSampler(this.world,RAPIER,this.terrainHeight||terrainHeight,this.colliderOwners);
  // Feet, rather than a high ray from the pelvis, bound reachable raised support.
  // An overhead arch or a tall block ahead must never become the ground plane.
  const supportCeiling=Math.min(p.y-.10,...[8,14].map(i=>c.parts[i].body.translation().y-c.parts[i].bone.halfExtents[1]))+.12;
  const rootGround=surface.height(p.x,p.z,supportCeiling),stepCeiling=rootGround+.28;
  c.supportFeet=[8,14].map(i=>{const part=c.parts[i],fp=vec(part.body.translation()),fq=quat(part.body.rotation()),h=part.bone.halfExtents,normal=surface.normal(fp.x,fp.z,fp.y+.08);const upDot=UP.clone().applyQuaternion(fq).dot(normal);const gaps=[[0,-h[1],h[2]*.7],[0,-h[1],-h[2]*.7],[h[0]*.7,-h[1],0],[-h[0]*.7,-h[1],0]].map(a=>{const w=V(...a).applyQuaternion(fq).add(fp);return w.y-surface.height(w.x,w.z,w.y+.12);});const maxGap=Math.max(...gaps),minGap=Math.min(...gaps);return{ready:upDot>.90&&maxGap<.065&&minGap>-.10&&Math.abs(part.body.linvel().y)<.5,upDot,maxGap,minGap};});
  const flatFeet=c.supportFeet.filter(f=>f.ready).length;c.supportLostFor=flatFeet===2?0:(c.supportLostFor||0)+dt;
  if(stumbling||p.y<rootGround+.85||rootUp<.55||(c.state==='guard'&&c.supportLostFor>.4)){c.needsRecovery=true;c.stableFor=0;}
  const poseReady=p.y>rootGround+.98&&rootUp>.92&&Math.abs(vel.y)<.35&&flatFeet===2;
  if(stumbling){c.recover=0;c.attack=0;}else if(c.needsRecovery){c.recover=Math.min(1,c.recover+dt*1.25);c.stableFor=poseReady?(c.stableFor||0)+dt:0;if(c.stableFor>.40){c.needsRecovery=false;c.recover=1;}}else c.recover=1;
  const recovering=!!c.needsRecovery;const strength=stumbling?.30+.25*(1-clamp(c.stun/.7,0,1)):Math.max(.25,c.recover);
  let target=null,distance=Infinity;for(const other of this.characters){if(other.team===c.team||other.hp<=0||this.combatTargetEligible&&!this.combatTargetEligible(other,c))continue;const d=vec(other.parts[1].body.translation()).sub(p);d.y=0;if(d.length()<distance){distance=d.length();target=other;}}
  if(c.attack>0&&c.committedTarget?.hp>0){target=c.committedTarget;const d=vec(target.parts[1].body.translation()).sub(p);d.y=0;distance=d.length();}c.target=target;const toward=target?vec(target.parts[1].body.translation()).sub(p):V(Math.sin(c.yaw),0,Math.cos(c.yaw));toward.y=0;toward.normalize();const approach=this.crowdApproach===false?toward:crowdApproachHeading(this,c,p,toward,distance,!stumbling&&!recovering&&this.combat&&!!target&&c.attack===0);const desiredYaw=Math.atan2(approach.x,approach.z);let yawDelta=Math.atan2(Math.sin(desiredYaw-c.yaw),Math.cos(desiredYaw-c.yaw));c.yaw+=clamp(yawDelta,-dt*3,dt*3);const facing=Q().setFromAxisAngle(UP,c.yaw),forward=V(0,0,1).applyQuaternion(facing),right=V(1,0,0).applyQuaternion(facing);
  const profile=this.meleeProfile||MELEE_PROFILE,powerClub=isPowerClub(c),attackEnd=profile.contactStep?(powerClub?PC.attackEnd:1.30):1.05,strikeEnd=strikeEndFor(c,profile.contactStep),attackRange=c.weapons?(powerClub?PC.attackRange:1.50):1.30;
  c.attackCooldown-=dt;if(target&&distance<attackRange&&!c.inRange){c.inRange=true;c.attackCooldown=Math.max(c.attackCooldown,.10+(c.id%3)*.17+c.team*.28);}if(distance>(powerClub?PC.rangeExit:1.65))c.inRange=false;if(c.attack===0&&!stumbling&&!recovering&&target&&distance<attackRange&&(!powerClub||(distance>=PC.guardNear&&!(target.attack>0&&target.attack<strikeEndFor(target,profile.contactStep))))&&c.attackCooldown<=0&&this.combat&&(this.crowdApproach===false||crowdTurnReady(c,toward,forward))){c.attack=.001;c.attackId++;c.hit=false;c.committedTarget=target;c.attackCooldown=powerClub?PC.cooldown+(c.id%3)*PC.cooldownStagger:1.7+(c.id%3)*.15;c.heavyArmed=selectHeavyClub(c);c.chargedSeconds=0;this.event('windup',{id:c.id,attackId:c.attackId,heavy:c.heavyArmed,kind:powerClub?'club':'shield'});}
  if(c.attack>0){if(c.attack<.47)c.chargedSeconds=(c.chargedSeconds||0)+dt;c.attack+=dt;if(c.attack>attackEnd)c.attack=0;}
  const contactStep=!!profile.contactStep&&c.attack>=(powerClub?PC.entryStart:.47)&&c.attack<strikeEnd&&distance>(powerClub?PC.entryStop:1.00),recoveryStep=!!profile.contactStep&&c.attack>=1.03&&distance<(powerClub?PC.guardNear:1.22);
  // Read the opponent's actual telegraph before walking into its release lane.
  // This bounded reactive guard uses ordinary balance/feet and never fixes a pose.
  const opponentLoading=opponentClubThreat(this,c,target,distance);
  const moveSpeed=opponentLoading&&c.attack===0&&distance<1.94?(distance<1.82?-.80:0):powerClub?(contactStep?1.80:recoveryStep?-.90:c.attack===0&&distance<PC.guardNear?-.80:c.attack===0&&distance>PC.guardFar?1.05:0):(contactStep?.65:recoveryStep?-.50:c.attack===0&&distance>(profile.preferredRange??1.03)?1.3:0);
  const moving=!stumbling&&!recovering&&this.combat&&target&&moveSpeed!==0;let desired=forward.clone().multiplyScalar(moving?moveSpeed:0);
  // Balance the pelvis over the actual ankle support line while guarding/getting up.
  // This is a bounded horizontal balance assist, not a translated pose.
  if(!moving){const center=V();for(const i of [8,14]){const foot=c.parts[i].body;center.add(V(0,.09,-.10).applyQuaternion(quat(foot.rotation())).add(vec(foot.translation())));}center.multiplyScalar(.5);const balance=center.sub(p).setY(0).multiplyScalar(3).clampLength(0,.80);desired.add(balance);}
  // Avoid the stone collision volumes before shoulders get wedged against them.
  if(moving)for(const [ox,oz,sx,sy,sz] of this.obstacles||[]){const away=V(p.x-ox,0,p.z-oz),d=away.length(),range=Math.max(sx,sz)+1.05;if(d>0.05&&d<range&&toward.dot(away)<.3){const tangent=V(-away.z,0,away.x).normalize();if(tangent.dot(toward)<0)tangent.negate();desired.addScaledVector(away,(range-d)*1.4/d).addScaledVector(tangent,(range-d)*.9);}}
  // Mild separation avoids pinning allies into an identical steering target.
  for(const other of this.characters){if(other===c||other.hp<=0)continue;const d=p.clone().sub(vec(other.parts[1].body.translation()));d.y=0;const l=d.length(),radius=other.team===c.team?1.70:1.05;if(l>.05&&l<radius)desired.addScaledVector(d,(radius-l)*(other.team===c.team?2.6:1.8)/l);}
  // An encounter may supply actual supported terrain, preserving default arena behavior.
  if(this.inBounds&&moving){const next=p.clone().addScaledVector(desired.clone().setY(0).normalize(),.70),supported=this.inBounds(next.x,next.z)&&(this.terrainHeight||terrainHeight)(next.x,next.z)>-20;if(!supported){desired.x=0;desired.z=0;}}
  const ground=rootGround,targetY=ground+(moving?1.03:1.105)-(stumbling?.10:0)+(moving?.015*Math.sin(this.time*12):0);if((this.inBounds||inArena)(p.x,p.z)&&p.y<ground+2.3){const fy=clamp(c.totalMass*(9.81*.22+(targetY-p.y)*30-vel.y*6),-c.totalMass*6,c.totalMass*(recovering?14:9.81*.40));root.applyImpulse({x:0,y:fy*dt*strength,z:0},true);const drive=desired.sub(V(vel.x,0,vel.z)).multiplyScalar(c.totalMass*(powerClub&&c.attack>=.47&&c.attack<1.05?10:4.5)*dt*strength).clampLength(0,c.totalMass*(powerClub&&c.attack>=.47&&c.attack<1.05?18:8)*dt);root.applyImpulse(drive,true);}
  c.state=stumbling?'stumble':recovering?'recover':c.attack>0?(c.attack<.47?'windup':'swing'):(strength<.9?'recover':moving?'march':'guard');
  c.phase+=dt*(moving?2.1:.55);
  // A new foot trajectory always starts at its current goal, independently of
  // the shared phase retained by the arms. Reversals restart the active foot;
  // uninterrupted movement keeps the original cadence and trajectory rules.
  const footMoveSign=moving?Math.sign(moveSpeed):0;
  if(footMoveSign&&footMoveSign!==c.footMoveSign){
   c.footPhase=Math.floor(c.footMoveSign?c.footPhase:c.phase);c.lastHalf=-1;
  }else if(footMoveSign)c.footPhase+=dt*2.1;
  c.footMoveSign=footMoveSign;
  const half=Math.floor(c.footPhase)%2,progress=c.footPhase%1;
  if(moving&&half!==c.lastHalf){c.lastHalf=half;const f=c.feet[half],side=half===0?-1:1;f.start.copy(f.point);f.end.copy(p).addScaledVector(forward,((contactStep||recoveryStep)?.27:.47)*Math.sign(moveSpeed)).addScaledVector(right,side*.23);f.end.y=surface.height(f.end.x,f.end.z,stepCeiling)+.125;f.swing=true;f.predictiveLanding=!contactStep&&!recoveryStep&&c.attack===0;c.feet[1-half].swing=false;}
  const targets=c.parts.map(b=>facing.clone().multiply(quat(b.bone.quaternion)));
  targets[0]=facing.clone().multiply(Q().setFromAxisAngle(V(1,0,0),moving?.05:0));targets[1]=facing.clone();targets[2]=facing.clone();
  for(let side=0;side<2;side++){const base=side===0?6:12,sign=side===0?-1:1,f=c.feet[side];
   if(moving&&f.swing){
    const approachLanding=f.predictiveLanding&&!contactStep&&!recoveryStep&&c.attack===0;
    if(approachLanding&&progress<.9){
     // Separate bounded sampler keeps all existing support/normal sampling intact.
     const landingSurface=createSurfaceSampler(this.world,RAPIER,this.terrainHeight||terrainHeight,this.colliderOwners);
     f.prediction=predictApproachLanding({foot:f,p,velocity:vel,forward,right,sign,progress,time:this.time,ground,stepCeiling,surface:landingSurface});
    }
    const ease=THREE.MathUtils.smoothstep(progress,0,.9);f.point.copy(f.start).lerp(f.end,ease);f.point.y+=Math.sin(Math.PI*ease)*.27;
    if(approachLanding)f.trajectoryReach=constrainApproachTrajectory(f.point,p,right,sign,targetY);
   }
   else if(!moving){const ideal=p.clone().addScaledVector(right,sign*.24);ideal.y=surface.height(ideal.x,ideal.z,stepCeiling)+.125;f.point.lerp(ideal,dt*4);}
   const hip=p.clone().addScaledVector(right,sign*.20);hip.y=targetY+.02;const ankle=f.point.clone();ankle.y+=.09;const knee=ik(hip,ankle,.4601,.4701,forward);const legFrames=hingeFrames(hip,knee,ankle,right);targets[base]=legFrames[0];targets[base+1]=legFrames[1];const n=surface.normal(f.point.x,f.point.z,stepCeiling);targets[base+2]=Q().setFromUnitVectors(UP,n).multiply(facing);
   const armBase=side===0?3:9,shoulder=p.clone().addScaledVector(right,sign*.43);shoulder.y+=.74;const hand=shoulder.clone().addScaledVector(right,sign*.26);hand.y-=.43;hand.addScaledVector(forward,.22);hand.addScaledVector(forward,Math.sin(c.phase*Math.PI+side*Math.PI)*(moving?.18:.05));
   if(c.attack>0&&side===(c.id%2)){
    const idle=hand.clone(),wind=shoulder.clone().addScaledVector(right,sign*.10).addScaledVector(forward,-.34).addScaledVector(UP,-.10);
    const aim=target?vec(target.parts[0].body.translation()).addScaledVector(right,sign*.035):shoulder.clone().addScaledVector(forward,.9);
    aim.y+=.03;
    if(c.attack<.47)hand.copy(idle).lerp(wind,THREE.MathUtils.smoothstep(c.attack,0,.32));
    else if(c.attack<strikeEnd)hand.copy(wind).lerp(aim,THREE.MathUtils.smoothstep(c.attack,.47,.70));
    else hand.copy(aim).lerp(idle,THREE.MathUtils.smoothstep(c.attack,profile.contactStep?1.02:.79,attackEnd));
   }
   const elbow=ik(shoulder,hand,.4614,.3891,forward.clone().negate().addScaledVector(right,sign*.22));const armFrames=hingeFrames(shoulder,elbow,hand,right);targets[armBase]=armFrames[0];targets[armBase+1]=armFrames[1];targets[armBase+2]=targets[armBase+1].clone();if(c.weapons&&c.attack>0&&side===(c.id%2)){const amount=THREE.MathUtils.smoothstep(c.attack,.38,.69)*(1-THREE.MathUtils.smoothstep(c.attack,profile.contactStep?1.02:.80,attackEnd)),weaponQ=side===0?Q().setFromUnitVectors(UP,forward.clone().addScaledVector(UP,.2).normalize()):facing.clone();targets[armBase+2].slerp(weaponQ,amount);}
  }
  if(c.attack>0&&c.id%2===0){const coil=c.attack<.47?THREE.MathUtils.smoothstep(c.attack,0,.30):1-THREE.MathUtils.smoothstep(c.attack,.47,.65);targets[0].multiply(Q().setFromAxisAngle(UP,-.34*coil));const drive=THREE.MathUtils.smoothstep(c.attack,.47,.66)*(1-THREE.MathUtils.smoothstep(c.attack,1.02,1.30));targets[0].multiply(Q().setFromAxisAngle(V(1,0,0),-.06*coil+.10*drive));targets[1].multiply(Q().setFromAxisAngle(V(1,0,0),.055*drive));}
  if(this.reachableClub!==false)applyReachableClub(c,targets);
  if(this.poseMode==='native')this.nativePose(c,targets,strength,stumbling,dt);else for(let i=0;i<15;i++){c.parts[i].targetQ.copy(targets[i]);const support=stumbling&&[6,7,8,12,13,14].includes(i)?Math.max(.58,strength):strength;this.torque(c.parts[i],targets[i],support,dt);}
 }
 contacts(){
  // Snapshot the command before draining already-integrated contacts. Surviving
  // simultaneous strikes remain valid if an earlier event in this batch stuns
  // their source; source HP is still checked immediately for every event.
  const contactStep=(this.meleeProfile||MELEE_PROFILE).contactStep;
  const strikeReadiness=new Map(this.characters.filter(s=>s.hp>0&&!this.isCharacterHeld(s)&&s.state==='swing'&&s.stun<=0&&!s.needsRecovery&&s.attack>=.47&&s.attack<strikeEndFor(s,contactStep)).map(s=>[s,s.id%2===0?[4,5]:[10,11]]));
  beginCausalContactBatch(this,strikeReadiness);this.playerThrowImpacts.beginBatch();
  let contactError=null;
  this.queue.drainContactForceEvents(e=>{try{const a=this.colliderOwners.get(e.collider1()),b=this.colliderOwners.get(e.collider2());if(!a&&!b)return;const force=e.totalForceMagnitude();
  try{this.onNativeContact?.({a,b,handleA:e.collider1(),handleB:e.collider2(),force,tick:this.tick});}catch(error){this.nativeContactObserverError=String(error?.stack||error);}
  this.playerPalmStrikes?.contact({a,b,handleA:e.collider1(),handleB:e.collider2(),force,tick:this.tick,world:this.world});
  this.playerThrowImpacts.contact({a,b,handleA:e.collider1(),handleB:e.collider2(),force,tick:this.tick,world:this.world});
  // Rebound on significant real external contact, including passive bodies and
  // unowned static scenery. Damage eligibility must not drive kinematic safety.
  // noteContact only queues the next-step rebound, preserving this whole batch.
  if(force>60)for(const [hand,other] of [[a,b],[b,a]]){
   if(hand?.type==='rival'&&hand.rival.striking&&!(other?.type==='rival'&&other.rival===hand.rival))hand.rival.noteContact?.(force);
  }
  for(const [victim,source] of [[a,b],[b,a]]){if(victim?.type!=='character')continue;const c=victim.character;if(c.hp<=0)continue;let damage=0,attacker=null,limbHit=false,approvedStrike=null;const rivalStrike=source?.type==='rival'&&source.rival.striking&&force>60;if(rivalStrike){c.stun=Math.max(c.stun,1.5);c.recover=0;if(c.lastRivalAttack===source.rival.attackId)continue;c.lastRivalAttack=source.rival.attackId;damage=45;}else if(this.time-c.lastHit<.48)continue;
   if(rivalStrike){}else if(source?.type==='character'){const s=source.character;if(s.hp<=0||victim.weapon)continue;
    const bodyHit=[0,1,2].includes(victim.index);limbHit=!bodyHit&&victim.index>=3&&victim.index<15;
    // Bare limbs are hurt bodies. Only the active weapon or actual hand may
    // claim a new limb hit; incidental forearm rubs keep their old core-only rule.
    if(!bodyHit&&(!limbHit||!(source.weapon||[5,11].includes(source.index))))continue;
    const activeParts=strikeReadiness.get(s);
    if(s.team===c.team||s.hit||!activeParts?.includes(source.index))continue;if(force<18)continue;
    const sourceHandle=source===a?e.collider1():e.collider2(),victimHandle=victim===a?e.collider1():e.collider2();
    approvedStrike=evaluateCausalStrike(this,source,victim,{sourceHandle,victimHandle,force,readiness:strikeReadiness});
    // Optional observation cannot suppress HP, recoil, or the rest of a native batch.
    try{this.onSweepDecision?.(approvedStrike,{source,victim,force});}catch(error){this.sweepObserverErrorCount=(this.sweepObserverErrorCount||0)+1;(this.sweepObserverErrors??=[]).push({tick:this.tick,error:String(error?.stack||error)});if(this.sweepObserverErrors.length>16)this.sweepObserverErrors.shift();}
    if(!approvedStrike.approved)continue;
    approvedStrike.critical=earnedCritical(s,approvedStrike);damage=approvedStrike.critical?48:limbHit?12:24;approvedStrike.damage=damage;attacker=s;s.hit=true;}
   else if(source?.type==='rock'&&!source.rock.harmless&&vec(source.rock.body.linvel()).length()>2.5&&force>90){damage=45;}
   else if(!source&&force>580&&vec(c.parts[1].body.linvel()).length()>3.5){damage=30;}
   if(damage){
    // Only a positively authorized current native strike may release authored
    // civilians to dynamics before the existing exactly-once recoil budget.
    if(approvedStrike?.approved)try{this.beforeApprovedStrike?.(approvedStrike);}catch(error){this.approvedStrikeTransitionError=String(error?.stack||error);}
    c.lastHit=this.time;c.hp=Math.max(0,c.hp-damage);c.impacts++;const knockback=approvedStrike?(approvedStrike.kind==='shield'?applyShieldStrike:applySuccessfulStrike)(approvedStrike,{sim:this,dt:this.world.timestep}):null;
    if(knockback?.applied)c.stun=Math.max(c.stun,knockback.stunSeconds);c.stun=Math.max(c.stun,limbHit?.18:rivalStrike?1.5:.45+(damage>=40?.7:0));c.recover=0;this.event('hit',{id:c.id,from:attacker?.id??(source?.type==='rock'?'rock':source?.type==='rival'?'rival':'terrain'),damage,force:+force.toFixed(1),sourceWeapon:!!source?.weapon,sourcePart:source?.index??null,attackerAttack:attacker?.attack??null,...(approvedStrike?{knockback:knockback?{applied:knockback.applied,reason:knockback.reason,totalImpulse:knockback.totalImpulse,deltaSpeed:knockback.deltaSpeed,direction:knockback.direction,grade:knockback.grade}:null,critical:approvedStrike.critical,attackId:approvedStrike.attackId,strikeKind:approvedStrike.kind,sweepSpeed:approvedStrike.ownSweepSpeed,sweepProgress:approvedStrike.progress,closingSpeed:approvedStrike.closingSpeed,contactPoint:approvedStrike.contactPoint.toArray(),motionDirection:approvedStrike.motionDirection.toArray()}: {})});}
  }}catch(error){contactError??=error;}});endCausalContactBatch(this);if(contactError)throw contactError;}
 // Kinematic-vs-fixed pairs have no solver force. Inspect actual Rapier
 // manifolds after the complete force-event batch; never invent a force or
 // turn a positive prediction-distance/proximity pair into damage or recoil.
 staticHandContacts(){
  const seen=new Set();
  for(const owner of this.colliderOwners.values()){
   if(owner.type!=='rival'||seen.has(owner.rival))continue;
   const hand=owner.rival;seen.add(hand);
   if(!hand.striking||hand.disposed||!hand.noteStaticContact)continue;
   let deepest=null;
   for(const collider of hand.colliders){
    if(!collider.isEnabled()||collider.isSensor())continue;
    this.world.contactPairsWith(collider,other=>{
     const body=other.parent();
     if(!other.isEnabled()||other.isSensor()||(body&&!body.isFixed()))return;
     this.world.contactPair(collider,other,manifold=>{
      for(let i=0;i<manifold.numContacts();i++){
       const distance=manifold.contactDist(i);
       if(Number.isFinite(distance)&&distance<=0&&(!deepest||distance<deepest.distance))
        deepest={collider:collider.handle,other:other.handle,distance};
      }
     });
    });
   }
   if(deepest)hand.noteStaticContact(deepest);
  }
 }
 step(dt){if(this.disposed)return;const n=Math.round(dt/(1/120));for(let k=0;k<n;k++){const h=dt/n;this.world.timestep=h;for(const c of this.characters)this.controlCharacter(c,h);for(const g of this.activeGrabs()){const position=vec(g.anchor.translation()),delta=g.target.clone().sub(position),distance=delta.length();if(distance>0)position.addScaledVector(delta,Math.min(1,grabFollowSpeed(g)*h/distance));g.anchor.setNextKinematicTranslation(position);g.age+=h;}
    if(this.beforeStep)this.beforeStep(h);this.playerPalmStrikes?.beforeStep(h);const sweepStep=beginSweepStep(this,h);this.world.step(this.queue,this.physicsHooks);this.time+=h;this.tick++;finishSweepStep(this,sweepStep);this.contacts();this.staticHandContacts();this.playerPalmStrikes?.afterStep();}
 }
 anatomyState(){return this.characters.map(c=>({id:c.id,joints:c.joints.map(entry=>measureAnatomicalJoint({THREE,parts:c.parts,entry}))}));}
 state(){return {time:this.time,tick:this.tick,grab:!!this.grab,xrHeld:[...this.xrGrabs.keys()],characters:this.characters.map(c=>({id:c.id,team:c.team,hp:c.hp,state:c.state,position:Object.values(c.parts[1].body.translation()),speed:vec(c.parts[1].body.linvel()).length(),impacts:c.impacts})),events:this.events.slice(-30),rocks:this.rocks.map(r=>({position:r.body.translation(),radius:r.radius})),bodies:this.world.bodies.len()};}
}
