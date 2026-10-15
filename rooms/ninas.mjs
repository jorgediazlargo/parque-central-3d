// Room module: ninas. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/ninas.json).
import {mergeGeometries} from '../assets/jsm/utils/BufferGeometryUtils.js';
//
// Render 7: two 200 × 90 B01 beds dressed like the master bed (bedding.mjs): a
// fitted sheet on a mattress, a washed-linen duvet with a turned-down head and
// crisp rolled edges falling over the upholstered base, and two rectangular linen
// cushions with pinched corners (sage behind, sand lumbar in front). The exported
// soft mattress cloth, pillow and round cushions are dropped; the exported base and
// headboards stay with their baked light. Also: floor-to-ceiling shaker doors in
// matte sage lacquer with oak bar handles, cream linen bedside drums on the B01
// footprints, a brass sconce and the glazed, framed print of the render.

const ZONE=[[15.78,-.2,-9.8],[18.7,3.2,-4.87]];
// Beds (B01 'Cama secundaria 1/2'): head at the east wall, 2 m long towards -x.
const HEAD_X=18.432,BED_L=2,WH=.45,BEDS=[{cz:-8.575,seed:51},{cz:-7.075,seed:67}];
const HEAD_S=.05;   // upholstered headboard face (x 18.382)
const BASE_TOP=.29,TOP=.50;

// Seeded value noise, smooth enough for folds (as bedding.mjs).
function noise2(seed){
  const h=(x,y)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,2147483647)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  return (x,y)=>{
    const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v-.5;
  };
}

