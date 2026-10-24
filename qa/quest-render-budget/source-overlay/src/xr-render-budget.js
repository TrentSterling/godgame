import * as Three from 'three';

// r160 Lambert keeps the existing diffuse light, atlas, vertex colors and skin
// deformation, but omits the Standard material's GGX specular lighting. It is
// still per-fragment lighting; this is not a geometry LOD or vertex-lit shader.
// Explicit accesses avoid the generic numeric-property loop's boxing allocation
// in V8. Colors, vectors and texture references remain owned by the application.
function syncMaterial(source,target){
 const changed=target.side!==source.side||
  target.vertexColors!==source.vertexColors||
  target.transparent!==source.transparent||
  target.clippingPlanes!==source.clippingPlanes||
  target.clipIntersection!==source.clipIntersection||
  target.precision!==source.precision||
  target.dithering!==source.dithering||
  target.alphaHash!==source.alphaHash||
  target.alphaToCoverage!==source.alphaToCoverage||
  target.premultipliedAlpha!==source.premultipliedAlpha||
  target.toneMapped!==source.toneMapped||
  target.map!==source.map||
  target.lightMap!==source.lightMap||
  target.aoMap!==source.aoMap||
  target.emissiveMap!==source.emissiveMap||
  target.bumpMap!==source.bumpMap||
  target.normalMap!==source.normalMap||
  target.normalMapType!==source.normalMapType||
  target.displacementMap!==source.displacementMap||
  target.alphaMap!==source.alphaMap||
  target.flatShading!==source.flatShading||
  target.fog!==source.fog;
 target.name=source.name;
 target.blending=source.blending;
 target.side=source.side;
 target.vertexColors=source.vertexColors;
 target.opacity=source.opacity;
 target.transparent=source.transparent;
 target.blendSrc=source.blendSrc;
 target.blendDst=source.blendDst;
 target.blendEquation=source.blendEquation;
 target.blendSrcAlpha=source.blendSrcAlpha;
 target.blendDstAlpha=source.blendDstAlpha;
 target.blendEquationAlpha=source.blendEquationAlpha;
 target.blendColor=source.blendColor;
 target.blendAlpha=source.blendAlpha;
 target.depthFunc=source.depthFunc;
 target.depthTest=source.depthTest;
 target.depthWrite=source.depthWrite;
 target.stencilWriteMask=source.stencilWriteMask;
 target.stencilFunc=source.stencilFunc;
 target.stencilRef=source.stencilRef;
 target.stencilFuncMask=source.stencilFuncMask;
 target.stencilFail=source.stencilFail;
 target.stencilZFail=source.stencilZFail;
 target.stencilZPass=source.stencilZPass;
 target.stencilWrite=source.stencilWrite;
 target.clippingPlanes=source.clippingPlanes;
 target.clipIntersection=source.clipIntersection;
 target.clipShadows=source.clipShadows;
 target.shadowSide=source.shadowSide;
 target.colorWrite=source.colorWrite;
 target.precision=source.precision;
 target.polygonOffset=source.polygonOffset;
 target.polygonOffsetFactor=source.polygonOffsetFactor;
 target.polygonOffsetUnits=source.polygonOffsetUnits;
 target.dithering=source.dithering;
 target.alphaTest=source.alphaTest;
 target.alphaHash=source.alphaHash;
 target.alphaToCoverage=source.alphaToCoverage;
 target.premultipliedAlpha=source.premultipliedAlpha;
 target.forceSinglePass=source.forceSinglePass;
 target.visible=source.visible;
 target.toneMapped=source.toneMapped;
 target.color=source.color;
 target.map=source.map;
 target.lightMap=source.lightMap;
 target.lightMapIntensity=source.lightMapIntensity;
 target.aoMap=source.aoMap;
 target.aoMapIntensity=source.aoMapIntensity;
 target.emissive=source.emissive;
 target.emissiveMap=source.emissiveMap;
 target.emissiveIntensity=source.emissiveIntensity;
 target.bumpMap=source.bumpMap;
 target.bumpScale=source.bumpScale;
 target.normalMap=source.normalMap;
 target.normalMapType=source.normalMapType;
 target.normalScale=source.normalScale;
 target.displacementMap=source.displacementMap;
 target.displacementScale=source.displacementScale;
 target.displacementBias=source.displacementBias;
 target.alphaMap=source.alphaMap;
 target.wireframe=source.wireframe;
 target.wireframeLinewidth=source.wireframeLinewidth;
 target.wireframeLinecap=source.wireframeLinecap;
 target.wireframeLinejoin=source.wireframeLinejoin;
 target.flatShading=source.flatShading;
 target.fog=source.fog;
 return changed;
}

