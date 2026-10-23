// Read-only public-build comparison using existing headless Chromium with
// SwiftShader. No native input, visible window, hardware GPU or audio is used.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'generated');
const playwright=process.env.PLAYWRIGHT_PATH;if(!playwright)throw Error('Set PLAYWRIGHT_PATH to an existing installation; this script installs nothing');
const {chromium}=require(playwright),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const base=process.env.BASELINE_HTML;if(!base)throw Error('Set BASELINE_HTML to the published reviewed hand/UI build');
const candidate=path.join(root,'dist/HOLLOW_HANDS_SETTLEMENT_FOOD_MISSION.html');
(async()=>{
 const report={pass:false,scope:'Actual WebGL renderer.info from existing headless Chromium SwiftShader, single desktop camera. No hardware GPU, native input, audio, real XR compositor or Quest timing.',identities:{baseline:hash(fs.readFileSync(base)),candidate:hash(fs.readFileSync(candidate))},rows:[]};
 assert.equal(report.identities.baseline,'0fc797800189e78e628cf81adf1f261b92ccae6656890e13a785de8803927e90','Reviewed published baseline bytes');
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio','--disable-audio-output','--no-first-run']});
  // Refuse to load the game if the selected backend is not the software renderer.
  const probe=await browser.newPage();report.backend=await probe.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2');if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});await probe.close();assert.match(report.backend,/SwiftShader/i);
  for(const [mode,file]of [['baseline',base],['candidate',candidate]]){
   const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(pathToFileURL(file).href+'?capture',{waitUntil:'load'});await page.waitForFunction(()=>window.SETTLEMENTQA||window.SETTLEMENTERROR);assert.equal(await page.evaluate(()=>window.SETTLEMENTERROR??null),null);
   await page.waitForFunction(()=>!document.getElementById('village-xr-enter').textContent.startsWith('Checking XR'));
   for(const fraction of [1,.5,0])for(const view of ['desktop','wide-shadowless']){
    const value=await page.evaluate(({fraction,view})=>{
     const c=SETTLEMENTQA.context,T=c.THREE,r=c.renderer;
     c.foodArt.sync({pantry:{food:3,spareStone:0},forageSources:['mainland-forage','island-garden'].map(id=>({id,remaining:100*fraction,reserve:100}))});
     const camera=c.camera.clone();if(view==='wide-shadowless'){camera.position.set(38,40,42);camera.lookAt(6,0,-5);camera.updateMatrixWorld(true);}
     r.shadowMap.enabled=view==='desktop';r.info.autoReset=false;r.info.reset();r.clear();r.render(c.scene,camera);
     const world={...r.info.render};r.info.reset();r.clearDepth();if(view==='desktop')r.render(c.hud.scene,c.hud.camera);const hud={...r.info.render};r.info.autoReset=true;
     return{world,hud,geometries:r.info.memory.geometries,textures:r.info.memory.textures};
    },{fraction,view});
    report.rows.push({mode,fraction,view,...value});
    if(fraction===1&&view==='desktop')await page.screenshot({path:path.join(out,mode+'-drawcalls.png')});
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  for(const b of report.rows.filter(r=>r.mode==='baseline')){const c=report.rows.find(r=>r.mode==='candidate'&&r.fraction===b.fraction&&r.view===b.view);assert(c.world.calls<b.world.calls);assert.equal(c.world.triangles,b.world.triangles,'Matched visible triangles');assert.equal(c.hud.calls,b.hud.calls);}
  report.pass=true;
 }finally{if(browser)await browser.close();report.browserClosed=true;fs.writeFileSync(path.join(out,'browser-drawcalls.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
