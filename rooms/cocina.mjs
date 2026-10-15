// Room module: cocina. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/cocina.json).
//
// Render 9, round 5 (owner's notes):
// - Stone: the kitchen's own stone (region kitchen only; the laundry keeps the shared
//   one) takes a calm "fiorito" map made by scripts/cocina_textures.py.
// - Oak: the photographed white oak veneer (Poly Haven, CC0, already loaded for `wood`)
//   with a longer tile, more grain contrast and a warm mid-brown tint.
// - Ceiling: flat white paint at 2.20 m (the export has no island coffer since r5).
// Round 6:
// - Stools: the exported ones (thin dark legs, flat seat, thin band back) are replaced
//   by the stools of render 9: a thick round upholstered seat, a low curved upholstered
//   back resting on a brass ring, four straight brass legs and a brass footrest frame.
// - Contact shadows (soft decals) under the stools and along the island base.
// - The induction hob (seen edge-on, it read as a black sink) gets a satin sheen.
// - The back wall darkens a little more towards the worktop, as in render 9.
// - Props of render 9: a ceramic vase with leafy branches on the back worktop and a
//   bowl of fruit on the island.

import {mergeGeometries} from '../assets/jsm/utils/BufferGeometryUtils.js';

const ZONE=[[7.3,-.2,-3.66],[13.4,3.2,-.2]];
const VERSION='r6a';
// Render 9's ceiling is plain white paint; the shared limewash is warmer (linear gain).
const CEILING_TINT=[1.14,1.27,1.4];
// B01 stool footprints (plan x ranges) on the island's north side, plan y 479.765.
const STOOLS=[[581.64,603.30],[612.99,634.65],[644.34,666],[675.69,697.32]];
const STOOL={seatR:.198,seatTop:.672,seatBottom:.592,edge:.034,ringY:.69,ringR:.214,tube:.0105,
  legR:.212,footY:.245,backR:.19,backThick:.032,backH:.056,backY:.758,backHalf:110*Math.PI/180};

