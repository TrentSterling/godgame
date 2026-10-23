import * as T from 'three';
import {FONT} from './gpu-hud.js';

// Callback cadence, not GPU duration or the headset's configured refresh rate.
// A fixed ring avoids sample allocations. Hidden sessions and >1s interruptions
// begin a new window; ordinary long frames remain in the measured average.
export function createFrameCadence({windowMs=1000,maxGapMs=1000,capacity=240}={}){
 const intervals=new Float64Array(capacity);
 let last=null,mode=null,head=0,count=0,sum=0,calls=null,resets=0,totalCallbacks=0;
 function reset(){last=null;head=0;count=0;sum=0;calls=null;resets++;}
 return{
  sample(now,{xr=false,visible=true}={}){
   totalCallbacks++;
   const nextMode=xr?'XR':'DESKTOP';
   if(mode!==nextMode){reset();mode=nextMode;}
   if(!visible||!Number.isFinite(now)){reset();return;}
   if(last===null){last=now;return;}
   const dt=now-last;last=now;
   if(dt<=0||dt>maxGapMs){reset();last=now;return;}
   if(count===capacity){sum-=intervals[head];head=(head+1)%capacity;count--;}
   intervals[(head+count)%capacity]=dt;count++;sum+=dt;
   while(count>1&&sum-intervals[head]>=windowMs){sum-=intervals[head];head=(head+1)%capacity;count--;}
  },
  setCalls(value){calls=Number.isFinite(value)&&value>=0?Math.round(value):null;},
  reset,
  read(out={}){out.mode=mode;out.frameMs=count?sum/count:null;out.fps=count?1000*count/sum:null;out.calls=calls;out.intervals=count;out.sampleSpanMs=sum;out.resets=resets;out.callbacks=totalCallbacks;return out;},
 };
}

const UPDATE_MS=250,MAX_COLUMNS=27,MAX_LINES=3,PIXEL=.0021;
// Three short lines plus one opaque backing quad, all in one draw per eye.
const MAX_VERTICES=(MAX_COLUMNS*MAX_LINES*21+1)*6;
const INK=new T.Color('#e6f6ed'),PAPER=new T.Color('#13252d');

/** Supply a viewer matrix in reference-space metres. The caller owns current
 * tracking validity and the bounded policy for retaining that matrix. */
