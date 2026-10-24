import assert from 'node:assert/strict';
import * as T from 'three';
import {createXRRenderBudget} from '../../src/xr-render-budget.js';
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
const scene=new T.Scene(),geometry=new T.BoxGeometry(),map=new T.Texture(),material=new T.MeshStandardMaterial({map,color:'#7c9bab',roughness:.87,metalness:0,side:T.DoubleSide,vertexColors:true,alphaTest:.2});
const mesh=new T.Mesh(geometry,material);scene.add(mesh);
const budget=createXRRenderBudget({scene});let cheap;
check('desktop is untouched; XR reuses original geometry and diffuse assets',()=>{
 assert.equal(budget.beginFrame(false),0);assert.equal(mesh.material,material);
 assert.equal(budget.beginFrame(true),1);cheap=mesh.material;assert(cheap.isMeshLambertMaterial);
 assert.equal(mesh.geometry,geometry);assert.equal(cheap.map,map);assert.equal(cheap.color,material.color);assert.equal(cheap.emissive,material.emissive);
 for(const key of ['side','vertexColors','alphaTest','depthTest','depthWrite','opacity'])assert.equal(cheap[key],material[key]);
 budget.endFrame();assert.equal(mesh.material,material);
});
check('mutable highlights, map replacement, alpha and render flags remain current',()=>{
 material.color.set('#aabbcc');material.emissive.set('#ffeedd');material.emissiveIntensity=.8;
 material.map=new T.Texture();material.alphaMap=new T.Texture();material.depthWrite=false;material.polygonOffset=true;material.polygonOffsetFactor=2;
 const version=cheap.version;budget.beginFrame(true);assert.equal(mesh.material,cheap);
 assert.equal(cheap.map,material.map);assert.equal(cheap.alphaMap,material.alphaMap);assert.equal(cheap.emissiveIntensity,.8);assert.equal(cheap.color.getHexString(),'aabbcc');assert.equal(cheap.depthWrite,false);assert(cheap.version>version);
 budget.endFrame();material.opacity=.4;assert.equal(budget.beginFrame(true),0);assert.equal(mesh.material,material);budget.endFrame();material.opacity=1;
 material.transparent=true;assert.equal(budget.beginFrame(true),0);budget.endFrame();material.transparent=false;
});
check('dynamic palette swaps and material arrays restore the exact original references',()=>{
 const alternate=material.clone(),palette=[new T.MeshBasicMaterial(),material];mesh.material=palette;
 budget.beginFrame(true);const converted=mesh.material;assert.notEqual(converted,palette);assert.equal(converted[0],palette[0]);assert.equal(converted[1],cheap);budget.endFrame();assert.equal(mesh.material,palette);
 palette[0]=alternate;palette[1]=new T.MeshBasicMaterial();budget.beginFrame(true);assert.equal(mesh.material,converted);assert(mesh.material[0].isMeshLambertMaterial);assert.equal(mesh.material[1],palette[1]);budget.endFrame();assert.equal(mesh.material,palette);
 palette.length=1;budget.beginFrame(true);assert.equal(mesh.material.length,1);budget.endFrame();mesh.material=material;
});
check('unsupported materials and custom renderer callbacks are unchanged',()=>{
 for(const replacement of [new T.MeshBasicMaterial(),new T.MeshPhysicalMaterial(),new T.MeshStandardMaterial({metalness:1}),new T.MeshStandardMaterial({roughness:.1}),new T.MeshStandardMaterial({roughnessMap:map}),new T.MeshStandardMaterial({envMap:map})]){
  mesh.material=replacement;assert.equal(budget.beginFrame(true),0);assert.equal(mesh.material,replacement);budget.endFrame();replacement.dispose();
 }
 mesh.material=material;material.onBeforeCompile=()=>{};assert.equal(budget.beginFrame(true),0);budget.endFrame();material.onBeforeCompile=T.Material.prototype.onBeforeCompile;
 material.defines.CUSTOM_FEATURE='';assert.equal(budget.beginFrame(true),0);budget.endFrame();delete material.defines.CUSTOM_FEATURE;
 mesh.onBeforeRender=()=>{};assert.equal(budget.beginFrame(true),0);budget.endFrame();mesh.onBeforeRender=T.Object3D.prototype.onBeforeRender;
 scene.environment=map;assert.equal(budget.beginFrame(true),0);budget.endFrame();scene.environment=null;
});
check('late-added skinned mesh keeps skeleton, attributes, groups, bounds and transforms',()=>{
 const skin=new T.SkinnedMesh(geometry,material),bone=new T.Bone();skin.add(bone);skin.bind(new T.Skeleton([bone]));skin.position.set(1,2,3);scene.add(skin);
 const skeleton=skin.skeleton,matrix=skin.bindMatrix,attributes=geometry.attributes,groups=geometry.groups;
 budget.beginFrame(true);assert.equal(skin.material,cheap);assert.equal(skin.skeleton,skeleton);assert.equal(skin.bindMatrix,matrix);assert.equal(skin.geometry.attributes,attributes);assert.equal(skin.geometry.groups,groups);assert.deepEqual(skin.position.toArray(),[1,2,3]);budget.endFrame();assert.equal(skin.material,material);
 skin.visible=false;budget.beginFrame(true);assert.equal(skin.material,material);budget.endFrame();skin.removeFromParent();
});
check('restoration survives render exceptions and does not clobber callback replacements',()=>{
 try{budget.beginFrame(true);throw Error('synthetic renderer failure');}catch{}finally{budget.endFrame();}
 assert.equal(mesh.material,material);budget.beginFrame(true);const replacement=new T.MeshBasicMaterial();mesh.material=replacement;budget.endFrame();assert.equal(mesh.material,replacement);mesh.material=material;
});
check('warm frames allocate no new materials and disposal owns only variants',()=>{
 budget.beginFrame(true);budget.endFrame();const created=budget.stats().createdMaterials;
 for(let i=0;i<10000;i++){budget.beginFrame(true);assert.equal(mesh.material,cheap);budget.endFrame();}
 assert.equal(budget.stats().createdMaterials,created);
 let sourceDisposals=0,textureDisposals=0,geometryDisposals=0,variantDisposals=0;
 material.addEventListener('dispose',()=>sourceDisposals++);map.addEventListener('dispose',()=>textureDisposals++);geometry.addEventListener('dispose',()=>geometryDisposals++);cheap.addEventListener('dispose',()=>variantDisposals++);
 budget.beginFrame(true);budget.dispose();assert.equal(mesh.material,material);assert.equal(variantDisposals,1);assert.equal(sourceDisposals+textureDisposals+geometryDisposals,0);budget.dispose();assert.equal(variantDisposals,1);assert.equal(budget.beginFrame(true),0);
});
check('disposing an application material releases its cached variant once',()=>{
 const source=new T.MeshStandardMaterial(),object=new T.Mesh(geometry,source),otherScene=new T.Scene();otherScene.add(object);
 const other=createXRRenderBudget({scene:otherScene});other.beginFrame(true);const derived=object.material;other.endFrame();let released=0;derived.addEventListener('dispose',()=>released++);source.dispose();assert.equal(released,1);assert.equal(other.stats().cachedMaterials,0);other.dispose();assert.equal(released,1);
});
console.log(JSON.stringify({pass:true,three:T.REVISION,checks}));
