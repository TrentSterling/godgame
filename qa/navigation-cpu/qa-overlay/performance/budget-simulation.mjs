import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const env={...process.env,BASELINE_SOURCE:'8e51eabecb36fd852b684461d45e9d43ba9d1f54',BASELINE_DEPLOYMENT:'2cb3d9af0f96ec3e4661983de0e2026ac51fd140'};
for(const args of [['qa/performance/build.cjs'],['qa/performance/scenario.mjs','baseline'],['qa/performance/scenario.mjs','candidate']]){
 const run=spawnSync(process.execPath,args,{env,encoding:'utf8',maxBuffer:16*1024*1024});process.stdout.write(run.stdout);process.stderr.write(run.stderr);assert.equal(run.status,0,args.join(' '));
}
const read=name=>JSON.parse(fs.readFileSync(new URL('./generated/'+name+'.json',import.meta.url))),b=read('baseline'),c=read('candidate'),identities={baseline:read('baseline-identity'),candidate:read('candidate-identity')};
const changedModules=Object.keys(identities.candidate.sourceHashes).filter(n=>identities.candidate.sourceHashes[n]!==identities.baseline.sourceHashes[n]);
assert.deepEqual(changedModules,['civilian-ground-point.js','civilian-navigation.js','settlement-land-regions.js','terrain.js']);assert.equal(c.rows.length,13);
const rows=c.rows.map((r,i)=>{const before=b.rows[i];assert.equal(r.name,before.name);assert.deepEqual(r.state,before.state,r.name+' complete public state');assert.equal(r.physicsSHA256,before.physicsSHA256,r.name+' native snapshot');assert.deepEqual(r.counts,before.counts,r.name+' cadence');assert.deepEqual(r.hud,before.hud);return{name:r.name,physicsSHA256:r.physicsSHA256,counts:r.counts,physicsSteps:r.physicsSteps};});
const report={pass:true,baseline:env.BASELINE_SOURCE,changedModules,identities,rows,scope:'Thirteen identical deterministic production phases, full public state, native Rapier snapshot and operation counts; no GPU or Quest timings.'};fs.writeFileSync(new URL('./generated/budget-simulation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,phases:rows.length,changedModules}));
