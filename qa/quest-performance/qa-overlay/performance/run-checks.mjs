import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
function run(...args){const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});process.stdout.write(r.stdout);process.stderr.write(r.stderr);assert.equal(r.status,0,args.join(' '));}
run(path.join(dir,'economy-status.test.mjs'));
run(path.join(dir,'build.cjs'));
for(const suffix of [[],['sample']])for(const mode of ['baseline','candidate'])run('--expose-gc',path.join(dir,'scenario.mjs'),mode,...suffix);
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,'generated',name+'.json')));
const b=read('baseline'),c=read('candidate'),bs=read('baseline-sample'),cs=read('candidate-sample');
const rows=c.rows.map((row,i)=>{
 const baseline=b.rows[i];assert.equal(row.name,baseline.name);
 assert.deepEqual(row.state,baseline.state,row.name+' complete public state');
 assert.equal(row.physicsSHA256,baseline.physicsSHA256,row.name+' serialized Rapier world');
 if(row.hud)assert.deepEqual(row.hud,baseline.hud,'Desktop HUD refreshed after XR exit');
 for(const key of ['economyUpdates','commands','beforeSteps','observations','renders','worldCueUpdates'])assert.equal(row.counts[key],baseline.counts[key],row.name+' '+key);
 assert(row.counts.snapshots<baseline.counts.snapshots,row.name+' fewer clones');
 for(const report of [bs,cs]){assert.deepEqual(report.rows[i].state,row.state,'Sampling preserves deterministic state');assert.equal(report.rows[i].physicsSHA256,row.physicsSHA256);}
 return{name:row.name,physicsSteps:row.physicsSteps,simulatedSeconds:row.simulatedSeconds,baseline:baseline.counts,candidate:row.counts,unprofiledDesktopCPUms:{baseline:baseline.elapsedMs,candidate:row.elapsedMs},sampledAllocations:{baseline:bs.rows[i].allocation,candidate:cs.rows[i].allocation},stateSHA256:row.stateSHA256,physicsSHA256:row.physicsSHA256};
});
const identities={baseline:read('baseline-identity'),candidate:read('candidate-identity')};
const changedModules=Object.keys(identities.candidate.sourceHashes).filter(name=>identities.baseline.sourceHashes[name]!==identities.candidate.sourceHashes[name]);
assert.deepEqual(changedModules,['settlement-economy.js','settlement-food-art.js','settlement-main.js','settlement-quarry-geology.js','static-scenery-batch.js']);
const report={pass:true,scope:c.scope,comparison:'Exact complete public-state JSON and Rapier snapshot SHA256 at every phase; CPU timings and sampled allocation estimates are host-only, noisy and not acceptance thresholds.',changedModules,identities,rows};
fs.writeFileSync(path.join(dir,'generated/summary.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,comparedPhases:rows.length,changedModules}));
