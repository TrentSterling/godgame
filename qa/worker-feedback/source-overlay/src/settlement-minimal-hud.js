import * as THREE from 'three';
import {FONT} from './gpu-hud.js';
import {normalizeFoodHUDState} from './settlement-food-hud.js';
import {settlementWorkerFeedback} from './settlement-worker-feedback.js';

// This overlay deliberately leaves the settlement visible. Assignment, stores,
// and construction live in the world; the two drawers are opt-in fallbacks.
const INK={panel:'#243a43',raised:'#304c53',active:'#426d6e',text:'#e5eeee',soft:'#bed0d0',accent:'#91c7c3',warning:'#deb6ad',muted:'#8fa7aa'};
const clean=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9 +:/?.-]/g,' ').replace(/\s+/g,' ').trim();
const number=value=>Math.max(0,Number(value)||0);
const entityId=value=>typeof value==='string'?value:value?.siteId??value?.zoneId??value?.sourceId??value?.id??null;

export function settlementMinimalHUDLayout(input={}){
  const s=normalizeFoodHUDState(input),{width,height}=s,narrow=width<650,pad=narrow?10:16,gap=6;
  const controlsOpen=!!input.controlsOpen,detailsOpen=!!input.detailsOpen&&!controlsOpen,items=[],buttons=[],regions=[];
  const quad=(x,y,w,h,color)=>items.push({kind:'quad',x,y,width:w,height:h,color});
  const label=(value,x,y,maxWidth,size=1.4,color=INK.text)=>{
    const text=clean(value);if(!text)return;
    const fitted=Math.min(size,maxWidth/Math.max(1,text.length*6-1));
    items.push({kind:'text',text,x,y,size:fitted,color,width:(text.length*6-1)*fitted,height:7*fitted});
  };
  const panel=(id,x,y,w,h)=>{quad(x,y,w,h,INK.panel);regions.push({id,x,y,w,h});};
  const button=(id,title,x,y,w,h=32,active=false,enabled=true)=>{
    const b={id,x,y,w,h,enabled};buttons.push(b);quad(x,y,w,h,active?INK.active:INK.panel);
    label(title,x+10,y+(h-10.5)/2,w-20,1.5,enabled?INK.text:INK.muted);return b;
  };
  // Reachable at every phase, including start, pause, and end screens.
  const barWidths=[s.finished?80:!s.started?68:s.paused?88:74,92,82];
  const excess=Math.max(0,barWidths.reduce((a,b)=>a+b,0)+gap*2-(width-pad*2));barWidths[1]-=excess/2;barWidths[2]-=excess/2;
  const barWidth=barWidths.reduce((a,b)=>a+b,0)+gap*2;
  let x=width-pad-barWidth;
  regions.push({id:'menu',x,y:pad,w:barWidth,h:32});
  button(s.finished?'replay':!s.started?'start':'pause',s.finished?'REPLAY':!s.started?'START':s.paused?'RESUME':'PAUSE',x,pad,barWidths[0],32,s.paused||!s.started||s.finished);x+=barWidths[0]+gap;
  button('controls',controlsOpen?'CLOSE':'CONTROLS',x,pad,barWidths[1],32,controlsOpen);x+=barWidths[1]+gap;
  button('details',detailsOpen?'HIDE':'DETAILS',x,pad,barWidths[2],32,detailsOpen);

  let help='',secondary='';
  // Current worker blockage outranks persistent quarry advice; historical meal
  // shortages and an empty pantry alone do not establish that work is stopped.
  const foodBlocked=s.workers.some(worker=>worker&&worker.alive!==false
    &&!(Number.isFinite(worker.hp)&&worker.hp<=0)&&!['dead','lost'].includes(worker.phase)
    &&worker.blocked==='empty-pantry');
  if(s.complete){help='VILLAGE ESTABLISHED';secondary=s.outcome.feedingRequired===false?'THE VILLAGE HAS BUILDING SUPPLIES':'EVERYONE IS FED WITH ANOTHER MEAL IN STORE';}
  else if(s.finished){help='THE VILLAGE WAS LOST';secondary='REPLAY TO TRY AGAIN';}
  else if(!s.started){help=input.selectedWorker?`WORKER ${Number(input.selectedWorker.id.split('-').at(-1))+1} SELECTED`:'PLAN YOUR VILLAGE';secondary=s.notice||'CLICK A VILLAGER, THEN A GARDEN OR QUARRY SIGN.';}
  else if(s.paused){help='PAUSED';secondary='SPACE TO RESUME';}
  else if(input.heldRaider){help='FLICK TO THROW THE RAIDER';secondary='RELEASE WHILE MOVING. WHEEL ADJUSTS DEPTH';}
  else if(input.heldWorker){
    const preview=input.placementPreview;
    help=preview?.hint||'PLACE AT A GARDEN OR QUARRY TO ASSIGN WORK';
    secondary='WHEEL ADJUSTS DEPTH';
  // Exact held-food guidance already lives on the Pantry sign. Leave this
  // panel free for existing notices, danger and injury; other holds keep it.
  }else if(s.held&&!input.heldFood){help='MOVE TO SAFE GROUND';secondary='WHEEL ADJUSTS DEPTH';}
  else if(s.notice)help=s.notice;
  else if(s.hazard.phase==='warning')help='QUARRY BOULDER COMING LOOSE';
  else if(input.blessHint)help=input.blessHint;
  else if(input.selectedWorker){help=`WORKER ${Number(input.selectedWorker.id.split('-').at(-1))+1} SELECTED`;secondary=settlementWorkerFeedback(input.selectedWorker);}
  else if(input.raid?.enabled&&input.raid.resolved&&input.fallenWorkers)help='LIFT FALLEN WORKERS ONTO CLEAR GROUND';
  else if(s.hazard.blockedLoads?.length&&!foodBlocked)help='MOVE THE BOULDER TO FREE THE QUARRY';
  if(help&&!controlsOpen){
    const planning=!s.started&&!s.finished;const w=Math.min(width-pad*2,secondary?490:Math.max(170,help.length*7.1+28)),h=planning?92:secondary?54:34,y=height-pad-h;
    panel('context',(width-w)/2,y,w,h);
    label(help,(width-w)/2+13,y+11,w-26,narrow?1.15:1.35,s.hazard.phase==='warning'?INK.warning:INK.text);
    if(secondary)label(secondary,(width-w)/2+13,y+34,w-26,narrow?1.0:1.12,INK.soft);
    if(planning){button('start','START VILLAGE',(width-w)/2+12,y+55,152,28,true);label('OR SPACE - TIME IS STOPPED',(width-w)/2+176,y+64,w-188,narrow?.8:1.0,INK.soft);}
  }

  if(detailsOpen){
    const currentMealContract=Object.hasOwn(s.outcome,'fullMealReady');
    const mealReady=s.outcome.feedingRequired===false||(currentMealContract?s.outcome.fullMealReady:s.outcome.mealConsumed);
    const reserveReady=s.outcome.feedingRequired===false||(s.outcome.foodReady&&(currentMealContract||s.outcome.replenishedAfterMeal));
    const w=Math.min(width-pad*2,344),h=126,y=pad+40;
    panel('details',width-pad-w,y,w,h);
    label(`PANTRY ${Math.floor(s.food)} FOOD / ${Math.floor(s.spareStone)} STONE`,width-pad-w+12,y+12,w-24,1.35);
    label(`NEXT MEAL ${Math.ceil(s.mealIn)}S / ${s.mealNeed} FOOD`,width-pad-w+12,y+34,w-24,1.18,INK.soft);
    label(`${s.alive} ALIVE / ${s.joined?'FOURTH WORKER HOME':'FOURTH WORKER STRANDED'}`,width-pad-w+12,y+55,w-24,1.1,INK.soft);
    label(`BRACE ${number(s.sites.find(a=>a.id==='brace')?.delivered)}/3 / BRIDGE ${number(s.sites.find(a=>a.id==='bridge')?.delivered)}/5`,width-pad-w+12,y+76,w-24,1.2,INK.soft);
    label(s.complete?'SETTLEMENT COMPLETE':!s.joined?'NEXT: BRING THE VILLAGER HOME':!s.outcome.islandHarvestReady&&s.islandRequired?'NEXT: DELIVER ISLAND FOOD':!mealReady?'NEXT: FEED EVERYONE A FULL MEAL':!reserveReady?`NEXT: KEEP ${s.foodGoal} FOOD FOR THE NEXT MEAL`:!s.outcome.stoneReady?'NEXT: STORE SPARE STONE':'NEXT: KEEP EVERYONE SAFE',width-pad-w+12,y+101,w-24,1.05,INK.accent);
  }

  if(controlsOpen){
    const w=Math.min(width-pad*2,438),rowH=38,roleCols=2,roleGap=6,roleW=(w-24-roleGap)/roleCols;
    const h=276,y=height-pad-h,left=pad;
    panel('controls',left,y,w,h);
    label('CLICK A VILLAGER, THEN A GARDEN OR QUARRY.',left+12,y+12,w-24,1.23);
    label('CLICK SITE SIGNS TO CHOOSE CONSTRUCTION.',left+12,y+31,w-24,1.16,INK.soft);
    label('RIGHT DRAG: ORBIT / WHEEL: ZOOM / SPACE: PAUSE',left+12,y+49,w-24,1.03,INK.soft);
    label('MIDDLE DRAG OR SHIFT+RIGHT DRAG: PAN',left+12,y+63,w-24,1.03,INK.soft);
    label('F: FOCUS SELECTED WORKER / HOME: OVERVIEW',left+12,y+77,w-24,1.03,INK.soft);
    label('DRAG OR HOLD TO LIFT / WHEEL ADJUSTS DEPTH',left+12,y+91,w-24,1.03,INK.soft);
    label('SHIFT+CLICK: BLESS WOUNDED / LIGHTNING RAIDERS',left+12,y+105,w-24,1.03,INK.accent);
    const siteChoices=[['brace','BRACE'],['bridge','BRIDGE'],...(s.sites.some(site=>site.id==='garden-upgrade')?[['garden-upgrade','GARDEN']]:[]),['stockpile','STORES']];
    const siteW=(w-24-(siteChoices.length-1)*roleGap)/siteChoices.length;
    for(const [i,[id,title]]of siteChoices.entries()){
      button(id,title,left+12+i*(siteW+roleGap),y+120,siteW,32,s.priority===id||(id==='stockpile'&&s.priority==='pantry'));
    }
    for(let i=0;i<4;i++){
      const worker=s.workers.find(v=>v.id===`villager-${i}`||v.id===`worker-${i}`||String(v.id)===String(i))??s.workers[i];
      const locked=i===3&&!s.joined,dead=worker?.alive===false||worker?.phase==='dead',role=(worker?.pendingRole??worker?.role)==='food'?'FOOD':'STONE';
      const b=button(`worker-${i}-role`,locked?'4 STRANDED':`${i+1} ${dead?'LOST':role}${worker?.pendingRole&&!dead?' NEXT':''}`,left+12+(i%2)*(roleW+roleGap),y+163+Math.floor(i/2)*(rowH+6),roleW,rowH,role==='FOOD'&&!dead&&!locked,!locked&&!dead);
      // Buttons preserve the old role command IDs, so this is a complete
      // accessible fallback when a world target is hard to reach.
      b.role=role.toLowerCase();
    }
    label('CLICK A WORKER ROLE TO SWITCH / D: DETAILS',left+12,y+256,w-24,1.05,INK.soft);
  }
  return{width,height,items,buttons,regions,state:{...s,controlsOpen,detailsOpen},coverage:regions.reduce((a,r)=>a+r.w*r.h,0)/(width*height)};
}

