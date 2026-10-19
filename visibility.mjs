// Is the vanity mirror in sight? The mirror re-renders the whole house, so it only does
// when a line from the camera to some point of the mirror crosses no wall or closed door.
// Plan view only (walls and doors run floor to ceiling); furniture is ignored, so this
// can only say "visible" when it is not: never the other way round.

export const WALL_NAMES=/^(Tabique|Estructura|Panel respaldo)|jamba/;

const cross=(ax,az,bx,bz,cx,cz)=>(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
function segmentsCross(p,q,a,b){
  const d1=cross(p[0],p[1],q[0],q[1],a[0],a[1]),d2=cross(p[0],p[1],q[0],q[1],b[0],b[1]);
  if((d1>0)===(d2>0))return false;
  const d3=cross(a[0],a[1],b[0],b[1],p[0],p[1]),d4=cross(a[0],a[1],b[0],b[1],q[0],q[1]);
  return (d3>0)!==(d4>0);
}
const bounds=poly=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [x,z] of poly){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}return {poly,x0,x1,z0,z1};};
function blocked(p,q,boxes){
  const x0=Math.min(p[0],q[0]),x1=Math.max(p[0],q[0]),z0=Math.min(p[1],q[1]),z1=Math.max(p[1],q[1]);
  for(const b of boxes){
    if(b.x1<x0||b.x0>x1||b.z1<z0||b.z0>z1)continue;
    const n=b.poly.length;
    for(let i=0,j=n-1;i<n;j=i++)if(segmentsCross(p,q,b.poly[i],b.poly[j]))return true;
  }
  return false;
}

// mirror: data.vanityMirror ({center:[x,z], width}, lying along x); walls: polygons.
export function mirrorSight(mirror,walls,{samples=9,inset=.08}={}){
  const boxes=walls.map(bounds),[cx,cz]=mirror.center;
  const points=Array.from({length:samples},(_,i)=>[cx+(i/(samples-1)-.5)*mirror.width,cz]);
  return {
    // eye: [x, z] of the camera; doors: extra polygons (the doors that are in the way).
    visible(eye,doors=[]){
      const extra=doors.map(bounds);
      for(const t of points){
        // Stop a little short of the mirror: it hangs on the face of a panel.
        const dx=eye[0]-t[0],dz=eye[1]-t[1],len=Math.hypot(dx,dz)||1,k=Math.min(1,inset/len);
        const end=[t[0]+dx*k,t[1]+dz*k];
        if(!blocked(eye,end,boxes)&&!blocked(eye,end,extra))return true;
      }
      return false;
    },
    points
  };
}
