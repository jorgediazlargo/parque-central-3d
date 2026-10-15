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
// Raised ceiling (render 2): its cove is baked about five times brighter than the
// render's, so the whole 1.2 m strip clipped to a flat white cut-out. The bake keeps
// the right fall-off (edge ~40, 0.3 m ~13, centre ~6.5 against ~1.5 on the lower
// ceiling); only the cove's share above the room's ambient is scaled down here, so the
// wash grades from a bright edge to the ceiling tone as in the render.

// Seat centres of the six exported chairs (world metres, measured from house.bin) and
// which side their back is on: west row backs to -x, east row to +x.
const CHAIRS=[[11.352,-7.070,-1],[11.078,-6.440,-1],[11.352,-5.810,-1],[12.182,-7.070,1],[12.182,-6.440,1],[12.182,-5.810,1]];
const PEDESTALS=[[11.767,-7.137],[11.767,-5.740]];
const TABLE={x0:11.267,x1:12.267,z0:-7.625,z1:-5.255};

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
  const chairs=new THREE.Group();chairs.name='comedor:sillas';
  chairs.add(new THREE.Mesh(merge(THREE,cloth),fabric),new THREE.Mesh(merge(THREE,metal),legs));
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
  for(const [x,z] of PEDESTALS)decal(x,z,.62,.62,.45);
  decal((TABLE.x0+TABLE.x1)/2,(TABLE.z0+TABLE.z1)/2,(TABLE.x1-TABLE.x0)*1.15,(TABLE.z1-TABLE.z0)*1.06,.16);
  const shadow=new THREE.Mesh(merge(THREE,decals.map(g=>[g,null]),['position','uv','color']),new THREE.MeshBasicMaterial({map:shadowTexture(THREE),color:'#1c140d',vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:true}));
  shadow.renderOrder=-1;shadow.name='comedor:sombra';ctx.group.add(shadow);
}

// Raised dining ceiling (house.json coves[1], 2.55 m) and its riser faces: the baked
// irradiance above the room's ambient (the cove's own share) is scaled down.
const COVE_BOX=[[11.10,2.31,-7.94],[12.44,2.70,-4.68]];
const COVE_AMBIENT=2.0,COVE_GAIN=.3;
function coveWash(ctx){
  for(const piece of ctx.splitExported({material:'wall',box:COVE_BOX})){
    const mat=piece.material,prev=mat.onBeforeCompile,key=mat.customProgramCacheKey();
    mat.onBeforeCompile=function(shader,renderer){
      prev.call(this,shader,renderer);
      shader.fragmentShader=shader.fragmentShader.replace(/(vec3 bakedE=bakedSqrt\*bakedSqrt\*[\d.]+;)/,`$1
        {float coveL=dot(bakedE,vec3(.2126,.7152,.0722));
        bakedE*=coveL>${COVE_AMBIENT.toFixed(2)}?(${COVE_AMBIENT.toFixed(2)}+${COVE_GAIN.toFixed(2)}*(coveL-${COVE_AMBIENT.toFixed(2)}))/coveL:1.0;}`);
    };
    mat.customProgramCacheKey=()=>key+'-comedorCove';mat.needsUpdate=true;
  }
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
