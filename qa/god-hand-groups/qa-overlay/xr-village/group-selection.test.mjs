import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const out=new URL('./generated/group-selection-module.mjs',import.meta.url);
await esbuild.build({stdin:{contents:"export {initializePhysics,RAPIER,BattlePhysics} from './physics.js'; export {pickXRTarget,pickXRGroup,XR_GROUP_REACH} from './xr-grab-feedback.js';",resolveDir:new URL('../../src/',import.meta.url).pathname.replace(/^\/(.:)/,'$1')},bundle:true,platform:'node',format:'esm',outfile:out.pathname.replace(/^\/(.:)/,'$1')});
const {initializePhysics,RAPIER:R,BattlePhysics,pickXRTarget,pickXRGroup,XR_GROUP_REACH}=await import(out);
const checks=[];
for(const scale of [.024,.03,.036]){
 const world=await initializePhysics(),sim=new BattlePhysics(world,{});world.gravity={x:0,y:0,z:0};
 function char(id,x,z){const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x,0,z)),collider=world.createCollider(R.ColliderDesc.ball(.2),body),character={id,parts:[{body,collider}]};sim.characters.push(character);sim.colliderOwners.set(collider.handle,{type:'character',character,index:0});return{body,collider,character};}
 const unit=.03/scale,a=char(10,.1*unit,0),b=char(1,.9*unit,0),d=char(2,-.9*unit,0),e=char(3,0,.9*unit),far=char(4,XR_GROUP_REACH/scale+.21,0);
 // Same actor with another collider must still appear once in the group.
 const extra=world.createCollider(R.ColliderDesc.ball(.15).setTranslation(0,0,.05),b.body);sim.colliderOwners.set(extra.handle,{type:'character',character:b.character,index:0});
 world.step();const point={x:0,y:0,z:0},primary=pickXRTarget(sim,'left',point,.028,scale);assert.equal(primary.body,a.body);
 const ids=()=>pickXRGroup(sim,'left',point,primary,scale).map(x=>sim.colliderOwners.get(x.handle).character.id);
 const selected=ids();assert.equal(selected.length,3);assert.equal(new Set(selected).size,3);assert(!selected.includes(far.character.id));for(let i=0;i<40;i++)assert.deepEqual(ids(),selected);
 sim.xrGrabs.set('right',{body:b.body});assert(!ids().includes(b.character.id));sim.xrGrabs.delete('right');
 const wall=world.createCollider(R.ColliderDesc.cuboid(.04,1,.25).setTranslation(.48*unit,0,0));world.step();assert(!ids().includes(b.character.id));world.removeCollider(wall,true);world.step();assert.deepEqual(ids(),selected);
 const load=sim.addRock(5,0,.2),loadPoint=load.body.translation();world.step();const picked=pickXRTarget(sim,'left',loadPoint,.028,scale);assert.equal(picked.body,load.body);assert.deepEqual(pickXRGroup(sim,'left',loadPoint,picked,scale),[picked]);
 checks.push({scale,selected,repeatChecks:40,limit:3,occlusion:true,dualOwnershipExcluded:true,singleResource:true});sim.queue.free();world.free();
}
const report={pass:true,scope:'Native Rapier deterministic collider fixtures and unchanged production picker functions; no device measurements.',checks};fs.writeFileSync(new URL('./generated/group-selection.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
