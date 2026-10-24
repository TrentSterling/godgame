import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const env={...process.env,BASELINE_SOURCE:'8f60f766c748f81cf665866ebdeed717104c3cba',BASELINE_DEPLOYMENT:'30719b515eb4ea9ffd9287c2afeda1ab15494b3a'};
for(const args of [['qa/performance/build.cjs'],['qa/performance/scenario.mjs','baseline'],['qa/performance/scenario.mjs','candidate']]){
 const run=spawnSync(process.execPath,args,{env,encoding:'utf8',maxBuffer:16*1024*1024});process.stdout.write(run.stdout);process.stderr.write(run.stderr);assert.equal(run.status,0,args.join(' '));
}
const read=name=>JSON.parse(fs.readFileSync(new URL(`./generated/${name}.json`,import.meta.url)));
const b=read('baseline'),c=read('candidate'),identities={baseline:read('baseline-identity'),candidate:read('candidate-identity')};
const changedModules=Object.keys(identities.candidate.sourceHashes).filter(n=>identities.candidate.sourceHashes[n]!==identities.baseline.sourceHashes[n]);
assert.deepEqual(changedModules,['physics.js','settlement-main.js','settlement-xr.js','xr-hand-grip.js']);assert.equal(c.rows.length,13);
function gameplay(state){
 const copy=structuredClone(state);delete copy.xr.input.viewer;
 for(const hand of Object.values(copy.xr.input.hands)){for(const key of ['grip'])delete hand[key];}
 return copy;
}
const rows=c.rows.map((row,i)=>{const before=b.rows[i];assert.equal(row.name,before.name);assert.deepEqual(gameplay(row.state),gameplay(before.state),row.name+' public gameplay state');assert.equal(row.physicsSHA256,before.physicsSHA256,row.name+' native snapshot');assert.deepEqual(row.counts,before.counts,row.name+' simulation/presentation cadence');assert.deepEqual(row.hud,before.hud);return{name:row.name,physicsSHA256:row.physicsSHA256,counts:row.counts,physicsSteps:row.physicsSteps};});
const report={pass:true,baseline:env.BASELINE_SOURCE,deployment:env.BASELINE_DEPLOYMENT,changedModules,identities,rows,scope:'Thirteen deterministic production phases with identical gameplay, native physics and callback counts. New diagnostic fields excluded explicitly; no held body in these scenarios (covered by separate native comparison).'};
fs.writeFileSync(new URL('./generated/sticky-simulation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,phases:rows.length,changedModules}));