export async function apply(ctx){
  const {THREE,mats}=ctx;
  const [stoneMap,stoneNormal]=await Promise.all([
    ctx.loadTexture(`./assets/rooms/cocina/stone.webp?v=${VERSION}`),
    ctx.loadTexture(`./assets/rooms/cocina/stone_nor.webp?v=${VERSION}`,{srgb:false})]);

  // --- Stone (back wall lining, worktops, island) -----------------------------------
  const stoneRelief={value:stoneNormal};
  for(const piece of ctx.splitExported({material:'kitchenStone',region:'kitchen',box:ZONE})){
    const m=piece.material,prior=m.onBeforeCompile;
    m.map=stoneMap;
    // The island sits in the shade of its worktop; render 9 shows it as light as the wall.
    // The kitchen's warm baked light over-saturates the cream stone: a slightly cooler tint.
    const island=piece.userData.exported.layer==='island';
    if(island)m.color.multiply(new THREE.Color().setRGB(1.15,1.22,1.32));
    else m.color.multiply(new THREE.Color().setRGB(.97,.99,1.04));
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.uniforms.crosscutNormal=stoneRelief;
      // 2048 px map over a 1.82 m tile (scripts/cocina_textures.py): the shared shader
      // projects 1.1 tiles per metre.
      if(!island)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
        // Render 9's back wall darkens from the grazing wash at the top towards the
        // worktop more than our baked light does (a material gain, no light added).
        diffuseColor.rgb*=mix(.86,1.06,smoothstep(.95,2.1,houseWorld.y));
        #include <normal_fragment_maps>`);
      shader.fragmentShader=shader.fragmentShader.replace('#define CROSSCUT_RELIEF 1.0','#define CROSSCUT_RELIEF 0.85')
        .replace('vec2 ccX=houseWorld.zy*1.1,ccY=houseWorld.xz*1.1,ccZ=houseWorld.xy*1.1;','vec2 ccX=houseWorld.zy*.55,ccY=houseWorld.xz*.55,ccZ=houseWorld.xy*.55;');
    };
    m.customProgramCacheKey=()=>'cocina-stone-'+VERSION+(island?'-island':'');
    m.needsUpdate=true;
  }

  // --- Oak fronts ---------------------------------------------------------------------
  const oakMaps=['map','normalMap','roughnessMap'].map(k=>{
    const t=mats.wood[k].clone();t.repeat.set(1.5,.75);t.needsUpdate=true;return t;
  });
  for(const piece of ctx.splitExported({material:'kitchenOak',region:'kitchen',box:ZONE})){
    const m=piece.material,prior=m.onBeforeCompile;
    [m.map,m.normalMap,m.roughnessMap]=oakMaps;m.normalScale.set(.5,.5);m.bumpMap=null;
    // Linear tint over the white oak veneer (about .28/.19/.125 linear): warm mid-brown.
    m.color.setRGB(.98,1.32,1.72);
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      // Stronger figure: scale by the veneer's own luminance contrast.
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        #ifdef USE_MAP
        diffuseColor.rgb*=clamp(pow(dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722))/.20,.25),.75,1.3);
        #endif`);
    };
    m.customProgramCacheKey=()=>'cocina-oak-'+VERSION;
    m.needsUpdate=true;
  }

  // Shadow gaps between the tall fronts (5 mm in B01): render 9 draws them as crisp dark
  // lines; the bake cannot resolve them. A dark strip sits 1.4 mm behind the front faces.
  // Runs as in model_source.cabinet(): (rect, face, number of fronts).
  const gapGeos=[];
  for(const [[x0,y0,x1,y1],face] of [[[483.51,432.77,514.44,606.47],'east'],[[764.25,432.77,795.18,575.54],'west']]){
    const L=y1-y0,count=Math.max(1,Math.round(L/51.53901216893343/.55));
    const at=(u,v)=>face==='east'?ctx.plan(x1-v,y0+u):ctx.plan(x0+v,y0+u);
    for(let i=1;i<count;i++){
      const u=L*i/count,[ax,az]=at(u-.14,-.45),[bx,bz]=at(u+.14,.14);
      gapGeos.push(new THREE.BoxGeometry(Math.abs(bx-ax),2.188-.09,Math.abs(bz-az)).translate((ax+bx)/2,(2.188+.09)/2,(az+bz)/2));
    }
  }
  const gaps=new THREE.Mesh(mergeGeometries(gapGeos),mats.kitchenDark);gaps.name='Cocina juntas frentes';
  ctx.group.add(gaps);ctx.lightRuntimeObject(gaps);

  // --- Ceiling: white paint ------------------------------------------------------------
  for(const piece of ctx.splitExported({material:'wall',region:'kitchen',box:[[7.3,2.19,-3.66],[13.4,2.215,-.2]]})){
    piece.material.color.multiply(new THREE.Color().setRGB(...CEILING_TINT));
    piece.material.needsUpdate=true;
  }

  // --- Induction hob on the island ---------------------------------------------------
  // The pose sees it at 2.6 degrees: black glass there is almost a mirror of the lit
  // stone wall behind it, but the reflection probe returns nearly nothing at that grazing
  // angle, so it read as a flat black hole (the critics' "black sink"). A stone-coloured
  // sheen at a third of the island top's baked light stands in for that reflection.
  {
    const [hx0,hz0]=ctx.plan(578,486),[hx1,hz1]=ctx.plan(618,518);
    for(const piece of ctx.splitExported({material:'ovenGlass',region:'kitchen',box:[[hx0,.92,hz0],[hx1,.95,hz1]]})){
      const m=piece.material,prior=m.onBeforeCompile;m.color.set('#2b2927');m.roughness=.3;m.metalness=0;
      m.onBeforeCompile=(shader,r)=>{
        prior.call(m,shader,r);
        shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',
          'reflectedLight.indirectSpecular+=iblIrradiance*RECIPROCAL_PI*vec3(.66,.58,.49)*.34;\n#include <aomap_fragment>');
      };
      m.customProgramCacheKey=()=>'cocina-hob-'+VERSION;m.needsUpdate=true;
    }
  }

  stools(ctx);
  props(ctx);
  contactShadows(ctx);
}

