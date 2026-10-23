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
// Round 7 (critics: flat dull light, no contact shadows, plastic stools, repeated
// low-resolution wood and stone without credible joints):
// - Light profile of the back wall measured on render 9 against our capture: a short
//   bright wash under the slot, a plateau and a lighter backsplash (material gains by
//   height, no light added), and the stone relief catches that light from above.
// - Island in shade: the cheeks lose the round-5 boost, the recessed front darkens under
//   the overhang, the worktop takes the light. Ceiling paint lighter and less orange.
// - Contact shadows in the kitchen floor's own shader (its baked light, analytically
//   occluded by the island footprint and each stool leg), replacing round 6's decals.
// - Stools: felted wool upholstery (Poly Haven Caban, CC0) instead of channel seams,
//   glides under the legs.
// - Oak fronts: Oak Veneer 01 (Poly Haven, CC0, 2k, real 1.83 m scale); every front its
//   own cut of the veneer and its own tone. Stone: every slab its own cut, the print
//   contrast lowered and a large-scale cloud so the 1.82 m tile no longer repeats.
// Stone from the render (owner: the stone was the biggest difference with render 9):
// - The procedural strokes read as embossed wallpaper. Both maps are now synthesised
//   from render 9's own stone (scripts/cocina_textures.py): small dense curls on the back
//   wall, larger ochre swirls on a cleaner cream ground on the island. No relief.
// - The island cheeks keep the bake's light (r7 darkened them to 0.66: measured on the
//   render, the cheek in shade is as light as ours without it).
// Designer's stone (15/10/2026): render 9's travertine gives way to the quartzite the
// designer sent (white-grey, olive-beige veins; scripts/cocina_textures.py), one photo
// of a whole 320 x 195 cm slab. Every piece is cut from inside one slab, lying or
// standing, whichever fits; the tall wall panel (3.4 m) is two bookmatched halves.
// No cloud: the slab has its own.

import {mergeGeometries} from '../assets/jsm/utils/BufferGeometryUtils.js';

const ZONE=[[7.3,-.2,-3.66],[13.4,3.2,-.2]];
const VERSION='r9';
// Designer's slab (m): length, width.
const SLAB=[3.2,1.95],CEILING=2.2;
// Render 9's ceiling: lighter and far less orange than our bake (measured on the
// captures: R x1.67, G x2.15, B x3.0 linear); part of it as a paint gain.
const CEILING_TINT=[1.14*1.75,1.27*2.08,1.4*2.55];
// B01 stool footprints (plan x ranges) on the island's north side, plan y 479.765.
const STOOLS=[[581.64,603.30],[612.99,634.65],[644.34,666],[675.69,697.32]];
const STOOL={seatR:.198,seatTop:.672,seatBottom:.592,edge:.034,ringY:.69,ringR:.214,tube:.0105,
  legR:.212,footY:.245,backR:.19,backThick:.032,backH:.056,backY:.758,backHalf:110*Math.PI/180};
// Island (kitchen_geometry.py, plan units): stone cheeks, recessed front, worktop.
const ISLAND={cheeks:[[563.12,578],[701,715.87]],y0:481.5,y1:524.58,front:498.8,top:480.17};
// Back wall stone, height (m) -> gain over the baked light. Baked irradiance measured on
// the wall (main run, x 10.1-12.6): 1.73 at 0.95 m, 2.2 at 1.3, 2.57 at 1.5, 3.9 at 1.75,
// 5.2 at 1.85, 10.8 at 1.95, 19.5 at 2.0, 40.5 at 2.1 (the wash tails off over 60 cm).
// Render 9 has a bright band only 15-20 cm deep over an even plateau that is a little
// lighter towards the worktop and 1.3x ours: the product here is 2.9-3.3 from 0.95 to
// 1.85 m, then the band rises to 4x the plateau (see review-loop/proposals/r7-cocina.md).
const WALL_GAIN=[[.95,1.7],[1.3,1.48],[1.5,1.3],[1.65,1.02],[1.75,.78],[1.85,.56],[1.95,.4],[2.03,.32],[2.12,.34],[2.17,.42]];
const curve=(pts,v)=>pts.slice(1).reduce((s,[x,g],i)=>`mix(${s},${g.toFixed(3)},smoothstep(${pts[i][0].toFixed(3)},${x.toFixed(3)},${v}))`,pts[0][1].toFixed(3));

