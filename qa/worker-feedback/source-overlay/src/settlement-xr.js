import * as T from 'three';
import {FONT} from './gpu-hud.js';
import {workerFeedbackLines} from './settlement-worker-feedback.js';
import {makePlacement,readHandJoints,makePinchState,updatePinch,retargetHand} from './xr-hand-math.js';
import {pickXRTarget,createGrabFeedback,XR_GRAB_REACH} from './xr-grab-feedback.js';

const sides=['left','right'],V=()=>new T.Vector3();
const finitePose=pose=>pose&&!pose.emulatedPosition&&[pose.transform?.position?.x,pose.transform?.position?.y,pose.transform?.position?.z,pose.transform?.orientation?.x,pose.transform?.orientation?.y,pose.transform?.orientation?.z,pose.transform?.orientation?.w].every(Number.isFinite);
function lettering(text,size=.0023,color='#edf3ef'){
 const positions=[];let x=0;
 for(const char of text.toUpperCase()){const rows=FONT[char];if(rows)for(let j=0;j<7;j++)for(let i=0;i<5;i++)if(rows[j][i]==='1'){const l=x+i*size,t=-j*size;for(const [a,b]of [[l,t],[l+size,t],[l+size,t-size],[l,t],[l+size,t-size],[l,t-size]])positions.push(a,b,0);}x+=6*size;}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));return new T.Mesh(geometry,new T.MeshBasicMaterial({color,side:T.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));
}
export async function probeVillageXR(nav=globalThis.navigator,secure=globalThis.isSecureContext){
 if(!secure)return{supported:false,reason:'XR needs HTTPS (or localhost). Desktop play works offline.'};
 if(!nav?.xr?.isSessionSupported)return{supported:false,reason:'WebXR unavailable in this browser. Desktop play is available.'};
 try{for(const mode of ['immersive-ar','immersive-vr'])if(await nav.xr.isSessionSupported(mode))return{supported:true,mode,reason:mode==='immersive-ar'?'Mixed reality available':'Virtual reality available'};return{supported:false,reason:'No immersive WebXR session available.'};}
 catch(error){return{supported:false,reason:`XR check failed (${error.name||'error'}).`};}
}

/** Village owns economy/actions; this adapter owns only real XR session, metres,
 * tracked input, visual hands and UI. Physics always remains in native units. */
