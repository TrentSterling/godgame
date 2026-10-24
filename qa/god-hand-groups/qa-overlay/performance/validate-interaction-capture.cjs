const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const out=path.join(__dirname,'generated'),file=path.join(out,'interaction-browser.json'),raw=fs.readFileSync(file),r=JSON.parse(raw),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
// Revalidate the completed ten saved captures after correcting the source-only
// two-draw estimate. No additional browser run or runtime change is claimed.
if(!fs.existsSync(path.join(out,'interaction-browser-first-expectation.json')))fs.writeFileSync(path.join(out,'interaction-browser-first-expectation.json'),raw);
assert(r.browserClosed);assert.equal(r.rows.length,10);assert.equal(r.captures.length,10);assert.equal(r.hashes.candidate,hash(fs.readFileSync(path.join(__dirname,'../../dist/HOLLOW_HANDS_SETTLEMENT_FOOD_MISSION.html'))));
const row=(v,l)=>r.rows.find(x=>x.variant===v&&x.label===l);
for(const x of r.rows){assert.equal(x.draws.reduce((n,d)=>n+d.calls,0),x.render.calls);if(x.label!=='desktop'){assert.equal(x.xr.input.viewer.viewerMissingFrames,0);assert(Math.abs(x.monitor.fps-72)<1e-6);}}
assert.equal(row('baseline','desktop').render.calls,row('candidate','desktop').render.calls);
assert.equal(hash(fs.readFileSync(path.join(out,'baseline-interaction-desktop.png'))),hash(fs.readFileSync(path.join(out,'candidate-interaction-desktop.png'))));
for(const label of ['controllers-mono','controllers-stereo']){const b=row('baseline',label),c=row('candidate',label);assert.deepEqual(c.framebuffer,b.framebuffer);assert.equal(c.eyes,b.eyes);assert.equal(c.draws.filter(d=>d.name==='dorsal-turquoise-rune').length,c.eyes*4);assert.equal(c.render.calls-b.render.calls,c.eyes*4);}
assert.equal(row('candidate','three-character-group').groups.left,3);assert.deepEqual(row('candidate','both-hand-groups').groups,{left:2,right:2});assert(row('candidate','three-character-group').draws.some(d=>d.name==='Target attachment ring'&&d.instances===3));
r.pass=true;r.postCaptureValidation={passed:true,originalExpectation:'Two meshes per rig incorrectly estimated +2calls/eye for both controllers.',measuredMechanism:'Each DoubleSide transparent rune submits twice in Three r160. The two rigs add4calls/eye versus the two old shells.',originalReceiptSHA256:hash(raw),rerun:false,desktopPixelsIdentical:true};
fs.writeFileSync(file,JSON.stringify(r,null,2));console.log(JSON.stringify({passed:true,rows:r.rows.length,desktopPixelsIdentical:true,controllerMono:[175,179],controllerStereo:[350,358],browserClosed:r.browserClosed}));
