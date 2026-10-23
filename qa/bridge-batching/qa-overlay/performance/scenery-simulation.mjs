import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const env={...process.env,BASELINE_SOURCE:'c845caddaa7a7c1d9da9124503b110fe2383af75',BASELINE_DEPLOYMENT:'d66a31a8dd79852256974bb5f5a81d9bb4a087be'};
for(const args of [['qa/performance/build.cjs'],['qa/performance/scenario.mjs','baseline'],['qa/performance/scenario.mjs','candidate']]){
 const run=spawnSync(process.execPath,args,{env,encoding:'utf8',maxBuffer:16*1024*1024});process.stdout.write(run.stdout);process.stderr.write(run.stderr);assert.equal(run.status,0,args.join(' '));
}
const read=name=>JSON.parse(fs.readFileSync(new URL(`./generated/${name}.json`,import.meta.url)));
const b=read('baseline'),c=read('candidate'),identities={baseline:read('baseline-identity'),candidate:read('candidate-identity')};
const changedModules=Object.keys(identities.candidate.sourceHashes).filter(n=>identities.candidate.sourceHashes[n]!==identities.baseline.sourceHashes[n]);assert.deepEqual(changedModules,['settlement-world.js']);assert.equal(c.rows.length,13);assert.equal(b.rows.length,c.rows.length);
const rows=c.rows.map((row,i)=>{const before=b.rows[i];assert.equal(row.name,before.name);assert.deepEqual(row.state,before.state,row.name+' complete public state');assert.equal(row.physicsSHA256,before.physicsSHA256,row.name+' native Rapier snapshot');assert.deepEqual(row.counts,before.counts,row.name+' unchanged simulation and presentation cadence');assert.deepEqual(row.hud,before.hud);return{name:row.name,stateSHA256:row.stateSHA256,physicsSHA256:row.physicsSHA256,physicsSteps:row.physicsSteps,counts:row.counts};});
const report={pass:true,baseline:env.BASELINE_SOURCE,deployment:env.BASELINE_DEPLOYMENT,changedModules,identities,rows,scope:'Thirteen deterministic production simulation/XR lifecycle phases; complete public state, native physics and callback counts identical. No headset timing claim.'};
fs.writeFileSync(new URL('./generated/scenery-simulation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,phases:rows.length,changedModules}));
