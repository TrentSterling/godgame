const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'generated');fs.mkdirSync(out,{recursive:true});
const {chromium}=require(process.env.PLAYWRIGHT_PATH),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=process.env.BASELINE_HTML,candidate=path.join(root,'dist/HOLLOW_HANDS_SETTLEMENT_FOOD_MISSION.html'),censusOnly=process.argv.includes('--census');
(async()=>{
 const report={pass:false,scope:'Matched actual renderer.info calls in muted headless Chromium SwiftShader; desktop camera only, no hardware GPU or Quest timing',identities:{baseline:hash(fs.readFileSync(baseline)),candidate:hash(fs.readFileSync(candidate))},rows:[]};
 assert.equal(report.identities.baseline,'02362b3e8a92a4225ca05ec01377928b00de266a4354bdbf63cd41869e5dbf1d');let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio','--disable-audio-output','--no-first-run']});
  const probe=await browser.newPage();report.backend=await probe.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2'),e=gl?.getExtension('WEBGL_debug_renderer_info');return gl&&gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});await probe.close();assert.match(report.backend,/SwiftShader/i);
  for(const [mode,file]of censusOnly?[['baseline',baseline]]:[['baseline',baseline],['candidate',candidate]]){
   const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(pathToFileURL(file).href+'?capture',{waitUntil:'load'});await page.waitForFunction(()=>window.SETTLEMENTQA||window.SETTLEMENTERROR);assert.equal(await page.evaluate(()=>window.SETTLEMENTERROR??null),null);await page.waitForFunction(()=>!document.getElementById('village-xr-enter').textContent.startsWith('Checking XR'));
   for(const delivered of censusOnly?[0]:[0,1,3,5])for(const view of ['desktop','wide-shadowless']){
    const value=await page.evaluate(({delivered,view})=>{
     const c=SETTLEMENTQA.context,T=c.THREE,r=c.renderer;c.environment.update(delivered);
     const camera=c.camera.clone();if(view==='wide-shadowless'){camera.position.set(38,40,42);camera.lookAt(6,0,-5);camera.updateMatrixWorld(true);}
     const calls=[],original=r.renderBufferDirect;r.renderBufferDirect=function(camera,scene,geometry,material,object,group){const before=r.info.render.calls,result=original.call(this,camera,scene,geometry,material,object,group),count=r.info.render.calls-before;if(count)calls.push({name:object.name||object.type,parent:object.parent?.name||object.parent?.type,material:material.type,materialId:material.id,sourceMaterialId:object.material?.id,color:object.material?.color?.getHexString(),calls:count,triangles:Math.min(geometry.drawRange.count,geometry.index?.count??geometry.attributes.position.count)/3});return result;};
     r.shadowMap.enabled=view==='desktop';r.info.autoReset=false;r.info.reset();r.clear();try{r.render(c.scene,camera);}finally{r.renderBufferDirect=original;}
     const world={...r.info.render},memory={...r.info.memory};r.info.reset();r.clearDepth();if(view==='desktop')r.render(c.hud.scene,c.hud.camera);const hud={...r.info.render};r.info.autoReset=true;
     return{world,hud,memory,calls};
    },{delivered,view});
    assert.equal(value.calls.reduce((s,c)=>s+c.calls,0),value.world.calls,'Census accounts for all world and shadow draws');report.rows.push({mode,delivered,view,...value});
    await page.screenshot({path:path.join(out,`${mode}-bridge-${delivered}-${view}.png`)});
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  if(!censusOnly)for(const b of report.rows.filter(r=>r.mode==='baseline')){const c=report.rows.find(r=>r.mode==='candidate'&&r.delivered===b.delivered&&r.view===b.view);assert(c.world.calls<=b.world.calls);if(b.delivered===0)assert(c.world.calls<b.world.calls);assert.equal(c.world.triangles,b.world.triangles);assert.equal(c.hud.calls,b.hud.calls);}
  report.pass=true;
 }finally{if(browser)await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,censusOnly?'scenery-census.json':'scenery-browser.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({pass:report.pass,backend:report.backend,identities:report.identities,rows:report.rows.map(({mode,delivered,view,world,hud})=>({mode,delivered,view,world,hud})),browserClosed:report.browserClosed}));
})().catch(e=>{console.error(e);process.exitCode=1;});
