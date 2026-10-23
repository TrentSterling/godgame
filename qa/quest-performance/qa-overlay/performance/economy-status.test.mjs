import assert from 'node:assert/strict';
import {createSettlementEconomy} from '../../src/settlement-economy.js';
const p={x:0,y:0,z:0};
const economy=createSettlementEconomy({villagers:[{id:'original',position:p,role:'food'},{id:'recruit',position:p,role:'stone',available:false}],recruitId:'recruit',quarry:{position:p,workPoints:[p],reserve:1,workSeconds:.01},pantry:{position:p},foodPerWorker:0,initialFood:0,spareStoneGoal:1,workSeconds:.01,deliverySeconds:.01});
const assertStatus=expected=>{assert.equal(economy.outcomeStatus(),expected);assert.equal(economy.snapshot().outcome.status,expected);};
assertStatus('playing');
const detached=economy.snapshot();detached.outcome.status='forged';detached.villagers[0].alive=false;assertStatus('playing');
economy.update(0,{villagers:[{id:'original',position:p,available:false,alive:false}]});assertStatus('failed');
const terminal=economy.snapshot();economy.reset();assertStatus('playing');assert.equal(terminal.outcome.status,'failed','Reset does not mutate previously returned snapshots');
// Deterministic economy-only host observations: original stays at home; recruit
// mines and carries a real model-created stone, with observed ownership each tick.
for(let i=0;i<100&&economy.outcomeStatus()==='playing';i++){
 const s=economy.snapshot();economy.update(.02,{recruit:{joined:true},villagers:s.villagers.map(w=>({id:w.id,position:w.target??w.position,available:true,alive:true})),stones:s.stones.map(l=>({id:l.id,position:p,available:true,held:false,owner:l.owner}))});
}
assertStatus('won');assert(economy.snapshot().recruit.worked);assert.equal(economy.snapshot().pantry.spareStone,1);
economy.command({type:'invalid'});assertStatus('won');economy.reset();assertStatus('playing');
console.log(JSON.stringify({pass:true,suite:'economy-status',checks:['live-playing-failed-won','reset-refresh','detached-snapshots','real-model-production-delivery','rejected-command-preserves-outcome']}));
