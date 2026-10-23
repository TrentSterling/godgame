import {batchStaticScenery} from './static-scenery-batch.js';
/** Broad, stepped slate around the retained physical rolling channel. Each
 * authored convex volume is rendered directly from its Rapier collider, so
 * visible terraces and thrown-body side contacts agree without mesh colliders.
 */
export function createQuarryGeology({THREE:T,RAPIER:R,world,scene,offset}){
 const scenery=[],colliders=[],material=new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
 const colors=['#536e79','#718b91','#8ea6a4','#47616e','#b0c1b7'];
 function terrace(id,cx,cz,width,depth,bottom,top,seed){
  const cut=Math.min(width,depth)*.16,outline=[[-width/2+cut,-depth/2],[width/2-cut,-depth/2],[width/2,-depth/2+cut],[width/2,depth/2-cut],[width/2-cut,depth/2],[-width/2+cut,depth/2],[-width/2,depth/2-cut],[-width/2,-depth/2+cut]],points=[];
  for(const y of [bottom,top])for(let i=0;i<outline.length;i++){
   const [x,z]=outline[i],upper=y===top,f=upper?.92:1,dy=upper?((i+seed)%3)*.035:0;
   points.push(cx+x*f+offset.x,y+offset.y+dy,cz+z*f+offset.z);
  }
  const collider=world.createCollider(R.ColliderDesc.convexHull(new Float32Array(points)).setFriction(1.2));colliders.push(collider);
  const vertices=collider.vertices(),indices=collider.indices(),p=[],c=[];
  for(let i=0;i<indices.length;i+=3){
   const a=new T.Vector3().fromArray(vertices,indices[i]*3),b=new T.Vector3().fromArray(vertices,indices[i+1]*3),d=new T.Vector3().fromArray(vertices,indices[i+2]*3),normal=b.clone().sub(a).cross(d.clone().sub(a)).normalize();
   const color=new T.Color(normal.y>.45?colors[2]:colors[(i/3+seed)%2]);if(normal.z>.4)color.lerp(new T.Color(colors[3]),.17);
   for(const v of [a,b,d]){p.push(v.x,v.y,v.z);c.push(color.r,color.g,color.b);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setAttribute('color',new T.Float32BufferAttribute(c,3));geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,material);mesh.name='quarry_geology_'+id;mesh.castShadow=mesh.receiveShadow=true;mesh.userData={colliderHandle:collider.handle,physicalGeology:true};scene.add(mesh);scenery.push(mesh);
 }
 // All dimensions below are local to the original quarry anchor. Its central
 // x=2.5 +/-1.175 rolling channel and front brace/delivery lane stay clear.
 terrace('left-foot',-.90,-8.5,3.8,5.2,.01,.78,0);
 terrace('left-shelf',-.75,-9.2,3.8,3.8,.65,1.66,1);
 terrace('left-crown',-.45,-9.8,3.35,2.55,1.54,2.74,2);
 terrace('left-crest',-.28,-10.20,2.45,1.52,2.6,3.48,3);
 terrace('back-cut',2.1,-10.83,4.0,.95,.02,3.17,4);
 terrace('right-foot',4.83,-9.40,2.75,2.50,.02,.80,5);
 terrace('right-shelf',4.79,-9.70,2.48,1.86,.68,1.73,6);
 terrace('right-crown',4.64,-10.04,2.02,1.23,1.62,2.67,7);
 // Separate left, back and right chunks keep the rolling channel and local
 // culling intact. Colliders retain their original individual convex volumes.
 const original=scenery.splice(0);
 for(const [name,parts]of [['left',original.slice(0,4)],['back',original.slice(4,5)],['right',original.slice(5)]]){
  if(parts.length===1){scenery.push(parts[0]);continue;}
  scenery.push(batchStaticScenery({THREE:T,meshes:parts,parent:scene,name:'quarry_geology_'+name+'_batch'}));
  for(const mesh of parts)mesh.geometry.dispose();
 }
 return{scenery,colliders,dispose(){for(const c of colliders)if(c.isValid())world.removeCollider(c,true);for(const m of scenery){m.removeFromParent();m.geometry.dispose();}material.dispose();}};
}
