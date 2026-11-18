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
// - Stools: the exported ones were replaced by G12 / J02's oak stools until 18/11/2026;
//   now render 9's upholstered ones (owner), see stools().
// - Contact shadows (soft decals) along the island base (the stools' are baked since 18/11/2026).
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
// Taj Mahal (13/11/2026, owner's choice): worktops, island, desayunador and wall linings
// are natural Taj Mahal quartzite, 2 cm, polished (roughness .14, the room's reflections),
// in the photo's own warm cream; the photo is one 320 x 240 cm slab. The lavadero
// is Laminam «Taj Mahal» porcelain (DNA finish: matte, slightly textured), as are the
// vanity tops of the three baths. Slab layout shared with them in rooms/slab.mjs.

import {mergeGeometries} from '../assets/jsm/utils/BufferGeometryUtils.js';
import {upholstery,CHAIR_WEAVE} from './salon.mjs';
import {QUARTZITE,STONE_WHITE,pieceSeeds,slabLayout,slabStone,laminam} from './slab.mjs?v=tm1';

const ZONE=[[7.3,-.2,-3.66],[13.4,3.2,-.2]];
// Lavadero worktop, front, upstands and splashback (G14 / J06).
const LAUNDRY=[[15.4,.7,-.95],[16.45,2.3,-.18]];
const VERSION='tm1';
// B01 stool footprints (plan x ranges) on the island's north side, their centre at plan
// y 476.98 (back band 467.7-471.4).
const STOOLS=[[581.64,603.30],[612.99,634.65],[644.34,666],[675.69,697.32]];
const STOOL_Y=476.98;
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

