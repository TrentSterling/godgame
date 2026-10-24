import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const read=name=>JSON.parse(fs.readFileSync(new URL('./generated/'+name+'.json',import.meta.url)));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const comparisons=[];
for(const variant of ['matched-nohands','matched-hands']){
 const b=read('budget-profile-baseline-'+variant),c=read('budget-profile-candidate-'+variant);
 assert.equal(c.finalPhysics,b.finalPhysics,variant+' complete native physics snapshot');
 const rows=c.rows.map((after,i)=>{
  const before=b.rows[i];assert.equal(after.name,before.name);assert.equal(after.frames,before.frames);assert.equal(after.physicsSteps,before.physicsSteps);
  assert.deepEqual(Object.fromEntries(Object.entries(after.calls).map(([k,v])=>[k,v.calls])),Object.fromEntries(Object.entries(before.calls).map(([k,v])=>[k,v.calls])));
  return{name:after.name,frames:after.frames,physicsSteps:after.physicsSteps,elapsedMs:{baseline:before.elapsedMs,candidate:after.elapsedMs},navigationInclusiveMs:{baseline:before.calls['navigation.update'].inclusiveMs,candidate:after.calls['navigation.update'].inclusiveMs},estimatedTransientAllocationBytes:{baseline:before.allocation.estimatedBytes,candidate:after.allocation.estimatedBytes}};
 });
 comparisons.push({variant,finalPhysicsSHA256:hash(Buffer.from(c.finalPhysics,'base64')),rows});
}
const identity=read('candidate-identity'),proof=read('terrain-budget'),simulation=read('budget-simulation');
assert(proof.pass&&simulation.pass);
const report={baseline:identity.baselineSource,sourceHashes:identity.sourceHashes,scope:'CPU-only deterministic production animation callbacks with native Rapier and mock DOM/WebXR; no rendering. Host CPU includes profiler overhead. Allocation samples estimate transient allocation volume, not live heap. Wrapped times overlap. No Quest FPS or GPU claims.',comparisons,proof,simulationPhases:simulation.rows.map(({name,physicsSHA256})=>({name,physicsSHA256}))};
fs.writeFileSync(new URL('./budget-cpu-evidence.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,comparisons:comparisons.map(({variant,rows})=>({variant,rows}))}));
