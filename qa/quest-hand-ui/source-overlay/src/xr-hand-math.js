import * as T from 'three';

export const XR_SCALE = .03; // Metres per existing physics/render unit. Physics is unchanged.
export const JOINT_NAMES = ['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip', ...['index','middle','ring','pinky'].flatMap(n=>[`${n}-finger-metacarpal`,`${n}-finger-phalanx-proximal`,`${n}-finger-phalanx-intermediate`,`${n}-finger-phalanx-distal`,`${n}-finger-tip`])];
export const CHAINS = {
 index:{bones:['index_mcp','index_pip','index_dip'], joints:['index-finger-phalanx-proximal','index-finger-phalanx-intermediate','index-finger-phalanx-distal','index-finger-tip'], lengths:[.48,.34,.28]},
 middle:{bones:['middle_mcp','middle_pip','middle_dip'], joints:['middle-finger-phalanx-proximal','middle-finger-phalanx-intermediate','middle-finger-phalanx-distal','middle-finger-tip'], lengths:[.54,.39,.30]},
 ring:{bones:['ring_mcp','ring_pip','ring_dip'], joints:['ring-finger-phalanx-proximal','ring-finger-phalanx-intermediate','ring-finger-phalanx-distal','ring-finger-tip'], lengths:[.50,.36,.29]},
 pinky:{bones:['pinky_mcp','pinky_pip','pinky_dip'], joints:['pinky-finger-phalanx-proximal','pinky-finger-phalanx-intermediate','pinky-finger-phalanx-distal','pinky-finger-tip'], lengths:[.39,.29,.25]},
 thumb:{bones:['thumb_cmc','thumb_mcp','thumb_ip'], joints:['thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'], lengths:[.34,.43,.345]},
};
const V=()=>new T.Vector3();
// Interaction requires fresh, real wrist + complete thumb/index chains. Other
// joints are visual-only; they are never extrapolated or replaced by a preset.
export const GRIP_JOINT_NAMES = ['wrist','index-finger-metacarpal',...CHAINS.thumb.joints,...CHAINS.index.joints];
export function readHandJoints(frame,source,space,diagnostics=null){
 if(diagnostics)Object.assign(diagnostics,{joints:0,wristPoseValid:false,reason:'hand-api-unavailable'});
 if(!frame?.getJointPose||!source?.hand)return null;
 const points={};
 for(const name of JOINT_NAMES){
  const joint=source.hand.get(name);if(!joint)continue;
  let pose;try{pose=frame.getJointPose(joint,space);}catch{continue;}
  if(!pose||pose.emulatedPosition)continue;
  const p=pose.transform?.position,q=pose.transform?.orientation;
  if(!p||![p.x,p.y,p.z].every(Number.isFinite)||!q||![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w-1)>.05)continue;
  points[name]=new T.Vector3(p.x,p.y,p.z);points[name].jointQuaternion=new T.Quaternion(q.x,q.y,q.z,q.w);
  if(diagnostics){diagnostics.joints++;if(name==='wrist')diagnostics.wristPoseValid=true;}
 }
 if(!GRIP_JOINT_NAMES.every(name=>points[name])){if(diagnostics)diagnostics.reason='missing-grip-joints';return null;}
 // Retain the old segment/roll validity guards for every grip-driving bone.
 for(const chain of [CHAINS.thumb,CHAINS.index])for(let i=0;i<3;i++){
  const start=points[chain.joints[i]],z=points[chain.joints[i+1]].clone().sub(start),length=z.length();
  if(length<.006||length>.13){if(diagnostics)diagnostics.reason='grip-segment-length';return null;}z.normalize();
  const y=new T.Vector3(0,1,0).applyQuaternion(start.jointQuaternion);y.addScaledVector(z,-y.dot(z));if(y.lengthSq()<.05){if(diagnostics)diagnostics.reason='grip-joint-roll';return null;}
 }
 if(diagnostics)diagnostics.reason='valid';
 return points;
}
export function palmFrame(points,side){
 const center=new T.Vector3();for(const name of ['index','middle','ring','pinky'])center.add(points[`${name}-finger-phalanx-proximal`]);center.multiplyScalar(.25);
 const z=center.sub(points.wrist),length=z.length();
 const x=points['pinky-finger-phalanx-proximal'].clone().sub(points['index-finger-phalanx-proximal']);
 if(side==='left')x.negate();
 if(z.length()<.025||x.length()<.025)return null;
 z.normalize();x.addScaledVector(z,-x.dot(z));if(x.length()<.02)return null;x.normalize();
 const y=z.clone().cross(x).normalize();x.copy(y).cross(z).normalize();
 return{x,y,z,length,quaternion:new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)),width:points['index-finger-phalanx-proximal'].distanceTo(points['pinky-finger-phalanx-proximal'])};
}
export function makePlacement(viewerPose,scale=XR_SCALE){
 const q=viewerPose.transform.orientation,p=viewerPose.transform.position;
 const forward=new T.Vector3(0,0,-1).applyQuaternion(new T.Quaternion(q.x,q.y,q.z,q.w));forward.y=0;
 if(forward.lengthSq()<.01)forward.set(0,0,-1);forward.normalize();
 const position=new T.Vector3(p.x,p.y-.42,p.z).addScaledVector(forward,.62);
 const quaternion=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.atan2(-forward.x,-forward.z));
 return{position,quaternion,scale};
}
export function makePinchState(){return{pinched:false,armed:false,last:null,lastWrist:null,stable:0};}
export function updatePinch(state,points,dt){
 if(!points){state.pinched=false;state.armed=false;state.last=null;state.lastWrist=null;state.stable=0;return{lost:true,started:false,ended:false};}
 const point=points['thumb-tip'].clone().add(points['index-finger-tip']).multiplyScalar(.5);
 const gap=points['thumb-tip'].distanceTo(points['index-finger-tip']);
 const jumpLimit=.09+Math.max(0,Math.min(dt,.05))*1.2;
 const jump=(state.last&&point.distanceTo(state.last)>jumpLimit)||(state.lastWrist&&points.wrist&&points.wrist.distanceTo(state.lastWrist)>jumpLimit);
 state.lastWrist=points.wrist?.clone()||null;
 if(jump){state.pinched=false;state.armed=false;state.stable=0;state.last=point;return{lost:true,started:false,ended:false,gap,point};}
 state.last=point;state.stable++;
 // Seeing an open hand after acquisition/loss is mandatory. A resumed pinch never reacquires.
 if(gap>.035&&state.stable>=3)state.armed=true;
 const was=state.pinched;
 if(state.pinched&&gap>.035)state.pinched=false;
 else if(!state.pinched&&state.armed&&gap<.022){state.pinched=true;state.armed=false;}
 return{lost:false,started:!was&&state.pinched,ended:was&&!state.pinched,gap,point,pinched:state.pinched};
}
export function retargetHand(rig,points,spaceToGame){
 if(!JOINT_NAMES.every(name=>points[name]))return false;
 const palm=palmFrame(points,rig.handedness);if(!palm)return false;
 const base=T.MathUtils.clamp(palm.width/1.15,.040,.090),longitudinal=T.MathUtils.clamp(palm.length/1.1575,.035,.095),desired={};
 const origin=points.wrist.clone().addScaledVector(palm.z,.925*longitudinal);
 desired.wrist=new T.Matrix4().compose(origin,palm.quaternion,new T.Vector3(base,base,longitudinal));
 for(const chain of Object.values(CHAINS))for(let i=0;i<3;i++){
  const start=points[chain.joints[i]],end=points[chain.joints[i+1]],z=end.clone().sub(start),length=z.length();
  if(length<.006||length>.13)return false;z.normalize();
  // Preserve dorsal roll while letting the thumb oppose freely. No fabricated hinge angles.
  const tracked=points[chain.joints[i]].jointQuaternion;if(!tracked)return false;
  const y=new T.Vector3(0,1,0).applyQuaternion(tracked);y.addScaledVector(z,-y.dot(z));
  if(y.lengthSq()<.05)return false;y.normalize();const x=y.clone().cross(z).normalize();y.copy(z).cross(x).normalize();
  const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
  desired[chain.bones[i]]=new T.Matrix4().compose(start,q,new T.Vector3(base,base,length/chain.lengths[i]));
 }
 // Explicit matrices retain shear from inverse-parent nonuniform scale. Decomposing here
 // would bend the segment axis and detach fingertips. Mesh art and bind matrices stay intact.
 const converted={};for(const [name,m]of Object.entries(desired))converted[name]=new T.Matrix4().multiplyMatrices(spaceToGame,m);
 rig.group.position.set(0,0,0);rig.group.quaternion.identity();rig.group.scale.setScalar(1);rig.group.updateMatrix();
 for(const bone of rig.bones){const parent=bone.parent?.isBone?converted[bone.parent.name]:null;bone.matrixAutoUpdate=false;bone.matrix.copy(parent?parent.clone().invert().multiply(converted[bone.name]):converted[bone.name]);bone.matrixWorldNeedsUpdate=true;}
 rig.group.updateMatrixWorld(true);rig.skeleton.update();return true;
}
export function restoreHand(rig,snapshot){
 rig.group.position.copy(snapshot.position);rig.group.quaternion.copy(snapshot.quaternion);rig.group.scale.copy(snapshot.scale);
 rig.bones.forEach((b,i)=>{b.matrixAutoUpdate=true;b.position.copy(snapshot.bones[i].position);b.quaternion.copy(snapshot.bones[i].quaternion);b.scale.copy(snapshot.bones[i].scale);});
 rig.applyPose('open');rig.group.visible=false;
}
