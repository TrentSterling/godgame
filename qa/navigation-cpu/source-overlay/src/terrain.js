import * as THREE from 'three';
import {markTerrainCollider} from './surface-support.js';
let arenaScale=1,cache=null;
const N=96,M=32,RX=13.25,RZ=9.9;
export function configureArenaScale(scale=1){if(!Number.isFinite(scale)||scale<1||scale>2)throw new Error('Arena scale must be finite,1..2');arenaScale=scale;cache=null;}
export function getArenaScale(){return arenaScale;}
function authoredHeight(x,z){
 x/=arenaScale;z/=arenaScale;
 const back=THREE.MathUtils.smoothstep(z,-1,4.8)*THREE.MathUtils.smoothstep(Math.abs(x),1.6,4.8)*1.45;
 const hummock=.32*Math.exp(-((x+5)**2+(z+1)**2)/7)+.19*Math.exp(-((x-4)**2+(z+3)**2)/4);
 return back+hummock+.045*Math.sin(x*.8)*Math.cos(z*.9);
}
// One source of truth: the same scalloped polygon, radial triangulation and
// Float32 vertex heights drive rendering, collision, bounds and support.
export function getArenaSurface(){
 if(cache)return cache;
 const vertices=[0,authoredHeight(0,0),0],indices=[],boundary=[];
 for(let i=0;i<N;i++){const a=i/N*Math.PI*2,r=1+.095*Math.cos(a*3+.6)+.048*Math.sin(a*5-.9)+.022*Math.cos(a*11);boundary.push([Math.cos(a)*RX*r*arenaScale,Math.sin(a)*RZ*r*arenaScale]);}
 for(let j=1;j<=M;j++)for(let i=0;i<N;i++){const [bx,bz]=boundary[i],x=bx*j/M,z=bz*j/M;vertices.push(x,authoredHeight(x,z),z);}
 for(let i=0;i<N;i++)indices.push(0,1+(i+1)%N,1+i);
 for(let j=1;j<M;j++)for(let i=0;i<N;i++){const a=1+(j-1)*N+i,b=1+(j-1)*N+(i+1)%N,c=1+j*N+i,d=1+j*N+(i+1)%N;indices.push(a,b,c,b,d,c);}
 const v=new Float32Array(vertices),idx=new Uint32Array(indices);
 cache={vertices:v,indices:idx,boundary:boundary.map((_,i)=>[v[(1+(M-1)*N+i)*3],v[(1+(M-1)*N+i)*3+2]]),sectors:N,rings:M};
 cache.halfExtents=[Math.max(...cache.boundary.map(p=>Math.abs(p[0]))),Math.max(...cache.boundary.map(p=>Math.abs(p[1])))];return cache;
}
function locate(x,z){
 const d=getArenaSurface();if(Math.abs(x)+Math.abs(z)<1e-9)return 0;
 let a=Math.atan2(z/RZ,x/RX);if(a<0)a+=Math.PI*2;const i=Math.min(N-1,Math.floor(a/(Math.PI*2)*N)),p=d.boundary[i],q=d.boundary[(i+1)%N];
 const dx=q[0]-p[0],dz=q[1]-p[1],den=x*dz-z*dx;
 const edgeRatio=(p[0]*dz-p[1]*dx)/den,t=1/edgeRatio;
 // Encode the same sector/ring in a scalar. Navigation samples this immutable
 // surface many times per step; no point, closure or result object is needed.
 return t<=1+1e-8&&t>=0?i*M+Math.max(1,Math.min(M,Math.ceil(t*M)))-1:-1;
}
export function inArena(x,z){return Number.isFinite(x+z)&&locate(x,z)>=0;}
function triangleHeight(v,x,z,a,b,c,checkInside=false){
 const ax=v[a*3],az=v[a*3+2],bx=v[b*3],bz=v[b*3+2],cx=v[c*3],cz=v[c*3+2],den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),wa=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,wb=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den;
 const y=wa*v[a*3+1]+wb*v[b*3+1]+(1-wa-wb)*v[c*3+1];
 return checkInside&&!(wa>=-1e-6&&wb>=-1e-6&&wa+wb<=1+1e-6)?null:y;
}
export function terrainHeight(x,z){
 if(!Number.isFinite(x+z))return 0;const d=getArenaSurface(),cell=locate(x,z);
 // Outside the visible island there is genuinely no supported floor. A finite
 // abyss fallback prevents NaNs in existing controllers without inventing land.
 if(cell<0)return -50;
 const v=d.vertices,i=Math.floor(cell/M),j=cell%M+1;if(j===1)return triangleHeight(v,x,z,0,1+(i+1)%N,1+i);
 const a=1+(j-2)*N+i,b=1+(j-2)*N+(i+1)%N,c=1+(j-1)*N+i,e=1+(j-1)*N+(i+1)%N,y=triangleHeight(v,x,z,a,b,c,true);return y===null?triangleHeight(v,x,z,b,e,c):y;
}
export function makeArena(scene,world,R){
 const d=getArenaSurface(),g=new THREE.BufferGeometry(),colors=[];
 for(let i=0;i<d.vertices.length;i+=3){const c=new THREE.Color('#abb6ba').lerp(new THREE.Color('#81968b'),THREE.MathUtils.smoothstep(d.vertices[i+1],.2,1.2)*.4);colors.push(c.r,c.g,c.b);}
 g.setAttribute('position',new THREE.BufferAttribute(d.vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(new THREE.BufferAttribute(d.indices,1));g.computeVertexNormals();
 const floor=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));floor.name='floating_arena_exact_walkable_surface';floor.receiveShadow=true;scene.add(floor);
 const floorCollider=markTerrainCollider(world.createCollider(R.ColliderDesc.trimesh(d.vertices,d.indices).setFriction(.9)));
 // Broken, tapering strata. These rendered cliff triangles are also the exact
 // collidable side mesh; they introduce no hidden wall or under-island floor.
 const wp=[],wc=[],uv=[],shades=['#6d818d','#586f7d','#425c6b','#354d5e'];
 for(let i=0;i<N;i++){const p=d.boundary[i],q=d.boundary[(i+1)%N];for(let layer=0;layer<4;layer++){
  const point=(p,k,n)=>{n%=N;const a=n/N*Math.PI*2,f=[1,.96,.82,.61,.28][k]+(k?.04*Math.sin(n*1.67+k):0),drop=[0,.85,2.7,4.9,7.1][k]+(k?.33*Math.sin(n*.73+k):0);return new THREE.Vector3(p[0]*f,authoredHeight(...p)-drop,p[1]*f);};
  const pts=[point(p,layer,i),point(q,layer,i+1),point(p,layer+1,i),point(q,layer+1,i+1)],color=new THREE.Color(shades[layer]).multiplyScalar(.88+.17*Math.sin(i*.93+layer));
  for(const n of [0,2,1,1,2,3]){const v=pts[n];wp.push(v.x,v.y,v.z);wc.push(color.r,color.g,color.b);uv.push((i+(n===1||n===3?1:0))*.3,v.y*.28);}
 }}
 const wallG=new THREE.BufferGeometry();wallG.setAttribute('position',new THREE.Float32BufferAttribute(wp,3));wallG.setAttribute('color',new THREE.Float32BufferAttribute(wc,3));wallG.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));wallG.computeVertexNormals();
 const wall=new THREE.Mesh(wallG,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,side:THREE.DoubleSide}));wall.name='floating_arena_exact_cliff_sides';wall.castShadow=true;wall.receiveShadow=true;scene.add(wall);
 const sides=world.createCollider(R.ColliderDesc.trimesh(new Float32Array(wp),new Uint32Array(wp.map((_,i)=>i).filter(i=>i<wp.length/3))).setFriction(.95));
 const area=d.boundary.reduce((s,p,i)=>{const q=d.boundary[(i+1)%N];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
 return{geometry:g,obstacles:[],stats:{walkableArea:area,halfExtents:d.halfExtents,boundary:d.boundary,floorCollider:floorCollider.handle,cliffCollider:sides.handle,topTriangles:d.indices.length/3,cliffTriangles:wp.length/9,support:'Exact rendered Float32 triangle interpolation; no support outside central island'}};
}
