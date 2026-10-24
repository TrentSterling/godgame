import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const env={...process.env,BASELINE_SOURCE:'be71df7671bf82038f326b64e70b06f98ac30711',BASELINE_DEPLOYMENT:'195e4972c7615b3c81043e75118e8ab9c91d2e6f'};
for(const args of [['qa/performance/build.cjs'],['qa/performance/scenario.mjs','baseline'],['qa/performance/scenario.mjs','candidate']]){
 const run=spawnSync(process.execPath,args,{env,encoding:'utf8',maxBuffer:16*1024*1024});process.stdout.write(run.stdout);process.stderr.write(run.stderr);assert.equal(run.status,0,args.join(' '));
}
const read=name=>JSON.parse(fs.readFileSync(new URL('./generated/'+name+'.json',import.meta.url))),b=read('baseline'),c=read('candidate'),identities={baseline:read('baseline-identity'),candidate:read('candidate-identity')};
const changedModules=Object.keys(identities.candidate.sourceHashes).filter(n=>identities.candidate.sourceHashes[n]!==identities.baseline.sourceHashes[n]);
assert.deepEqual(changedModules,['settlement-main.js','settlement-world-cues.js','xr-render-budget.js']);assert.equal(c.rows.length,13);
assert(!identities.candidate.adapters.includes('Proposed XR render-budget integration applied in-memory only'));
const rows=c.rows.map((r,i)=>{const before=b.rows[i];assert.equal(r.name,before.name);assert.deepEqual(r.state,before.state,r.name+' complete public state');assert.equal(r.physicsSHA256,before.physicsSHA256,r.name+' native snapshot');assert.deepEqual(r.counts,before.counts,r.name+' cadence');assert.deepEqual(r.hud,before.hud);return{name:r.name,physicsSHA256:r.physicsSHA256,counts:r.counts,physicsSteps:r.physicsSteps};});
const report={pass:true,baseline:env.BASELINE_SOURCE,changedModules,identities,rows,scope:'Thirteen identical deterministic production phases with the real integrated XR render-budget entry point. Full public state, native Rapier snapshot and operation counts; no GPU or Quest timings. No application integration adapter.'};fs.writeFileSync(new URL('./generated/budget-render-simulation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,phases:rows.length,changedModules}));