// Washed-linen colour + normal maps (slub yarns, broad creases, a few crinkles),
// tile 0.6 m. Same recipe as the master bedding, own seed.
function linenMaps(THREE){
  const N=1024,H=new Float32Array(N*N),C=new Float32Array(N*N);
  let seed=389;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const at=(x,y)=>((y+N)%N)*N+((x+N)%N);
  const n1=noise2(seed),n2=noise2(seed+7);
  const rowSlub=new Float32Array(N);for(let y=0;y<N;y++)rowSlub[y]=random()<.14?(random()-.3)*1.4:0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const slub=rowSlub[y]*Math.max(0,n1(x/37,y/3)),weave=.10*((x&1)^(y&1)?1:-1);
    H[y*N+x]=slub*.6+weave;
    const a=x/N*Math.PI*2,b=y/N*Math.PI*2;
    C[y*N+x]=.03*n2(3+Math.cos(a)*4,3+Math.sin(a)*4+b*.6)+.035*slub;
  }
  for(let k=0;k<210;k++){
    const fine=random()<.25,cx=random()*N,cy=random()*N,len=fine?40+random()*90:90+random()*260,w=fine?2+random()*2:6+random()*16;
    const ang=random()*Math.PI,dx=Math.cos(ang),dy=Math.sin(ang),amp=(random()<.5?-1:1)*(fine?.25+random()*.3:.5+random()*1.2)*w/8;
    const bend=(random()-.5)*.004,r=Math.ceil(len/2+w*3);
    for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
      const s=ox*dx+oy*dy,q=-ox*dy+oy*dx-bend*s*s;
      if(Math.abs(s)>len/2||Math.abs(q)>w*3)continue;
      const taper=Math.sin(Math.PI*(s/len+.5));
      H[at(Math.round(cx+ox),Math.round(cy+oy))]+=amp*taper*taper*Math.exp(-(q*q)/(w*w));
    }
  }
  const col=document.createElement('canvas'),nor=document.createElement('canvas');col.width=col.height=nor.width=nor.height=N;
  const ci=col.getContext('2d').createImageData(N,N),ni=nor.getContext('2d').createImageData(N,N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,gx=(H[at(x+1,y)]-H[at(x-1,y)])*.55,gy=(H[at(x,y+1)]-H[at(x,y-1)])*.55,l=Math.hypot(gx,gy,1);
    ni.data.set([(-gx/l*.5+.5)*255,(gy/l*.5+.5)*255,(1/l*.5+.5)*255,255],i*4);
    const v=Math.max(0,Math.min(255,248*(1+C[i]+H[i]*.012)));
    ci.data.set([v,v,v,255],i*4);
  }
  col.getContext('2d').putImageData(ci,0,0);nor.getContext('2d').putImageData(ni,0,0);
  const map=new THREE.CanvasTexture(col),normalMap=new THREE.CanvasTexture(nor);
  map.colorSpace=THREE.SRGBColorSpace;
  for(const t of [map,normalMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  return {map,normalMap};
}

// Cloth space: s along the bed from the headboard, t across from its centre (m).
// The cloth lies on the top rectangle and rolls over its edges with radius r, then
// hangs, with vertical folds in the hanging part (bedding.mjs drape, mirrored: the
// head is at +x here).
function drape(THREE,cz,{s0,s1,t0,t1,top,height,r,fold,flare=[0,0],seed,res=.025,tile=.6}){
  const n=noise2(seed),ns=Math.ceil((s1-s0)/res),nt=Math.ceil((t1-t0)/res);
  const pos=[],uv=[],index=[];
  for(let i=0;i<=ns;i++)for(let j=0;j<=nt;j++){
    const s=s0+(s1-s0)*i/ns,t=t0+(t1-t0)*j/nt;
    const cs=Math.max(top.s0,Math.min(top.s1,s)),ct=Math.max(-top.w,Math.min(top.w,t));
    let ds=s-cs,dt=t-ct,d=Math.hypot(ds,dt);
    const hem=Math.max(Math.abs(ds),Math.abs(dt));if(d>hem)d=hem+(d-hem)*.3;
    let y=height(cs,ct),off=0,drop=0;
    if(d>1e-6){
      const dl=Math.hypot(ds,dt);ds/=dl;dt/=dl;
      const ws=ds*ds,wt=dt*dt,rr=r[0]*ws+(typeof r[1]==='function'?r[1](cs):r[1])*wt,th=d/rr;
      if(th<Math.PI/2){off=rr*Math.sin(th);drop=rr*(1-Math.cos(th));}
      else{const hanging=d-rr*Math.PI/2;off=rr+hanging*(flare[0]*ws+flare[1]*wt);drop=rr+hanging;}
      const hanging=Math.max(0,d-rr*Math.PI/2),hang=Math.min(1,hanging/.10);
      const along=-ds*t+dt*s;
      off+=(fold[0]*ws+fold[1]*wt)*hang*(.5+.5*Math.sin(along*19+n(along*5,hanging*3)*5))*(.5+n(along*2.3,1.7));
    }else ds=dt=0;
    const sx=cs+ds*off,tz=ct+dt*off,wob=d>1e-6?0:.003*n(s*9,t*9);
    pos.push(HEAD_X-sx,y-drop+wob,cz+tz);uv.push(s/tile,t/tile);
  }
  // Mirrored in x: reversed winding keeps the normals outwards.
  for(let i=0;i<ns;i++)for(let j=0;j<nt;j++){
    const a=i*(nt+1)+j,b=a+nt+1;index.push(a,a+1,b,b,a+1,b+1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(index);g.computeVertexNormals();return g;
}

// Rectangular linen cushion: square-ish outline pinched at the corners, full belly,
// radial creases gathering at the corners, a flat seam all round.
function cushion(THREE,W,H,T,seed,mat,seam){
  const g=new THREE.Group(),n=noise2(seed),nu=36,nv=26;
  const rim=(u,v)=>[u*W/2*(1-.05*(1-v*v)),v*H/2*(1-.07*(1-u*u))];
  for(const side of [1,-1]){
    const pos=[],uv=[],index=[];
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
      const u=-1+2*i/nu,v=-1+2*j/nv,[x,y]=rim(u,v),edge=Math.max(Math.abs(u),Math.abs(v));
      let t=T/2*Math.pow(Math.max(0,1-Math.abs(u)**4),.40)*Math.pow(Math.max(0,1-Math.abs(v)**4),.40);
      const ang=Math.atan2(v,u);
      t*=(1+.08*(-v))*(1-.16*edge**4*(.5+.5*Math.sin(ang*13+seed)))*(1+.06*n(u*3+side*5,v*3))*(1+.03*n(u*9,v*7+side));
      pos.push(x,y,side*t);uv.push(x/.22+seed*.13,y/.22);
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
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true),160,.0035,6,true),seam));
  return g;
}

