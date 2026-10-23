import {createVillageXR} from './settlement-xr.js';
import {createCombatFeedback} from './combat-feedback.js';
import {createSettlementRaid} from './settlement-raid.js';
import {createSettlementDefense} from './settlement-defense.js';
import {loadHeroArt} from './hero-art.js';
import {createWindupCue} from './windup-cue.js';
import {createDesktopDragSpace} from './desktop-drag-space.js';
import {createDesktopSettlementNavigation} from './desktop-settlement-navigation.js';
import {createSettlementWorkerOrders} from './settlement-worker-orders.js';
import {settlementWorkerFeedback} from './settlement-worker-feedback.js';
import {createDesktopGrabIntent} from './desktop-grab-intent.js';
import {createDesktopBlessIntent} from './desktop-bless-intent.js';
import {createSettlementBlessing} from './settlement-blessing.js';
import {createCarriedLoadHandoff} from './carried-load-handoff.js';
import {createPendingPhysicalDelivery} from './pending-physical-delivery.js';
import * as THREE from 'three';
import {initializePhysics,RAPIER,BattlePhysics} from './physics.js';
import {createCharacterGeometry} from './character-mesh.js';
import {loadCivilianArt} from './civilian-art.js';
import {createHeroVisualPool} from './shared-hero-visuals.js';
import {createSettlementEconomy} from './settlement-economy.js';
import {createSettlementFoodArt} from './settlement-food-art.js';
import {createGardenImprovementArt} from './garden-improvement-art.js';
import {createQuarrySafety} from './quarry-safety.js';
import {createCivilianQuarryContact} from './civilian-quarry-contact.js';
import {createCivilianMotion} from './civilian-motion.js';
import {createCivilianTraffic} from './civilian-traffic.js';
import {createCivilianNavigation} from './civilian-navigation.js';
import {supportedCivilianPoint} from './civilian-ground-point.js';
import {createSettlementWorld} from './settlement-world.js';
import {createSettlementEnvironmentArt} from './settlement-environment-art.js';
import {createSettlementMinimalHUD} from './settlement-minimal-hud.js';
import {createSettlementWorldCues} from './settlement-world-cues.js';
import {createSettlementNeedCue} from './settlement-next-need.js';
import {createStrandedFoodCourierCue} from './stranded-food-courier.js';
import {createHeldFoodDestinationCue} from './held-food-destination.js';
import {createSettlementWorldActions,physicalRootFromPelvis} from './settlement-world-actions.js';
import {createSettlementRecruit} from './settlement-recruit.js';
import {createResourceStoneMesh} from './settlement-resource-art.js';
import {createVisibleSurfacePicker} from './visible-surface-picker.js';
import {createResourceStonePicker} from './resource-stone-picker.js';
import {createSelectionCue} from './selection-cue.js';
import {createGodHandRig} from './stone-hand-rig.js';
import {createDesktopHandMotion} from './desktop-hand-motion.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),manual=new URLSearchParams(location.search).has('capture');
// Share the real economy reach contract with source approach planning.
const SOURCE_REACH=1.3,SOURCE_WORK_REACH=.55,SOURCE_APPROACH_MARGIN=.05;
let villageXR=null,xrHands=null,surfacePicker=null;
let renderer,scene,camera,world,sim,rig,hero,environment,motion,traffic,navigation,jobs,hud,picker,selectionCue,hand,handMotion,quarrySafety,quarryContact,recruit,loadHandoff,foodArt,worldCues,worldActions,pickupCarrier=null;
let controlsOpen=false,detailsOpen=false,worldPress=null,planningPress=null,hoveredWorldSite=null,worldNotice='',worldNoticeUntil=0;
let priorityNotice='',priorityNoticeUntil=0;
function currentWorldNotice(){
 if(sim.time<worldNoticeUntil)return worldNotice;
 const heldFood=sim.activeGrabs().some(g=>loads.some(r=>r.kind==='food'&&r.body===g.body));
 return sim.time<priorityNoticeUntil&&!heldFood?priorityNotice:'';
}
const supplyNeedCue=createSettlementNeedCue(),strandedCourierCue=createStrandedFoodCourierCue();let needPresentation=null,courierPresentation=null;
const heldFoodDestinationCue=createHeldFoodDestinationCue();
let defense=null,raid=null,raiderPool=null,windupCue=null,combatFeedback=null;
let placementAssessmentCache=null,blessing=null,gardenArt=null,gardenSite=null;
const blessIntent=createDesktopBlessIntent(),workerOrders=createSettlementWorkerOrders();
let visuals=[],rockVisuals=[],loads=[],villagers=[],events=[],started=false,paused=false,notice='',noticeUntil=0,drawCount=0,pickingDirty=false,missionStopped=false;
const retiredLoads=[],retirePending=new Set();
const cameraState={yaw:.14,pitch:.62,distance:44,target:V(5.2,-.75,-5.8)},pointer={x:0,y:0,inside:false,down:false,orbit:false,pan:false,cameraButton:null,captureId:null,captureRecovery:null,lastX:0,lastY:0,grabY:1,offset:V(),hover:V(4,3,-2)},raycaster=new THREE.Raycaster(),plane=new THREE.Plane(V(0,1,0),-3);
// Keep cue clipping/query state separate from the unchanged press/drag ray.
const cueRaycaster=new THREE.Raycaster();
const desktopDrag=createDesktopDragSpace(THREE);let desktopPointerTime=0;
const desktopNavigation=createDesktopSettlementNavigation({THREE,state:cameraState,getBounds:()=>environment?.bounds});
const grabIntent=createDesktopGrabIntent({validate:validPressTarget,commit:commitPressTarget});
const id=c=>'villager-'+c.id,pendingRelease=new Set(),foodWaiters=new WeakSet();
const pendingStoneDelivery=createPendingPhysicalDelivery();
function isBodyHeld(body){return sim.activeGrabs().some(grab=>grab.body===body);}
function deliveryPhysical(r){return{load:r,body:r.body,enabled:loads.includes(r)&&r.body.isEnabled(),held:isBodyHeld(r.body),owner:r.owner};}
function state(){return{xr:villageXR?.state()??null,desktopCamera:desktopNavigation.state(),navigation:navigation?.state()??null,traffic:traffic?{yielding:traffic.state(),passing:traffic.passingState()}:null,workerOrders:workerOrders.state(),defense:defense?.state()??null,raid:raid?.state()??null,combatFeedback:combatFeedback?.stats??null,blessing:blessing?.state()??null,blessIntent:blessIntent.state(),worldActions:worldActions?.state()??null,worldCues:worldCues?.state()??null,placementReadiness:placementAssessmentCache?.sim===sim&&sim.isCharacterHeld(placementAssessmentCache.character)?placementAssessmentCache.assessment:null,supplyNeed:supplyNeedCue.state(),strandedCouriers:strandedCourierCue.state(),controlsOpen,detailsOpen,time:sim.time,started,paused,drawCount,grabIntent:grabIntent.state(),selectionCue:selectionCue?.state()??null,picking:picker?.state()??null,jobs:jobs.snapshot(),recruit:recruit.state(motion),villagers:villagers.map(c=>({id:id(c),hp:c.hp,...motion.status(c)})),loads:loads.map(r=>({id:r.id,kind:r.kind,quantity:r.quantity,owner:r.owner,position:r.body.translation(),velocity:r.body.linvel(),enabled:r.body.isEnabled()})),events:events.slice(-50),bridgeComplete:environment.complete,quarrySafety:{...quarrySafety.state(),blockedLoads:loads.filter(r=>r.quarryBlocked).map(r=>r.id)}};}
function setCamera(){blessIntent.cancel('camera');grabIntent.cancel('camera');selectionCue?.invalidate('camera');const a=cameraState;camera.position.set(a.target.x+Math.sin(a.yaw)*Math.cos(a.pitch)*a.distance,a.target.y+Math.sin(a.pitch)*a.distance,a.target.z+Math.cos(a.yaw)*Math.cos(a.pitch)*a.distance);camera.lookAt(a.target);camera.updateMatrixWorld(true);}
function dropLoad(r){if(r.owner==='delivered'||r.owner==='lost')return;const carrier=pickupCarrier?.hp>0&&r.owner===id(pickupCarrier)?pickupCarrier:null,velocity=V().copy(r.body.linvel());loadHandoff.clear(r);r.owner=null;r.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);r.body.setLinvel(velocity.clampLength(0,5),true);r.collider.setCollisionGroups(0xffffffff);if(carrier)loadHandoff.begin(r,carrier);}
function createLoad({id:loadId,kind='stone',quantity=1,position,sourceId='quarry'}){
 const radius=kind==='food'?.40:.31,r=sim.addRock(position.x,position.z,radius);r.id=loadId;r.kind=kind;r.quantity=quantity;r.sourceId=sourceId;r.owner=null;r.body.setTranslation(position,true);
 if(kind==='food'){r.harmless=true;r.collider.setMass(.45);r.body.recomputeMassPropertiesFromColliders();}
 const mesh=kind==='food'?foodArt.createFoodLoadVisual({kind,yield:quantity}):createResourceStoneMesh({THREE,radius});mesh.name='mission_load_'+loadId;mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);loads.push(r);rockVisuals.push(mesh);pickingDirty=true;return r;
}
function retireLoad(r){loadHandoff.clear(r);pendingRelease.delete(r);pendingStoneDelivery.delete(r);r.body.setEnabled(false);retirePending.add(r);pickingDirty=true;}
function pruneRetiredLoads(){for(const r of retirePending){if(sim.activeGrabs().some(g=>g.body===r.body))continue;const i=loads.indexOf(r);if(i<0)continue;retiredLoads.push({id:r.id,kind:r.kind,owner:r.owner,time:sim.time});if(retiredLoads.length>128)retiredLoads.shift();sim.colliderOwners.delete(r.collider.handle);world.removeRigidBody(r.body);sim.rocks.splice(sim.rocks.indexOf(r),1);scene.remove(rockVisuals[i]);rockVisuals.splice(i,1);loads.splice(i,1);retirePending.delete(r);}}
function refreshPicking(){if(!hand||!hud)return;const heldCue=selectionCue?.captureHeld({sim});selectionCue?.dispose();picker?.dispose();const meshes=[...rockVisuals,quarrySafety.visual],rocks=[...loads,quarrySafety.rock];picker=createVisibleSurfacePicker({THREE,scene,visuals,rockVisuals:meshes,rocks,scenery:[...(raid?.scenery??[]),...environment.scenery,...quarrySafety.scenery,...foodArt.scenery,...(gardenArt?.scenery??[]),...(defense?.scenery??[]),...(worldCues?.hitMeshes??[]),...(worldCues?.occlusionMeshes??[])],rival:null,sim});surfacePicker=picker;const stoneIndices=loads.map((r,i)=>r.kind==='stone'?i:-1).filter(i=>i>=0);picker=createResourceStonePicker({THREE,picker,scene,camera,sim,resources:stoneIndices.map(i=>loads[i]),meshes:stoneIndices.map(i=>rockVisuals[i]),getViewport:()=>renderer.domElement.getBoundingClientRect(),isScreenBlocked:(x,y)=>hud.contains(x,y)});selectionCue=createSelectionCue({THREE,scene,visuals,rockVisuals:meshes,rocks,picker,showHealth:!!raid?.state().enabled});if(heldCue)selectionCue.restoreHeld(heldCue,{sim});pickingDirty=false;}
function process(result){if(result.reason==='access-stone-budget'){worldNotice='KEEP STONE FOR FARM BRIDGE + STORES';worldNoticeUntil=sim.time+4;}if(result.reason==='defense-stone-budget'){worldNotice=result.defenseUpgrade?.budget?.message??'KEEP STONE FOR STORES + CURRENT BUILD';worldNoticeUntil=sim.time+4;}if(result.reason==='garden-stone-budget'){worldNotice=result.gardenUpgrade?.budget?.message??'MORE STONE IS NEEDED FOR THE GARDEN';worldNoticeUntil=sim.time+4;}for(const e of result.events||[]){events.push({t:sim.time,...e});if(events.length>400)events.shift();recruit?.observeEvent(e);raid?.observe(e);let r=loads.find(r=>r.id===e.stoneId);
 if(e.type==='work-order-fallback'){worldNotice=e.reason==='source-depleted'?'WORK SITE EMPTY, FINDING OTHER WORK':'WORK SITE UNAVAILABLE, FINDING OTHER WORK';worldNoticeUntil=sim.time+4;}
 if(e.type==='resource-produced'){const c=villagers.find(c=>id(c)===e.villagerId),point=c?V().copy(motion.status(c).carryPoint).add(V(0,.12,0)):e.position;r=createLoad({id:e.stoneId,kind:e.kind,quantity:e.quantity,position:point,sourceId:e.sourceId});}
 if(e.type==='job-retargeted'&&r){r.routeStage=0;if(e.reason==='access-stone-budget'){worldNotice='KEEP STONE FOR FARM BRIDGE + STORES';worldNoticeUntil=sim.time+4;}if(['garden-stone-budget','defense-stone-budget'].includes(e.reason)){worldNotice=e.budget?.message??'STONE RESERVED FOR EXISTING COMMITMENTS';worldNoticeUntil=sim.time+4;}}
 if(e.type==='stone-picked-up'&&r){loadHandoff.clear(r);if(r.kind==='stone'&&r.sourceId!=='pantry')quarrySafety.extraction(e.stoneId);r.routeStage=0;r.owner=e.villagerId;r.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);r.body.setNextKinematicTranslation(r.body.translation());const c=villagers.find(c=>id(c)===r.owner),bit=1<<(c.id+1);r.collider.setCollisionGroups(((1<<16)|(0xffff^bit))>>>0);}
 if(e.type==='stone-dropped'&&r&&r.owner!=='player')dropLoad(r);
 if(e.type==='stone-taken'&&r){if(r.kind==='stone'&&r.sourceId!=='pantry')quarrySafety.extraction(e.stoneId);dropLoad(r);r.owner='player';}
 if((e.type==='stone-delivered'||e.type==='food-delivered')&&r){const worker=villagers.find(c=>id(c)===e.villagerId);if(worker)worker.completedDelivery=true;r.owner='delivered';retireLoad(r);if(e.siteId==='brace')quarrySafety.updateBrace(e.delivered);else if(e.siteId==='bridge')environment.update(e.delivered);else if(e.siteId==='defense'){defense.update(e.delivered);pickingDirty=true;}for(const handle of environment.groundColliders)motion.addGroundCollider(handle);notice=e.type==='food-delivered'?'FOOD STORED':e.siteId==='pantry'?'STONE STORED':e.siteId==='brace'?'BRACE COURSE BUILT':e.siteId==='garden-upgrade'?'GARDEN COURSE BUILT':e.siteId==='defense'?(defense.state().blocked?'STONE SET ASIDE FOR BARRIER':'STONE BARRIER COURSE BUILT'):'BRIDGE SECTION BUILT';noticeUntil=sim.time+2;}
 if(e.type==='stone-lost'&&r){r.owner='lost';retireLoad(r);notice=r.kind==='food'?'FOOD LOST BELOW THE ISLAND':'STONE LOST BELOW THE ISLAND';noticeUntil=sim.time+4;}
 if(e.type==='site-complete'){notice=e.siteId==='brace'?'QUARRY BRACE COMPLETE':e.siteId==='garden-upgrade'?'GARDEN NOW GROWS LARGER HARVESTS':e.siteId==='defense'?(defense.state().complete?'STONE BARRIER COMPLETE':'BARRIER MATERIALS DELIVERED'):'ISLAND ROUTE OPEN';noticeUntil=sim.time+4;}
 }return result;}
