import {batchStaticScenery} from './static-scenery-batch.js';
/** Original, source-built food mission scenery. All decoration is non-colliding. */
export function createSettlementFoodArt({THREE,scene,support}) {
  const scenery=[],ownedGeometry=new Set(),ownedMaterial=new Set(),roots=[];
  const colors={stone:'#56707a',lightStone:'#9bb2aa',darkStone:'#334e5a',timber:'#64483e',basket:'#996652',rim:'#bb9471',leaf:'#3f6b5a',leafLight:'#7e9e7b',berry:'#ad647e',fruit:'#c37d62',soil:'#514f41',path:'#a9bcb0'};
  const colorMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
  ownedMaterial.add(colorMaterial);
  const ground=(x,z)=>{const y=support?.(x,z);return Number.isFinite(y)?y:0;};
  const buildGeometry=parts=>{
    const positions=[],normals=[],vertexColors=[];
    for(const part of parts){
      const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
      const transform=new THREE.Matrix4().compose(new THREE.Vector3(...(part.position??[0,0,0])),new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation??[0,0,0]))),new THREE.Vector3(...(part.scale??[1,1,1])));
      geometry.applyMatrix4(transform);const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),c=new THREE.Color(part.color??colors.stone);
      for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n?.getX(i)??0,n?.getY(i)??1,n?.getZ(i)??0);vertexColors.push(c.r,c.g,c.b);}
      geometry.dispose();part.geometry.dispose();
    }
    const merged=new THREE.BufferGeometry();merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));merged.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));merged.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));merged.computeBoundingSphere();ownedGeometry.add(merged);return merged;
  };
  const box=(size,position,color,rotation)=>({geometry:new THREE.BoxGeometry(...size),position,color,rotation});
  const ball=(radius,position,color,scale=[1,1,1])=>({geometry:new THREE.IcosahedronGeometry(radius,0),position,color,scale});
  const mesh=(geometry,position,name,query=true)=>{const m=new THREE.Mesh(geometry,colorMaterial);m.name=name;m.position.set(...position);m.castShadow=true;m.receiveShadow=true;scene.add(m);roots.push(m);if(query)scenery.push(m);return m;};
  const batch=(parts,name)=>{
    const merged=batchStaticScenery({THREE,meshes:parts,parent:scene,name});
    for(const part of parts){const i=scenery.indexOf(part);if(i>=0)scenery.splice(i,1);}
    scenery.push(merged);roots.push(merged);ownedGeometry.add(merged.geometry);return merged;
  };
  const bundleParts=[];
  bundleParts.push({geometry:new THREE.CylinderGeometry(.205,.16,.22,8),position:[0,-.055,0],color:colors.basket});
  bundleParts.push({geometry:new THREE.TorusGeometry(.204,.035,4,8),position:[0,.047,0],rotation:[Math.PI/2,0,0],color:colors.rim});
  for(const z of [-.13,.13])bundleParts.push(box([.31,.035,.026],[0,-.01,z],colors.rim,[0,0,z*1.2]));
  for(const [x,z,r] of [[-.105,-.04,.103],[.08,-.08,.11],[.07,.095,.1],[-.085,.105,.09]])bundleParts.push(ball(r,[x,.1,z],x<0?colors.berry:colors.fruit,[1,.82,1]));
  bundleParts.push(ball(.11,[-.04,.2,-.045],colors.leaf,[.38,1.05,.62]),ball(.115,[.045,.185,.005],colors.leafLight,[.98,.27,.5]));
  const bundleGeometry=buildGeometry(bundleParts);
  // Carried quantity changes the contents only. Keep the pantry's one-meal
  // bundle above, basket silhouette, handles, transform and physics untouched.
  // One lazy shared mesh per finite 0–6 fill level, never rebuilt during sync.
  const carriedBundleGeometries=new Map();
  function carriedBundleGeometry(quantity){
    const count=Math.min(6,Math.floor(quantity));
    if(carriedBundleGeometries.has(count))return carriedBundleGeometries.get(count);
    const parts=[
      {geometry:new THREE.CylinderGeometry(.205,.16,.22,8),position:[0,-.055,0],color:colors.basket},
      {geometry:new THREE.TorusGeometry(.204,.035,4,8),position:[0,.047,0],rotation:[Math.PI/2,0,0],color:colors.rim},
    ];
    for(const z of [-.13,.13])parts.push(box([.31,.035,.026],[0,-.01,z],colors.rim,[0,0,z*1.2]));
    const produce=[
      [-.102,.105,.062,colors.berry],
      [.102,.105,.062,colors.fruit],
      [0,.105,-.108,colors.leafLight],
      [-.094,.194,-.062,colors.fruit],
      [.094,.194,-.062,colors.berry],
      [0,.185,.05,colors.leafLight],
    ];
    for(const [x,y,z,color] of produce.slice(0,count))parts.push(ball(.092,[x,y,z],color,[1,.88,1]));
    const geometry=buildGeometry(parts);carriedBundleGeometries.set(count,geometry);return geometry;
  }
  const stoneGeometry=buildGeometry([ball(.21,[0,0,0],colors.lightStone,[1,.76,.87])]);
  const pantry={id:'pantry',x:8,y:ground(8,1.7),z:1.7,radius:1.0};
  const pantryRackX=8,pantryRackZ=2.75,pantryGround=ground(pantryRackX,pantryRackZ);
  // Open provision tray: both rows expose their fruit/leaf tops from above.
  // A small upslope offset/tilt follows the bank and clears the delivery view.
  const rackParts=[box([2.62,.08,1.12],[0,.2,.56],colors.timber)];
  for(const x of [-1.2,1.2])rackParts.push(box([.12,.16,1.04],[x,.08,.56],colors.darkStone));
  for(const z of [.015,1.105])rackParts.push(box([2.62,.14,.07],[0,.29,z],colors.basket));
  for(const x of [-1.275,1.275])rackParts.push(box([.07,.14,1.05],[x,.29,.56],colors.rim));
  const pantryMesh=mesh(buildGeometry(rackParts),[pantryRackX,pantryGround,pantryRackZ],'food_pantry_rack');
  pantryMesh.position.z+=.65;pantryMesh.rotation.x=-.24;
  pantryMesh.userData={...pantryMesh.userData,foodMission:'pantry',deliveryTarget:{x:pantry.x,y:pantry.y,z:pantry.z}};
  const ring=buildGeometry([{geometry:new THREE.RingGeometry(.69,.77,32),position:[0,.028,0],rotation:[-Math.PI/2,0,0],color:colors.path}]);
  mesh(ring,[pantry.x,pantry.y,pantry.z],'food_pantry_delivery_ring',false);
  const storedMeals=[];
  for(let i=0;i<12;i++){
    const slot=new THREE.Vector3(-1.025+(i%6)*.41,.392,.29+Math.floor(i/6)*.54).applyAxisAngle(new THREE.Vector3(1,0,0),-.24);
    const m=mesh(bundleGeometry,[pantryRackX+slot.x,pantryGround+slot.y,pantryRackZ+.65+slot.z],`pantry_meal_${i+1}`);
    m.scale.setScalar(.92);m.rotation.x=-.24;m.visible=false;storedMeals.push(m);
  }
  // A separate slate-lined bay keeps spare stone distinct from food baskets.
  // Reuse the original pantry support sample; this remains non-colliding art.
  const stoneBayParts=[box([.84,.28,1.28],[1.72,.14,.07],colors.darkStone)];
  for(const x of [1.335,2.105])stoneBayParts.push(box([.07,.16,1.28],[x,.32,.07],colors.stone));
  for(const z of [-.535,.675])stoneBayParts.push(box([.77,.16,.07],[1.72,.32,z],colors.stone));
  mesh(buildGeometry(stoneBayParts),[pantryRackX,pantryGround,pantryRackZ+.65],'food_pantry_stone_bay');
  const storedStone=[];
  for(let i=0;i<6;i++){
    const x=9.55+(i%2)*.28,z=2.48+Math.floor(i/2)*.27;
    const m=mesh(stoneGeometry,[x+(i%2-.5)*.08,ground(x,z)+.44,z+.65+Math.floor(i/2)*.07],`pantry_spare_stone_${i+1}`);m.rotation.set(i*.12,i*1.7,.1);
    // Seat each rotated, faceted stone on the bay floor without floating.
    m.updateMatrixWorld(true);m.position.y+=pantryGround+.282-new THREE.Box3().setFromObject(m,true).min.y;
    m.visible=false;storedStone.push(m);
  }
  const forageSources=[
    {id:'mainland-forage',kind:'forage',x:-5.5,y:ground(-5.5,3.2),z:3.2,radius:.8,abundance:'modest'},
    {id:'island-garden',kind:'garden',x:20,y:ground(20,-.7),z:-.7,radius:.7,abundance:'rich'},
  ];
  const cropGeometry=buildGeometry([
    box([.04,.3,.04],[0,.17,0],colors.timber),
    ball(.29,[-.13,.24,0],colors.leaf,[1,.43,.7]),
    ball(.28,[.12,.29,-.025],colors.leafLight,[1,.42,.7]),
    ball(.24,[0,.4,.06],colors.leaf,[.63,1,.64]),
  ]);
  const berryGeometry=buildGeometry([ball(.09,[-.14,.33,.13],colors.berry),ball(.1,[.045,.37,.14],colors.fruit),ball(.085,[.15,.3,.07],colors.berry)]);
  const crops=[];
  for(const [sourceIndex,source] of forageSources.entries()){
    const garden=sourceIndex===1,patchX=source.x+(garden?.25:0),patchZ=source.z+(garden?0:1.0),patchY=ground(patchX,patchZ);
    const width=garden?1.7:2.75,depth=garden?.76:1.26;
    const bedParts=[box([width,.05,depth],[0,.025,0],colors.soil)];
    for(const z of [-depth/2,depth/2])bedParts.push(box([width+.12,.11,.11],[0,.055,z],colors.stone));
    for(const x of [-width/2,width/2])bedParts.push(box([.1,.11,depth],[x,.055,0],colors.lightStone));
    mesh(buildGeometry(bedParts),[patchX,patchY+.015,patchZ],`${source.id}_low_bed`);
    const fruit=[],leaves=[];
    for(let i=0;i<(garden?8:5);i++){
      const x=patchX+(garden?((i%4)-1.5)*.39:((i%3)-1)*.72),z=patchZ+(garden?(Math.floor(i/4)-.5)*.34:(Math.floor(i/3)-.5)*.53),y=ground(x,z)+.04;
      const crop=mesh(cropGeometry,[x,y,z],`${source.id}_crop_${i}`);crop.rotation.y=i*1.7;crop.scale.setScalar(garden?1:.8);leaves.push(crop);
      const berries=mesh(berryGeometry,[x,y,z],`${source.id}_produce_${i}`);berries.rotation.y=crop.rotation.y;berries.scale.copy(crop.scale);fruit.push(berries);
    }
    const sourceRing=buildGeometry([{geometry:new THREE.RingGeometry(.43,.47,24),rotation:[-Math.PI/2,0,0],color:garden?colors.leafLight:colors.path}]);
    mesh(sourceRing,[source.x,source.y+.025,source.z],`${source.id}_gather_marker`,false);
    // Each bed is its own culling chunk. Produce already disappears in prefix
    // order, so one draw range preserves that exact depletion without remeshing.
    batch(leaves,`${source.id}_crop_batch`);
    const produce=batch(fruit,`${source.id}_produce_batch`),verticesPerFruit=berryGeometry.attributes.position.count;
    crops.push({source,fruit,produce,verticesPerFruit});
  }
  let stateKey='';
  const nonnegative=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  function sync(state={}){
    const e=state.economy??state;
    const food=nonnegative(e.food?.stored??e.food?.stock??e.food?.count??e.pantry?.food??e.foodStock??e.food);
    const stone=nonnegative(e.pantry?.spareStone??e.pantry?.stone??e.stone?.spare??e.spareStone??e.stockpile?.stone??e.stoneStock);
    const sources=e.food?.sources??e.forageSources??e.sources??[];
    const key=JSON.stringify([food,stone,sources]);if(key===stateKey)return;stateKey=key;
    storedMeals.forEach((m,i)=>{m.visible=i<Math.min(12,Math.floor(food));});
    storedStone.forEach((m,i)=>{m.visible=i<Math.min(6,Math.floor(stone));});
    for(const {source,fruit,produce,verticesPerFruit} of crops){
      const sourceState=Array.isArray(sources)?sources.find(s=>s.id===source.id||(source.kind==='forage'&&['mainland','forage'].includes(s.id))||(source.kind==='garden'&&['island','garden'].includes(s.id))):sources[source.id];
      if(!sourceState){produce.visible=true;produce.geometry.setDrawRange(0,fruit.length*verticesPerFruit);continue;}
      const amount=sourceState.remaining??sourceState.stock??sourceState.quantity??sourceState.available;
      const capacity=sourceState.capacity??sourceState.max??sourceState.initial??sourceState.reserve??amount;
      const fraction=sourceState.depleted?0:amount==null?1:Math.min(1,nonnegative(amount)/Math.max(1,nonnegative(capacity)));
      const count=Math.ceil(fruit.length*fraction);produce.visible=count>0;produce.geometry.setDrawRange(0,count*verticesPerFruit);
    }
  }
  function createFoodLoadVisual(kindOrYield='food',yieldValue=1){
    const data=typeof kindOrYield==='object'?kindOrYield:{kind:typeof kindOrYield==='string'?kindOrYield:'food',quantity:typeof kindOrYield==='number'?kindOrYield:yieldValue};
    const quantity=nonnegative(data.quantity??data.yield??yieldValue);
    const load=new THREE.Mesh(carriedBundleGeometry(quantity),colorMaterial);
    load.name=`food_load_${data.kind??'food'}`;load.castShadow=true;load.receiveShadow=true;load.userData={kind:'food',quantity,foodMission:true};
    load.scale.setScalar(1.55);return load;
  }
  function dispose(){for(const root of roots)root.removeFromParent();for(const geometry of ownedGeometry)geometry.dispose();for(const material of ownedMaterial)material.dispose();carriedBundleGeometries.clear();scenery.length=0;}
  return{pantry,forageSources,scenery,sync,createFoodLoadVisual,dispose,inventoryVisuals:{food:storedMeals,stone:storedStone}};
}
