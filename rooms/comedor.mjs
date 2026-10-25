// Room module: comedor. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/comedor.json).
//
// Render 2 dining chairs: the exported ones (model_source.chair) had a 12-sided tube
// for a back and baked light on a coarse atlas, so their upholstery read as faceted and
// blotchy. They are rebuilt at the same places as smooth parametric upholstery (round
// seat cushion, curved band back with rounded ends, slim dark legs whose rear pair
// rises into the back), with metric UVs for the shared linen and probe light. Contact
// shadows (soft decals) settle the chairs and the table pedestals on the porcelain.
// Round 6: about 2.3k triangles per chair (analytic normals keep them smooth) and all
// six merged into one mesh per material; the decals are one mesh too.
//
// Round 7 (render 2):
// - F05 has no wall light in the dining room (its light is the cove and the pendant
//   over the table, both exported): the linear wall light of render 2 is gone.
// - Table top rebuilt (the exported one had stretched, vertical grain on its edge):
//   100 x 237 cm, R 10 cm corners, crisp 2 cm edge with a rounded arris and an
//   undercut below, oak veneer running the length on the top and round the edge.
// - Contact: chairs darken where they tuck under the top and on their undersides
//   (vertex occlusion); deeper shadow under the top and at the pedestals.
//
// Table (15 Oct, plan over renders 24 Oct): the B01 rectangle of 100 x 237 cm with
// R 10 cm corners (not the racetrack of renders 2 and 2a), at the execution project's
// B01 position (5 cm east of the older one, chairs with it); honey oak less orange; the two dark B01 drum
// pedestals become oak ones, slim under the top and flaring to the floor; and the
// small stone cylinder in the middle becomes the wide, low taupe bowl of the render.

import {upholstery,CHAIR_WEAVE} from './salon.mjs';

// Seat centres of the six exported chairs (world metres, measured from house.bin) and
// which side their back is on: west row backs to -x, east row to +x.
const CHAIRS=[[11.403,-7.070,-1],[11.129,-6.440,-1],[11.403,-5.810,-1],[12.233,-7.070,1],[12.233,-6.440,1],[12.233,-5.810,1]];
const PEDESTALS=[[11.818,-7.137],[11.818,-5.740]];
const TABLE={x0:11.318,x1:12.318,z0:-7.625,z1:-5.255};

const TOP={y0:.715,y1:.76,r:.10,arris:.004,edge:.02,under:.03};
// Pedestal radii (m): under the top, slimmest, at the floor; the waist height.
const PEDESTAL={top:.07,waist:.05,foot:.18,neck:.56};
// Bowl at the B01 'Cuenco comedor' point: outer radius, height, wall, foot ring.
const BOWL={x:11.819,z:-6.555,r:.23,h:.085,wall:.011,foot:.085};

// Oak tint: cool, like the kitchen oak, because the coves and downlights over the table
// are warm; the top then reads honey (R/G 1.34-1.45, G/B 1.4-1.55 on screen; renders 2
// and 2a: 1.4 / 1.5), not orange. Stoneware bowl; share of the veneer figure kept.
const OAK='#c4cad4',CLAY='#9c9084',FIGURE=.55;

const SEAT={r:.215,squash:.95,top:.474,bottom:.392,edge:.042,foot:.012};
const BACK={r:.218,half:62*Math.PI/180,cap:.075,thick:.025,height:.088,y:.716,lean:.14,n:3.2};

