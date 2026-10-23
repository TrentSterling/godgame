const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=__dirname,out=path.join(dir,'generated'),evidence=path.join(dir,'evidence');fs.mkdirSync(evidence,{recursive:true});
const read=n=>JSON.parse(fs.readFileSync(path.join(out,n+'.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const name of ['bridge-batching','scenery-pixels','scenery-simulation'])fs.copyFileSync(path.join(out,name+'.json'),path.join(evidence,name+'.json'));
const historical=read('summary');assert(historical.pass);assert.equal(historical.identities.baseline.baselineSource,'7bf720e6b3b805c80fe082cfd65c1e1ac8e0d366');fs.writeFileSync(path.join(evidence,'scenery-historical-cpu.json'),JSON.stringify(historical,null,2)+'\n');
const source=read('scenery-browser');assert(source.pass&&source.browserClosed);
const summarize=row=>{
 const {calls,...rest}=row,groups={};for(const c of calls){const name=c.name.replace(/\d+/g,'#');groups[name]=(groups[name]||0)+c.calls;}
 return{...rest,bridgePlanCalls:calls.filter(c=>c.name.startsWith('bridge_plan_')).reduce((s,c)=>s+c.calls,0),colorMaterialObjects:new Set(calls.filter(c=>c.material!=='MeshDepthMaterial').map(c=>c.sourceMaterialId)).size,drawGroups:Object.entries(groups).sort((a,b)=>b[1]-a[1])};
};
const report={...source,rawReportSHA256:hash(fs.readFileSync(path.join(out,'scenery-browser.json'))),rows:source.rows.map(summarize)};
for(const before of report.rows.filter(r=>r.mode==='baseline')){const after=report.rows.find(r=>r.mode==='candidate'&&r.delivered===before.delivered&&r.view===before.view);assert.equal(before.world.calls-after.world.calls,(5-before.delivered)*3*(before.view==='desktop'?2:1));}
fs.writeFileSync(path.join(evidence,'scenery-browser.json'),JSON.stringify(report,null,2)+'\n');
const native=JSON.parse(fs.readFileSync(path.join(dir,'../xr-village/generated/summary.json')));assert(native.pass);fs.writeFileSync(path.join(evidence,'scenery-native.json'),JSON.stringify(native,null,2)+'\n');
const images=fs.readdirSync(out).filter(n=>/^(baseline|candidate)-bridge-.+\.png$/.test(n)).sort().map(n=>({file:'generated/'+n,sha256:hash(fs.readFileSync(path.join(out,n))),bytes:fs.statSync(path.join(out,n)).size}));
assert.equal(images.length,16);fs.writeFileSync(path.join(evidence,'scenery-images.json'),JSON.stringify({scope:'Original unedited before/after captures retained in generated; all sixteen SHA256 hashes',images},null,2)+'\n');
console.log(JSON.stringify({pass:true,images:images.length,worldCalls:report.rows.filter(r=>r.delivered===0).map(r=>({mode:r.mode,view:r.view,calls:r.world.calls,materials:r.colorMaterialObjects}))}));
