// Room module: juegos. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/juegos.json).
//
// Render 8 against B01 (window 0.94 m, guest bench under it, desk west, kids' table east):
// - Roller blind: the exported one (a box with the shared sheer material, ~10× brighter
//   than the walls from behind, so it read as a white emissive panel) becomes a slub
//   linen roller blind: woven canvas texture with a little openness (the outside shows
//   faintly), weighted bottom bar and roller, lit by the probes with a measured
//   diffuse transmission (probes behind it ≈ 135 W/m², walls by it ≈ 10).
// - A pale daylight haze just outside the glass so the view reads as bright daylight.
// - Bench: a sewn seat cushion with a crowned top and piped edge replaces the exported
//   slab and its two arm blocks (render 8 has none); soft cushions (puffy, pinched
//   corners, creases, a settled base, linen weave) as in the render: cream squares
//   against the wall, a bolster, two terracotta pinstriped lumbar cushions and a sage
//   one; a crumpled throw over the front edge.
// - Desk chairs (west) and the kids' table and chairs (east) are rebuilt on their B01
//   footprints and leg positions: solid oak frames (tapered, slightly splayed round legs,
//   aprons, back posts carrying a curved back) with upholstered seats, the table with a
//   rounded-corner top. One merged mesh per material.
// - Round rug with thickness, a scalloped rolled edge and a braided border.
// - Contact shadows under legs, seats, bench and rug, all in one mesh.
// Round 7 (light and finish, no new bake):
// - Window wash: every surface of the room (split walls/ceiling, lacquer, desk, runtime
//   props, and the floor through a multiplicative overlay) takes 1 + K·form factor of the
//   window, clipped by the bench edge, plus a soft glow round it and a decay toward the door.
// - Walls and ceiling: the bake's 10–30 cm stains low-passed once on load (wallLowPass),
//   limewash clouds down to a breath (the plaster grain is the house's, app.js), 60 % of the
//   orange bounce chroma, crisp occlusion creases at the wall/ceiling/corner junctions.
// - Plaster pelmet over the blind; paler oak; slimmer kids' table and chairs; denser
//   contact shadows.

const BLIND={x0:14.565,x1:15.533,top:2.43,bottom:1.45,z:-9.392};
// Diffuse transmission of the blind (patchLighting translucency).
const BLIND_T=.13;


