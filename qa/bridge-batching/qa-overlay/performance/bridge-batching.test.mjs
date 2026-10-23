import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import {createSettlementWorld} from '../../src/settlement-world.js';
import {createVisibleSurfacePicker} from '../../src/visible-surface-picker.js';
const baseline='c845caddaa7a7c1d9da9124503b110fe2383af75';
fs.mkdirSync(new URL('./generated/',import.meta.url),{recursive:true});
const source=execFileSync('git',['show',`${baseline}:src/settlement-world.js`],{encoding:'utf8'});
await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../../src/',import.meta.url)),sourcefile:'baseline-world.js'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:fileURLToPath(new URL('./generated/baseline-world.mjs',import.meta.url))});
const oldWorld=(await import('./generated/baseline-world.mjs')).createSettlementWorld;
await R.init();
const scenes=[new T.Scene(),new T.Scene()],worlds=[new R.World({x:0,y:-9.81,z:0}),new R.World({x:0,y:-9.81,z:0})];
const disposedBars=[],dispose=T.BufferGeometry.prototype.dispose;
T.BufferGeometry.prototype.dispose=function(){if(this.type==='BoxGeometry'&&this.parameters.height===.035)disposedBars.push(this);return dispose.call(this);};
let arts;
try{arts=[oldWorld,createSettlementWorld].map((make,i)=>make(scenes[i],worlds[i],R));}finally{T.BufferGeometry.prototype.dispose=dispose;}
assert.equal(new Set(disposedBars).size,20,'Every temporary source bar geometry is released exactly once');assert.equal(disposedBars.length,20);
const materialSettings=m=>({type:m.type,color:m.color.toArray(),side:m.side,transparent:m.transparent,opacity:m.opacity,depthTest:m.depthTest,depthWrite:m.depthWrite,toneMapped:m.toneMapped,visible:m.visible});
const pickers=arts.map((art,i)=>createVisibleSurfacePicker({THREE:T,scene:scenes[i],visuals:[],rockVisuals:[],rocks:[],scenery:art.scenery,rival:null}));
let vertices=0,rays=0,cullingChecks=0;const bounds=[];
for(const [i,entry]of arts[1].bridge.entries()){
 const batch=entry.outline.children[0],bars=arts[0].bridge[i].outline.children;
 assert.equal(entry.outline.children.length,1);assert.equal(bars.length,4);assert.equal(batch.name,'bridge_plan_'+i);assert(arts[1].scenery.includes(batch));assert(batch.userData.staticSceneryBatch);assert.equal(batch.geometry.groups.length,0);assert.deepEqual(materialSettings(batch.material),materialSettings(bars[0].material));assert.equal(batch.castShadow,bars[0].castShadow);assert.equal(batch.receiveShadow,bars[0].receiveShadow);
 assert.equal(batch.geometry.attributes.position.count,144);assert.equal(batch.layers.mask,bars[0].layers.mask);
 const box=batch.geometry.boundingBox,size=box.getSize(new T.Vector3());assert(size.x<1.12&&size.y<.036&&size.z<3.58);bounds.push(size.toArray());
 scenes.forEach(s=>s.updateMatrixWorld(true));
 const union=new T.Box3();bars.forEach(b=>union.union(new T.Box3().setFromObject(b,true)));assert(union.min.distanceTo(box.min)<2e-6);assert(union.max.distanceTo(box.max)<2e-6);
 for(const [barIndex,bar]of bars.entries()){
  const geometry=bar.geometry.toNonIndexed();
  for(let j=0;j<geometry.attributes.position.count;j++){
   const index=barIndex*36+j,a=new T.Vector3().fromBufferAttribute(geometry.attributes.position,j).applyMatrix4(bar.matrixWorld),b=new T.Vector3().fromBufferAttribute(batch.geometry.attributes.position,index);
   assert(a.distanceTo(b)<2e-6,'Original world position');assert(batch.geometry.boundingSphere.containsPoint(b));
   for(const name of ['normal','uv'])for(let axis=0;axis<geometry.attributes[name].itemSize;axis++)assert.equal(geometry.attributes[name].getComponent(j,axis),batch.geometry.attributes[name].getComponent(index,axis));vertices++;
  }
  geometry.dispose();
 }
 // The batch can never cull a bar that the original frustum would include.
 for(let n=0;n<24;n++){
  const camera=new T.PerspectiveCamera(18,1,.01,20),x=13.25+i*1.15;camera.position.set(x+Math.cos(n)*4,2,-2+Math.sin(n)*4);camera.lookAt(x,.18,-2);camera.updateMatrixWorld(true);
  const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));if(bars.some(b=>frustum.intersectsObject(b)))assert(frustum.intersectsObject(batch));cullingChecks++;
 }
 // A distant section stays independently culled.
 const camera=new T.PerspectiveCamera(5,1,.01,10);camera.position.set(13.25+i*1.15,3,-2);camera.lookAt(13.25+i*1.15,0,-2);camera.updateMatrixWorld(true);const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 assert(frustum.intersectsObject(batch));const far=arts[1].bridge[(i+3)%5].outline.children[0];assert(!frustum.intersectsObject(far));cullingChecks++;
}
assert.equal(new Set(arts[0].bridge.flatMap(b=>b.outline.children.map(m=>m.material))).size,20);
assert.equal(new Set(arts[1].bridge.map(b=>b.outline.children[0].material)).size,1);
const transforms=[{position:[0,0,0],scale:1,yaw:0},{position:[.3,1.04,-.8],scale:.03,yaw:.73},{position:[-2,1.2,3],scale:.045,yaw:-1.19}];
const states=[];
for(const delivered of [0,1,2,3,4,5,5,3,0]){
 arts.forEach(a=>a.update(delivered));assert.deepEqual(Buffer.from(worlds[0].takeSnapshot()),Buffer.from(worlds[1].takeSnapshot()),'All native colliders and world bytes unchanged');
 assert.equal(arts[0].complete,arts[1].complete);assert.deepEqual(arts[0].groundColliders,arts[1].groundColliders);
 for(let i=0;i<5;i++){assert.equal(arts[0].bridge[i].outline.visible,arts[1].bridge[i].outline.visible);assert.equal(arts[0].bridge[i].mesh.visible,arts[1].bridge[i].mesh.visible);assert.equal(arts[0].bridge[i].collider?.handle,arts[1].bridge[i].collider?.handle);}
 for(const transform of transforms){
  scenes.forEach(s=>{s.position.fromArray(transform.position);s.scale.setScalar(transform.scale);s.rotation.y=transform.yaw;s.updateMatrixWorld(true);});
  for(let i=0;i<5;i++)for(const [dx,dz]of [[0,-1.77],[0,1.77],[-.54,0],[.54,0],[0,0],[-.3,-1.77],[.3,1.77]]){
   const results=pickers.map((picker,index)=>{const s=scenes[index],a=new T.Vector3(13.25+i*1.15+dx,2,-2+dz).applyMatrix4(s.matrixWorld),b=new T.Vector3(13.25+i*1.15+dx,-2,-2+dz).applyMatrix4(s.matrixWorld);picker.pick(new T.Raycaster(a,b.sub(a).normalize(),0,100));return picker.state();});
   assert.equal(results[0].kind,results[1].kind);assert.equal(results[0].mesh,results[1].mesh,'Scenery occlusion identity preserved');assert.equal(results[0].selected,results[1].selected);if(results[0].surface)assert(new T.Vector3(...results[0].surface).distanceTo(new T.Vector3(...results[1].surface))<3e-5,'Surface ray position after XR placement');rays++;
  }
 }
 states.push({delivered,complete:arts[1].complete,visiblePlans:arts[1].bridge.filter(b=>b.outline.visible).length});
}
pickers.forEach(p=>p.dispose());worlds.forEach(w=>w.free());
const report={pass:true,baseline,vertices,rays,cullingChecks,bounds,sourceGeometriesDisposed:20,planMaterials:{before:20,after:1},physics:'Byte-identical native Rapier snapshots across nine construction/update cases',states,scope:'CPU world geometry, material/shadow properties, separate section culling, XR-transformed surface picking and native collider lifecycle'};
fs.writeFileSync(new URL('./generated/bridge-batching.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