function mattress(THREE,cz,mat){
  const bevel=.03,hx=(BED_L-HEAD_S)/2-.004-bevel,hz=WH-.006-bevel,cr=.03,o=new THREE.Shape();
  o.moveTo(-hx+cr,-hz);o.lineTo(hx-cr,-hz);o.quadraticCurveTo(hx,-hz,hx,-hz+cr);o.lineTo(hx,hz-cr);
  o.quadraticCurveTo(hx,hz,hx-cr,hz);o.lineTo(-hx+cr,hz);o.quadraticCurveTo(-hx,hz,-hx,hz-cr);o.lineTo(-hx,-hz+cr);o.quadraticCurveTo(-hx,-hz,-hx+cr,-hz);
  const geo=new THREE.ExtrudeGeometry(o,{depth:TOP-BASE_TOP-2*bevel,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:5,curveSegments:6});
  const uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/.6,uv.getY(i)/.6);
  geo.rotateX(-Math.PI/2);geo.translate(HEAD_X-(HEAD_S+BED_L)/2,BASE_TOP+bevel,cz);
  return new THREE.Mesh(geo,mat);
}

function bed(THREE,{cz,seed},m){
  const group=new THREE.Group();
  // Recessed plinth: the upholstered base reads as standing on the floor.
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(BED_L-HEAD_S-.10,.10,2*WH-.10),m.plinth);
  plinth.position.set(HEAD_X-(HEAD_S+BED_L)/2,.05,cz);group.add(plinth);
  group.add(mattress(THREE,cz,m.sheet));

  // Duvet: lofty in the middle, lower to its edges, rolled crisply over the sides
  // and foot and hanging to the middle of the base.
  const dn=noise2(seed),dTop={s0:.50,s1:BED_L,w:WH};
  const duvetH=(s,t)=>{
    const e=Math.min(s-dTop.s0,dTop.s1-s,WH-Math.abs(t));
    return TOP+.006+.045*(1-Math.exp(-Math.max(0,e)/.12))+.019*dn(s*1.5+t*.6,t*3.4)+.012*dn(s*3.2+t,t*4.5)+.007*dn(s*9,t*9);
  };
  const R=.075,folds=[.010,.014];
  group.add(new THREE.Mesh(drape(THREE,cz,{s0:dTop.s0,s1:BED_L+.27,t0:-WH-.28,t1:WH+.28,top:dTop,height:duvetH,
    r:[.065,R],fold:folds,flare:[.05,.07],seed}),m.duvet));
  // Turned-down head of the duvet: a thick band folded back over itself, wrapping
  // the head edge in a soft roll, its cut end settling onto the duvet.
  const cuff={s0:.51,s1:.77,w:WH},settle=s=>Math.min(1,(cuff.s1-s)/.05);
  const lift=s=>.007+.016*settle(s)+.014*Math.exp(-(s-cuff.s0)/.03);
  group.add(new THREE.Mesh(drape(THREE,cz,{s0:cuff.s0-.075,s1:cuff.s1,t0:-WH-.29,t1:WH+.29,top:cuff,
    height:(s,t)=>duvetH(Math.max(s,dTop.s0+.03),t)+lift(s),r:[.06,s=>R+lift(s)],fold:folds,flare:[0,.07],seed}),m.duvet));

  // Sage linen pillow against the headboard, sand lumbar cushion in front of it.
  const k=seed%7;
  const back=cushion(THREE,.64,.43,.17,3+k,m.sage,m.sageSeam);
  back.rotation.order='YXZ';back.rotation.set(-.30,-Math.PI/2,.02*(k%2?1:-1));
  back.position.set(HEAD_X-.19,TOP+.205,cz+.01*(k%2?1:-1));group.add(back);
  const front=cushion(THREE,.46,.30,.13,9+k,m.sand,m.sandSeam);
  front.rotation.order='YXZ';front.rotation.set(-.55,-Math.PI/2,-.03*(k%2?1:-1));
  front.position.set(HEAD_X-.40,TOP+.14,cz-.015*(k%2?1:-1));group.add(front);
  return group;
}

