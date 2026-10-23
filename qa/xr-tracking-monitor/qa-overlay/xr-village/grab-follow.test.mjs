import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

// Standalone native physics fixture. Each variant bundles the actual production
// module and anatomy; only the baseline physics module comes from Git. No DOM,
// GL, synthetic body following, variable physics timestep or device claims.
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(import.meta.dirname,'generated');
const require=createRequire(import.meta.url),esbuild=require(path.join(root,'node_modules/esbuild'));
const baselineSHA='15d852ba9996bfb927c0f1ffc85c94a6b6b76b36';
const baseline=execFileSync('git',['show',`${baselineSHA}:src/physics.js`],{cwd:root,encoding:'utf8'});
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
fs.mkdirSync(out,{recursive:true});
const modules=[];
for(const variant of ['baseline','candidate']){
 const filename=path.join(out,`grab-follow-${variant}.mjs`);
 await esbuild.build({stdin:{contents:"export * from './physics.js'; export * as T from 'three'; export {createCharacterGeometry} from './character-mesh.js';",resolveDir:path.join(root,'src')},bundle:true,platform:'node',format:'esm',outfile:filename,
  plugins:variant==='baseline'?[{name:'reviewed-baseline',setup(builder){builder.onLoad({filter:/[\\/]physics\.js$/},()=>({contents:baseline,loader:'js'}));}}]:[]});
 const api=await import(pathToFileURL(filename));
 modules.push({...api,variant,rig:api.createCharacterGeometry(api.T,{gridStep:.05})});
}
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'node_modules/@dimforge/rapier3d-compat/package.json'))).version,'0.21.0');
const report={pass:false,scope:'Deterministic production BattlePhysics and anatomical joints in native Rapier0.21 at120Hz. XR target coordinates are synthetic; no browser, Quest timing or comfort claims.',baselineSHA,baselinePhysicsSHA256:hash(baseline),candidatePhysicsSHA256:hash(fs.readFileSync(path.join(root,'src/physics.js'))),trajectories:[],collisions:[],checks:[]};