// --- Stools of render 9 ----------------------------------------------------------------
function stools(ctx){
  const {THREE}=ctx;
  // Drop the exported stools: upholstery (kitchenFabric) and frames (kitchenBronze).
  const [bx0,bz0]=ctx.plan(570,458),[bx1,bz1]=ctx.plan(710,500);
  ctx.removeExported({material:['kitchenFabric','kitchenBronze'],region:'kitchen',box:[[bx0,-.1,bz0],[bx1,1.0,bz1]]});

  const S=STOOL;
  const leather=new THREE.MeshPhysicalMaterial({color:'#8a7e70',roughness:.58,sheen:.35,sheenRoughness:.6,sheenColor:new THREE.Color('#d9cbb8')});
  leather.map=seamTexture(THREE);leather.bumpMap=leather.map;leather.bumpScale=.25;
  // Satin brass: part metallic, so the probe light (not only the dim reflection probe)
  // gives it its golden mid-tone.
  const brass=new THREE.MeshStandardMaterial({color:'#9d8a66',metalness:.5,roughness:.34});

  // One stool in local space (back towards -z, the camera side; it faces the island at +z).
  const soft=[seat(THREE,S),back(THREE,S)];
  const metal=[];
  const ring=new THREE.TorusGeometry(S.ringR,S.tube,10,72);ring.rotateX(Math.PI/2);ring.translate(0,S.ringY,0);metal.push(ring);
  const legs=[0,1,2,3].map(k=>{const a=Math.PI/4+k*Math.PI/2;return [S.legR*Math.cos(a),S.legR*Math.sin(a)];});
  for(const [x,z] of legs)metal.push(rod(THREE,[x,.004,z],[x,S.ringY,z],S.tube*1.1,12));
  for(let k=0;k<4;k++){
    const [ax,az]=legs[k],[cx,cz]=legs[(k+1)%4];
    metal.push(rod(THREE,[ax,S.footY,az],[cx,S.footY,cz],S.tube*.85,10));
  }
  // Short brass posts carrying the back over the ring.
  for(const a of [-.62,0,.62].map(d=>-Math.PI/2+d)){
    const r=S.backR;metal.push(rod(THREE,[r*Math.cos(a),S.ringY,r*Math.sin(a)],[r*Math.cos(a),S.backY-S.backH*.6,r*Math.sin(a)],S.tube*.8,8));
  }
  const softOne=mergeGeometries(soft),metalOne=mergeGeometries(metal);
  const all={soft:[],metal:[]};
  for(const [x0,x1] of STOOLS){
    const [x,z]=ctx.plan((x0+x1)/2,479.765);
    all.soft.push(softOne.clone().translate(x,0,z));all.metal.push(metalOne.clone().translate(x,0,z));
  }
  const g=new THREE.Group();g.name='Cocina taburetes';
  g.add(new THREE.Mesh(mergeGeometries(all.soft),leather),new THREE.Mesh(mergeGeometries(all.metal),brass));
  ctx.group.add(g);ctx.lightRuntimeObject(g);
}

