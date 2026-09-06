// Ground-plane collision geometry; units are metres. No rendering dependency.
export function inside(p, poly) {
  let result=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if(((a[1]>p[1])!==(b[1]>p[1])) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) result=!result;
  }
  return result;
}
export function distanceSegment(p,a,b) {
  const x=b[0]-a[0],z=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*z)/(x*x+z*z||1)));
  return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*z);
}
export function overlaps(p,r,poly) {
  if(inside(p,poly))return true;
  return poly.some((a,i)=>distanceSegment(p,a,poly[(i+1)%poly.length])<r-1e-6);
}
export function footprint(a,b,thickness=.055) {
  const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
  const x=-dz/l*thickness/2,z=dx/l*thickness/2;
  return [[a[0]+x,a[1]+z],[b[0]+x,b[1]+z],[b[0]-x,b[1]-z],[a[0]-x,a[1]-z]];
}
export function doorSegments(d,t) {
  const dx=d.b[0]-d.a[0],dz=d.b[1]-d.a[1];
  if(d.type==='hinge') {
    // Three.js rotation about positive Y turns X towards negative Z.
    const c=Math.cos(d.delta*t),s=Math.sin(d.delta*t);
    return [[d.a,[d.a[0]+dx*c+dz*s,d.a[1]+dz*c-dx*s]]];
  }
  if(d.type==='slide')return [[[d.a[0]+d.slide[0]*t,d.a[1]+d.slide[1]*t],[d.b[0]+d.slide[0]*t,d.b[1]+d.slide[1]*t]]];
  const n=d.panels,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
  return Array.from({length:n},(_,i)=>{
    // Optional parking index puts the whole stack beyond the opening.
    const k=(i+((d.stackIndex??n-1)-i)*t)/n,off=(d.trackOffset??0)+(i-(n-1)/2)*.06;
    const a=[d.a[0]+dx*k+nx*off,d.a[1]+dz*k+nz*off];
    return [a,[a[0]+dx/n,a[1]+dz/n]];
  });
}
export class WorldPhysics {
  constructor(colliders,floors,radius=.21) {
    this.radius=radius;this.floors=floors;this.grid=new Map();this.cell=1;
    for(const c of colliders) {
      const p=c.poly,x0=Math.floor(Math.min(...p.map(v=>v[0]))-radius),x1=Math.floor(Math.max(...p.map(v=>v[0]))+radius);
      const z0=Math.floor(Math.min(...p.map(v=>v[1]))-radius),z1=Math.floor(Math.max(...p.map(v=>v[1]))+radius);
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++) {
        const key=x+','+z;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(c);
      }
    }
  }
  blocked(p,dynamic=[]) {
    const r=this.radius;
    if(!this.floors.some(f=>inside(p,f)))return true;
    for(let i=0;i<16;i++) {
      const a=i*Math.PI/8,q=[p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r];
      if(!this.floors.some(f=>inside(q,f)))return true;
    }
    const nearby=this.grid.get(Math.floor(p[0])+','+Math.floor(p[1]))||[];
    return nearby.some(c=>overlaps(p,r,c.poly))||dynamic.some(poly=>overlaps(p,r,poly));
  }
  move(p,dx,dz,dynamic=[]) {
    const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.035));dx/=n;dz/=n;
    let q=[...p];
    for(let i=0;i<n;i++) {
      const both=[q[0]+dx,q[1]+dz];
      if(!this.blocked(both,dynamic)){q=both;continue;}
      const x=[q[0]+dx,q[1]];if(!this.blocked(x,dynamic))q=x;
      const z=[q[0],q[1]+dz];if(!this.blocked(z,dynamic))q=z;
    }
    return q;
  }
}
