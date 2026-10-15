// Room module: ninas. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/ninas.json).
import {mergeGeometries} from '../assets/jsm/utils/BufferGeometryUtils.js';
//
// Render 7: two 200 × 90 B01 beds dressed like the master bed (bedding.mjs): a
// fitted sheet on a mattress, a washed-linen duvet with a turned-down head and
// rolled edges hanging close to the light greige upholstered base (left visible
// below the hem), soft diagonal folds and vertex occlusion in creases and drops,
// and two rectangular linen cushions with pinched corners (sage behind, sand lumbar
// in front). The exported soft mattress cloth, pillow and round cushions are
// dropped; the exported base and headboards stay with their baked light. Also:
// floor-to-ceiling shaker doors in matte sage lacquer with oak bar handles, greige
// linen bedside drums on the B01 centres, a brass sconce and the glazed, framed
// watercolour print of the render.

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

// Value noise whose lattice wraps every P cells (seamless when N/scale = P).
function noiseT(seed,P){
  const h=(x,y)=>{x=((x%P)+P)%P;y=((y%P)+P)%P;let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,2147483647)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  return (x,y)=>{
    const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v-.5;
  };
}

// Washed-linen colour + normal maps, tile 0.6 m (1024 px). What reads at 2-3 m is
// what a photo of stonewashed linen shows: slub streaks a few millimetres thick
// running with the weft, a blotchy dye mottle at 1-5 cm and soft creases; the
// crinkle is kept sparse so the cloth does not read as crumpled paper.
function linenMaps(THREE){
  const N=1024,H=new Float32Array(N*N),C=new Float32Array(N*N);
  let seed=389;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const at=(x,y)=>((y+N)%N)*N+((x+N)%N);
  const along=noiseT(seed,16),mottle=noiseT(seed+3,16),grain=noiseT(seed+5,128),fleck=noiseT(seed+11,256);
  // Slub bands 2-4 px (1.2-2.4 mm) thick, each with its own sign and strength.
  const band=new Float32Array(N);
  for(let y=0;y<N;){const w=2+Math.floor(random()*3),v=random()<.30?(random()-.42)*2:0;for(let k=0;k<w&&y<N;k++,y++)band[y]=v*(k===0||k===w-1?.55:1);}
  // Heather: wider bands (4-9 mm) of slightly lighter or darker yarn, the streaks
  // that still read on a duvet seen from across the room.
  const heather=new Float32Array(N);
  for(let y=0;y<N;){const w=6+Math.floor(random()*10),v=(random()-.5)*2;for(let k=0;k<w&&y<N;k++,y++)heather[y]=v*Math.sin(Math.PI*(k+.5)/w);}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const slub=band[y]*Math.max(0,along(x/64,y/16)*2.2),weave=.10*((x&1)^(y&1)?1:-1);
    H[y*N+x]=slub*.45+weave;
    C[y*N+x]=.085*mottle(x/64,y/64)+.045*grain(x/8,y/8)+.025*fleck(x/4,y/4)+.09*slub+.05*heather[y]*(.4+along(x/64+5,y/16+3)*1.6);
  }
  for(let k=0;k<110;k++){
    const fine=random()<.4,cx=random()*N,cy=random()*N,len=fine?40+random()*90:120+random()*300,w=fine?2+random()*2:8+random()*18;
    const ang=random()*Math.PI,dx=Math.cos(ang),dy=Math.sin(ang),amp=(random()<.5?-1:1)*(fine?.18+random()*.2:.4+random()*.9)*w/8;
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
    const v=Math.max(0,Math.min(255,236*(1+C[i]+H[i]*.012)));
    ci.data.set([v,v*.995,v*.985,255],i*4);
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
// head is at +x here). It carries a vertex occlusion term: the probes only light
// the cloth at room scale, so crease valleys, the inside of the hanging folds and
// the lower part of the drop (facing the base and the floor) are darkened here.
function drape(THREE,cz,{s0,s1,t0,t1,top,height,r,fold,flare=[0,0],seed,res=.025,tile=.6,shade=null,ao=[.26,.22],cavity=45}){
  const n=noise2(seed),ns=Math.ceil((s1-s0)/res),nt=Math.ceil((t1-t0)/res);
  const pos=[],uv=[],index=[],occ=[];
  for(let i=0;i<=ns;i++)for(let j=0;j<=nt;j++){
    const s=s0+(s1-s0)*i/ns,t=t0+(t1-t0)*j/nt;
    const cs=Math.max(top.s0,Math.min(top.s1,s)),ct=Math.max(-top.w,Math.min(top.w,t));
    let ds=s-cs,dt=t-ct,d=Math.hypot(ds,dt);
    const hem=Math.max(Math.abs(ds),Math.abs(dt));if(d>hem)d=hem+(d-hem)*.3;
    let y=height(cs,ct),off=0,drop=0,o=shade?shade(cs,ct):1;
    if(d>1e-6){
      const dl=Math.hypot(ds,dt);ds/=dl;dt/=dl;
      const ws=ds*ds,wt=dt*dt,rr=r[0]*ws+(typeof r[1]==='function'?r[1](cs):r[1])*wt,th=d/rr;
      if(th<Math.PI/2){off=rr*Math.sin(th);drop=rr*(1-Math.cos(th));}
      else{const hanging=d-rr*Math.PI/2;off=rr+hanging*(flare[0]*ws+flare[1]*wt);drop=rr+hanging;}
      const hanging=Math.max(0,d-rr*Math.PI/2),hang=Math.min(1,hanging/.10);
      const along=-ds*t+dt*s,wave=.5+.5*Math.sin(along*19+n(along*5,hanging*3)*5);
      off+=(fold[0]*ws+fold[1]*wt)*hang*wave*(.5+n(along*2.3,1.7));
      const low=Math.min(1,hanging/.16);
      o*=(1-ao[0]*low*low*(3-2*low))*(1-ao[1]*hang*(1-wave))*(1-.10*Math.sin(Math.min(th,Math.PI/2)));
    }else ds=dt=0;
    const sx=cs+ds*off,tz=ct+dt*off,wob=d>1e-6?0:.003*n(s*9,t*9);
    pos.push(HEAD_X-sx,y-drop+wob,cz+tz);uv.push(s/tile,t/tile);occ.push(o);
  }
  // Mirrored in x: this winding keeps the normals outwards (up on the top).
  for(let i=0;i<ns;i++)for(let j=0;j<nt;j++){
    const a=i*(nt+1)+j,b=a+nt+1;index.push(a,b,a+1,b,b+1,a+1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(index);g.computeVertexNormals();
  // Cavity: how far the ring of neighbours 5 cm away sits above the vertex along
  // its normal (valleys darken, ridges catch a little more light).
  const P=g.getAttribute('position').array,Nm=g.getAttribute('normal').array,W=nt+1,K=2,col=new Float32Array(P.length);
  for(let i=0;i<=ns;i++)for(let j=0;j<=nt;j++){
    const v=i*W+j;let ax=0,ay=0,az=0;
    for(const [di,dj] of [[K,0],[-K,0],[0,K],[0,-K]]){
      const q=(Math.max(0,Math.min(ns,i+di))*W+Math.max(0,Math.min(nt,j+dj)))*3;ax+=P[q];ay+=P[q+1];az+=P[q+2];
    }
    const cav=((ax/4-P[v*3])*Nm[v*3]+(ay/4-P[v*3+1])*Nm[v*3+1]+(az/4-P[v*3+2])*Nm[v*3+2])*cavity;
    const c=occ[v]*(1-Math.max(-.06,Math.min(.36,cav)));
    col[v*3]=col[v*3+1]=col[v*3+2]=c;
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  return g;
}

// Rectangular linen cushion: square-ish outline pinched at the corners, full belly,
// radial creases gathering at the corners, a flat seam all round.
function cushion(THREE,W,H,T,seed,mat,seam){
  const g=new THREE.Group(),n=noise2(seed),nu=36,nv=26;
  const rim=(u,v)=>[u*W/2*(1-.05*(1-v*v)),v*H/2*(1-.07*(1-u*u))];
  for(const side of [1,-1]){
    const pos=[],uv=[],index=[],col=[];
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
      const u=-1+2*i/nu,v=-1+2*j/nv,[x,y]=rim(u,v),edge=Math.max(Math.abs(u),Math.abs(v));
      let t=T/2*Math.pow(Math.max(0,1-Math.abs(u)**4),.40)*Math.pow(Math.max(0,1-Math.abs(v)**4),.40);
      const ang=Math.atan2(v,u);
      t*=(1+.08*(-v))*(1-.16*edge**4*(.5+.5*Math.sin(ang*13+seed)))*(1+.06*n(u*3+side*5,v*3))*(1+.03*n(u*9,v*7+side));
      pos.push(x,y,side*t);uv.push(x/.45+seed*.13,y/.45);
      // Occlusion where the belly thins to the seam and in the corner gathers.
      const c=(1-.34*edge**6)*(1-.12*edge**3*(.5+.5*Math.sin(ang*13+seed)));col.push(c,c,c);
    }
    for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
      const a=i*(nv+1)+j,b=a+nv+1;
      if(side>0)index.push(a,b,a+1,b,b+1,a+1);else index.push(a,a+1,b,b,a+1,b+1);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
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

// Soft occlusion on the floor (rug) round a rectangular footprint: half-size hx, hz
// (m), blurred over `soft` m outside it.
function rectShadow(THREE,x,z,hx,hz,soft,alpha){
  const R=soft*2.2,PX=200,wx=hx+R,wz=hz+R,c=document.createElement('canvas');
  c.width=Math.round(PX*2*wx);c.height=Math.round(PX*2*wz);const k=c.getContext('2d');
  k.filter=`blur(${Math.round(soft*PX/2)}px)`;k.fillStyle=`rgba(0,0,0,${alpha})`;
  k.fillRect(R*PX-.01*PX,R*PX-.01*PX,(2*hx+.02)*PX,(2*hz+.02)*PX);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(2*wx,2*wz),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,color:'#1a120c'}));
  m.rotation.x=-Math.PI/2;m.position.set(x,.0135,z);m.renderOrder=1;return m;
}

function bed(THREE,{cz,seed},m){
  const group=new THREE.Group();
  // Recessed plinth: the upholstered base reads as standing on the floor.
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(BED_L-HEAD_S-.10,.10,2*WH-.10),m.plinth);
  plinth.position.set(HEAD_X-(HEAD_S+BED_L)/2,.05,cz);group.add(plinth);
  group.add(mattress(THREE,cz,m.sheet));

  // Duvet: lofty in the middle, lower to its edges, a few soft folds running in
  // from the sides (ridges that ride over the edge roll), rolled over the sides and
  // hanging close to them down to the top of the upholstered base, which stays
  // visible below as in render 7.
  let rs=seed*7919;const rnd=()=>{rs=(Math.imul(rs,1664525)+1013904223)>>>0;return rs/4294967296;};
  const ridges=[];
  for(let k=0;k<8;k++){
    const side=k%2?1:-1,a=(rnd()<.5?-1:1)*(.45+rnd()*.6);   // diagonally in from the side edge
    ridges.push({s:.85+rnd()*1.05,t:side*WH,ds:Math.sin(a),dt:-side*Math.cos(a),len:.25+rnd()*.45,
      amp:.012+rnd()*.012,w:.04+rnd()*.035});
  }
  const ridge=(s,t)=>{
    let h=0;
    for(const q of ridges){
      const ps=s-q.s,pt=t-q.t,al=ps*q.ds+pt*q.dt,cr=-ps*q.dt+pt*q.ds;
      if(al<-.15||al>q.len)continue;
      const tap=al<0?Math.exp(-((al/.06)**2)):Math.pow(1-al/q.len,1.4);
      h+=q.amp*tap*Math.exp(-(cr*cr)/(q.w*q.w));
    }
    return h;
  };
  const dn=noise2(seed),dTop={s0:.50,s1:BED_L-.03,w:WH-.035};
  const duvetH=(s,t)=>{
    const e=Math.min(s-dTop.s0,dTop.s1-s,dTop.w-Math.abs(t));
    return TOP+.014+.05*(1-Math.exp(-Math.max(0,e)/.12))+.016*dn(s*1.5+t*.6,t*3.4)+.010*dn(s*3.2+t,t*4.5)+.005*dn(s*9,t*9)+ridge(s,t);
  };
  const R=.068,folds=[.010,.011];
  const cuff={s0:.51,s1:.79,w:WH-.035};
  // The turned-down band shades the duvet just past its cut edge.
  const under=s=>s<cuff.s1?.78:1-.24*Math.exp(-(s-cuff.s1)/.03);
  group.add(new THREE.Mesh(drape(THREE,cz,{s0:dTop.s0,s1:BED_L+.24,t0:-WH-.215,t1:WH+.215,top:dTop,height:duvetH,
    r:[.065,R],fold:folds,flare:[.05,.03],seed,res:.022,shade:(s,t)=>under(s)}),m.duvet));
  // Turned-down head of the duvet: a thick band folded back over itself, wrapping
  // the head edge in a soft roll, its cut hem standing 2 cm proud of the duvet.
  const settle=s=>Math.min(1,(cuff.s1-s)/.018);
  const lift=s=>.008+.016*settle(s)+.014*Math.exp(-(s-cuff.s0)/.03);
  group.add(new THREE.Mesh(drape(THREE,cz,{s0:cuff.s0-.075,s1:cuff.s1,t0:-WH-.225,t1:WH+.225,top:cuff,
    height:(s,t)=>duvetH(Math.max(s,dTop.s0+.03),t)+lift(s),r:[.06,s=>R+lift(s)],fold:folds,flare:[0,.03],seed,res:.022,
    shade:s=>1-.08*Math.exp(-(cuff.s1-s)/.012)}),m.duvet));

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
// B01 bedside drums [x, z, radius] (plan 1040,218 r 10 and 1040,295 r 12): same
// centres, but the volume of render 7's drum (34-36 cm across, 45 cm high, its top
// below the mattress) instead of the 39/47 cm footprint circles.
const NIGHTSTANDS=[[18.1125,-7.797,.17],[18.1125,-6.303,.18]],DRUM_H=.45;

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
  const H=DRUM_H,L=H-.055;   // lid seam
  const P=[[0,0],[r-.004,0],[r,.004],[r,L],[r-.0035,L+.0025],[r-.0035,L+.0075],[r,L+.01],[r,H-.014],[r-.002,H-.007],[r-.006,H-.0025],[r-.012,H-.0005],[r-.02,H],[0,H]];
  const g=new THREE.LatheGeometry(P.map(([a,b])=>new THREE.Vector2(a,b)),56);
  const uv=g.getAttribute('uv'),pos=g.getAttribute('position');
  for(let i=0;i<uv.count;i++){
    const y=pos.getY(i);
    if(y>H-.001||y<.001)uv.setXY(i,pos.getX(i)/.32,pos.getZ(i)/.32);
    else uv.setXY(i,uv.getX(i)*Math.PI*2*r/.32,y/.32);       // finer weave than the duvet
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
  // Watercolour on cold-pressed paper: soft-edged washes with pigment pooled at
  // their rims, granulation, a blotchy background wash, then the paper's tooth and
  // fibres over everything (mount included) and the bevelled window of the mount.
  const CW=640,CH=Math.round(CW*(H-.04)/(W-.04)),c=document.createElement('canvas');c.width=CW;c.height=CH;const k=c.getContext('2d');
  let ps=917;const rnd=()=>{ps=(Math.imul(ps,1664525)+1013904223)>>>0;return ps/4294967296;};
  k.fillStyle='#ebe2d5';k.fillRect(0,0,CW,CH);                        // mount
  const ix=88,iy=98,iw=CW-2*ix,ih=CH-2*iy,sx=iw/372,sy=ih/570,X0=ix,Y0=iy;
  const P=(x,y)=>[X0+(x-70)*sx,Y0+(y-78)*sy];                          // old 512 px layout
  k.save();k.beginPath();k.rect(ix,iy,iw,ih);k.clip();
  const bg=k.createLinearGradient(0,iy,0,iy+ih);bg.addColorStop(0,'#e6d6c3');bg.addColorStop(1,'#dcc7ae');
  k.fillStyle=bg;k.fillRect(ix,iy,iw,ih);
  for(let i=0;i<60;i++){                                                 // background wash blooms
    const x=ix+rnd()*iw,y=iy+rnd()*ih,r=20+rnd()*90,g=k.createRadialGradient(x,y,0,x,y,r);
    const tone=rnd()<.5?'176,140,104':'236,222,204';g.addColorStop(0,`rgba(${tone},${.05+rnd()*.07})`);g.addColorStop(1,`rgba(${tone},0)`);
    k.fillStyle=g;k.fillRect(x-r,y-r,2*r,2*r);
  }
  const wash=(path,fill,rim,grain,rule='nonzero')=>{
    k.save();k.filter='blur(1.6px)';k.fillStyle=fill;path();k.fill(rule);k.restore();
    k.save();path();k.clip(rule);
    if(rim){k.filter='blur(1.5px)';k.strokeStyle=rim;k.lineWidth=5;path();k.stroke();k.filter='none';}
    for(let i=0;i<1400;i++){const [x,y]=[ix+rnd()*iw,iy+rnd()*ih];k.fillStyle=`rgba(${grain},${.06+rnd()*.10})`;k.beginPath();k.arc(x,y,.6+rnd()*1.8,0,Math.PI*2);k.fill();}
    k.restore();
  };
  // Crescent moon, ochre with a darker inner rim, painted on its own sheet (the
  // inner circle is cut out, so nothing of it shows beyond the outer one).
  const [mx,my]=P(270,360),mr=150*sx,[ox,oy]=[mx+62*sx,my-58*sy];
  {
    const o=document.createElement('canvas');o.width=CW;o.height=CH;const q=o.getContext('2d');
    const moon=q.createRadialGradient(mx-60*sx,my+40*sy,10,mx,my,mr);moon.addColorStop(0,'#e7c995');moon.addColorStop(.7,'#d5ad78');moon.addColorStop(1,'#c39563');
    q.filter='blur(1.6px)';q.fillStyle=moon;q.beginPath();q.arc(mx,my,mr,0,Math.PI*2);q.fill();
    q.globalCompositeOperation='destination-out';q.beginPath();q.arc(ox,oy,mr*.86,0,Math.PI*2);q.fill();
    q.globalCompositeOperation='source-atop';q.filter='blur(1.5px)';q.strokeStyle='rgba(160,112,66,.55)';q.lineWidth=6;
    q.beginPath();q.arc(mx,my,mr-1,0,Math.PI*2);q.stroke();q.beginPath();q.arc(ox,oy,mr*.86+1,0,Math.PI*2);q.stroke();
    q.filter='none';
    for(let i=0;i<1400;i++){q.fillStyle=`rgba(150,105,60,${.06+rnd()*.10})`;q.beginPath();q.arc(mx+(rnd()-.5)*2*mr,my+(rnd()-.5)*2*mr,.6+rnd()*1.8,0,Math.PI*2);q.fill();}
    k.drawImage(o,0,0);
  }
  // Clouds: white gouache, warm grey shade underneath.
  const cloud=(x0,y0,s0)=>{
    const [x,y]=P(x0,y0),q=s0*sx,lobes=[[-28,6,20],[0,-6,28],[28,4,22],[0,12,22]];
    const path=()=>{k.beginPath();for(const [dx,dy,r] of lobes){k.moveTo(x+dx*q+r*q,y+dy*q);k.arc(x+dx*q,y+dy*q,r*q,0,Math.PI*2);}};
    const g=k.createLinearGradient(0,y-30*q,0,y+34*q);g.addColorStop(0,'#fbf7f0');g.addColorStop(.6,'#f1e9de');g.addColorStop(1,'#d9cdbf');
    wash(path,g,null,'190,175,160');
  };
  cloud(190,170,1);cloud(330,535,1.25);cloud(150,560,.8);
  // Small grey elephant on the moon's lower horn: shaded body, pink-grey ear.
  const ell=(x0,y0,rx,ry,rot=0)=>()=>{const [x,y]=P(x0,y0);k.beginPath();k.ellipse(x,y,rx*sx,ry*sy,rot,0,Math.PI*2);};
  const grey=(x0,y0,r)=>{const [x,y]=P(x0,y0),g=k.createRadialGradient(x-r*.4*sx,y-r*.5*sy,2,x,y,r*1.2*sx);g.addColorStop(0,'#aaa59f');g.addColorStop(1,'#77726c');return g;};
  wash(ell(250,440,46,38),grey(250,440,46),'rgba(80,74,68,.5)','70,66,62');
  const [tx,ty]=P(272,398),[tcx,tcy]=P(300,420),[tex_,tey]=P(292,446);
  k.save();k.filter='blur(1.2px)';k.strokeStyle='#86817b';k.lineWidth=13*sx;k.lineCap='round';
  k.beginPath();k.moveTo(tx,ty);k.quadraticCurveTo(tcx,tcy,tex_,tey);k.stroke();
  k.lineWidth=16*sx;for(const lx of [232,268]){const [a1,b1]=P(lx,462),[a2,b2]=P(lx+4,486);k.beginPath();k.moveTo(a1,b1);k.lineTo(a2,b2);k.stroke();}
  k.restore();
  wash(ell(250,385,32,32),grey(250,385,32),'rgba(80,74,68,.5)','70,66,62');
  wash(ell(220,392,24,31,-.25),'#a3958f','rgba(110,86,80,.5)','110,90,86');
  {const [x,y]=P(262,380);k.fillStyle='#3d3a36';k.beginPath();k.arc(x,y,3.5*sx,0,Math.PI*2);k.fill();}
  k.restore();
  // Paper tooth and fibres over the whole sheet.
  const id=k.getImageData(0,0,CW,CH),dd=id.data,t1=noise2(41),t2=noise2(43);
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    const f=1+.06*t1(x/4,y/4)+.04*t2(x/14,y/14),i=(y*CW+x)*4;
    dd[i]=Math.min(255,dd[i]*f);dd[i+1]=Math.min(255,dd[i+1]*f);dd[i+2]=Math.min(255,dd[i+2]*f);
  }
  k.putImageData(id,0,0);
  k.lineCap='round';
  for(let i=0;i<500;i++){
    const x=rnd()*CW,y=rnd()*CH,a=rnd()*Math.PI,l=3+rnd()*9;
    k.strokeStyle=rnd()<.5?'rgba(120,96,70,.07)':'rgba(255,252,246,.10)';k.lineWidth=.7;
    k.beginPath();k.moveTo(x,y);k.quadraticCurveTo(x+Math.cos(a)*l/2+rnd()*2,y+Math.sin(a)*l/2+rnd()*2,x+Math.cos(a)*l,y+Math.sin(a)*l);k.stroke();
  }
  // Bevelled mount window: a bright cut edge, shaded on its top and left sides.
  k.lineWidth=4;k.strokeStyle='#f7f2ea';k.strokeRect(ix-2,iy-2,iw+4,ih+4);
  k.strokeStyle='rgba(90,70,50,.18)';k.lineWidth=2;
  k.beginPath();k.moveTo(ix-4,iy+ih+4);k.lineTo(ix-4,iy-4);k.lineTo(ix+iw+4,iy-4);k.stroke();
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
  const cloth=(color,{normal=.75,roughness=.92,sheen=.55,ao=false}={})=>new THREE.MeshPhysicalMaterial({color,map,normalMap,
    normalScale:new THREE.Vector2(normal,normal),roughness,sheen,sheenRoughness:.62,vertexColors:ao,
    sheenColor:new THREE.Color(color).lerp(new THREE.Color('#ffffff'),.30),side:THREE.DoubleSide});
  // Oatmeal-white washed linen (render 7), a little greyer and pinker than cream.
  const m={
    duvet:cloth('#e6dccf',{normal:1.25,sheen:.30,ao:true}),sheet:cloth('#ebe3d8',{normal:.6,sheen:.3}),
    sage:cloth('#bdbfa6',{normal:.8,roughness:1,sheen:.2,ao:true}),sand:cloth('#d0b398',{normal:.8,roughness:1,sheen:.2,ao:true}),
    sageSeam:new THREE.MeshPhysicalMaterial({color:'#9fa088',roughness:1,sheen:.2}),
    sandSeam:new THREE.MeshPhysicalMaterial({color:'#b39478',roughness:1,sheen:.2}),
    plinth:new THREE.MeshStandardMaterial({color:'#4a4239',roughness:.95})
  };
  const beds=new THREE.Group();beds.name='ninas:camas';
  for(const b of BEDS)beds.add(bed(THREE,b,m));
  beds.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  ctx.group.add(beds);ctx.lightRuntimeObject(beds);
  beds.traverse(o=>{if(o.isMesh)ctx.staticMeshes.push(o);});
  // Contact shade on the rug round each base.
  const bedShadows=new THREE.Group();bedShadows.name='ninas:sombras-camas';
  for(const {cz} of BEDS)bedShadows.add(rectShadow(THREE,HEAD_X-BED_L/2,cz,BED_L/2,WH,.07,.5));
  ctx.group.add(bedShadows);

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
  // centres, rebuilt smaller (34/36 cm, 45 cm high) standing on the floor in greige
  // linen with a lid seam, as the one between the beds in render 7, with a soft
  // contact shadow.
  ctx.removeExported({material:'wood',box:[[17.85,0,-8.05],[18.36,.6,-7.55]]});
  ctx.removeExported({material:'wood',box:[[17.85,0,-6.6],[18.37,.6,-6.0]]});
  const drums=new THREE.Group();drums.name='ninas:mesillas';
  const drumMat=new THREE.MeshPhysicalMaterial({color:'#c9b9a6',map,normalMap,normalScale:new THREE.Vector2(.6,.6),roughness:.95,sheen:.25,sheenRoughness:.7,sheenColor:'#efe4d6'});
  for(const [x,z,r] of NIGHTSTANDS)drums.add(drum(THREE,x,z,r,drumMat));
  ctx.group.add(drums);ctx.lightRuntimeObject(drums);
  const shadows=new THREE.Group();shadows.name='ninas:sombras';
  for(const [x,z,r] of NIGHTSTANDS)shadows.add(contactShadow(THREE,x,z,r));
  ctx.group.add(shadows);

  // Upholstered bed bases in the light greige linen of render 7, a step darker
  // than the duvet so the drop reads against them.
  for(const piece of ctx.splitExported({material:'fabric',box:[[16.3,.05,-9.1],[18.45,.32,-6.55]]}))piece.material.color.set('#b5a796');

  // Sconce (render 7): brushed brass backplate, arm, stem and collar under the globe,
  // instead of the exported dark bar.
  ctx.removeExported({material:'bronze',box:[[18.2,.85,-7.95],[18.45,1.25,-7.7]]});
  const lamp=sconce(THREE);ctx.group.add(lamp);ctx.lightRuntimeObject(lamp);

  // Framed nursery print above the sconce, centred between the headboards.
  const art=print(ctx);ctx.group.add(art);ctx.lightRuntimeObject(art);

}