/** Call beginFrame(true) immediately before the world render, and endFrame() in
 * finally immediately after it. All application material references are restored
 * before input, physics, picking or UI updates run. Desktop beginFrame(false) is
 * a no-op. Only this owner's cached materials are disposed, never shared assets.
 */
export function createXRRenderBudget({scene,THREE:T=Three}={}){
 if(!scene?.traverseVisible)throw new TypeError('XR render budget needs a scene');
 const variants=new Map(),arrays=new WeakMap(),meshes=[],originals=[],temporary=[];
 let count=0,frame=0,closed=false,created=0,visited=0,converted=0,unique=0;
 function eligible(m){
  if(!(m?.isMeshStandardMaterial===true&&!m.isMeshPhysicalMaterial&&!m.transparent&&m.opacity===1&&
   m.metalness===0&&m.roughness>=.5&&!m.metalnessMap&&!m.roughnessMap&&!m.envMap&&
   m.onBeforeCompile===T.Material.prototype.onBeforeCompile&&
   m.onBeforeRender===T.Material.prototype.onBeforeRender&&
   m.customProgramCacheKey===T.Material.prototype.customProgramCacheKey))return false;
  for(const key in m.defines)if(key!=='STANDARD')return false;
  return true;
 }
 // Keep the disposal closure off the hot lookup path. Capturing its source
 // parameter there would allocate a closure context even on cache hits in V8.
 function createVariant(source){
  const material=new T.MeshLambertMaterial();
  const dispose=()=>{material.dispose();variants.delete(source);source.removeEventListener('dispose',dispose);};
  const record={material,dispose,frame:-1,sourceVersion:-1};variants.set(source,record);
  source.addEventListener('dispose',dispose);created++;return record;
 }
 function variant(source){
  if(!eligible(source))return source;
  const record=variants.get(source)??createVariant(source);
  if(record.frame!==frame){
   const target=record.material,propertiesChanged=syncMaterial(source,target);
   const programChanged=record.sourceVersion!==source.version||propertiesChanged;
   if(programChanged)target.needsUpdate=true;
   record.sourceVersion=source.version;record.frame=frame;unique++;
  }
  return record.material;
 }
 function visit(object){
  visited++;
  if(!object.isMesh||object.onBeforeRender!==T.Object3D.prototype.onBeforeRender||
   object.onAfterRender!==T.Object3D.prototype.onAfterRender)return;
  const original=object.material;let replacement=original;
  if(Array.isArray(original)){
   let cached=arrays.get(original),different=false;
   for(let i=0;i<original.length;i++){
    const material=variant(original[i]);
    if(material!==original[i])different=true;
    if(!cached&&different){cached=original.slice();arrays.set(original,cached);}
    if(cached)cached[i]=material;
   }
   if(cached){cached.length=original.length;if(different)replacement=cached;}
  }else replacement=variant(original);
  if(replacement===original)return;
  meshes[count]=object;originals[count]=original;temporary[count]=replacement;count++;
  object.material=replacement;converted++;
 }
 function endFrame(){
  for(let i=0;i<count;i++){
   // A render callback that deliberately changes its material owns that change.
   if(meshes[i].material===temporary[i])meshes[i].material=originals[i];
  }
  count=0;
 }
 function beginFrame(active){
  endFrame();visited=converted=unique=0;
  if(!active||closed||scene.environment)return 0;
  frame++;scene.traverseVisible(visit);return converted;
 }
 function dispose(){
  if(closed)return;endFrame();closed=true;
  for(const[source,record]of variants){source.removeEventListener('dispose',record.dispose);record.material.dispose();}
  variants.clear();meshes.length=originals.length=temporary.length=0;
 }
 return{beginFrame,endFrame,dispose,stats:()=>({visited,convertedMeshes:converted,convertedMaterials:unique,cachedMaterials:variants.size,createdMaterials:created})};
}
