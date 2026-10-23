const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'evidence'),generated=path.join(__dirname,'generated'),native=path.join(root,'qa/xr-village/generated'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(out,{recursive:true});
const receipts=[['native',path.join(native,'summary.json')],['tracking',path.join(native,'tracking-retention.json')],['follow',path.join(native,'grab-follow.json')],['source',path.join(native,'source-identity.json')],['simulation',path.join(generated,'tracking-simulation.json')],['monitor',path.join(generated,'monitor.json')],['browser',path.join(generated,'tracking-browser.json')],['pixels',path.join(generated,'tracking-pixels.json')]];
for(const [name,file] of receipts){const data=JSON.parse(fs.readFileSync(file));if(name!=='source')assert(data.pass===true||data.passed===true,name);fs.copyFileSync(file,path.join(out,'tracking-'+name+'.json'));}
const source=JSON.parse(fs.readFileSync(path.join(native,'source-identity.json')));
for(const [file,expected] of Object.entries(source.hashes))assert.equal(hash(fs.readFileSync(path.join(root,'src',file))),expected,file);
for(const [file,expected] of Object.entries(source.testHashes))assert.equal(hash(fs.readFileSync(path.join(root,'qa/xr-village',file))),expected,file);
const html=fs.readFileSync(path.join(root,'dist/HOLLOW_HANDS_SETTLEMENT_FOOD_MISSION.html'));assert.equal(hash(html),source.deliveredHTMLSHA256);
for(const file of ['baseline-tracking-desktop.png','candidate-tracking-desktop.png','baseline-tracking-xr.png','candidate-tracking-xr.png','candidate-tracking-mobile.png','candidate-tracking-stereo.png'])fs.copyFileSync(path.join(generated,file),path.join(out,'tracking-'+file));
const files=fs.readdirSync(out).filter(f=>f.startsWith('tracking-')&&f!=='tracking-manifest.json').sort();
const manifest={baseSource:'15d852ba9996bfb927c0f1ffc85c94a6b6b76b36',baseDeployment:'b13137d1b6b2c2b840c76f44ed9b29f47847d73b',html:{bytes:html.length,sha256:hash(html)},files:Object.fromEntries(files.map(file=>[file,{bytes:fs.statSync(path.join(out,file)).size,sha256:hash(fs.readFileSync(path.join(out,file)))}])),scope:'Candidate evidence, not published or independently approved. No actual Quest acceptance.'};
fs.writeFileSync(path.join(out,'tracking-manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest.html));
