/** Bounded waypoint planning for registered village actors.
 * Only replaces an intent's next target after finding a complete supported route.
 * Motion still owns all bodies, speed/turn limits, collision, spacing and grabs.
 */
import {supportedCivilianPoint,supportedCivilianRoot,supportedCivilianHeight} from './civilian-ground-point.js';
export function createCivilianNavigation({THREE, RAPIER, sim, motion, environment}) {
  const world = sim.world, support = environment.support, inBounds = environment.inBounds;
  const STEP = .65, RADIUS = .72, SAMPLE = .30, SKIN = .025;
  const QUERY_BUDGET = 120, MAX_EXPANSIONS = 2200, MAX_SEARCH_AGE = 4;
  const shape = new RAPIER.Capsule(.60, RADIUS), rotation = new THREE.Quaternion();
  const center = p => ({x:p.x, y:p.y + 1.38, z:p.z});
  const distance = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
  const reachDistance = (point, target) => Math.hypot(point.x-target.x,point.z-target.z,
    Number.isFinite(target.y)?point.y-target.y:0);
  const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
  const goalRadius = intent => Number.isFinite(intent.goalRadius) ? Math.max(0,Math.min(2.5,intent.goalRadius)) : 0;
  // Optional second reach sphere comes from the job contract. A source slot
  // is usable only where both the slot and the actual source are in reach.
  const regionKey=intent=>JSON.stringify(intent.goalRegion??null);
  const inRegion=(point,intent)=>!intent.goalRegion || (finite(intent.goalRegion.center) &&
    Number.isFinite(intent.goalRegion.radius) && intent.goalRegion.radius>=0 &&
    reachDistance(point,intent.goalRegion.center)<=intent.goalRegion.radius+1e-7);
  const records = new Map(), ground = new Set(), states = new Map();
  const limits = environment.arena?.stats?.halfExtents || [15, 12];
  const bounds = environment.bounds ?? {minX:-limits[0], maxX:Math.max(limits[0], (environment.beacon?.x ?? 19.2)+3),
    minZ:-limits[1], maxZ:limits[1]};
  let topologyKey = '', clock = 0, cursor = 0, lastQueries = 0, plans = 0, failures = 0;
  const groundPoint = (x,z) => supportedCivilianPoint(environment,x,z);
  function obstacle(c, intent, collider) {
    if (ground.has(collider.handle) || collider.isSensor()) return false;
    const owner = sim.colliderOwners?.get(collider.handle);
    if (owner?.character === c) return false;
    const ignoredBody = intent.ignoreBody;
    if (ignoredBody != null && collider.parent()?.handle ===
      (typeof ignoredBody === 'number' ? ignoredBody : ignoredBody.handle)) return false;
    const ignored = intent.ignoreColliders;
    if (ignored && (ignored.has?.(collider.handle) || ignored.has?.(collider) ||
      ignored.includes?.(collider.handle) || ignored.includes?.(collider))) return false;
    // Same active-civilian exception as motion. Interrupted/entering/get-up
    // bodies stay obstacles; ordinary worker traffic is handled after navigation.
    if (owner?.character && states.get(owner.character)?.available) return false;
    return true;
  }
  function* clearance(point, accept) {
    const hit = world.intersectionWithShape(center(point), rotation, shape,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, accept);
    yield;
    return !hit;
  }
  // Give-way routes must preserve the same planar neighbor spacing that motion
  // enforces. Native capsule queries intentionally omit available workers, so
  // apply this only to an explicit traffic escape, including every detour and
  // smoothing shortcut. An incidental overlap may escape without approaching.
  function neighbors(c) {
    return [...states].filter(([other,s])=>other!==c && s.available && finite(s.position))
      .map(([,s])=>({x:s.position.x,z:s.position.z}));
  }
  function neighborClear(a,b,others) {
    const dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
    return others.every(p=>{
      const x=a.x-p.x,z=a.z-p.z;
      const t=length2?Math.max(0,Math.min(1,-(x*dx+z*dz)/length2)):0;
      return Math.hypot(x+t*dx,z+t*dz)>=Math.min(1.45,Math.hypot(x,z))-1e-8;
    });
  }
  function* segment(a, b, accept, others=[]) {
    if(!neighborClear(a,b,others))return false;
    // Follow the actual terrain heights rather than a long straight 3-D chord.
    // Each short cast uses exactly the motion envelope, skin and filter contract.
    const length=distance(a,b),steps = Math.max(1, Math.ceil(length/SAMPLE));
    // A coarse native sweep is continuous for obstacles, but terrain support
    // is a sampled footprint predicate. Its narrow forbidden slope bands can
    // fall wholly between the .30m cast endpoints. Check support at skin-sized
    // intervals too, or motion correctly stops at a band while every replan
    // approves the same impossible segment. These are terrain reads, not
    // extra native queries; all collision casts keep their shared budget.
    const supportSteps=Math.max(1,Math.ceil(length/SKIN));
    let fullSupport=supportedCivilianHeight(environment,a.x,a.z)!==null;
    for(let i=1;i<=supportSteps;i++){
      const t=i/supportSteps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      if(supportedCivilianHeight(environment,x,z)!==null)fullSupport=true;
      else if(fullSupport || length*t>1.4 || !supportedCivilianRoot(environment,x,z))return false;
    }
    let previous = a;fullSupport=supportedCivilianHeight(environment,a.x,a.z)!==null;
    // A physically recovered root can have the old narrow foot support.
    // Admit only a short, native-swept connector into the full footprint.
    // Every normal grid point and all later segments still need full support.
    for (let i=1; i<=steps; i++) {
      const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      let p=groundPoint(x,z);
      if(p)fullSupport=true;
      else if(!fullSupport && distance(a,{x,z})<=1.4)p=supportedCivilianRoot(environment,x,z);
      if(!p)return false;
      const delta = {x:p.x-previous.x,y:p.y-previous.y,z:p.z-previous.z};
      const hit = world.castShape(center(previous), rotation, delta, shape, SKIN, 1, false,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, accept);
      yield;
      if (hit && hit.time_of_impact < 1) return false;
      previous = p;
    }
    return true;
  }
  // A tiny binary heap keeps the bounded grid search from doing quadratic scans.
  function push(heap, item) {
    let i=heap.length; heap.push(item);
    while (i>0) {const p=(i-1)>>1;if (heap[p].f<=item.f) break;heap[i]=heap[p];i=p;}
    heap[i]=item;
  }
  function pop(heap) {
    const first=heap[0], last=heap.pop();
    if (heap.length) {let i=0;while (i*2+1<heap.length) {let c=i*2+1;if (c+1<heap.length && heap[c+1].f<heap[c].f)c++;
      if (heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}
    return first;
  }
  function* planAtResolution(c, intent, origin, target, STEP) {
    const accept = collider => obstacle(c,intent,collider);
    // A bounded search uses one actual-position snapshot. Its next segment is
    // checked again against fresh neighbors before motion may follow it.
    const others=intent.giveWay?neighbors(c):[];
    const start = groundPoint(origin.x,origin.z)||supportedCivilianRoot(environment,origin.x,origin.z), radius=goalRadius(intent);
    if (!start) return null;
    // A job may permit an approach stance inside a genuine reach circle.
    // Every sampled stance still needs the whole capsule's native clearance;
    // neighboring resources receive no exception from the obstacle predicate.
    const candidates=[{...target}],goals=[],seen=new Set();
    if(radius>0) {
      const angle=Math.atan2(start.z-target.z,start.x-target.x);
      candidates.push({x:target.x+Math.cos(angle)*radius,z:target.z+Math.sin(angle)*radius});
      if(distance(start,target)<=radius)candidates.push(start);
      for(const ring of [.5,.9,1])for(let i=0;i<16;i++)candidates.push({
        x:target.x+Math.cos(i*Math.PI/8)*radius*ring,z:target.z+Math.sin(i*Math.PI/8)*radius*ring});
    }
    candidates.sort((a,b)=>distance(start,a)-distance(start,b)||a.x-b.x||a.z-b.z);
    for(const candidate of candidates) {
      const key=`${candidate.x.toFixed(5)},${candidate.z.toFixed(5)}`;
      if(seen.has(key))continue;seen.add(key);
      const point=groundPoint(candidate.x,candidate.z);
      if(point && (!radius || reachDistance(point,target)<=radius+1e-7) && inRegion(point,intent) &&
        (yield* clearance(point,accept)))goals.push(point);
    }
    if(!goals.length)return null;
    const exact=goals.find(goal=>distance(goal,target)<1e-6);
    if(exact && (yield* segment(start,exact,accept,others)))return [exact];
    for(const goal of goals.filter(goal=>goal!==exact).slice(0,4))
      if(yield* segment(start,goal,accept,others))return [goal];
    const estimate=point=>Math.min(...goals.map(goal=>distance(point,goal)));
    const open=[], nodes=new Map(), checked=new Map(), edges=new Map();
    const key=(x,z)=>`${x},${z}`;
    function* at(x,z) {
      const k=key(x,z);
      if (checked.has(k))return checked.get(k);
      const px=x*STEP,pz=z*STEP;
      let p = px<bounds.minX || px>bounds.maxX || pz<bounds.minZ || pz>bounds.maxZ ? null : groundPoint(px,pz);
      if (p && !(yield* clearance(p,accept)))p=null;
      checked.set(k,p); return p;
    }
    function* edge(a,b) {
      const k=intent.giveWay?`${a.key}/${b.key}`:a.key<b.key?`${a.key}/${b.key}`:`${b.key}/${a.key}`;
      if (!edges.has(k)) edges.set(k,yield* segment(a.point,b.point,accept,others));
      return edges.get(k);
    }
    // Connect from the exact root, including a root lying between grid cells.
    // Trying a small ring also permits a valid outward sweep from incidental
    // overlap; it grants no exemption from the native stop-at-penetration rule.
    const sx=Math.round(start.x/STEP),sz=Math.round(start.z/STEP);
    const seeds=[];
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)seeds.push([sx+dx,sz+dz]);
    seeds.sort((a,b)=>Math.hypot(a[0]*STEP-start.x,a[1]*STEP-start.z)-Math.hypot(b[0]*STEP-start.x,b[1]*STEP-start.z));
    for (const [x,z] of seeds) {
      const point=yield* at(x,z);
      if (!point || !(yield* segment(start,point,accept,others)))continue;
      const k=key(x,z),g=distance(start,point),node={key:k,x,z,point,g,parent:null,closed:false};
      nodes.set(k,node);push(open,{node,g,f:g+estimate(point)});
    }
    let expanded=0, found=null,goal=null;
    while(open.length && expanded++<MAX_EXPANSIONS) {
      const item=pop(open), node=item.node;
      if (node.closed || item.g!==node.g)continue;
      node.closed=true;
      for(const candidate of goals)if(distance(node.point,candidate)<STEP*1.5 &&
        (yield* segment(node.point,candidate,accept,others))){found=node;goal=candidate;break;}
      if(found)break;
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) {
        if (!dx && !dz)continue;
        const x=node.x+dx,z=node.z+dz,k=key(x,z);
        let next=nodes.get(k);
        if (next?.closed)continue;
        const point=next?.point || (yield* at(x,z));
        if(!point)continue;
        if(!next){next={key:k,x,z,point,g:Infinity,parent:null,closed:false};nodes.set(k,next);}
        const g=node.g+distance(node.point,point);
        if (g>=next.g || !(yield* edge(node,next)))continue;
        next.g=g;next.parent=node;push(open,{node:next,g,f:g+estimate(point)});
      }
    }
    if (!found)return null;
    const raw=[goal];for(let n=found;n;n=n.parent)raw.push(n.point);raw.push(start);raw.reverse();
    // Bounded line-of-sight smoothing. Every shortcut is a native capsule sweep
    // with the same terrain sampling as the grid edges.
    const route=[];
    for(let i=0;i<raw.length-1;) {
      let next=i+1;
      for(let j=Math.min(raw.length-1,i+8);j>i+1;j--)if(yield* segment(raw[i],raw[j],accept,others)){next=j;break;}
      route.push(raw[next]);i=next;
    }
    return route;
  }
  function* localPlan(c,intent,origin,target) {
    const ordinary=yield* planAtResolution(c,intent,origin,target,STEP);
    if(ordinary)return ordinary;
    // Same native casts, shared query budget and whole-search deadline.
    const fine=yield* planAtResolution(c,intent,origin,target,STEP/2);
    if(fine || !intent.giveWay)return fine;
    // A carried neighbor beside a physical bridge pier can leave a real but
    // sub-grid passing lane. Refine only explicit traffic escapes, retaining
    // the same native query cap, expansion limit and overall search deadline.
    return yield* planAtResolution(c,intent,origin,target,STEP/4);
  }
  function regionEdges(from,to) {
    if(from===to)return [];
    const queue=[{id:from,path:[]}],seen=new Set([from]);
    for(let i=0;i<queue.length;i++)for(const edge of environment.connections??[]) {
      if(!edge.complete)continue;
      const next=edge.from===queue[i].id?edge.to:edge.to===queue[i].id?edge.from:null;
      if(!next||seen.has(next))continue;
      const path=[...queue[i].path,{edge,reverse:edge.to===queue[i].id}];
      if(next===to)return path;seen.add(next);queue.push({id:next,path});
    }
    return null;
  }
  function* plan(c,intent,origin,target) {
    if(!environment.regionAt||!environment.connections)return yield* localPlan(c,intent,origin,target);
    const from=environment.regionAt(origin.x,origin.z),to=environment.regionAt(target.x,target.z);
    if(!from||!to)return null;
    const originEdge=environment.connectionAt?.(origin.x,origin.z),targetEdge=environment.connectionAt?.(target.x,target.z);
    // Bridge stances belong to the adjoining corridor, not only its declared
    // from-region. A short give-way or midspan reversal must not be sent to
    // the far bank and back through an occupied portal.
    if((originEdge?.complete && [originEdge.from,originEdge.to].includes(to))
      || (targetEdge?.complete && [targetEdge.from,targetEdge.to].includes(from)))
      return yield* localPlan(c,intent,origin,target);
    const edges=regionEdges(from,to);
    // Physical support on a partial deck never unlocks automatic travel.
    if(!edges)return null;
    if(!edges.length)return yield* localPlan(c,intent,origin,target);
    // Solve one bounded native route between authored portals at a time. This
    // avoids exhausting a fine grid over all three islands, while each segment
    // retains full support, collision, neighbor and source-reach validation.
    const route=[],points=[];
    for(const {edge,reverse} of edges) {
      const a=edge.endpoints?.[reverse?'to':'from'],b=edge.endpoints?.[reverse?'from':'to'];
      if(!finite(a)||!finite(b))return null;
      const onEdge=edge.support(origin.x,origin.z)>-20;
      const portalRadius=Math.max(0,Math.min(.9,(edge.width??1.64)/2-RADIUS-.1));
      if(!onEdge||points.length)points.push({...a,portalRadius});
      points.push({...b,portalRadius});
    }
    let start=origin;
    for(const point of points) {
      if(distance(start,point)<.04)continue;
      const record=records.get(c);if(record)record.segmentGoal={...point};
      const piece=yield* localPlan(c,{...intent,goalRadius:point.portalRadius,goalRegion:null},start,point);
      if(!piece?.length)return null;route.push(...piece);start=piece.at(-1);
    }
    const record=records.get(c);if(record)record.segmentGoal={...target};
    const final=yield* localPlan(c,intent,start,target);
    return final?[...route,...final]:null;
  }
  function sameGoal(r, intent) {
    const heightMatches=Number.isFinite(r.goal.y)===Number.isFinite(intent.target.y) &&
      (!Number.isFinite(r.goal.y) || Math.abs(r.goal.y-intent.target.y)<.03);
    return r.goalRegionKey===regionKey(intent) && heightMatches && distance(r.goal,intent.target)<(goalRadius(intent)>0?.03:.16) && r.goalRadius===goalRadius(intent) && r.ignoreBody===intent.ignoreBody &&
      r.ignoreColliders===intent.ignoreColliders && r.giveWay===!!intent.giveWay;
  }
  function begin(r, c, intent, position) {
    r.goal={x:intent.target.x,z:intent.target.z};if(Number.isFinite(intent.target.y))r.goal.y=intent.target.y;
    r.goalRadius=goalRadius(intent);r.ignoreBody=intent.ignoreBody;r.ignoreColliders=intent.ignoreColliders;r.giveWay=!!intent.giveWay;
    r.goalRegionKey=regionKey(intent);r.goalRegion=intent.goalRegion?{center:{...intent.goalRegion.center},radius:intent.goalRegion.radius}:null;
    r.supportEscape=!groundPoint(position.x,position.z);
    r.search=plan(c,{...intent,goalRegion:r.goalRegion}, {...position},r.goal);r.started=clock;r.nextPlan=clock+.65;r.route=null;
    r.reason='planning';r.blockedFor=0;
  }
  function update(dt, intents) {
    if (!Number.isFinite(dt) || dt<=0 || !intents?.entries)return;
    clock+=Math.min(dt,.1);lastQueries=0;
    const topology=(environment.connections??[]).map(edge=>`${edge.id}:${edge.complete}:${edge.delivered??0}`).join('|');
    if(topology!==topologyKey){records.clear();topologyKey=topology;}
    ground.clear();for(const collider of environment.groundColliders || [])ground.add(typeof collider==='number'?collider:collider.handle);
    states.clear();for(const c of sim.characters || [])states.set(c,motion.status(c));
    const pending=[];
    for(const [c,intent] of intents) {
      const s=states.get(c) || motion.status(c);states.set(c,s);
      if (!s.available || !finite(s.position) || !finite(intent?.target) || intent.activity==='work') {records.delete(c);continue;}
      let r=records.get(c);
      if(!r){r={goal:{x:Infinity,z:Infinity},route:null,search:null,nextPlan:0,blockedFor:0,reason:'new'};records.set(c,r);}
      const changed=!sameGoal(r,intent), arrived=distance(s.position,intent.target)<=Math.max(.02,intent.stopDistance??.1) &&
        (!goalRadius(intent) || reachDistance(s.position,intent.target)<=goalRadius(intent)) && inRegion(s.position,intent);
      r.blockedFor=s.blocked?r.blockedFor+Math.min(dt,.1):0;
      if(arrived){r.route=null;r.search=null;r.reason='arrived';continue;}
      if(r.giveWay && r.route?.length) {
        while(r.route.length>1 && distance(s.position,r.route[0])<SKIN)r.route.shift();
        if(!neighborClear(s.position,r.route[0],neighbors(c))) {
          r.route=null;r.search=null;r.nextPlan=0;r.reason='neighbor-moved';
        }
      }
      if(changed || (!r.search && clock>=r.nextPlan && (!r.route || r.blockedFor>.3)))begin(r,c,intent,s.position);
      if(r.search && clock-r.started>MAX_SEARCH_AGE){r.search=null;r.route=null;r.nextPlan=clock+1;r.reason='search-timeout';failures++;}
      if(r.search)pending.push([c,r]);
    }
    // Round-robin work slices: at most 120 native queries for all registered workers
    // together in one update, irrespective of the size of an unreachable area.
    while(pending.length && lastQueries<QUERY_BUDGET) {
      cursor%=pending.length;const [c,r]=pending[cursor];let done=false;
      for(let i=0;i<12 && lastQueries<QUERY_BUDGET;i++) {
        const step=r.search.next();
        if(step.done){r.search=null;r.route=step.value;r.nextPlan=clock+(r.route?.length? .65:1.2);r.reason=r.route?'route':'no-route';
          if(r.route)plans++;else failures++;done=true;break;}
        lastQueries++;
      }
      if(done)pending.splice(cursor,1);else cursor++;
    }
    for(const [c,intent] of intents) {
      const r=records.get(c),s=states.get(c);
      if(!s?.available || !r)continue;
      if(!r.route?.length) {
        // A pending or failed search has not approved the raw target. Keep
        // the physical root stationary until a complete native route exists.
        if(r.reason!=='arrived')intents.set(c,{...intent,target:{...s.position},stopDistance:.02,
          navigationBlocked:r.giveWay || ['no-route','search-timeout','neighbor-moved'].includes(r.reason)});
        continue;
      }
      // Even sub-threshold target drift must not leave the final stance outside
      // the current reach sphere while a cached route is being followed.
      if((r.goalRadius>0 && reachDistance(r.route.at(-1),intent.target)>r.goalRadius+1e-7) || !inRegion(r.route.at(-1),intent)) {
        r.route=null;r.nextPlan=0;r.reason='goal-moved';
        intents.set(c,{...intent,target:{...s.position},stopDistance:.02});continue;
      }
      // Consume only reached points; do not cut untested corners or invent a
      // lateral nudge. Small waypoint stops keep motion's own speed cap intact.
      while(r.route.length>1 && distance(s.position,r.route[0])<SKIN)r.route.shift();
      if(r.giveWay && !neighborClear(s.position,r.route[0],neighbors(c))) {
        r.route=null;r.nextPlan=0;r.reason='neighbor-moved';continue;
      }
      const final=r.route.length===1,point=r.route[0];
      if(!final || r.goalRadius>0 || distance(point,intent.target)>.001 || r.supportEscape)
        intents.set(c,{...intent,target:{...point},stopDistance:.02,supportEscape:r.supportEscape});
    }
  }
  return {update, state:()=>({queries:lastQueries,queryBudget:QUERY_BUDGET,plans,failures,
    workers:[...records].map(([c,r])=>({id:c.id,reason:r.reason,goal:{...r.goal},goalRadius:r.goalRadius,goalRegion:r.goalRegion,segmentGoal:r.segmentGoal??null,giveWay:!!r.giveWay,supportEscape:!!r.supportEscape,
      route:r.route?.map(p=>({...p}))??null,searching:!!r.search,blockedFor:r.blockedFor}))}),
    dispose(){records.clear();states.clear();}};
}
