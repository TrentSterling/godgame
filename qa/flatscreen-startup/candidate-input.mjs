import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const out='artifacts';fs.mkdirSync(out,{recursive:true});
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(head,process.env.EXPECTED_HEAD);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline='30610830deea8acf73cc812bb9c61b2d15321751bbf9036e1e727052f013c63b';
assert.equal(hash(fs.readFileSync('../../index.html')),baseline,'Live root must stay untouched in test branch');
const candidateHash=process.env.CANDIDATE_SHA256;assert(candidateHash);
const onlyCase=process.env.CASE;assert(onlyCase);
let server;
if(candidateHash){const candidate=fs.readFileSync('candidate.html');assert.equal(hash(candidate),candidateHash);server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html');res.end(candidate);});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
const cases=[{name:'wide-dpr1',width:2048,height:1044,dpr:1},{name:'wide-dpr125',width:2048,height:1044,dpr:1.25},{name:'wide-dpr2',width:2048,height:1044,dpr:2},{name:'screenshot-80pct',width:2560,height:1305,dpr:.8}];
// These points are chosen by inspecting the initial screenshot from run 38458267961.
// They are fixed screen-space observations, never computed from game targets or projection.
const observed={worker:[742,564],garden:[604,609],start:[1810,32]};
const report={head,startedAt:new Date().toISOString(),method:'Ordinary page navigation, real-time mouse/keyboard, manually visually selected screen points, read-only QA state observation. No capture mode, test start/step/project, fake clock, state injection, or target-coordinate automation.',observed,cases:[],success:false};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const small=s=>({time:s.time,started:s.started,paused:s.paused,workerOrders:s.workerOrders,desktopCamera:s.desktopCamera,jobs:s.jobs,events:s.events,grabIntent:s.grabIntent,selectionCue:s.selectionCue,controlsOpen:s.controlsOpen,detailsOpen:s.detailsOpen});
try {
for(const mode of ['candidate'])for(const c of cases.filter(c=>c.name===onlyCase)){
 const row={mode,...c,errors:[],states:{},inputs:[]};report.cases.push(row);
 const context=await browser.newContext({viewport:{width:c.width,height:c.height},deviceScaleFactor:c.dpr,recordVideo:{dir:out+'/video',size:{width:2048,height:1044}}});
 const page=await context.newPage();page.on('pageerror',e=>row.errors.push(String(e)));
 const state=()=>page.evaluate(()=>SETTLEMENTQA.state());
 const inventory=s=>JSON.stringify({stones:s.jobs.stones,pantry:s.jobs.pantry,quarry:s.jobs.quarry,forage:s.jobs.forageSources,sites:s.jobs.sites,totals:s.jobs.totals});
 const snap=async label=>{const s=await state();row.states[label]=small(s);await page.screenshot({path:`${out}/${mode}-${c.name}-${label}.png`,scale:'css'});if(c.name==='wide-dpr1'&&['initial','prestart-worker','prestart-order','started-worker','started-order'].includes(label)){const jpeg=await page.screenshot({type:'jpeg',quality:45,scale:'css'});console.log('SCREENSHOT_'+mode+'_'+label+'_BASE64='+jpeg.toString('base64'));}return s;};
 const click=async(point,label)=>{row.inputs.push({action:'click',point,label,at:new Date().toISOString()});await page.mouse.click(...point,{delay:60});};
 const scale=c.width/2048, worker=observed.worker.map(v=>v*scale),garden=observed.garden.map(v=>v*scale);
 // Top-right HUD uses fixed CSS pixels; the actual rendered Start button is observed separately.
 const start=[c.width/2-157,c.height-39]; // center of the visible START VILLAGE button in fixed CSS-pixel HUD
 try{
  const url=mode==='baseline'?'https://tront.xyz/godgame/':`http://127.0.0.1:${server.address().port}/`;
  const response=await page.goto(url,{waitUntil:'load'});assert(response.ok());assert.equal(hash(await response.body()),mode==='baseline'?baseline:candidateHash);
  await page.waitForFunction(()=>window.SETTLEMENTQA||window.SETTLEMENTERROR,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.SETTLEMENTERROR??null),null);await page.waitForTimeout(300);
  const initial=await snap('initial');assert.equal(initial.started,false);assert.equal(initial.time,0);assert.equal(initial.workerOrders.selectedWorkerId,null);
  await click(worker,'visible mainland worker before Start');const before=await snap('prestart-worker');assert.equal(before.started,false);assert.equal(before.time,initial.time);
  if(mode==='baseline'){assert.equal(before.workerOrders.selectedWorkerId,null,'Released build reproduces silent pre-start worker click');}
  else {assert(before.workerOrders.selectedWorkerId,'Candidate first click selects visible worker while time stays stopped');await click(garden,'visible mainland garden sign before Start');const order=await snap('prestart-order');assert.equal(order.started,false);assert.equal(order.time,0);assert.equal(order.events.filter(e=>e.type==='click-work-order'&&e.planning===true).length,1,'Candidate prepares exactly one order through ordinary sign click');assert.equal(inventory(order),inventory(initial),'Planning preserves resources');assert.deepEqual(order.villagers.map(v=>v.position),initial.villagers.map(v=>v.position),'Planning leaves physical workers fixed');}
  // Reproduce right-button camera responsiveness while still not started.
  await page.mouse.move(1700*scale,850*scale);await page.mouse.down({button:'right'});await page.mouse.move(1750*scale,875*scale,{steps:8});await page.mouse.up({button:'right'});
  const orbit=await state();assert.notEqual(orbit.desktopCamera.yaw,initial.desktopCamera.yaw);assert.equal(orbit.started,false);assert.equal(orbit.time,0);
  await page.keyboard.press('Home');assert.deepEqual((await state()).desktopCamera,initial.desktopCamera);
  // Actual visible Start button, then immediately the same observed worker before it walks away.
  await click(start,'visible bottom START VILLAGE');await click(start,'repeat prior Start location cannot reset');assert((await state()).started);assert(!(await state()).paused);await page.waitForFunction(()=>SETTLEMENTQA.state().villagers.find(v=>v.id==='villager-2')?.available,null,{timeout:30000});await click(worker,'same visible mainland worker after Start');const selected=await snap('started-worker');assert.equal(selected.started,true);assert.equal(selected.events.filter(e=>e.type==='click-work-order'&&e.planning===true).length,1);assert(selected.workerOrders.selectedWorkerId,'Normal short click after Start selects same worker');
  await click(garden,'visible mainland garden sign after Start');const assigned=await snap('started-order');assert(assigned.events.some(e=>e.type==='click-work-order'&&!e.planning),'Normal sign click commits running work order');
  await page.keyboard.press('Space');const paused=await state();assert.equal(paused.paused,true);await click(worker,'worker while paused');assert.equal((await state()).workerOrders.selectedWorkerId,null);
  await page.keyboard.press('KeyC');assert.equal((await state()).controlsOpen,true);await page.keyboard.press('Escape');assert.equal((await state()).controlsOpen,false);
  await page.keyboard.press('KeyD');assert.equal((await state()).detailsOpen,true);await page.keyboard.press('Escape');assert.equal((await state()).detailsOpen,false);
  await page.keyboard.press('Space');assert.equal((await state()).paused,false);await page.waitForTimeout(1200);const final=await snap('final');assert(final.time>paused.time,'Real animation loop resumes');assert.equal(row.errors.length,0);row.success=true;
 }catch(e){row.error=String(e.stack||e);row.success=false;const jpeg=await page.screenshot({type:'jpeg',quality:45,scale:'css'}).catch(()=>null);if(jpeg)console.log('FAILURE_'+mode+'_'+c.name+'_BASE64='+jpeg.toString('base64'));await page.screenshot({path:`${out}/${mode}-${c.name}-failure.png`,scale:'css'}).catch(()=>{});}
 finally{await context.close();console.log('CASE_REPORT='+JSON.stringify(row));fs.writeFileSync(out+'/ordinary-report.json',JSON.stringify(report,null,2));}
}
report.success=report.cases.every(c=>c.success);if(!report.success)process.exitCode=1;
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));report.finishedAt=new Date().toISOString();fs.writeFileSync(out+'/ordinary-report.json',JSON.stringify(report,null,2));console.log('FINAL_REPORT='+JSON.stringify({head,success:report.success,cases:report.cases.map(c=>({name:c.name,mode:c.mode,success:c.success,error:c.error}))}));}
