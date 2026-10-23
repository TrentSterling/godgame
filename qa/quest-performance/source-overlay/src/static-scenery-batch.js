import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Explicit small authored groups only. The caller owns the source geometries;
// shared geometry and all physics/collider objects remain untouched.
export function batchStaticScenery({THREE:T,meshes,parent,name}){
 if(!meshes.length)throw new TypeError('A static batch needs meshes');
 const first=meshes[0],material=first.material;
 if(Array.isArray(material)||material.transparent||material.opacity!==1)throw new TypeError('Only one opaque material per batch');
 parent.updateWorldMatrix(true,false);
 const inverse=new T.Matrix4().copy(parent.matrixWorld).invert(),copies=[],ranges=[];
 let count=0;
 try{
  for(const mesh of meshes){
   if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh||mesh.material!==material||mesh.castShadow!==first.castShadow||mesh.receiveShadow!==first.receiveShadow||mesh.layers.mask!==first.layers.mask||mesh.renderOrder!==first.renderOrder||Object.keys(mesh.geometry.morphAttributes).length)throw new TypeError('Incompatible static scenery');
   mesh.updateWorldMatrix(true,false);
   const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
   geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));
   copies.push(geometry);ranges.push({name:mesh.name,start:count,count:geometry.attributes.position.count});count+=geometry.attributes.position.count;
  }
  const geometry=mergeGeometries(copies,false);if(!geometry)throw new Error('Static geometry attributes do not match');
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.layers.mask=first.layers.mask;mesh.renderOrder=first.renderOrder;
  mesh.userData={staticSceneryBatch:true,sources:ranges};parent.add(mesh);
  for(const source of meshes)source.removeFromParent();
  return mesh;
 }finally{for(const geometry of copies)geometry.dispose();}
}