export async function apply(ctx){
  const {THREE}=ctx;
  // The cove wash of the raised ceiling is now shared (lightmap.mjs upCoves).
  // Drop the exported chairs (cushions, backs, legs); the table stays.
  const boxes=CHAIRS.map(([x,z,s])=>[[x-.32,-.1,z-.26],[x+.32,1.0,z+.26]]);
  ctx.removeExported({material:['fabric','dark'],box:boxes});

  // Same upholstery as the salon armchairs, as in renders 2 and 2a: the heathered taupe
  // wool weave of rooms/salon.mjs (texture, scale and slubs). The table gets more neutral
  // daylight than the armchairs, so the cool grey base read grey here: a touch warmer
  // base gives the same taupe (R/G 1.15 -> 1.2 in the render 2 pose).
  const fabric=await upholstery(ctx,ctx.mats.linen,{...CHAIR_WEAVE,color:'#a29da2',key:'dining'});
  const legs=ctx.cloneMaterial(ctx.mats.dark);legs.roughness=.38;

  const seatGeo=seat(THREE),backGeo=back(THREE),legGeo=new THREE.CylinderGeometry(.0105,.0075,1,7,1,true);
  legGeo.translate(0,.5,0);
  const cloth=[],metal=[],q=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1);
  for(const [x,z,side] of CHAIRS){
    const chair=new THREE.Matrix4().compose(new THREE.Vector3(x,0,z),q.setFromAxisAngle(new THREE.Vector3(0,1,0),side<0?0:Math.PI),one);
    cloth.push([seatGeo,chair],[backGeo,chair]);
    // Front legs splay slightly; rear legs run up behind the seat into the back band.
    const post=a=>[BACK.r*Math.cos(Math.PI+a),BACK.r*Math.sin(Math.PI+a)];
    for(const sz of [-1,1]){
      metal.push([legGeo,chair.clone().multiply(rod(THREE,[.165,0,sz*.165],[.135,SEAT.bottom+.004,sz*.14]))]);
      const [px,pz]=post(sz*48*Math.PI/180);
      metal.push([legGeo,chair.clone().multiply(rod(THREE,[px-.035,0,pz*1.06],[px+.006,BACK.y,pz]))]);
    }
  }
  const clothGeo=merge(THREE,cloth);occlude(THREE,clothGeo);
  const chairs=new THREE.Group();chairs.name='comedor:sillas';
  chairs.add(new THREE.Mesh(clothGeo,fabric),new THREE.Mesh(merge(THREE,metal),legs));
  chairs.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  ctx.group.add(chairs);ctx.lightRuntimeObject(chairs);

  // Contact shadows: soft decals just above the floor, one mesh (opacity per decal in
  // the vertex alpha).
  const decals=[],plane=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  const decal=(x,z,w,d,opacity,y=.0015)=>{
    const g=plane.clone().scale(w,1,d).translate(x,y,z);
    g.setAttribute('color',new THREE.Float32BufferAttribute(new Array(4).fill([1,1,1,opacity]).flat(),4));
    decals.push(g);
  };
  for(const [x,z,side] of CHAIRS){
    decal(x+side*.02,z,.60,.56,.36);
    const cos=side<0?1:-1;
    for(const sz of [-1,1]){
      decal(x+cos*.165,z+sz*.165,.075,.075,.7);
      const [px,pz]=[BACK.r*Math.cos(Math.PI+sz*48*Math.PI/180),BACK.r*Math.sin(Math.PI+sz*48*Math.PI/180)];
      decal(x+cos*(px-.035),z+cos*pz*1.06,.075,.075,.7);
    }
  }
  for(const [x,z] of PEDESTALS){decal(x,z,.62,.62,.5);decal(x,z,.44,.44,.55);}
  decal(BOWL.x,BOWL.z,BOWL.foot*3.2,BOWL.foot*3.2,.5,TOP.y1+.0012);
  decal((TABLE.x0+TABLE.x1)/2,(TABLE.z0+TABLE.z1)/2,(TABLE.x1-TABLE.x0)*1.25,(TABLE.z1-TABLE.z0)*1.1,.34);
  const shadow=new THREE.Mesh(merge(THREE,decals.map(g=>[g,null]),['position','uv','color']),new THREE.MeshBasicMaterial({map:shadowTexture(THREE),color:'#1c140d',vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:true}));
  shadow.renderOrder=-1;shadow.name='comedor:sombra';ctx.group.add(shadow);

  table(ctx);
}

