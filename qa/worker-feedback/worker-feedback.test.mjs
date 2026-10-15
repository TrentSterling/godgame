import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import fs from 'node:fs';
const outfile='qa/worker-feedback.generated.mjs';
buildSync({stdin:{contents:"export * from './src/settlement-worker-feedback.js'; export * from './src/settlement-minimal-hud.js';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile});
const {settlementWorkerFeedback:feedback,workerFeedbackLines,settlementMinimalHUDLayout:layout}=await import('./worker-feedback.generated.mjs');
const base={id:'villager-1',alive:true,role:'food',phase:'working',sourceId:'mainland-forage',workKind:'gather'};
assert.equal(feedback(base),'Gathering food at Garden.');
const delivering={...base,phase:'to-site',sourceId:null,resourceKind:'food',targetSiteId:'pantry',stoneId:'food-1',pendingRole:'stone',pendingSourceId:'quarry'};
assert.equal(feedback(delivering),'Delivering food to Pantry then Quarry.');
const sameRole={...delivering,pendingRole:'food',pendingSourceId:'island-garden'};
assert.equal(feedback(sameRole),'Delivering food to Pantry then Island Garden.');
assert.equal(feedback({...base,phase:'to-source',role:'stone',sourceId:'quarry'}),'Walking to Quarry.');
assert.equal(feedback({...base,role:'stone',blocked:'empty-pantry'}),'Waiting for food before stone work.');
assert.equal(feedback({...base,productionBlocked:'load-capacity'}),'Waiting for room to store another load.');
assert.equal(feedback({...base,phase:'to-stone',workKind:'pickup'}),'Walking to loose stone.');
assert.equal(feedback({...base,phase:'working',workKind:'pickup'}),'Picking up stone.');
assert.equal(feedback({...base,phase:'working',workKind:'withdraw'}),'Collecting stored stone.');
assert.equal(feedback({...base,alive:false}),'');
assert.equal(feedback(null),'');
const cases=[base,delivering,sameRole,{...delivering,resourceKind:'stone',targetSiteId:'garden-upgrade',pendingRole:'food',pendingSourceId:'island-garden'}];
const before=JSON.stringify(cases);
for(const worker of cases){
 const text=feedback(worker),lines=workerFeedbackLines(text);
 assert(lines.length<=2);assert(lines.every(line=>line.length<=42));assert.equal(lines.join(' '),text);
 for(const width of [390,640,1440]){
  const hud=layout({width,height:900,started:true,selectedWorker:worker,jobs:{villagers:[worker]}});
  const context=hud.regions.find(r=>r.id==='context');assert(context);assert.equal(context.h,54);
  assert.equal(hud.items.filter(i=>i.kind==='text').at(-1).text,text.toUpperCase());
  for(const item of hud.items.filter(i=>i.kind==='text'))assert(item.x+item.width<=width);
 }
}
assert.equal(JSON.stringify(cases),before,'Presentation never changes economy rows');
for(const [input,expected] of [[{notice:'ORDER ACCEPTED'},'ORDER ACCEPTED'],[{paused:true},'PAUSED'],[{heldWorker:true},'PLACE AT A GARDEN OR QUARRY TO ASSIGN WORK'],[{hazard:{phase:'warning'}},'QUARRY BOULDER COMING LOOSE']]){
 const hud=layout({width:1440,height:900,started:true,selectedWorker:delivering,...input});
 assert(hud.items.some(i=>i.text===expected));assert(!hud.items.some(i=>i.text?.includes('THEN QUARRY')));
}
const cleared=layout({width:1440,height:900,started:true});assert(!cleared.regions.some(r=>r.id==='context'));
const result={pass:true,scope:'Worker status, queued same-role/source changes, delivery, priority and bounds at 390/640/1440; no state mutation'};
fs.writeFileSync('qa/worker-feedback-result.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