// Wardrobe B01 'Armario 08' on the south wall: carcass front face at z -5.510, from
// x 16.822 to the east wall; the room ceiling is at 2.55.
const WX0=16.822,WX1=18.432,FZ=-5.5103,CEIL=2.55,DOORS=3;
// Pale grey sage of render 7: under the room's warm light it lands on the photo's
// wardrobe-to-wall balance. SAGE_TINT is its ratio to the app.js lacquer tint #bcc2b0.
const SAGE='#cfd0bf',SAGE_TINT='1.24,1.17,1.20';
// B01 bedside drums [x, z, radius] (plan 1040,218 r 10 and 1040,295 r 12).
const NIGHTSTANDS=[[18.1125,-7.797,.194],[18.1125,-6.303,.2328]];

// Plane facing -z with vertex-colour occlusion towards its edges (the shadow the
// shaker frame casts into the recessed panel); denser rows near the edges only.
function aoPanel(THREE,x0,x1,y0,y1,z,ao,fall){
  const steps=[0,.003,.008,.016,.03,.05];
  const axis=(a,b)=>{const m=(a+b)/2,l=new Set();for(const d of steps){if(a+d<m)l.add(+(a+d).toFixed(5));if(b-d>m)l.add(+(b-d).toFixed(5));}return [...l].sort((p,q)=>p-q);};
  const xs=axis(x0,x1),ys=axis(y0,y1),pos=[],nor=[],uv=[],col=[];
  const occ=(x,y)=>{const d=Math.min(x-x0,x1-x,y-y0),dt=y1-y;return 1-Math.max(ao*Math.exp(-d/fall),ao*1.35*Math.exp(-dt/(fall*1.3)));};
  const put=(x,y)=>{pos.push(x,y,z);nor.push(0,0,-1);uv.push(x,y);const c=occ(x,y);col.push(c,c,c);};
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
    const [a,b,c,d]=[[xs[i],ys[j]],[xs[i+1],ys[j]],[xs[i],ys[j+1]],[xs[i+1],ys[j+1]]];
    for(const p of [a,c,b,b,c,d])put(...p);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  return g;
}
// Non-indexed copy with a colour attribute: `shade(normal)` gives the occlusion.
function tinted(THREE,geo,shade=()=>1){
  const g=geo.index?geo.toNonIndexed():geo,n=g.getAttribute('normal'),col=[];
  for(let i=0;i<n.count;i++){const c=shade(n.getX(i),n.getY(i),n.getZ(i));col.push(c,c,c);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));return g;
}

