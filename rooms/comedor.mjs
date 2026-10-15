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
// - Linear wall light. model_source places it (and the two relief panels) 1-4 cm
//   behind the finished east wall face (x 12.967), so it was never seen nor baked.
//   It is drawn here on that face (bronze bar, LED underside) and its grazing wash is
//   added to the baked light of the wall in the shader (closed form of a line source
//   4.5 cm off the wall, strong downward, weaker upward, fanning out at the ends; the
//   plaster relief catches it). Relative to the wall's own baked light, so it holds
//   if the bake changes.
// - Table top rebuilt (the exported one had stretched, vertical grain on its edge):
//   100 x 237 cm, R 10 cm corners, crisp 2 cm edge with a rounded arris and an
//   undercut below, oak veneer running the length on the top and round the edge.
// - Contact: chairs darken where they tuck under the top and on their undersides
//   (vertex occlusion); deeper shadow under the top and at the pedestals.

// Seat centres of the six exported chairs (world metres, measured from house.bin) and
// which side their back is on: west row backs to -x, east row to +x.
const CHAIRS=[[11.352,-7.070,-1],[11.078,-6.440,-1],[11.352,-5.810,-1],[12.182,-7.070,1],[12.182,-6.440,1],[12.182,-5.810,1]];
const PEDESTALS=[[11.767,-7.137],[11.767,-5.740]];
const TABLE={x0:11.267,x1:12.267,z0:-7.625,z1:-5.255};

// Finished east wall face and the wall light on it (model_source 'Aplique comedor').
const WALL_X=12.967;
const SCONCE={z0:-7.661,z1:-5.488,y0:1.730,y1:1.756,depth:.025};
// Wash relative to the wall's baked light: a tight grazing term (source d metres off
// the wall, peak gain at the bar) and a broad one (light bounced off floor and table).
// base: the bake lights this wall about 20 % above render 2 (daylight from the facade,
// the render is an evening scene), which left the wall a flat bright plane.
const WASH={y:1.735,tight:{d:.045,down:12.0,up:8.0},broad:{d:.3,down:.25,up:.08},base:.85,color:[1,.80,.60]};
const TOP={y0:.715,y1:.76,r:.10,arris:.004,edge:.02,under:.03};

const SEAT={r:.215,squash:.95,top:.474,bottom:.392,edge:.042,foot:.012};
const BACK={r:.218,half:62*Math.PI/180,cap:.075,thick:.025,height:.088,y:.716,lean:.14,n:3.2};