// Grid surface P(u,v) with normals from the parametric derivatives and caller UVs.
function parametric(THREE,P,nu,nv,uvOf){
  const pos=[],nor=[],uv=[],idx=[],e=1e-4,a=new THREE.Vector3(),b=new THREE.Vector3(),n=new THREE.Vector3();
  const at=(u,v)=>new THREE.Vector3(...P(u,v));
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
    const u=i/nu,v=j/nv,p=at(u,v);
    a.copy(at(Math.min(1,u+e),v)).sub(at(Math.max(0,u-e),v));
    b.copy(at(u,Math.min(1,v+e))).sub(at(u,Math.max(0,v-e)));
    n.crossVectors(b,a);if(n.lengthSq()<1e-20)n.set(0,v<.5?1:-1,0);
    n.normalize();pos.push(p.x,p.y,p.z);nor.push(n.x,n.y,n.z);uv.push(...uvOf(u,v));
  }
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const k=j*(nu+1)+i;idx.push(k,k+nu+1,k+1,k+1,k+nu+1,k+nu+2);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);return g;
}
// Thick drum cushion: domed top, round upper edge, straight side, tucked lower edge.
function seat(THREE,S){
  const {seatR:r,seatTop:top,seatBottom:bot,edge}=S;
  const prof=[];
  for(let i=0;i<=8;i++){const x=(r-edge)*i/8;prof.push([x,top-.008*(x/r)**2]);}
  const yc=top-.008*((r-edge)/r)**2-edge;
  for(let i=1;i<=10;i++){const a=Math.PI/2*(1-i/10);prof.push([r-edge+edge*Math.cos(a),yc+edge*Math.sin(a)]);}
  for(let i=1;i<=6;i++){const a=-Math.PI/2*i/6;prof.push([r-.018+.018*Math.cos(a),bot+.018+.018*Math.sin(a)]);}
  prof.push([.0,bot]);
  // u runs clockwise seen from above, v down the profile: (dP/dv x dP/du) points out.
  const P=(u,v)=>{const k=Math.min(prof.length-1.0001,v*(prof.length-1)),i=Math.floor(k),f=k-i;
    const R=prof[i][0]+(prof[i+1][0]-prof[i][0])*f,y=prof[i][1]+(prof[i+1][1]-prof[i][1])*f,a=-u*Math.PI*2;
    return [R*Math.cos(a),y,R*Math.sin(a)];};
  return parametric(THREE,P,40,prof.length,(u,v)=>[u*1.25,v*.35]);
}
// Low curved back: rounded section swept round the rear half of the seat, rounded ends.
function back(THREE,S){
  const {backR:r,backThick:t,backH:h,backY:y,backHalf:half}=S;
  const cap=.035/r,span=half+cap,se=(c,p)=>Math.sign(c)*Math.abs(c)**(2/p);
  const P=(u,v)=>{
    const phi=-span+2*span*u,over=Math.max(0,Math.abs(phi)-half)/cap;
    const k=Math.sqrt(Math.max(0,1-over*over));
    const psi=v*Math.PI*2;
    const dr=t*Math.max(k,.0)*se(Math.cos(psi),3.2),dy=h*Math.max(k,.0)*se(Math.sin(psi),3.2);
    const a=-Math.PI/2+phi;return [(r+dr)*Math.cos(a),y+dy,(r+dr)*Math.sin(a)];
  };
  return parametric(THREE,P,48,16,(u,v)=>[u*2*span*r/.32*1.25,v*.35]);
}
// Vertical stitched panels on the upholstery (luminance + bump).
function seamTexture(THREE){
  const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,256,64);
  for(let i=0;i<4;i++){const x=i*64+1;g.fillStyle='rgba(150,140,130,.7)';g.fillRect(x-1,0,2,64);g.fillStyle='rgba(225,220,215,.5)';g.fillRect(x-3,0,2,64);g.fillRect(x+1,0,2,64);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
// Cylinder between two points.
function rod(THREE,a,b,r,seg){
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),L=d.length();
  const g=new THREE.CylinderGeometry(r,r,L,seg,1,true);g.translate(0,L/2,0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
  return g.translate(A.x,A.y,A.z);
}
function tubeAlong(THREE,points,r,seg=12,rad=5){
  const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),seg,r,rad,false);
  return g;
}