const hash=r=>{const x=Math.sin(r*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
// One random number per connected piece (front, slab, cheek) of a non-indexed geometry,
// as a vertex attribute: per-piece texture cuts and tones.
function pieceSeeds(THREE,geo){
  const pos=geo.getAttribute('position'),n=pos.count,parent=new Int32Array(n).map((_,i)=>i);
  const find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
  const at=new Map();
  for(let i=0;i<n;i++){
    const k=`${Math.round(pos.getX(i)*4000)},${Math.round(pos.getY(i)*4000)},${Math.round(pos.getZ(i)*4000)}`;
    const j=at.get(k);if(j===undefined)at.set(k,i);else join(i,j);
    if(i%3)join(i,i-1);
  }
  const seed=new Float32Array(n);
  const root=Int32Array.from({length:n},(_,i)=>find(i));
  for(let i=0;i<n;i++)seed[i]=hash(root[i]);
  geo.setAttribute('pieceSeed',new THREE.BufferAttribute(seed,1));
  return root;
}
const seedVertex=shader=>{
  shader.vertexShader='attribute float pieceSeed;\nvarying float vPieceSeed;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPieceSeed=pieceSeed;');
  shader.fragmentShader='varying float vPieceSeed;\n'+shader.fragmentShader;
};
// Where each stone piece sits in the slab, per vertex: origin, a 2x2 map from the piece's
// own plane (metres from the origin, horizontal first) to slab UV, and offset + bookmatch
// flag. Lying (slab length horizontal) or standing, whichever fits, at a random place
// inside the slab. Wider than both: two mirrored halves, meeting at one of the lining's
// joints if both sides fit (a bookmatch needs a joint), else at the centre; a piece taller
// than the slab keeps the slab's top edge at the ceiling (the joint goes low, behind the
// island). Planes: x-facing (z,y), y-facing (x,z), z-facing (x,y).
function slabLayout(THREE,geo,root,joints){
  const pos=geo.getAttribute('position'),n=pos.count,box=new Map();
  for(let i=0;i<n;i++){
    let b=box.get(root[i]);if(!b)box.set(root[i],b={lo:[1e9,1e9,1e9],hi:[-1e9,-1e9,-1e9]});
    for(let a=0;a<3;a++){const v=pos.getComponent(i,a);b.lo[a]=Math.min(b.lo[a],v);b.hi[a]=Math.max(b.hi[a],v);}
  }
  const [L,W]=SLAB,lay=new Map();
  for(const [r,b] of box){
    // Facing: the piece's thinnest extent (slabs, worktops; the island's round ends face x).
    const size=b.hi.map((x,a)=>x-b.lo[a]),axis=size.indexOf(Math.min(...size)),[h,v]=[[2,1],[0,2],[0,1]][axis];
    const lo=b.lo[h],hi=b.hi[h],w=hi-lo,t=b.hi[v]-b.lo[v],c=b.lo.map((x,a)=>(x+b.hi[a])/2);
    // [standing, mirror at, widest side (m), may overflow the slab's height]
    const cand=[[0,null,w,0],[1,null,w,0],
      ...joints.filter(j=>j.facing===axis&&lo<j.at&&j.at<hi).sort((p,q)=>Math.abs(p.at-c[h])-Math.abs(q.at-c[h]))
        .flatMap(j=>[1,0].map(st=>[st,j.at,Math.max(j.at-lo,hi-j.at),1])),
      [1,c[h],w/2,0],[0,c[h],w/2,0]];
    const [stand,mirror,side]=cand.find(([st,,e,tall])=>e<=(st?W:L)&&(tall||t<=(st?L:W)))||[1,c[h],w/2];
    if(mirror!==null)c[h]=mirror;
    // Extent of the piece in slab UV along its horizontal (uw) and vertical (ut) axes.
    const uw=side/(stand?W:L),ut=t/(stand?L:W),r1=hash(r),r2=hash(r*7+3);
    const ph=mirror!==null?r1*Math.max(0,1-uw):.5+(r1-.5)*Math.max(0,1-uw);
    const pv=ut>1&&v===1?1-(Math.min(b.hi[v],CEILING)-c[v])/(stand?L:W):.5+(r2-.5)*Math.max(0,1-ut);
    lay.set(r,{c,A:stand?[0,1/W,1/L,0]:[1/L,0,0,1/W],B:stand?[pv,ph,+(mirror!==null)]:[ph,pv,+(mirror!==null)]});
  }
  const c=new Float32Array(n*3),A=new Float32Array(n*4),B=new Float32Array(n*3);
  for(let i=0;i<n;i++){const l=lay.get(root[i]);c.set(l.c,i*3);A.set(l.A,i*4);B.set(l.B,i*3);}
  geo.setAttribute('slabCentre',new THREE.BufferAttribute(c,3));
  geo.setAttribute('slabA',new THREE.BufferAttribute(A,4));
  geo.setAttribute('slabB',new THREE.BufferAttribute(B,3));
}

export async function apply(ctx){
  const {THREE,mats}=ctx;
  const aniso=Math.min(8,ctx.renderer.capabilities.getMaxAnisotropy());
  const [stoneMap,oakDiff,oakNor,oakRough]=await Promise.all([
    ctx.loadTexture(`./assets/rooms/cocina/stone.webp?v=${VERSION}`),
    ctx.loadTexture('./assets/polyhaven/oak_veneer_01/oak_veneer_01_diff_2k.webp'),
    ctx.loadTexture('./assets/polyhaven/oak_veneer_01/oak_veneer_01_nor_gl_2k.webp',{srgb:false}),
    ctx.loadTexture('./assets/polyhaven/oak_veneer_01/oak_veneer_01_rough_1k.webp',{srgb:false})]);

  // --- Stone (back wall lining, worktops, island) -----------------------------------
  const [cx0]=ctx.plan(ISLAND.cheeks[0][1],0),[cx1]=ctx.plan(ISLAND.cheeks[1][0],0);
  const [,frontZ]=ctx.plan(0,ISLAND.front);
  // Bronze joints of the back-wall lining (kitchen_geometry.py, plan x 640 and 735).
  const joints=[640,735].map(x=>({facing:2,at:ctx.plan(x,0)[0]}));
  // Mirrored repeat: a piece larger than the slab meets the slab's own edge, no seam.
  stoneMap.wrapS=stoneMap.wrapT=THREE.MirroredRepeatWrapping;
  for(const piece of ctx.splitExported({material:'kitchenStone',region:'kitchen',box:ZONE})){
    const m=piece.material,prior=m.onBeforeCompile;
    slabLayout(THREE,piece.geometry,pieceSeeds(THREE,piece.geometry),joints);
    const island=piece.userData.exported.layer==='island';
    m.map=stoneMap;
    // The kitchen's warm baked light over-saturates the stone: a slightly cooler tint.
    m.color.multiply(new THREE.Color().setRGB(.97,1.0,1.06));
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      seedVertex(shader);
      shader.vertexShader='attribute vec3 slabCentre,slabB;\nattribute vec4 slabA;\nvarying vec3 vSlabCentre,vSlabB;\nvarying vec4 vSlabA;\n'
        +shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSlabCentre=slabCentre;vSlabA=slabA;vSlabB=slabB;');
      shader.fragmentShader=shader.fragmentShader.replace('void main() {',`varying vec3 vSlabCentre,vSlabB;
        varying vec4 vSlabA;
        vec2 slabUv(vec2 p){return mat2(vSlabA.xy,vSlabA.zw)*vec2(mix(p.x,abs(p.x),vSlabB.z),p.y)+vSlabB.xy;}
        void main() {`);
      // Flat (honed): no relief.
      shader.fragmentShader=shader.fragmentShader.replace('#define CROSSCUT_RELIEF 1.0','#define CROSSCUT_RELIEF 0.0')
        .replace('vec2 ccX=houseWorld.zy*1.1,ccY=houseWorld.xz*1.1,ccZ=houseWorld.xy*1.1;',`
          vec3 slabP=houseWorld-vSlabCentre;
          vec2 ccX=slabUv(slabP.zy),ccY=slabUv(slabP.xz),ccZ=slabUv(slabP.xy);`)
        // Slab tone: pieces of one lot differ a little.
        .replace('#include <normal_fragment_maps>',`
        diffuseColor.rgb*=1.0+.04*(fract(vPieceSeed*41.7)-.5);
        {float vert=1.0-smoothstep(.5,.8,abs(houseNormal.y));
        ${island?`
        // Island in the shade of its worktop: the cheeks (x outside the recess) keep the
        // bake's light; the recessed front keeps the bake's own shade under the 36 cm
        // overhang (0.63 at 0.8 m, 1.2 at 0.3 m).
        float cheek=1.0-step(${cx0.toFixed(3)},houseWorld.x)*step(houseWorld.x,${cx1.toFixed(3)});
        float recess=(1.0-cheek)*step(${(frontZ-.03).toFixed(3)},houseWorld.z);
        float body=mix(1.0,1.1,recess)*mix(.8,1.0,smoothstep(.02,.22,houseWorld.y));
        diffuseColor.rgb*=houseWorld.y>.875?1.9:mix(1.0,body,vert);`:`
        diffuseColor.rgb*=mix(1.5,${curve(WALL_GAIN,'houseWorld.y')},vert);
        // Warm golden band under the slot, a calmer cream below (render 9).
        diffuseColor.rgb*=mix(vec3(1.0),mix(vec3(1.0),vec3(1.05,.98,.86),smoothstep(1.8,2.1,houseWorld.y)),vert);`}}
        #include <normal_fragment_maps>`);
    };
    m.customProgramCacheKey=()=>'cocina-stone-'+VERSION+(island?'-island':'');
    m.needsUpdate=true;
  }

  // --- Oak fronts ---------------------------------------------------------------------
  // Oak Veneer 01: 1.83 m square, vertical grain, 2k. Tint keeps r6's mean albedo
  // (white oak .280/.193/.125 x r6 tint) over this veneer's mean (.361/.212/.099).
  // Drawn out 3x along the grain: its flat-cut arches become the straight fine grain of
  // render 9's fronts.
  for(const t of [oakDiff,oakNor,oakRough]){t.repeat.set(1/1.25,1/5.5);t.anisotropy=aniso;}
  for(const piece of ctx.splitExported({material:'kitchenOak',region:'kitchen',box:ZONE})){
    const m=piece.material,prior=m.onBeforeCompile;
    pieceSeeds(THREE,piece.geometry);
    m.map=oakDiff;m.normalMap=oakNor;m.roughnessMap=oakRough;m.normalScale.set(.55,.55);m.bumpMap=null;
    m.color.setRGB(.761*1.1,1.2*1.1,2.163*1.1);
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      seedVertex(shader);
      // Each front its own cut of the veneer (one piece per front, so per-vertex is exact).
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
        {vec2 cut=vec2(pieceSeed,fract(pieceSeed*23.17))*vec2(1.0,1.0);
        #ifdef USE_MAP
        vMapUv+=cut;
        #endif
        #ifdef USE_NORMALMAP
        vNormalMapUv+=cut;
        #endif
        #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv+=cut;
        #endif
        }`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        #ifdef USE_MAP
        // Figure a little stronger; each front a touch lighter or darker, as veneer
        // leaves are; the fronts darken towards the floor (render 9).
        diffuseColor.rgb*=clamp(pow(dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722))/.2356,.45),.65,1.4);
        #endif
        diffuseColor.rgb*=(1.0+.07*(fract(vPieceSeed*29.3)-.5))*mix(.85,1.0,smoothstep(.05,1.1,houseWorld.y));
        // West run (right of the pose), under the downlight 19 cm from its fronts: render 9
        // has it lighter at mid height and darker at the foot (measured 84 vs 65 on screen).
        diffuseColor.rgb*=mix(1.0,1.2*mix(.78,1.0,smoothstep(.3,1.2,houseWorld.y)),step(houseWorld.x,9.5));`);
    };
    m.customProgramCacheKey=()=>'cocina-oak-'+VERSION;
    m.needsUpdate=true;
  }

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
    for(const piece of ctx.splitExported({material:'ovenGlass',region:'kitchen',box:[[hx0,.89,hz0],[hx1,.92,hz1]]})){
      const m=piece.material,prior=m.onBeforeCompile;m.color.set('#2b2927');m.roughness=.3;m.metalness=0;
      m.onBeforeCompile=(shader,r)=>{
        prior.call(m,shader,r);
        shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',
          'reflectedLight.indirectSpecular+=iblIrradiance*RECIPROCAL_PI*vec3(.60,.58,.57)*.34;\n#include <aomap_fragment>');
      };
      m.customProgramCacheKey=()=>'cocina-hob-'+VERSION;m.needsUpdate=true;
    }
  }

  floorContact(ctx);
  await stools(ctx);
  props(ctx);
}