export function createSettlementMinimalHUD(){
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,1280,0,720,-2,2);
  const material=new THREE.MeshBasicMaterial({vertexColors:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.name='settlement_minimal_hud';mesh.frustumCulled=false;scene.add(mesh);
  let key='',layout={buttons:[],items:[],regions:[]},controlsOpen=false,detailsOpen=false;
  return{
    scene,camera,get layout(){return layout;},
    get controlsOpen(){return controlsOpen;},get detailsOpen(){return detailsOpen;},
    toggleControls(){controlsOpen=!controlsOpen;if(controlsOpen)detailsOpen=false;return controlsOpen;},toggleDetails(){detailsOpen=!detailsOpen;if(detailsOpen)controlsOpen=false;return detailsOpen;},
    setControlsOpen(value){controlsOpen=!!value;if(controlsOpen)detailsOpen=false;},setDetailsOpen(value){detailsOpen=!!value;if(detailsOpen)controlsOpen=false;},
    hitTest(x,y){return layout.buttons.find(b=>b.enabled&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)?.id??null;},
    contains(x,y){return layout.regions.some(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)||!!this.hitTest(x,y);},
    update(input={}){
      if(input.controlsOpen!==undefined)controlsOpen=!!input.controlsOpen;if(input.detailsOpen!==undefined)detailsOpen=!!input.detailsOpen;
      const next=settlementMinimalHUDLayout({...input,controlsOpen,detailsOpen}),nextKey=JSON.stringify([next.width,next.height,next.items,next.buttons]);layout=next;if(nextKey===key)return;key=nextKey;
      camera.right=next.width;camera.bottom=next.height;camera.updateProjectionMatrix();
      const positions=[],colors=[],cache=new Map();
      const quad=(x,y,w,h,color)=>{let c=cache.get(color);if(!c){c=new THREE.Color(color);cache.set(color,c);}for(const[a,b]of[[x,y],[x+w,y],[x+w,y+h],[x,y],[x+w,y+h],[x,y+h]]){positions.push(a,b,0);colors.push(c.r,c.g,c.b);}};
      for(const item of layout.items){if(item.kind==='quad'){quad(item.x,item.y,item.width,item.height,item.color);continue;}let x=item.x;for(const ch of item.text){const glyph=FONT[ch];if(glyph)for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row][col]==='1')quad(x+col*item.size,item.y+row*item.size,item.size,item.size,item.color);x+=item.size*6;}}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));mesh.geometry.dispose();mesh.geometry=geometry;
    },
    dispose(){mesh.geometry.dispose();material.dispose();mesh.removeFromParent();},
  };
}
