/** Named, genuinely walkable land and independent physical connections.
 * This registry owns no economy state. A completed edge connects exactly its
 * two regions; standing on a remote island still counts as local access.
 */
const finite=(...values)=>values.every(Number.isFinite);
export function polygonContains(polygon,x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i],dx=b[0]-a[0],dz=b[1]-a[1],cross=(x-a[0])*dz-(z-a[1])*dx;
    if(Math.abs(cross)<1e-7&&x>=Math.min(a[0],b[0])-1e-7&&x<=Math.max(a[0],b[0])+1e-7&&z>=Math.min(a[1],b[1])-1e-7&&z<=Math.max(a[1],b[1])+1e-7)return true;
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function polygonBounds(polygon){return{minX:Math.min(...polygon.map(p=>p[0])),maxX:Math.max(...polygon.map(p=>p[0])),minZ:Math.min(...polygon.map(p=>p[1])),maxZ:Math.max(...polygon.map(p=>p[1]))};}
export function createFlatLandRegion({id,name=id,center,outline,height=.175,role='village'}={}){
  if(typeof id!=='string'||!id||!center||!finite(center.x,center.z,height)||!Array.isArray(outline)||outline.length<3||outline.some(p=>!Array.isArray(p)||!finite(...p)||p.length!==2))throw new TypeError('A land region needs an id, finite center/height and polygon outline');
  const boundary=outline.map(([x,z])=>[center.x+x,center.z+z]),contains=(x,z)=>polygonContains(boundary,x,z),bounds=polygonBounds(boundary);
  return{id,name,role,center:{x:center.x,y:height,z:center.z},boundary,bounds,height,groundColliders:[],contains,support:(x,z)=>contains(x,z)?height:-50};
}
export function createLandRegionRegistry({regions,connections=[]}={}){
  if(!Array.isArray(regions)||!regions.length)throw new TypeError('At least one land region is required');
  const byId=new Map();for(const r of regions){if(!r?.id||byId.has(r.id)||typeof r.support!=='function'||typeof r.contains!=='function')throw new TypeError('Unique region ids and support/contains functions are required');byId.set(r.id,r);}
  for(const c of connections)if(!c.id||!byId.has(c.from)||!byId.has(c.to)||c.from===c.to||typeof c.support!=='function')throw new TypeError('Every connection needs distinct registered endpoints and physical support');
  if(new Set(connections.map(c=>c.id)).size!==connections.length)throw new TypeError('Connection ids must be unique');
  const bounds={minX:Math.min(...regions.map(r=>r.bounds.minX)),maxX:Math.max(...regions.map(r=>r.bounds.maxX)),minZ:Math.min(...regions.map(r=>r.bounds.minZ)),maxZ:Math.max(...regions.map(r=>r.bounds.maxZ))};
  const connectionAt=(x,z)=>{for(let i=0;i<connections.length;i++){const c=connections[i],y=c.support(x,z);if(Number.isFinite(y)&&y> -20)return c;}return null;};
  const regionAt=(x,z)=>regions.find(r=>r.contains(x,z))?.id??connectionAt(x,z)?.from??null;
  const support=(x,z)=>{if(!Number.isFinite(x)||!Number.isFinite(z))return -50;const c=connectionAt(x,z);if(c)return c.support(x,z);for(let i=0;i<regions.length;i++){const r=regions[i];if(r.contains(x,z))return r.support(x,z);}return -50;};
  const inBounds=(x,z)=>support(x,z)>-20;
  // Explicit identity contract: these bounds are exactly this support query.
  // Footprint callers can read once, but custom/replaced callbacks fall back to
  // both predicates. There is no cache to invalidate when a bridge is built.
  const supportBounds=Object.freeze({support,inBounds});
  function isConnected(from,to){
    if(!byId.has(from)||!byId.has(to))return false;if(from===to)return true;
    const visited=new Set([from]),queue=[from];
    for(let i=0;i<queue.length;i++)for(const c of connections){if(c.complete!==true)continue;const next=c.from===queue[i]?c.to:c.to===queue[i]?c.from:null;if(next==null||visited.has(next))continue;if(next===to)return true;visited.add(next);queue.push(next);}
    return false;
  }
  return{regions,connections,bounds,regionAt,connectionAt,support,inBounds,supportBounds,isConnected,canTravel:(from,to)=>!!from&&!!to&&isConnected(regionAt(from.x,from.z),regionAt(to.x,to.z)),getRegion:id=>byId.get(id)??null};
}

export const ARCHIPELAGO_LANDMARKS=Object.freeze({
  pantry:Object.freeze({x:8,z:1.7,regionId:'home'}),
  starterForage:Object.freeze({x:-5.5,z:3.2,regionId:'home'}),
  farmSource:Object.freeze({x:20,z:-.7,regionId:'farm'}),
  quarrySource:Object.freeze({x:2.5,z:-12.2,regionId:'quarry'}),
  quarryOffset:Object.freeze({x:1.5,z:-10.2}),
  quarryBrace:Object.freeze({x:7.2,z:-15.8,regionId:'quarry'}),
  farmBridgeSite:Object.freeze({x:9.5,z:-2,regionId:'home'}),
  recruit:Object.freeze({x:19.2,z:-2,regionId:'farm'}),
  recruitHome:Object.freeze({x:10.25,z:-2,regionId:'home'}),
  beacon:Object.freeze({x:21.1,z:-3.15,regionId:'farm'}),
});
export function createArchipelagoRegions(home){
  if(home?.id!=='home')throw new TypeError('The original home region is required');
  const quarry=createFlatLandRegion({id:'quarry',name:'Slatecut Island',role:'quarry',center:{x:2.5,z:-16},height:.13,outline:[[-5.8,0],[-5.4,-3],[-3.2,-5.6],[0,-6.4],[3.9,-5.8],[6,-3],[5.8,.7],[4.6,3.6],[2.4,5.7],[1.8,6.5],[-1.8,6.5],[-3.2,5.4],[-5.4,3.2]]});
  const farm=createFlatLandRegion({id:'farm',name:'Orchard Island',role:'farm',center:{x:22,z:-2},height:.175,outline:[[-4.2,-1.8],[-4.2,1.8],[-3.5,3.4],[-1.4,4.1],[1.9,3.7],[4,2.1],[4.4,-.6],[3.3,-3.3],[0,-4.2],[-2.6,-3.6]]});
  return[home,quarry,farm];
}
