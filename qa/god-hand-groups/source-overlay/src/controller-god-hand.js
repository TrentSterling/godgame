import * as T from 'three';

export const CONTROLLER_HAND_METRES_PER_UNIT=.055;
export const CONTROLLER_HAND_GRIP_CENTER=Object.freeze([0,-.22,.05]);
const amount=value=>Number.isFinite(value)?T.MathUtils.clamp(value,0,1):0;

// Analog values drive visual curl; event-only/digital controllers still have a
// useful pose. This is presentation data, never inferred finger tracking.
export function controllerFingerAmount(button,eventHeld=false){
 const analog=amount(button?.value);
 return analog>0?analog:button?.pressed||eventHeld?1:0;
}

/** Reuses an existing rig. Construct once, before either input source animates
 * it. The caller owns input selection, tracking retention, ray and interaction.
 * Call releaseToTracking() before retargetHand writes fresh hand-joint matrices.
 * No mesh, material, texture, collider, input source or ray is created here. */
export function createControllerGodHand(rig){
 if(!rig?.bones?.length||!rig.group||!rig.applyPose||!rig.skeleton)throw TypeError('An existing articulated god hand rig is required');
 if(!['left','right'].includes(rig.handedness))throw RangeError('Controller hand must have left or right handedness');
 const group=rig.group,rest=rig.bones.map(b=>({position:b.position.clone(),scale:b.scale.clone()}));
 const poses={};
 for(const name of ['open','point','pinch','fist']){rig.applyPose(name);poses[name]=rig.bones.map(b=>b.quaternion.clone());}
 rig.applyPose('open');
 const position=new T.Vector3(),rotation=new T.Quaternion(),one=new T.Vector3(1,1,1),blend=new T.Quaternion(),grip=new T.Matrix4();
 // Authored grip-space orientation: fingers extend opposite the arm (+Y in
 // WebXR grip space); the dorsal face points +X for right and -X for left.
 // Hand art remains properly mirrored; never use a negative scene scale.
 const side=rig.handedness==='right'?1:-1;
 const handToGrip=new T.Matrix4().makeBasis(new T.Vector3(0,0,-side),new T.Vector3(side,0,0),new T.Vector3(0,-1,0));
 handToGrip.scale(new T.Vector3().setScalar(CONTROLLER_HAND_METRES_PER_UNIT));
 position.fromArray(CONTROLLER_HAND_GRIP_CENTER).applyMatrix4(handToGrip).negate();handToGrip.setPosition(position);
 let ownsPose=false,valid=false,trigger=0,squeeze=0;
 function enter(){
  if(ownsPose)return;
  // retargetHand intentionally leaves matrixAutoUpdate=false on all bones.
  // Restore authored local translations/scales before using quaternion poses.
  rig.bones.forEach((b,i)=>{b.matrixAutoUpdate=true;b.position.copy(rest[i].position);b.scale.copy(rest[i].scale);});
  ownsPose=true;group.matrixAutoUpdate=false;
 }
 function update(pose,spaceToGame,inputs={}){
  const p=pose?.transform?.position,q=pose?.transform?.orientation,m=spaceToGame?.elements;
  valid=!!p&&!!q&&!pose.emulatedPosition&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)&&Number.isFinite(q.x)&&Number.isFinite(q.y)&&Number.isFinite(q.z)&&Number.isFinite(q.w)&&Math.abs(q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w-1)<.05&&m?.length===16;
  if(valid)for(let i=0;i<16;i++)if(!Number.isFinite(m[i])){valid=false;break;}
  if(valid&&Math.abs(spaceToGame.determinant())<1e-12)valid=false;
  if(!valid){group.visible=false;return false;}
  enter();trigger=amount(inputs.trigger);squeeze=amount(inputs.squeeze);
  for(let i=0;i<rig.bones.length;i++){
   blend.copy(poses.point[i]).slerp(poses.fist[i],trigger);
   rig.bones[i].quaternion.copy(poses.open[i]).slerp(poses.pinch[i],trigger).slerp(blend,squeeze);
  }
  position.copy(p);rotation.copy(q).normalize();grip.compose(position,rotation,one);
  // Preserve the full inverse scene matrix, including nonuniform scale/shear.
  group.matrix.copy(spaceToGame).multiply(grip).multiply(handToGrip);group.matrixWorldNeedsUpdate=true;group.visible=true;group.updateMatrixWorld(true);rig.skeleton.update();
  return true;
 }
 function releaseToTracking(){
  ownsPose=false;valid=false;trigger=squeeze=0;group.visible=false;group.matrixAutoUpdate=true;group.position.set(0,0,0);group.quaternion.identity();group.scale.setScalar(1);group.updateMatrix();
 }
 group.visible=false;
 return{update,releaseToTracking,isControllerPosed:()=>ownsPose,state:()=>({mode:ownsPose?'controller-posed':'unassigned',poseValid:valid,handTracking:false,visible:group.visible,trigger,squeeze})};
}
