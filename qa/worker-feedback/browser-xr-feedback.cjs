const fs=require('fs'),http=require('http'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/trontstack/craftmine/node_modules/playwright');
(async()=>{
 const html=fs.readFileSync(process.env.CANDIDATE_HTML || 'source-v24/hollow-hands-settlement-food-mission/dist/HOLLOW_HANDS_SETTLEMENT_FOOD_MISSION.html');
 const report={scope:'Synthetic WebXR provider driving real Chrome and Three renderer. Mock tracked ray inputs and pumped XR frame clock; real native simulation. No hardware, tracking accuracy, stereo, comfort or headset claim.',htmlSHA256:crypto.createHash('sha256').update(html).digest('hex'),errors:[],states:{},passed:false};
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await page.addInitScript({path:process.env.XR_MOCK_PATH || 'godgame-candidate/qa/village-archipelago/mock-webxr.js'});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.SETTLEMENTQA&&SETTLEMENTQA.state().xr.supported);
  const desktop=await page.evaluate(()=>({camera:SETTLEMENTQA.context.camera.position.toArray(),scale:SETTLEMENTQA.context.scene.scale.toArray()}));
  await page.click('#village-xr-enter');await page.waitForFunction(()=>SETTLEMENTQA.state().xr.active);
  await page.evaluate(()=>{
   __xrSession.pump();__xrSession.addController();
   const ui=id=>{__xrSession.aimAt('Village XR '+id,false);for(let i=0;i<4;i++)__xrSession.pump();__xrSession.aimAt('Village XR '+id,true);__xrSession.pump();__xrSession.aimAt('Village XR '+id,false);for(let i=0;i<4;i++)__xrSession.pump();};
   window.xrUi=ui;ui('done');for(let i=0;i<100;i++)__xrSession.pump();
   window.xrPoint=(point,origin)=>{
    const {THREE:T}=SETTLEMENTQA.context,s=__xrSession.inputSources[0],q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),point.clone().sub(origin).normalize());
    s.targetRaySpace.pose={transform:{position:origin,orientation:q}};
    s.gamepad.buttons[0]={pressed:false,value:0};for(let i=0;i<4;i++)__xrSession.pump();
    s.gamepad.buttons[0]={pressed:true,value:1};__xrSession.pump();s.gamepad.buttons[0]={pressed:false,value:0};for(let i=0;i<4;i++)__xrSession.pump();
   };
   const c=SETTLEMENTQA.context,T=c.THREE;c.scene.updateMatrixWorld(true);
   const head=new T.Vector3().copy(c.villagers[0].parts.find(p=>p.bone.name==='head').body.translation());
   xrPoint(head.clone().applyMatrix4(c.scene.matrixWorld),head.clone().add(new T.Vector3(0,3,0)).applyMatrix4(c.scene.matrixWorld));
   window.xrSite=id=>{const c=SETTLEMENTQA.context,T=c.THREE,p=c.worldCues.getControl(id).plate.getWorldPosition(new T.Vector3());xrPoint(p,p.clone().add(new T.Vector3(0,0,.22).applyQuaternion(c.scene.quaternion)));};
   xrSite('mainland-forage');for(let i=0;i<250;i++)__xrSession.pump();
  });
  report.states.assigned=await page.evaluate(()=>SETTLEMENTQA.state());assert.equal(report.states.assigned.workerOrders.selectedWorkerId,'villager-0');
  await page.screenshot({path:'evidence/xr-assigned-synthetic.png'});
  await page.evaluate(()=>{for(let i=0;i<2400;i++){const w=SETTLEMENTQA.state().jobs.villagers[0];if(w.stoneId&&w.phase==='to-site')return;__xrSession.pump();}throw Error('No natural food carrier');});
  await page.evaluate(()=>{xrSite('quarry');for(let i=0;i<250;i++)__xrSession.pump();});
  report.states.queued=await page.evaluate(()=>SETTLEMENTQA.state());assert.equal(report.states.queued.jobs.villagers[0].pendingSourceId,'quarry');
  await page.screenshot({path:'evidence/xr-queued-synthetic.png'});
  await page.click('#village-xr-exit');await page.waitForFunction(()=>!SETTLEMENTQA.state().xr.active);
  const restored=await page.evaluate(()=>({camera:SETTLEMENTQA.context.camera.position.toArray(),scale:SETTLEMENTQA.context.scene.scale.toArray()}));assert.deepEqual(restored,desktop);
  assert.equal(report.errors.length,0);report.passed=true;
 }catch(e){report.error=String(e.stack);await page.screenshot({path:'evidence/xr-feedback-failure.png'}).catch(()=>{});process.exitCode=1;}
 finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync('evidence/xr-feedback-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,errors:report.errors,error:report.error}));}
})().catch(e=>{console.error(e);process.exitCode=1});
