import * as THREE from 'three';
import {terrainHeight,inArena,makeArena,getArenaSurface} from './terrain.js';
import {markTerrainCollider} from './surface-support.js';
import {batchStaticScenery} from './static-scenery-batch.js';
import {createArchipelagoRegions,createLandRegionRegistry,polygonBounds,ARCHIPELAGO_LANDMARKS} from './settlement-land-regions.js';

/** Three real land regions. The quarry causeway starts built; the farm crossing
 * retains its five physically delivered construction sections. */
export function createSettlementWorld(scene,world,R){
 const arena=makeArena(scene,world,R),groundColliders=[arena.stats.floorCollider],scenery=[];
 scene.traverse(o=>{if(o.isMesh)scenery.push(o);});
 const stone=new THREE.MeshStandardMaterial({color:'#56707a',roughness:1,flatShading:true}),lightStone=new THREE.MeshStandardMaterial({color:'#b6c9bf',roughness:.94}),wood=new THREE.MeshStandardMaterial({color:'#64483e',roughness:1}),glow=new THREE.MeshStandardMaterial({color:'#a2eeed',emissive:'#46c9d1',emissiveIntensity:.8,roughness:.5});
 const add=(geo,mat,pos,name)=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.name=name;m.castShadow=true;m.receiveShadow=true;scene.add(m);scenery.push(m);return m;};
 const box=(size,pos,mat,name,ground=false)=>{const m=add(new THREE.BoxGeometry(...size),mat,pos,name),c=world.createCollider(R.ColliderDesc.cuboid(...size.map(v=>v/2)).setTranslation(...pos).setFriction(.9));if(ground)groundColliders.push(c.handle);return{mesh:m,collider:c};};
 const homeBoundary=getArenaSurface().boundary;
 const home={id:'home',name:'Hearth Village',role:'village',center:{x:0,y:0,z:0},boundary:homeBoundary,bounds:polygonBounds(homeBoundary),groundColliders:[arena.stats.floorCollider],contains:inArena,support:terrainHeight};
 const regions=createArchipelagoRegions(home),farm=regions.find(r=>r.id==='farm'),quarryRegion=regions.find(r=>r.id==='quarry');
 for(const region of [farm,quarryRegion]){
  const vertices=[region.center.x,region.height,region.center.z,...region.boundary.flatMap(([x,z])=>[x,region.height,z])],indices=[],area=region.boundary.reduce((sum,p,i)=>{const q=region.boundary[(i+1)%region.boundary.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
  for(let i=0;i<region.boundary.length;i++){const a=1+i,b=1+(i+1)%region.boundary.length;indices.push(0,...(area>0?[b,a]:[a,b]));}
  const v=new Float32Array(vertices),index=new Uint32Array(indices),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(v,3));geometry.setIndex(new THREE.BufferAttribute(index,1));geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color:region.id==='farm'?'#6d8e78':'#879b99',roughness:1,flatShading:true});
  const mesh=add(geometry,material,[0,0,0],region.id==='farm'?'beacon_island_top':'quarry_island_top');mesh.userData={landRegionId:region.id,exactWalkableSurface:true};region.mesh=mesh;
  const collider=markTerrainCollider(world.createCollider(R.ColliderDesc.trimesh(v,index).setFriction(.9)));region.groundColliders.push(collider.handle);groundColliders.push(collider.handle);
 }
 const quarry={...ARCHIPELAGO_LANDMARKS.quarrySource,y:quarryRegion.height},site={...ARCHIPELAGO_LANDMARKS.farmBridgeSite,y:1.0};
 for(let i=0;i<5;i++){const x=quarry.x-4.7+i*.9,z=quarry.z-4.4+.3*Math.sin(i*2),m=add(new THREE.DodecahedronGeometry(.8+i*.06,0),stone,[x,quarryRegion.height+.35,z],'quarry_outcrop_'+i);m.scale.set(1,.7,1);world.createCollider(R.ColliderDesc.ball(.65).setTranslation(x,m.position.y,z));}
 const depot=add(new THREE.RingGeometry(1.5,1.66,48),new THREE.MeshBasicMaterial({color:'#65aead',side:THREE.DoubleSide}),[site.x,terrainHeight(site.x,site.z)+.025,site.z],'construction_delivery_ring');depot.rotation.x=-Math.PI/2;
 for(const z of [-3.9,-.1]){box([.22,1.6,.22],[12.7,.72,z],wood,'bridge_start_post');box([.22,1.6,.22],[18.8,.72,z],wood,'bridge_end_post');}
 box([1.2,.28,1.2],[21.1,.31,-3.15],lightStone,'beacon_base');const core=add(new THREE.OctahedronGeometry(.46),glow,[21.1,1.12,-3.15],'beacon_core');
 const roof=add(new THREE.ConeGeometry(1.05,.6,4),wood,[-8,2.65,3.5],'workers_shelter_roof');roof.rotation.y=Math.PI/4;
 for(const x of [-8.6,-7.4])for(const z of [2.9,4.1])box([.13,2.4,.13],[x,1.2+terrainHeight(x,z),z],wood,'shelter_post');
 const bridge=[],planMaterial=new THREE.MeshBasicMaterial({color:'#719198'});let complete=false,delivered=0;
 for(let i=0;i<5;i++){
  const x=13.25+i*1.15,m=add(new THREE.BoxGeometry(1.12,.28,3.6),lightStone,[x,.03,-2],'bridge_section_'+i);m.visible=false;bridge.push({mesh:m,collider:null});
  const outline=new THREE.Group(),bars=[];scene.add(outline);
  for(const [w,d,dx,dz]of[[1.08,.035,0,-1.77],[1.08,.035,0,1.77],[.035,3.54,-.54,0],[.035,3.54,.54,0]]){const bar=add(new THREE.BoxGeometry(w,.035,d),planMaterial,[x+dx,.18,-2+dz],'bridge_plan_'+i);outline.attach(bar);bars.push(bar);}
  // Keep one small batch per construction section: each outline disappears
  // independently when its physical deck is delivered. Picking uses this same mesh.
  const plan=batchStaticScenery({THREE,meshes:bars,parent:outline,name:'bridge_plan_'+i});
  for(const bar of bars){scenery.splice(scenery.indexOf(bar),1);bar.geometry.dispose();}
  scenery.push(plan);bridge[i].outline=outline;
 }
 const farmBridgeSupport=(x,z)=>{if(x<12.65||x>18.4||Math.abs(z+2)>1.75)return -50;const i=Math.max(0,Math.min(4,Math.floor((x-12.69)/1.15)));return bridge[i]?.collider?.isValid()?.17:-50;};
 const causeway=box([4.0,.28,4.4],[2.5,.03,-8.7],lightStone,'quarry_causeway_deck',true);
 const causewaySupport=(x,z)=>Math.abs(x-2.5)<=2&&z>=-10.9&&z<=-6.5?.17:-50;
 // Two paired stone end piers leave a full four-metre walking deck clear.
 for(const z of [-6.58,-10.82])for(const x of [.31,4.69])box([.30,1.00,.30],[x,.43,z],stone,'quarry_causeway_pier');
 const endpoints=(from,to,width)=>({endpoints:{from,to},width,portals:[{regionId:from.regionId,...from,width},{regionId:to.regionId,...to,width}]});
 const connections=[
  {id:'quarry-causeway',from:'home',to:'quarry',prebuilt:true,complete:true,required:0,delivered:0,...endpoints({x:2.5,y:.17,z:-6.6,regionId:'home'},{x:2.5,y:.17,z:-10.8,regionId:'quarry'},4.0),support:causewaySupport,groundColliders:[causeway.collider.handle]},
  {id:'bridge',from:'home',to:'farm',prebuilt:false,get complete(){return complete;},required:5,get delivered(){return delivered;},...endpoints({x:12.2,y:.17,z:-2,regionId:'home'},{x:19.0,y:.175,z:-2,regionId:'farm'},3.6),support:farmBridgeSupport,groundColliders:[]},
 ];
 const registry=createLandRegionRegistry({regions,connections});
 const update=count=>{delivered=Math.min(5,Math.max(0,Math.floor(count)));for(let i=0;i<delivered;i++)if(!bridge[i].collider){const b=bridge[i];b.mesh.visible=true;b.outline.visible=false;b.collider=world.createCollider(R.ColliderDesc.cuboid(.56,.14,1.8).setTranslation(b.mesh.position.x,.03,-2).setFriction(.9));groundColliders.push(b.collider.handle);connections[1].groundColliders.push(b.collider.handle);}complete=delivered>=5;glow.emissiveIntensity=complete?1.8:.35;};
 const landmarks=Object.fromEntries(Object.entries(ARCHIPELAGO_LANDMARKS).map(([key,p])=>[key,p.regionId?{...p,y:registry.support(p.x,p.z)}:{...p}]));
 const idleHome=[[0,-2],[2,-2],[4,-2],[6,-2]].map(([x,z])=>({x,y:registry.support(x,z),z,regionId:'home'}));
 const looseStoneSpawns=[[2.5,-14.7],[2.5,-12.2],[2.5,-9.7],[4.5,-14.7],[4.3,-11.6],[3.95,-13.65],[4.75,-13.6],[4.35,-12.9]].map(([x,z])=>({x,y:registry.support(x,z)+.36,z}));
 return{arena,groundColliders,scenery,quarry,site,bridge,core,update,...registry,landmarks,idleHome,looseStoneSpawns,causeway,beacon:{x:19.2,y:.175,z:-2},get complete(){return complete;}};
}
