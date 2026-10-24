import * as Three from 'three';
import {FONT} from './gpu-hud.js';
import {batchStaticScenery} from './static-scenery-batch.js';

const INK={slate:'#455e67',edge:'#718b92',pale:'#c5d7d5',teal:'#83bbb7',panel:'#283f48',warning:'#cfaaa2',occupied:'#c997a4'};
const idOf=value=>typeof value==='string'?value:value?.siteId??value?.zoneId??value?.sourceId??value?.id??null;
const canonical=id=>id==='pantry'?'stockpile':id;
const positionOf=value=>value?.position??value;
const clean=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9 +:/?.-]/g,' ');
const amount=value=>Math.max(0,Math.floor(Number(value)||0));

/** A compact physical sign and ground brackets, not a screen-space overlay.
 * All rendered/pickable surfaces have depthTest/depthWrite enabled. Consumers
 * must compare hit distance with their ordinary world hit before activating.
 * There are no invisible hit planes or labels rendered through the landscape.
 */
export function createSettlementWorldCues({THREE:T=Three,scene,support,sites=[],quarry,pantry,forageSources=[]}={}){
  const group=new T.Group();group.name='settlement_world_controls';scene?.add(group);
  const geometries=new Set(),materials=new Set(),controls=[],hitMeshes=[],occlusionMeshes=[],byId=new Map(),hunger=new Map(),couriers=new Map();
  const v=(p={})=>new T.Vector3(Number(p.x)||0,Number(p.y)||0,Number(p.z)||0);
  const material=color=>{const m=new T.MeshBasicMaterial({color,side:T.DoubleSide,depthTest:true,depthWrite:true});materials.add(m);return m;};
  const slate=material(INK.slate),panel=material(INK.panel),pale=material(INK.pale),warning=material(INK.warning);
  const own=geometry=>{geometries.add(geometry);return geometry;};
  // Each sign remains independently culled and animated. Only decorative
  // pieces sharing its local parent and mutable material become one draw.
  const batch=(parent,meshes,name)=>{
    const merged=batchStaticScenery({THREE:T,parent,meshes,name});own(merged.geometry);
    for(const mesh of meshes){geometries.delete(mesh.geometry);mesh.geometry.dispose();}
    return merged;
  };
  const add=(parent,geometry,mat,position=[0,0,0],name='')=>{const m=new T.Mesh(own(geometry),mat);m.position.set(...position);m.name=name;parent.add(m);return m;};
  const box=(parent,size,position,mat,name)=>add(parent,new T.BoxGeometry(...size),mat,position,name);
  const ball=(parent,r,position,mat,scale=[1,1,1])=>{const m=add(parent,new T.IcosahedronGeometry(r,0),mat,position);m.scale.set(...scale);return m;};
  const segment=(parent,a,b,thickness,mat)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),m=box(parent,[thickness,start.distanceTo(end),thickness],start.clone().add(end).multiplyScalar(.5).toArray(),mat);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());return m;};
  const groundAt=p=>{const y=support?.(p.x,p.z);return Number.isFinite(y)?y:(Number(p.y)||0);};

  function textGeometry(lines,size=.04){
    const points=[];
    const quad=(x,y,w,h)=>{for(const[a,b]of[[x,y],[x+w,y],[x+w,y+h],[x,y],[x+w,y+h],[x,y+h]])points.push(a,b,0);};
    for(const [lineIndex,value]of lines.entries()){
      const text=clean(value),width=Math.max(0,text.length*6-1)*size;
      let x=-width/2;for(const ch of text){const glyph=FONT[ch];if(glyph)for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row][col]==='1')quad(x+col*size,-lineIndex*.35+(6-row)*size,size,size);x+=6*size;}
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));geometry.computeBoundingSphere();return own(geometry);
  }
  function icon(parent,id,ink){
    if(id==='quarry'){
      segment(parent,[-.13,-.17,.069],[.1,.16,.069],.065,ink);
      segment(parent,[-.21,.11,.069],[.06,.22,.069],.065,ink);
      segment(parent,[.06,.22,.069],[.24,.14,.069],.065,ink);
    }else if(id==='brace'){
      for(const y of [-.13,0,.13])box(parent,[.46,.075,.045],[0,y,.069],ink);
      segment(parent,[-.23,-.16,.069],[.23,.17,.069],.052,ink);
    }else if(id==='defense'){
      for(const y of [-.12,.10])box(parent,[.54,.18,.045],[0,y,.069],ink);
    }else if(id==='bridge'){
      box(parent,[.52,.07,.045],[0,.08,.069],ink);
      for(const x of [-.2,0,.2])box(parent,[.065,.27,.045],[x,-.07,.069],ink);
    }else if(id==='garden-upgrade'){
      for(const x of [-.18,0,.18])box(parent,[.14,.07,.045],[x,-.15,.069],ink);
      segment(parent,[0,-.10,.069],[0,.13,.069],.045,ink);
      const leaf=ball(parent,.17,[.075,.10,.069],ink,[1,.52,.25]);leaf.rotation.z=.5;
    }else if(id==='stockpile'){
      for(const [x,y]of[[-.14,-.1],[.14,-.1],[0,.13]])ball(parent,.132,[x,y,.069],ink,[1,.75,.36]);
    }else{
      const left=ball(parent,.16,[-.105,.09,.069],ink,[1,.56,.25]);left.rotation.z=-.5;
      const right=ball(parent,.18,[.115,.16,.069],ink,[1,.56,.25]);right.rotation.z=.55;
      segment(parent,[0,-.19,.069],[0,.13,.069],.045,ink);
    }
  }
  function addControl(id,kind,raw){
    id=canonical(id);if(!raw||byId.has(id))return byId.get(id);
    const p=positionOf(raw);if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z))return null;
    const root=new T.Group();root.name=`world_control_${id}`;root.position.set(p.x,groundAt(p),p.z);group.add(root);
    const ink=material(INK.edge),accent=material(INK.edge),billboard=new T.Group();root.add(billboard);
    // Keep physical target clear for a worker landing. The sign sits just
    // outside the assignment spot, and every pick is against visible geometry.
    const offset=kind==='assignment'?[.83,.85,.28]:id==='stockpile'?[1.55,.84,.75]:[.78,.88,.34];
    billboard.position.set(...offset);
    const plate=box(billboard,[.79,.56,.065],[0,0,0],slate,`${id}_control_plate`);
    const border=box(billboard,[.055,.42,.07],[-.347,0,.006],accent,`${id}_selection_notch`);
    const iconStart=billboard.children.length;icon(billboard,id,ink);
    batch(billboard,billboard.children.slice(iconStart),`${id}_control_icon`);
    const stand=box(root,[.055,.7,.055],[offset[0],.35,offset[2]],slate,`${id}_control_stem`);
    const brackets=new T.Group();root.add(brackets);
    for(let i=0;i<4;i++){
      const arc=add(brackets,new T.RingGeometry(.69,.735,8,1,i*Math.PI/2+.12,.42),accent,[0,.035,0],`${id}_ground_bracket_${i}`);arc.rotation.x=-Math.PI/2;
    }
    batch(brackets,brackets.children.slice(),`${id}_ground_brackets`);
    const context=new T.Group();context.position.set(id==='defense'?1.4:0,.77,.02);context.visible=false;billboard.add(context);
    const backing=box(context,[2.1,.76,.035],[0,-.015,-.015],panel,`${id}_context_backing`);
    // Opaque context can hide a worker or load. It blocks acquisition while
    // visible, but never acts as a larger construction/assignment button.
    occlusionMeshes.push(backing);
    const words=add(context,textGeometry([]),pale,[0,.03,.012],`${id}_context_label`);
    // Only the stable, always-visible solid plate participates in the host's
    // selection resolver. Context text and the small icon never grow its hitbox.
    plate.userData={...plate.userData,worldControlId:id,worldControlKind:kind};
    const meshes=[plate];hitMeshes.push(plate);
    const control={id,kind,position:v(p),markerPosition:root.position.clone().add(billboard.position),meshes,root,billboard,plate,stand,ink,accent,border,brackets,context,backing,words,contextKey:'',selected:false,hovered:false,preview:false,complete:false};
    controls.push(control);byId.set(id,control);return control;
  }

  function ensure(source={}){
    for(const site of source.sites??sites)addControl(site.id,'construction',site);
    const q=source.quarry??quarry;if(q)addControl('quarry','assignment',q);
    const p=source.pantry??pantry;if(p)addControl('stockpile','construction',p);
    for(const f of source.forageSources??source.food?.sources??forageSources)addControl(f.id,'assignment',f);
    // Allocate every known worker's cue before the host snapshots scenery for
    // visible-surface picking. Hidden meshes are ignored by the normal picker.
    for(const worker of source.villagers??[])if(!couriers.has(worker.id))couriers.set(worker.id,courierSymbol(worker.id));
  }
  ensure();
  const footprint=new T.Group();footprint.name='held_worker_placement_footprint';footprint.visible=false;group.add(footprint);
  const footprintReady=material(INK.teal),footprintPending=material(INK.occupied);
  const readyRing=add(footprint,new T.RingGeometry(.665,.72,32),footprintReady,[0,.045,0],'placement_clear_footprint');readyRing.rotation.x=-Math.PI/2;
  const blockedArcs=[];
  for(let i=0;i<4;i++){
    const arc=add(footprint,new T.RingGeometry(.665,.72,8,1,i*Math.PI/2+.14,Math.PI/2-.28),footprintPending,[0,.045,0],`placement_pending_footprint_${i}`);arc.rotation.x=-Math.PI/2;blockedArcs.push(arc);
  }

  const workerSelection=new T.Group();workerSelection.name='selected_worker_command_ring';workerSelection.visible=false;group.add(workerSelection);
  const commandInk=material(INK.teal);
  const commandRing=add(workerSelection,new T.RingGeometry(.58,.66,40),commandInk,[0,.055,0],'selected_worker_ring');commandRing.rotation.x=-Math.PI/2;
  for(let i=0;i<4;i++){const a=i*Math.PI/2;box(workerSelection,[.12,.035,.12],[Math.cos(a)*.76,.065,Math.sin(a)*.76],commandInk,'selected_worker_tick');}

  function setLabel(control,lines){
    const key=lines.join('|');if(key===control.contextKey)return;control.contextKey=key;
    geometries.delete(control.words.geometry);control.words.geometry.dispose();control.words.geometry=textGeometry(lines);
    const width=Math.max(1.22,...lines.map(line=>(clean(line).length*6-1)*.04+.24));control.backing.scale.x=width/2.1;
    // A single current need can add one line above the existing context.
    // The visible control plate and its physical picking target never grow.
    const extra=Math.max(0,lines.length-2)*.35;
    control.context.position.y=.77+extra;control.backing.scale.y=(.76+extra)/.76;control.backing.position.y=-.015-extra/2;
  }
  function hungerSymbol(){
    const root=new T.Group();root.name='hungry_worker_bowl';
    // A tiny empty bowl, with a separate grain above it. This remains world
    // geometry and is naturally hidden by people, scenery, or terrain.
    const bowl=add(root,new T.TorusGeometry(.17,.033,4,12,Math.PI),warning,[0,0,0]);bowl.rotation.z=Math.PI;
    segment(root,[-.15,0,0],[.15,0,0],.035,warning);
    ball(root,.045,[0,.14,0],pale,[.75,1,.45]);
    group.add(root);return root;
  }

  function courierSymbol(workerId){
    const root=new T.Group();root.name=`stranded_courier_${workerId}`;root.visible=false;group.add(root);
    const billboard=new T.Group();root.add(billboard);
    // The little basket sits above its real load. The lower tick points to
    // that basket without covering its pickup surface or changing a pose.
    box(billboard,[.48,.36,.035],[0,0,-.022],panel,'stranded_courier_badge');
    const bowl=add(billboard,new T.TorusGeometry(.15,.025,4,12,Math.PI),pale,[0,.06,.005]);bowl.rotation.z=Math.PI;
    segment(billboard,[-.15,.06,.005],[.15,.06,.005],.028,pale);
    ball(billboard,.035,[0,.115,.012],warning,[1,.8,.4]);
    segment(billboard,[0,-.25,0],[0,-.40,0],.024,warning);
    const context=new T.Group();context.position.set(0,.72,0);billboard.add(context);
    const backing=box(context,[4.63,.79,.035],[0,-.02,-.024],panel,'stranded_courier_context');
    add(context,textGeometry(['CARRY FOOD HOME','OR BUILD THE BRIDGE'],.04),pale,[0,.05,0],'stranded_courier_words');
    // All opaque new surfaces block the ordinary picker at their visible
    // depth. They never become a command or an expanded basket hit area.
    root.traverse(mesh=>{if(mesh.isMesh)occlusionMeshes.push(mesh);});
    return{root,billboard,context,backing,workerId};
  }

  let lastState={selectedWorker:null,controls:[],hungryWorkers:[],strandedCouriers:[]};
  function update(input={}){
    const jobs=input.jobs??input.economy??{},camera=input.camera;
    ensure(jobs);
    const hovered=canonical(idOf(input.hoveredSite??input.hoveredControl)),selected=canonical(idOf(input.selected??input.selectedSite??input.selectedSiteId??jobs.prioritySiteId));
    const preview=input.placementPreview,previewId=canonical(idOf(preview)),heldId=idOf(input.heldWorker);
    const commandWorker=input.selectedWorker,hasCommandWorker=!!commandWorker&&!input.heldWorker;
    const hasHeldWorker=!!input.heldWorker,previewValid=preview?.valid!==false&&preview?.eligible!==false;
    const need=input.needCue?.need,needId=canonical(need?.siteId);
    const foodId=hasHeldWorker?null:canonical(input.foodDestination?.siteId);
    for(const control of controls){
      const {id,kind}=control,row=jobs.sites?.find(s=>s.id===id),isHovered=hovered===id,isSelected=kind==='construction'&&selected===id,isPreview=hasHeldWorker&&previewId===id;
      const isNeeded=!hasHeldWorker&&needId===id&&!!need?.text&&(isHovered||input.needCue?.reveal===true);
      const isFoodDestination=id==='stockpile'&&foodId===id;
      control.hovered=isHovered;control.selected=isSelected;control.preview=isPreview;control.complete=id==='defense'?input.defenseConstruction?.complete===true:!!row?.complete;control.needed=isNeeded;control.foodDestination=isFoodDestination;
      const focus=isHovered||isSelected||isPreview||isNeeded||isFoodDestination,offered=(hasHeldWorker||hasCommandWorker)&&kind==='assignment';
      control.ink.color.set(focus?INK.pale:offered?INK.teal:INK.edge);
      control.accent.color.set(isPreview&&!previewValid?INK.pale:focus||offered?INK.teal:INK.edge);
      control.border.visible=isSelected||isPreview||isFoodDestination;control.brackets.visible=focus||offered;
      const ringRadius=kind==='assignment'&&isPreview?Number(preview?.radius)||2.3:.735;
      control.brackets.scale.set(ringRadius/.735,1,ringRadius/.735);
      control.billboard.scale.setScalar(isHovered||isPreview?1.12:1);
      if(camera)control.billboard.quaternion.copy(camera.quaternion);
      control.context.visible=isHovered||isSelected||isPreview||isNeeded||isFoodDestination;
      if(control.context.visible){
        let lines;
        if(id==='stockpile')lines=isFoodDestination?['PANTRY','BRING FOOD HERE']:['STORES',`${amount(jobs.pantry?.food??jobs.food)} FOOD / ${amount(jobs.pantry?.spareStone)} STONE`];
        else if(id==='garden-upgrade'){
          const upgrade=jobs.gardenUpgrade,budget=row?.accessBudget?.allowed===false?row.accessBudget:upgrade?.budget;
          lines=['GARDEN UPGRADE',row?.complete?'COMPLETE':`${amount(row?.delivered)}/${amount(row?.required??3)} STONE`,
            !row?.complete&&budget?.allowed===false?(budget.commitments?.some(c=>c.reasons.includes('required-access'))?'SAVE STONE FOR BRIDGE + STORES':`NEEDS ${amount(budget.shortfall)} MORE STONE`):`${amount(upgrade?.bundleSize??6)} FOOD PER HARVEST`];
        }
        else if(id==='defense'){
          const access=row?.selectionAccessBudget??row?.accessBudget;
          const budget=access?.allowed===false?access:jobs.defenseUpgrade?.selectionBudget??jobs.defenseUpgrade?.budget;
          lines=['STONE BARRIER',`${amount(row?.delivered)}/${amount(row?.required??2)} STONE`,
            input.defenseConstruction?.blocked?'CLEAR THE BUILDING AREA':input.defenseConstruction?.complete?'BARRIER COMPLETE':budget?.allowed===false?(budget.commitments?.some(c=>c.reasons.includes('required-access'))?'SAVE STONE FOR BRIDGE + STORES':`NEEDS ${amount(budget.shortfall)} MORE STONE`):'RAIDERS CAN WALK AROUND'];
        }
        else if(kind==='construction')lines=[id==='brace'?'QUARRY BRACE':'ISLAND BRIDGE',row?.complete?'COMPLETE':row?.accessBudget?.allowed===false?'SAVE STONE FOR BRIDGE + STORES':`${amount(row?.delivered)}/${amount(row?.required??(id==='bridge'?5:3))} STONE`];
        else{
          const assessment=input.placementAssessment;
          const physicalHint=assessment?.ready?'GROUND IS CLEAR':assessment?.reason==='obstructed'?'MOVE TO CLEAR GROUND':assessment?.reason==='unsupported'?'LOWER TO THE GROUND':assessment?.reason==='too-low'?'RAISE SLIGHTLY':assessment?.reason==='too-high'?'LOWER SLIGHTLY':assessment?.reason==='not-upright'?'HOLD UPRIGHT':assessment&&!assessment.ready?'HOLD STILL':null;
          const instruction=hasCommandWorker?'CLICK TO SEND WORKER':!isPreview?'SELECT A WORKER FIRST':previewValid?(physicalHint??'RELEASE GENTLY'):preview?.reason==='outside-target'?'MOVE INTO THE RING':preview?.reason==='too-high'?'LOWER TO THE RING':'HOLD STILL';
          lines=[id==='quarry'?'QUARRY':id==='island-garden'?'ISLAND GARDEN':'GARDEN',instruction];
        }
        if(isNeeded&&!isFoodDestination)lines.push(need.text);
        setLabel(control,lines);
      }
    }
    workerSelection.visible=hasCommandWorker;
    if(hasCommandWorker){const p=commandWorker.position;workerSelection.position.set(p.x,groundAt(p),p.z);}
    const jobWorkers=jobs.villagers??jobs.workers??[];
    const workerRows=input.workers?.map(worker=>({...jobWorkers.find(w=>idOf(w)===idOf(worker)),...worker}))??jobWorkers,aliveHunger=new Set();
    for(const worker of workerRows){
      const id=idOf(worker),p=positionOf(worker),held=worker.held===true||worker.isHeld===true||id===heldId;
      const hungry=worker.hungry===true||worker.blocked==='empty-pantry';
      const available=worker.available!==false&&worker.blocked!=='unavailable';
      if(!id||!hungry||!available||held||worker.alive===false||(worker.hp!==undefined&&worker.hp<=0)||['dead','lost','held','recovering'].includes(worker.phase)||!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||!Number.isFinite(p?.z))continue;
      let symbol=hunger.get(id);if(!symbol){symbol=hungerSymbol();symbol.userData.workerId=id;hunger.set(id,symbol);}symbol.visible=true;symbol.position.set(p.x,p.y+2.9,p.z);if(camera)symbol.quaternion.copy(camera.quaternion);aliveHunger.add(id);
    }
    for(const[id,symbol]of hunger)if(!aliveHunger.has(id))symbol.visible=false;
    const courierState=[];
    for(const [workerId,cue]of couriers){
      const request=input.courierCue?.requests?.find(row=>row.workerId===workerId);
      cue.root.visible=request?.visible===true&&!hasHeldWorker;
      if(!cue.root.visible)continue;
      const p=request.position,hovered=input.courierHover?.workerId===workerId||input.courierHover?.loadId===request.loadId;
      cue.root.position.set(p.x,p.y+1.08,p.z);
      if(camera)cue.billboard.quaternion.copy(camera.quaternion);
      cue.context.visible=request.reveal===true||hovered;
      courierState.push({workerId,loadId:request.loadId,position:cue.root.position.toArray(),hovered,
        label:cue.context.visible?'CARRY FOOD HOME|OR BUILD THE BRIDGE':null});
    }
    const assessment=input.placementAssessment,p=assessment?.position;
    footprint.visible=!!(hasHeldWorker&&preview&&p&&[p.x,p.y,p.z].every(Number.isFinite)
      &&!['invalid','dead','outside','unsafe-ground'].includes(assessment.reason));
    let footprintState=null;
    if(footprint.visible){
      footprint.position.set(p.x,p.y,p.z);const radius=Number(assessment.radius)||.72;footprint.scale.set(radius/.72,1,radius/.72);
      const ready=assessment.ready===true&&previewValid;readyRing.visible=ready;for(const arc of blockedArcs)arc.visible=!ready;
      footprintState={position:[p.x,p.y,p.z],radius,ready,clear:assessment.clear===true,supported:assessment.supported===true,reason:previewValid?assessment.reason:preview.reason,pathChecked:assessment.pathChecked===true};
    }
    group.updateMatrixWorld(true);
    lastState={selectedWorker:workerSelection.visible?{id:commandWorker.id,position:workerSelection.position.toArray()}:null,controls:controls.map(c=>({id:c.id,kind:c.kind,position:c.position.toArray(),markerPosition:c.billboard.getWorldPosition(new T.Vector3()).toArray(),selected:c.selected,hovered:c.hovered,preview:c.preview,complete:c.complete,needed:c.needed,foodDestination:c.foodDestination,label:c.context.visible?c.contextKey:null,meshNames:c.meshes.map(m=>m.name)})),hungryWorkers:[...aliveHunger],strandedCouriers:courierState,placementFootprint:footprintState};
    return lastState;
  }
  function dispose(){group.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();hitMeshes.length=0;occlusionMeshes.length=0;controls.length=0;byId.clear();hunger.clear();couriers.clear();}
  return{group,controls,hitMeshes,occlusionMeshes,update,state:()=>lastState,getControl:id=>byId.get(canonical(id))??null,dispose};
}
