import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import * as T from 'three';
import {createFrameCadence,createPerformanceMonitor} from '../../src/performance-monitor.js';

const checks=[];
function check(name,fn){fn();checks.push(name);}
function close(a,b,epsilon=1e-8){assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);}
const cadence=createFrameCadence();
check('measured-72hz-callback-cadence',()=>{
 for(let i=0;i<=720;i++)cadence.sample(i*1000/72,{xr:true});
 const s=cadence.read();close(s.fps,72);close(s.frameMs,1000/72);assert(s.intervals<=73);assert(s.sampleSpanMs>=1000-1e-7);
});
check('desktop-xr-mode-transition-resets-window',()=>{
 cadence.sample(12000,{xr:false});assert.equal(cadence.read().fps,null);
 for(let i=1;i<=90;i++)cadence.sample(12000+i*1000/90,{xr:false});
 close(cadence.read().fps,90);assert.equal(cadence.read().mode,'DESKTOP');
});
check('irregular-interval-average-includes-long-frames',()=>{
 cadence.reset();cadence.sample(0);cadence.sample(10);cadence.sample(30);
 close(cadence.read().frameMs,15);close(cadence.read().fps,1000/15);
 cadence.sample(280);close(cadence.read().frameMs,280/3);close(cadence.read().fps,3000/280);
});
check('hidden-invalid-and-interrupted-callbacks-restart-measurement',()=>{
 cadence.setCalls(123);cadence.sample(300,{visible:false});assert.equal(cadence.read().fps,null);assert.equal(cadence.read().calls,null);
 cadence.sample(10000);cadence.sample(10000+1000/90);close(cadence.read().fps,90);
 cadence.sample(12000);assert.equal(cadence.read().fps,null);
 cadence.sample(12000);assert.equal(cadence.read().fps,null);
 cadence.sample(NaN);assert.equal(cadence.read().fps,null);
 cadence.sample(13000);cadence.sample(13010);close(cadence.read().fps,100);
});
check('calls-are-full-frame-count-without-eye-multiplier',()=>{
 cadence.setCalls(238);assert.equal(cadence.read().calls,238);cadence.setCalls(undefined);assert.equal(cadence.read().calls,null);
});

