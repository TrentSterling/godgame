// CPU-only adapters reuse the existing GLB/DOM/Rapier fixture. Instrumented
// bundles are scratch outputs; no counters or inspector code enter the game.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'generated');
const esbuild=require(path.join(root,'node_modules/esbuild'));
const baseline='7bf720e6b3b805c80fe082cfd65c1e1ac8e0d366';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const sourceFiles=fs.readdirSync(path.join(root,'src')).filter(f=>f.endsWith('.js')).sort();
const baselineFiles=cp.execFileSync('git',['ls-tree','-r','--name-only',baseline,'--','src'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>f.endsWith('.js')).map(f=>path.basename(f)).sort();
function read(mode,name){const s=mode==='baseline'?cp.execFileSync('git',['show',`${baseline}:src/${name}`],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}):fs.readFileSync(path.join(root,'src',name),'utf8');return s.replace(/\r\n/g,'\n');}
function replace(s,from,to){if(s.split(from).length!==2)throw Error('Nonunique adapter: '+from);return s.replace(from,to);}
function instrument(name,s){
 const mark=(from,counter)=>{s=replace(s,from,from+`globalThis.__perf.${counter}++;`);};
 if(name==='settlement-economy.js'){
  mark('function snapshot(events = []) {','snapshots');mark('function update(dt, observations = {}) {','economyUpdates');mark('function command(input) {','commands');
 }
 if(name==='settlement-main.js'){mark('function beforeStep(dt){','beforeSteps');mark('function observe(){','observations');mark('function render(dt=0){','renders');}
 return s;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 for(const mode of ['baseline','candidate']){
  const sources=Object.fromEntries((mode==='baseline'?baselineFiles:sourceFiles).map(name=>[name,read(mode,name)]));
  let main=instrument('settlement-main.js',sources['settlement-main.js']),first=true;
  for(const [name,module,relative]of [['loadCivilianArt','civilian-art','civilian-art/civilian-original-normalized.glb'],['loadHeroArt','hero-art','blender-art/revision2/fighter-rust-refined-normalized.glb']]){
   main=replace(main,`import {${name}} from './${module}.js';`,`${first?"import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'; import fs from 'node:fs';":''}
    async function ${name}(rig){
     const glb=fs.readFileSync(${JSON.stringify(path.join(root,relative))});
     const loader=new GLTFLoader();loader.register(()=>({name:'NativeTextureAdapter',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
     const gltf=await loader.parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');gltf.scene.updateMatrixWorld(true);
     let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});let error=0;
     mesh.skeleton.bones.forEach((bone,i)=>{if(bone.name!==rig.restBones[i].name)throw Error('Bind name mismatch');bone.matrixWorld.elements.forEach((x,k)=>error=Math.max(error,Math.abs(x-rig.restBones[i].bindMatrix.elements[k])));});
     if(error>.0001)throw Error('Bind matrix mismatch');return{geometry:mesh.geometry,materials:[mesh.material,mesh.material.clone()],maxBindError:error};
    }`);first=false;
  }
  main=replace(main,"new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'})",'new globalThis.RendererFixture(THREE)');
  main=replace(main,'start().catch(e=>{console.error(e);window.SETTLEMENTERROR=String(e.stack||e);});','export const ready=start(); export {render,advanceSimulation};');
  const file=path.join(out,mode+'.mjs');
  await esbuild.build({stdin:{contents:main,resolveDir:path.join(root,'src'),sourcefile:'performance-main.js'},bundle:true,platform:'node',format:'esm',outfile:file,plugins:[{name:'exact-source-and-counters',setup(build){build.onLoad({filter:/\.js$/},args=>{if(path.dirname(args.path)!==path.join(root,'src'))return;const name=path.basename(args.path);return{contents:instrument(name,sources[name]),loader:'js'};});}}]});
  const bundle=fs.readFileSync(file,'utf8'),snapshotLine=bundle.slice(0,bundle.search(/function snapshot\(events\d* = \[\]\)/)).split('\n').length-1;
  fs.writeFileSync(path.join(out,mode+'-identity.json'),JSON.stringify({mode,baselineSource:baseline,baselineDeployment:'02e7fdeff0d856b9c7868bfe75051258d3469c2a',sourceHashes:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,hash(s)])),bundleSHA256:hash(bundle),snapshotLine,adapters:['Original GLBs with empty texture decode; no GPU','Mock DOM and WebXR; native Rapier','Read-only counters inserted in memory','Export render/advanceSimulation for deterministic tests']},null,2));
  console.log(mode+' performance fixture built');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
