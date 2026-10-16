import * as THREE from './assets/three.module.js';
import {noise2,clothPixels,CLOTH_KINDS} from './cloth-maps.mjs?v=13691be8ab';

// Master bed dressing after render 3: washed-linen duvet draped over the sides,
// folded top sheet, two pairs of piped pillows and a taupe waffle throw at the
// foot. Built at run time so the exported model (and the baked light hashes)
// stay untouched; the exported duvet, pillows and blanket are hidden instead.
// World coordinates in metres: head at low X, 2 × 2 m mattress.
export const MASTER_BED={x0:.1997,x1:2.1997,z0:-8.7103,z1:-6.7101};
const TOP=.52;

// Exported bedding triangles to drop: inside the bed footprint, above the base.
export function hideExportedBedding(geo){
  const pos=geo.getAttribute('position'),keep=[],b=MASTER_BED;
  for(let i=0;i<pos.count;i+=3){
    let x=0,y=0,z=0;
    for(let k=0;k<3;k++){x+=pos.getX(i+k);y+=pos.getY(i+k);z+=pos.getZ(i+k);}
    x/=3;y/=3;z/=3;
    if(x>b.x0-.02&&x<2.245&&z>b.z0-.06&&z<b.z1+.06&&y>.30)continue;
    keep.push(i,i+1,i+2);
  }
  if(keep.length<pos.count)geo.setIndex(keep);
}