// Table: the exported slab, drum pedestals and bowl go; a racetrack top with a crisp
// edge and veneer grain, oak pedestals and a ceramic bowl replace them.
function table(ctx){
  const {THREE}=ctx;
  ctx.removeExported({material:'wood',box:[[TABLE.x0-.05,TOP.y0-.02,TABLE.z0-.05],[TABLE.x1+.05,TOP.y1+.01,TABLE.z1+.05]]});
  ctx.removeExported({material:'bronze',box:PEDESTALS.map(([x,z])=>[[x-.2,-.05,z-.2],[x+.2,TOP.y0+.01,z+.2]])});
  ctx.removeExported({material:'stone',box:[[BOWL.x-.2,TOP.y1-.01,BOWL.z-.2],[BOWL.x+.2,TOP.y1+.1,BOWL.z+.2]]});
  const cx=(TABLE.x0+TABLE.x1)/2,cz=(TABLE.z0+TABLE.z1)/2,hx=(TABLE.x1-TABLE.x0)/2,hz=(TABLE.z1-TABLE.z0)/2,R=TOP.r;
  // Rounded-rectangle outline inset by o (R = half width: racetrack), points, outward
  // normals, arc length; a corner meeting the next one in the middle is not repeated.
  const outline=o=>{
    const pts=[];
    for(const [sx,sz,a0] of [[1,1,0],[-1,1,Math.PI/2],[-1,-1,Math.PI],[1,-1,1.5*Math.PI]])
      for(let k=0;k<=16;k++){
        const a=a0+k/16*Math.PI/2,c=Math.cos(a),s=Math.sin(a),p=[cx+sx*(hx-R)+(R-o)*c,cz+sz*(hz-R)+(R-o)*s,c,s];
        const q=pts[pts.length-1];if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>1e-6)pts.push(p);
      }
    pts.push(pts[0]);
    let s=0;return pts.map((p,i)=>{if(i)s+=Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]);return [...p,s];});
  };
  // Edge profile (inset, height, normal out, normal up): rounded arris, straight edge,
  // undercut to the underside.
  const {y0,y1,arris:ra,edge,under}=TOP,prof=[];
  for(let k=0;k<=4;k++){const a=Math.PI/2*(1-k/4);prof.push([ra-ra*Math.cos(a),y1-ra+ra*Math.sin(a),Math.cos(a),Math.sin(a)]);}
  prof.push([0,y1-edge,1,0]);
  const ux=under,uy=y1-edge-y0,ul=Math.hypot(ux,uy);
  prof.push([0,y1-edge,uy/ul,-ux/ul],[under,y0,uy/ul,-ux/ul]);
  const pos=[],nor=[],uv=[],idx=[],ring=outline(0).length;
  let along=0;
  for(let j=0;j<prof.length;j++){
    const [o,y,no,nu]=prof[j];if(j)along+=Math.hypot(o-prof[j-1][0],y-prof[j-1][1]);
    for(const [x,z,c,s,len] of outline(o)){pos.push(x,y,z);nor.push(c*no,nu,s*no);uv.push(along,len);}
  }
  for(let j=0;j<prof.length-1;j++)for(let i=0;i<ring-1;i++){const k=j*ring+i;idx.push(k,k+1,k+ring,k+1,k+ring+1,k+ring);}
  // Caps: top (veneer along the length: v runs with z) and underside.
  for(const [o,y,up] of [[ra,y1,1],[under,y0,-1]]){
    const base=pos.length/3,ol=outline(o).slice(0,-1);
    pos.push(cx,y,cz);nor.push(0,up,0);uv.push(cx,cz);
    for(const [x,z] of ol){pos.push(x,y,z);nor.push(0,up,0);uv.push(x,z);}
    for(let i=0;i<ol.length;i++){const a=base+1+i,b=base+1+(i+1)%ol.length;idx.push(...(up>0?[base,b,a]:[base,a,b]));}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeBoundingSphere();
  const oak=oakMaterial(ctx),top=new THREE.Mesh(g,oak);top.name='comedor:mesa';

  // Pedestals: slim oak columns under the top that flare into a wide foot, grain
  // running up; darker high up, in the shadow of the top.
  const smooth=t=>{t=Math.min(1,Math.max(0,t));return t*t*(3-2*t);};
  const {top:rt,waist,foot,neck}=PEDESTAL,col=[];
  for(let i=0;i<=24;i++){
    const y=TOP.y0-.002-(TOP.y0-.012)*i/24;
    col.push([y>neck?waist+(rt-waist)*smooth((y-neck)/(TOP.y0-neck)):waist+(foot-waist)*((neck-y)/neck)**2.6,y]);
  }
  const toe=col[col.length-1][0];
  col.push([toe-.004,.0025],[toe-.012,0]);
  const stem=lathe(THREE,profile(col),40,1,(p,a)=>[a*.06,p.y]);
  const shade=g=>{
    const p=g.getAttribute('position'),c=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++)c[i*3]=c[i*3+1]=c[i*3+2]=.62+.38*smooth((TOP.y0-.05-p.getY(i))/.5);
    g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;
  };
  const stems=shade(merge(THREE,PEDESTALS.map(([x,z])=>[stem,new THREE.Matrix4().makeTranslation(x,0,z)])));
  const legOak=ctx.cloneMaterial(oak);legOak.vertexColors=true;
  const pedestals=new THREE.Mesh(stems,legOak);pedestals.name='comedor:pies mesa';

  // Bowl: wide and low, matte taupe stoneware (inside, over the rim, outside, foot).
  const {r,h,wall,foot:rf}=BOWL,bowl=[],ri=r-wall,yi=.016;
  for(let i=0;i<=10;i++){const f=Math.PI/2*i/10;bowl.push([ri*Math.sin(f),yi+(h-yi)*(1-Math.cos(f))]);}
  for(let i=1;i<6;i++){const t=Math.PI*(1-i/6);bowl.push([r-wall/2+wall/2*Math.cos(t),h+wall/2*Math.sin(t)]);}
  const t0=Math.asin(rf/r),c0=Math.cos(t0);
  for(let i=0;i<=10;i++){const t=Math.PI/2-(Math.PI/2-t0)*i/10;bowl.push([r*Math.sin(t),.006+(h-.006)*(c0-Math.cos(t))/c0]);}
  bowl.push([rf-.003,0],[0,0]);
  const clay=ctx.cloneMaterial(ctx.mats.clay);clay.color.set(CLAY);clay.roughness=.82;
  const dish=new THREE.Mesh(lathe(THREE,profile(bowl),48),clay);dish.name='comedor:cuenco';
  dish.position.set(BOWL.x,TOP.y1,BOWL.z);

  for(const o of [top,pedestals,dish]){o.castShadow=o.receiveShadow=false;ctx.group.add(o);ctx.lightRuntimeObject(o);}
}

