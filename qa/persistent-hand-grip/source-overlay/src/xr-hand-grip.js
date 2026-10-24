// Ownership is independent of pose availability and XRInputSource identity.
// A gap invalidates gesture/throw evidence; it never means that fingers opened.
export function createHandGrip(){
 let phase='idle',openSamples=0,openSince=null,settledSince=null,lastSampleAt=null;
 return{
  get phase(){return phase;},
  get held(){return phase!=='idle';},
  begin(now){phase=Number.isFinite(now)?'held':'recovering';openSamples=0;openSince=null;settledSince=null;lastSampleAt=Number.isFinite(now)?now:null;},
  clear(){phase='idle';openSamples=0;openSince=null;settledSince=null;lastSampleAt=null;},
  suspend(){if(phase!=='idle')phase='suspended';openSamples=0;openSince=null;settledSince=null;lastSampleAt=null;},
  freezeMotion(){if(phase!=='idle')phase='recovering';settledSince=null;},
  sample(gap,now,settled){
   if(phase==='idle')return{release:false,sampleThrow:false};
   if(!Number.isFinite(gap)||!Number.isFinite(now)){this.suspend();return{release:false,sampleThrow:false};}
   if(lastSampleAt!==null&&now<=lastSampleAt)return{release:false,sampleThrow:false};
   // Physics time can stop during a callback stall. Throw freshness must use XR
   // timestamps, independently of ownership and positively observed opening.
   // Sparse valid open samples may still release, but cannot add an old impulse.
   if(lastSampleAt!==null&&now-lastSampleAt>50){phase='recovering';settledSince=null;}
   lastSampleAt=now;
   if(phase==='suspended')phase='recovering';
   // Close uses 22 mm in updatePinch. Release needs unmistakable 45 mm opening,
   // at least three fresh samples and 60 ms of continuous evidence. Ambiguous
   // fast-motion estimates and tracking gaps cannot advance this confirmation.
   if(gap>.045){if(openSince===null||now<openSince){openSince=now;openSamples=0;}openSamples++;}
   else{openSince=null;openSamples=0;}
   if(phase==='recovering'){
    if(!settled)settledSince=null;
    else if(settledSince===null||now<settledSince)settledSince=now;
    else if(now-settledSince>=80)phase='held';
   }
   return{release:openSamples>=3&&now-openSince>=60,sampleThrow:phase==='held'};
  },
  snapshot(){return{phase,openSamples,openSince,settledSince,lastSampleAt};},
 };
}
