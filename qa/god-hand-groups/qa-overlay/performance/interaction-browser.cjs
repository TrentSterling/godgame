const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH),root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'generated'),owner='codex-godgame-interactions-task-8';
for(const id of ['gpu-game-validation','pc1-browser-gpu-capture']){const r=JSON.parse(fs.readFileSync('C:/trontstack/.agentcoord/claims/'+id+'.json'));assert.equal(r.owner,owner);assert(Date.now()-Date.parse(r.heartbeatUtc)<r.ttlMinutes*60000);}
const files={baseline:process.env.BASELINE_HTML,candidate:path.join(root,'dist/HOLLOW_HANDS_SETTLEMENT_FOOD_MISSION.html')},hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={pass:false,scope:'Actual renderer/canvas on host hardware with synthetic XR and controlled native-character fixture positions. Fixed72Hz sample timestamps are not measured headset cadence. No physical input/focus/pointerlock/audio or Quest performance claim.',hashes:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,hash(fs.readFileSync(v))])),rows:[],captures:[]};assert.equal(report.hashes.baseline,'7fd2d69432ba5be28afbca952a128a990428826fe862b8343c6b2ec4dc65c187');
async function capture(page,variant,label){
 const result=await page.evaluate(()=>{
  const c=SETTLEMENTQA.context,r=c.renderer,draws=[],original=r.renderBufferDirect;
  r.renderBufferDirect=function(camera,scene,geometry,material,object,group){const calls=r.info.render.calls,triangles=r.info.render.triangles;const result=original.call(this,camera,scene,geometry,material,object,group);if(r.info.render.calls>calls)draws.push({name:object.name,parent:object.parent?.name,calls:r.info.render.calls-calls,triangles:r.info.render.triangles-triangles,instances:object.isInstancedMesh?object.count:null,monitor:object===c.performanceMonitor.mesh});return result;};
  try{__interactionDraw();}finally{r.renderBufferDirect=original;}
  const pixels=r.domElement.toDataURL('image/png');return{pixels,render:{...r.info.render},draws,monitor:c.performanceMonitor.snapshot(),xr:c.villageXR.state(),framebuffer:{width:r.domElement.width,height:r.domElement.height},eyes:r.xr.isPresenting?r.xr.getCamera().cameras.length:1,groups:Object.fromEntries(['left','right'].map(side=>[side,c.sim.xrGrabMembers?.(side).length??(c.sim.xrGrabs.has(side)?1:0)]))};
 });
 assert.equal(result.draws.reduce((n,d)=>n+d.calls,0),result.render.calls);
 if(label!=='desktop'){assert.equal(result.xr.input.viewer.viewerMissingFrames,0);assert.equal(result.monitor.mode,'XR');assert(Math.abs(result.monitor.fps-72)<1e-6);}
 const name=variant+'-interaction-'+label+'.png';fs.writeFileSync(path.join(out,name),Buffer.from(result.pixels.split(',')[1],'base64'));delete result.pixels;report.captures.push(name);report.rows.push({variant,label,...result});
}
(async()=>{let browser,watchdog,timedOut=false;try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--headless=new','--use-gl=angle','--use-angle=d3d11','--mute-audio','--disable-audio-output','--no-first-run','--no-default-browser-check']});watchdog=setTimeout(()=>{timedOut=true;browser.close().catch(()=>{});},120000);
 const probe=await browser.newPage();report.backend=await probe.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});await probe.close();assert.match(report.backend,/NVIDIA|AMD|Intel/i);
 for(const variant of ['baseline','candidate']){
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.addInitScript({path:path.join(root,'qa/xr-village/mock-webxr-browser.js')});
  await page.goto(pathToFileURL(files[variant]).href+'?capture');await page.waitForFunction(()=>window.SETTLEMENTQA&&SETTLEMENTQA.state().xr.supported);assert.equal(await page.evaluate(()=>window.SETTLEMENTERROR??null),null);
  await page.evaluate(()=>{window.__interactionDraw=()=>SETTLEMENTQA.step(0);for(let i=0;i<30;i++)__interactionDraw();});await capture(page,variant,'desktop');
  // Match production r160 ordering: install animation loop before sessionstart,
  // so WebXRManager stops window RAF and owns only the supplied XR callbacks.
  await page.evaluate(()=>{const c=SETTLEMENTQA.context;c.renderer.setAnimationLoop((now,frame)=>{if(!frame)return;c.performanceMonitor.beginFrame(now,{xr:true,visible:true});c.villageXR.update(now,frame);SETTLEMENTQA.step(0);});});
  assert(await page.evaluate(()=>SETTLEMENTQA.context.villageXR.startSession()));await page.waitForFunction(()=>!SETTLEMENTQA.state().xr.busy);
  await page.evaluate(()=>{__xrSession.time=1000;window.__interactionDraw=()=>__xrSession.pump();__interactionDraw();__xrSession.addController('left');__xrSession.addController('right');for(const [i,s]of __xrSession.inputSources.entries()){const p={x:i?.18:-.18,y:1.3,z:-.42};s.gripSpace.pose={transform:{position:p,orientation:{x:0,y:0,z:0,w:1}}};s.targetRaySpace.pose={transform:{position:p,orientation:{x:0,y:0,z:0,w:1}}};}for(let i=0;i<20;i++)__interactionDraw();});await capture(page,variant,'controllers-mono');
  await page.evaluate(()=>{__xrMock.stereo=true;for(let i=0;i<20;i++)__interactionDraw();});await capture(page,variant,'controllers-stereo');
  await page.evaluate(()=>{
   const click=id=>{__xrSession.aimAt('Village XR '+id,false);for(let i=0;i<4;i++)__interactionDraw();__xrSession.aimAt('Village XR '+id,true);__interactionDraw();__xrSession.aimAt('Village XR '+id,false);for(let i=0;i<4;i++)__interactionDraw();};click('done');click('grab');
   const c=SETTLEMENTQA.context,T=c.THREE;window.__cluster=points=>{c.villageXR.releaseAll('capture fixture');for(let i=0;i<4;i++){const char=c.villagers[i];c.motion.interrupt(char);const head=char.parts.find(p=>p.bone.name==='head').body,delta=new T.Vector3(...points[i]).sub(new T.Vector3().copy(head.translation()));for(const p of char.parts){p.body.setTranslation(new T.Vector3().copy(p.body.translation()).add(delta),true);p.body.setLinvel({x:0,y:0,z:0},true);p.body.setAngvel({x:0,y:0,z:0},true);}}c.world.propagateModifiedBodyPositionsToColliders();c.sim.step(1/120);};
   window.__near=(side,index)=>{const source=__xrSession.inputSources.find(s=>s.handedness===side),p=new T.Vector3().copy(c.villagers[index].parts.find(p=>p.bone.name==='head').body.translation()).applyMatrix4(c.scene.matrixWorld);source.gripSpace.pose={transform:{position:p,orientation:{x:0,y:0,z:0,w:1}}};source.targetRaySpace.pose={transform:{position:p,orientation:{x:0,y:0,z:0,w:1}}};source.gamepad.buttons[0]={pressed:false,value:0};return source;};
   __cluster([[0,6,0],[.8,6,0],[-.8,6,0],[0,6,.8]]);const left=__near('left',0);for(let i=0;i<5;i++)__interactionDraw();left.gamepad.buttons[0]={pressed:true,value:1};for(let i=0;i<5;i++)__interactionDraw();
  });await capture(page,variant,'three-character-group');
  await page.evaluate(()=>{__cluster([[0,6,0],[.8,6,0],[5,6,0],[5.8,6,0]]);const left=__near('left',0),right=__near('right',2);for(let i=0;i<5;i++)__interactionDraw();left.gamepad.buttons[0]={pressed:true,value:1};right.gamepad.buttons[0]={pressed:true,value:1};for(let i=0;i<5;i++)__interactionDraw();});await capture(page,variant,'both-hand-groups');
  await page.evaluate(()=>{SETTLEMENTQA.context.renderer.setAnimationLoop(null);return SETTLEMENTQA.context.villageXR.end();});assert.deepEqual(errors,[]);await page.close();
 }
 const row=(variant,label)=>report.rows.find(r=>r.variant===variant&&r.label===label);assert.equal(row('baseline','desktop').render.calls,row('candidate','desktop').render.calls);
 // Each existing rune is transparent DoubleSide: r160 submits its back and
 // front separately. Two rigs (six draws) replace two shells, adding four/eye.
 for(const label of ['controllers-mono','controllers-stereo']){const b=row('baseline',label),c=row('candidate',label);assert.deepEqual(c.framebuffer,b.framebuffer);assert.equal(c.eyes,b.eyes);assert.equal(c.draws.filter(d=>d.name==='dorsal-turquoise-rune').length,c.eyes*4);assert.equal(c.render.calls-b.render.calls,c.eyes*4);}
 assert.equal(row('candidate','three-character-group').groups.left,3);assert.deepEqual(row('candidate','both-hand-groups').groups,{left:2,right:2});
 assert(row('candidate','three-character-group').draws.some(d=>d.name==='Target attachment ring'&&d.instances===3));assert(!timedOut);report.pass=true;
 }finally{clearTimeout(watchdog);if(browser)await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'interaction-browser.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({pass:report.pass,backend:report.backend,rows:report.rows.map(({variant,label,render,groups})=>({variant,label,render,groups})),browserClosed:report.browserClosed}));
})().catch(e=>{console.error(e);process.exitCode=1;});
