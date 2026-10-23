import * as T from 'three';

// Render-only cache. Never returned as an XR pose or used to authorize input.
// r160 keeps eye matrices on a null viewer pose, but can replace them with an
// emulated pose. Retain the last real eye transforms for a bounded interval.
// The browser/compositor still owns frame delivery and may suppress output.
export function createXRViewRetention(renderer,graceMs=160){
 const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),unit=new T.Vector3(1,1,1),eyes=[];
 let lastGood=-Infinity,available=false,mode='lost';
 function reset(){lastGood=-Infinity;available=false;mode='lost';eyes.length=0;}
 function fresh(pose,now){
  position.copy(pose.transform.position);rotation.copy(pose.transform.orientation);matrix.compose(position,rotation,unit);
  lastGood=now;available=true;mode='tracked';
  const cameras=renderer.xr.getCamera()?.cameras??[];
  for(let i=0;i<cameras.length;i++){
   const c=cameras[i];let saved=eyes[i];
   if(!saved)saved=eyes[i]={matrix:new T.Matrix4(),projection:new T.Matrix4(),viewport:new T.Vector4()};
   saved.camera=c;saved.matrix.copy(c.matrix);saved.projection.copy(c.projectionMatrix);if(c.viewport)saved.viewport.copy(c.viewport);
  }
  eyes.length=cameras.length;
 }
 function missing(now){
  available=Number.isFinite(now)&&now>=lastGood&&now-lastGood<=graceMs;mode=available?'held':'lost';
  if(available){
   for(const saved of eyes){const c=saved.camera;c.matrix.copy(saved.matrix);c.matrix.decompose(c.position,c.quaternion,c.scale);c.projectionMatrix.copy(saved.projection);c.projectionMatrixInverse.copy(saved.projection).invert();if(c.viewport)c.viewport.copy(saved.viewport);}
   const xrCamera=renderer.xr.getCamera();if(eyes.length&&xrCamera){xrCamera.matrix.copy(eyes[0].matrix);xrCamera.matrix.decompose(xrCamera.position,xrCamera.quaternion,xrCamera.scale);}
  }
  return available;
 }
 return{fresh,missing,reset,matrix:()=>available?matrix:null,available:()=>available,mode:()=>mode,age:now=>Number.isFinite(lastGood)?Math.max(0,now-lastGood):null};
}
