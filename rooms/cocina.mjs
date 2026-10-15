// Room module: cocina. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/cocina.json).
//
// Render 9, round 5 (owner's notes):
// - Stone: the round-4 cross-cut map drew pale ridges clustered in clouds, so the back
//   wall and the island read as blotchy. The kitchen's own stone (region kitchen only;
//   the laundry keeps the shared one) takes a calmer "fiorito" map made by
//   scripts/cocina_textures.py: thin warm-tan curled strokes of even density over a
//   cream ground, with a shallow groove relief.
// - Oak: the fronts of render 9 are a warm mid-brown oak with soft flowing grain, not
//   the fine pin-stripe of the mocha veneer. The kitchen fronts take the photographed
//   white oak veneer (Poly Haven, CC0, already loaded for `wood`) with a longer tile,
//   more grain contrast and a lighter, less orange tint.
// - Ceiling: render 9 has a flat ceiling with downlights. Until the export drops the
//   D02 island coffer (proposal review-loop/proposals/r5-cocina.md, needs a rebake),
//   its raised ceiling and risers are hidden and a flat ceiling at 2.20 m closes it,
//   lit from the irradiance probes; the pendant rail comes down to the new ceiling.
//   This part switches itself off once the exported coffer is gone.

const ZONE=[[7.3,-.2,-3.66],[13.4,3.2,-.2]];
const VERSION='r5c';
// Render 9's ceiling is plain white paint; the shared limewash is warmer (linear gain).
const CEILING_TINT=[1.14,1.27,1.4];

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
    if(piece.userData.exported.layer==='island')m.color.multiply(new THREE.Color().setRGB(1.15,1.22,1.32));
    else m.color.multiply(new THREE.Color().setRGB(.97,.99,1.04));
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.uniforms.crosscutNormal=stoneRelief;
      shader.fragmentShader=shader.fragmentShader.replace('#define CROSSCUT_RELIEF 1.0','#define CROSSCUT_RELIEF 0.7');
    };
    m.customProgramCacheKey=()=>'cocina-stone-'+VERSION;
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
  const gapMat=mats.kitchenDark,gaps=new THREE.Group();gaps.name='Cocina juntas frentes';
  for(const [[x0,y0,x1,y1],face] of [[[483.51,432.77,514.44,606.47],'east'],[[764.25,432.77,795.18,575.54],'west']]){
    const L=y1-y0,count=Math.max(1,Math.round(L/51.53901216893343/.55));
    const at=(u,v)=>face==='east'?ctx.plan(x1-v,y0+u):ctx.plan(x0+v,y0+u);
    for(let i=1;i<count;i++){
      const u=L*i/count,[ax,az]=at(u-.14,-.45),[bx,bz]=at(u+.14,.14);
      const strip=new THREE.Mesh(new THREE.BoxGeometry(Math.abs(bx-ax),2.188-.09,Math.abs(bz-az)),gapMat);
      strip.position.set((ax+bx)/2,(2.188+.09)/2,(az+bz)/2);gaps.add(strip);
    }
  }
  ctx.group.add(gaps);ctx.lightRuntimeObject(gaps);

  // --- Ceiling: white paint ------------------------------------------------------------
  for(const piece of ctx.splitExported({material:'wall',region:'kitchen',box:[[7.3,2.19,-3.66],[13.4,2.215,-.2]]})){
    piece.material.color.multiply(new THREE.Color().setRGB(...CEILING_TINT));
    piece.material.needsUpdate=true;
  }

  // --- Flat ceiling over the island ---------------------------------------------------
  const cove=ctx.data?.coves?.[3];
  if(cove&&Math.abs(cove[4]-2.2)<.01){
    const [x0,z0,x1,z1,h]=cove;
    const box=(y0,y1)=>[[x0-.015,y0,z0-.015],[x1+.015,y1,z1+.015]];
    // Only while the export still has the coffer (raised ceiling and risers above 2.30 m);
    // a flat exported soffit at 2.20 m is left alone.
    if(ctx.removeExported({material:['wall','led'],region:'kitchen',box:box(2.3,2.75)})>0){
      ctx.removeExported({material:['wall','led'],region:'kitchen',box:box(h-.005,2.3)});
      // Flat soffit flush with the 2.20 m perimeter (0.3 mm above it where they overlap).
      const e=.003,y=h+.0003,X0=x0-e,X1=x1+e,Z0=z0-e,Z1=z1+e;
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute([X0,y,Z0, X1,y,Z0, X1,y,Z1, X0,y,Z1],3));
      geo.setAttribute('normal',new THREE.Float32BufferAttribute([0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0],3));
      // Exported UVs of horizontal faces are (x, -z) in metres.
      geo.setAttribute('uv',new THREE.Float32BufferAttribute([X0,-Z0, X1,-Z0, X1,-Z1, X0,-Z1],2));
      geo.setIndex([0,1,2,0,2,3]);
      const ceilingMat=ctx.cloneMaterial(mats.wall),priorCeiling=ceilingMat.onBeforeCompile;
      ceilingMat.color.multiply(new THREE.Color().setRGB(...CEILING_TINT));
      // Drop the painted cove glow of the wall shader (the baked rooms drop it too).
      ceilingMat.onBeforeCompile=(shader,r)=>{
        priorCeiling.call(ceilingMat,shader,r);
        shader.fragmentShader=shader.fragmentShader.replace(/float cove=0\.0;[\s\S]*?outgoingLight\+=vec3\([^)]*\)\*cove;/,'');
      };
      ceilingMat.customProgramCacheKey=()=>'cocina-ceiling';
      const ceiling=new THREE.Mesh(geo,ceilingMat);ceiling.name='Cocina techo plano';ceiling.receiveShadow=true;
      ctx.group.add(ceiling);ctx.lightRuntimeObject(ceiling);
      // Pendant rail (exported at 2.48 m, inside the coffer) moves up against the new ceiling.
      const [rx0,rz]=ctx.plan(580,506),[rx1]=ctx.plan(699,506);
      ctx.removeExported({material:'kitchenDark',region:'kitchen',box:[[rx0-.05,2.46,rz-.03],[rx1+.05,2.52,rz+.03]]});
      const rail=new THREE.Mesh(new THREE.BoxGeometry(rx1-rx0,.025,.024),mats.kitchenDark);
      rail.position.set((rx0+rx1)/2,h-.0125,rz);rail.name='Cocina carril lampara';
      ctx.group.add(rail);ctx.lightRuntimeObject(rail);
    }
  }
}