export async function apply(ctx){
  const {THREE,mats}=ctx;
  const stoneMap=await ctx.loadTexture(`./assets/rooms/cocina/stone.webp?v=${VERSION}`);

  // --- Stone (back wall lining, worktops, island) -----------------------------------
  const [cx0]=ctx.plan(ISLAND.cheeks[0][1],0),[cx1]=ctx.plan(ISLAND.cheeks[1][0],0);
  const [,frontZ]=ctx.plan(0,ISLAND.front);
  // The back-wall lining has no joints since 18/11/2026 (owner): its 2.78 m fit one slab.
  const joints=[];
  // Mirrored repeat: a piece larger than the slab meets the slab's own edge, no seam.
  stoneMap.wrapS=stoneMap.wrapT=THREE.MirroredRepeatWrapping;
  for(const piece of ctx.splitExported({material:'kitchenStone',region:'kitchen',box:ZONE})){
    const m=piece.material;
    slabLayout(THREE,piece.geometry,pieceSeeds(THREE,piece.geometry),joints,QUARTZITE.slab);
    const island=piece.userData.exported.layer==='island';
    // The photo's own cream, at the luminance the bluish crosscut base had; polished. The
    // kitchen's warm baked light over-saturates it (tan, not cream): a slightly cooler tint.
    m.color.setScalar(STONE_WHITE).multiply(new THREE.Color().setRGB(.96,1.0,1.07));m.roughness=QUARTZITE.roughness;
    slabStone(m,{map:stoneMap,shade:`{float vert=1.0-smoothstep(.5,.8,abs(houseNormal.y));
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
      key:'cocina-stone-'+VERSION+(island?'-island':'')});
  }
  // Lavadero (G14 / J06): Laminam «Taj Mahal» (front, upstand, splashback, worktop), on
  // its own baked light. The sink bowl is probe-lit granite composite (I02 Schock,
  // rooms/instalaciones.mjs dropped its lightmap UVs): it is left to that module.
  await laminam(ctx,ctx.splitExported({material:'kitchenStone',region:'shared',box:LAUNDRY}).filter(p=>p.geometry.getAttribute('uv1')),'lavadero',VERSION);

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
// the overhang). The stools' shadow is in the bake (dump_runtime.py).
function floorContact(ctx){
  const {THREE}=ctx,P=(x,y)=>ctx.plan(x,y).map(v=>v.toFixed(4));
  const box=(x0,y0,x1,y1)=>{const [a,b]=P(x0,y0),[c,d]=P(x1,y1);return `vec4(${a},${b},${c},${d})`;};
  const rects=[box(563.12,ISLAND.y0,576.58,ISLAND.y1),box(702.41,ISLAND.y0,715.87,ISLAND.y1),box(576.58,ISLAND.front,702.41,ISLAND.y1)];
  const code=`
    float cocinaAO=1.0;
    {vec2 q=houseWorld.xz;
    float d=1e3;
    ${rects.map(r=>`{vec4 r=${r};vec2 c=(r.xy+r.zw)*.5,h=abs(r.zw-r.xy)*.5;vec2 o=abs(q-c)-h+.12;d=min(d,length(max(o,0.0))+min(max(o.x,o.y),0.0)-.12);}`).join('\n')}
    d=max(d,0.0);
    cocinaAO*=1.0-.38*exp(-d/.04)-.15*exp(-d/.25);
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
// Owner, 18/11/2026: the stools of render 9, not G12 / J02's oak ones. A round upholstered
// seat (Ø 40 cm, top at 0,70) with a low upholstered back band round its rear half on a
// bronze hoop, four straight bronze legs (Ø 19 mm) and a footrest frame at 0,27. Four, on
// the B01 footprints (the render has five on a longer island). Their floor shadow is in
// the bake now (dump_runtime.py), so the floor shader no longer fakes it.
async function stools(ctx){
  const {THREE}=ctx;
  // Drop the exported stools: upholstery (kitchenFabric) and frames (kitchenBronze).
  const [bx0,bz0]=ctx.plan(570,458),[bx1,bz1]=ctx.plan(710,500);
  ctx.removeExported({material:['kitchenFabric','kitchenBronze'],region:'kitchen',box:[[bx0,-.1,bz0],[bx1,1.0,bz1]]});
  const fabric=await upholstery(ctx,ctx.mats.kitchenFabric,{...CHAIR_WEAVE,color:'#958a7f',key:'cocina-taburete'});
  const bronze=ctx.cloneMaterial(ctx.mats.kitchenBronze);bronze.color.set('#c09a62');bronze.metalness=.7;bronze.roughness=.32;  // satin brass-bronze of render 9
  const soft=[],metal=[];
  // Local frame: the stool faces +z (the island); its back is at -z.
  const SEAT={r:.20,y0:.615,y1:.70,edge:.032},HOOP={r:.2,y:.728},BACK={r:.19,y:.77,tube:.026,squash:1.65,arc:Math.PI*1.12};
  // Seat: a lathed cushion with a soft rounded edge and a slight crown.
  const prof=[];
  prof.push(new THREE.Vector2(0,SEAT.y0+.004));
  for(let i=0;i<=8;i++){const t=-Math.PI/2+i/8*Math.PI/2;prof.push(new THREE.Vector2(SEAT.r-SEAT.edge+SEAT.edge*Math.cos(t),SEAT.y0+SEAT.edge+SEAT.edge*Math.sin(t)));}
  for(let i=1;i<=8;i++){const t=i/8*Math.PI/2;prof.push(new THREE.Vector2(SEAT.r-SEAT.edge+SEAT.edge*Math.cos(t),SEAT.y1-SEAT.edge+SEAT.edge*Math.sin(t)));}
  prof.push(new THREE.Vector2(SEAT.r*.55,SEAT.y1+.006),new THREE.Vector2(0,SEAT.y1+.008));
  soft.push(metricUV(new THREE.LatheGeometry(prof,40)));
  // Back band: a squashed tube round the rear, its ends closed by squashed spheres.
  const arc=[],n=24,a0=-Math.PI/2-BACK.arc/2;
  for(let i=0;i<=n;i++){const t=a0+i/n*BACK.arc;arc.push(new THREE.Vector3(Math.cos(t)*BACK.r,0,Math.sin(t)*BACK.r));}
  const band=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc),48,BACK.tube,14,false);
  const caps=[arc[0],arc[n]].map(p=>new THREE.SphereGeometry(BACK.tube,14,10).translate(p.x,0,p.z));
  for(const g of [band,...caps]){g.scale(1,BACK.squash,1);g.translate(0,BACK.y,0);soft.push(metricUV(g));}
  // Bronze: hoop under the band, four legs, footrest frame, glides.
  const hoopArc=[];for(let i=0;i<=n;i++){const t=a0+i/n*BACK.arc;hoopArc.push(new THREE.Vector3(Math.cos(t)*HOOP.r,HOOP.y,Math.sin(t)*HOOP.r));}
  metal.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hoopArc),48,.0075,10,false));
  const L=.165,legs=[[-L,-L],[L,-L],[L,L],[-L,L]];
  for(const [x,z] of legs){
    const top=z<0?HOOP.y:SEAT.y0+.01;
    metal.push(rod(THREE,[x,.008,z],[x,top,z],.0095,14));
    metal.push(new THREE.CylinderGeometry(.011,.012,.008,14).translate(x,.004,z));   // glide
  }
  for(let k=0;k<4;k++){const [x0,z0]=legs[k],[x1,z1]=legs[(k+1)%4];metal.push(rod(THREE,[x0,.27,z0],[x1,.27,z1],.0075,10));}
  // Rails under the seat: front pair of legs to the seat pan.
  metal.push(rod(THREE,[-L,SEAT.y0-.005,L],[L,SEAT.y0-.005,L],.0075,10),rod(THREE,[-L,SEAT.y0-.005,-L],[L,SEAT.y0-.005,-L],.0075,10));
  const prep=(list,keep)=>list.map(g=>{g=g.index?g.toNonIndexed():g;for(const k of Object.keys(g.attributes))if(!keep.includes(k))g.deleteAttribute(k);return g;});
  const softOne=mergeGeometries(prep(soft,['position','normal','uv'])),metalOne=mergeGeometries(prep(metal,['position','normal','uv']));
  // Upholstery shade: darker under the seat and inside the band (where hands do not reach light).
  {const p=softOne.getAttribute('position'),nm=softOne.getAttribute('normal'),c=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){const v=.62+.38*THREE.MathUtils.smoothstep(nm.getY(i),-.9,.4);c[i*3]=c[i*3+1]=c[i*3+2]=v;}
    softOne.setAttribute('color',new THREE.BufferAttribute(c,3));}
  const softAll=[],metalAll=[];
  for(const [x0,x1] of STOOLS){
    const [x,z]=ctx.plan((x0+x1)/2,STOOL_Y);
    softAll.push(softOne.clone().translate(x,0,z));metalAll.push(metalOne.clone().translate(x,0,z));
  }
  const g=new THREE.Group();g.name='Cocina taburetes';
  g.add(new THREE.Mesh(mergeGeometries(softAll),fabric),new THREE.Mesh(mergeGeometries(metalAll),bronze));
  ctx.group.add(g);ctx.lightRuntimeObject(g);
}
// UVs in metres (u round the surface, v along it), for upholstery tiled per metre.
function metricUV(g){
  const p=g.getAttribute('position'),uv=g.getAttribute('uv');
  for(let i=0;i<uv.count;i++){const r=Math.hypot(p.getX(i),p.getZ(i));uv.setXY(i,Math.atan2(p.getZ(i),p.getX(i))*Math.max(r,.05),p.getY(i)+r*.5);}
  return g;
}

function rod(THREE,a,b,r,seg,rTop=r){
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),L=d.length();
  const g=new THREE.CylinderGeometry(rTop,r,L,seg,1,true);g.translate(0,L/2,0);
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

