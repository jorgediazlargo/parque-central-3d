// Room module: cocina. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/cocina.json).
//
// Render 9, round 5 (owner's notes):
// - Stone: the kitchen's own stone (region kitchen, and the laundry's worktop and
//   splashback, G14 / J06) takes a calm "fiorito" map made by scripts/cocina_textures.py.
// - Oak: the photographed white oak veneer (Poly Haven, CC0, already loaded for `wood`)
//   with a longer tile, more grain contrast and a warm mid-brown tint.
// - Ceiling (H04, D02): white plastic paint at 2.20 m with the coffer at 2.55 m over the
//   island and the two F05 rails along it (all exported; the paint is the house's).
// Round 6:
// - Stools: the exported ones are replaced by G12 / J02's oak stools (dished seat,
//   splayed legs, footrest frame, low T back), not render 9's upholstered ones.
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
// Lavadero worktop, front, upstands and splashback (G14 / J06).
const LAUNDRY=[[15.4,.7,-.95],[16.45,2.3,-.18]];
const VERSION='r9';
// Designer's slab (m): length, width.
const SLAB=[3.2,1.95],CEILING=2.2;
// B01 stool footprints (plan x ranges) on the island's north side, their centre at plan
// y 476.98 (back band 467.7-471.4).
const STOOLS=[[581.64,603.30],[612.99,634.65],[644.34,666],[675.69,697.32]];
// Where the four splayed legs of the G12 stool meet the floor (world, from its centre).
const STOOL_Y=476.98,STOOL_FEET=[[-.2,.17],[.2,.17],[0,-.21]];
// Island (kitchen_geometry.py, plan units): stone cheeks, recessed front, worktop.
const ISLAND={cheeks:[[563.12,576.58],[702.41,715.87]],y0:481.5,y1:524.58,front:498.8,top:480.17};
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
  const stoneMap=await ctx.loadTexture(`./assets/rooms/cocina/stone.webp?v=${VERSION}`);

  // --- Stone (back wall lining, worktops, island) -----------------------------------
  const [cx0]=ctx.plan(ISLAND.cheeks[0][1],0),[cx1]=ctx.plan(ISLAND.cheeks[1][0],0);
  const [,frontZ]=ctx.plan(0,ISLAND.front);
  // Bronze joints of the back-wall lining (kitchen_geometry.py, plan x 640 and 735).
  const joints=[640,735].map(x=>({facing:2,at:ctx.plan(x,0)[0]}));
  // Mirrored repeat: a piece larger than the slab meets the slab's own edge, no seam.
  stoneMap.wrapS=stoneMap.wrapT=THREE.MirroredRepeatWrapping;
  // The designer's slab laid out over each piece (honed, no relief); `shade` is GLSL run
  // where the normal maps are read.
  const slabStone=(m,shade,key)=>{
    const prior=m.onBeforeCompile;
    m.map=stoneMap;
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
        ${shade}
        #include <normal_fragment_maps>`);
    };
    m.customProgramCacheKey=()=>key;
    m.needsUpdate=true;
  };
  for(const piece of ctx.splitExported({material:'kitchenStone',region:'kitchen',box:ZONE})){
    const m=piece.material;
    slabLayout(THREE,piece.geometry,pieceSeeds(THREE,piece.geometry),joints);
    const island=piece.userData.exported.layer==='island';
    // The kitchen's warm baked light over-saturates the stone: a slightly cooler tint.
    m.color.multiply(new THREE.Color().setRGB(.97,1.0,1.06));
    slabStone(m,`{float vert=1.0-smoothstep(.5,.8,abs(houseNormal.y));
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
        diffuseColor.rgb*=mix(vec3(1.0),mix(vec3(1.0),vec3(1.05,.98,.86),smoothstep(1.8,2.1,houseWorld.y)),vert);`}}`,
      'cocina-stone-'+VERSION+(island?'-island':''));
  }
  // Lavadero (G14 / J06): the same stone. It is exported outside the kitchen region, so it
  // takes the kitchen's crosscut program here, on its own baked light.
  {
    const base=ctx.cloneMaterial(ctx.mats.kitchenCrosscut);
    for(const piece of ctx.splitExported({material:'kitchenStone',region:'shared',box:LAUNDRY})){
      // The sink bowl is probe-lit (rooms/instalaciones.mjs dropped its lightmap UVs): it
      // keeps that finish, whichever module ran first.
      if(!piece.geometry.getAttribute('uv1')){
        piece.material=ctx.cloneMaterial(ctx.mats.kitchenStone);delete piece.material.userData.bakedLit;
        ctx.lightRuntimeObject(piece);continue;
      }
      slabLayout(THREE,piece.geometry,pieceSeeds(THREE,piece.geometry),[]);
      piece.material=ctx.cloneMaterial(ctx.lightmap.material(base,'crosscut','lavadero'));
      slabStone(piece.material,'','lavadero-stone-'+VERSION);
    }
  }

  // The kitchen fronts are «rechapado de roble natural» (G10-G12), the same oak as every
  // other piece of joinery: export_world.py gives them the shared 'wood' material.

  // --- Induction hob on the island ---------------------------------------------------
  // The pose sees it at 2.6 degrees: black glass there is almost a mirror of the lit
  // stone wall behind it, but the reflection probe returns nearly nothing at that grazing
  // angle, so it read as a flat black hole (the critics' "black sink"). A stone-coloured
  // sheen at a third of the island top's baked light stands in for that reflection.
  {
    const [hx0,hz0]=ctx.plan(582,496),[hx1,hz1]=ctx.plan(620,526);
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
  const rects=[box(563.12,ISLAND.y0,576.58,ISLAND.y1),box(702.41,ISLAND.y0,715.87,ISLAND.y1),box(576.58,ISLAND.front,702.41,ISLAND.y1)];
  const legs=[],seats=[];
  for(const [x0,x1] of STOOLS){
    const [x,z]=ctx.plan((x0+x1)/2,STOOL_Y);seats.push(`vec2(${x.toFixed(4)},${z.toFixed(4)})`);
    for(const [lx,lz] of STOOL_FEET)legs.push(`vec2(${(x+lx).toFixed(4)},${(z+lz).toFixed(4)})`);
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
  // G12 / J02 (stool side, measured at scale): oak stools with a dished seat (rim at 0,67,
  // 0,38 wide), two splayed front legs and a rear leg that rises into the T back (bar at
  // 0,75-0,80, under the worktop), a footrest at 0,22.
  const oak=ctx.cloneMaterial(ctx.mats.wood);
  const parts=[],box=(w,h,d,x,y,z)=>parts.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  // Local frame: the stool faces +z (the island, south); the T back is at -z.
  box(.38,.035,.32,0,.6525,0);box(.33,.045,.26,0,.6125,0);        // seat and its apron
  const [fl,fr,rear]=STOOL_FEET,tops=[[-.15,.62,.12],[.15,.62,.12],[0,.80,-.15]];
  [fl,fr,rear].forEach(([x,z],k)=>parts.push(rod(THREE,[x,0,z],tops[k],.017,8)));
  const at=k=>{const [x,z]=STOOL_FEET[k],[tx,ty,tz]=tops[k],t=.22/ty;return [x+(tx-x)*t,.22,z+(tz-z)*t];};
  for(const [a,b] of [[0,1],[1,2],[2,0]])parts.push(rod(THREE,at(a),at(b),.012,8));
  box(.35,.05,.03,0,.775,-.15);                                    // T bar on the rear leg
  const one=mergeGeometries(parts),all=[];
  for(const [x0,x1] of STOOLS){
    const [x,z]=ctx.plan((x0+x1)/2,STOOL_Y);
    all.push(one.clone().translate(x,0,z));
  }
  const g=new THREE.Group();g.name='Cocina taburetes';
  g.add(new THREE.Mesh(mergeGeometries(all),oak));
  ctx.group.add(g);ctx.lightRuntimeObject(g);
}

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

