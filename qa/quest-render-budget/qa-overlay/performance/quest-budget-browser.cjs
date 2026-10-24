// Owned, muted headless Chromium only. Requires both exclusive GPU claims.
// Synthetic XR drives the real renderer at a fixed pose; no headset or OS input.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH),root=path.resolve(__dirname,'../..'),runId=process.env.EVIDENCE_RUN,out=path.join(__dirname,'generated',runId??''),owner='codex-godgame-quest-current-task-8';
if(runId){assert.match(runId,/^[a-z0-9-]+$/);fs.mkdirSync(out,{recursive:false});}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),files={baseline:process.env.BASELINE_HTML,candidate:path.join(root,'dist/HOLLOW_HANDS_SETTLEMENT_FOOD_MISSION.html')};
const captureOnly=process.argv.includes('--capture-only');
const ownedFBO=process.argv.includes('--owned-fbo');
const uniformProbe=process.argv.includes('--uniform-probe');
for(const id of ['gpu-game-validation','pc1-browser-gpu-capture']){const r=JSON.parse(fs.readFileSync('C:/trontstack/.agentcoord/claims/'+id+'.json'));assert.equal(r.owner,owner);assert(Date.now()-Date.parse(r.heartbeatUtc)<r.ttlMinutes*60000,'Fresh claim '+id);}
const report={pass:false,scope:'Actual Three0.160 renderer and asynchronous GPU timer queries in owned muted headless Chromium on the host GPU. Synthetic XR uses a fixed1280x720 framebuffer and controlled72Hz sample timestamps. Neither displayed synthetic cadence nor host timings represent Quest FPS/compositor performance. No OS input, focus, pointerlock, audio tests or headset access.',identities:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,hash(fs.readFileSync(v))])),rows:[],captures:[]};
assert.equal(report.identities.baseline,'d8b6e70255d8538d9b1253b76be5756eb25d26837a7ab521256009aefc9e62b5');
let provider=fs.readFileSync(path.join(root,'qa/xr-village/mock-webxr-browser.js'),'utf8');
assert(provider.includes('getJointPose:()=>null'));
provider=provider.replace('getJointPose:()=>null',"getJointPose:joint=>joint?.point?{radius:.008,transform:{position:joint.point,orientation:{x:0,y:0,z:0,w:1},matrix:[1,0,0,0,0,1,0,0,0,0,1,0,joint.point.x,joint.point.y,joint.point.z,1]}}:null");
if(ownedFBO){
 const from='this.framebuffer=null;';assert(provider.includes(from));
 provider=provider.replace(from,`const oldF=gl.getParameter(gl.FRAMEBUFFER_BINDING),oldT=gl.getParameter(gl.TEXTURE_BINDING_2D),oldR=gl.getParameter(gl.RENDERBUFFER_BINDING);this.framebuffer=gl.createFramebuffer();const color=gl.createTexture(),depth=gl.createRenderbuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.bindTexture(gl.TEXTURE_2D,color);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,1280,720);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,1280,720);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Owned mock XR FBO incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,oldF);gl.bindTexture(gl.TEXTURE_2D,oldT);gl.bindRenderbuffer(gl.RENDERBUFFER,oldR);session.addEventListener('end',()=>{gl.deleteFramebuffer(this.framebuffer);gl.deleteTexture(color);gl.deleteRenderbuffer(depth);},{once:true});window.__budgetOwnedFBO=true;`);
}
async function measure(page,variant,run,label){
 const census=await page.evaluate(probe=>{
  const c=SETTLEMENTQA.context,r=c.renderer,draws=[],uniforms=[],original=r.renderBufferDirect;
  r.renderBufferDirect=function(camera,scene,geometry,material,object,group){const calls=r.info.render.calls,triangles=r.info.render.triangles;const result=original.call(this,camera,scene,geometry,material,object,group);if(r.info.render.calls>calls)draws.push({name:object.name,type:material.type,calls:r.info.render.calls-calls,triangles:r.info.render.triangles-triangles,monitor:object===c.performanceMonitor.mesh});if(probe&&object.renderOrder>=2000){const gl=r.getContext(),p=gl.getParameter(gl.CURRENT_PROGRAM),read=n=>{const l=gl.getUniformLocation(p,n);const v=l&&gl.getUniform(p,l);return v&&typeof v.length==='number'?Array.from(v):v;};uniforms.push({name:object.name,parent:object.parent?.name,renderOrder:object.renderOrder,index:geometry.index?.count??null,positions:geometry.attributes.position.count,range:geometry.drawRange,viewport:Array.from(gl.getParameter(gl.VIEWPORT)),scissor:gl.isEnabled(gl.SCISSOR_TEST),depthTest:gl.isEnabled(gl.DEPTH_TEST),modelViewCPU:object.modelViewMatrix.toArray(),projectionCPU:camera.projectionMatrix.toArray(),modelViewGL:read('modelViewMatrix'),projectionGL:read('projectionMatrix'),diffuse:read('diffuse'),opacity:read('opacity')});}return result;};
  try{__budgetDraw();}finally{r.renderBufferDirect=original;}
  let pixels;if(r.xr.isPresenting&&window.__budgetOwnedFBO){const gl=r.getContext(),w=1280,h=720,raw=new Uint8Array(w*h*4),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,raw);const context=canvas.getContext('2d'),image=context.createImageData(w,h);for(let y=0;y<h;y++)image.data.set(raw.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);context.putImageData(image,0,0);pixels=canvas.toDataURL('image/png');}else pixels=r.domElement.toDataURL('image/png');
  const materials={};for(const d of draws){const v=materials[d.type]??={calls:0,triangles:0};v.calls+=d.calls;v.triangles+=d.triangles;}
  const state=c.villageXR.state(),uiState=Object.fromEntries(['active','placed','placing','mode','scale'].map(k=>[k,state[k]])),cameras=r.xr.isPresenting?r.xr.getCamera().cameras:[c.camera];
  return{pixels,uniforms,uiState,cameraState:cameras.map(v=>({world:v.matrixWorld.toArray(),projection:v.projectionMatrix.toArray()})),sceneMatrix:c.scene.matrixWorld.toArray(),render:{...r.info.render},draws,materials,programs:r.info.programs.map(p=>({name:p.name,usedTimes:p.usedTimes})),tier:c.renderBudget?.stats()??null,monitor:c.performanceMonitor.snapshot(),tracking:c.villageXR.trackingMode(),viewerValid:SETTLEMENTQA.state().xr.input.viewer.valid,callbacks:{...window.__budgetCallbacks},shadowMap:r.shadowMap.enabled,framebuffer:{width:r.domElement.width,height:r.domElement.height},eyes:r.xr.isPresenting?r.xr.getCamera().cameras.length:1};
 },uniformProbe);
 assert.equal(census.draws.reduce((s,d)=>s+d.calls,0),census.render.calls,'Every world, shadow, UI and eye draw accounted for');
 if(label!=='desktop'){assert.equal(census.callbacks.missingFrames,0,'No competing window RAF during XR');assert.equal(census.tracking,'tracked');assert.equal(census.viewerValid,true);assert(Math.abs(census.monitor.fps-72)<.001,'Controlled synthetic cadence only');}
 if(run<2){
  // Read the real framebuffer in the exact same callback task and render as
  // the census. Image readback is outside the separately timed query frames.
  const bytes=Buffer.from(census.pixels.split(',')[1],'base64'),sha256=hash(bytes),name=variant+'-'+label+'-'+sha256.slice(0,16)+'.png';fs.writeFileSync(path.join(out,name),bytes,{flag:'wx'});report.captures.push({variant,label,name,sha256,bytes:bytes.length});
 }
 delete census.pixels;
 const gpu=captureOnly?{skipped:true,reason:'Separate synchronous canvas evidence run; no timer queries'}:await page.evaluate(async()=>{
  const r=SETTLEMENTQA.context.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!ext)return{supported:false,valid:false,reason:'EXT_disjoint_timer_query_webgl2 unavailable'};
  const samples=[],cpuSubmissionMs=[];let disjoint=false;
  for(let i=0;i<24;i++){
   disjoint ||= !!gl.getParameter(ext.GPU_DISJOINT_EXT);const q=gl.createQuery();
   gl.beginQuery(ext.TIME_ELAPSED_EXT,q);const start=performance.now();__budgetDraw();cpuSubmissionMs.push(performance.now()-start);gl.endQuery(ext.TIME_ELAPSED_EXT);gl.flush();
   const deadline=performance.now()+2000;while(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)&&performance.now()<deadline){await new Promise(resolve=>setTimeout(resolve,2));disjoint ||= !!gl.getParameter(ext.GPU_DISJOINT_EXT);}
   if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){gl.deleteQuery(q);return{supported:true,valid:false,reason:'GPU query exceeded2second result deadline'};}
   disjoint ||= !!gl.getParameter(ext.GPU_DISJOINT_EXT);samples.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);
  }
  const sorted=samples.slice().sort((a,b)=>a-b),valid=!disjoint&&samples.every(n=>Number.isFinite(n)&&n>0);
  return{supported:true,valid,disjoint,samplesMs:valid?samples:[],medianMs:valid?(sorted[11]+sorted[12])/2:null,meanMs:valid?samples.reduce((a,b)=>a+b,0)/samples.length:null,cpuSubmissionMs,glError:gl.getError(),reason:valid?null:'Discarded all timings after disjoint or invalid result'};
 });
 const row={variant,run,label,...census,gpu};report.rows.push(row);
}
(async()=>{
 let browser,watchdog,timedOut=false;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--headless=new','--use-gl=angle','--use-angle=d3d11','--mute-audio','--disable-audio-output','--no-first-run','--no-default-browser-check']});
  watchdog=setTimeout(()=>{timedOut=true;browser.close().catch(()=>{});},120000);
  const probe=await browser.newPage();report.backend=await probe.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2');if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});await probe.close();assert.match(report.backend,/NVIDIA|AMD|Intel/i,'Hardware renderer required; no silent software timing fallback');
  for(const[run,variant]of (captureOnly?['baseline','candidate']:['baseline','candidate','candidate','baseline']).entries()){
   const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.addInitScript({content:provider});
   await page.goto(pathToFileURL(files[variant]).href+'?capture');await page.waitForFunction(()=>window.SETTLEMENTQA||window.SETTLEMENTERROR);assert.equal(await page.evaluate(()=>window.SETTLEMENTERROR??null),null);
   await page.waitForFunction(()=>SETTLEMENTQA.state().xr.supported);
   await page.evaluate(()=>{window.__budgetDraw=()=>SETTLEMENTQA.step(0);for(let i=0;i<60;i++)__budgetDraw();});await measure(page,variant,run,'desktop');
   // Match production ordering: sessionstart must stop the window RAF that
   // setAnimationLoop starts. Installing it after startSession creates two loops.
   await page.evaluate(()=>{const c=SETTLEMENTQA.context;window.__budgetCallbacks={missingFrames:0,xrFrames:0};c.renderer.setAnimationLoop((now,frame)=>{if(!frame){__budgetCallbacks.missingFrames++;return;}__budgetCallbacks.xrFrames++;c.performanceMonitor.beginFrame(now,{xr:true,visible:true});c.villageXR.update(now,frame);SETTLEMENTQA.step(0);});});
   assert(await page.evaluate(()=>SETTLEMENTQA.context.villageXR.startSession()));await page.waitForFunction(()=>!SETTLEMENTQA.state().xr.busy);
   await page.evaluate(()=>{__xrSession.time=1000;__budgetCallbacks.missingFrames=0;window.__budgetDraw=()=>__xrSession.pump();for(let i=0;i<60;i++)__budgetDraw();});
   await measure(page,variant,run,'xr-mono');
   await page.evaluate(()=>{__xrSession.addController('left');__xrSession.addController('right');for(const [i,s]of __xrSession.inputSources.entries()){const p={x:i?.18:-.18,y:1.3,z:-.42};s.gripSpace.pose={transform:{position:p,orientation:{x:0,y:0,z:0,w:1}}};s.targetRaySpace.pose={transform:{position:p,orientation:{x:0,y:0,z:0,w:1}}};}for(let i=0;i<60;i++)__budgetDraw();});await measure(page,variant,run,'xr-controllers');
   await page.evaluate(()=>{__xrMock.stereo=true;for(let i=0;i<60;i++)__budgetDraw();});await measure(page,variant,run,'xr-stereo-controllers');
   await page.evaluate(()=>{
    __xrMock.stereo=false;const removed=__xrSession.inputSources;
    const sources=['left','right'].map((handedness,index)=>{
     const center={x:index ? .23 : -.17,y:1.28,z:-.42},point=(x,y,z)=>({x:center.x+x,y:center.y+y,z:center.z+z}),gap=.055;
     const points={wrist:point(0,0,.12),'thumb-metacarpal':point(-.05,0,.065),'thumb-phalanx-proximal':point(-.04,0,.04),'thumb-phalanx-distal':point(-.03,0,.02),'thumb-tip':point(-gap/2,0,0)};
     ['index','middle','ring','pinky'].forEach((name,i)=>{const x=.025+i*.024;for(const[part,z]of [['metacarpal',.09],['phalanx-proximal',.065],['phalanx-intermediate',.042],['phalanx-distal',.022],['tip',0]])points[name+'-finger-'+part]=point(name==='index'&&part==='tip'?gap/2:x,0,z);});
     return{handedness,profiles:['generic-hand-select'],targetRayMode:'tracked-pointer',targetRaySpace:{},hand:new Map(Object.entries(points).map(([name,point])=>[name,{name,point}]))};
    });__xrSession.inputSources=sources;const e=new Event('inputsourceschange');Object.assign(e,{added:sources,removed});__xrSession.dispatchEvent(e);for(let i=0;i<60;i++)__budgetDraw();
   });await measure(page,variant,run,'xr-hands');
   await page.evaluate(()=>{__xrMock.stereo=true;for(let i=0;i<60;i++)__budgetDraw();});await measure(page,variant,run,'xr-stereo-hands');
   await page.evaluate(()=>{SETTLEMENTQA.context.environment.update(5);for(let i=0;i<60;i++)__budgetDraw();});await measure(page,variant,run,'xr-stereo-built');
   await page.evaluate(()=>{SETTLEMENTQA.context.renderer.setAnimationLoop(null);return SETTLEMENTQA.context.villageXR.end();});assert.deepEqual(errors,[]);await page.close();
  }
  for(const b of report.rows.filter(r=>r.variant==='baseline'&&r.run===0)){
   const c=report.rows.find(r=>r.variant==='candidate'&&r.run===1&&r.label===b.label);
   assert(c.render.calls<b.render.calls,'Batching must reduce actual calls: '+b.label);assert.equal(c.eyes,b.eyes);assert.deepEqual(c.framebuffer,b.framebuffer);assert.deepEqual(c.uiState,b.uiState);assert.deepEqual(c.cameraState,b.cameraState);assert.deepEqual(c.sceneMatrix,b.sceneMatrix);
   const triangles=r=>r.draws.filter(d=>!d.monitor).reduce((n,d)=>n+d.triangles,0);assert.equal(triangles(c),triangles(b),'Non-monitor rendered triangles: '+b.label);
   if(b.label!=='desktop'){assert.equal(c.shadowMap,false);assert(c.materials.MeshLambertMaterial?.calls>0);assert.equal(b.materials.MeshLambertMaterial,undefined);}
  }
  assert(!timedOut);report.pass=true;
 }finally{clearTimeout(watchdog);if(browser)await browser.close();report.browserClosed=true;report.captureMethod=ownedFBO?'Owned mock XR RGBA8/depth24 framebuffer, single-sample, synchronous readPixels in the same evaluate and draw as the census; no real XR compositor.':'Synchronous renderer canvas PNG in the same evaluate and draw as the census, outside timed query frames; synthetic XR.';fs.writeFileSync(path.join(out,'quest-budget-'+(ownedFBO?'owned-fbo-':'')+(captureOnly?'visuals':'browser')+'.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({pass:report.pass,backend:report.backend,rows:report.rows.map(({variant,run,label,render,materials,gpu})=>({variant,run,label,render,materials,gpu:{supported:gpu.supported,valid:gpu.valid,medianMs:gpu.medianMs,reason:gpu.reason}})),browserClosed:report.browserClosed}));
})().catch(e=>{console.error(e);process.exitCode=1;});
