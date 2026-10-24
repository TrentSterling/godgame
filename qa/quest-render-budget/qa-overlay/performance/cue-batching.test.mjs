import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';
import {createSettlementWorldCues} from '../../src/settlement-world-cues.js';
const baseline='be71df7671bf82038f326b64e70b06f98ac30711';
fs.mkdirSync(new URL('./generated/',import.meta.url),{recursive:true});
await build({stdin:{contents:execFileSync('git',['show',baseline+':src/settlement-world-cues.js'],{encoding:'utf8'}),resolveDir:fileURLToPath(new URL('../../src/',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',outfile:fileURLToPath(new URL('./generated/cue-baseline.mjs',import.meta.url))});
const before=(await import('./generated/cue-baseline.mjs')).createSettlementWorldCues;
const sites=['brace','bridge','garden-upgrade','defense'].map((id,i)=>({id,position:{x:i*4,y:0,z:0}}));
const options={support:(x,z)=>x*.01+z*.02,sites,quarry:{x:0,z:5},pantry:{x:4,z:5},forageSources:[{id:'mainland-garden',x:8,z:5},{id:'island-garden',x:12,z:5}]};
const scenes=[new T.Scene(),new T.Scene()],b=before({...options,scene:scenes[0]});
const disposed=new Map(),dispose=T.BufferGeometry.prototype.dispose;
T.BufferGeometry.prototype.dispose=function(){disposed.set(this,(disposed.get(this)||0)+1);return dispose.call(this);};
let c;try{c=createSettlementWorldCues({...options,scene:scenes[1]});}finally{T.BufferGeometry.prototype.dispose=dispose;}
assert.equal(disposed.size,118,'59 merged sources plus 59 temporary copies disposed');for(const n of disposed.values())assert.equal(n,1);
const groups=[];let vertices=0,normals=0,sourceDraws=0,batchDraws=0,rays=0,cullingChecks=0;
for(let i=0;i<b.controls.length;i++){
 const old=b.controls[i],next=c.controls[i];assert.equal(next.id,old.id);assert.equal(next.meshes.length,1);assert.equal(next.meshes[0].name,old.meshes[0].name);
 const icon=next.billboard.getObjectByName(next.id+'_control_icon'),originalIcons=old.billboard.children.filter(o=>o.isMesh&&o.material===old.ink);
 const bracket=next.brackets.children[0];assert.equal(next.brackets.children.length,1);
 groups.push([originalIcons,icon],[old.brackets.children,bracket]);
}
for(const [originals,batch]of groups){
 sourceDraws+=originals.length;batchDraws++;assert(batch.userData.staticSceneryBatch);assert.equal(batch.geometry.groups.length,0);
 assert.equal(batch.material.type,originals[0].material.type);assert.equal(batch.material.depthTest,true);assert.equal(batch.material.depthWrite,true);assert.equal(batch.material.side,originals[0].material.side);
 assert(batch.geometry.boundingSphere.radius<1,'Each merged decoration stays within its own sign/ground ring');
}
const states=[{}, {hoveredControl:'bridge'}, {selected:'garden-upgrade'}, {selectedWorker:{id:'worker',position:{x:0,y:0,z:0}}},
 {heldWorker:{id:'worker'},placementPreview:{siteId:'quarry',valid:true,radius:2.3},placementAssessment:{ready:true,position:{x:0,y:0,z:5}}},
 {needCue:{reveal:true,need:{siteId:'brace',text:'BUILD THIS'}}}, {foodDestination:{siteId:'stockpile'}}, {defenseConstruction:{complete:true},hoveredControl:'defense'}];
const counts=[];
for(const input of states){
 const camera=new T.PerspectiveCamera();camera.rotation.set(.2,.6,-.1);b.update({...input,camera});c.update({...input,camera});assert.deepEqual(c.state(),b.state());
 const count=scene=>{let n=0;scene.traverseVisible(o=>{if(o.isMesh)n++;});return n;};counts.push({baseline:count(scenes[0]),candidate:count(scenes[1])});
 for(const [scale,yaw]of [[1,0],[.03,.7],[.045,-1.1]]){
  for(const scene of scenes){scene.position.set(.3,1,-.8);scene.scale.setScalar(scale);scene.rotation.y=yaw;scene.updateMatrixWorld(true);}
  for(const [sources,batch]of groups){
   let offset=0;
   for(const source of sources){
    const g=source.geometry.index?source.geometry.toNonIndexed():source.geometry;
    const sourceNormal=new T.Matrix3().getNormalMatrix(source.matrixWorld),batchNormal=new T.Matrix3().getNormalMatrix(batch.matrixWorld);
    for(let i=0;i<g.attributes.position.count;i++){
     const x=new T.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(source.matrixWorld),y=new T.Vector3().fromBufferAttribute(batch.geometry.attributes.position,offset+i).applyMatrix4(batch.matrixWorld);
     assert(x.distanceTo(y)<3e-6,'Same transformed decorative vertex');vertices++;
     const n=new T.Vector3().fromBufferAttribute(g.attributes.normal,i).applyNormalMatrix(sourceNormal),m=new T.Vector3().fromBufferAttribute(batch.geometry.attributes.normal,offset+i).applyNormalMatrix(batchNormal);
     assert(n.distanceTo(m)<3e-6);normals++;
     for(let axis=0;axis<2;axis++)assert.equal(g.attributes.uv.getComponent(i,axis),batch.geometry.attributes.uv.getComponent(offset+i,axis));
    }
    offset+=g.attributes.position.count;if(g!==source.geometry)g.dispose();
   }
   assert.equal(offset,batch.geometry.attributes.position.count);
  }
  for(let i=0;i<c.controls.length;i++)for(const x of [-.3,0,.3])for(const y of [-.2,0,.2]){
   const hits=[b,c].map(cues=>{const plate=cues.controls[i].plate,start=plate.localToWorld(new T.Vector3(x,y,.3)),end=plate.localToWorld(new T.Vector3(x,y,-1));return new T.Raycaster(start,end.sub(start).normalize(),0,100).intersectObjects(cues.hitMeshes,false)[0];});
   assert.equal(hits[0]?.object.name,hits[1]?.object.name);assert(hits[0]&&hits[1]);assert(hits[0].point.distanceTo(hits[1].point)<3e-6);rays++;
  }
 }
}
for(const [,batch]of groups){
 for(let i=0;i<24;i++){
  const center=batch.getWorldPosition(new T.Vector3()),camera=new T.PerspectiveCamera(20,1,.001,10);camera.position.copy(center).add(new T.Vector3(Math.cos(i),.4,Math.sin(i)).multiplyScalar(.15));camera.lookAt(center);camera.updateMatrixWorld(true);
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(let j=0;j<batch.geometry.attributes.position.count;j++){const p=new T.Vector3().fromBufferAttribute(batch.geometry.attributes.position,j).applyMatrix4(batch.matrixWorld);if(frustum.containsPoint(p))assert(frustum.intersectsObject(batch));}cullingChecks++;
 }
}
const live=new Set();c.group.traverse(o=>{if(o.isMesh)live.add(o.geometry);});let releases=0;for(const g of live)g.addEventListener('dispose',()=>releases++);c.dispose();assert.equal(releases,live.size);assert.equal(c.group.parent,null);assert.equal(c.hitMeshes.length,0);b.dispose();
const report={pass:true,baseline,controls:8,vertices,normals,rays,cullingChecks,sourceDrawCandidates:sourceDraws,batchedDrawCandidates:batchDraws,sourceAndTemporaryGeometriesDisposed:disposed.size,stateDrawCandidates:counts,scope:'CPU geometry, world transforms, normals/UVs, state/labels/materials, exact button rays, local culling and disposal. Scene counts are not renderer counts or Quest measurements.'};
fs.writeFileSync(new URL('./generated/cue-batching.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
