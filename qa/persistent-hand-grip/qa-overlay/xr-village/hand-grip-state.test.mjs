import assert from 'node:assert/strict';
import {createHandGrip} from '../../src/xr-hand-grip.js';
const cases=[];
for(const gap of [.01,.022,.035,.045,.045001,.055]){
 const g=createHandGrip();g.begin(-10);assert(!g.sample(gap,0,true).release);assert(!g.sample(gap,30,true).release);assert(!g.sample(gap,59,true).release);assert.equal(g.sample(gap,60,true).release,gap>.045);cases.push({gap,boundary:60});
}
for(const missingAt of [0,30,59,60,160,1000,30000]){
 const g=createHandGrip();g.begin(-10);g.sample(.055,0,true);g.sample(.055,30,true);g.suspend();assert(g.held);assert(!g.sample(.055,missingAt+100,true).release);assert(!g.sample(.055,missingAt+130,true).release);const open=g.sample(.055,missingAt+160,true);assert(open.release);assert(!open.sampleThrow);cases.push({missingAt,retained:true});
}
{
 const g=createHandGrip();g.begin(-10);g.sample(.055,0,true);assert(!g.sample(.055,60,true).release);assert(!g.sample(.055,60,true).release);assert(g.sample(.055,61,true).release);
 g.suspend();assert(!g.sample(.01,100,false).sampleThrow);assert(!g.sample(.01,300,false).sampleThrow);assert(!g.sample(.01,400,true).sampleThrow);assert(!g.sample(.01,440,true).sampleThrow);assert(!g.sample(.01,479,true).sampleThrow);assert(g.sample(.01,480,true).sampleThrow);g.clear();assert(!g.held);cases.push({duplicateTimestampsIgnored:true,settledThrowBoundary:80});
}
for(const interval of [49,50,51,100,150]){
 const g=createHandGrip();g.begin(-10);g.sample(.055,0,true);g.sample(.055,30,true);const released=g.sample(.055,30+interval,true);assert(released.release);assert.equal(released.sampleThrow,interval<=50);assert(g.held);cases.push({interval,release:true,throwFresh:interval<=50});
}
for(const interval of [49,50,51,100,150]){
 const g=createHandGrip();g.begin(1000);assert.equal(g.sample(.01,1000+interval,true).sampleThrow,interval<=50);assert(g.held);cases.push({firstSampleInterval:interval,throwFresh:interval<=50});
}
{
 const g=createHandGrip();g.begin();assert(!g.sample(.01,100,true).sampleThrow);assert(!g.sample(.01,140,true).sampleThrow);assert(g.sample(.01,180,true).sampleThrow);cases.push({missingAcquisitionTimeStartsConservatively:true});
}
console.log(JSON.stringify({pass:true,suite:'hand-grip-state',cases:cases.length}));