class Element{
 constructor(){this.style={};this.hidden=false;this.textContent='';this.children=[];}
 setAttribute(name,value){this[name]=value;}
 appendChild(child){this.children.push(child);child.parent=this;}
 remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const doc={createElement:()=>new Element(),body:new Element(),defaultView:{innerWidth:1280}},scene=new T.Scene();
scene.position.set(2,.7,-4);scene.rotation.set(0,.4,0);scene.scale.setScalar(.03);scene.updateMatrixWorld(true);
const viewer=new T.Matrix4().compose(new T.Vector3(.3,1.65,.2),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.2),new T.Vector3(1,1,1));
const monitor=createPerformanceMonitor({scene,document:doc}),geometry=monitor.mesh.geometry,position=geometry.getAttribute('position'),color=geometry.getAttribute('color'),buffer=position.array,colorBuffer=color.array,material=monitor.mesh.material;
check('single-preallocated-noninteractive-xr-overlay-preserves-metre-scale',()=>{
 monitor.beginFrame(0,{xr:true});monitor.beforeRender({xr:true,viewerMatrix:viewer});scene.updateMatrixWorld(true);
 const expected=viewer.clone().multiply(new T.Matrix4().makeTranslation(0,.45,-.8));
 monitor.mesh.matrixWorld.elements.forEach((v,i)=>close(v,expected.elements[i],1e-7));
 assert(monitor.mesh.visible);assert(monitor.element.hidden);assert.equal(scene.children.length,1);assert.equal(monitor.mesh.castShadow,false);
 assert.equal(material.depthWrite,false);assert.equal(material.toneMapped,false);assert.equal(material.map,null);assert.equal(geometry.groups.length,0);
 const hits=[];monitor.mesh.raycast(null,hits);assert.deepEqual(hits,[]);
 assert.equal(monitor.element.style.pointerEvents,'none');assert.equal(monitor.element['aria-live'],'off');
});
check('low-refresh-display-tracks-measured-values-and-pose-retention',()=>{
 for(let i=1;i<=144;i++){monitor.beginFrame(i*1000/72,{xr:true});monitor.beforeRender({xr:true,viewerMatrix:viewer});monitor.endFrame(238);}
 const s=monitor.snapshot();assert.match(s.text,/XR CALLBACK 72 FPS/);assert.match(s.text,/13\.9 MS 238 DRAWS/);assert(s.updates<=10);
 monitor.beginFrame(2300,{xr:true});monitor.beforeRender({xr:true,viewerMatrix:viewer,tracking:'held'});assert.match(monitor.snapshot().text,/POSE HOLD/);
 monitor.beginFrame(2600,{xr:true});monitor.beforeRender({xr:true,viewerMatrix:null,viewAvailable:false,tracking:'lost'});assert(!monitor.mesh.visible);assert.match(monitor.snapshot().text,/TRACK LOST/);
});
check('desktop-equivalent-does-not-add-a-render-draw-and-hidden-session-hides-both',()=>{
 monitor.beginFrame(3000,{xr:false});monitor.beforeRender({xr:false});assert(!monitor.mesh.visible);assert(!monitor.element.hidden);assert.match(monitor.element.textContent,/DESKTOP CALLBACK -- FPS/);
 monitor.beginFrame(3100,{xr:false,visible:false});monitor.beforeRender({xr:false});assert(monitor.element.hidden);assert(!monitor.mesh.visible);assert.equal(monitor.snapshot().fps,null);
});
check('desktop-monitor-clears-top-controls-and-mobile-xr-entry',()=>{
 doc.defaultView.innerWidth=1280;monitor.beforeRender({xr:false});assert.equal(monitor.element.style.top,'56px');assert(parseInt(monitor.element.style.top)>48);
 for(const width of [320,390,650]){doc.defaultView.innerWidth=width;monitor.beforeRender({xr:false});assert.equal(monitor.element.style.top,'104px');assert(parseInt(monitor.element.style.top)>95);}
 doc.defaultView.innerWidth=651;monitor.beforeRender({xr:false});assert.equal(monitor.element.style.top,'56px');doc.defaultView.innerWidth=1280;
});
let benchmark;
check('stable-buffers-material-and-bounded-refresh-over-20000-callbacks',()=>{
 const options={xr:true,visible:true},view={xr:true,viewerMatrix:viewer},before=monitor.snapshot().updates,start=performance.now();
 for(let i=0;i<20000;i++){monitor.beginFrame(4000+i*1000/90,options);monitor.beforeRender(view);monitor.endFrame(238+(i%2));}
 const durationMs=performance.now()-start,s=monitor.snapshot();
 assert.equal(monitor.mesh.geometry,geometry);assert.equal(geometry.getAttribute('position'),position);assert.equal(position.array,buffer);assert.equal(geometry.getAttribute('color'),color);assert.equal(color.array,colorBuffer);assert.equal(monitor.mesh.material,material);
 assert(s.updates-before<=Math.ceil(20000*1000/90/250)+2);assert(s.vertices>6);assert(s.vertices<=buffer.length/3);assert.equal(color.version,0);assert(s.geometryBytes<250000);
 for(let i=0;i<s.vertices*3;i++)assert(Number.isFinite(buffer[i]));
 benchmark={callbacks:20000,cpuDurationMs:+durationMs.toFixed(3),cpuMicrosecondsPerCallback:+(durationMs*1000/20000).toFixed(3),displayChanges:s.updates-before,geometryBytes:s.geometryBytes,visibleTriangles:s.vertices/3,xrDrawsPerEye:s.xrDrawsPerEye};
});
check('three-line-xr-monitor-fits-65-degree-view-above-initial-menu',()=>{
 monitor.beginFrame(400000,{xr:true});monitor.beforeRender({xr:true,viewerMatrix:viewer,tracking:'held'});scene.updateMatrixWorld(true);assert.match(monitor.snapshot().text,/POSE HOLD/);
 const local=viewer.clone().invert().multiply(monitor.mesh.matrixWorld),camera=new T.PerspectiveCamera(65,1280/720,.05,10),p=new T.Vector3();let minY=Infinity,maxY=-Infinity;
 for(let i=0;i<geometry.drawRange.count;i++){p.fromBufferAttribute(position,i).applyMatrix4(local).project(camera);assert(Math.abs(p.x)<1);assert(Math.abs(p.y)<1);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
 assert(minY>.81,'Bottom remains above initial menu top (around0.806 NDC)');assert(maxY<.96,'Diagnostic line retains top margin');
});
check('dispose-detaches-owned-ui-and-geometry',()=>{monitor.dispose();monitor.dispose();assert.equal(scene.children.length,0);assert.equal(doc.body.children.length,0);});
console.log(JSON.stringify({pass:true,scope:'CPU sampling and production geometry; no GPU or Quest timing claim',checks,benchmark},null,2));