export function createPerformanceMonitor({scene,document:doc=globalThis.document}={}){
 const cadence=createFrameCadence(),stats={},sampleOptions={xr:false,visible:true},positions=new Float32Array(MAX_VERTICES*3),colors=new Float32Array(MAX_VERTICES*3);
 for(let i=0;i<MAX_VERTICES;i++){const ink=i<6?PAPER:INK;colors[i*3]=ink.r;colors[i*3+1]=ink.g;colors[i*3+2]=ink.b;}
 const geometry=new T.BufferGeometry(),positionAttribute=new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage),colorAttribute=new T.BufferAttribute(colors,3);
 geometry.setAttribute('position',positionAttribute);geometry.setAttribute('color',colorAttribute);geometry.setDrawRange(0,0);
 const material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false});
 const mesh=new T.Mesh(geometry,material);mesh.name='Callback performance monitor';mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;mesh.renderOrder=10000;mesh.visible=false;
 // A noninteractive diagnostic overlay above the hands, at a stable binocular
 // depth. It has no ray target, shadow pass, texture or separate render pass.
 mesh.raycast=()=>{};scene?.add(mesh);
 // Keep the panel above the tabletop setup menu. Even its three-line dropout
 // form fits inside a 65-degree vertical field of view at this binocular depth.
 const localOffset=new T.Matrix4().makeTranslation(0,.45,-.8),inverseScene=new T.Matrix4();
 const desktopTop=()=>(doc?.defaultView?.innerWidth??globalThis.innerWidth??1280)<=650?'104px':'56px';
 const element=doc?.createElement('div');
 if(element){
  element.id='performance-monitor';element.setAttribute('aria-live','off');element.setAttribute('aria-label','Performance: animation callback cadence and draw calls');
  element.title='Measured animation callback cadence and complete-frame draw calls. Frame interval is not GPU time.';
  Object.assign(element.style,{position:'fixed',right:'8px',top:desktopTop(),zIndex:'10000',pointerEvents:'none',userSelect:'none',whiteSpace:'pre',font:'12px/1.35 ui-monospace, monospace',fontVariantNumeric:'tabular-nums',padding:'5px 7px',borderRadius:'4px',background:'#13252d',color:'#e6f6ed',maxWidth:'calc(100vw - 16px)',boxSizing:'border-box'});
  doc.body?.appendChild(element);
 }
 let now=0,xr=false,visible=true,nextUpdate=-Infinity,key='',updates=0,tracking='tracked',disposed=false;
 function writeText(text){
  let vertex=0;
  const quad=(x,y,w,h,z)=>{
   for(let i=0;i<6;i++){
    const right=i===1||i===2||i===4,bottom=i===2||i===4||i===5,at=vertex++*3;
    positions[at]=x+(right?w:0);positions[at+1]=y-(bottom?h:0);positions[at+2]=z;
   }
  };
  const lines=text.split('\n'),width=Math.max(...lines.map(line=>line.length))*6*PIXEL,top=lines.length*9*PIXEL/2;
  quad(-width/2-.008,top+.006,width+.016,lines.length*9*PIXEL+.010,-.0005);
  for(let row=0;row<Math.min(lines.length,MAX_LINES);row++)for(let col=0;col<Math.min(lines[row].length,MAX_COLUMNS);col++){
   const glyph=FONT[lines[row][col]];if(!glyph)continue;
   // Adjacent source-font pixels share a quad without changing their outline.
   for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(glyph[y][x]==='1'){const start=x;while(x+1<5&&glyph[y][x+1]==='1')x++;quad(-width/2+(col*6+start)*PIXEL,top-(row*9+y)*PIXEL,(x-start+1)*PIXEL,PIXEL,0);}
  }
  geometry.setDrawRange(0,vertex);positionAttribute.clearUpdateRanges();positionAttribute.addUpdateRange(0,vertex*3);positionAttribute.needsUpdate=true;
 }
 function refresh(){
  if(now<nextUpdate)return;nextUpdate=now+UPDATE_MS;cadence.read(stats);
  const fps=stats.fps===null?'--':Math.min(999,stats.fps).toFixed(0),ms=stats.frameMs===null?'--':stats.frameMs.toFixed(1),draws=stats.calls===null?'--':Math.min(99999,stats.calls).toString();
  let text=`${xr?'XR':'DESKTOP'} CALLBACK ${fps} FPS\n${ms} MS ${draws} DRAWS`;
  if(xr&&tracking!=='tracked')text+='\n'+(tracking==='held'?'POSE HOLD':'TRACK LOST');
  if(text===key)return;key=text;updates++;
  if(element)element.textContent=text;
  writeText(text);
 }
 refresh();
 return{
  mesh,element,
  beginFrame(time,{xr:inXR=false,visible:isVisible=true}={}){
   if(disposed)return;now=Number.isFinite(time)?time:now;
   if(xr!==inXR||visible!==isVisible)nextUpdate=-Infinity;
   xr=inXR;visible=isVisible;sampleOptions.xr=xr;sampleOptions.visible=visible;cadence.sample(time,sampleOptions);
  },
  beforeRender({xr:inXR=xr,viewerMatrix=null,viewAvailable=true,tracking:poseState='tracked'}={}){
   if(disposed)return;
   if(xr!==inXR){xr=inXR;cadence.reset();nextUpdate=-Infinity;}
   tracking=poseState;mesh.visible=xr&&visible&&viewAvailable&&!!viewerMatrix;
   if(element){element.hidden=xr||!visible;if(!xr){const top=desktopTop();if(element.style.top!==top)element.style.top=top;}}
   if(mesh.visible){scene.updateWorldMatrix(true,false);inverseScene.copy(scene.matrixWorld).invert();mesh.matrix.copy(inverseScene).multiply(viewerMatrix).multiply(localOffset);mesh.matrixWorldNeedsUpdate=true;}
   refresh();
  },
  // renderer.info must cover all application passes. XR eye counts are already
  // in that counter; do not double them here. Displayed value is the last frame.
  endFrame(calls){if(!disposed)cadence.setCalls(calls);},
  reset(){cadence.reset();nextUpdate=-Infinity;},
  snapshot(){return{...cadence.read({}),text:key,updates,visible:mesh.visible,tracking,vertices:geometry.drawRange.count,geometryBytes:positions.byteLength+colors.byteLength,updatePeriodMs:UPDATE_MS,xrDrawsPerEye:1};},
  dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();element?.remove();},
 };
}