function rand(seed){let s=seed>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

// Slub linen weave: RGB = reflectance detail (0.5 = material colour), A = coverage.
function blindTexture(THREE,linen){
  const N=1024,c=document.createElement('canvas');c.width=c.height=N;
  const g=c.getContext('2d'),r=rand(81);
  // Fine photographed weave (Poly Haven rough linen, 27 cm tile) shown at 18 cm.
  g.fillStyle='#808080';g.fillRect(0,0,N,N);
  if(linen){const k=N/2;for(let y=0;y<N;y+=k)for(let x=0;x<N;x+=k)g.drawImage(linen,x,y,k,k);}
  const base=g.getImageData(0,0,N,N),d=base.data;
  // Weft slubs: thicker, denser horizontal threads of random length (they read at
  // room scale), and thin gaps between picks.
  const dens=new Float32Array(N*N);
  // 1024 px = 60 cm: slubs 2–7 mm thick and 3–45 cm long, so they read from the door.
  for(let i=0;i<520;i++){
    const y=Math.floor(r()*N),x0=Math.floor(r()*N),len=50+r()*r()*700,th=3+Math.floor(r()*r()*10),amp=(r()<.7?1:-1)*(.4+r()*.6);
    for(let t=0;t<len;t++){
      const x=(x0+t)%N,fade=Math.min(1,Math.sin(Math.PI*t/len)*2.5);
      for(let k=0;k<th;k++)dens[((y+k)%N)*N+x]+=amp*fade*Math.sin(Math.PI*(k+.5)/th);
    }
  }
  // Uneven warp: faint vertical bands.
  const warp=new Float32Array(N);for(let i=0;i<60;i++){const x0=Math.floor(r()*N),w=2+Math.floor(r()*6),a=(r()-.5)*.8;for(let k=0;k<w;k++)warp[(x0+k)%N]+=a;}
  for(let y=0;y<N;y++){
    const row=Math.sin(y*Math.PI*2/N*96)*.5+.5;   // picks, ~1.9 mm
    for(let x=0;x<N;x++){
      const i=y*N+x,p=i*4,lin=d[p]/255,s=Math.max(-1.2,Math.min(1.6,dens[i]+warp[x]*.5));
      // Denser slubs: more opaque, but they pass less light (darker against the window).
      const v=Math.min(1,Math.max(0,.5+(lin-.5)*.5-s*.11));
      const a=Math.min(1,Math.max(0,.80+s*.09-(1-row)*.05+(lin-.5)*.2));
      d[p]=d[p+1]=d[p+2]=Math.round(v*255);d[p+3]=Math.round(a*255);
    }
  }
  g.putImageData(base,0,0);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=8;t.premultiplyAlpha=false;return t;
}

// Detail map (grey, 0.5 = own colour) applied with a set amount; optional pinstripes.
function fabricMaterial(THREE,{color,detail,normal,amount=.6,normalScale=.6,stripes=null,key}){
  const m=new THREE.MeshStandardMaterial({color,roughness:.96,metalness:0,normalMap:normal||null});
  if(normal)m.normalScale.set(normalScale,normalScale);
  // Metric UVs: the shared normal texture repeats every 27 cm (set by the caller).
  m.defines={USE_UV:''};
  m.onBeforeCompile=shader=>{
    shader.uniforms.fabricDetail={value:detail};
    shader.uniforms.stripeColor={value:new THREE.Color(stripes?.color||'#ffffff')};
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D fabricDetail;uniform vec3 stripeColor;`).replace('#include <map_fragment>',`#include <map_fragment>
      {vec2 fuv=vUv/.27;
      ${stripes?`float sx=fract(vUv.x/${stripes.pitch.toFixed(4)});
      float sw=smoothstep(.0,.06,sx)*(1.0-smoothstep(${stripes.width.toFixed(3)},${(stripes.width+.06).toFixed(3)},sx));
      diffuseColor.rgb=mix(diffuseColor.rgb,stripeColor,sw*.85);`:''}
      diffuseColor.rgb*=mix(1.0,2.0*texture2D(fabricDetail,fuv).g,${amount.toFixed(3)});}`)
      ;
  };
  m.customProgramCacheKey=()=>'juegos-fabric-'+key;
  return m;
}


// --- Geometry helpers ------------------------------------------------------------------

const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

// Smooth normals over shared positions, keeping creases sharper than `crease` degrees.
function weldNormals(THREE,geo,crease=35){
  const pos=geo.getAttribute('position'),idx=geo.index?geo.index.array:[...Array(pos.count).keys()];
  const key=i=>`${Math.round(pos.getX(i)*1e4)},${Math.round(pos.getY(i)*1e4)},${Math.round(pos.getZ(i)*1e4)}`;
  const keys=[...Array(pos.count)].map((_,i)=>key(i)),faces=new Map(),fn=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let t=0;t<idx.length;t+=3){
    a.fromBufferAttribute(pos,idx[t]);b.fromBufferAttribute(pos,idx[t+1]);c.fromBufferAttribute(pos,idx[t+2]);
    const n=new THREE.Vector3().subVectors(c,b).cross(new THREE.Vector3().subVectors(a,b));fn.push(n);
    for(let k=0;k<3;k++){const q=keys[idx[t+k]];if(!faces.has(q))faces.set(q,[]);faces.get(q).push(n);}
  }
  const cos=Math.cos(crease*Math.PI/180),normal=new Float32Array(pos.count*3),done=new Uint8Array(pos.count);
  for(let i=0;i<pos.count;i++)normal[i*3+1]=1;
  for(let t=0;t<idx.length;t+=3){
    if(fn[t/3].lengthSq()<1e-20)continue;   // degenerate (e.g. a fan centre)
    const own=fn[t/3].clone().normalize();
    for(let k=0;k<3;k++){
      const v=idx[t+k];if(done[v])continue;done[v]=1;
      const s=new THREE.Vector3();for(const n of faces.get(keys[v])){const l=n.length();if(l>1e-12&&n.dot(own)/l>=cos)s.add(n);}
      if(s.lengthSq()<1e-20)s.copy(own);s.normalize();normal.set([s.x,s.y,s.z],v*3);
    }
  }
  geo.setAttribute('normal',new THREE.BufferAttribute(normal,3));return geo;
}

// Box with every edge rounded to r, centred. `mid` subdivides the flat spans (for
// deformation); the oak grain (texture v) runs along axis `grain`. Metric UVs.
function rbox(THREE,w,h,d,r,{seg=3,mid=[1,1,1],grain=1}={}){
  const half=[w/2,h/2,d/2],inner=half.map(a=>Math.max(0,a-r)),pos=[],nor=[],uv=[],idx=[];
  const coords=a=>{const L=[],i=inner[a];
    for(let k=seg;k>=1;k--)L.push(-(i+r*Math.sin(k/seg*Math.PI/2)));
    for(let k=0;k<=mid[a];k++)L.push(-i+2*i*k/mid[a]);
    for(let k=1;k<=seg;k++)L.push(i+r*Math.sin(k/seg*Math.PI/2));return L;};
  for(let a=0;a<3;a++)for(const s of [1,-1]){
    const b=(a+1)%3,c=(a+2)%3,Lb=coords(b),Lc=coords(c),start=pos.length/3;
    for(const vc of Lc)for(const vb of Lb){
      const p=[0,0,0];p[a]=s*half[a];p[b]=vb;p[c]=vc;
      const q=p.map((x,k)=>Math.max(-inner[k],Math.min(inner[k],x))),dir=p.map((x,k)=>x-q[k]),l=Math.hypot(...dir)||1;
      const n=dir.map(x=>x/l),o=q.map((x,k)=>x+n[k]*r);
      pos.push(...o);nor.push(...n);
      if(a!==grain){const other=3-a-grain;uv.push(o[other],o[grain]);}else uv.push(o[b],o[c]);
    }
    const nb=Lb.length;
    for(let j=0;j<Lc.length-1;j++)for(let i=0;i<nb-1;i++){
      const p0=start+j*nb+i,p1=p0+1,p2=p0+nb+1,p3=p0+nb;
      if(s>0)idx.push(p0,p1,p2,p0,p2,p3);else idx.push(p0,p2,p1,p0,p3,p2);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);return geo;
}

// Bend a part (width along x) round a vertical axis, concave toward +z.
function bend(geo,R){
  const p=geo.getAttribute('position');
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),t=x/R,rr=R-z;p.setXYZ(i,rr*Math.sin(t),p.getY(i),R-rr*Math.cos(t));}
  return geo;
}

// Tapered round member from a to b (foot to top), metric UVs with the grain along it.
function rod(THREE,a,b,r0,r1,n=12){
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),dir=B.clone().sub(A),L=dir.length();
  const geo=new THREE.CylinderGeometry(r1,r0,L,n,1,false);
  const uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*2*Math.PI*r0,uv.getY(i)*L);
  const m=new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()),new THREE.Vector3(1,1,1));
  return geo.applyMatrix4(m);
}

// Slab with rounded plan corners (radius rc) and a small edge round (b); grain along z.
function slab(THREE,w,d,t,rc,b){
  const W=w/2-b,D=d/2-b,R=rc-b,s=new THREE.Shape();
  s.moveTo(-W+R,-D);s.lineTo(W-R,-D);s.quadraticCurveTo(W,-D,W,-D+R);s.lineTo(W,D-R);s.quadraticCurveTo(W,D,W-R,D);
  s.lineTo(-W+R,D);s.quadraticCurveTo(-W,D,-W,D-R);s.lineTo(-W,-D+R);s.quadraticCurveTo(-W,-D,-W+R,-D);
  const geo=new THREE.ExtrudeGeometry(s,{depth:t-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:3,curveSegments:6});
  geo.rotateX(-Math.PI/2);geo.translate(0,b,0);   // y from 0 to t
  geo.deleteAttribute('normal');return weldNormals(THREE,geo,25);
}

const place=(THREE,geo,[x,y,z],[rx=0,ry=0,rz=0]=[],order='XYZ')=>
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,order)),new THREE.Vector3(1,1,1)));

// One indexed geometry (position, normal, uv) from many.
function merge(THREE,list){
  let nv=0,ni=0;for(const g of list){nv+=g.getAttribute('position').count;ni+=g.index?g.index.count:g.getAttribute('position').count;}
  const P=new Float32Array(nv*3),N=new Float32Array(nv*3),U=new Float32Array(nv*2),I=new Uint32Array(ni);let v=0,k=0;
  for(const g of list){
    const p=g.getAttribute('position'),n=g.getAttribute('normal'),u=g.getAttribute('uv');
    for(let i=0;i<p.count;i++){P.set([p.getX(i),p.getY(i),p.getZ(i)],(v+i)*3);N.set([n.getX(i),n.getY(i),n.getZ(i)],(v+i)*3);if(u)U.set([u.getX(i),u.getY(i)],(v+i)*2);}
    if(g.index)for(const x of g.index.array)I[k++]=x+v;else for(let i=0;i<p.count;i++)I[k++]=i+v;
    v+=p.count;g.dispose();
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(P,3));geo.setAttribute('normal',new THREE.BufferAttribute(N,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(U,2));geo.setIndex(new THREE.BufferAttribute(I,1));geo.computeBoundingSphere();return geo;
}

// --- Furniture ---------------------------------------------------------------------------

// Chair in local space: seat centred on the origin, facing +z, back at -z. Returns oak
// and upholstery parts plus the feet (local) for the contact shadows.
function chair(THREE,c){
  const wood=[],cloth=[],feet=[];
  const bottom=c.seat-c.board,lx=c.W/2-c.inset,lz=c.D/2-c.inset;
  // Seat board with a softly rounded edge, upholstered pad with a slight crown.
  wood.push(place(THREE,rbox(THREE,c.W,c.board,c.D,.007,{grain:2}),[0,c.seat-c.board/2,0]));
  const pad=rbox(THREE,c.W-2*c.padIn,c.pad,c.D-2*c.padIn,Math.min(c.pad/2-.002,.02),{mid:[4,1,4]});
  {const p=pad.getAttribute('position'),hw=(c.W-2*c.padIn)/2,hd=(c.D-2*c.padIn)/2;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(y>0)p.setY(i,y+c.crown*(1-(x/hw)**2)*(1-(z/hd)**2));}}
  cloth.push(place(THREE,weldNormals(THREE,pad),[0,c.seat+c.pad/2-.002,0]));
  // Aprons between the leg tops.
  for(const s of [1,-1]){
    wood.push(place(THREE,rbox(THREE,2*lx,c.apron,.018,.004,{grain:0}),[0,bottom-c.apron/2,s*lz]));
    wood.push(place(THREE,rbox(THREE,.018,c.apron,2*lz,.004,{grain:2}),[s*lx,bottom-c.apron/2,0]));
  }
  // Legs: tapered, splayed a little; the rear ones run on up as the back posts.
  for(const sx of [1,-1])for(const sz of [1,-1]){
    const foot=[sx*(lx+c.splay),0,sz*(lz+c.splay)];feet.push(foot);
    wood.push(rod(THREE,foot,[sx*lx,bottom+.002,sz*lz],c.legR[1],c.legR[0]));
    if(sz<0)wood.push(rod(THREE,[sx*lx,bottom-.01,-lz],[sx*lx,c.backTop,-lz-c.lean],c.legR[0],c.legR[0]*.85));
  }
  // Curved back across the posts, set just in front of them.
  const postZ=y=>-lz-c.lean*(y-bottom)/(c.backTop-bottom);
  for(const [h,top,t,up] of c.backs){
    const yc=top-h/2,bw=2*lx+c.backOver,R=c.backR,fwd=R*(1-Math.cos(lx/R));
    const g=bend(rbox(THREE,bw,h,t,Math.min(t/2-.001,up?.012:.006),{mid:[10,1,1],grain:0}),R);
    (up?cloth:wood).push(place(THREE,weldNormals(THREE,g),[0,yc,postZ(yc)+c.legR[0]*.85+t/2-fwd]));
  }
  return {wood,cloth,feet};
}

// Bench seat cushion: crowned, slightly bulging sides, piping round both edges.
function benchSeat(THREE,w,h,d){
  const g=rbox(THREE,w,h,d,.035,{mid:[16,2,6],grain:0}),p=g.getAttribute('position'),hw=w/2,hd=d/2;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),side=Math.cos(Math.PI*y/h)*.006;
    const ex=smooth(.93,1,Math.abs(x)/hw),ez=smooth(.85,1,Math.abs(z)/hd);
    const dip=.004*Math.sin(x*7.1+1.3)*Math.sin(z*5.3);   // where it has been sat on
    p.setXYZ(i,x+Math.sign(x)*side*ex,y+(y>0?.011*(1-(x/hw)**4)*(1-(z/hd)**2)+dip*(1-ez):0),z+Math.sign(z)*side*ez*1.2);
  }
  const parts=[weldNormals(THREE,g)];
  const k=.035*(1-Math.SQRT1_2),pw=hw-k,pd=hd-k;
  for(const y of [h/2-k,-h/2+k]){
    const pts=[],rc=.03;
    for(let q=0;q<4;q++){const cx=(q===0||q===3?1:-1)*(pw-rc),cz=(q<2?1:-1)*(pd-rc),a0=q*Math.PI/2;
      for(let s=0;s<=4;s++){const a=a0+s/4*Math.PI/2;pts.push(new THREE.Vector3(cx+rc*Math.cos(a),y+(y>0?.002:0),cz+rc*Math.sin(a)));}}
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true,'centripetal'),180,.0055,6,true));
  }
  return parts;
}

// Round rug: rolled scalloped edge, braided border band; vertex colour shades the braid.
function rugGeometry(THREE,R0,lobes){
  const n=lobes*8,rings=[0,.15,.3,.45,.6,.7,.76,.79,.80,.81,.83,.85,.87,.89,.90,.91,.935,.955,.97,.98,.99,.997,1,1];
  const H=r=>{let h=.010;
    if(r>.79&&r<.91)h+=r<.81||r>.89?-.0015:.0026*Math.sin(Math.PI*(r-.81)/.08);
    if(r>.97)h=.002+.008*Math.sqrt(Math.max(0,1-((r-.97)/.03)**2));return h;};
  const shade=r=>r>.79&&r<.91?(r<.81||r>.89?.82:.9+.06*Math.sin(Math.PI*(r-.81)/.08)):r>.96?.94:1;
  const edge=t=>R0+.022*Math.pow(Math.abs(Math.cos(lobes*t/2)),.7);
  const pos=[],uv=[],col=[],idx=[];
  rings.forEach((r,j)=>{for(let i=0;i<=n;i++){const t=i/n*2*Math.PI,R=edge(t)*r,x=Math.cos(t)*R,z=Math.sin(t)*R;
    pos.push(x,j===rings.length-1?.0005:H(r),z);uv.push(x,z);const s=shade(r);col.push(s,s,s);}});
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;idx.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geo.setIndex(idx);
  return {geo:weldNormals(THREE,geo,60),edge};
}

// Sewn cushion W × H × T (metres), centred, face toward +z, seam in the z=0 plane.
// Pinched sides, rounded puff, corner creases, slow lumps, a base settled flat where it
// sits and a slight forward slump; metric UVs.
function cushionGeometry(THREE,W,H,T,seed){
  const n=24,r=rand(seed),pos=[],uv=[],idx=[];
  const lump=[...Array(6)].map(()=>[r()*6.28,r()*6.28,1+r()*2,1+r()*2,(r()-.5)*.16]);
  const slump=.010+r()*.012;
  for(const side of [1,-1]){
    const start=pos.length/3;
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const u=i/n*2-1,v=j/n*2-1,settle=smooth(-.45,-1,v);
      const x=u*W/2*(1-.07*(1-v*v)+.05*settle),y=v*H/2*(1-.07*(1-u*u))+settle*.012*(1-u*u);
      let f=Math.sqrt(Math.max(0,1-Math.abs(u)**2.6))*Math.sqrt(Math.max(0,1-Math.abs(v)**2.6));
      let wr=0;for(const [a,b,fu,fv,amp] of lump)wr+=amp*Math.sin(fu*u*3.1+a)*Math.sin(fv*v*3.1+b);
      // creases fanning in from each corner
      for(const [cu,cv] of [[1,1],[-1,1],[1,-1],[-1,-1]]){
        const du=u-cu,dv=v-cv,d=Math.hypot(du,dv),ang=Math.atan2(dv,du);
        wr+=Math.exp(-d*2.4)*.26*Math.sin(ang*7+seed+cu*2+cv)*Math.min(1,d*3);
      }
      const z=side*T/2*f*(1+wr*.6)*(1-.4*settle)+slump*((v+1)/2)**2-.004*(1-u*u)*settle;
      pos.push(x,y,z);uv.push((u*.5+.5)*W,(v*.5+.5)*H);
    }
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const a=start+j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;
      if(side>0)idx.push(a,b,d,a,d,c);else idx.push(a,d,b,a,c,d);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();
  return geo;
}

// Throw over the seat's front edge, local x across (centred), world y/z along the drape:
// crumpled on the seat, soft folds deepening as it falls, an uneven hem.
function throwGeometry(THREE){
  const W=.42,nx=40,ns=52,top=.497,zEdge=-8.595,r=.04,z0=-9.03,hang=.22,pos=[],uv=[],idx=[];
  const flat=zEdge-r-z0,arc=Math.PI*r/2,L=flat+arc+hang;
  for(let j=0;j<=ns;j++){
    const s=j/ns*L;let y,z,ny,nz;
    if(s<flat){y=top;z=z0+s;ny=1;nz=0;}
    else if(s<flat+arc){const t=(s-flat)/r;y=top-r+r*Math.cos(t);z=zEdge-r+r*Math.sin(t);ny=Math.cos(t);nz=Math.sin(t);}
    else{const q=Math.min(1,(s-flat-arc)/.04);y=top-r-(s-flat-arc);z=zEdge+.026*q;ny=0;nz=1;}
    const h=Math.max(0,s-flat)/(arc+hang);   // folds deepen as it falls
    for(let i=0;i<=nx;i++){
      const u=i/nx-.5,x=u*W;
      const fold=Math.sin(x*2*Math.PI/.11+1.3+s*3)*(.55+.45*Math.sin(x*23.0))+.45*Math.sin(x*2*Math.PI/.045+.4);
      const crumple=(1-h)*(.006*Math.sin(x*37+s*21)*Math.sin(s*29-x*11)+.004*Math.sin(x*61-s*43));
      const a=.004+.026*h**1.5,lift=Math.abs(fold)*a+Math.max(0,crumple);
      const hem=j===ns?.007*Math.sin(x*9+1):0;
      pos.push(x+fold*.006*h,y+ny*lift+hem,z+nz*lift);uv.push(x+W/2,s);
    }
  }
  for(let j=0;j<ns;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;idx.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();return geo;
}

// Bolster: cylinder with gathered, rounded ends, axis along x.
function bolsterGeometry(THREE,L,R){
  const pts=[];
  for(let i=0;i<=8;i++){const a=i/8*Math.PI/2;pts.push(new THREE.Vector2(R*Math.sin(a)*.98+.002,-L/2+R*.35*(1-Math.cos(a))));}
  for(let i=1;i<=6;i++)pts.push(new THREE.Vector2(R*(1+.015*Math.sin(i*1.7))-.004*Math.sin(Math.PI*i/7)**8,-L/2+R*.35+(L-R*.7)*i/7));
  for(let i=8;i>=0;i--){const a=i/8*Math.PI/2;pts.push(new THREE.Vector2(R*Math.sin(a)*.98+.002,L/2-R*.35*(1-Math.cos(a))));}
  const geo=new THREE.LatheGeometry(pts,32);geo.rotateZ(Math.PI/2);
  // Settled: a little flatter where it rests on the seat.
  const p=geo.getAttribute('position');for(let i=0;i<p.count;i++){const y=p.getY(i);if(y<0)p.setY(i,y*.88);}
  const uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*2*Math.PI*R,uv.getY(i)*L);
  geo.computeVertexNormals();return geo;
}

// --- Window light (round 7) ----------------------------------------------------------------
// Render 8: the blind bathes bench, floor and walls in a warm wash that falls off toward the
// door. In real time, without a new bake: the irradiance of every surface in the room is
// scaled by 1 + K·w(p,n), where w is the projected solid angle (form factor × π) of the
// window seen from p, clipped by the bench's front edge for points below the seat. The
// window of the plan is 0.94 m (render: about 1.8 m): the emitter is the render's,
// 1.75 × 1.50 m centred on the blind at z −9.39, so the wash spreads as in the photo. Multiplying keeps the baked shadows (under the table, behind the
// cushions) and adds the gradient; w is soft-capped so the cushions by the glass don't clip.
const WASH_K=14.0;
// Daylight share of the wash: 1 by day, 0 at night (ctx.onTimeOfDay), one uniform for all.
const JG_DAY={value:1};
const WASH_GLSL=`
uniform float jgDay;
vec3 jgEdge(vec3 a,vec3 b){
  float x=dot(a,b),y=abs(x);
  float u=.8543985+(.4965155+.0145206*y)*y,v=3.4175940+(4.1616724+y)*y,t=u/v;
  float ts=x>0.0?t:.5*inversesqrt(max(1.0-x*x,1e-7))-t;
  return cross(a,b)*ts;
}
float jgRect(vec3 p,vec3 n,float y0,float y1,float z){
  if(y1<=y0+.002||p.z<=z+.002)return 0.0;
  vec3 a=normalize(vec3(13.85,y0,z)-p),b=normalize(vec3(15.60,y0,z)-p),c=normalize(vec3(15.60,y1,z)-p),d=normalize(vec3(13.85,y1,z)-p);
  return max(0.0,-.5*dot(jgEdge(a,b)+jgEdge(b,c)+jgEdge(c,d)+jgEdge(d,a),n));
}
float jgLift(vec3 p,vec3 n){
  if(p.x<13.0||p.x>15.74||p.z<-9.8||p.z>-4.78||p.y>2.6)return 1.0;
  float yb=.90;
  // Bench front edge (seat 0.49 m at z −8.60) hides the low part of the window; light
  // off the pale seat still reaches the floor, so the edge counts at 0.30 m.
  if(p.z>-8.58&&p.y<.30&&p.x>13.6&&p.x<15.72)yb=max(yb,p.y+(.30-p.y)/(-8.60-p.z)*(-9.39-p.z));
  float w=jgRect(p,n,yb,2.40,-9.39);
  // Bounce of that light: a soft glow round the window whatever the facing.
  float d=length(p-vec3(15.05,1.2,-9.3)),b=.45*exp(-d/1.1);
  // and its decay toward the door: the far end of the room a little dimmer.
  float far=.80+.20*exp(-d/2.0);
  // The floor sees the window at a grazing angle: a larger share for it.
  return mix(1.0,far*(1.0+b+${WASH_K.toFixed(3)}*(1.0+2.2*max(n.y,0.0)*step(p.y,.08))*w/(1.0+4.0*w)),jgDay);
}
`;
// Warm daylight through linen.
const WASH_TINT='vec3(1.0,.955,.885)';

// Low-pass of the baked light on the room's main faces (north wall either side of the
// window, east wall, west wall by the window, ceiling). The denoised bake leaves 10–30 cm
// darker patches on these big plain faces (render 8: smooth light). Done once on load, in
// world space at 3 cm: each map texel takes 48 taps within 32 cm of the bake (read from the
// lightmap pages, mapped through the triangle that holds each tap, so chart seams don't
// matter), taps clamped to the face. The shader scales the bake by blurred / own luminance:
// one fetch per fragment (a 12-tap blur in the shader cost ~7 FPS here).
function wallLowPass(THREE,ctx,pieces){
  const RES=.03,RAD=.32,TAPS=48,RP=(ctx.lightmap?.data?.range||64)*Math.PI,pages=ctx.lightmap?.pages||[];
  const faces=[
    {name:'N',axes:[0,1],lo:[13.63,0],hi:[15.70,2.55],test:(n,c)=>n[2]>.5&&Math.abs(c[2]+9.48)<.01},
    {name:'E',axes:[2,1],lo:[-9.48,0],hi:[-4.85,2.55],test:(n,c)=>n[0]<-.5&&Math.abs(c[0]-15.70)<.01},
    {name:'W',axes:[2,1],lo:[-9.48,0],hi:[-8.47,2.55],test:(n,c)=>n[0]>.5&&Math.abs(c[0]-13.63)<.01},
    {name:'C',axes:[0,2],lo:[13.07,-9.48],hi:[15.70,-4.85],test:(n,c)=>n[1]<-.5&&Math.abs(c[1]-2.55)<.01}];
  for(const f of faces)f.tris=[];
  const canvas=document.createElement('canvas'),g=canvas.getContext('2d',{willReadFrequently:true});
  for(const piece of pieces){
    const geo=piece.geometry,P=geo.getAttribute('position'),N=geo.getAttribute('normal'),U=geo.getAttribute('uv1');
    for(let i=0;i+2<P.count;i+=3){
      const n=[N.getX(i),N.getY(i),N.getZ(i)],c=[0,1,2].map(k=>(P.getComponent(i,k)+P.getComponent(i+1,k)+P.getComponent(i+2,k))/3);
      const f=faces.find(f=>f.test(n,c));if(!f)continue;
      const t=[0,1,2].map(j=>f.axes.map(a=>P.getComponent(i+j,a))),b=[0,1,2].map(j=>[U.getX(i+j)*2,U.getY(i+j)]);
      const page=Math.min(1,Math.floor(Math.min(b[0][0],b[1][0],b[2][0])+1e-6)),img=pages[page]?.image;if(!img)continue;
      const W=img.width,H=img.height,us=b.map(q=>(q[0]-page)*W),vs=b.map(q=>q[1]*H);
      const x0=Math.max(0,Math.floor(Math.min(...us))-2),y0=Math.max(0,Math.floor(Math.min(...vs))-2);
      const w=Math.min(W,Math.ceil(Math.max(...us))+2)-x0,h=Math.min(H,Math.ceil(Math.max(...vs))+2)-y0;
      canvas.width=w;canvas.height=h;g.drawImage(img,x0,y0,w,h,0,0,w,h);
      const d=g.getImageData(0,0,w,h).data,L=new Float32Array(w*h);
      for(let k=0;k<w*h;k++){const a=d[k*4+3]/65025,r=d[k*4]*a,gg=d[k*4+1]*a,bb=d[k*4+2]*a;L[k]=(.2126*r*r+.7152*gg*gg+.0722*bb*bb)*RP;}
      const e1=[t[1][0]-t[0][0],t[1][1]-t[0][1]],e2=[t[2][0]-t[0][0],t[2][1]-t[0][1]],det=e1[0]*e2[1]-e2[0]*e1[1];
      if(Math.abs(det)<1e-9)continue;
      f.tris.push({t0:t[0],e1,e2,det,us,vs,x0,y0,w,h,L});
    }
  }
  // Baked luminance at an in-plane point of face f (bilinear), or -1 off the face.
  const sample=(f,p)=>{
    for(const q of f.tris){
      const dx=p[0]-q.t0[0],dy=p[1]-q.t0[1],l1=(dx*q.e2[1]-q.e2[0]*dy)/q.det,l2=(q.e1[0]*dy-dx*q.e1[1])/q.det;
      if(l1<-1e-4||l2<-1e-4||l1+l2>1+1e-4)continue;
      const X=Math.min(q.w-1.001,Math.max(0,q.us[0]+l1*(q.us[1]-q.us[0])+l2*(q.us[2]-q.us[0])-q.x0-.5));
      const Y=Math.min(q.h-1.001,Math.max(0,q.vs[0]+l1*(q.vs[1]-q.vs[0])+l2*(q.vs[2]-q.vs[0])-q.y0-.5));
      const ix=Math.floor(X),iy=Math.floor(Y),fx=X-ix,fy=Y-iy,k=iy*q.w+ix;
      return (q.L[k]*(1-fx)+q.L[k+1]*fx)*(1-fy)+(q.L[k+q.w]*(1-fx)+q.L[k+q.w+1]*fx)*fy;
    }
    return -1;
  };
  const taps=[...Array(TAPS)].map((_,i)=>{const r=RAD*Math.sqrt((i+.5)/TAPS),a=i*2.39996;return [r*Math.cos(a),r*Math.sin(a),Math.exp(-r*r/.06)];});
  const smooth=x=>{const t=Math.min(1,Math.max(0,(x-.05)/.2));return t*t*(3-2*t);};
  // Atlas: faces stacked, one empty row between them.
  let AW=0,AH=0;for(const f of faces){f.nx=Math.ceil((f.hi[0]-f.lo[0])/RES);f.ny=Math.ceil((f.hi[1]-f.lo[1])/RES);f.oy=AH;AH+=f.ny+1;AW=Math.max(AW,f.nx+1);}
  const data=new Uint16Array(AW*AH*2),half=THREE.DataUtils.toHalfFloat;
  for(const f of faces){
    if(!f.tris.length)continue;
    for(let j=0;j<f.ny;j++)for(let i=0;i<f.nx;i++){
      const p=[f.lo[0]+(i+.5)*RES,f.lo[1]+(j+.5)*RES],c0=sample(f,p);if(c0<=0)continue;
      let sum=c0,ws=1;
      for(const [ox,oy,wt] of taps){
        const q=[Math.min(f.hi[0]-.001,Math.max(f.lo[0]+.001,p[0]+ox)),Math.min(f.hi[1]-.001,Math.max(f.lo[1]+.001,p[1]+oy))];
        const l=sample(f,q);if(l<0)continue;const w=wt*smooth(l/c0);sum+=l*w;ws+=w;
      }
      const k=((f.oy+j)*AW+i)*2;data[k]=half(sum/ws);data[k+1]=half(1);
    }
  }
  const texture=new THREE.DataTexture(data,AW,AH,THREE.RGFormat,THREE.HalfFloatType);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const defines=faces.map(f=>`#define JG_RECT_${f.name} vec4(${f.tris.length?[(-f.lo[0]/RES)/AW,(f.oy-f.lo[1]/RES)/AH,1/(RES*AW),1/(RES*AH)].map(v=>v.toFixed(7)).join(','):'-1.0,-1.0,0.0,0.0'})`).join('\n')+'\n';
  return {texture,defines};
}

// Shadow atlas: soft blob (left half), ring (right half).
function shadowAtlas(THREE){
  const N=128,c=document.createElement('canvas');c.width=2*N;c.height=N;const g=c.getContext('2d');
  for(const [ox,ring] of [[0,false],[N,true]]){
    const grad=g.createRadialGradient(ox+N/2,N/2,0,ox+N/2,N/2,N/2-1);
    if(ring){grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(.86,'rgba(0,0,0,0)');grad.addColorStop(.885,'rgba(0,0,0,1)');grad.addColorStop(.93,'rgba(0,0,0,.35)');grad.addColorStop(1,'rgba(0,0,0,0)');}
    else{grad.addColorStop(0,'rgba(0,0,0,1)');grad.addColorStop(.45,'rgba(0,0,0,.6)');grad.addColorStop(1,'rgba(0,0,0,0)');}
    g.fillStyle=grad;g.fillRect(ox,0,N,N);
  }
  return new THREE.CanvasTexture(c);
}

export async function apply(ctx){
  const {THREE,group,mats}=ctx;
  const loadImg=url=>new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=url;});
  const [linenImg,linenDetail,linenNormal]=await Promise.all([
    loadImg('./assets/polyhaven/rough_linen/rough_linen_detail_1k.webp'),
    ctx.loadTexture('./assets/polyhaven/rough_linen/rough_linen_detail_1k.webp',{srgb:false}),
    ctx.loadTexture('./assets/polyhaven/rough_linen/rough_linen_nor_gl_1k.webp',{srgb:false})]);
  linenNormal.repeat.set(1/.27,1/.27);
  const add=(geos,mat,opts={})=>{const m=new THREE.Mesh(Array.isArray(geos)?merge(THREE,geos):geos,mat);Object.assign(m,opts);group.add(m);return m;};

  // --- Room shell: window wash, plaster finish, crisp junctions -----------------------------
  // Walls and ceiling, lacquer (bench base, wardrobe) and the desk of this room become
  // their own meshes (same baked light) so only they take the wash and the new finish.
  const ZONE=[[13.02,-0.2,-9.8],[15.78,3.2,-4.75]];
  const RANGE_PI=(ctx.lightmap?.data?.range||64)*Math.PI;   // RGBM decode of the bake
  const anchor='baked*=smoothstep(.0004,.003,dot(bakedE,vec3(.2126,.7152,.0722)));';
  const washBaked=(piece,wall)=>{
    const m=piece.material,prior=m.onBeforeCompile,key=m.customProgramCacheKey();
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.uniforms.jgDay=JG_DAY;
      let fs=shader.fragmentShader;
      if(!fs.includes(anchor))console.warn('[rooms/juegos] baked anchor missing');
      const lift=`{float jgL=jgLift(houseWorld,normalize(houseNormal));bakedE*=1.0+(jgL-1.0)*${WASH_TINT};}`;
      if(wall){
        // Limewash clouds down to a breath (render 8: smooth walls); the shared lime
        // plaster (app.js) gives the grain.
        fs=fs.replace('lime*mix(.30,.25,limeCeiling)','lime*mix(.05,.05,limeCeiling)')
          .replace(anchor,anchor+`
            // Denoiser blotches (10–30 cm darker patches): the baked luminance of the room's
            // main faces, low-passed once on load (wallLowPass) into a world-space map.
            {vec3 hn=normalize(houseNormal),hw=houseWorld;vec4 jgR=vec4(-1.0);vec2 jgT=vec2(0.0);
            if(hn.z>.5&&abs(hw.z+9.48)<.01){jgR=JG_RECT_N;jgT=hw.xy;}
            else if(hn.x<-.5&&abs(hw.x-15.70)<.01){jgR=JG_RECT_E;jgT=hw.zy;}
            else if(hn.x>.5&&abs(hw.x-13.63)<.01){jgR=JG_RECT_W;jgT=hw.zy;}
            else if(hn.y<-.5&&abs(hw.y-2.55)<.01){jgR=JG_RECT_C;jgT=hw.xz;}
            if(jgR.z>0.0){
              vec2 q=jgR.xy+jgR.zw*jgT;
              vec2 bv=texture2D(jgBlur,q).rg;
              float c0=dot(bakedE,vec3(.2126,.7152,.0722));
              if(bv.g>.2&&c0>1e-5)bakedE*=clamp(bv.r/bv.g/c0,.5,2.0);
            }}
            if(houseWorld.x>13.0&&houseWorld.x<15.74&&houseWorld.z>-9.6&&houseWorld.z<-4.8){
              // The bake's bounce off the oak floor tints these walls orange-brown;
              // render 8 reads cream: keep 60 % of its chroma.
              float jgY=dot(bakedE,vec3(.2126,.7152,.0722));bakedE=mix(vec3(jgY),bakedE,.6);
              // Crisp junctions: the lightmap texels blur wall/ceiling and corners over
              // ~5 cm; a tight occlusion crease redraws them.
              vec3 hw=houseWorld,hn=normalize(houseNormal);float westX=hw.z<-8.47?13.63:13.07,ao=1.0;
              if(abs(hn.y)<.5)ao*=(1.0-.22*exp(-max(2.55-hw.y,0.0)/.022))*(1.0-.14*exp(-max(hw.y,0.0)/.03));
              if(hn.y<-.5)ao*=1.0-.20*exp(-max(min(min(hw.x-westX,15.70-hw.x),hw.z+9.48),0.0)/.03);
              if(abs(hn.x)>.5)ao*=1.0-.14*exp(-abs(hw.z+9.48)/.035);
              if(abs(hn.z)>.5)ao*=1.0-.14*exp(-min(abs(hw.x-westX),abs(15.70-hw.x))/.035);
              bakedE*=ao;
            }
            ${lift}`);
        shader.uniforms.jgBlur=jgBlur;
        shader.fragmentShader=lowPass.defines+'uniform sampler2D jgBlur;\n'+WASH_GLSL+fs;
      }else shader.fragmentShader=WASH_GLSL+fs.replace(anchor,anchor+lift);
    };
    m.customProgramCacheKey=()=>key+'|juegos-'+(wall?'wall':'wash');
  };
  const wallPieces=ctx.splitExported({material:'wall',box:ZONE});
  // The low-pass reads the lightmap pages in use: computed again (once) for the other bake.
  // They are decoded while the house loads; wait for them here (lightmap.loaded).
  await ctx.lightmap?.loaded;
  const lowPasses={},lowPass=wallLowPass(THREE,ctx,wallPieces),jgBlur={value:lowPass.texture};
  lowPasses[ctx.night?'night':'day']=lowPass;
  for(const piece of wallPieces)washBaked(piece,true);
  for(const piece of ctx.splitExported({material:['lacquer','wood'],box:ZONE}))washBaked(piece,false);
  // The floor slab spans several rooms (one triangle runs from the hall to the girls'
  // room), so it is not split: a multiplicative overlay over this room's floor applies
  // the same lift (dst × lift), under the rug and the furniture by depth.
  {const fl=new THREE.ShaderMaterial({uniforms:{jgDay:JG_DAY},
      vertexShader:'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.0);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader:WASH_GLSL+`varying vec3 wp;void main(){gl_FragColor=vec4((jgLift(wp,vec3(0.0,1.0,0.0))-1.0)*${WASH_TINT},1.0);}`,
      blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.DstColorFactor,blendDst:THREE.OneFactor,
      transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
    const g=new THREE.PlaneGeometry(15.70-13.07,9.48-4.85);g.rotateX(-Math.PI/2);
    add(g,fl,{renderOrder:0}).position.set((13.07+15.70)/2,.0004,(-9.48-4.85)/2);}
  // Plaster pelmet over the blind, flush with the ceiling (render 8): hides the roller and
  // the sliver of reveal above it.
  add(place(THREE,rbox(THREE,1.06,.12,.17,.004),[15.05,2.55-.06,-9.53+.085]),new THREE.MeshStandardMaterial({color:'#e2d9cc',roughness:.9}));

  // --- Roller blind ---------------------------------------------------------------
  // Exported blind (curtain box) and its oak bottom bar.
  ctx.removeExported({material:'curtain',box:[[14.5,1.4,-9.45],[15.6,2.5,-9.35]]});
  ctx.removeExported({material:'wood',box:[[14.5,1.4,-9.45],[15.6,1.5,-9.35]]});
  const weave=blindTexture(THREE,linenImg);
  const bw=BLIND.x1-BLIND.x0,bh=BLIND.top-BLIND.bottom,bx=(BLIND.x0+BLIND.x1)/2;
  const blindGeo=new THREE.PlaneGeometry(bw,bh,1,1);
  {const uv=blindGeo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*bw/.6,uv.getY(i)*bh/.6);}
  const blindMat=new THREE.MeshStandardMaterial({color:new THREE.Color(.88,.80,.68).multiplyScalar(2),map:weave,roughness:1,metalness:0,
    transparent:true,depthWrite:false,side:THREE.DoubleSide});
  blindMat.userData.translucency=BLIND_T;
  blindMat.onBeforeCompile=shader=>{
    // No sheen on the cloth.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>','reflectedLight.directSpecular=vec3(0.0);\n#include <lights_fragment_end>');
  };
  blindMat.customProgramCacheKey=()=>'juegos-blind';
  const blind=add(blindGeo,blindMat,{renderOrder:2});blind.position.set(bx,(BLIND.top+BLIND.bottom)/2,BLIND.z);
  // Fabric-wrapped weighted bottom bar and the roller tube; brackets.
  const barMat=fabricMaterial(THREE,{color:'#d9d0c2',detail:linenDetail,normal:linenNormal,amount:.4,key:'bar'});
  add([place(THREE,new THREE.BoxGeometry(bw,.022,.014),[bx,BLIND.bottom+.004,BLIND.z+.004]),
    place(THREE,new THREE.CylinderGeometry(.026,.026,bw+.02,24),[bx,BLIND.top+.018,BLIND.z-.012],[0,0,Math.PI/2])],barMat);
  add([BLIND.x0-.012,BLIND.x1+.012].map(x=>place(THREE,new THREE.BoxGeometry(.012,.07,.06),[x,BLIND.top+.018,BLIND.z-.02])),
    new THREE.MeshStandardMaterial({color:'#e8e4dc',roughness:.5}));
  // Daylight outside the glass: the shared backdrop is a print at display brightness,
  // so behind this window it is lifted ×4.4 (dst·(1+k), detail kept) and softened by a
  // light haze, to read as bright daylight behind a sunlit blind (render 8).
  const lift=new THREE.Mesh(new THREE.PlaneGeometry(.94,1.40),new THREE.MeshBasicMaterial({color:new THREE.Color(3.4,3.4,3.4),
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.DstColorFactor,blendDst:THREE.OneFactor,
    transparent:true,depthWrite:false,toneMapped:false}));
  lift.position.set(15.05,1.65,-9.705);group.add(lift);
  const haze=new THREE.Mesh(new THREE.PlaneGeometry(.94,1.40),new THREE.MeshBasicMaterial({color:new THREE.Color(2.3,2.24,2.12),transparent:true,opacity:.2,depthWrite:false,toneMapped:false}));
  haze.position.set(15.05,1.65,-9.69);group.add(haze);
  // At night the window wash, the lifted backdrop and the haze go: the room keeps its
  // night bake (globe sconce, downlight) and the night backdrop behind the blind.
  ctx.onTimeOfDay(night=>{
    JG_DAY.value=night?0:1;lift.visible=haze.visible=!night;
    const key=night?'night':'day';lowPasses[key]??=wallLowPass(THREE,ctx,wallPieces);jgBlur.value=lowPasses[key].texture;
  });

  // --- Bench ----------------------------------------------------------------------------
  // Exported cushions, the seat slab and its two arm blocks.
  ctx.removeExported({material:'fabric',box:[[13.81,.47,-9.42],[14.15,.9,-9.2]]});
  ctx.removeExported({material:'clay',box:[[14.14,.47,-9.42],[15.04,.9,-9.2]]});
  ctx.removeExported({material:'sage',box:[[15.07,.47,-9.42],[15.53,.9,-9.2]]});
  ctx.removeExported({material:'fabric',box:[[13.6,.3,-9.5],[15.72,.66,-8.55]]});
  const cream=fabricMaterial(THREE,{color:'#e4dccd',detail:linenDetail,normal:linenNormal,amount:.55,key:'cream'});
  const ivory=fabricMaterial(THREE,{color:'#ede7dc',detail:linenDetail,normal:linenNormal,amount:.55,key:'ivory'});
  const seatMat=fabricMaterial(THREE,{color:'#d8cfc2',detail:linenDetail,normal:linenNormal,amount:.5,key:'seat'});
  const terracotta=fabricMaterial(THREE,{color:'#a95a3b',detail:linenDetail,normal:linenNormal,amount:.5,
    stripes:{pitch:.052,width:.10,color:'#d8c3a8'},key:'terracotta'});
  const sage=fabricMaterial(THREE,{color:'#8b9474',detail:linenDetail,normal:linenNormal,amount:.5,key:'sage'});
  const seat=.48;
  {const parts=benchSeat(THREE,2.02,.15,.83);
    for(const g of parts.slice(1)){const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*5.6,uv.getY(i)*.035);}
    add(parts.map(g=>place(THREE,g,[14.659,.405,-9.029])),seatMat);}
  // [material, W, H, T, x, lean (deg from vertical), zBottomFront, yaw (deg), roll (deg), seed]
  const cushions=[
    [ivory,.52,.50,.17,14.07,14,-9.17,4,-3,1],
    [cream,.52,.50,.17,14.66,13,-9.17,-2,2,2],
    [ivory,.52,.50,.17,15.22,14,-9.17,-5,-2,3],
    [terracotta,.50,.32,.13,14.50,20,-9.00,6,1,4],
    [terracotta,.50,.32,.13,15.00,19,-9.00,-4,-2,5],
    [sage,.40,.40,.14,15.37,18,-9.02,-9,4,6]];
  const byMat=new Map();
  for(const [mat,W,H,T,x,lean,zf,yaw,rl,seed] of cushions){
    const a=lean*Math.PI/180;
    // Bottom edge rests on the seat; the cushion leans back toward the wall.
    const g=place(THREE,cushionGeometry(THREE,W,H,T,seed),[x,seat+H/2*Math.cos(a)-.022,zf-T/2-H/2*Math.sin(a)],[-a,yaw*Math.PI/180,rl*Math.PI/180],'YXZ');
    if(!byMat.has(mat))byMat.set(mat,[]);byMat.get(mat).push(g);
  }
  byMat.get(cream).push(place(THREE,bolsterGeometry(THREE,.44,.085),[14.06,seat+.085*.94-.014,-8.98],[0,.05,0]));
  for(const [mat,geos] of byMat)add(geos,mat);
  // Throw: the exported clay slab becomes a linen throw draped over the seat edge.
  ctx.removeExported({material:'clay',box:[[15.13,.17,-9.06],[15.51,.51,-8.57]]});
  const throwMat=fabricMaterial(THREE,{color:'#a2644f',detail:linenDetail,normal:linenNormal,amount:.6,key:'throw'});
  throwMat.side=THREE.DoubleSide;
  add(throwGeometry(THREE),throwMat).position.set(15.30,0,0);

  // --- Desk chairs, kids' table and chairs ------------------------------------------------
  ctx.removeExported({material:'dark',box:[[13.5,0,-8.05],[13.9,.4,-6.85]]});
  ctx.removeExported({material:'fabric',box:[[13.45,.3,-8.1],[13.95,.85,-6.8]]});
  ctx.removeExported({material:'dark',box:[[15.2,0,-7.7],[15.62,.24,-6.5]]});
  ctx.removeExported({material:'fabric',box:[[15.1,.2,-7.7],[15.7,.56,-6.45]]});
  ctx.removeExported({material:'wood',box:[[15.1,0,-7.45],[15.7,.53,-6.7]]});
  const oak=[],upholstery=[],feet=[];
  const deskChair={W:.44,D:.40,seat:.425,board:.022,pad:.045,padIn:.006,crown:.007,inset:.04,splay:.016,apron:.045,
    legR:[.0165,.0125],backTop:.80,lean:.035,backR:.42,backOver:.05,backs:[[.20,.795,.032,true]]};
  // Child's chair for a 52 cm table: 28 cm seat, 32 × 29 cm, slim legs, a deep top rail.
  const kidsChair={W:.32,D:.29,seat:.28,board:.018,pad:.022,padIn:.012,crown:.004,inset:.032,splay:.012,apron:.03,
    legR:[.0125,.0095],backTop:.56,lean:.026,backR:.34,backOver:.026,backs:[[.075,.56,.017,false],[.024,.43,.015,false]]};
  // [spec, x, z, yaw]: B01 seats and leg positions; desk chairs face the desk (west).
  for(const [c,x,z,yaw] of [[deskChair,13.683,-7.790,-Math.PI/2],[deskChair,13.683,-7.1395,-Math.PI/2],
    [kidsChair,15.403,-7.482,0],[kidsChair,15.400,-6.670,Math.PI]]){
    const {wood,cloth,feet:f}=chair(THREE,c),m=new THREE.Matrix4().compose(new THREE.Vector3(x,0,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(1,1,1));
    for(const g of wood)oak.push(g.applyMatrix4(m));for(const g of cloth)upholstery.push(g.applyMatrix4(m));
    feet.push(...f.map(p=>[new THREE.Vector3(...p).applyMatrix4(m),c===deskChair?.085:.075]));
  }
  // Kids' table: 51 × 58 top, 52 cm high, rounded corners; legs on the B01 positions.
  const T={x0:15.148,x1:15.659,z0:-7.37,z1:-6.789,top:.52,t:.022},tx=(T.x0+T.x1)/2,tz=(T.z0+T.z1)/2;
  oak.push(place(THREE,slab(THREE,T.x1-T.x0,T.z1-T.z0,T.t,.06,.007),[tx,T.top-T.t,tz]));
  const lx=[15.2215,15.5705],lz=[-7.273,-6.885],under=T.top-T.t;
  for(const x of lx)for(const z of lz){
    const foot=[x+Math.sign(x-tx)*.018,0,z+Math.sign(z-tz)*.018];feet.push([new THREE.Vector3(...foot),.09]);
    oak.push(rod(THREE,foot,[x,under+.002,z],.0135,.0175,14));
  }
  oak.push(place(THREE,rbox(THREE,lx[1]-lx[0],.045,.018,.004,{grain:0}),[tx,under-.0225,lz[0]]),
    place(THREE,rbox(THREE,lx[1]-lx[0],.045,.018,.004,{grain:0}),[tx,under-.0225,lz[1]]),
    place(THREE,rbox(THREE,.018,.045,lz[1]-lz[0],.004,{grain:2}),[lx[0],under-.0225,tz]),
    place(THREE,rbox(THREE,.018,.045,lz[1]-lz[0],.004,{grain:2}),[lx[1],under-.0225,tz]));
  // Natural light oak (render 8's furniture is pale): own clone, lifted and less red.
  const oakMat=ctx.cloneMaterial(mats.wood);oakMat.color.setRGB(1.30,1.25,1.17);
  add(oak,oakMat);
  const boucle=ctx.cloneMaterial(mats.fabric);boucle.color.set('#c2b6a8');
  add(upholstery,boucle);

  // --- Rug ------------------------------------------------------------------------------
  ctx.removeExported({material:'rug',box:[[14.0,-.01,-8.52],[15.3,.03,-7.28]]});
  const RUG={x:14.643,z:-7.904};
  const {geo:rugGeo,edge}=rugGeometry(THREE,.585,22);
  const rugMat=ctx.cloneMaterial(mats.rug);rugMat.vertexColors=true;rugMat.color.set('#9e917c');
  add(rugGeo,rugMat).position.set(RUG.x,.001,RUG.z);

  // --- Contact shadows (one mesh) ---------------------------------------------------------
  const quads=[],put=(x,z,sx,sz,a,cell=0,rot=0)=>quads.push({x,z,sx,sz,a,cell,rot});
  for(const [p,s] of feet){put(p.x,p.z,s*.55,s*.55,.95);put(p.x,p.z,s*1.3,s*1.3,.45);}
  for(const z of [-7.790,-7.1395])put(13.70,z,.62,.64,.6);   // desk chair seats
  put(15.403,-7.49,.44,.40,.6);put(15.40,-6.66,.44,.40,.6);   // kids' chairs
  put(15.403,-7.08,.72,.80,.5);                               // kids' table
  put(13.37,-7.415,.62,2.2,.12);                               // desk top
  for(const x of [13.15,13.594])for(const z of [-8.392,-6.437])put(x,z,.11,.11,.6);
  put(14.66,-8.575,2.10,.09,.85);put(14.66,-8.54,2.18,.22,.4);                               // bench plinth
  const n=quads.length,R=96,P=new Float32Array((n*4+R*2)*3),C=new Float32Array((n*4+R*2)*4),U=new Float32Array((n*4+R*2)*2),I=[];
  quads.forEach((q,k)=>{
    const c=Math.cos(q.rot),s=Math.sin(q.rot);
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([u,v],j)=>{const dx=u*q.sx/2,dz=v*q.sz/2,i=k*4+j;
      P.set([q.x+dx*c-dz*s,.002,q.z+dx*s+dz*c],i*3);C.set([0,0,0,q.a],i*4);U.set([(q.cell+(u+1)/2)/2,(v+1)/2],i*2);});
    I.push(k*4,k*4+2,k*4+1,k*4,k*4+3,k*4+2);
  });
  // Rug: a soft skirt following the scalloped edge.
  for(let i=0;i<R;i++){const t=i/R*2*Math.PI,e=edge(t),o=n*4+i*2;
    for(const [k,rr,a] of [[0,e-.008,.5],[1,e+.045,0]]){P.set([RUG.x+Math.cos(t)*rr,.0015,RUG.z+Math.sin(t)*rr],(o+k)*3);C.set([0,0,0,a],(o+k)*4);U.set([.25,.5],(o+k)*2);}
    const a=o,b=o+1,c=n*4+((i+1)%R)*2,d=c+1;I.push(a,b,c,b,d,c);
  }
  const sg=new THREE.BufferGeometry();
  sg.setAttribute('position',new THREE.BufferAttribute(P,3));sg.setAttribute('color',new THREE.BufferAttribute(C,4));
  sg.setAttribute('uv',new THREE.BufferAttribute(U,2));sg.setIndex(I);sg.computeBoundingSphere();
  add(sg,new THREE.MeshBasicMaterial({color:0xffffff,map:shadowAtlas(THREE),vertexColors:true,transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4,toneMapped:false,side:THREE.DoubleSide}),{renderOrder:1});

  // Probe light and room reflections for everything lit (not the haze or shadows).
  ctx.lightRuntimeObject(group);
  // Window wash on everything probe-lit here (not the blind, which has its own
  // transmission, nor the haze, overlay or shadows).
  const washed=new Map();
  group.traverse(o=>{
    const src=o.material;
    if(!o.isMesh||o===blind||!src?.userData?.runtimeLit)return;
    if(!washed.has(src)){
      const m=ctx.cloneMaterial(src),prior=m.onBeforeCompile,key=src.customProgramCacheKey();
      m.onBeforeCompile=(shader,r)=>{
        prior.call(m,shader,r);
        shader.uniforms.jgDay=JG_DAY;
        const fs=shader.fragmentShader,at=fs.lastIndexOf('#include <lights_fragment_end>');
        shader.fragmentShader=WASH_GLSL+fs.slice(0,at)+`{float jgL=jgLift(lpWorld,lpNormalW);iblIrradiance*=1.0+(jgL-1.0)*${WASH_TINT};}\n`+fs.slice(at);
      };
      m.customProgramCacheKey=()=>key+'|juegos-wash';
      washed.set(src,m);
    }
    o.material=washed.get(src);
  });
}