function wardrobe(ctx){
  const {THREE}=ctx,group=new THREE.Group();group.name='ninas:armario';
  const parts=[],gap=.0027,w=(WX1-WX0)/DOORS-2*gap,y0=.085,y1=CEIL-.005,h=y1-y0,cy=(y0+y1)/2;
  const S=.052,T=.06,B=.07,RAIL=[.905,.955],bev=.0015;
  const doorX=[];
  for(let i=0;i<DOORS;i++){
    const x0=WX0+i*(WX1-WX0)/DOORS+gap,x1=x0+w,cx=(x0+x1)/2;doorX.push([x0,x1]);
    // 19 mm door leaf; its edges darken in the joints.
    const slab=tinted(THREE,new THREE.BoxGeometry(w,h,.012),(nx,ny,nz)=>Math.abs(nz)>.5?1:ny>.5?.8:.5);
    slab.translate(cx,cy,FZ-.0017-.006);parts.push(slab);
    // Recessed panels above and below the mid rail.
    parts.push(aoPanel(THREE,x0+S,x1-S,RAIL[1],y1-T,FZ-.0140,.36,.010));
    parts.push(aoPanel(THREE,x0+S,x1-S,y0+B,RAIL[0],FZ-.0140,.36,.010));
    // Shaker frame: stiles, rails and mid rail, 4.4 mm proud with eased edges.
    const hw=w/2-bev,hh=h/2-bev,shape=new THREE.Shape();
    shape.moveTo(-hw,-hh);shape.lineTo(hw,-hh);shape.lineTo(hw,hh);shape.lineTo(-hw,hh);shape.lineTo(-hw,-hh);
    for(const [b,t] of [[RAIL[1]-cy,h/2-T],[-h/2+B,RAIL[0]-cy]]){
      const px=w/2-S+bev,hole=new THREE.Path();
      hole.moveTo(-px,b-bev);hole.lineTo(-px,t+bev);hole.lineTo(px,t+bev);hole.lineTo(px,b-bev);hole.lineTo(-px,b-bev);
      shape.holes.push(hole);
    }
    const frame=new THREE.ExtrudeGeometry(shape,{depth:.004,bevelEnabled:true,bevelThickness:bev,bevelSize:bev,bevelSegments:2,curveSegments:1});
    frame.rotateY(Math.PI);frame.translate(cx,cy,FZ-.0129);
    parts.push(tinted(THREE,frame,(nx,ny)=>ny<-.5?.75:1));
  }
  // Lacquered filler from the carcass top (2.15) to the ceiling, behind the doors.
  const filler=tinted(THREE,new THREE.BoxGeometry(WX1-WX0,CEIL-2.15,-4.92-FZ));
  filler.translate((WX0+WX1)/2,(2.15+CEIL)/2,(FZ-4.92)/2);parts.push(filler);
  const sage=new THREE.MeshStandardMaterial({color:SAGE,roughness:.74,metalness:0,envMapIntensity:.45,vertexColors:true});
  group.add(new THREE.Mesh(mergeGeometries(parts),sage));
  // Dark carcass seen through the door joints.
  const back=new THREE.Mesh(new THREE.PlaneGeometry(WX1-WX0,CEIL-.075),new THREE.MeshStandardMaterial({color:'#3b352d',roughness:.9}));
  back.rotation.y=Math.PI;back.position.set((WX0+WX1)/2,(.075+CEIL)/2,FZ-.0008);group.add(back);
  // Slim oak bar handles on posts, beside the middle door as in render 7.
  const oak=ctx.cloneMaterial(ctx.mats.wood),bars=[],front=FZ-.0184;
  for(const x of [doorX[0][1]-.03,doorX[2][0]+.03]){
    const bar=new THREE.BoxGeometry(.016,.37,.018);bar.translate(x,1.16,front-.025);bars.push(bar);
    for(const y of [1.0,1.32]){const post=new THREE.BoxGeometry(.010,.014,.020);post.translate(x,y,front-.008);bars.push(post);}
  }
  group.add(new THREE.Mesh(mergeGeometries(bars),oak));
  return group;
}

// Upholstered drum: flush on the floor, eased top edge and a lid seam 5 cm down.
function drum(THREE,x,z,r,mat){
  const P=[[0,0],[r-.004,0],[r,.004],[r,.462],[r-.0035,.4645],[r-.0035,.4695],[r,.472],[r,.506],[r-.002,.513],[r-.006,.5175],[r-.012,.5195],[r-.02,.52],[0,.52]];
  const g=new THREE.LatheGeometry(P.map(([a,b])=>new THREE.Vector2(a,b)),56);
  const uv=g.getAttribute('uv'),pos=g.getAttribute('position');
  for(let i=0;i<uv.count;i++){
    const y=pos.getY(i);
    if(y>.519||y<.001)uv.setXY(i,pos.getX(i)/.6,pos.getZ(i)/.6);
    else uv.setXY(i,uv.getX(i)*Math.PI*2*r/.6,y/.6);
  }
  const m=new THREE.Mesh(g,mat);m.position.set(x,0,z);return m;
}