export async function apply(ctx){
  const {THREE}=ctx;
  // The cove wash of the raised ceiling is now shared (lightmap.mjs upCoves).
  // Drop the exported chairs (cushions, backs, legs); the table stays.
  const boxes=CHAIRS.map(([x,z,s])=>[[x-.32,-.1,z-.26],[x+.32,1.0,z+.26]]);
  ctx.removeExported({material:['fabric','dark'],box:boxes});

  // Close woven upholstery of the render: the linen weave and its normals on a
  // greige taupe, matte, with a soft sheen of the same hue (a light sheen read as plastic).
  const fabric=ctx.cloneMaterial(ctx.mats.linen);
  fabric.color.set('#a59a8e');fabric.roughness=.94;fabric.sheen=.3;fabric.sheenRoughness=.9;fabric.sheenColor.set('#b9ae9f');
  fabric.normalScale.multiplyScalar(1.7);
  const legs=ctx.cloneMaterial(ctx.mats.dark);legs.roughness=.38;

  const seatGeo=seat(THREE),backGeo=back(THREE),legGeo=new THREE.CylinderGeometry(.0105,.0075,1,7,1,true);
  legGeo.translate(0,.5,0);
  const cloth=[],metal=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1);
  for(const [x,z,side] of CHAIRS){
    const chair=new THREE.Matrix4().compose(new THREE.Vector3(x,0,z),q.setFromAxisAngle(new THREE.Vector3(0,1,0),side<0?0:Math.PI),one);
    cloth.push([seatGeo,chair],[backGeo,chair]);
    // Front legs splay slightly; rear legs run up behind the seat into the back band.
    const post=a=>[BACK.r*Math.cos(Math.PI+a),BACK.r*Math.sin(Math.PI+a)];
    for(const sz of [-1,1]){
      metal.push([legGeo,m.copy(chair).multiply(rod(THREE,[.165,0,sz*.165],[.135,SEAT.bottom+.004,sz*.14]))]);
      const [px,pz]=post(sz*48*Math.PI/180);
      metal.push([legGeo,m.copy(chair).multiply(rod(THREE,[px-.035,0,pz*1.06],[px+.006,BACK.y,pz]))]);
    }
  }
  const clothGeo=merge(THREE,cloth);occlude(THREE,clothGeo);fabric.vertexColors=true;
  const chairs=new THREE.Group();chairs.name='comedor:sillas';
  chairs.add(new THREE.Mesh(clothGeo,fabric),new THREE.Mesh(merge(THREE,metal),legs));
  chairs.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  ctx.group.add(chairs);ctx.lightRuntimeObject(chairs);

  // Contact shadows: soft decals just above the floor, one mesh (opacity per decal in
  // the vertex alpha).
  const decals=[],plane=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  const decal=(x,z,w,d,opacity)=>{
    const g=plane.clone().scale(w,1,d).translate(x,.0015,z);
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
  for(const [x,z] of PEDESTALS){decal(x,z,.62,.62,.5);decal(x,z,.42,.42,.55);}
  decal((TABLE.x0+TABLE.x1)/2,(TABLE.z0+TABLE.z1)/2,(TABLE.x1-TABLE.x0)*1.25,(TABLE.z1-TABLE.z0)*1.1,.34);
  const shadow=new THREE.Mesh(merge(THREE,decals.map(g=>[g,null]),['position','uv','color']),new THREE.MeshBasicMaterial({map:shadowTexture(THREE),color:'#1c140d',vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:true}));
  shadow.renderOrder=-1;shadow.name='comedor:sombra';ctx.group.add(shadow);

  tableTop(ctx);
  wallLight(ctx);
}