export function createVillageXR({renderer,scene,camera,sim,playerHands,bounds,pick,worldHit,select,activate,grab,release,cast,getStatus,onSessionChange=()=>{},onCancel=()=>{}}){
 const width=bounds.maxX-bounds.minX,depth=bounds.maxZ-bounds.minZ,center=new T.Vector3((bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2);
 const initialScale=Math.max(.024,Math.min(.03,.90/Math.max(width,depth))),settings={scale:initialScale,distance:.68,height:-.43};
 const state={active:false,busy:false,supported:false,placed:false,placing:false,mode:'select',scale:initialScale,sessionMode:null,referenceSpace:'local-floor',hardwareVerified:false,controllerFallback:true,frames:0,hands:{left:'not tracked',right:'not tracked'},status:'Checking XR…'};
 let session=null,space=null,snapshot=null,lastTime=null,viewer=null,basis=null,validView=false,overlayUntil=0,pressSerial=0,panelKey='';
 const viewCamera=camera.clone(),inverse=new T.Matrix4(),worldUI=new T.Group();worldUI.name='Village XR anchored controls';worldUI.matrixAutoUpdate=false;worldUI.visible=false;scene.add(worldUI);
 const panelAnchor=new T.Matrix4(),panel=new T.Mesh(new T.PlaneGeometry(.58,.28),new T.MeshBasicMaterial({color:'#263e41',side:T.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));panel.position.set(0,-.055,-.004);worldUI.add(panel);const buttons={};
 function button(id,label,x,y,width=.128){const group=new T.Group();group.name=`Village XR ${id}`;group.position.set(x,y,0);const bg=new T.Mesh(new T.BoxGeometry(width,.034,.007),new T.MeshBasicMaterial({color:'#486265',depthTest:false,depthWrite:false,toneMapped:false}));bg.userData.xrAction=id;group.add(bg);const text=lettering(label,.0019);text.position.set(-label.length*.0019*3,.007,.006);group.add(text);worldUI.add(group);buttons[id]={group,bg,label};}
 for(const [i,mode]of ['select','grab','bless','lightning'].entries())button(mode,mode,(i-1.5)*.141,.008);
 button('pause','START / PAUSE',-.19,-.041,.174);button('place','PLACE',0,-.041,.174);button('exit','EXIT XR',.19,-.041,.174);
 for(const [i,[id,label]]of [['near','NEAR'],['far','FAR'],['raise','RAISE'],['lower','LOWER'],['smaller','SMALLER'],['larger','LARGER']].entries())button(id,label,(i%3-1)*.188,-.006-Math.floor(i/3)*.048,.172);
 button('done','PLAY / DONE',-.14,-.103,.25);button('reset','RESET TABLE',.14,-.103,.25);
 let title=lettering('VILLAGE - XR TEST',.0026);title.position.set(-.26,.062,.006);worldUI.add(title);
 let statusText=null;const uiRay=new T.Raycaster(),ray=new T.Raycaster();
 worldUI.traverse(o=>{if(o.isMesh)o.renderOrder=2000;});
 const ui=document.createElement('section');ui.id='village-xr';ui.setAttribute('aria-label','Village WebXR');ui.innerHTML='<button id="village-xr-enter" disabled>Checking XR…</button><button id="village-xr-exit" hidden>Exit XR</button><p id="village-xr-status" role="status"></p>';
 const style=document.createElement('style');style.textContent='#village-xr{position:fixed;left:12px;top:12px;z-index:30;max-width:255px;color:#e3ece8;font:11px/1.35 system-ui;background:#203b42ed;border:1px solid #8ca7a7;border-radius:6px;padding:7px 9px}#village-xr button{font:600 12px system-ui;padding:6px 12px;color:#18383b;background:#dbeae1;border:0;border-radius:4px;cursor:pointer}#village-xr button:disabled{opacity:.6;cursor:default}#village-xr p{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);margin:0}#village-xr:focus-within p,#village-xr:hover p{left:0;top:100%;width:235px;height:auto;clip-path:none;margin:4px 0 0;padding:8px;background:#203b42f5;border-radius:4px;pointer-events:none}@media(max-width:650px){#village-xr{top:52px}}#village-xr :focus-visible{outline:3px solid #e5c987}';document.head.appendChild(style);document.body.appendChild(ui);
 const enter=ui.querySelector('#village-xr-enter'),exit=ui.querySelector('#village-xr-exit'),status=ui.querySelector('#village-xr-status');
 const hands=Object.fromEntries(sides.map(side=>{const marker=new T.Group();marker.name=`Village ${side} tracked controller`;marker.visible=false;const shell=new T.Mesh(new T.CylinderGeometry(.012,.018,.065,8),new T.MeshStandardMaterial({color:side==='left'?'#bed4d1':'#e2ddd0',roughness:.65}));shell.rotation.x=Math.PI/2;marker.add(shell);const line=new T.Line(new T.BufferGeometry().setFromPoints([V(),new T.Vector3(0,0,-1)]),new T.LineBasicMaterial({color:'#bad7d3',transparent:true,opacity:.65}));marker.add(line);scene.add(marker);return[side,{source:null,pinch:makePinchState(),tracked:false,armed:false,stable:0,pressed:false,squeeze:false,press:null,offset:V(),lastPoint:null,marker,line,feedback:createGrabFeedback(scene,side,()=>state.scale)}];}));
 function report(text){state.status=text;status.textContent=text;}
 function syncUI(){
  const s=getStatus(),placing=state.placing;
  worldUI.visible=state.active&&state.placed;
  for(const [id,entry]of Object.entries(buttons)){entry.group.visible=placing?['near','far','raise','lower','smaller','larger','done','reset','exit'].includes(id):['select','grab','bless','lightning','pause','place','exit'].includes(id);entry.bg.material.color.set(id===state.mode?'#799b83':'#486265');}
  // Exit remains in one location even while placing; setup never covers it.
  if(placing)buttons.exit.group.position.set(.20,.048,0);else buttons.exit.group.position.set(.19,-.041,0);
  const lines=placing?['PLACE THE THREE ISLANDS','POINT + TRIGGER OR PINCH','DONE STARTS THE VILLAGE']:[s.ended?'MISSION ENDED':s.paused?'PAUSED - START / PAUSE':!s.started?'PRESS START / PAUSE':`${state.mode.toUpperCase()}${s.cooldown>0?' - RECHARGING':''}`,state.mode==='grab'?'PINCH / SQUEEZE NEAR A BODY':'POINT - SHORT TRIGGER / PINCH',String(s.message||'SELECT WORKER, THEN WORK SIGN').slice(0,42)];
  if(!placing&&s.started&&!s.paused&&!s.ended&&state.mode==='select'&&!s.message&&s.workerOrder){
   const orderLines=workerFeedbackLines(s.workerOrder);
   lines[0]=`WORKER ${Number(s.selectedWorkerId.split('-').at(-1))+1} SELECTED`;
   lines[1]=orderLines[0];lines[2]=orderLines[1]??'';
  }
  const key=lines.join('|');if(key!==panelKey){panelKey=key;if(statusText){worldUI.remove(statusText);statusText.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}statusText=new T.Group();for(const [i,text]of lines.entries()){const m=lettering(text,.00165);m.position.set(-.263,-.091-i*.024,.009);m.renderOrder=2002;statusText.add(m);}worldUI.add(statusText);statusText.visible=!placing;}
  if(statusText)statusText.visible=!placing;
 }
 function syncAnchor(){scene.updateMatrixWorld(true);inverse.copy(scene.matrixWorld).invert();worldUI.matrix.copy(inverse).multiply(panelAnchor);worldUI.matrixWorldNeedsUpdate=true;worldUI.updateMatrixWorld(true);}
 function place(viewerPose,recenter=false){
  if(!basis||recenter){const p=makePlacement(viewerPose);basis={eye:V().copy(viewerPose.transform.position),quaternion:p.quaternion,forward:new T.Vector3(0,0,-1).applyQuaternion(p.quaternion)};}
  const anchor=basis.eye.clone().addScaledVector(basis.forward,settings.distance);anchor.y+=settings.height;
  scene.quaternion.copy(basis.quaternion);scene.scale.setScalar(settings.scale);scene.position.copy(anchor).sub(center.clone().multiplyScalar(settings.scale).applyQuaternion(basis.quaternion));scene.updateMatrixWorld(true);
  // UI is fixed in metres, just above and behind the tabletop, not head-locked.
  const panelAt=basis.eye.clone().addScaledVector(basis.forward,.66);panelAt.y+=.025;panelAnchor.compose(panelAt,basis.quaternion,new T.Vector3(.68,.68,.68));
  state.scale=settings.scale;state.placed=true;scene.visible=true;syncAnchor();syncUI();
 }
 function clearHand(side,reason='tracking lost'){
  const h=hands[side];release(side,false);h.feedback.hide();h.marker.visible=false;playerHands[side].group.visible=false;h.tracked=false;h.armed=false;h.stable=0;h.pressed=false;h.squeeze=false;h.eventSelect=h.eventSqueeze=false;h.press=null;h.lastPoint=null;updatePinch(h.pinch,null,0);state.hands[side]=reason;
 }
 function releaseAll(reason='cancelled'){for(const side of sides)clearHand(side,reason);sim.playerThrowImpacts?.cancel();onCancel(reason);}
 function snapshotDesktop(){return{position:scene.position.clone(),quaternion:scene.quaternion.clone(),scale:scene.scale.clone(),visible:scene.visible,background:scene.background,fog:scene.fog,camera:camera.clone(),shadow:renderer.shadowMap.enabled,clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),size:renderer.getSize(new T.Vector2()),pixelRatio:renderer.getPixelRatio(),bodyBackground:document.body.style.background,xrEnabled:renderer.xr.enabled};}
 function restoreDesktop(){if(!snapshot)return;scene.position.copy(snapshot.position);scene.quaternion.copy(snapshot.quaternion);scene.scale.copy(snapshot.scale);scene.visible=snapshot.visible;scene.background=snapshot.background;scene.fog=snapshot.fog;camera.copy(snapshot.camera);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);renderer.shadowMap.enabled=snapshot.shadow;renderer.setClearColor(snapshot.clear,snapshot.alpha);renderer.setPixelRatio(snapshot.pixelRatio);renderer.setSize(snapshot.size.x,snapshot.size.y,false);renderer.xr.enabled=snapshot.xrEnabled;document.body.style.background=snapshot.bodyBackground;scene.updateMatrixWorld(true);snapshot=null;}
 function ended(){releaseAll('session ended');space?.removeEventListener?.('reset',resetReference);space=null;session=null;viewer=null;basis=null;validView=false;lastTime=null;state.active=state.busy=state.placed=state.placing=false;worldUI.visible=false;for(const h of Object.values(hands))h.source=null;restoreDesktop();enter.hidden=false;enter.disabled=!state.supported;exit.hidden=true;onSessionChange(false);report('Desktop restored. XR hardware comfort, tracking and performance remain unverified.');}
 function resetReference(){releaseAll('reference reset');viewer=null;basis=null;validView=false;state.placed=false;state.placing=true;scene.visible=false;lastTime=null;report('Reference space changed. Place the islands again, then choose PLAY / DONE.');}
 async function startSession(){
  if(state.active||state.busy||!state.supported)return false;state.busy=true;enter.disabled=true;report('Starting immersive XR…');
  try{
   // Must run synchronously from the trusted click before any awaited work.
   const requested=navigator.xr.requestSession(state.sessionMode,{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking','dom-overlay'],domOverlay:{root:ui}});
   session=await requested;const entering=session;snapshot=snapshotDesktop();session.addEventListener('end',ended,{once:true});
   session.addEventListener('visibilitychange',()=>{if(session?.visibilityState!=='visible'){validView=false;lastTime=null;releaseAll('session hidden');}});
   session.addEventListener('inputsourceschange',()=>{for(const side of sides)if(hands[side].source&&!Array.from(session?.inputSources||[]).includes(hands[side].source)){clearHand(side,'disconnected');hands[side].source=null;}});
   for(const [event,key,value]of [['selectstart','eventSelect',true],['selectend','eventSelect',false],['squeezestart','eventSqueeze',true],['squeezeend','eventSqueeze',false]])session.addEventListener(event,e=>{const h=hands[e.inputSource?.handedness];if(h&&h.source===e.inputSource)h[key]=value;});
   onSessionChange(true);releaseAll('entering XR');renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');renderer.xr.setFramebufferScaleFactor(.85);renderer.xr.setFoveation?.(1);
   camera.position.set(0,0,0);camera.quaternion.identity();camera.scale.setScalar(1);camera.near=.02;camera.far=12;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
   scene.background=state.sessionMode==='immersive-ar'?null:new T.Color('#283b46');scene.fog=null;scene.visible=false;renderer.shadowMap.enabled=false;renderer.setClearColor(0x283b46,state.sessionMode==='immersive-ar'?0:1);document.body.style.background='transparent';
   state.active=true;state.placing=true;state.mode='select';await renderer.xr.setSession(entering);if(session!==entering||!state.active)return false;space=renderer.xr.getReferenceSpace();if(!space)throw new Error('No local-floor reference space');space.addEventListener?.('reset',resetReference);
   state.busy=false;state.frames=0;lastTime=null;enter.hidden=true;exit.hidden=false;exit.disabled=false;report('Place the islands, then PLAY / DONE. Hands: pinch. Controllers: trigger to select, squeeze near a body to grab. Hardware unverified.');return true;
  }catch(error){const failed=session;try{if(failed)await failed.end();}catch{}if(state.active||snapshot||session)ended();else{state.busy=false;enter.disabled=!state.supported;}report(`XR could not start (${error.name||'error'}). Desktop remains available. Open the HTTPS page directly in Quest Browser.`);return false;}
 }
 async function end(){if(!session||state.busy)return false;state.busy=true;releaseAll('ending session');exit.disabled=true;try{await session.end();return true;}catch(error){state.busy=false;exit.disabled=false;report(`Exit failed (${error.name||'error'}). Use the headset system menu.`);return false;}}
 function action(id){
  releaseAll('UI action');pressSerial++;
  if(['select','grab','bless','lightning'].includes(id)){state.mode=id;syncUI();return;}
  if(id==='exit'){end();return;}
  if(id==='pause'){const s=getStatus();activate(!s.started?'start':'pause');syncUI();return;}
  if(!viewer)return;
  if(id==='place'){state.placing=true;place(viewer,true);}
  else if(id==='done'){state.placing=false;if(!getStatus().started)activate('start');}
  else if(id==='reset'){Object.assign(settings,{scale:initialScale,distance:.68,height:-.43});place(viewer,true);}
  else{const moves={near:['distance',-.05,.4,1.05],far:['distance',.05,.4,1.05],raise:['height',.05,-.75,-.25],lower:['height',-.05,-.75,-.25],smaller:['scale',-.002,.024,Math.min(.036,1.12/Math.max(width,depth))],larger:['scale',.002,.024,Math.min(.036,1.12/Math.max(width,depth))]};if(moves[id]){const [key,delta,min,max]=moves[id];settings[key]=T.MathUtils.clamp(settings[key]+delta,min,max);place(viewer);}}
  syncAnchor();syncUI();
 }
 function uiHit(worldRay,point){
  if(!worldUI.visible)return null;
  if(point){const local=worldUI.worldToLocal(point.clone());if(Math.abs(local.z)<.032){for(const [id,b]of Object.entries(buttons))if(b.group.visible){const p=b.group.worldToLocal(point.clone());if(Math.abs(p.x)<b.bg.geometry.parameters.width/2&&Math.abs(p.y)<.022)return{id};}if(Math.abs(local.x)<.29&&local.y>-.195&&local.y<.085)return{id:null};}}
  if(!worldRay)return null;uiRay.ray.copy(worldRay.ray);uiRay.near=0;uiRay.far=2.5;const hits=uiRay.intersectObjects([panel,...Object.values(buttons).filter(b=>b.group.visible).map(b=>b.bg)],false);return hits.length?{id:hits[0].object.userData.xrAction??null}:null;
 }
 function rayFromPose(pose,out){if(!finitePose(pose))return null;out.set(V().copy(pose.transform.position),new T.Vector3(0,0,-1).applyQuaternion(new T.Quaternion().copy(pose.transform.orientation)));out.near=0;out.far=2.5;return out;}
 function enrich(picked){if(!picked?.body)return null;const owner=sim.colliderOwners.get(picked.handle),part=owner?.type==='character'?owner.character.parts[owner.index]:null,collider=part?.collider??owner?.rock?.collider;return collider?{...picked,collider,character:owner?.character,part}:null;}
 function target(worldRay){if(!worldRay)return null;const control=worldHit(worldRay);if(control)return{kind:'site',id:control.id,control};const picked=pick(worldRay);return picked?{kind:'body',id:picked.body.handle,picked}:null;}
 function sameTarget(a,b){return !!a&&!!b&&a.kind===b.kind&&(a.kind==='body'?a.picked.character?b.picked.character===a.picked.character:b.picked.body===a.picked.body:a.id===b.id);}
 function update(now,frame){
  if(!state.active)return;syncUI();validView=false;
  if(state.busy||!frame||!space||session?.visibilityState!=='visible'||performance.now()<overlayUntil){releaseAll('tracking paused');lastTime=null;return;}
  const elapsed=lastTime===null?1/72:(now-lastTime)/1000;lastTime=now;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>.12){releaseAll('frame interrupted');return;}const dt=Math.max(1/240,Math.min(.05,elapsed));
  let pose;try{pose=frame.getViewerPose(space);}catch{}if(!finitePose(pose)){releaseAll('viewer lost');return;}viewer=pose;validView=true;state.frames++;if(!state.placed)place(pose,true);syncAnchor();
  const viewerAt=V().copy(pose.transform.position).applyMatrix4(inverse);viewCamera.position.copy(viewerAt);viewCamera.quaternion.copy(scene.quaternion).invert().multiply(new T.Quaternion().copy(pose.transform.orientation));viewCamera.updateMatrixWorld(true);
  const sources=Array.from(session.inputSources),serial=pressSerial;
  for(const side of sides){
   const h=hands[side],source=sources.find(s=>s.handedness===side&&s.hand)||sources.find(s=>s.handedness===side&&!s.hand);h.feedback.hide();
   if(!source){clearHand(side,'not tracked');h.source=null;continue;}
   if(h.source!==source){clearHand(side,'new source');h.source=source;h.eventSelect=h.eventSqueeze=false;}
   let worldPoint,worldRay=null,pressed=false,began=false,endedPress=false,squeeze=false;
   if(source.hand){
    const points=readHandJoints(frame,source,space);if(!points){clearHand(side);continue;}const pinch=updatePinch(h.pinch,points,dt);if(pinch.lost){clearHand(side);continue;}
    worldPoint=pinch.point;pressed=pinch.pinched;began=pinch.started;endedPress=pinch.ended;h.armed=h.pinch.armed;h.marker.visible=false;playerHands[side].group.visible=retargetHand(playerHands[side],points,inverse);
    let aim;try{aim=frame.getPose(source.targetRaySpace,space);}catch{}worldRay=rayFromPose(aim,ray);
    if(!worldRay){const direction=points['index-finger-tip'].clone().sub(points['index-finger-phalanx-proximal']);if(direction.lengthSq()>1e-7){ray.set(points['index-finger-tip'],direction.normalize());ray.near=0;ray.far=2.5;worldRay=ray;}}
   }else{
    let grip,aim;try{grip=frame.getPose(source.gripSpace,space);aim=frame.getPose(source.targetRaySpace,space);}catch{}
    if(!finitePose(grip)||!finitePose(aim)){clearHand(side);continue;}worldPoint=V().copy(grip.transform.position);worldRay=rayFromPose(aim,ray);
    if(h.lastPoint&&h.lastPoint.distanceTo(worldPoint)>.09+dt*1.2){clearHand(side,'pose jumped');h.lastPoint=worldPoint;continue;}
    h.lastPoint=worldPoint.clone();const pad=source.gamepad,trigger=pad?.buttons?.[0];squeeze=!!(pad?.buttons?.[1]?.pressed||pad?.buttons?.[1]?.value>.65||h.eventSqueeze);
    const down=!!(trigger?.pressed||trigger?.value>.65||h.eventSelect)||(state.mode==='grab'&&squeeze);h.stable++;if(!down&&!squeeze&&h.stable>=3)h.armed=true;
    pressed=h.pressed?down:h.armed&&down;began=!h.pressed&&pressed;endedPress=h.pressed&&!pressed;if(began)h.armed=false;
    playerHands[side].group.visible=false;h.marker.visible=true;h.marker.position.copy(worldPoint).applyMatrix4(inverse);h.marker.quaternion.copy(scene.quaternion).invert().multiply(new T.Quaternion().copy(grip.transform.orientation));h.marker.scale.setScalar(1/state.scale);h.line.visible=state.mode!=='grab';h.marker.updateWorldMatrix(true,false);const positions=h.line.geometry.attributes.position;const lineStart=h.marker.worldToLocal(worldRay.ray.origin.clone()),lineEnd=h.marker.worldToLocal(worldRay.ray.at(1,V()));positions.setXYZ(0,lineStart.x,lineStart.y,lineStart.z);positions.setXYZ(1,lineEnd.x,lineEnd.y,lineEnd.z);positions.needsUpdate=true;
   }
   h.tracked=true;h.pressed=pressed;h.squeeze=squeeze;const at=worldPoint.clone().applyMatrix4(inverse),overUI=uiHit(worldRay,worldPoint),s=getStatus(),eligible=!state.placing&&s.started&&!s.paused&&!s.ended;
   if(began&&overUI){if(overUI.id)action(overUI.id);else{h.press=null;release(side,false);}if(serial!==pressSerial)return;continue;}
   if(overUI){h.press=null;if(sim.xrGrabs.has(side))release(side,false);}
   if(!eligible){h.press=null;if(sim.xrGrabs.has(side))release(side,false);state.hands[side]='UI only';continue;}
   const inReach=Math.abs(at.x-center.x)<width/2+4&&Math.abs(at.z-center.z)<depth/2+4&&at.y>-8&&at.y<30;
   if(!inReach&&sim.xrGrabs.has(side)){clearHand(side,'out of bounds');continue;}
   if(!overUI&&state.mode==='grab'){
    const picked=inReach?enrich(pickXRTarget(sim,side,at,XR_GRAB_REACH,state.scale)):null;
    if(began&&picked&&grab(side,picked,state.scale)){h.offset.copy(picked.point).sub(at);sim.xrMoveGrab(side,at.clone().add(h.offset),dt);}
    if(sim.xrGrabs.has(side)){if(endedPress)release(side,true);else if(pressed)sim.xrMoveGrab(side,at.clone().add(h.offset),dt);}
    h.feedback.show({picked,grab:sim.xrGrabs.get(side),viewer:viewerAt,armed:h.armed});
   }else if(!overUI){
    const aimed=target(worldRay);
    if(began)h.press={target:aimed,time:now,point:worldPoint.clone(),mode:state.mode};
    if(h.press&&worldPoint.distanceTo(h.press.point)>.04)h.press=null;
    if(endedPress){const pending=h.press;h.press=null;if(pending&&now-pending.time<=700&&pending.mode===state.mode&&sameTarget(pending.target,aimed)){
      if(state.mode==='select'){if(aimed.kind==='site')activate(aimed.id);else select(aimed.picked);}
      else if(aimed.kind==='body')cast(aimed.picked,viewerAt,side,state.mode);
     }else if(pending&&!pending.target&&!aimed&&state.mode==='select')select(null);}
    if(aimed?.kind==='body')h.feedback.show({picked:aimed.picked,viewer:viewerAt,power:state.mode==='select'?null:state.mode,cooldown:s.cooldown,armed:h.armed});
   }
   state.hands[side]=sim.xrGrabs.has(side)?'holding':pressed?'pressed':h.armed?'ready':'release to arm';
  }
  syncUI();
 }
 enter.addEventListener('click',startSession);exit.addEventListener('click',end);ui.addEventListener('beforexrselect',e=>{e.preventDefault();overlayUntil=performance.now()+400;releaseAll('DOM controls');});
 probeVillageXR().then(result=>{state.supported=result.supported;state.sessionMode=result.mode??null;enter.disabled=!result.supported;enter.textContent=result.supported?(result.mode==='immersive-ar'?'Enter MR':'Enter VR'):'XR unavailable';report(result.reason+' Hardware not tested.');});
 return{startSession,end,update,releaseAll,syncDesktopUI:({detailsOpen=false,width=innerWidth}={})=>{ui.hidden=!state.active&&detailsOpen&&width<650;},isActive:()=>state.active,shouldHoldSimulation:()=>state.active&&(!validView||state.busy||!state.placed||state.placing),getViewCamera:()=>state.active?viewCamera:camera,state:()=>({...state,hands:{...state.hands},held:[...sim.xrGrabs.keys()],placement:{...settings,center:center.toArray(),widthMetres:width*state.scale,depthMetres:depth*state.scale},controls:['select','grab','bless','lightning','pause','place','exit']})};
}