// --- Props of render 9: vase with branches, fruit bowl ----------------------------------
function props(ctx){
  const {THREE}=ctx;
  let seed=9;const rnd=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;

  // Vase on the back worktop, right of the tap (seen from the pose), against the wall.
  const [vx,vz]=ctx.plan(536,599),vy=.92;
  const vaseProfile=[[0,0],[.034,0],[.05,.012],[.062,.045],[.064,.075],[.056,.11],[.04,.14],[.027,.16],[.024,.178],[.028,.188],[.025,.19],[.02,.17]]
    .map(([x,y])=>new THREE.Vector2(x,y));
  const vase=new THREE.LatheGeometry(vaseProfile,40);vase.translate(vx,vy,vz);
  const ceramic=new THREE.MeshStandardMaterial({color:'#7a6a5c',roughness:.62});
  const twigs=[],leaves=[];
  const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.quadraticCurveTo(.009,.012,0,.03);leafShape.quadraticCurveTo(-.009,.012,0,0);
  const leafBase=new THREE.ShapeGeometry(leafShape,3);
  const stem=(start,dir,len,depth)=>{
    const pts=[start];let p=new THREE.Vector3(...start),d=new THREE.Vector3(...dir).normalize();
    const n=5;for(let i=1;i<=n;i++){
      d.add(new THREE.Vector3((rnd()-.5)*.35,.05,(rnd()-.5)*.35)).normalize();
      p=p.clone().addScaledVector(d,len/n);pts.push(p.toArray());
    }
    twigs.push(tubeAlong(THREE,pts,depth?.0012:.0022,10,4));
    const curve=new THREE.CatmullRomCurve3(pts.map(q=>new THREE.Vector3(...q)));
    const count=depth?7:10;
    for(let i=0;i<count;i++){
      const t=.25+.75*i/(count-1),q=curve.getPoint(t),tan=curve.getTangent(t);
      const l=leafBase.clone(),s=.75+rnd()*.5;l.scale(s,s,s);
      const side=i%2?1:-1;
      l.rotateZ(side*(.7+rnd()*.5));l.rotateX(-.3+rnd()*.6);
      l.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tan));
      l.translate(q.x,q.y,q.z);leaves.push(l);
    }
    if(!depth)for(let k=0;k<2;k++){
      const t=.35+.3*k,q=curve.getPoint(t),tan=curve.getTangent(t);
      const off=new THREE.Vector3(rnd()-.5,0,rnd()-.5).normalize().multiplyScalar(.9);
      stem(q.toArray(),tan.clone().add(off).toArray(),len*.45,1);
    }
  };
  const mouth=[vx,vy+.18,vz];
  for(const [dx,dz,len] of [[-.35,.05,.36],[.3,-.1,.42],[.05,-.25,.3],[-.1,.2,.33],[.45,.15,.27]])stem(mouth,[dx,1,dz],len,0);

  // Fruit bowl on the island, on the side away from the hob.
  const [fx,fz]=ctx.plan(668,503),fy=.93;
  const bowlProfile=[[0,0],[.06,0],[.062,.004],[.12,.03],[.15,.052],[.152,.056],[.146,.056],[.117,.036],[.06,.012],[0,.01]]
    .map(([x,y])=>new THREE.Vector2(x,y));
  const bowl=new THREE.LatheGeometry(bowlProfile,48);bowl.translate(fx,fy,fz);
  const bowlMat=new THREE.MeshStandardMaterial({color:'#a49686',roughness:.55});
  const fruitGeos=[];
  for(const [dx,dz,r] of [[-.045,-.02,.038],[.035,-.035,.036],[.01,.045,.037],[.075,.03,.031]]){
    const f=new THREE.SphereGeometry(r,20,14);f.scale(1,.9,1);f.translate(fx+dx,fy+.012+r*.9,fz+dz);fruitGeos.push(f);
  }
  const fruitMat=new THREE.MeshStandardMaterial({color:'#6b3424',roughness:.42});

  const g=new THREE.Group();g.name='Cocina atrezo';
  const twigMat=new THREE.MeshStandardMaterial({color:'#4a3b2c',roughness:.8});
  const leafMat=new THREE.MeshStandardMaterial({color:'#6c7048',roughness:.7,side:THREE.DoubleSide});
  g.add(new THREE.Mesh(vase,ceramic),new THREE.Mesh(mergeGeometries(twigs),twigMat),
    new THREE.Mesh(mergeGeometries(leaves.map(l=>l.toNonIndexed())),leafMat),
    new THREE.Mesh(bowl,bowlMat),new THREE.Mesh(mergeGeometries(fruitGeos),fruitMat));
  ctx.group.add(g);ctx.lightRuntimeObject(g);
}

// --- Contact shadows ---------------------------------------------------------------------
function contactShadows(ctx){
  const {THREE}=ctx;
  const blob=blurTexture(THREE,128,128,.0,.5),slab=blurTexture(THREE,512,160,.14,.16);
  const decal=(tex,x,z,w,d,opacity,y=.0015)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:tex,color:'#1c140d',transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.renderOrder=-1;m.name='cocina:sombra';ctx.group.add(m);
  };
  const S=STOOL;
  for(const [x0,x1] of STOOLS){
    const [x,z]=ctx.plan((x0+x1)/2,479.765);
    decal(blob,x,z,.66,.66,.42);
    for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;decal(blob,x+S.legR*Math.cos(a),z+S.legR*Math.sin(a),.07,.07,.75);}
  }
  // Island base (stone ends and recessed front between them), soft and wide.
  const [ix0,iz0]=ctx.plan(563.12,481.5),[ix1,iz1]=ctx.plan(715.87,524.58);
  decal(slab,(ix0+ix1)/2,(iz0+iz1)/2,(ix1-ix0)+.26,(iz1-iz0)+.26,.85);
}
// White rounded rectangle blurred to transparent edges (alpha in the colour map).
function blurTexture(THREE,w,h,inset,blur){
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
  if(!inset){
    const grad=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    for(const [s,a] of [[0,1],[.35,.78],[.6,.4],[.82,.12],[1,0]])grad.addColorStop(s,`rgba(255,255,255,${a})`);
    g.fillStyle=grad;g.fillRect(0,0,w,h);
  }else{
    const m=Math.min(w,h),pad=m*inset;
    g.filter=`blur(${m*blur*.5}px)`;g.fillStyle='#fff';
    g.beginPath();g.roundRect(pad,pad,w-2*pad,h-2*pad,m*.12);g.fill();
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