// Tileable cloth maps: colour + normal from a height field. `size` metres per tile.
// The pixels are computed in workers as soon as the page starts (prepareBedding); the
// textures exist at once and take them when they arrive, before anything is drawn.
const pixels=new Map();
function computePixels(kind){
  if(!pixels.has(kind)){
    let result;
    try{
      const worker=new Worker(new URL('./cloth-worker.mjs?v=97b3581079',import.meta.url),{type:'module'});
      result=new Promise((resolve,reject)=>{worker.onmessage=e=>{worker.terminate();resolve(e.data);};worker.onerror=e=>{worker.terminate();reject(e);};});
      worker.postMessage(kind);
      result=result.catch(()=>clothPixels(kind));
    }catch{result=Promise.resolve().then(()=>clothPixels(kind));}
    pixels.set(kind,result);
  }
  return pixels.get(kind);
}
export function prepareBedding(){for(const kind of CLOTH_KINDS)computePixels(kind);}
const mapCache=new Map();
// Also for the rooms (ctx.clothMaps): cloth-maps.mjs CLOTH_KINDS.
export function clothMaps(kind){
  if(mapCache.has(kind))return mapCache.get(kind);
  const N=1024,col=document.createElement('canvas'),nor=document.createElement('canvas');col.width=col.height=nor.width=nor.height=N;
  const map=new THREE.CanvasTexture(col),normalMap=new THREE.CanvasTexture(nor);
  map.colorSpace=THREE.SRGBColorSpace;
  for(const t of [map,normalMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  const ready=computePixels(kind).then(({size,color,normal})=>{
    col.getContext('2d').putImageData(new ImageData(color,size,size),0,0);nor.getContext('2d').putImageData(new ImageData(normal,size,size),0,0);
    map.needsUpdate=normalMap.needsUpdate=true;
  });
  const maps={map,normalMap,ready};mapCache.set(kind,maps);return maps;
}
// Resolves when every cloth map has its pixels.
export const beddingReady=()=>Promise.all([...mapCache.values()].map(m=>m.ready));

function cloth(color,kind,{normal=.75,roughness=.92,sheen=.55}={}){
  const {map,normalMap}=clothMaps(kind);
  return new THREE.MeshPhysicalMaterial({color,map,normalMap,normalScale:new THREE.Vector2(normal,normal),roughness,
    sheen,sheenRoughness:.62,sheenColor:new THREE.Color(color).lerp(new THREE.Color('#ffffff'),.35),side:THREE.DoubleSide});
}

// A cloth draped over a rounded box top. Cloth space (s along the bed from the
// head, t across from the centre, metres) maps flat onto the top rectangle and
// folds over its edges with radius r, then hangs straight down.
// Radii, folds and outward flare may differ between the s edges (head/foot) and
// the t edges (sides): [s edge, t edge].
function drape({s0,s1,t0,t1,top,height,r,fold,flare=[0,0],seed,res=.025,tile=.6}){
  const n=noise2(seed),ns=Math.ceil((s1-s0)/res),nt=Math.ceil((t1-t0)/res);
  const {x0,x1,z0,z1}=MASTER_BED,cz=(z0+z1)/2;
  const pos=[],uv=[],index=[];
  for(let i=0;i<=ns;i++)for(let j=0;j<=nt;j++){
    const s=s0+(s1-s0)*i/ns,t=t0+(t1-t0)*j/nt;
    const cs=Math.max(top.s0,Math.min(top.s1,s)),ct=Math.max(-top.w,Math.min(top.w,t));
    let ds=s-cs,dt=t-ct,d=Math.hypot(ds,dt);
    // Corners droop a little below the hem instead of hanging to a long point.
    const hem=Math.max(Math.abs(ds),Math.abs(dt));if(d>hem)d=hem+(d-hem)*.3;
    let y=height(cs,ct),off=0,drop=0;
    if(d>1e-6){
      const dl=Math.hypot(ds,dt);ds/=dl;dt/=dl;
      const ws=ds*ds,wt=dt*dt,rr=r[0]*ws+(typeof r[1]==='function'?r[1](cs):r[1])*wt,th=d/rr;
      if(th<Math.PI/2){off=rr*Math.sin(th);drop=rr*(1-Math.cos(th));}
      else{const hanging=d-rr*Math.PI/2;off=rr+hanging*(flare[0]*ws+flare[1]*wt);drop=rr+hanging;}
      // Vertical folds in the hanging part, pushed outwards only.
      // Driven by the hanging length, so layers sharing radius centre and seed fold together.
      const hanging=Math.max(0,d-rr*Math.PI/2),hang=Math.min(1,hanging/.12);
      const along=-ds*t+dt*s;
      off+=(fold[0]*ws+fold[1]*wt)*hang*(.5+.5*Math.sin(along*17+n(along*5,hanging*3)*5))*(.5+n(along*2.3,1.7));
    }else ds=dt=0;
    const sx=cs+ds*off,tz=ct+dt*off;
    const wob=d>1e-6?0:.004*n(s*9,t*9);
    pos.push(x0+sx,y-drop+wob,cz+tz);uv.push(s/tile,t/tile);
  }
  for(let i=0;i<ns;i++)for(let j=0;j<nt;j++){
    const a=i*(nt+1)+j,b=a+nt+1;index.push(a,b,a+1,b,b+1,a+1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(index);g.computeVertexNormals();return g;
}

// Stuffed pillow: pinched outline, full belly sagging slightly downwards, piped seam.
function pillow(W,H,T,seed,mat,piping){
  const g=new THREE.Group(),n=noise2(seed),nu=34,nv=24;
  const rim=(u,v)=>[u*W/2*(1-.07*(1-v*v)),v*H/2*(1-.09*(1-u*u))];
  for(const side of [1,-1]){
    const pos=[],uv=[],index=[];
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
      const u=-1+2*i/nu,v=-1+2*j/nv,[x,y]=rim(u,v);
      const edge=Math.max(Math.abs(u),Math.abs(v));
      let t=T/2*Math.pow(Math.max(0,1-Math.abs(u)**3),.42)*Math.pow(Math.max(0,1-Math.abs(v)**3),.42);
      // Radial creases where the cover gathers at the corners and seams.
      const ang=Math.atan2(v,u);
      t*=(1+.10*(-v))*(1-.13*edge**5*(.5+.5*Math.sin(ang*11+seed)))*(1+.05*n(u*3+side*5,v*3));
      pos.push(x,y,side*t);uv.push(x/.6,y/.6);
    }
    for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
      const a=i*(nv+1)+j,b=a+nv+1;
      if(side>0)index.push(a,b,a+1,b,b+1,a+1);else index.push(a,a+1,b,b,a+1,b+1);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(index);geo.computeVertexNormals();g.add(new THREE.Mesh(geo,mat));
  }
  const pts=[];
  for(let k=0;k<=160;k++){
    const a=k/160*Math.PI*2,c=Math.cos(a),s=Math.sin(a),m=Math.max(Math.abs(c),Math.abs(s));
    const [x,y]=rim(c/m,s/m);pts.push(new THREE.Vector3(x,y,0));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true),160,.0045,6,true),piping));
  return g;
}

