const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.HH_OUTPUT_ROOT||path.join(__dirname,'generated'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const hashes=()=>Object.fromEntries(fs.readdirSync(path.join(root,'src')).filter(n=>n.endsWith('.js')).sort().map(n=>[n,hash(path.join(root,'src',n))]));
const before=hashes(),env={...process.env,HH_SOURCE_ROOT:root,HH_OUTPUT_ROOT:out,HH_DEPS_ROOT:path.join(root,'node_modules')};
fs.mkdirSync(path.join(__dirname,'generated'),{recursive:true});fs.mkdirSync(out,{recursive:true});
require(path.join(root,'node_modules/esbuild')).buildSync({stdin:{contents:"export {FONT} from './src/gpu-hud.js';export {createSettlementEconomy} from './src/settlement-economy.js';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:path.join(__dirname,'generated/components.mjs')});
const report={passed:false,scope:'CPU-only application input/native Rapier and mocked XR; no WebGL renderer, browser or GPU process',sourceHashes:before,runs:[]};
const modes=process.env.PRIORITY_MODES?.split(',')??['ordinary','committed','budgets','xr','held-food'];
const commands=[];if(!env.HH_NATIVE_BUNDLE)commands.push({label:'build-native',args:['qa/lightning/contracts/build-native.cjs'],extra:{HH_OUTPUT_ROOT:path.join(out,'candidate')}});
for(const mode of modes)commands.push({label:mode,args:['qa/priority-feedback/native-input.mjs',mode]});
for(const item of commands){const run=spawnSync(process.execPath,item.args,{cwd:root,env:{...env,...item.extra},encoding:'utf8',maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,item.label+'.log'),run.stdout+run.stderr);report.runs.push({label:item.label,exitCode:run.status});console.log(item.label,run.status===0?'PASS':'FAIL');if(run.status!==0)console.log(run.stderr.slice(-5000));if(item.label==='build-native'&&run.status!==0)break;}
report.sourceUnchanged=JSON.stringify(before)===JSON.stringify(hashes());report.passed=report.runs.length===commands.length&&report.runs.every(r=>r.exitCode===0)&&report.sourceUnchanged;fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
