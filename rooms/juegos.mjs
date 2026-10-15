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
// - Bench cushions: the four exported blocks become soft sewn cushions (puffy, pinched
//   corners, creases, linen weave), arranged as in the render: cream squares against
//   the wall, a bolster, two terracotta pinstriped lumbar cushions and a sage one.
// - Soft contact shadows under chair and table legs, chairs, desk, bench plinth and rug.

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

// Sewn cushion W × H × T (metres), centred, face toward +z, seam in the z=0 plane.
// Pinched sides, rounded puff, corner creases and slow lumps; metric UVs.
function cushionGeometry(THREE,W,H,T,seed){
  const n=28,r=rand(seed),pos=[],uv=[],idx=[];
  const lump=[...Array(6)].map(()=>[r()*6.28,r()*6.28,1+r()*2,1+r()*2,(r()-.5)*.14]);
  for(const side of [1,-1]){
    const start=pos.length/3;
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const u=i/n*2-1,v=j/n*2-1;
      const x=u*W/2*(1-.07*(1-v*v)),y=v*H/2*(1-.07*(1-u*u));
      let f=Math.sqrt(Math.max(0,1-Math.abs(u)**2.6))*Math.sqrt(Math.max(0,1-Math.abs(v)**2.6));
      let wr=0;for(const [a,b,fu,fv,amp] of lump)wr+=amp*Math.sin(fu*u*3.1+a)*Math.sin(fv*v*3.1+b);
      // creases fanning in from each corner
      for(const [cu,cv] of [[1,1],[-1,1],[1,-1],[-1,-1]]){
        const du=u-cu,dv=v-cv,d=Math.hypot(du,dv),ang=Math.atan2(dv,du);
        wr+=Math.exp(-d*2.4)*.22*Math.sin(ang*7+seed+cu*2+cv)*Math.min(1,d*3);
      }
      const z=side*T/2*f*(1+wr*.6);
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

// Throw over the seat's front edge, local x across (centred), world y/z along the drape.
function throwGeometry(THREE){
  const W=.40,nx=36,ns=48,top=.486,zEdge=-8.600,r=.04,z0=-9.03,hang=.21,pos=[],uv=[],idx=[];
  const flat=zEdge-r-z0,arc=Math.PI*r/2,L=flat+arc+hang;
  for(let j=0;j<=ns;j++){
    const s=j/ns*L;let y,z,ny,nz;
    if(s<flat){y=top;z=z0+s;ny=1;nz=0;}
    else if(s<flat+arc){const t=(s-flat)/r;y=top-r+r*Math.cos(t);z=zEdge-r+r*Math.sin(t);ny=Math.cos(t);nz=Math.sin(t);}
    else{const q=Math.min(1,(s-flat-arc)/.04);y=top-r-(s-flat-arc);z=zEdge+.022*q;ny=0;nz=1;}
    const h=Math.max(0,s-flat)/(arc+hang);   // folds deepen as it falls
    for(let i=0;i<=nx;i++){
      const u=i/nx-.5,x=u*W;
      const fold=Math.sin(x*2*Math.PI/.095+1.3)*(.5+.5*Math.sin(x*23.0))+.4*Math.sin(x*2*Math.PI/.041+.4);
      const a=.003+.016*h*h,lift=Math.abs(fold)*a+(1-h)*.004*Math.sin(x*41+s*30);
      pos.push(x+fold*.004*h,y+ny*lift-(j===ns?.005*Math.sin(x*15+1):0),z+nz*lift);uv.push(x+W/2,s);
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
  for(let i=0;i<=10;i++){const a=i/10*Math.PI/2;pts.push(new THREE.Vector2(R*Math.sin(a)*.98+.002,-L/2+R*.35*(1-Math.cos(a))));}
  for(let i=1;i<=6;i++)pts.push(new THREE.Vector2(R*(1+.015*Math.sin(i*1.7)),-L/2+R*.35+(L-R*.7)*i/7));
  for(let i=10;i>=0;i--){const a=i/10*Math.PI/2;pts.push(new THREE.Vector2(R*Math.sin(a)*.98+.002,L/2-R*.35*(1-Math.cos(a))));}
  const geo=new THREE.LatheGeometry(pts,40);geo.rotateZ(Math.PI/2);
  const uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*2*Math.PI*R,uv.getY(i)*L);
  geo.computeVertexNormals();return geo;
}

function radialShadow(THREE,{ring=false}={}){
  const N=128,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
  const grad=g.createRadialGradient(N/2,N/2,0,N/2,N/2,N/2);
  if(ring){grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(.86,'rgba(0,0,0,0)');grad.addColorStop(.885,'rgba(0,0,0,1)');grad.addColorStop(.93,'rgba(0,0,0,.35)');grad.addColorStop(1,'rgba(0,0,0,0)');}
  else{grad.addColorStop(0,'rgba(0,0,0,1)');grad.addColorStop(.45,'rgba(0,0,0,.6)');grad.addColorStop(1,'rgba(0,0,0,0)');}
  g.fillStyle=grad;g.fillRect(0,0,N,N);
  const t=new THREE.CanvasTexture(c);return t;
}

export async function apply(ctx){
  const {THREE,group}=ctx;
  const loadImg=url=>new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=url;});
  const [linenImg,linenDetail,linenNormal]=await Promise.all([
    loadImg('./assets/polyhaven/rough_linen/rough_linen_detail_1k.webp'),
    ctx.loadTexture('./assets/polyhaven/rough_linen/rough_linen_detail_1k.webp',{srgb:false}),
    ctx.loadTexture('./assets/polyhaven/rough_linen/rough_linen_nor_gl_1k.webp',{srgb:false})]);
  linenNormal.repeat.set(1/.27,1/.27);

  // --- Roller blind ---------------------------------------------------------------
  // Exported blind (curtain box) and its oak bottom bar.
  ctx.removeExported({material:'curtain',box:[[14.5,1.4,-9.45],[15.6,2.5,-9.35]]});
  ctx.removeExported({material:'wood',box:[[14.5,1.4,-9.45],[15.6,1.5,-9.35]]});
  const weave=blindTexture(THREE,linenImg);
  const bw=BLIND.x1-BLIND.x0,bh=BLIND.top-BLIND.bottom;
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
  const blind=new THREE.Mesh(blindGeo,blindMat);
  blind.position.set((BLIND.x0+BLIND.x1)/2,(BLIND.top+BLIND.bottom)/2,BLIND.z);blind.renderOrder=2;
  group.add(blind);
  // Fabric-wrapped weighted bottom bar and the roller tube with its brackets.
  const barMat=fabricMaterial(THREE,{color:'#d9d0c2',detail:linenDetail,normal:linenNormal,amount:.4,key:'bar'});
  const bar=new THREE.Mesh(new THREE.BoxGeometry(bw,.022,.014),barMat);bar.position.set(blind.position.x,BLIND.bottom+.004,BLIND.z+.004);group.add(bar);
  const roll=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,bw+.02,24),barMat);roll.rotation.z=Math.PI/2;roll.position.set(blind.position.x,BLIND.top+.018,BLIND.z-.012);group.add(roll);
  const bracketMat=new THREE.MeshStandardMaterial({color:'#e8e4dc',roughness:.5});
  for(const x of [BLIND.x0-.012,BLIND.x1+.012]){const b=new THREE.Mesh(new THREE.BoxGeometry(.012,.07,.06),bracketMat);b.position.set(x,BLIND.top+.018,BLIND.z-.02);group.add(b);}
  // Daylight outside the glass: the shared backdrop is a print at display brightness,
  // so behind this window it is lifted ×4.4 (dst·(1+k), detail kept) and softened by a
  // light haze, to read as bright daylight behind a sunlit blind (render 8).
  const lift=new THREE.Mesh(new THREE.PlaneGeometry(.94,1.40),new THREE.MeshBasicMaterial({color:new THREE.Color(3.4,3.4,3.4),
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.DstColorFactor,blendDst:THREE.OneFactor,
    transparent:true,depthWrite:false,toneMapped:false}));
  lift.position.set(15.05,1.65,-9.705);group.add(lift);
  const haze=new THREE.Mesh(new THREE.PlaneGeometry(.94,1.40),new THREE.MeshBasicMaterial({color:new THREE.Color(2.3,2.24,2.12),transparent:true,opacity:.2,depthWrite:false,toneMapped:false}));
  haze.position.set(15.05,1.65,-9.69);group.add(haze);

  // --- Bench cushions ---------------------------------------------------------------
  ctx.removeExported({material:'fabric',box:[[13.81,.47,-9.42],[14.15,.9,-9.2]]});
  ctx.removeExported({material:'clay',box:[[14.14,.47,-9.42],[15.04,.9,-9.2]]});
  ctx.removeExported({material:'sage',box:[[15.07,.47,-9.42],[15.53,.9,-9.2]]});
  const cream=fabricMaterial(THREE,{color:'#e4dccd',detail:linenDetail,normal:linenNormal,amount:.55,key:'cream'});
  const ivory=fabricMaterial(THREE,{color:'#ede7dc',detail:linenDetail,normal:linenNormal,amount:.55,key:'ivory'});
  const terracotta=fabricMaterial(THREE,{color:'#a95a3b',detail:linenDetail,normal:linenNormal,amount:.5,
    stripes:{pitch:.052,width:.10,color:'#d8c3a8'},key:'terracotta'});
  const sage=fabricMaterial(THREE,{color:'#8b9474',detail:linenDetail,normal:linenNormal,amount:.5,key:'sage'});
  const seat=.48;
  // [material, W, H, T, x, lean (deg from vertical), zBottomFront, yaw (deg), roll (deg), seed]
  const cushions=[
    [ivory,.52,.50,.17,14.07,14,-9.17,4,-3,1],
    [cream,.52,.50,.17,14.66,13,-9.17,-2,2,2],
    [ivory,.52,.50,.17,15.22,14,-9.17,-5,-2,3],
    [terracotta,.50,.32,.13,14.50,20,-9.00,6,1,4],
    [terracotta,.50,.32,.13,15.00,19,-9.00,-4,-2,5],
    [sage,.40,.40,.14,15.37,18,-9.02,-9,4,6]];
  for(const [mat,W,H,T,x,lean,zf,yaw,rl,seed] of cushions){
    const mesh=new THREE.Mesh(cushionGeometry(THREE,W,H,T,seed),mat);
    const a=lean*Math.PI/180;
    // Bottom edge rests on the seat; the cushion leans back toward the wall.
    mesh.rotation.set(-a,yaw*Math.PI/180,rl*Math.PI/180,'YXZ');
    const yc=seat+H/2*Math.cos(a)-.02,zc=zf-T/2-H/2*Math.sin(a);
    mesh.position.set(x,yc,zc);group.add(mesh);
  }
  // Throw: the exported clay slab becomes a linen throw draped over the seat edge.
  ctx.removeExported({material:'clay',box:[[15.13,.17,-9.06],[15.51,.51,-8.57]]});
  const throwMat=fabricMaterial(THREE,{color:'#a85b3c',detail:linenDetail,normal:linenNormal,amount:.55,key:'throw'});
  throwMat.side=THREE.DoubleSide;
  const drape=new THREE.Mesh(throwGeometry(THREE),throwMat);drape.position.set(15.30,0,0);group.add(drape);
  const bolster=new THREE.Mesh(bolsterGeometry(THREE,.44,.085),cream);
  bolster.position.set(14.06,seat+.085-.012,-8.98);bolster.rotation.y=.05;group.add(bolster);

  // --- Contact shadows ----------------------------------------------------------------
  const blob=radialShadow(THREE),ring=radialShadow(THREE,{ring:true});
  const shadowMat=(map,opacity)=>new THREE.MeshBasicMaterial({color:0x000000,alphaMap:null,map,transparent:true,opacity,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4,toneMapped:false});
  const decal=(x,z,sx,sz,opacity,y=.002,map=blob)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(sx,sz),shadowMat(map,opacity));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.renderOrder=1;group.add(m);return m;
  };
  // Desk chairs (west): seat footprint and legs.
  for(const [z0,z1] of [[-7.937,-7.643],[-7.299,-6.98]]){
    decal(13.683,(z0+z1)/2+.04,.5,.6,.5);
    for(const x of [13.575,13.791])for(const z of [z0+.012,z1-.012])decal(x,z,.1,.1,.85);
  }
  // Kids' chairs and table (east).
  for(const [xs,zs] of [[[15.262,15.545],[-7.395,-7.569]],[[15.271,15.53],[-6.763,-6.594]]]){
    decal((xs[0]+xs[1])/2,(zs[0]+zs[1])/2+.04,.54,.48,.5);
    for(const x of xs)for(const z of zs)decal(x,z,.1,.1,.85);
  }
  decal(15.403,-7.05,.68,.76,.35);
  for(const x of [15.221,15.570])for(const z of [-7.273,-6.885])decal(x,z,.11,.11,.85);
  // Desk legs and the shade under its top.
  decal(13.37,-7.415,.62,2.2,.12);
  for(const x of [13.15,13.594])for(const z of [-8.392,-6.437])decal(x,z,.11,.11,.6);
  // Bench plinth (toe kick) and the rug's edge.
  decal(14.66,-8.56,2.12,.16,.45);
  decal(14.643,-7.904,1.38,1.38,.65,.0025,ring);

  // Probe light and room reflections for everything lit (not the haze or shadows).
  ctx.lightRuntimeObject(group);
}
