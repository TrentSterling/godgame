import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import {createSettlementFoodArt} from '../../src/settlement-food-art.js';
import {createQuarryGeology} from '../../src/settlement-quarry-geology.js';
import {batchStaticScenery} from '../../src/static-scenery-batch.js';
const baseline='01d9ec2dd129dc7ae3857cc3d7b54d668af2111e';
const before=async name=>import('data:text/javascript;base64,'+Buffer.from(execFileSync('git',['show',`${baseline}:src/${name}.js`])).toString('base64'));
const oldFood=(await before('settlement-food-art')).createSettlementFoodArt,oldQuarry=(await before('settlement-quarry-geology')).createQuarryGeology;
await R.init();
const worlds=[new R.World({x:0,y:-9.81,z:0}),new R.World({x:0,y:-9.81,z:0})],scenes=[new T.Scene(),new T.Scene()];
const arts=[oldFood,createSettlementFoodArt].map((make,i)=>make({THREE:T,scene:scenes[i],support:(x,z)=>.01*x+.03*z}));
const rocks=[oldQuarry,createQuarryGeology].map((make,i)=>make({THREE:T,RAPIER:R,world:worlds[i],scene:scenes[i],offset:new T.Vector3(2,1,-4)}));
scenes.forEach(s=>s.updateMatrixWorld(true));
let comparedVertices=0,batches=0;
for(const mesh of scenes[1].children.filter(m=>m.userData.staticSceneryBatch)){
 batches++;assert(mesh.geometry.boundingSphere);assert(mesh.geometry.boundingBox);assert(Math.max(...mesh.geometry.boundingBox.getSize(new T.Vector3()).toArray())<6.5,'Authored chunk stays local');assert.equal(mesh.geometry.groups.length,0,'One material is one draw, not merged material groups');
 for(const range of mesh.userData.sources){
  const original=scenes[0].getObjectByName(range.name);assert(original,range.name);
  const geometry=original.geometry.index?original.geometry.toNonIndexed():original.geometry;
  assert.equal(range.count,geometry.attributes.position.count);
  for(let i=0;i<range.count;i++){
   const a=new T.Vector3().fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(original.matrixWorld),b=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,range.start+i).applyMatrix4(mesh.matrixWorld);
   assert(a.distanceTo(b)<2e-6,range.name+' world vertex');
   const na=new T.Vector3().fromBufferAttribute(geometry.attributes.normal,i).applyNormalMatrix(new T.Matrix3().getNormalMatrix(original.matrixWorld)),nb=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal,range.start+i).applyNormalMatrix(new T.Matrix3().getNormalMatrix(mesh.matrixWorld));assert(na.distanceTo(nb)<1e-6);
   for(let axis=0;axis<3;axis++)assert.equal(mesh.geometry.attributes.color.getComponent(range.start+i,axis),geometry.attributes.color.getComponent(i,axis));comparedVertices++;
  }
  assert.equal(mesh.material.roughness,original.material.roughness);assert.equal(mesh.material.flatShading,original.material.flatShading);assert.equal(mesh.castShadow,original.castShadow);assert.equal(mesh.receiveShadow,original.receiveShadow);
  if(geometry!==original.geometry)geometry.dispose();
 }
}
assert.equal(batches,6);assert.deepEqual(Buffer.from(worlds[0].takeSnapshot()),Buffer.from(worlds[1].takeSnapshot()),'Rapier world and collider serialization unchanged');
const count=scene=>{let draws=0,triangles=0;scene.traverseVisible(m=>{if(!m.isMesh)return;draws++;triangles+=Math.min(m.geometry.drawRange.count,m.geometry.index?.count??m.geometry.attributes.position.count)/3;});return{draws,triangles};};
const states=[];
for(const fraction of [1,.8,.5,.2,0]){
 const state={pantry:{food:3,spareStone:2},forageSources:['mainland-forage','island-garden'].map(id=>({id,remaining:fraction*100,reserve:100}))};
 arts.forEach(a=>a.sync(state));const counts=scenes.map(count);assert.equal(counts[0].triangles,counts[1].triangles,'Visible depletion triangles');assert(counts[1].draws<counts[0].draws);
 // Scenery surface queries must retain depletion and foreground occlusion.
 const ray=new T.Raycaster();let queries=0;
 for(const x of [-6.22,-5.5,-4.78,19.665,20.055,20.445,20.835])for(const z of [3.935,4.465,-.87,-.53]){
  ray.set(new T.Vector3(x,10,z),new T.Vector3(0,-1,0));
  const hits=arts.map(a=>ray.intersectObjects(a.scenery.filter(m=>m.visible),false)[0]);assert.equal(!!hits[0],!!hits[1]);if(hits[0])assert(Math.abs(hits[0].distance-hits[1].distance)<2e-6);queries++;
 }
 states.push({fraction,baseline:counts[0],candidate:counts[1],rayQueries:queries});
}
// Disallow accidental opaque/transparent mixing or skinned batches.
const transparent=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({transparent:true}));assert.throws(()=>batchStaticScenery({THREE:T,meshes:[transparent],parent:new T.Scene(),name:'invalid'}));transparent.geometry.dispose();transparent.material.dispose();
arts.forEach(a=>a.dispose());rocks.forEach(a=>a.dispose());assert.equal(scenes[0].children.length,0);assert.equal(scenes[1].children.length,0);worlds.forEach(w=>w.free());
const report={pass:true,batches,comparedVertices,physics:'Byte-identical serialized Rapier worlds',states,scope:'CPU geometry, colors, normals, bounds, visibility/draw-range, surface rays and disposal. Draw counts are scene candidates here, not actual renderer counters.'};fs.mkdirSync(new URL('./generated/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./generated/batching.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
