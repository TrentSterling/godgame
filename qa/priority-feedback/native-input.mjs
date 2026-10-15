import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {controls,Frame,pose,controllerSource,flush} from '../xr-village/dom-xr-fixture.mjs';
import {FONT,createSettlementEconomy} from './generated/components.mjs';
const out=process.env.HH_OUTPUT_ROOT,mode=process.argv[2]??'ordinary';
let clock=1000;Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
await(await import(pathToFileURL(process.env.HH_NATIVE_BUNDLE??out+'/candidate/native.mjs'))).ready;
const qa=SETTLEMENTQA,c=qa.context,T=c.THREE,checks=[],inputs=[];
const state=()=>qa.state(),texts=()=>c.hud.layout.items.filter(i=>i.kind==='text').map(i=>i.text);
const physics=()=>Buffer.from(c.world.takeSnapshot());
function input(type,fields={}){const e=Object.assign(new Event(type,{cancelable:true}),{button:0,shiftKey:false,pointerType:'mouse',pointerId:1,...fields});(['keydown','mouseup'].includes(type)?window:c.renderer.domElement).dispatchEvent(e);inputs.push({type,fields,clock});}
function key(code){input('keydown',{code});qa.step(0);}
function clickSite(id){const p=qa.project(c.worldCues.getControl(id).plate.getWorldPosition(new T.Vector3()).toArray());input('pointermove',{clientX:p.x,clientY:p.y});input('mousedown',{clientX:p.x,clientY:p.y});clock+=80;input('mouseup',{clientX:p.x,clientY:p.y});qa.step(0);}
function run(seconds){for(let i=0;i<seconds*60;i++){clock+=1000/60;qa.step(1/60);}}
const check=(name,details={})=>checks.push({name,time:state().time,text:texts(),...details});
const inventory=s=>JSON.stringify({pantry:s.pantry,stones:s.stones,quarry:s.quarry,sites:s.sites.map(({id,delivered,required})=>({id,delivered,required})),totals:s.totals});
const ack='BRACE IS NOW THE CONSTRUCTION PRIORITY.';
let xrNow=1000;
const frame=data=>{xrNow+=1000/72;c.villageXR.update(xrNow,new Frame({viewer:pose({x:.2,y:1.65,z:.1}),...data}));};
function ray(source,target,origin=target.clone().add(new T.Vector3(0,0,.22))){const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),target.clone().sub(origin).normalize());return{poses:new Map([[source.targetRaySpace,pose(origin,q)],[source.gripSpace,pose(origin,q)]])};}
function xrClick(target){const source=controllerSource('right');controls.lastSession.sources([source]);const data=ray(source,target);for(let i=0;i<3;i++)frame(data);source.gamepad.buttons[0].pressed=true;frame(data);source.gamepad.buttons[0].pressed=false;frame(data);qa.step(0);}
function ui(id){c.scene.updateMatrixWorld(true);xrClick(c.scene.getObjectByName('Village XR '+id).getWorldPosition(new T.Vector3()));}
async function startXR(){await flush();assert(await c.villageXR.startSession());frame();ui('done');assert(state().started);assert(!c.villageXR.shouldHoldSimulation());}
function glyphs(text){const p=[];let x=0;const size=.00165;for(const char of text.toUpperCase()){const rows=FONT[char];if(rows)for(let j=0;j<7;j++)for(let i=0;i<5;i++)if(rows[j][i]==='1'){const l=x+i*size,t=-j*size;for(const[a,b]of[[l,t],[l+size,t],[l+size,t-size],[l,t],[l+size,t-size],[l,t-size]])p.push(a,b,0);}x+=6*size;}return new Float32Array(p);}
function xrMessageEquals(text){assert(text.length<=42);const panel=c.scene.getObjectByName('Village XR anchored controls'),rows=panel.children.at(-1).children;assert.equal(rows.length,3);assert.deepEqual(rows[2].geometry.attributes.position.array,glyphs(text));}
const result={passed:false,mode,scope:'CPU-only native Rapier and actual application callbacks under non-rendering DOM/WebXR fixtures. Pointer coordinates are projected fixture targeting; simulation clock is stepped. No ordinary-browser, GPU or headset claim.',checks,inputs};
try{
 if(mode==='ordinary'){
  key('Space');const before=inventory(state().jobs),body=physics();clickSite('brace');assert.equal(state().jobs.prioritySiteId,'brace');assert(texts().includes(ack),'Accepted construction sign click must acknowledge the selected priority');assert.equal(inventory(state().jobs),before);assert.deepEqual(physics(),body);check('accepted-world-sign-acknowledges-without-inventory-or-physics-change');
  for(const width of [390,640,1440]){innerWidth=width;window.dispatchEvent(new Event('resize'));qa.step(0);assert(texts().includes(ack));for(const item of c.hud.layout.items.filter(i=>i.kind==='text'))assert(item.x>=0&&item.x+item.width<=width+.001);}innerWidth=1280;window.dispatchEvent(new Event('resize'));check('existing-panel-bounds-390-640-1440');
  run(3.1);assert(!texts().includes(ack));check('acknowledgement-expires-after-three-simulation-seconds');
  key('Digit3');assert(texts().includes('STORES NOW HAS PRIORITY FOR SPARE STONE.'));assert.equal(state().jobs.prioritySiteId,'pantry');check('stores-shortcut-uses-spare-stone-wording');
  key('Space');const frozen=JSON.stringify(state().jobs);key('Digit1');assert.equal(JSON.stringify(state().jobs),frozen);assert(texts().includes('PAUSED'));check('paused-priority-still-rejected');
 }else if(mode==='committed'){
  key('Space');key('Digit1');let carrier;
  for(let i=0;i<3600&&!carrier;i++){run(1/60);carrier=state().jobs.villagers.find(w=>w.alive&&w.resourceKind==='stone'&&w.stoneId&&w.targetSiteId==='brace'&&['to-site','delivering'].includes(w.phase));}
  assert(carrier,'Natural native simulation must produce a committed Brace carrier');const before=state().jobs,body=physics(),load=before.stones.find(s=>s.id===carrier.stoneId);assert.equal(load.status,'carried');
  key('Digit2');const after=state().jobs,w=after.villagers.find(w=>w.id===carrier.id);assert.equal(after.prioritySiteId,'bridge');assert.equal(w.targetSiteId,'brace');assert.equal(w.stoneId,carrier.stoneId);assert.deepEqual(after.stones.find(s=>s.id===carrier.stoneId),load);assert.equal(inventory(after),inventory(before));assert.deepEqual(physics(),body);assert(texts().includes('BRIDGE IS NEXT AFTER CURRENT DELIVERIES.'));check('switch-explains-and-preserves-real-committed-carrier',{carrier:w,load});
  run(.5);const follow=state().jobs.villagers.find(w=>w.id===carrier.id);assert(follow.targetSiteId==='brace'||state().events.some(e=>e.type==='stone-delivered'&&e.stoneId===carrier.stoneId&&e.siteId==='brace'));check('committed-destination-survives-further-simulation');
 }else if(mode==='budgets'){
  key('Space');key('Digit1');assert(texts().includes(ack));
  for(const [site,reason,mandatory] of [['brace','access-stone-budget',['bridge']],['garden-upgrade','garden-stone-budget',[]],['defense','defense-stone-budget',[]]]){
   const p={x:0,y:0,z:0},model=createSettlementEconomy({villagers:[{id:'worker',position:p}],pantry:{position:p},quarry:{position:p,reserve:0},forageSources:[{id:'garden',position:p}],sites:[{id:'brace',position:p,required:3},{id:'bridge',position:p,required:5},{id:'garden-upgrade',position:p,required:3},{id:'defense',position:p,required:2}],mandatorySiteIds:mandatory,gardenUpgrade:{siteId:'garden-upgrade',sourceId:'garden'},defenseUpgrade:{siteId:'defense'},initialPrioritySiteId:'bridge'});
   const beforeModel=JSON.stringify(model.snapshot()),rejected=model.command({type:'set-priority',siteId:site});assert.equal(rejected.ok,false);assert.equal(rejected.reason,reason);assert.equal(JSON.stringify(model.snapshot()),beforeModel);
   const before=JSON.stringify(state().jobs),command=c.jobs.command;c.jobs.command=()=>rejected;
   try{assert.equal(qa.setPriority(site).reason,reason);}finally{c.jobs.command=command;}
   assert.equal(JSON.stringify(state().jobs),before);assert(texts().some(t=>t.startsWith('KEEP STONE FOR')));assert(!texts().some(t=>t.includes('CONSTRUCTION PRIORITY')||t.includes('CURRENT DELIVERIES')));check('real-model-'+reason+'-keeps-existing-error',{fixture:'Actual low-resource model rejection is routed through production setPriority; current app economy stays unchanged.'});
  }
 }else if(mode==='xr'||mode==='held-food'){
  await startXR();
  if(mode==='xr'){
   const body=physics();c.scene.updateMatrixWorld(true);xrClick(c.worldCues.getControl('brace').plate.getWorldPosition(new T.Vector3()));assert.equal(state().jobs.prioritySiteId,'brace');xrMessageEquals('Brace is now the construction priority.');assert.deepEqual(physics(),body);check('mocked-xr-world-sign-renders-complete-acknowledgement-in-existing-row');
  }else{
   controls.lastSession.sources([]);frame();let food;
   for(let i=0;i<1800&&!food;i++){run(1/60);food=c.loads.find(r=>r.kind==='food'&&/^villager-/.test(r.owner??''));}
   assert(food,'Native production supplies real carried food');ui('grab');assert(qa.setPriority('brace').ok);qa.step(0);const priorAck=texts().find(t=>t.startsWith('BRACE IS '));assert(priorAck);const since=state().time;
   c.scene.updateMatrixWorld(true);const point=new T.Vector3().copy(food.body.translation()).applyMatrix4(c.scene.matrixWorld),source=controllerSource('right');controls.lastSession.sources([source]);const data=ray(source,point.clone().add(new T.Vector3(0,0,-.1)),point);for(let i=0;i<3;i++)frame(data);source.gamepad.buttons[1].pressed=true;frame(data);qa.step(0);frame(data);
   assert.equal(c.sim.xrGrabs.get('right')?.body,food.body);assert.equal(food.owner,'player');assert(state().time-since<3);assert(!texts().includes(priorAck));const pantry=state().worldCues.controls.find(s=>s.id==='stockpile');assert(pantry.foodDestination);assert.equal(pantry.label,'PANTRY|BRING FOOD HERE');xrMessageEquals('SELECT WORKER, THEN WORK SIGN');check('new-priority-ack-does-not-mask-real-held-food-pantry-cue-or-xr-row',{foodId:food.id,pantry});
  }
  await controls.lastSession.end();qa.step(0);assert(!c.villageXR.isActive());check('mocked-xr-session-exits');
 }else throw Error(mode);
 result.passed=true;
}catch(e){result.error=String(e.stack??e);throw e;}
finally{result.final={time:state().time,priority:state().jobs.prioritySiteId,text:texts()};fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/priority-'+mode+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,mode,checks:checks.map(c=>c.name),error:result.error}));}