// Honey white oak of render 2, satin (catches the cove in a soft sheen). The shared
// veneer map has a bold cathedral figure; the render's top shows fine straight grain,
// so the figure is blended toward its local mean (a blurred mip of the same map).
function oakMaterial(ctx){
  const m=ctx.cloneMaterial(ctx.mats.wood);m.color.set(OAK);m.roughness=.5;m.normalScale.set(.6,.6);
  const prev=m.onBeforeCompile,key=m.customProgramCacheKey();
  m.onBeforeCompile=function(shader,renderer){
    prev.call(this,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      diffuseColor.rgb=mix(diffuse*texture2D(map,vMapUv,5.0).rgb,diffuseColor.rgb,${FIGURE.toFixed(2)});`);
  };
  m.customProgramCacheKey=()=>key+'-comedorOak';
  return m;
}

// Vertex occlusion of the merged upholstery (world space): undersides and the seat
// edge darken; seats tucked under the table top lose most of the ceiling light.
function occlude(THREE,g){
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),col=new Float32Array(p.count*3);
  const s=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),ny=n.getY(i);
    let ao=1;
    if(y<.5){ao=ny<-.5?.5:.62+.38*s(SEAT.bottom+.01,SEAT.top-.01,y);}
    else ao=.8+.2*s(BACK.y-BACK.height*.8,BACK.y+BACK.height*.9,y);
    if(y<TOP.y0){
      const inside=insideTop(x,z);
      ao*=1-.4*s(-.05,.12,inside);
    }
    col[i*3]=col[i*3+1]=col[i*3+2]=ao;
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
}

// Signed distance inside the table top outline (positive under the top).
function insideTop(x,z){
  const cx=(TABLE.x0+TABLE.x1)/2,cz=(TABLE.z0+TABLE.z1)/2,hx=(TABLE.x1-TABLE.x0)/2,hz=(TABLE.z1-TABLE.z0)/2,R=TOP.r;
  const dx=Math.max(0,Math.abs(x-cx)-(hx-R)),dz=Math.max(0,Math.abs(z-cz)-(hz-R));
  return R-Math.hypot(dx,dz);
}

// Concatenates [geometry, matrix|null] pairs (non-indexed or indexed) into one geometry.
function merge(THREE,parts,names=['position','normal','uv']){
  const out={},idx=[];let base=0;for(const n of names)out[n]=[];
  for(const [g0,mat] of parts){
    const g=mat?g0.clone().applyMatrix4(mat):g0,count=g.getAttribute('position').count;
    for(const n of names)out[n].push(...g.getAttribute(n).array);
    if(g.index)for(const i of g.index.array)idx.push(i+base);else for(let i=0;i<count;i++)idx.push(i+base);
    base+=count;
  }
  const r=new THREE.BufferGeometry();
  for(const n of names)r.setAttribute(n,new THREE.Float32BufferAttribute(out[n],n==='uv'?2:n==='color'?4:3));
  r.setIndex(idx);r.computeBoundingSphere();return r;
}

// Matrix taking the unit-height cylinder onto the segment a-b.
function rod(THREE,a,b){
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),len=d.length();
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  return new THREE.Matrix4().compose(A,q,new THREE.Vector3(1,len,1));
}

// Grid surface P(u,v) with normals from the parametric derivatives (exact and smooth,
// no faceting) and caller UVs.
function parametric(THREE,P,nu,nv,uvOf,fallback){
  const pos=[],nor=[],uv=[],idx=[],e=1e-4,a=new THREE.Vector3(),b=new THREE.Vector3(),n=new THREE.Vector3();
  const at=(u,v)=>new THREE.Vector3(...P(u,v));
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
    const u=i/nu,v=j/nv,p=at(u,v);
    a.copy(at(Math.min(1,u+e),v)).sub(at(Math.max(0,u-e),v));
    b.copy(at(u,Math.min(1,v+e))).sub(at(u,Math.max(0,v-e)));
    n.crossVectors(a,b);
    if(!(n.lengthSq()>1e-8*a.lengthSq()*b.lengthSq()))n.set(...fallback(u,v));
    n.normalize();pos.push(p.x,p.y,p.z);nor.push(n.x,n.y,n.z);uv.push(...uvOf(u,v,p));
  }
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
    const k=j*(nu+1)+i;idx.push(k,k+1,k+nu+1,k+1,k+nu+2,k+nu+1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeBoundingSphere();return g;
}

// Seat profile (radius, height): domed top, round edge, flat foot. Few rings on the
// flat parts, more on the rounds (silhouette).
function seatProfile(){
  const {r,top,bottom,edge,foot}=SEAT,pts=[];
  const domeAt=x=>top-.006*(x/r)**2;
  for(let i=0;i<=4;i++){const x=(r-edge)*i/4;pts.push([x,domeAt(x)]);}
  const yc=domeAt(r-edge)-edge*.85,xc=r-edge;
  for(let i=1;i<=6;i++){const a=Math.PI/2*(1-i/6);pts.push([xc+edge*Math.cos(a),yc+edge*.85*Math.sin(a)]);}
  const ybot=bottom+foot;
  pts.push([r,ybot]);
  for(let i=1;i<=3;i++){const a=-Math.PI/2*i/3;pts.push([r-foot+foot*Math.cos(a),ybot+foot*Math.sin(a)]);}
  for(let i=1;i<=2;i++){const x=(r-foot)*(1-i/2);pts.push([x,bottom]);}
  return profile(pts);
}
// [radius, height] points, traversed with the outside on the left (top first, then
// down the side): arc length and normals from the profile tangent.
function profile(pts){
  let s=0;return pts.map((p,i)=>{
    if(i)s+=Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]);
    const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
    let tr=b[0]-a[0],ty=b[1]-a[1];const l=Math.hypot(tr,ty)||1;tr/=l;ty/=l;
    return {r:p[0],y:p[1],s,nr:-ty,ny:tr};
  });
}
// Surface of revolution of a profile, squashed in z; UVs default to a polar unroll
// (planar on the top, continuing down the rim in metres, no seam).
function lathe(THREE,prof,seg,sq=1,uvOf=(p,a)=>[p.s*Math.cos(a),p.s*Math.sin(a)]){
  const pos=[],nor=[],uv=[],idx=[];
  for(const p of prof)for(let i=0;i<=seg;i++){
    const a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
    pos.push(p.r*c,p.y,p.r*sq*s);
    const nx=p.nr*c,nz=p.nr*s/sq,l=Math.hypot(nx,p.ny,nz)||1;nor.push(nx/l,p.ny/l,nz/l);
    uv.push(...uvOf(p,a));
  }
  for(let j=0;j<prof.length-1;j++)for(let i=0;i<seg;i++){
    const k=j*(seg+1)+i;idx.push(k,k+1,k+seg+1,k+1,k+seg+2,k+seg+1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeBoundingSphere();return g;
}
function seat(THREE){return lathe(THREE,seatProfile(),36,SEAT.squash);}
// Curved band back: rounded-rectangle section swept along an arc behind the seat,
// leaning back, closed by rounded ends.
function back(THREE){
  const {r,half,cap,thick,height,y,lean,n}=BACK;
  const capA=cap/r,span=half+capA;
  const se=(c,p)=>Math.sign(c)*Math.abs(c)**(2/p);
  const P=(u,v)=>{
    const phi=span-2*span*u,over=Math.max(0,Math.abs(phi)-half)/capA;
    const kh=Math.max(0,1-over**2.4)**(1/2.4),kt=over<.55?1:Math.sqrt(Math.max(0,1-((over-.55)/.45)**2));
    const psi=v*Math.PI*2-Math.PI/2;
    const t=thick*kt*se(Math.cos(psi),n),h=height*kh*se(Math.sin(psi),n);
    const rr=r+t+h*lean,a=Math.PI+phi;
    return [rr*Math.cos(a),y+h,rr*Math.sin(a)];
  };
  // More columns on the rounded ends than along the plain band.
  const nu=30,warp=u=>{const k=u*2-1;return .5+.5*Math.sign(k)*(1.38*Math.abs(k)-.38*Math.abs(k)**3);};
  const perim=2*(thick+height)*1.75;
  const uvOf=(u,v)=>[2*span*r*warp(u),perim*v];
  return parametric(THREE,(u,v)=>P(warp(u),v),nu,18,uvOf,(u)=>{const a=Math.PI+(span-2*span*warp(u));const s=u<.5?1:-1;return [-Math.sin(a)*s,0,Math.cos(a)*s];});
}

function shadowTexture(THREE){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const grad=g.createRadialGradient(64,64,0,64,64,64);
  for(const [s,a] of [[0,1],[.35,.78],[.6,.4],[.82,.12],[1,0]])grad.addColorStop(s,`rgba(255,255,255,${a})`);
  g.fillStyle=grad;g.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