function quarryBlocksMove(r,delta){if(!r.body.isEnabled())return false;const hit=world.castShape(r.body.translation(),r.body.rotation(),delta,r.collider.shape,.012,1,false,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,r.body,c=>c.handle===quarrySafety.rock.collider.handle);return !!hit&&hit.time_of_impact<1;}
function observe(){return{productionBudget:Math.max(0,12-loads.filter(r=>r.owner!=='delivered'&&r.owner!=='lost').length),recruit:{joined:recruit.state(motion).joined,lost:['dead','lost'].includes(recruit.state(motion).phase)},bridgeAvailable:environment.complete,villagers:villagers.map(c=>({id:id(c),position:motion.status(c).position,alive:c.hp>0&&c.parts[1].body.translation().y>-10,hp:c.hp,available:motion.status(c).available&&c.hp>0&&(c!==recruit.character||recruit.state(motion).availableForJobs)})),stones:loads.map(r=>{const p=r.body.translation(),held=isBodyHeld(r.body),carried=r.owner&&r.owner!=='player'&&r.owner!=='delivered'&&r.owner!=='lost',ground=environment.support(p.x,p.z),quiet=V().copy(r.body.linvel()).length()<1.25;r.quarryBlocked=!held&&!carried&&r.owner!=='delivered'&&r.owner!=='lost'&&quarryBlocksMove(r,V(0,1.45,0));return{id:r.id,position:p,available:!!carried||(!held&&r.owner!=='delivered'&&r.owner!=='lost'&&p.y-ground<.75&&p.y-ground>-.2&&quiet&&!r.quarryBlocked),held:!!held,owner:held?'player':carried?r.owner:null};})};}
function beforeStep(dt){
 defense?.step();
 raid?.update();
 pruneRetiredLoads();
 loadHandoff.step();
 quarrySafety.step(dt);
 recruit.update(motion);
 for(const r of loads){const p=r.body.translation();if(r.owner!=='delivered'&&r.owner!=='lost'&&!isBodyHeld(r.body)&&p.y < -10){const stone=jobs.snapshot().stones.find(s=>s.id===r.id);process(jobs.command({type:'mark-stone-lost',stoneId:r.id,expectedRevision:stone.revision}));}}
 // Reuse the observation result until the next command/update. Never retain
 // this snapshot across a mutation or a native step.
 const observed=process(jobs.update(0,observe()));
 if(worldActions){const action=worldActions.update(worldActionFrame(observed));worldActionFeedback(action);if(action.command)worldActionFeedback(worldActions.acknowledge(process(jobs.command(action.command)),action.command));const state=worldActions.state(),pendingIds=new Set([...state.pendingOrders,...(state.awaiting?[state.awaiting]:[])].map(order=>order.villagerId));for(const c of villagers)if(!pendingIds.has(id(c)))motion.cancelPlacement?.(c,'placement-intent-ended');}
 for(const r of pendingStoneDelivery.resources()){const command=pendingStoneDelivery.takeRetry({snapshot:jobs.snapshot(),physical:deliveryPhysical(r)});if(command)process(jobs.command(command));}
 for(const r of [...pendingRelease]){const s=jobs.snapshot().stones.find(s=>s.id===r.id);if(s.status!=='available'||!s.releasedByPlayer){pendingRelease.delete(r);continue;}if(s.available){const p=r.body.translation(),snapshot=jobs.snapshot(),site=[...snapshot.sites.filter(a=>!a.complete),{id:snapshot.pantry.id,position:snapshot.pantry.position}].filter(a=>r.kind!=='food'||a.id===snapshot.pantry.id).sort((a,b)=>Math.hypot(p.x-a.position.x,p.z-a.position.z)-Math.hypot(p.x-b.position.x,p.z-b.position.z))[0];if(site){const result=process(jobs.command({type:'deliver-stone',siteId:site.id,stoneId:r.id,expectedRevision:s.revision}));if(pendingStoneDelivery.remember({snapshot:result,physical:deliveryPhysical(r),siteId:site.id,result})){worldNotice='WAITING FOR FOOD TO BUILD HERE';worldNoticeUntil=sim.time+4;}}pendingRelease.delete(r);}}
 const snapshot=process(jobs.update(dt,observe())),intents=new Map();
 for(const c of villagers){const j=snapshot.villagers.find(v=>v.id===id(c));let target=j.target?{...j.target}:null,activity=j.intent==='move'?'walk':['working','harvesting','mining','delivering'].includes(j.phase)?'work':'idle',carrying=!!j.stoneId&&loads.find(r=>r.id===j.stoneId)?.owner===id(c);
  // Food pauses the stone job, not the worker's ability to clear a doorway.
  // Walk to an authored waiting stance while retaining the real paused claim
  // and any carried body. A frozen miner beside Stores can otherwise prevent
  // the only food courier from reaching the meal that would unblock them.
  const hungry=j.role==='stone'&&j.blocked==='empty-pantry';
  if(!hungry)foodWaiters.delete(c);
  else if(Math.hypot(j.position.x-snapshot.pantry.position.x,j.position.z-snapshot.pantry.position.z)<=5 ||
    snapshot.villagers.some(w=>w.role==='food'&&w.available&&w.intent==='move'&&
      Math.hypot(j.position.x-w.position.x,j.position.z-w.position.z)<2.4))foodWaiters.add(c);
  // Commit only a nearby obstruction to clearing for this food pause. A miner
  // waiting harmlessly at the distant quarry must not lose its trip. Once a
  // clearing walk starts, keep its target stable until food/work resumes.
  const waitingForFood=hungry&&foodWaiters.has(c);
  if(waitingForFood||(j.phase==='idle'&&!j.preferredSourceId))target={...environment.idleHome[c.id%environment.idleHome.length]};
  if(waitingForFood)activity='walk';
  const source=!waitingForFood&&j.phase==='to-source'?[snapshot.quarry,...snapshot.forageSources,snapshot.pantry].find(source=>source.id===j.sourceId):null;
  intents.set(c,c===recruit.character&&!recruit.state(motion).joined?recruit.intent():{target,activity,carrying,speed:1.12,goalRadius:waitingForFood?.25:j.phase==='to-stone'?.97:j.phase==='to-site'?1.45:j.phase==='to-source'?SOURCE_WORK_REACH-SOURCE_APPROACH_MARGIN:.25,goalRegion:source?{center:source.position,radius:SOURCE_REACH-SOURCE_APPROACH_MARGIN}:null,stopDistance:waitingForFood?.12:j.phase==='to-stone'?.80:j.phase==='to-source'?.02:.12,ignoreBody:loads.find(r=>r.id===j.stoneId)?.body});
 }
 traffic.update(dt,intents);navigation.update(dt,intents);traffic.afterNavigation(intents);motion.update(dt,intents);
 for(const r of loads)if(r.owner&&r.owner!=='player'&&r.owner!=='delivered'&&r.owner!=='lost'){const c=villagers.find(c=>id(c)===r.owner),goal=V().copy(motion.status(c).carryPoint).add(V(0,.12,0)),p=V().copy(r.body.translation()),d=goal.sub(p);const delta=d.multiplyScalar(Math.min(1,2.4*dt/(d.length()||1)));if(quarryBlocksMove(r,delta)){const job=jobs.snapshot().villagers.find(v=>v.id===id(c));process(jobs.command({type:'interrupt-villager',villagerId:job.id,expectedRevision:job.revision}));notice='THE BOULDER IS BLOCKING A STONE';noticeUntil=sim.time+4;continue;}p.add(delta);r.body.setNextKinematicTranslation(p);r.body.setNextKinematicRotation(new THREE.Quaternion().setFromAxisAngle(V(0,1,0),motion.status(c).yaw));}
 quarryContact?.beforeStep(dt);
}
function syncVisuals(dt,snapshot=jobs.snapshot()){const presentationCamera=villageXR?.getViewCamera()??camera;raid?.presentation(presentationCamera);windupCue?.update();combatFeedback?.update();foodArt.sync(snapshot);if(gardenArt){const source=snapshot.forageSources.find(row=>row.id==='mainland-forage');gardenArt.update({...snapshot.gardenUpgrade,abundance:source?source.remaining/Math.max(1,source.reserve):0});}recruit.sync();quarrySafety.sync({blocked:loads.some(r=>r.quarryBlocked)});for(const v of visuals){v.c.parts.forEach((p,i)=>{v.bones[i].position.copy(p.body.translation());v.bones[i].quaternion.copy(p.body.rotation());});v.skeleton.update();}
 loads.forEach((r,i)=>{const m=rockVisuals[i];m.visible=r.body.isEnabled();m.position.copy(r.body.translation());m.quaternion.copy(r.body.rotation());});
 if(!villageXR?.isActive()){
 const pose=sim.grab?'pinch':'open';hand.poseTo(pose,.22);hand.update(dt);const anchor=sim.grab?V().copy(sim.grab.body.translation()).add(sim.grab.local.clone().applyQuaternion(new THREE.Quaternion().copy(sim.grab.body.rotation()))):null;
 const handState=handMotion.update({dt,target:sim.grab?.target??pointer.hover,anchor,pose,releaseRight:V(1,0,0).applyQuaternion(camera.quaternion)});
 // Match the shipped desktop grab presentation: show contact and the bounded
 // release motion, then expose the pickup surface during passive hover.
 hand.group.visible=(pointer.inside||!!sim.grab)&&(!!sim.grab||handState.releasing);}else hand.group.visible=false;scene.updateMatrixWorld(true);if(pickingDirty)refreshPicking();
}
function updateSelectionCue(){
 // Reuse the exact visible-surface owner and the cue's bounded input/pose
 // refresh. These gates are cosmetic and never acquire/release native bodies.
 const blocked=villageXR?.isActive()?'xr':!started?'not-started':paused?'paused':document.visibilityState!=='visible'?'hidden':!pointer.inside?'outside':pointer.orbit?'orbit':hud.contains(pointer.lastX,pointer.lastY)?'ui':null;
 if(blocked){selectionCue.suspend(blocked);return;}
 selectionCue.update({camera,pointer,sim,raycaster:cueRaycaster,width:innerWidth,height:innerHeight});
}
function heldPlacementAssessment(worker){
 if(!worker){placementAssessmentCache=null;return null;}
 const character=villagers.find(c=>id(c)===worker.id);if(!character)return null;
 // Only presentation requests this query. Repeated renders of one native tick
 // reuse it; release and physics/controller paths never consume the cache.
 if(placementAssessmentCache?.sim!==sim||placementAssessmentCache.character!==character||placementAssessmentCache.tick!==sim.tick)
  placementAssessmentCache={sim,character,tick:sim.tick,assessment:motion.assessPlacement?.(character)??null};
 return placementAssessmentCache.assessment;
}
// Fresh read-only physical observations. The island footprint is the actual
// existing top mesh, and body/character objects prevent stale-ID reuse.
function courierPhysicalFrame(frame){
 const farmRegion=environment.regions?.find(region=>region.id==='farm');
 const activeGrabs=sim.activeGrabs(),yielding=traffic.state(),passing=traffic.passingState().active;
 const trafficWorkerIds=[...yielding.map(row=>'villager-'+row.id),...(passing?[passing.escaper,passing.peer].map(n=>'villager-'+n):[])];
 return{physical:{generation:frame.snapshot.generation,bridgeComplete:environment.complete,
  workers:frame.workers.map(worker=>{const c=villagers.find(c=>id(c)===worker.id),status=motion.status(c),p=worker.position;
   return{...worker,character:c,navigationId:c.id,blocked:status.blocked,carryPoint:{...status.carryPoint,y:status.carryPoint.y+.12},
    onIsland:!!farmRegion?.contains(p.x,p.z)};}),
  loads:loads.map(load=>({id:load.id,load,body:load.body,kind:load.kind,sourceId:load.sourceId,owner:load.owner,
   enabled:load.body.isValid()&&load.body.isEnabled()&&world.getRigidBody(load.body.handle)===load.body,
   held:activeGrabs.some(grab=>grab.body===load.body),position:load.body.translation()}))},navigation:navigation.state(),trafficWorkerIds};
}
function courierHover(){
 const hover=selectionCue.hover({sim,pointer});
 return hover?{workerId:hover.character?id(hover.character):null,loadId:loads.find(load=>load.body===hover.body)?.id??null}:null;
}
function render(dt=0){
 villageXR?.syncDesktopUI({detailsOpen,width:innerWidth});
 blessIntent.observe({x:pointer.lastX,y:pointer.lastY,now:performance.now()});
 grabIntent.advance({x:pointer.lastX,y:pointer.lastY,now:performance.now()});
 // Input callbacks above may issue commands. Sample after them, then share only
 // through these read-only presentation consumers.
 const snapshot=jobs.snapshot(),desktop=!villageXR?.isActive();syncVisuals(dt,snapshot);
 const frame=worldActionFrame(snapshot),presentationCamera=villageXR?.getViewCamera()??camera;workerOrders.sync(workerOrderFrame(frame));const selectedWorker=frame.workers.find(w=>w.id===workerOrders.state().selectedWorkerId);const heldWorker=frame.workers.find(w=>w.held),placementPreview=worldActions?.preview(frame),placementAssessment=heldPlacementAssessment(heldWorker);
 const placementHint=placementAssessment?.ready?`Release here for ${placementPreview?.role==='stone'?'Stone':'Food'} after recovery`:placementAssessment?.reason==='obstructed'?'Move to clear ground before releasing':placementAssessment?.reason==='unsupported'?'Lower the feet to the ground':placementAssessment?.reason==='too-low'?'Raise the villager slightly':placementAssessment?.reason==='too-high'?'Lower the villager slightly':placementAssessment?.reason==='not-upright'?'Hold the villager upright':placementAssessment&&!placementAssessment.ready?'Hold still before releasing':null;
 const displayPreview=placementPreview?.eligible&&placementHint?{...placementPreview,hint:placementHint}:placementPreview;
 // Consume the existing bounded hover without another surface query. A new
 // hover may reveal its hint on the next rendered frame.
 const blessHover=desktop&&started&&!paused&&!missionStopped&&!controlsOpen&&!detailsOpen&&!hud.contains(pointer.lastX,pointer.lastY)?selectionCue.hover({sim,pointer}):null;
 const hoveredPower=blessing?.targetPower(blessHover);
 const blessHint=hoveredPower?(blessing.state().cooldown>0?(hoveredPower==='bless'?'BLESS RECOVERING':'LIGHTNING RECOVERING'):hoveredPower==='bless'?'SHIFT+CLICK TO BLESS':'SHIFT+CLICK FOR LIGHTNING'):null;
 const heldFood=heldFoodDestinationCue.update({active:frame.active,snapshot:frame.snapshot,sim,world,loads,pantry:foodArt.pantry,control:worldCues?.getControl('stockpile')});
 const foodDestination=heldFood&&!heldWorker&&!controlsOpen&&!detailsOpen&&!(worldNotice&&sim.time<worldNoticeUntil)&&quarrySafety.state().phase!=='warning'&&!blessHint?heldFood:null;
 worldCues?.update({selectedWorker,defenseConstruction:defense?.state(),jobs:frame.snapshot,camera:presentationCamera,heldWorker,placementPreview,placementAssessment,hoveredSite:hoveredWorldSite,workers:frame.workers,needCue:needPresentation,courierCue:courierPresentation,courierHover:courierHover(),foodDestination});
 // Rebuild immediately on the first desktop frame after XR, including resize.
 if(desktop)hud.update({selectedWorker,width:innerWidth,height:innerHeight,started,paused,raid:raid?.state(),heldRaider:!!sim.grab&&raid?.raiders.some(c=>c.parts.some(p=>p.body===sim.grab.body)),fallenWorkers:frame.workers.filter(w=>w.hp>0&&w.mode==='ragdoll').length,jobs:frame.snapshot,recruit:recruit.state(motion),hazard:{...quarrySafety.state(),blockedLoads:loads.filter(r=>r.quarryBlocked).map(r=>r.id)},notice:currentWorldNotice(),held:!!sim.grab,heldWorker,heldFood,placementPreview:displayPreview,blessHint,controlsOpen,detailsOpen,alive:villagers.filter(c=>c.hp>0).length});
 updateSelectionCue();const cue=selectionCue.state(),meshName=!cue.dirty?cue.query?.mesh:null;
 const canHoverWorld=!sim.grab&&!pointer.down&&!pointer.orbit&&pointer.inside&&document.visibilityState==='visible'&&!paused&&!missionStopped&&!hud.contains(pointer.lastX,pointer.lastY);
 if(!started&&canHoverWorld){
  // Opening discovery uses the same visible, depth-checked sign as a click.
  // Planning selection is separate; no hover grab or simulation begins.
  cueRaycaster.setFromCamera(pointer,camera);hoveredWorldSite=worldControlHit(cueRaycaster)?.id??null;
 }else hoveredWorldSite=canHoverWorld?worldCues?.controls.find(control=>control.meshes.some(mesh=>mesh.name===meshName))?.id??null:null;
 const needActive=started&&!paused&&!missionStopped&&document.visibilityState==='visible';
 const needBlocked=!!sim.grab||pointer.down||pointer.orbit||controlsOpen||detailsOpen||sim.time<worldNoticeUntil;
 const urgentHazard=quarrySafety.state().phase==='warning';
 const otherSiteFocus=!!hoveredWorldSite&&hoveredWorldSite!==supplyNeedCue.state().need?.siteId;
 const courierState=strandedCourierCue.update({snapshot:frame.snapshot,...courierPhysicalFrame(frame),time:sim.time,active:needActive,blocked:needBlocked||urgentHazard});
 courierPresentation=needActive&&!needBlocked?courierState:null;
 const needState=supplyNeedCue.update({snapshot:frame.snapshot,time:sim.time,active:needActive,blocked:needBlocked||urgentHazard||otherSiteFocus,excludedDeliveries:courierState.excludedDeliveries});
 needPresentation=needActive&&!needBlocked?needState:null;
 worldCues?.update({selectedWorker,defenseConstruction:defense?.state(),jobs:frame.snapshot,camera:presentationCamera,heldWorker,placementPreview,placementAssessment,hoveredSite:hoveredWorldSite,workers:frame.workers,needCue:needPresentation,courierCue:courierPresentation,courierHover:courierHover(),foodDestination});
 selectionCue.setPowerAvailability(blessHint?{power:hoveredPower,ready:blessing.state().cooldown<=0}:{});
 blessing?.update();
 renderer.clear();renderer.render(scene,camera);if(!villageXR?.isActive()){renderer.clearDepth();renderer.render(hud.scene,hud.camera);}drawCount++;
}
function advanceSimulation(dt){if(!villageXR?.shouldHoldSimulation()&&started&&!paused&&document.visibilityState==='visible'&&jobs.outcomeStatus()==='playing')sim.step(dt);if(!missionStopped&&jobs.outcomeStatus()!=='playing'){missionStopped=true;cancelInput();pruneRetiredLoads();if(pickingDirty)refreshPicking();}}
function step(dt=1/60){advanceSimulation(dt);render(dt);return state();}
function updatePointer(e){const rect=renderer.domElement.getBoundingClientRect();pointer.x=(e.clientX-rect.left)/rect.width*2-1;pointer.y=-(e.clientY-rect.top)/rect.height*2+1;pointer.inside=e.clientX>=rect.left&&e.clientX<rect.right&&e.clientY>=rect.top&&e.clientY<rect.bottom;selectionCue?.invalidate('pointer');if(!pointer.inside||hud.contains(e.clientX,e.clientY))selectionCue?.suspend(pointer.inside?'ui':'outside');raycaster.setFromCamera(pointer,camera);plane.constant=-3;raycaster.ray.intersectPlane(plane,pointer.hover);}
function resetThrowSample(){if(sim.grab){sim.grab.velocity.set(0,0,0);sim.grab.lastMoveTime=-99;}desktopPointerTime=performance.now();}
function rebaseDrag(){if(!sim.grab)return;updatePointer({clientX:pointer.lastX,clientY:pointer.lastY});desktopDrag.rebase(camera,raycaster.ray,sim.grab.target);resetThrowSample();}
function recordPressTarget(hit){
 if(!hit?.body)return null;
 const body=hit.body,rotation=new THREE.Quaternion().copy(body.rotation()).invert(),origin=V().copy(body.translation()),resource=loads.find(r=>r.body===body)??null,jobState=jobs.snapshot();
 return{...hit,characterAlive:hit.character?hit.character.hp>0:null,local:hit.point.clone().sub(origin).applyQuaternion(rotation),surfaceLocal:V().fromArray(picker.state().surface).sub(origin).applyQuaternion(rotation),pressRay:raycaster.ray.clone(),nativeOwner:sim.colliderOwners.get(hit.collider.handle),resource,resourceOwner:resource?.owner,jobOwner:resource?jobState.stones.find(s=>s.id===resource.id)?.owner:null,jobGeneration:jobState.generation,world,simTime:sim.time,simTick:sim.tick};
}
function validPressTarget(target){
 if(!started||paused||jobs.outcomeStatus()!=='playing'||document.visibilityState!=='visible'||!pointer.down||!pointer.inside||pointer.orbit||hud.contains(pointer.lastX,pointer.lastY)||sim.disposed||sim.grab||world!==target.world||sim.time<target.simTime||sim.tick<target.simTick)return false;
 const jobState=jobs.snapshot();if(jobState.generation!==target.jobGeneration)return false;
 const {body,collider,character,part,nativeOwner,resource}=target;
 if(!body.isValid()||!body.isEnabled()||world.getRigidBody(body.handle)!==body||!collider?.isValid()||!collider.isEnabled()||collider.isSensor()||collider.parent()!==body||world.getCollider(collider.handle)!==collider||sim.colliderOwners.get(collider.handle)!==nativeOwner)return false;
 if(sim.activeGrabs().some(g=>g.body===body))return false;
 if(character){if((!villagers.includes(character)&&!raid?.owns(character))||!sim.characters.includes(character)||(character.hp>0)!==target.characterAlive||!character.parts.includes(part)||part.body!==body||nativeOwner?.character!==character||sim.isCharacterHeld(character))return false;}
 else if(nativeOwner?.type!=='rock'||nativeOwner.rock.body!==body||!sim.rocks.includes(nativeOwner.rock))return false;
 if(resource){const stone=jobState.stones.find(s=>s.id===resource.id);if(!loads.includes(resource)||resource.body!==body||resource.owner!==target.resourceOwner||['delivered','lost','player'].includes(resource.owner)||!stone||stone.owner!==target.jobOwner||['delivered','lost','player-held'].includes(stone.status))return false;}
 return true;
}
function commitPressTarget(target,reason,now){
 blessIntent.cancel('grab');workerOrders.clear('grab');
 const {body,character,resource}=target,rotation=new THREE.Quaternion().copy(body.rotation()),origin=V().copy(body.translation()),point=target.local.clone().applyQuaternion(rotation).add(origin),surface=target.surfaceLocal.clone().applyQuaternion(rotation).add(origin);
 // Rebase at the moving contact, while retaining the complete deliberate
 // pointer displacement on the event that crosses the movement threshold.
 if(!desktopDrag.begin(camera,reason==='movement'?target.pressRay:raycaster.ray,point))return false;
 if(resource){const stone=jobs.snapshot().stones.find(s=>s.id===resource.id);if(!process(jobs.command({type:'take-stone',stoneId:resource.id,expectedRevision:stone.revision})).ok){desktopDrag.clear();return false;}pendingRelease.delete(resource);pendingStoneDelivery.delete(resource);}
 if(character&&villagers.includes(character)){motion.cancelPlacement?.(character,'regrab');worldActionFeedback(worldActions?.cancelWorker(id(character),'regrab'));pickupCarrier=character;try{motion.interrupt(character);}finally{pickupCarrier=null;}}
 sim.grabBody(body,point,point,{inputSource:'desktop'});
 if(sim.grab?.body!==body){desktopDrag.clear();return false;}
 worldPress=null;worldNotice='';
 selectionCue.acquire({...target,point},surface.toArray(),{sim});
 // The first move consumes the full press displacement, so its throw sample
 // must span that same interval rather than only the last subthreshold event.
 desktopPointerTime=reason==='movement'?target.startedAt:now;
 return true;
}
function effectiveReleaseSpeed(){const held=sim?.activeGrabs()??[],g=sim?.grab??(held.length===1?held[0]:null);return g?g.velocity.length()*Math.exp(-Math.max(0,sim.time-g.lastMoveTime-.025)/.045):0;}
function grabXRTarget(side,hit,scale){
 if(!started||paused||missionStopped||!hit?.body||!sim.xrCanGrabBody(side,hit.body))return false;
 const {body,character}=hit,resource=loads.find(r=>r.body===body);
 if(!body.isValid()||!body.isEnabled()||world.getRigidBody(body.handle)!==body)return false;
 if(character&&!villagers.includes(character)&&!raid?.owns(character))return false;
 if(resource){const row=jobs.snapshot().stones.find(s=>s.id===resource.id);if(!row||!process(jobs.command({type:'take-stone',stoneId:resource.id,expectedRevision:row.revision})).ok)return false;pendingRelease.delete(resource);pendingStoneDelivery.delete(resource);}
 if(character&&villagers.includes(character)){motion.cancelPlacement?.(character,'xr-regrab');worldActionFeedback(worldActions.cancelWorker(id(character),'xr-regrab'));pickupCarrier=character;try{motion.interrupt(character);}finally{pickupCarrier=null;}}
 workerOrders.clear('xr-grab');const acquired=sim.xrGrabBody(side,body,hit.point,hit.point,scale);
 if(!acquired&&resource){resource.owner=null;const row=jobs.snapshot().stones.find(s=>s.id===resource.id);process(jobs.command({type:'release-stone',stoneId:resource.id,expectedRevision:row.revision,position:body.translation(),held:false,available:false}));pendingRelease.add(resource);}
 return acquired;
}
function releaseXRTarget(side,flick=false){
 const g=sim.xrGrabs.get(side);if(!g)return;
 const resource=loads.find(r=>r.body===g.body);let placementIntent=null;
 if(flick){const frame=worldActionFrame();frame.workers=frame.workers.map(w=>({...w,held:w.held&&villagers.find(c=>id(c)===w.id)?.parts.some(p=>p.body===g.body)}));frame.releaseSpeed=g.velocity.length();const result=worldActions.release(frame,{intentional:true,pointerType:'xr',source:side});worldActionFeedback(result);placementIntent=result.ok?result.pending:null;}
 sim.xrReleaseGrab(side,flick);
 if(placementIntent){const c=villagers.find(c=>id(c)===placementIntent.villagerId);if(c)motion.requestPlacement?.(c,placementIntent);}
 if(resource){resource.owner=null;const row=jobs.snapshot().stones.find(s=>s.id===resource.id);if(row){process(jobs.command({type:'release-stone',stoneId:resource.id,expectedRevision:row.revision,position:resource.body.translation(),held:false,available:false}));pendingRelease.add(resource);}}
}
function worldActionFrame(snapshot=jobs.snapshot()){
 const recruitState=recruit.state(motion);
 return{now:sim.time,active:started&&!paused&&!missionStopped&&document.visibilityState==='visible',snapshot,releaseSpeed:effectiveReleaseSpeed(),workers:villagers.map(c=>{
  const row=snapshot.villagers.find(v=>v.id===id(c)),status=motion.status(c),pelvis=c.parts[1].body.translation(),ground=environment.support(pelvis.x,pelvis.z);
  return{...row,id:id(c),hp:c.hp,alive:c.hp>0,joined:c!==recruit.character||recruitState.joined,held:sim.isCharacterHeld(c),available:status.available,mode:status.mode,position:physicalRootFromPelvis(pelvis,ground),pelvisHeight:pelvis.y-ground,speed:V().copy(c.parts[1].body.linvel()).length(),safeGround:environment.inBounds(pelvis.x,pelvis.z)&&Number.isFinite(ground)&&ground>-20};
 })};
}
// Desktop preparation uses only selection/role commands, never physical time,
// grabbing, powers, recovery or XR's explicit placement phase.
function workerOrderFrame(frame=worldActionFrame()){
 if(started||paused||missionStopped||villageXR?.isActive()||document.visibilityState!=='visible')return frame;
 // Registered civilians start in a frozen enter pose. Planning may address
 // that healthy, joined spawn without completing locomotion or moving a body.
 return {...frame,active:true,workers:frame.workers.map(w=>({...w,available:w.available||(w.mode==='enter'&&w.safeGround&&w.joined&&!w.held&&frame.snapshot.villagers.some(row=>row.id===w.id&&row.available===true))}))};
}
function finishPlanningClick(e){
 const press=planningPress;planningPress=null;if(!press)return false;pointer.down=false;
 if(started||paused||missionStopped||villageXR?.isActive()||document.visibilityState!=='visible'||press.cancelled||e.shiftKey||pointer.orbit||!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY)||performance.now()-press.time>700||Math.hypot(e.clientX-press.x,e.clientY-press.y)>4)return true;
 updatePointer(e);pointer.lastX=e.clientX;pointer.lastY=e.clientY;
 if(!pointer.inside||hud.contains(e.clientX,e.clientY)||press.generation!==jobs.snapshot().generation)return true;
 const hit=picker.pick(raycaster);if(hit?.character!==press.character)return true;
 const selected=workerOrders.select(workerOrderFrame(),id(press.character));
 if(selected.ok){worldNotice='';worldNoticeUntil=0;events.push({t:sim.time,type:'worker-selected',villagerId:id(press.character),planning:true});}
 else{worldNotice=press.character===recruit.character&&!recruit.state(motion).joined?'BRING THIS VILLAGER HOME BEFORE GIVING ORDERS':'THIS WORKER CANNOT TAKE AN ORDER';worldNoticeUntil=sim.time+3;}
 render();return true;
}
function worldActionFeedback(result){
 for(const e of result?.events??[]){events.push({t:sim.time,...e});
  if(e.type==='world-assignment-committed')worldNotice=e.unchanged?'ALREADY ASSIGNED HERE':e.siteId==='quarry'?'ASSIGNED TO THE QUARRY':e.siteId==='island-garden'?'ASSIGNED TO THE ISLAND GARDEN':'ASSIGNED TO THIS GARDEN';
  else if(e.type==='world-assignment-pending')worldNotice='WAITING FOR THE VILLAGER TO STAND';
  else if(e.type==='world-assignment-rejected')worldNotice='WORK ASSIGNMENT WAS NOT ACCEPTED';
  else if(e.type==='world-assignment-cancelled')worldNotice=e.reason==='left-target'?'PLACE CLOSER TO THE WORK SITE':e.reason==='recovery-timeout'?'TRY PLACING THE VILLAGER ON OPEN GROUND':'PLACEMENT CANCELLED';
  else continue;
  worldNoticeUntil=sim.time+4;
 }
 if(events.length>400)events.splice(0,events.length-400);
}
function cancelPlacementTransitions(reason){for(const c of villagers)motion?.cancelPlacement?.(c,reason);}
function release(flick=true,{placement=false}={}){pointer.captureRecovery=null;blessIntent.cancel('release');grabIntent.cancel('release');selectionCue?.clear('release');pointer.down=false;desktopDrag.clear();if(!sim.grab)return;
 let placementIntent=null;if(placement&&sim.grab.inputSource==='desktop'){const result=worldActions.release(worldActionFrame(),{intentional:true,button:0,pointerType:'mouse'});worldActionFeedback(result);placementIntent=result.ok?result.pending:null;}
 const r=loads.find(r=>r.body===sim.grab.body);sim.releaseGrab(flick);if(placementIntent){const c=villagers.find(c=>id(c)===placementIntent.villagerId);if(c)motion.requestPlacement?.(c,placementIntent);}if(r){r.owner=null;const s=jobs.snapshot().stones.find(s=>s.id===r.id);process(jobs.command({type:'release-stone',stoneId:r.id,expectedRevision:s.revision,position:r.body.translation(),held:false,available:false}));pendingRelease.add(r);}pointer.down=false;}
