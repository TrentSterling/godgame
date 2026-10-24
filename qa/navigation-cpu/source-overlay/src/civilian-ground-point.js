/** Full walking footprint shared by authored work slots and navigation.
 * This checks terrain support only. Native shape casts still own obstacles. */
const OFFSETS = Array.from({length:8}, (_, i) =>
  [Math.cos(i*Math.PI/4)*.72, Math.sin(i*Math.PI/4)*.72]);

// Height-only callers need the identical footprint test, not a discarded point.
export function supportedCivilianHeight(environment, x, z) {
  const {support, inBounds} = environment;
  const combined=environment.supportBounds?.support===support&&environment.supportBounds?.inBounds===inBounds;
  if (!combined&&!inBounds(x,z)) return null;
  const y = support(x,z);
  if (!Number.isFinite(y) || y < -20 || (combined&&y<=-20)) return null;
  for (let i=0;i<OFFSETS.length;i++) {
    const dx=OFFSETS[i][0],dz=OFFSETS[i][1];
    const h = support(x+dx,z+dz);
    if ((combined?h<=-20:!inBounds(x+dx,z+dz)) || !Number.isFinite(h) || Math.abs(h-y) >= .24) return null;
  }
  return y;
}
export function supportedCivilianPoint(environment, x, z) {
  const y=supportedCivilianHeight(environment,x,z);return y===null?null:{x,y,z};
}

/** Existing physical foot stance used by recovery. This is not an ordinary
 * route waypoint: a full-footprint connector is required before walking out. */
export function supportedCivilianRoot(environment,x,z) {
  const {support,inBounds}=environment;
  const combined=environment.supportBounds?.support===support&&environment.supportBounds?.inBounds===inBounds;
  if(!combined&&!inBounds(x,z))return null;
  const y=support(x,z);
  if(!Number.isFinite(y)||y < -20||(combined&&y<=-20))return null;
  for(const [dx,dz] of [[.47,0],[-.47,0],[0,.47],[0,-.47]]) {
    const h=support(x+dx,z+dz);
    if((combined?h<=-20:!inBounds(x+dx,z+dz))||!Number.isFinite(h)||Math.abs(h-y)>=.24)return null;
  }
  return {x,y,z};
}
