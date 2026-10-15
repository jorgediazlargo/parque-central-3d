// Room module: comedor. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/comedor.json).
//
// Render 2 dining chairs: the exported ones (model_source.chair) had a 12-sided tube
// for a back and baked light on a coarse atlas, so their upholstery read as faceted and
// blotchy. They are rebuilt at the same places as smooth parametric upholstery (round
// seat cushion, curved band back with rounded ends, slim dark legs whose rear pair
// rises into the back), with metric UVs for the shared bouclé and probe light. Contact
// shadows (soft decals) settle the chairs and the table pedestals on the porcelain.

// Seat centres of the six exported chairs (world metres, measured from house.bin) and
// which side their back is on: west row backs to -x, east row to +x.
const CHAIRS=[[11.352,-7.070,-1],[11.078,-6.440,-1],[11.352,-5.810,-1],[12.182,-7.070,1],[12.182,-6.440,1],[12.182,-5.810,1]];
const PEDESTALS=[[11.767,-7.137],[11.767,-5.740]];
const TABLE={x0:11.267,x1:12.267,z0:-7.625,z1:-5.255};

const SEAT={r:.215,squash:.95,top:.474,bottom:.392,edge:.042,foot:.012};
const BACK={r:.218,half:62*Math.PI/180,cap:.075,thick:.025,height:.088,y:.716,lean:.14,n:3.2};

export async function apply(ctx){
  const {THREE}=ctx;
  // Drop the exported chairs (cushions, backs, legs); the table stays.
  const boxes=CHAIRS.map(([x,z,s])=>[[x-.32,-.1,z-.26],[x+.32,1.0,z+.26]]);
  ctx.removeExported({material:['fabric','dark'],box:boxes});

  // Close woven upholstery of the render (the shared bouclé reads as cloudy fleece
  // at this scale): the linen weave and its normals on the chairs' greige.
  const fabric=ctx.cloneMaterial(ctx.mats.linen);
  fabric.color.set('#b4a99c');fabric.roughness=.9;fabric.sheen=.45;fabric.sheenRoughness=.75;fabric.sheenColor.set('#e8dfd0');
  const legs=ctx.cloneMaterial(ctx.mats.dark);legs.roughness=.38;

  const seatGeo=seat(THREE),backGeo=back(THREE),legGeo=new THREE.CylinderGeometry(.0105,.0075,1,14,1);
  legGeo.translate(0,.5,0);
  const chairs=new THREE.Group();chairs.name='comedor:sillas';
  for(const [x,z,side] of CHAIRS){
    const c=new THREE.Group();c.position.set(x,0,z);c.rotation.y=side<0?0:Math.PI;
    c.add(new THREE.Mesh(seatGeo,fabric),new THREE.Mesh(backGeo,fabric));
    // Front legs splay slightly; rear legs run up behind the seat into the back band.
    const post=a=>[BACK.r*Math.cos(Math.PI+a),BACK.r*Math.sin(Math.PI+a)];
    for(const sz of [-1,1]){
      c.add(rod(THREE,legGeo,legs,[.165,0,sz*.165],[.135,SEAT.bottom+.004,sz*.14]));
      const [px,pz]=post(sz*48*Math.PI/180);
      c.add(rod(THREE,legGeo,legs,[px-.035,0,pz*1.06],[px+.006,BACK.y,pz]));
    }
    chairs.add(c);
  }
  chairs.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  ctx.group.add(chairs);ctx.lightRuntimeObject(chairs);

  // Contact shadows: soft multiplicative-looking decals just above the floor.
  const blob=shadowTexture(THREE);
  const decal=(x,z,w,d,opacity,rot=0)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:blob,color:'#1c140d',transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:true}));
    m.rotation.set(-Math.PI/2,0,rot);m.position.set(x,.0015,z);m.renderOrder=-1;m.name='comedor:sombra';ctx.group.add(m);return m;
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
}

// A rod between two points (unit-height cylinder stretched along the segment).
function rod(THREE,geo,mat,a,b){
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);
  const m=new THREE.Mesh(geo,mat);m.position.copy(A);m.scale.set(1,d.length(),1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;
}

// Grid surface P(u,v) with normals from the parametric derivatives (exact and smooth,
// no faceting) and caller UVs. u closes on itself when wrapU.
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

// Profile (radius, height, arc length) sampled densely: domed top, round edge, flat foot.
function seatProfile(){
  const {r,top,bottom,edge,foot}=SEAT,pts=[];
  const domeAt=x=>top-.006*(x/r)**2;
  for(let i=0;i<=60;i++){const x=(r-edge)*i/60;pts.push([x,domeAt(x)]);}
  const yc=domeAt(r-edge)-edge*.85,xc=r-edge;
  for(let i=1;i<=60;i++){const a=Math.PI/2*(1-i/60);pts.push([xc+edge*Math.cos(a),yc+edge*.85*Math.sin(a)]);}
  const ybot=bottom+foot;
  for(let i=1;i<=20;i++){pts.push([r,yc+(ybot-yc)*i/20]);}
  for(let i=1;i<=30;i++){const a=-Math.PI/2*i/30;pts.push([r-foot+foot*Math.cos(a),ybot+foot*Math.sin(a)]);}
  for(let i=1;i<=30;i++){const x=(r-foot)*(1-i/30);pts.push([x,bottom]);}
  const len=[0];for(let i=1;i<pts.length;i++)len.push(len[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const total=len.at(-1);
  return {total,at(t){
    const s=t*total;let i=1;while(i<len.length-1&&len[i]<s)i++;
    const f=(s-len[i-1])/((len[i]-len[i-1])||1);
    return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*f,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*f,s];
  }};
}
function seat(THREE){
  const prof=seatProfile(),sq=SEAT.squash;
  const P=(u,v)=>{const [r,y]=prof.at(v),a=u*Math.PI*2;return [r*Math.cos(a),y,r*sq*Math.sin(a)];};
  // Polar unroll: planar on the top, continuing down the rim in metres (no pinch, no seam).
  const uvOf=(u,v)=>{const s=prof.at(v)[2],a=u*Math.PI*2;return [s*Math.cos(a),s*Math.sin(a)];};
  return parametric(THREE,P,64,48,uvOf,(u,v)=>[0,v<.5?1:-1,0]);
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
  const perim=2*(thick+height)*1.75;
  const uvOf=(u,v)=>[2*span*r*u,perim*v];
  return parametric(THREE,P,72,28,uvOf,(u)=>{const a=Math.PI+(span-2*span*u);const s=u<.5?1:-1;return [-Math.sin(a)*s,0,Math.cos(a)*s];});
}

function shadowTexture(THREE){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const grad=g.createRadialGradient(64,64,0,64,64,64);
  for(const [s,a] of [[0,1],[.35,.78],[.6,.4],[.82,.12],[1,0]])grad.addColorStop(s,`rgba(255,255,255,${a})`);
  g.fillStyle=grad;g.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