// Soft occlusion on the floor round a drum (the probes alone leave it floating).
function contactShadow(THREE,x,z,r){
  const R=r+.11,c=document.createElement('canvas');c.width=c.height=128;const k=c.getContext('2d');
  const gr=k.createRadialGradient(64,64,0,64,64,64),e=r/R;
  gr.addColorStop(0,'rgba(0,0,0,.55)');gr.addColorStop(e*.98,'rgba(0,0,0,.55)');gr.addColorStop(Math.min(1,e+.06),'rgba(0,0,0,.28)');
  gr.addColorStop(Math.min(1,e+.25),'rgba(0,0,0,.08)');gr.addColorStop(1,'rgba(0,0,0,0)');
  k.fillStyle=gr;k.fillRect(0,0,128,128);
  const tex=new THREE.CanvasTexture(c);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(2*R,2*R),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,color:'#1a120c'}));
  m.rotation.x=-Math.PI/2;m.position.set(x,.0135,z);m.renderOrder=1;return m;
}

// Wall sconce of render 7 in brushed brass: round backplate, short arm, stem and a
// collar holding the exported globe (centre x 18.307, z -7.836, base y 1.115).
function sconce(THREE){
  const X=18.307,Z=-7.836,Y=.985,parts=[];
  const add=(g,x,y,rotZ=0)=>{if(rotZ)g.rotateZ(rotZ);g.translate(x,y,Z);parts.push(g);};
  add(new THREE.CylinderGeometry(.038,.038,.012,32),18.426,Y,Math.PI/2);
  add(new THREE.CylinderGeometry(.007,.007,.008,12),18.416,Y-.022,Math.PI/2);      // toggle
  add(new THREE.CylinderGeometry(.0055,.0055,.115,12),(18.42+X)/2,Y,Math.PI/2);    // arm
  add(new THREE.SphereGeometry(.0075,12,8),X,Y);
  add(new THREE.CylinderGeometry(.0055,.0055,.125,12),X,(Y+1.11)/2);               // stem
  add(new THREE.CylinderGeometry(.024,.015,.022,24),X,1.112);                       // collar
  const brass=new THREE.MeshStandardMaterial({color:'#e8c890',metalness:.45,roughness:.32});
  const m=new THREE.Mesh(mergeGeometries(parts),brass);m.name='ninas:aplique';return m;
}