// --- Contact shadows in the floor ---------------------------------------------------------
// The kitchen floor keeps its baked light and material; its own copy multiplies the light
// by an analytic occlusion: the island footprint (cheeks and the recessed carcass under
// the overhang) and, for each stool, its four legs and the soft shade of the seat.
function floorContact(ctx){
  const {THREE}=ctx,P=(x,y)=>ctx.plan(x,y).map(v=>v.toFixed(4));
  const box=(x0,y0,x1,y1)=>{const [a,b]=P(x0,y0),[c,d]=P(x1,y1);return `vec4(${a},${b},${c},${d})`;};
  const rects=[box(563.12,ISLAND.y0,578,ISLAND.y1),box(701,ISLAND.y0,715.87,ISLAND.y1),box(578,ISLAND.front,701,ISLAND.y1)];
  const legs=[],seats=[];
  for(const [x0,x1] of STOOLS){
    const [x,z]=ctx.plan((x0+x1)/2,479.765);seats.push(`vec2(${x.toFixed(4)},${z.toFixed(4)})`);
    for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;legs.push(`vec2(${(x+STOOL.legR*Math.cos(a)).toFixed(4)},${(z+STOOL.legR*Math.sin(a)).toFixed(4)})`);}
  }
  const code=`
    float cocinaAO=1.0;
    {vec2 q=houseWorld.xz;
    float d=1e3;
    ${rects.map(r=>`{vec4 r=${r};vec2 c=(r.xy+r.zw)*.5,h=abs(r.zw-r.xy)*.5;vec2 o=abs(q-c)-h+.12;d=min(d,length(max(o,0.0))+min(max(o.x,o.y),0.0)-.12);}`).join('\n')}
    d=max(d,0.0);
    cocinaAO*=1.0-.38*exp(-d/.04)-.15*exp(-d/.25);
    ${seats.map(s=>`{float r=length(q-${s});cocinaAO*=1.0-.24*exp(-r*r/.045);}`).join('\n')}
    ${legs.map(l=>`{float r=length(q-${l});cocinaAO*=1.0-.62*exp(-r*r/.00045)-.18*exp(-r*r/.006);}`).join('\n')}
    }
    bakedE*=cocinaAO;radiance*=cocinaAO;`;
  for(const piece of ctx.splitExported({material:'floor',region:'kitchen',box:[[7.3,-.2,-3.66],[13.4,.2,-.2]]})){
    const m=piece.material,prior=m.onBeforeCompile;
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.fragmentShader=shader.fragmentShader.replace('float inside=max(baked,lpCover);',code+'\nfloat inside=max(baked,lpCover);');
    };
    m.customProgramCacheKey=()=>'cocina-floor-'+VERSION;m.needsUpdate=true;
  }
}