function cancelInput({preserveOrders=false}={}){planningPress=null;if(villageXR?.isActive())villageXR.releaseAll('input cancelled');if(!preserveOrders){workerOrders.clear('input-cancelled');cancelPlacementTransitions('input-cancelled');worldActions?.cancel('input-cancelled');}worldPress=null;worldNotice='';worldNoticeUntil=0;priorityNoticeUntil=0;release(false);pointer.orbit=false;pointer.pan=false;pointer.cameraButton=null;pointer.captureId=null;pointer.captureRecovery=null;pointer.inside=false;hoveredWorldSite=null;selectionCue?.clear('cancel');}
function worldControlHit(queryRay=raycaster){if(!worldCues||!picker)return null;scene.updateMatrixWorld(true);
 const visible=mesh=>{for(let o=mesh;o;o=o.parent)if(!o.visible)return false;return true;};
 const hit=queryRay.intersectObjects(worldCues.hitMeshes.filter(visible),false)[0];if(!hit)return null;
 const nativeOrigin=scene.worldToLocal(queryRay.ray.origin.clone()),nativeHit=scene.worldToLocal(hit.point.clone());
 if(picker.powerPathBlocked(nativeOrigin,nativeHit))return null;
 const control=worldCues.getControl(hit.object.userData.worldControlId);return control?{id:control.id,kind:control.kind,point:hit.point}:null;
}
function finishWorldPress(e){const press=worldPress;worldPress=null;if(!press)return false;pointer.down=false;
 if(Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)){updatePointer(e);pointer.lastX=e.clientX;pointer.lastY=e.clientY;}
 if(press.cancelled||!pointer.inside||paused||missionStopped||pointer.orbit||hud.contains(pointer.lastX,pointer.lastY)||performance.now()-press.startedAt>700||Math.hypot(pointer.lastX-press.x,pointer.lastY-press.y)>4)return true;
 const hit=worldControlHit();if(hit?.id!==press.id)return true;
 if(hit.kind==='construction'||hit.id==='stockpile')setPriority(hit.id);else{orderSelectedWorker(hit.id);}return true;
}
function orderSelectedWorker(sourceId){
 const request=workerOrders.order(workerOrderFrame(),sourceId);
 if(!request.ok){worldNotice=request.reason==='select-worker'?'CLICK A VILLAGER FIRST, THEN A WORK SITE':request.reason==='bridge-required'?'BUILD THE BRIDGE BEFORE ORDERING ISLAND WORK':request.reason==='source-depleted'?'THIS WORK SITE IS DEPLETED':'THIS WORKER CANNOT TAKE AN ORDER';}
 else{
  const c=villagers.find(c=>id(c)===request.command.villagerId);motion.cancelPlacement?.(c,'click-order');worldActionFeedback(worldActions?.cancelWorker(request.command.villagerId,'click-order'));
  const result=process(jobs.command(request.command)),row=result.villagers?.find(w=>w.id===request.command.villagerId);
  const site=sourceId==='quarry'?'QUARRY':sourceId==='island-garden'?'ISLAND GARDEN':'GARDEN';
  worldNotice=result.ok?(!started?'READY WHEN STARTED: ':row?.pendingRole?'AFTER DELIVERY: ':'WORK ORDER: ')+site:'WORK ORDER WAS NOT ACCEPTED';
  events.push({t:sim.time,type:result.ok?'click-work-order':'click-work-order-rejected',villagerId:request.command.villagerId,sourceId,deferred:!!row?.pendingRole,planning:!started});
 }
 worldNoticeUntil=sim.time+3;render();
}
function finishWorkerClick(e){
 if(!grabIntent.state().pending)return false;
 if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY)){grabIntent.cancel('invalid-release');return false;}
 updatePointer(e);pointer.lastX=e.clientX;pointer.lastY=e.clientY;
 const target=grabIntent.takeClick({x:e.clientX,y:e.clientY,now:performance.now()});
 if(!target?.selectionEligible||e.shiftKey||sim.grab)return false;
 updatePointer(e);pointer.lastX=e.clientX;pointer.lastY=e.clientY;
 const fresh=picker.pick(raycaster);if(fresh?.character!==target.character)return false;
 const selected=workerOrders.select(worldActionFrame(),id(target.character));
 if(selected.ok){worldNotice='';worldNoticeUntil=0;priorityNoticeUntil=0;events.push({t:sim.time,type:'worker-selected',villagerId:id(target.character)});}
 else{worldNotice=target.character===recruit.character&&!recruit.state(motion).joined?'BRING THIS VILLAGER HOME BEFORE GIVING ORDERS':'LET THE VILLAGER STAND BEFORE GIVING ORDERS';worldNoticeUntil=sim.time+3;}
 return selected.ok;
}
function setPriority(siteId){
 if(paused||missionStopped)return{ok:false,reason:paused?'paused':'ended'};
 cancelInput({preserveOrders:true});
 const result=process(jobs.command({type:'set-priority',siteId:siteId==='stockpile'?'pantry':siteId}));
 if(result.ok){
  const name={brace:'Brace',bridge:'Bridge','garden-upgrade':'Garden',defense:'Barrier',pantry:'Stores'}[result.prioritySiteId];
  const committedElsewhere=result.villagers.some(w=>w.alive&&w.resourceKind==='stone'&&w.stoneId&&['to-site','delivering'].includes(w.phase)&&w.targetSiteId&&w.targetSiteId!==result.prioritySiteId);
  priorityNotice=committedElsewhere?`${name} is next after current deliveries.`:result.prioritySiteId==='pantry'?'Stores now has priority for spare stone.':`${name} is now the construction priority.`;
  priorityNoticeUntil=sim.time+3;
 }
 render();return result;
}
function setRole(villagerId,role){if(paused||missionStopped)return{ok:false,reason:paused?'paused':'ended'};cancelInput({preserveOrders:true});const character=villagers.find(c=>id(c)===villagerId);if(character)motion.cancelPlacement?.(character,'role-override');worldActionFeedback(worldActions?.cancelWorker(villagerId,'role-override'));const v=jobs.snapshot().villagers.find(v=>v.id===villagerId);if(!v)return{ok:false};const result=process(jobs.command({type:'set-role',villagerId,role,expectedRevision:v.revision}));render();return result;}
function controlAction(control){
 if(control==='controls'||control==='details'){cancelInput({preserveOrders:true});if(control==='controls'){controlsOpen=!controlsOpen;if(controlsOpen)detailsOpen=false;}else{detailsOpen=!detailsOpen;if(detailsOpen)controlsOpen=false;}render();return;}
 if(control==='start'){if(started)return;if(!villageXR?.isActive())cancelInput({preserveOrders:true});started=true;paused=false;render();return;}
 if(control==='pause'){cancelInput();paused=!paused;render();return;}
 if(control==='replay'){cancelInput();location.reload();return;}
 const match=/^worker-(\d)-role$/.exec(control);if(match){const worker=jobs.snapshot().villagers.find(v=>v.id==='villager-'+match[1]);if(worker)setRole(worker.id,(worker.pendingRole??worker.role)==='food'?'stone':'food');return;}setPriority(control);
}
function finishBlessPress(e){
 const now=performance.now(),target=blessIntent.release({x:e.clientX,y:e.clientY,now,shiftKey:!!e.shiftKey});
 if(!target)return false;
 // Revalidate the original native owner before the single fresh release pick.
 if(!validPressTarget(target)||blessing.targetPower(target)!==target.miraclePower||blessing.state().cooldown>0||hud.contains(e.clientX,e.clientY))return false;
 updatePointer(e);pointer.lastX=e.clientX;pointer.lastY=e.clientY;
 if(!pointer.inside)return false;
 const fresh=picker.pick(raycaster);
 if(fresh?.character!==target.character||blessing.targetPower(fresh)!==target.miraclePower)return false;
 // The pressed native owner above must still exist. A moving character may
 // expose a different anatomical part during this same deliberate short click.
 const event=blessing.cast(fresh,camera.position);
 if(!event&&target.miraclePower==='lightning'&&blessing.rejection()){worldNotice=blessing.rejection()==='sky-blocked'?'LIGHTNING NEEDS CLEAR SKY':'LIGHTNING PATH BLOCKED';worldNoticeUntil=sim.time+1.5;}
 return !!event;
}
function desktopNavigationAvailable(x=pointer.lastX,y=pointer.lastY){
 return document.visibilityState==='visible'&&!renderer.xr?.isPresenting&&!hud.contains(x,y);
}
function navigateToWorkerOrOverview(code){
 if(document.visibilityState!=='visible'||renderer.xr?.isPresenting||pointer.down||pointer.orbit||sim.grab)return;
 let changed=false;
 if(code==='Home')changed=desktopNavigation.reset();
 else{
  const frame=workerOrderFrame();workerOrders.sync(frame);
  const worker=frame.workers.find(w=>w.id===workerOrders.state().selectedWorkerId);
  if(worker)changed=desktopNavigation.focus(worker.position);
  else{worldNotice='SELECT A VILLAGER, THEN PRESS F TO FOCUS';worldNoticeUntil=sim.time+3;}
 }
 if(changed){setCamera();updatePointer({clientX:pointer.lastX,clientY:pointer.lastY});}
 render();
}
function bindInput(){const el=renderer.domElement;
 el.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('mousedown',e=>{if(villageXR?.isActive())return;pointer.captureRecovery=null;updatePointer(e);pointer.lastX=e.clientX;pointer.lastY=e.clientY;if(e.button===1||e.button===2){e.preventDefault();if(!desktopNavigationAvailable(e.clientX,e.clientY)||pointer.orbit)return;blessIntent.cancel('camera');worldPress=null;planningPress=null;grabIntent.cancel('camera');pointer.orbit=true;pointer.pan=e.button===1||!!e.shiftKey;pointer.cameraButton=e.button;selectionCue.suspend('camera');resetThrowSample();return;}if(e.button!==0||pointer.orbit)return;const control=hud.hitTest(e.clientX,e.clientY);if(control){controlAction(control);return;}if(hud.contains(e.clientX,e.clientY)||paused||missionStopped||pointer.down)return;const worldHit=worldControlHit();if(worldHit){pointer.down=true;worldPress={id:worldHit.id,x:e.clientX,y:e.clientY,startedAt:performance.now()};return;}if(!started){
 const hit=picker.pick(raycaster);
 if(!e.shiftKey&&hit?.character&&villagers.includes(hit.character)){pointer.down=true;planningPress={character:hit.character,generation:jobs.snapshot().generation,x:e.clientX,y:e.clientY,time:performance.now(),cancelled:false};}
 else if(e.shiftKey||hit?.body){worldNotice='START VILLAGE TO LIFT OR USE POWERS';worldNoticeUntil=sim.time+3;}
 else{workerOrders.clear('planning-empty');worldNotice='';worldNoticeUntil=0;}
 render();return;
 }pointer.down=true;const hit=picker.pick(raycaster);selectionCue.clear('press');desktopPointerTime=performance.now();
  const target=recordPressTarget(hit),sample={x:e.clientX,y:e.clientY,now:desktopPointerTime,shiftKey:!!e.shiftKey};
  if(target)target.selectionEligible=!e.shiftKey&&villagers.includes(target.character)&&target.character.hp>0;
  if(!target&&!e.shiftKey)workerOrders.clear('empty-click');
  grabIntent.begin(target,{...sample,clickHoldMs:target?.selectionEligible?260:140});
  if(target)target.miraclePower=blessing.targetPower(target);
  blessIntent.begin(target?.miraclePower?target:null,sample);
 });
 el.addEventListener('pointermove',e=>{if(villageXR?.isActive())return;pointer.captureRecovery=null;updatePointer(e);if(planningPress&&Math.hypot(e.clientX-planningPress.x,e.clientY-planningPress.y)>4){planningPress.cancelled=true;worldNotice='START VILLAGE BEFORE LIFTING';worldNoticeUntil=sim.time+3;}if(worldPress&&Math.hypot(e.clientX-worldPress.x,e.clientY-worldPress.y)>4)worldPress.cancelled=true;if(pointer.orbit&&!renderer.xr?.isPresenting){if(pointer.pan)desktopNavigation.pan(e.clientX-pointer.lastX,e.clientY-pointer.lastY,{height:renderer.domElement.getBoundingClientRect().height,fov:camera.fov});else{cameraState.yaw-=(e.clientX-pointer.lastX)*.006;cameraState.pitch=THREE.MathUtils.clamp(cameraState.pitch+(e.clientY-pointer.lastY)*.004,.25,1.1);}setCamera();updatePointer(e);}pointer.lastX=e.clientX;pointer.lastY=e.clientY;const now=performance.now();blessIntent.observe({x:e.clientX,y:e.clientY,now,shiftKey:!!e.shiftKey});grabIntent.advance({x:e.clientX,y:e.clientY,now,allowHold:false});if(sim.grab&&!pointer.orbit){const p=desktopDrag.target(raycaster.ray);if(p)sim.moveGrab(p,Math.max(.001,(now-desktopPointerTime)/1000));}desktopPointerTime=now;});
 // Chrome can drop capture after a chorded camera release with left still down.
 // Reacquire only that next matching loss. Preserve fractional PointerEvent
 // coordinates for rebase; compatibility mouseup coordinates may be rounded.
 window.addEventListener('mouseup',e=>{if(villageXR?.isActive())return;pointer.captureRecovery=null;if(e.button===pointer.cameraButton){if((e.buttons&1)&&pointer.down&&sim.grab&&pointer.captureId!==null&&el.hasPointerCapture?.(pointer.captureId))pointer.captureRecovery=pointer.captureId;pointer.orbit=false;pointer.pan=false;pointer.cameraButton=null;selectionCue.invalidate('camera-end');rebaseDrag();}else if(e.button===0){if(finishPlanningClick(e))return;finishBlessPress(e);if(finishWorldPress(e))return;finishWorkerClick(e);const inside=pointer.inside&&(!Number.isFinite(e.clientX)||e.clientX>=0&&e.clientX<innerWidth)&&(!Number.isFinite(e.clientY)||e.clientY>=0&&e.clientY<innerHeight);release(true,{placement:inside&&!pointer.orbit&&!hud.contains(e.clientX??pointer.lastX,e.clientY??pointer.lastY)});}});
 el.addEventListener('wheel',e=>{e.preventDefault();if(!desktopNavigationAvailable(e.clientX??pointer.lastX,e.clientY??pointer.lastY)||pointer.orbit)return;blessIntent.cancel('wheel');worldPress=null;planningPress=null;grabIntent.cancel('wheel');if(sim.grab){const now=performance.now(),p=desktopDrag.depth(camera,raycaster.ray,e.deltaY*.012,sim.grab.target);if(p)sim.moveGrab(p,Math.max(.001,(now-desktopPointerTime)/1000),{sampleThrow:false});desktopPointerTime=now;}else{cameraState.distance=THREE.MathUtils.clamp(cameraState.distance+e.deltaY*.015,18,55);setCamera();}},{passive:false});
 window.addEventListener('keydown',e=>{if(villageXR?.isActive())return;if(e.repeat)return;if(e.code==='KeyF'||e.code==='Home'){e.preventDefault();navigateToWorkerOrOverview(e.code);return;}if(e.code==='KeyC')controlAction('controls');if(e.code==='KeyD')controlAction('details');if(e.code==='Escape'){cancelInput();controlsOpen=false;detailsOpen=false;render();}if(e.code==='Digit1')setPriority('brace');if(e.code==='Digit2')setPriority('bridge');if(e.code==='Digit3')setPriority('pantry');if(e.code==='Space'){e.preventDefault();if(!started)controlAction('start');else{cancelInput();paused=!paused;}}if(e.code==='KeyR'){cancelInput();location.reload();}});
 window.addEventListener('keyup',e=>{if(e.key==='Shift'||e.code==='ShiftLeft'||e.code==='ShiftRight')blessIntent.cancel('modifier-lost');});
 const cancel=cancelInput;el.addEventListener('pointerdown',e=>{pointer.captureRecovery=null;if(e.pointerType==='mouse'){pointer.captureId=e.pointerId;el.setPointerCapture(e.pointerId);}});el.addEventListener('pointercancel',cancel);el.addEventListener('lostpointercapture',e=>{const recover=pointer.captureRecovery===e.pointerId&&(e.buttons&1)&&pointer.down&&sim.grab&&!paused&&!missionStopped&&document.visibilityState==='visible'&&!renderer.xr?.isPresenting;pointer.captureRecovery=null;if(recover){try{el.setPointerCapture(e.pointerId);if(el.hasPointerCapture(e.pointerId))return;}catch{}}if(pointer.down||pointer.orbit||sim.grab)cancel();});el.addEventListener('pointerleave',()=>{blessIntent.cancel('leave');worldPress=null;planningPress=null;grabIntent.cancel('leave');pointer.inside=false;selectionCue.suspend('leave');});window.addEventListener('blur',()=>{if(villageXR?.isActive())return;cancel();paused=started;});document.addEventListener('visibilitychange',()=>{if(villageXR?.isActive())return;if(document.visibilityState!=='visible'){cancel();paused=started;}});
}
async function start(){
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;renderer.autoClear=false;document.body.appendChild(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color('#92adb7');camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,150);setCamera();scene.add(new THREE.HemisphereLight('#e2f0f1','#58665d',1.25));const sun=new THREE.DirectionalLight('#fff0da',2.25);sun.position.set(-7,17,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-22,right:30,top:22,bottom:-17,near:1,far:60});sun.shadow.normalBias=.025;sun.shadow.bias=-.00012;sun.shadow.radius=2;scene.add(sun);const rim=new THREE.DirectionalLight('#b9d9e8',.55);rim.position.set(12,7,-12);scene.add(rim);
 world=await initializePhysics();environment=createSettlementWorld(scene,world,RAPIER);rig=createCharacterGeometry(THREE,{gridStep:.05});hero=await loadCivilianArt(rig);sim=new BattlePhysics(world,rig);sim.combat=false;loadHandoff=createCarriedLoadHandoff({THREE,RAPIER,sim});
 const pool=createHeroVisualPool({THREE,scene,rig,hero,rings:false});villagers=[-4.5,-2,.5].map((z,i)=>sim.spawn(0,-1.8,z,i));recruit=createSettlementRecruit({THREE,scene,sim,environment,onJoin:e=>{events.push({t:sim.time,...e});notice='A FOURTH WORKER HAS JOINED';noticeUntil=sim.time+5;}});villagers.push(recruit.character);visuals=villagers.map(c=>pool.create(c));
 foodArt=createSettlementFoodArt({THREE,scene,support:environment.support});
 defense=createSettlementDefense({THREE,RAPIER,sim,scene,support:environment.support,groundColliders:environment.groundColliders,onBuilt:e=>{events.push({t:sim.time,...e});pickingDirty=true;}});
 gardenSite={id:'garden-upgrade',position:{x:-5.5,y:environment.support(-5.5,.1),z:.1},required:3};
 gardenArt=createGardenImprovementArt({THREE,scene,support:environment.support,sitePosition:gardenSite.position,sourcePosition:foodArt.forageSources.find(source=>source.id==='mainland-forage')});
 for(const [i,position] of environment.looseStoneSpawns.entries())createLoad({id:'stone-'+i,kind:'stone',position});
 quarrySafety=createQuarrySafety({THREE,RAPIER,sim,scene,support:environment.support,quarryPosition:environment.quarry,onNotice:message=>{notice=message;noticeUntil=sim.time+4;}});
 environment.art=createSettlementEnvironmentArt({scene,world,RAPIER,support:environment.support,environment,quarrySafety});
 const workPoints=(center,points)=> (points??[[center.x-1.1,center.z],[center.x,center.z-1.1],[center.x+1.1,center.z],[center.x,center.z+1.1]]).map(([x,z])=>supportedCivilianPoint(environment,x,z)).filter(Boolean);
 jobs=createSettlementEconomy({canTravel:(from,to)=>environment.isConnected(environment.regionAt(from.x,from.z),environment.regionAt(to.x,to.z)),mandatorySiteIds:['bridge'],canComplete:()=>raid?.complete()??true,villagers:villagers.map((c,i)=>({id:id(c),position:c.parts[1].body.translation(),available:c!==recruit.character,role:i<2?'food':'stone'})),stones:loads.map(r=>({id:r.id,kind:r.kind,quantity:r.quantity,position:r.body.translation()})),quarry:{regionId:'quarry',position:environment.quarry,reserve:16,workPoints:workPoints(environment.quarry)},pantry:{id:'pantry',position:foodArt.pantry,workPoints:workPoints(foodArt.pantry)},forageSources:foodArt.forageSources.map((f,i)=>({id:f.id,position:f,regionId:environment.regionAt(f.x,f.z),quantity:i?6:3,workSeconds:i?4:7,requiresBridge:!!i,workPoints:workPoints(f,i?[[19.7,-.6],[21.2,-.6]]:null)})),sites:[{id:'brace',position:quarrySafety.braceSite,required:3},{id:'bridge',position:environment.site,required:5},gardenSite,defense.site],defenseUpgrade:{siteId:'defense'},gardenUpgrade:{siteId:'garden-upgrade',sourceId:'mainland-forage',bundleSize:6},recruitId:'villager-3',requireIslandHarvest:true,sourceRadius:SOURCE_REACH,sourceWorkRadius:SOURCE_WORK_REACH,initialFood:3,mealSeconds:24,maxActiveLoads:12,initialPrioritySiteId:'bridge',stoneRadius:1.02,siteRadius:2.15,workSeconds:.8,deliverySeconds:.55});
 motion=createCivilianMotion({THREE,RAPIER,sim,rig,terrainHeight:environment.support,inBounds:environment.inBounds,groundColliders:environment.groundColliders,onInterrupt:c=>{const v=jobs.snapshot().villagers.find(v=>v.id===id(c));process(jobs.command({type:'interrupt-villager',villagerId:v.id,expectedRevision:v.revision}));}});villagers.forEach(c=>motion.add(c));
 const raidEnabled=!new URLSearchParams(location.search).has('noRaid');
 const enemyHero=raidEnabled?await loadHeroArt(rig):null;
 if(enemyHero){enemyHero.materials=enemyHero.materials.map(m=>m.clone());raiderPool=createHeroVisualPool({THREE,scene,rig,hero:enemyHero,rings:false});}
 raid=createSettlementRaid({THREE,RAPIER,sim,scene,environment,enabled:raidEnabled,onSpawn:c=>{const visual=raiderPool.create(c);visual.heroMaterials=enemyHero.materials;visuals.push(visual);pickingDirty=true;},onRetire:c=>{const visual=visuals.find(v=>v.c===c);if(visual)visual.body.visible=false;pickingDirty=true;},onEvent:e=>events.push(e)});
 if(raidEnabled)combatFeedback=createCombatFeedback({THREE,scene,sim,hero,visuals,getBlocked:()=>!started||paused||missionStopped});
 windupCue=createWindupCue({THREE,scene,sim,terrainHeight:environment.support});
 sim.combat=raidEnabled;sim.terrainHeight=environment.support;sim.inBounds=environment.inBounds;
 sim.combatTargetEligible=c=>villagers.includes(c)&&!sim.isCharacterHeld(c)&&motion.status(c).available;
 const nativeControl=sim.controlCharacter.bind(sim);sim.controlCharacter=(c,dt)=>{if(raid.owns(c))nativeControl(c,dt);};
 sim.isAuthoredCombatVictim=c=>villagers.includes(c)&&c.civilianMotion===true&&c.hp>0&&motion.status(c).mode!=='unregistered'&&!sim.isCharacterHeld(c)&&c.parts.every((p,i)=>p.body.isValid()&&p.body.isEnabled()&&p.body.isKinematic()&&world.getRigidBody(p.body.handle)===p.body&&p.collider.isValid()&&p.collider.isEnabled()&&!p.collider.isSensor()&&world.getCollider(p.collider.handle)===p.collider&&p.collider.parent()===p.body&&sim.colliderOwners.get(p.collider.handle)?.character===c&&sim.colliderOwners.get(p.collider.handle)?.index===i);
 sim.beforeApprovedStrike=strike=>{if(villagers.includes(strike.victim)&&!sim.isCharacterHeld(strike.victim))motion.interrupt(strike.victim);};if(combatFeedback)combatFeedback.setBeforeStep(beforeStep);else sim.beforeStep=beforeStep;const nativeEvent=sim.event.bind(sim);sim.event=(type,data={})=>{nativeEvent(type,data);if(type==='hit'){const c=villagers.find(c=>c.id===data.id);if(c)motion.interrupt(c);}};
 quarryContact=createCivilianQuarryContact({sim,motion,boulder:quarrySafety.rock});sim.onNativeContact=event=>{try{quarryContact.observe(event);}finally{motion.observePlacementContact?.(event);}};const nativeContacts=sim.contacts.bind(sim);sim.contacts=()=>{try{nativeContacts();}finally{try{quarryContact.flush();}finally{motion.flushPlacementContacts?.();}}};
 navigation=createCivilianNavigation({THREE,RAPIER,sim,motion,environment});
 traffic=createCivilianTraffic({villagers,motion,support:environment.support,inBounds:environment.inBounds,navigation});
 hand=createGodHandRig({THREE,handedness:'right'});hand.group.scale.setScalar(.62);scene.add(hand.group);handMotion=createDesktopHandMotion({THREE,rig:hand});hud=createSettlementMinimalHUD();worldActions=createSettlementWorldActions();worldCues=createSettlementWorldCues({THREE,scene,support:environment.support});worldCues.update({jobs:jobs.snapshot(),camera});
 blessing=createSettlementBlessing({sim,scene,getVillagers:()=>villagers,getRaiders:()=>raid?.state().phase==='active'?raid.raiders:[],getVisual:c=>visuals.find(v=>v.c===c)?.body,getBlocked:()=>!started||paused||missionStopped||jobs.outcomeStatus()!=='playing'||document.visibilityState!=='visible',isLost:c=>raid?.owns(c)?c.parts[1].body.translation().y < -4:c.parts[1].body.translation().y < -10||['dead','lost'].includes(jobs.snapshot().villagers.find(v=>v.id===id(c))?.phase),isPathBlocked:(from,to,target)=>picker.powerPathBlocked(from,to,target)});
 syncVisuals(0);refreshPicking();
 xrHands=Object.fromEntries(['left','right'].map(side=>{const rig=createGodHandRig({THREE,handedness:side});rig.group.visible=false;scene.add(rig.group);return[side,rig];}));
 villageXR=createVillageXR({renderer,scene,camera,sim,playerHands:xrHands,bounds:environment.bounds,
  pick:query=>surfacePicker.pick(query),worldHit:worldControlHit,
  select:hit=>{if(!hit?.character){workerOrders.clear('xr-empty');return;}const result=workerOrders.select(worldActionFrame(),id(hit.character));if(result.ok)events.push({t:sim.time,type:'worker-selected',villagerId:id(hit.character),source:'xr'});else{worldNotice='LET THE VILLAGER STAND BEFORE GIVING ORDERS';worldNoticeUntil=sim.time+3;}},
  activate:action=>{if(['start','pause','replay'].includes(action))controlAction(action);else{const site=worldCues.getControl(action);if(site?.kind==='construction'||action==='stockpile')setPriority(action);else if(site)orderSelectedWorker(action);}},
  grab:grabXRTarget,release:releaseXRTarget,
  cast:(hit,viewer,side,mode)=>{if(blessing.targetPower(hit)!==mode)return null;return blessing.cast(hit,viewer,{source:'xr-'+side});},
  getStatus:()=>({started,paused,ended:missionStopped,message:currentWorldNotice(),cooldown:blessing.state().cooldown,selectedWorkerId:workerOrders.state().selectedWorkerId,workerOrder:workerOrders.state().selectedWorkerId?settlementWorkerFeedback(jobs.snapshot().villagers.find(w=>w.id===workerOrders.state().selectedWorkerId)):''}),
  onSessionChange:active=>{cancelInput();controlsOpen=detailsOpen=false;hand.group.visible=false;selectionCue.suspend(active?'xr-entry':'xr-exit');},
  onCancel:reason=>{worldPress=null;grabIntent.cancel(reason);blessIntent.cancel(reason);workerOrders.clear(reason);cancelPlacementTransitions(reason);worldActions?.cancel(reason);}
 });
 bindInput();render();
 window.SETTLEMENTQA={step,state,setPriority,setRole,start:()=>{started=true;},pause:value=>{cancelInput();paused=value;},project:a=>{const p=V(...a).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},get context(){return{villageXR,xrHands,defense,raid,raiderPool,windupCue,combatFeedback,blessing,THREE,scene,camera,renderer,sim,world,rig,hero,environment,motion,navigation,jobs,visuals,rockVisuals,loads,villagers,hud,picker,selectionCue,raycaster,pointer,hand,desktopDrag,quarrySafety,quarryContact,recruit,foodArt,gardenArt,gardenSite,worldCues,worldActions,workerOrders};}};
 window.addEventListener('resize',()=>{if(villageXR?.isActive())return;blessIntent.cancel('resize');grabIntent.cancel('resize');renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();selectionCue.invalidate('resize');rebaseDrag();render();});
 if(!manual){let last=performance.now(),acc=0;renderer.setAnimationLoop((now,frame)=>{villageXR.update(now,frame);const elapsed=Math.min(.08,(now-last)/1000);last=now;if(!villageXR.shouldHoldSimulation()&&started&&!paused&&jobs.outcomeStatus()==='playing'){acc+=elapsed;let n=0;while(acc>=1/60&&n++<5){advanceSimulation(1/60);acc-=1/60;if(missionStopped){acc=0;break;}}}else acc=0;render(elapsed);});}
}
start().catch(e=>{console.error(e);window.SETTLEMENTERROR=String(e.stack||e);});