// Oak-framed print with a cream mount: an elephant on a crescent moon among clouds,
// drawn on a canvas (render 7). Hung on the east wall (x 18.432) over the sconce.
function print(ctx){
  const {THREE}=ctx,W=.48,H=.68,Z=-7.836,Y=1.71,X=18.432,g=new THREE.Group();g.name='ninas:cuadro';
  const c=document.createElement('canvas');c.width=512;c.height=726;const k=c.getContext('2d');
  k.fillStyle='#ece3d6';k.fillRect(0,0,512,726);                       // mount
  const ix=70,iy=78,iw=372,ih=570;
  const bg=k.createLinearGradient(0,iy,0,iy+ih);bg.addColorStop(0,'#e3d2bf');bg.addColorStop(1,'#d9c3ab');
  k.fillStyle=bg;k.fillRect(ix,iy,iw,ih);
  k.strokeStyle='rgba(120,95,70,.35)';k.lineWidth=2;k.strokeRect(ix,iy,iw,ih);
  // Crescent moon.
  const mx=270,my=360,mr=150;
  const moon=k.createRadialGradient(mx-40,my-40,20,mx,my,mr);moon.addColorStop(0,'#e9cfa2');moon.addColorStop(1,'#c99f6c');
  k.save();k.beginPath();k.arc(mx,my,mr,0,Math.PI*2);k.arc(mx+62,my-58,mr*.86,0,Math.PI*2,true);k.fillStyle=moon;k.fill('evenodd');k.restore();
  // Clouds.
  const cloud=(x,y,s)=>{k.fillStyle='#f6f0e7';for(const [dx,dy,r] of [[-28,6,20],[0,-6,28],[28,4,22],[0,12,22]]){k.beginPath();k.arc(x+dx*s,y+dy*s,r*s,0,Math.PI*2);k.fill();}};
  cloud(190,170,1);cloud(330,535,1.25);cloud(150,560,.8);
  // Small grey elephant sitting on the moon's lower horn.
  k.fillStyle='#8e8a85';
  k.beginPath();k.ellipse(250,440,46,38,0,0,Math.PI*2);k.fill();          // body
  k.beginPath();k.arc(250,385,32,0,Math.PI*2);k.fill();                   // head
  k.fillStyle='#a19c96';k.beginPath();k.ellipse(222,388,18,24,-.3,0,Math.PI*2);k.fill(); // ear
  k.strokeStyle='#8e8a85';k.lineWidth=13;k.lineCap='round';
  k.beginPath();k.moveTo(272,398);k.quadraticCurveTo(300,420,292,446);k.stroke();          // trunk
  k.lineWidth=16;for(const x of [232,268]){k.beginPath();k.moveTo(x,462);k.lineTo(x+4,486);k.stroke();}
  k.fillStyle='#3d3a36';k.beginPath();k.arc(262,380,3.5,0,Math.PI*2);k.fill();
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(W-.04,H-.04),new THREE.MeshStandardMaterial({map:tex,roughness:.9}));
  paper.rotation.y=-Math.PI/2;paper.position.set(X-.012,Y,Z);g.add(paper);
  const oak=ctx.cloneMaterial(ctx.mats.wood),f=.02,d=.025;
  for(const [w,h,y,z] of [[W,f,Y+H/2-f/2,Z],[W,f,Y-H/2+f/2,Z],[f,H-2*f,Y,Z-W/2+f/2],[f,H-2*f,Y,Z+W/2-f/2]]){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(d,h,w),oak);bar.position.set(X-d/2,y,z);g.add(bar);
  }
  // Glazing over the print: the house glass (4 % a face, room reflections).
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(W-2*f+.004,H-2*f+.004),ctx.cloneMaterial(ctx.mats.glass));
  glass.rotation.y=-Math.PI/2;glass.position.set(X-.021,Y,Z);g.add(glass);
  // Faint diagonal sheen of the window on the glass.
  const sc=document.createElement('canvas');sc.width=64;sc.height=128;const sk=sc.getContext('2d');
  const sg=sk.createLinearGradient(0,0,64,128);
  for(const [t,a] of [[0,0],[.30,0],[.38,.10],[.46,.03],[.55,.07],[.62,0],[1,0]])sg.addColorStop(t,`rgba(255,250,240,${a})`);
  sk.fillStyle=sg;sk.fillRect(0,0,64,128);
  const sheen=new THREE.Mesh(new THREE.PlaneGeometry(W-2*f,H-2*f),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.5}));
  sheen.rotation.y=-Math.PI/2;sheen.position.set(X-.0215,Y,Z);g.add(sheen);
  // Soft shadow of the frame on the wall, a little below it.
  const wc=document.createElement('canvas');wc.width=96;wc.height=128;const wk=wc.getContext('2d');
  wk.filter='blur(5px)';wk.fillStyle='rgba(0,0,0,.42)';wk.fillRect(12,14,72,104);
  const shade=new THREE.Mesh(new THREE.PlaneGeometry(W*1.25,H*1.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(wc),transparent:true,depthWrite:false,color:'#2a1d12'}));
  shade.rotation.y=-Math.PI/2;shade.position.set(X-.001,Y-.014,Z+.004);g.add(shade);
  return g;
}