// --- Stools of render 9 ----------------------------------------------------------------
async function stools(ctx){
  const {THREE}=ctx;
  // Drop the exported stools: upholstery (kitchenFabric) and frames (kitchenBronze).
  const [bx0,bz0]=ctx.plan(570,458),[bx1,bz1]=ctx.plan(710,500);
  ctx.removeExported({material:['kitchenFabric','kitchenBronze'],region:'kitchen',box:[[bx0,-.1,bz0],[bx1,1.0,bz1]]});

  const S=STOOL;
  // Felted wool (Poly Haven Caban, 27 cm tile): its luminance as detail (0.5 = unchanged)
  // and its normals; matte with a soft sheen, no seams. The colour is a cool grey because
  // the probe light here is very orange (R/B 4.7): on screen it reads as render 9's taupe.
  // The undersides fall into the seat's own shade.
  const [detail,normal]=await Promise.all([
    ctx.loadTexture('./assets/polyhaven/caban/caban_detail_1k.webp',{srgb:false}),
    ctx.loadTexture('./assets/polyhaven/caban/caban_nor_gl_1k.webp',{srgb:false})]);
  for(const t of [detail,normal])t.repeat.set(1/.274,1/.274);
  const wool=new THREE.MeshPhysicalMaterial({color:'#9e9b9e',roughness:.93,sheen:.3,sheenRoughness:.55,sheenColor:new THREE.Color('#b8b4b0'),
    map:detail,normalMap:normal,normalScale:new THREE.Vector2(1,1)});
  wool.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
        diffuseColor.rgb*=texture2D(map,vMapUv).r*2.0;
      #endif`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      diffuseColor.rgb*=mix(.55,1.0,smoothstep(-.7,.45,inverseTransformDirection(normal,viewMatrix).y));`);
  };
  wool.customProgramCacheKey=()=>'cocina-wool-'+VERSION;
  // Satin brass: part metallic, so the probe light (not only the dim reflection probe)
  // gives it its golden mid-tone. Render 9's is an aged, darker bronze-brass.
  const brass=new THREE.MeshStandardMaterial({color:'#a39a72',metalness:.6,roughness:.4});
  const glide=new THREE.MeshStandardMaterial({color:'#2a2622',roughness:.6});

  // One stool in local space (back towards -z, the camera side; it faces the island at +z).
  const soft=[seat(THREE,S),back(THREE,S)];
  const metal=[];
  const ring=new THREE.TorusGeometry(S.ringR,S.tube,10,72);ring.rotateX(Math.PI/2);ring.translate(0,S.ringY,0);metal.push(ring);
  const legs=[0,1,2,3].map(k=>{const a=Math.PI/4+k*Math.PI/2;return [S.legR*Math.cos(a),S.legR*Math.sin(a)];});
  for(const [x,z] of legs)metal.push(rod(THREE,[x,.007,z],[x,S.ringY,z],S.tube*1.1,12));
  // Floor glides: the legs stand on the floor, not just above it.
  const feet=mergeGeometries(legs.map(([x,z])=>new THREE.CylinderGeometry(S.tube*1.25,S.tube*1.35,.007,12).translate(x,.0035,z)));
  for(let k=0;k<4;k++){
    const [ax,az]=legs[k],[cx,cz]=legs[(k+1)%4];
    metal.push(rod(THREE,[ax,S.footY,az],[cx,S.footY,cz],S.tube*.85,10));
  }
  // Short brass posts carrying the back over the ring.
  for(const a of [-.62,0,.62].map(d=>-Math.PI/2+d)){
    const r=S.backR;metal.push(rod(THREE,[r*Math.cos(a),S.ringY,r*Math.sin(a)],[r*Math.cos(a),S.backY-S.backH*.6,r*Math.sin(a)],S.tube*.8,8));
  }
  const softOne=mergeGeometries(soft),metalOne=mergeGeometries(metal);
  const all={soft:[],metal:[],feet:[]};
  for(const [x0,x1] of STOOLS){
    const [x,z]=ctx.plan((x0+x1)/2,479.765);
    all.soft.push(softOne.clone().translate(x,0,z));all.metal.push(metalOne.clone().translate(x,0,z));all.feet.push(feet.clone().translate(x,0,z));
  }
  const g=new THREE.Group();g.name='Cocina taburetes';
  g.add(new THREE.Mesh(mergeGeometries(all.soft),wool),new THREE.Mesh(mergeGeometries(all.metal),brass),new THREE.Mesh(mergeGeometries(all.feet),glide));
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
  const [vx,vz]=ctx.plan(536,599),vy=.90;
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
  const [fx,fz]=ctx.plan(668,503),fy=.90;
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