async function fixture(api,{kind='character',scale=.03,obstacle=null,input='left'}={}){
 const {T,RAPIER:R,BattlePhysics,initializePhysics,rig}=api,world=await initializePhysics();
 world.createCollider(R.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
 if(obstacle==='wall')world.createCollider(R.ColliderDesc.cuboid(.2,10,10).setTranslation(3,5,0));
 const sim=new BattlePhysics(world,rig);sim.combat=false;
 const character=kind==='character'?sim.spawn(0,0,0,0):null;
 const body=character?character.parts.find(part=>part.bone.name==='head').body:sim.addRock(0,0).body;
 const at=new T.Vector3().copy(body.translation());
 if(input==='left')assert(sim.xrGrabBody(input,body,at,at,scale));
 else sim.grabBody(body,at,at,{inputSource:input});
 const g=()=>input==='left'?sim.xrGrabs.get(input):sim.grab;
 const move=(target,dt=1/60,options)=>input==='left'?sim.xrMoveGrab(input,target,dt,options):sim.moveGrab(target,dt,options);
 const step=()=>sim.step(1/120);
 const dispose=()=>{sim.xrReleaseAll();sim.releaseGrab(false);sim.queue.free();world.free();};
 return{T,R,world,sim,character,body,at,g,move,step,dispose,scale};
}
function jointError(f){
 let largest=0;const {T,character}=f;if(!character)return 0;
 for(const {definition:j}of character.joints){
  const a=new T.Vector3(...j.localA).applyQuaternion(new T.Quaternion().copy(character.parts[j.parent].body.rotation())).add(new T.Vector3().copy(character.parts[j.parent].body.translation()));
  const b=new T.Vector3(...j.localB).applyQuaternion(new T.Quaternion().copy(character.parts[j.child].body.rotation())).add(new T.Vector3().copy(character.parts[j.child].body.translation()));
  largest=Math.max(largest,a.distanceTo(b));
 }
 return largest*f.scale;
}
function inspect(f){
 const bodies=f.character?f.character.parts.map(part=>part.body):[f.body];let maxSpeed=0,minY=Infinity,maxX=-Infinity;
 for(const body of bodies){const p=body.translation(),v=body.linvel(),q=body.rotation();assert([p.x,p.y,p.z,v.x,v.y,v.z,q.x,q.y,q.z,q.w].every(Number.isFinite),'All native body state stays finite');minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxSpeed=Math.max(maxSpeed,new f.T.Vector3().copy(v).length()*f.scale);}
 return{minY,maxX,maxSpeed,jointError:jointError(f)};
}
function settle(f){const origin=f.at.clone().add(new f.T.Vector3(0,3,0));for(let i=0;i<180;i++){f.move(origin,1/60);f.step();f.step();}return origin;}

for(const scale of [.024,.03,.036])for(const speed of [.1,.3,.6]){
 const pair=[];
 for(const api of modules){
  const f=await fixture(api,{scale}),origin=settle(f);let sum=0,max=0,maxAnchorSpeed=0,maxBodySpeed=0,maxJoint=0;
  for(let i=1;i<=90;i++){
   const target=origin.clone().add(new f.T.Vector3(speed/scale*i/60,0,0));f.move(target,1/60);
   for(let j=0;j<2;j++){const before=new f.T.Vector3().copy(f.g().anchor.translation());f.step();maxAnchorSpeed=Math.max(maxAnchorSpeed,before.distanceTo(new f.T.Vector3().copy(f.g().anchor.translation()))*scale*120);}
   const error=target.distanceTo(new f.T.Vector3().copy(f.body.translation()))*scale,physical=inspect(f);sum+=error;max=Math.max(max,error);maxBodySpeed=Math.max(maxBodySpeed,physical.maxSpeed);maxJoint=Math.max(maxJoint,physical.jointError);
  }
  assert.equal(f.character.hp,100,'Free-space held movement causes no impact damage');
  pair.push({variant:api.variant,scale,handMetresPerSecond:speed,meanErrorMetres:sum/90,maxErrorMetres:max,maxAnchorMetresPerSecond:maxAnchorSpeed,maxBodyMetresPerSecond:maxBodySpeed,maxJointErrorMetres:maxJoint});f.dispose();
 }
 const [before,after]=pair;assert(after.meanErrorMetres<before.meanErrorMetres*.5,'Meaningful follow improvement at each tested scale/speed');assert(after.maxErrorMetres<.02,'Free-space target error remains below20mm');assert(after.maxAnchorMetresPerSecond<=1.201);assert(after.maxBodyMetresPerSecond<2);assert(after.maxJointErrorMetres<.003);
 report.trajectories.push(...pair);
}
report.checks.push('Matched head-hold trajectories at three tabletop scales and .1/.3/.6m/s');

for(const obstacle of ['wall','floor'])for(const api of modules){
 const f=await fixture(api,{obstacle}),origin=settle(f);let minY=Infinity,maxX=-Infinity,maxSpeed=0,maxJoint=0;
 for(let i=1;i<=180;i++){
  const target=origin.clone().add(obstacle==='wall'?new f.T.Vector3(Math.min(i/60,1)*5,0,0):new f.T.Vector3(0,-Math.min(i/60,1)*(origin.y+2),0));f.move(target,1/60);f.step();f.step();const p=inspect(f);minY=Math.min(minY,p.minY);maxX=Math.max(maxX,p.maxX);maxSpeed=Math.max(maxSpeed,p.maxSpeed);maxJoint=Math.max(maxJoint,p.jointError);
 }
 assert(minY>=-.01,'Dynamic bodies do not pass through the floor');if(obstacle==='wall')assert(maxX<2.8,'Dynamic bodies stay on the near side of the fixed wall');assert(maxJoint<.003,'Anatomical joint separation stays below3mm');assert(maxSpeed<1,'Obstacle stress does not explode body velocities');
 report.collisions.push({variant:api.variant,obstacle,minNativeY:minY,maxNativeX:maxX,maxBodyMetresPerSecond:maxSpeed,maxJointErrorMetres:maxJoint,hp:f.character.hp});f.dispose();
}
report.checks.push('Floor/wall collision and anatomical-joint stability under obstructed targets');

// Preserve desktop and touch response byte-for-byte, including the spring and
// target speed. These use the same source class as XR, so compare actual state.
for(const input of ['desktop','touch']){
 const snapshots=[];
 for(const api of modules){
  const f=await fixture(api,{input}),origin=settle(f);
  for(let i=1;i<=90;i++){f.move(origin.clone().add(new f.T.Vector3(i/20,Math.sin(i/20)*.2,0)),1/60);f.step();f.step();}
  snapshots.push(Buffer.from(f.world.takeSnapshot()));f.dispose();
 }
 assert.deepEqual(snapshots[1],snapshots[0],`${input} physical serialization must match baseline exactly`);
}
report.checks.push('Desktop and touch native snapshots remain byte-identical');

const candidate=modules[1];
for(const count of [1,2,8]){
 const f=await fixture(candidate,{kind:'rock'}),origin=settle(f);
 for(let i=1;i<=12;i++){f.move(origin.clone().add(new f.T.Vector3(i*.2,0,0)),1/72);f.step();}
 assert(f.g().velocity.length()>0);const anchor=new f.T.Vector3().copy(f.g().anchor.translation()),joint=f.g().joint;
 for(let i=0;i<count;i++){f.sim.xrSuspendGrab('left');f.step();assert.equal(f.g().joint,joint);assert(f.g().target.distanceTo(anchor)<1e-6);assert.equal(f.g().velocity.length(),0);assert.equal(f.g().lastMoveTime,-99);}
 const reacquired=origin.clone().add(new f.T.Vector3(6,1,0));f.move(reacquired,1/72,{sampleThrow:false});f.step();
 assert.equal(f.g().velocity.length(),0,'Reacquisition displacement is not sampled as throw speed');
 f.sim.xrReleaseGrab('left',true);assert(!f.sim.events.some(e=>e.type==='flick'),'An intentional release immediately after a no-sample rebase adds no flick');f.dispose();
}
report.checks.push('1/2/8 missed samples preserve joint and freeze anchor; reacquisition cannot fabricate flick');

// The smoothing response is elapsed-time based. The .54m/s input-speed bound
// and .24m/s final throw cap are independent of the new1.2m/s follow cap.
const responses=[];
for(const intervals of [[1/60],[1/72],[1/90],[1/120],[1/144,1/48,1/90,1/72]]){
 const f=await fixture(candidate,{kind:'rock'}),origin=settle(f);f.move(origin,1/60,{sampleThrow:false});let elapsed=0,ticks=0,i=0;
 while(elapsed<.5-1e-12){const dt=Math.min(intervals[i++%intervals.length],.5-elapsed);elapsed+=dt;f.move(origin.clone().add(new f.T.Vector3(.15/.03*elapsed,0,0)),dt);while((ticks+1)/120<=elapsed+1e-9){f.step();ticks++;}}
 responses.push(f.g().velocity.x*.03);assert(Math.abs(responses.at(-1)-.15*(1-Math.exp(-.5/.05)))<1e-6);
 for(let j=1;j<=12;j++){f.move(origin.clone().add(new f.T.Vector3(j*10,0,0)),1/60);f.step();}assert(f.g().velocity.length()*.03<=.240000001);
 const speed=f.g().velocity.length();f.sim.xrReleaseGrab('left',true);assert(f.sim.events.some(e=>e.type==='flick'&&Math.abs(e.speed-speed)<1e-9));f.dispose();
}
assert(Math.max(...responses)-Math.min(...responses)<1e-6);report.checks.push('Elapsed-time throw smoothing across60/72/90/120Hz and irregular intervals; .24m/s cap retained');

for(const api of modules)api.rig.geometry.dispose();report.pass=true;
fs.writeFileSync(path.join(out,'grab-follow.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,suite:'grab-follow',checks:report.checks,trajectories:report.trajectories.length,collisions:report.collisions.length,scope:report.scope}));