export async function apply(ctx){
  const {THREE}=ctx;

  // Exported mattress cloth, pillow and round cushions of both beds.
  ctx.removeExported({material:['linen','sage'],box:ZONE});
  ctx.removeExported({material:'fabric',box:[[17.70,.40,-9.1],[18.25,1.0,-6.5]]});

  const {map,normalMap}=linenMaps(THREE);
  const cloth=(color,{normal=.75,roughness=.92,sheen=.55}={})=>new THREE.MeshPhysicalMaterial({color,map,normalMap,
    normalScale:new THREE.Vector2(normal,normal),roughness,sheen,sheenRoughness:.62,
    sheenColor:new THREE.Color(color).lerp(new THREE.Color('#ffffff'),.35),side:THREE.DoubleSide});
  const m={
    duvet:cloth('#e2d8c9',{normal:1.55,sheen:.35}),sheet:cloth('#f3f0ea',{normal:.6,sheen:.35}),
    sage:cloth('#bfc0a7',{normal:1.1,roughness:1,sheen:.18}),sand:cloth('#cdae92',{normal:1.1,roughness:1,sheen:.18}),
    sageSeam:new THREE.MeshPhysicalMaterial({color:'#a9aa92',roughness:1,sheen:.2}),
    sandSeam:new THREE.MeshPhysicalMaterial({color:'#bc9d82',roughness:1,sheen:.2}),
    plinth:new THREE.MeshStandardMaterial({color:'#7d7368',roughness:.95})
  };
  const beds=new THREE.Group();beds.name='ninas:camas';
  for(const b of BEDS)beds.add(bed(THREE,b,m));
  beds.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  ctx.group.add(beds);ctx.lightRuntimeObject(beds);
  beds.traverse(o=>{if(o.isMesh)ctx.staticMeshes.push(o);});

  // Wardrobe (B01 'Armario 08'): the exported fronts are rebuilt as floor-to-ceiling
  // shaker doors in opaque matte sage lacquer (render 7); the carcass stays baked.
  ctx.removeExported({material:'lacquer',box:[[16.80,.08,-5.56],[18.45,2.16,-5.505]]});
  ctx.removeExported({material:'bronze',box:[[16.78,.8,-5.62],[18.45,1.35,-5.50]]});
  for(const piece of ctx.splitExported({material:'lacquer',box:[[16.78,0,-5.62],[18.45,2.3,-4.90]]})){
    const mat=piece.material,prior=mat.onBeforeCompile,priorKey=mat.customProgramCacheKey?mat.customProgramCacheKey.bind(mat):()=>'';
    mat.roughness=.78;mat.envMapIntensity=.45;
    // app.js tints this lacquer #bcc2b0; bring the carcass to the doors' greyer sage.
    mat.onBeforeCompile=(shader,r)=>{
      prior.call(mat,shader,r);
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>','diffuseColor.rgb*=vec3('+SAGE_TINT+');\n#include <alphamap_fragment>');
    };
    mat.customProgramCacheKey=()=>priorKey()+'|ninasLacquer2';
  }
  const ward=wardrobe(ctx);ctx.group.add(ward);ctx.lightRuntimeObject(ward);

  // Bedside drums (B01 'Mesilla dormitorio secundario' and '... inferior'): same
  // footprints, rebuilt standing on the floor in cream linen with a lid seam, as the
  // one between the beds in render 7, with a soft contact shadow.
  ctx.removeExported({material:'wood',box:[[17.85,0,-8.05],[18.36,.6,-7.55]]});
  ctx.removeExported({material:'wood',box:[[17.85,0,-6.6],[18.37,.6,-6.0]]});
  const drums=new THREE.Group();drums.name='ninas:mesillas';
  const drumMat=new THREE.MeshPhysicalMaterial({color:'#c2b4a3',normalMap,normalScale:new THREE.Vector2(.3,.3),roughness:.95,sheen:.25,sheenRoughness:.7,sheenColor:'#efe4d6'});
  for(const [x,z,r] of NIGHTSTANDS)drums.add(drum(THREE,x,z,r,drumMat));
  ctx.group.add(drums);ctx.lightRuntimeObject(drums);
  const shadows=new THREE.Group();shadows.name='ninas:sombras';
  for(const [x,z,r] of NIGHTSTANDS)shadows.add(contactShadow(THREE,x,z,r));
  ctx.group.add(shadows);

  // Upholstered bed bases a warmer, darker taupe than the duvet (render 7).
  for(const piece of ctx.splitExported({material:'fabric',box:[[16.3,.05,-9.1],[18.45,.32,-6.55]]}))piece.material.color.set('#8f8172');

  // Sconce (render 7): brushed brass backplate, arm, stem and collar under the globe,
  // instead of the exported dark bar.
  ctx.removeExported({material:'bronze',box:[[18.2,.85,-7.95],[18.45,1.25,-7.7]]});
  const lamp=sconce(THREE);ctx.group.add(lamp);ctx.lightRuntimeObject(lamp);

  // Framed nursery print above the sconce, centred between the headboards.
  const art=print(ctx);ctx.group.add(art);ctx.lightRuntimeObject(art);

}