// Table top: the exported slab goes; a new one with a crisp edge and veneer grain.
function tableTop(ctx){
  const {THREE}=ctx;
  ctx.removeExported({material:'wood',box:[[TABLE.x0-.05,TOP.y0-.02,TABLE.z0-.05],[TABLE.x1+.05,TOP.y1+.01,TABLE.z1+.05]]});
  const cx=(TABLE.x0+TABLE.x1)/2,cz=(TABLE.z0+TABLE.z1)/2,hx=(TABLE.x1-TABLE.x0)/2,hz=(TABLE.z1-TABLE.z0)/2,R=TOP.r;
  // Rounded-rectangle outline inset by o: points, outward normals, arc length.
  const outline=o=>{
    const pts=[];
    for(const [sx,sz,a0] of [[1,1,0],[-1,1,Math.PI/2],[-1,-1,Math.PI],[1,-1,1.5*Math.PI]])
      for(let k=0;k<=8;k++){const a=a0+k/8*Math.PI/2,c=Math.cos(a),s=Math.sin(a);pts.push([cx+sx*(hx-R)+(R-o)*c,cz+sz*(hz-R)+(R-o)*s,c,s]);}
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
  // Honey white oak of render 2, satin (catches the cove in a soft sheen).
  const oak=ctx.cloneMaterial(ctx.mats.wood);oak.color.set('#e8d6c0');oak.roughness=.5;oak.normalScale.set(.6,.6);
  const top=new THREE.Mesh(g,oak);top.name='comedor:mesa';top.castShadow=top.receiveShadow=false;
  ctx.group.add(top);ctx.lightRuntimeObject(top);
}

// Linear wall light on the east wall and its wash on the plaster.
function wallLight(ctx){
  const {THREE}=ctx,{z0,z1,y0,y1,depth}=SCONCE,len=z1-z0;
  const bronze=ctx.cloneMaterial(ctx.mats.bronze);bronze.roughness=.42;
  const bar=new THREE.Mesh(new THREE.BoxGeometry(depth,y1-y0,len),bronze);
  bar.position.set(WALL_X-depth/2,(y0+y1)/2,(z0+z1)/2);bar.name='comedor:aplique';
  ctx.group.add(bar);ctx.lightRuntimeObject(bar);
  const led=new THREE.Mesh(new THREE.PlaneGeometry(.012,len-.02).rotateX(Math.PI/2),ctx.mats.led);
  led.position.set(WALL_X-depth/2,y0-.0005,(z0+z1)/2);led.name='comedor:aplique LED';ctx.group.add(led);

  // Grazing wash: a uniform line source at distance d from the wall, emitting up or
  // down (cosine about the vertical). On the wall, E ~ d|dy| * integral of dz/r^4 over
  // the bar, in closed form; normalised to 1 at its peak (|dy| = d/sqrt2, mid-bar).
  const f=(d,dy)=>d*Math.abs(dy)*Math.PI/2/Math.pow(dy*dy+d*d,1.5);
  const term=({d,down,up},name)=>{
    const peak=f(d,d/Math.SQRT2);
    return `{float d=${d.toFixed(3)},r2=dy*dy+d*d,r=sqrt(r2);
      float u1=${z1.toFixed(3)}-houseWorld.z,u0=${z0.toFixed(3)}-houseWorld.z;
      float G=u1/(2.0*r2*(r2+u1*u1))+atan(u1/r)/(2.0*r2*r)-u0/(2.0*r2*(r2+u0*u0))-atan(u0/r)/(2.0*r2*r);
      ${name}+=(dy<0.0?${down.toFixed(3)}:${up.toFixed(3)})*d*abs(dy)*G/${peak.toFixed(4)};}`;
  };
  const [cr,cg,cb]=WASH.color;
  for(const piece of ctx.splitExported({material:'wall',box:[[WALL_X-.02,-.1,-8.8],[WALL_X+.02,2.6,-4.7]]})){
    const mat=piece.material,prev=mat.onBeforeCompile,key=mat.customProgramCacheKey();
    mat.onBeforeCompile=function(shader,renderer){
      prev.call(this,shader,renderer);
      shader.fragmentShader=shader.fragmentShader.replace(/(vec3 bakedE=bakedSqrt\*bakedSqrt\*[\d.]+;)/,`$1
        if(houseNormal.x<-.5){
          float dy=houseWorld.y-${WASH.y.toFixed(3)},tight=0.0,broad=0.0;
          ${term(WASH.tight,'tight')}
          ${term(WASH.broad,'broad')}
          // Grazing light shows the plaster relief: perturbed against flat normal.
          vec3 sconceL=normalize(vec3(-${WASH.tight.d.toFixed(3)},-dy,0.0));
          vec3 sconceN=inverseTransformDirection(normal,viewMatrix);
          float relief=clamp(max(dot(sconceN,sconceL),0.0)/max(dot(normalize(houseNormal),sconceL),.05),.55,1.8);
          bakedE*=${WASH.base.toFixed(2)};
          bakedE+=vec3(${cr.toFixed(2)},${cg.toFixed(2)},${cb.toFixed(2)})*dot(bakedE,vec3(.2126,.7152,.0722))*(tight*relief+broad);
        }`);
    };
    mat.customProgramCacheKey=()=>key+'-comedorSconce';mat.needsUpdate=true;
  }
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
      const inside=Math.min(x-TABLE.x0,TABLE.x1-x,z-TABLE.z0,TABLE.z1-z);
      ao*=1-.4*s(-.05,.12,inside);
    }
    col[i*3]=col[i*3+1]=col[i*3+2]=ao;
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
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
// flat parts, more on the rounds (silhouette); normals come from the profile tangent.
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
  let s=0;return pts.map((p,i)=>{
    if(i)s+=Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]);
    const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
    let tr=b[0]-a[0],ty=b[1]-a[1];const l=Math.hypot(tr,ty)||1;tr/=l;ty/=l;
    return {r:p[0],y:p[1],s,nr:-ty,ny:tr};
  });
}
function seat(THREE){
  const prof=seatProfile(),sq=SEAT.squash,seg=36,pos=[],nor=[],uv=[],idx=[];
  for(const p of prof)for(let i=0;i<=seg;i++){
    const a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
    pos.push(p.r*c,p.y,p.r*sq*s);
    const nx=p.nr*c,nz=p.nr*s/sq,l=Math.hypot(nx,p.ny,nz)||1;nor.push(nx/l,p.ny/l,nz/l);
    // Polar unroll: planar on the top, continuing down the rim in metres (no seam).
    uv.push(p.s*c,p.s*s);
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