export function masterBedding(){
  const group=new THREE.Group(),{x0,x1,z0,z1}=MASTER_BED,L=x1-x0,Wh=(z1-z0)/2,cz=(z0+z1)/2;
  const linen=cloth('#ece6dc','linen'),sheet=cloth('#f1eee8','sheet',{normal:.6}),
        throwMat=cloth('#a3968a','waffle',{normal:1,roughness:.95,sheen:.7}),
        pillowMat=cloth('#eee9e0','sheet',{normal:.55}),piping=new THREE.MeshPhysicalMaterial({color:'#d9d0c3',roughness:.85,sheen:.4});

  // Mattress in a fitted sheet, soft rounded edges.
  const bevel=.035,outline=new THREE.Shape(),hx=L/2-.005-bevel,hz=Wh-.005-bevel,cr=.03;
  outline.moveTo(-hx+cr,-hz);outline.lineTo(hx-cr,-hz);outline.quadraticCurveTo(hx,-hz,hx,-hz+cr);outline.lineTo(hx,hz-cr);
  outline.quadraticCurveTo(hx,hz,hx-cr,hz);outline.lineTo(-hx+cr,hz);outline.quadraticCurveTo(-hx,hz,-hx,hz-cr);outline.lineTo(-hx,-hz+cr);outline.quadraticCurveTo(-hx,-hz,-hx+cr,-hz);
  const bed=new THREE.ExtrudeGeometry(outline,{depth:TOP-.29-2*bevel,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:5,curveSegments:6});
  const buv=bed.getAttribute('uv');for(let i=0;i<buv.count;i++)buv.setXY(i,buv.getX(i)/.6,buv.getY(i)/.6);
  bed.rotateX(-Math.PI/2);bed.translate((x0+x1)/2,.29+bevel,cz);
  group.add(new THREE.Mesh(bed,sheet));

  // Duvet: puffy, lower towards its edges, turned under at the head.
  const dn=noise2(41),duvetTop={s0:.46,s1:L,w:Wh};
  const duvetH=(s,t)=>{
    const e=Math.min(s-duvetTop.s0,duvetTop.s1-s,Wh-Math.abs(t));
    // Loft fading to the edges, soft rolls running mostly lengthwise and small crumples.
    return TOP+.008+.05*(1-Math.exp(-Math.max(0,e)/.14))+.014*dn(s*1.4+t*.5,t*3.2)+.008*dn(s*2.6,t*2.6)+.004*dn(s*8,t*8);
  };
  // The bench stands 5 cm from the foot: tight roll and no flare there.
  const R=.085,folds=[.004,.012];
  const duvet=drape({s0:duvetTop.s0,s1:L+.28,t0:-Wh-.30,t1:Wh+.30,top:duvetTop,height:duvetH,r:[.04,R],fold:folds,flare:[0,.10],seed:41});
  group.add(new THREE.Mesh(duvet,linen));
  // Layers on top follow the duvet concentrically (radius R+lift about the same
  // centre, same folds), so the gap stays even and cut ends lie on it.
  const layer=(top,lift,headR,hangs,tile)=>drape({s0:top.s0-(headR?.07:0),s1:top.s1,t0:-Wh-hangs,t1:Wh+hangs,top,tile,
    height:(s,t)=>duvetH(Math.max(s,duvetTop.s0+.03),t)+lift(s),r:[headR||.05,s=>R+lift(s)],fold:folds,flare:[0,.10],seed:41});
  // Cut ends settle onto the duvet; the sheet's head end is a fold instead.
  const settle=(top,s,both)=>Math.min(1,(top.s1-s)/.05,both?(s-top.s0)/.05:1);

  // Top sheet folded back over the duvet, wrapping its head edge in a soft roll.
  const cuffTop={s0:.47,s1:.74,w:Wh};
  group.add(new THREE.Mesh(layer(cuffTop,s=>.004+.008*settle(cuffTop,s)+.008*Math.exp(-(s-cuffTop.s0)/.03),.05,.31),sheet));

  // Taupe waffle throw across the foot half, falling down both sides.
  const throwTop={s0:1.20,s1:1.86,w:Wh};
  group.add(new THREE.Mesh(layer(throwTop,s=>.004+.009*settle(throwTop,s,true),0,.27,.5),throwMat));

  // Two pairs of pillows: large ones against the headboard, smaller in front.
  for(const [k,side] of [[0,-1],[1,1]]){
    const back=pillow(.82,.54,.20,3+k,pillowMat,piping);
    back.rotation.order='YXZ';back.rotation.set(-.33,Math.PI/2,0);back.rotation.z=side*.02;
    back.position.set(x0+.14,TOP+.25,cz+side*.47);group.add(back);
    const front=pillow(.68,.46,.16,9+k,pillowMat,piping);
    front.rotation.order='YXZ';front.rotation.set(-.62,Math.PI/2,0);front.rotation.z=-side*.03;
    front.position.set(x0+.366,TOP+.232,cz+side*.45);group.add(front);
  }
  group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return group;
}
