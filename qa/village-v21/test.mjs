import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const output = 'artifacts';
fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync('candidate.html');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
assert.equal(commit, process.env.EXPECTED_HEAD, 'Test must run the exact PR head');
const report = {commit, candidateSha256:crypto.createHash('sha256').update(html).digest('hex'), startedAt:new Date().toISOString(), inputMethod:'Playwright real mouse and keyboard events; QA state reads, projection, and fixed simulation stepping only', cases:[], console:[], pageErrors:[], requestFailures:[]};
const server = http.createServer((req,res) => {
  if(req.url.split('?')[0] === '/favicon.ico') {res.writeHead(204); res.end();return;}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
report.browser = browser.version();
let page;
const state = () => page.evaluate(()=>SETTLEMENTQA.state());
async function tick(n=1){
  for(let i=0;i<n;i+=30) await page.evaluate(count=>{for(let j=0;j<count;j++)SETTLEMENTQA.step(1/60);},Math.min(30,n-i));
  return state();
}
async function shot(name){await page.screenshot({path:path.join(output,`${name}.png`)});}
async function save(name, value){fs.writeFileSync(path.join(output,`${name}.json`),JSON.stringify(value,null,2));}
async function fresh(name){
  if(page)await page.close();
  page = await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1,...(name==='selection-pause-escape-and-sign-release'?{recordVideo:{dir:path.join(output,'video'),size:{width:1280,height:720}}}:{})});
  page.on('console',m=>report.console.push({type:m.type(),text:m.text()}));
  page.on('pageerror',e=>report.pageErrors.push(String(e)));
  page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),failure:r.failure()}));
  await page.goto(base+'/?capture',{waitUntil:'load'});
  await page.waitForFunction(()=>window.SETTLEMENTQA||window.SETTLEMENTERROR,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.SETTLEMENTERROR??null),null,'No startup error');
  await shot('startup');
  await page.keyboard.press('Space');
  await tick(90);
  assert.equal((await state()).started,true);
}
async function bodyPoint(id){
  return page.evaluate(id=>{
    const qa=SETTLEMENTQA,c=qa.context,t=c.villagers.find(v=>'villager-'+v.id===id),T=c.THREE;
    if(!t)throw Error('Missing worker '+id);
    const candidates=[];
    for(const part of t.parts){const p=part.body.translation();for(const dy of [0,.06,-.06])candidates.push({x:p.x,y:p.y+dy,z:p.z});}
    for(const p of candidates){
      const screen=qa.project([p.x,p.y,p.z]);
      if(screen.x<5||screen.y<5||screen.x>innerWidth-5||screen.y>innerHeight-5||c.hud.contains(screen.x,screen.y))continue;
      const ray=new T.Raycaster();ray.setFromCamera({x:screen.x/innerWidth*2-1,y:1-screen.y/innerHeight*2},c.camera);
      const hit=c.picker.pick(ray);
      if(hit?.character===t)return {...screen,part:hit.partIndex??hit.index??null};
    }
    throw Error('No visible worker surface '+id);
  },id);
}
async function signPoint(id){return page.evaluate(id=>{
  const qa=SETTLEMENTQA,c=qa.context,control=c.worldCues.getControl(id),T=c.THREE;
  if(!control)throw Error('No sign '+id);
  const p=control.plate.getWorldPosition(new T.Vector3());return qa.project(p.toArray());
},id);}
async function select(id){const p=await bodyPoint(id);await page.mouse.click(p.x,p.y,{delay:35});await tick();assert.equal((await state()).workerOrders.selectedWorkerId,id,'Short worker click selects');return p;}
async function clickSign(id){const p=await signPoint(id);await page.mouse.click(p.x,p.y,{delay:35});await tick();return p;}
async function run(name,fn){
  const row={name,startedAt:new Date().toISOString()};report.cases.push(row);
  try {await fresh(name);row.evidence=await fn();row.status='passed';}
  catch(e){row.status='failed';row.error=String(e.stack||e);if(page){await shot(name+'-failure').catch(()=>{});await save(name+'-failure-state',await state().catch(()=>null));}}
  finally{row.finishedAt=new Date().toISOString();console.log(JSON.stringify(row));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}
}
await run('selection-pause-escape-and-sign-release',async()=>{
  const id='villager-0';
  await select(id);await shot('worker-selected');
  await page.keyboard.press('Escape');await tick();assert.equal((await state()).workerOrders.selectedWorkerId,null);
  await select(id);await page.keyboard.press('Space');const paused=await tick(30);assert.equal(paused.paused,true);assert.equal(paused.workerOrders.selectedWorkerId,null);
  const p=await signPoint('quarry');await page.mouse.click(p.x,p.y,{delay:35});await tick();assert.equal((await state()).events.filter(e=>e.type==='click-work-order').length,0,'Paused sign does not order');
  await page.keyboard.press('Space');await tick();await select(id);
  const s=await signPoint('quarry');await page.mouse.move(s.x,s.y);await page.mouse.down();await page.mouse.move(s.x+25,s.y+25,{steps:3});await page.mouse.up();await tick();assert.equal((await state()).events.filter(e=>e.type==='click-work-order').length,0,'Sign drag cancels click');
  await page.keyboard.down('Shift');const w=await bodyPoint('villager-1');await page.mouse.click(w.x,w.y,{delay:35});await page.keyboard.up('Shift');await tick();assert.equal((await state()).workerOrders.selectedWorkerId,id,'Shift-click does not select another worker');
  await page.keyboard.press('KeyC');await tick();assert.equal((await state()).controlsOpen,true);await shot('controls-help');
  await page.keyboard.press('Escape');await tick();assert.equal((await state()).controlsOpen,false);
  return {pausedTime:paused.time,final:await state()};
});
await run('garden-order-physical-work',async()=>{
  const id='villager-0';await select(id);
  const before=await state(),start=before.jobs.villagers.find(w=>w.id===id).position;
  await clickSign('mainland-forage');await clickSign('island-garden');const ordered=await state();assert.equal(ordered.jobs.villagers.find(w=>w.id===id).preferredSourceId,'mainland-forage','Closed island gate preserves valid source order');
  assert(ordered.events.some(e=>e.type==='click-work-order'&&e.villagerId===id&&e.sourceId==='mainland-forage'),'Garden sign accepted selected worker order');
  await page.mouse.move(...Object.values(await signPoint('mainland-forage')));await tick();await shot('garden-order');
  const samples=[];let produced=false,delivered=false,queued=false,maxDistance=0;
  for(let i=0;i<45;i++){
    const s=await tick(60),w=s.jobs.villagers.find(w=>w.id===id);maxDistance=Math.max(maxDistance,Math.hypot(w.position.x-start.x,w.position.z-start.z));
    samples.push({time:s.time,worker:w,physical:s.villagers.find(w=>w.id===id),events:s.events});
    if(s.events.some(e=>e.type==='resource-produced'&&e.villagerId===id&&e.sourceId==='mainland-forage'))produced=true;
    if(produced&&!queued&&w.phase==='to-site'){await select(id);await clickSign('quarry');const next=(await state()).jobs.villagers.find(w=>w.id===id);assert.equal(next.pendingRole,'stone','Carrying worker queues the new role');queued=true;await shot('carrying-worker-queued-order');}
    if(s.events.some(e=>e.type==='food-delivered'&&e.villagerId===id)){delivered=true;break;}
    if(s.jobs.outcome.status!=='playing')break;
  }
  await save('garden-physical-samples',samples);await shot('garden-work');
  assert(maxDistance>1,'Ordered worker physically walked');assert(produced,'Ordered worker physically harvested food');assert(delivered,'Ordered worker physically delivered food');assert(queued,'Carrying worker received a deferred order');
  return {worker:id,maxDistance,produced,delivered,queued,final:await state()};
});
await run('quarry-order-physical-work',async()=>{
  const id='villager-0';await select(id);
  const before=await state(),start=before.jobs.villagers.find(w=>w.id===id).position;
  await clickSign('quarry');const ordered=await state();assert(ordered.events.some(e=>e.type==='click-work-order'&&e.villagerId===id&&e.sourceId==='quarry'),'Quarry sign accepted selected worker order');
  await shot('quarry-order');const samples=[];let produced=false,maxDistance=0;
  for(let i=0;i<45;i++){
    const s=await tick(60),w=s.jobs.villagers.find(w=>w.id===id);maxDistance=Math.max(maxDistance,Math.hypot(w.position.x-start.x,w.position.z-start.z));
    samples.push({time:s.time,worker:w,physical:s.villagers.find(w=>w.id===id),events:s.events});
    if(s.events.some(e=>e.type==='resource-produced'&&e.villagerId===id&&e.sourceId==='quarry')){produced=true;break;}
    if(s.jobs.outcome.status!=='playing')break;
  }
  await save('quarry-physical-samples',samples);await shot('quarry-work');assert(maxDistance>1,'Ordered worker physically walked');assert(produced,'Ordered worker physically mined stone');
  return {worker:id,maxDistance,produced,final:await state()};
});
await run('drag-grab-and-cancel',async()=>{
  await select('villager-0');const p=await bodyPoint('villager-0');
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+20,p.y-30,{steps:5});await tick(10);
  assert.equal(await page.evaluate(()=>!!SETTLEMENTQA.context.sim.grab),true,'Drag still grabs a physical worker');assert.equal((await state()).workerOrders.selectedWorkerId,null,'Grab clears selection');await shot('dragging-worker');
  await page.keyboard.press('Escape');await tick();assert.equal(await page.evaluate(()=>!!SETTLEMENTQA.context.sim.grab),false,'Escape releases grab');await page.mouse.up();
  return {final:await state()};
});
report.finishedAt=new Date().toISOString();
report.success=report.cases.every(c=>c.status==='passed')&&!report.pageErrors.length&&!report.requestFailures.length&&!report.console.some(m=>m.type==='error');
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
await browser.close();await new Promise(r=>server.close(r));
if(!report.success)process.exitCode=1;
