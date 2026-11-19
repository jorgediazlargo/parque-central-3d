// Room module: vestidor. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/vestidor.json).
//
// Render 6: glazed oak wardrobes lit from above by the LED strip under each shelf.
// - Clothes from a library modelled in Blender (scripts/garments_blender.py, one glb):
//   shirts with collar, placket, buttons and cuffs; knits with ribbed neck, cuffs and
//   hem; jackets and coats with lapels, pocket flaps and buttons; 2 variants of each,
//   2.600-4.300 triangles, with the drape folds, seams and stitching baked into a
//   normal map and ambient occlusion in the vertex colour. Contoured oak hangers and
//   brass hooks; folded pieces (shirt, knit, tee) on the shelves; loafers, sneakers,
//   Chelsea boots and pumps instead of the exported shoe blocks (found by size and
//   removed by index). All drawn as InstancedMesh with a colour per instance; the LED
//   light, the shade towards the back and the neighbour's shade, once vertex colours,
//   are per pixel (ropaShade per instance). About 320.000 triangles for the whole house.
// - Contact shadows on the shelves under the folded stacks.
// - Wardrobe interiors: warm gradient down from each strip, darker shelf undersides,
//   contact lines, and the clothes' shadow on the back panel and the drawer tops.
// - Glass doors: bronze tint; the sharp reflection of the other glazed fronts (warm
//   interiors, LED lines, frames) is traced in the shader with Fresnel per face.
// - Frames, rails and handles in satin champagne bronze.
// - Contact shadow on the floor along the wardrobe bases.

// Proyecto de ejecución (scripts/proyecto.py): every wardrobe's rails and clothes
// shelves come from house.json (wardrobes.rails, wardrobes.stacks); garments hang in all
// of them, also behind the oak doors of the other rooms (seen when a front opens).
// Glazed modules (A1-A3, proyecto.py glass_module, G07): top shelf at 1,84, accessory
// tray to 0,90; their light is the vertical sensor strips up both module sides, so the
// light falloff from the shelf (STRIP_Y, TOP_STRIP_Y) is only a soft shading.
const STRIP_Y=1.84, TOP_STRIP_Y=2.18;
// Clothes library made by scripts/garments_blender.py; ?v= is the file's content hash.
const ROPA_URL='./assets/rooms/vestidor/ropa.glb?v=4ea2ff940e';
const SHELF_Y=1.84,HANG_Y=.90;
// Render 6 palette (sRGB).
const COLORS={white:'#eeeae3',ivory:'#ddd4c4',ecru:'#c3ae90',sand:'#a28a6c',greige:'#86776a',taupe:'#66553f',olive:'#59543f',brown:'#45362a',umber:'#2c241d'};
// Per bay, in hanging order: [type, colour].
const SETS=[
  [['shirt','white'],['jacket','brown'],['shirt','ivory'],['knit','olive'],['shirt','white']],
  [['jacket','umber'],['shirt','white'],['shirt','greige'],['coat','sand'],['shirt','ivory']],
  [['shirt','ecru'],['knit','brown'],['shirt','white'],['jacket','taupe'],['shirt','umber']],
  [['coat','taupe'],['shirt','white'],['jacket','olive'],['shirt','ivory'],['knit','brown']],
];
const STACK_COLORS=['white','ivory','ecru','white','greige','ivory','sand','white'];
const ZONE=[[[0,-.2,-5.9],[4.4,3.2,-4.15]],[[0,-.2,-4.15],[.75,3.2,-1.79]],[[4.3,-.2,-4.15],[4.85,3.2,-.2]],[[4.4,-.2,-4.75],[4.85,3.2,-4.15]]];
// Floor contact strips: centre line on the wardrobe base, [from, to], outward normal.
const BASES=[{axis:'z',at:.727,span:[-5.66,-1.995],out:[1,0]},{axis:'x',at:-5.056,span:[1.62,3.59],out:[0,1]},
  {axis:'z',at:4.329,span:[-2.73,-1.99],out:[-1,0]},{axis:'z',at:4.479,span:[-5.48,-4.82],out:[-1,0]}];

export async function apply(ctx){
  const {THREE,group}=ctx;

  const W=ctx.data.wardrobes||{rails:[],stacks:[],glass:[]};
  // Rails: fixed coordinate, [from, to] along the rail, outward normal, height, garments.
  const BAYS=W.rails.map(r=>({...r,dir:r.axis==='z'?[0,1]:[1,0],narrow:r.span[1]-r.span[0]<.45}));
  const SHELVES=W.stacks;
  const INTERIORS=W.glass.map(g=>g.box);

  let seed=20261015;
  const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const up=V(0,1,0);

  // --- Clothes library (scripts/garments_blender.py -> assets/rooms/vestidor/ropa.glb) --
  // Each piece is a node: shirt_a/b, knit_a/b, jacket_a/b, coat_a/b (hanging from the rail
  // centre), hanger, hook, fold_shirt/knit/tee (0,30 x 0,30 folded piece, fold edge to
  // +z) and loafer, sneaker, boot, pump (heel on the floor at the origin, toe to +z).
  // Their meshes: <node>_cloth (baked normal map, ambient occlusion in COLOR_0), _button,
  // _lining, _sole, _insole, _laces, hanger_wood, hook_metal.
  const [gltf,linen,wool]=await Promise.all([
    ctx.loadModel(ROPA_URL),
    Promise.all(['detail_1k.webp','nor_gl_1k.webp'].map(f=>ctx.loadTexture('./assets/polyhaven/rough_linen/rough_linen_'+f,{srgb:false}))),
    Promise.all(['detail_1k.webp','nor_gl_1k.webp'].map(f=>ctx.loadTexture('./assets/polyhaven/poly_wool_herringbone/poly_wool_herringbone_'+f,{srgb:false}))),
  ]);
  const lib={};
  gltf.scene.traverse(o=>{
    if(!o.isMesh)return;
    const root=o.parent,part=o.name.startsWith(root.name+'_')?o.name.slice(root.name.length+1):o.name;
    (lib[root.name]??={})[part]=o;
  });
  // Ambient occlusion: softened (the probes already darken the wardrobe), as rgb.
  for(const piece of Object.values(lib))for(const m of Object.values(piece)){
    const c=m.geometry.getAttribute('color');if(!c)continue;
    const a=new Float32Array(c.count*3);
    for(let i=0;i<c.count;i++){const v=1-.68*(1-Math.min(1,c.getX(i)));a[i*3]=a[i*3+1]=a[i*3+2]=v;}
    m.geometry.setAttribute('color',new THREE.BufferAttribute(a,3));
  }
  // Right shoes: the left ones mirrored in their own geometry (a negative instance scale
  // would flip the winding, and double-sided shading would light them from inside).
  for(const n of ['loafer','sneaker','boot','pump']){
    const R={};
    for(const [part,m] of Object.entries(lib[n])){
      const g=m.geometry.clone();g.scale(-1,1,1);
      const a=g.index.array;for(let i=0;i<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t;}
      const c=m.clone();c.geometry=g;c.name=m.name+'_R';R[part]=c;
    }
    lib[n+'_R']=R;
  }
  const bbox=n=>{const b=new THREE.Box3();for(const m of Object.values(lib[n]))b.union(m.geometry.boundingBox||(m.geometry.computeBoundingBox(),m.geometry.boundingBox));return b;};

  // Materials. Cloth is white and takes each instance's colour; the baked normal map
  // carries the drape, seams and stitching, a tiled fabric normal (object space, picked
  // per face orientation) the weave, and the knit ribs are procedural. The wardrobe light
  // is shaded per pixel from ropaShade (per instance: outward x, z; strip height, 0 =
  // none; flags 1 first, 2 last on the rail) like the old vertex colours: the LED strip at
  // the front lights shoulders turned to it, hems and backs stay darker, and the next
  // garment on the rail shades the faces turned to it.
  const ROPA_SHADE=`
    {vec3 rpN=normalize(inverseTransformDirection(normal,viewMatrix));
    vec3 rpOut=vec3(ropaInst.x,0.0,ropaInst.y);float rpS=1.0;
    float rpF=dot(rpN,ropaFront),rpFl=ropaInst.w;
    if(rpF>0.0&&mod(rpFl,4.0)<2.0)rpS*=1.0-.55*rpF;
    if(rpF<0.0&&mod(rpFl,2.0)<1.0)rpS*=1.0+.50*rpF;
    if(ropaInst.z>0.0){
      float rpD=dot(ropaWorld-ropaOrigin,rpOut)/.22;rpS*=.80+.20*clamp(rpD*.5+.5,0.0,1.0);
      float rpL=exp(-max(0.0,ropaInst.z-ropaWorld.y)/.42);
      float rpA=clamp(.5+.5*dot(rpN,normalize(rpOut*.6+vec3(0.0,.8,0.0))),0.0,1.0);
      rpS*=.62+.62*rpL*(.45+.55*rpA);
    }
    diffuseColor.rgb*=rpS;}`;
  const ropaMaterial=(params,{key,detail=null,tile=.01,detailN=.5,detailA=.06,ribs=0})=>{
    const m=new THREE.MeshPhysicalMaterial({color:'#ffffff',side:THREE.DoubleSide,...params});
    m.onBeforeCompile=sh=>{
      sh.uniforms.ropaDetail={value:detail?.[0]??null};sh.uniforms.ropaDetailN={value:detail?.[1]??null};
      sh.vertexShader='attribute vec4 ropaShade;\nvarying vec3 ropaObj,ropaObjN,ropaWorld,ropaFront,ropaOrigin;\nvarying vec4 ropaInst;\n'+sh.vertexShader
        .replace('#include <begin_vertex>','#include <begin_vertex>\nropaObj=transformed;ropaObjN=objectNormal;')
        .replace('#include <project_vertex>',`#include <project_vertex>
          {vec4 rw=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
          rw=instanceMatrix*rw;ropaFront=normalize(mat3(modelMatrix)*instanceMatrix[2].xyz);ropaOrigin=(modelMatrix*instanceMatrix[3]).xyz;
          #else
          ropaFront=vec3(0.0,0.0,1.0);ropaOrigin=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
          #endif
          ropaWorld=(modelMatrix*rw).xyz;ropaInst=ropaShade;}`);
      let fs='uniform sampler2D ropaDetail,ropaDetailN;\nvarying vec3 ropaObj,ropaObjN,ropaWorld,ropaFront,ropaOrigin;\nvarying vec4 ropaInst;\n'+
        `vec2 ropaUV(){vec3 n=abs(ropaObjN);return (n.x>n.z&&n.x>n.y?ropaObj.zy:(n.y>n.z?ropaObj.xz:ropaObj.xy))/${tile.toFixed(4)};}\n`+sh.fragmentShader;
      if(detail)fs=fs.replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.rgb*=1.0+${detailA.toFixed(3)}*(texture2D(ropaDetail,ropaUV()).r*2.0-1.0);`);
      let nm='';
      if(detail&&params.normalMap)nm+=`{vec2 duv=ropaUV();vec3 dn=texture2D(ropaDetailN,duv).xyz*2.0-1.0;dn.xy*=${detailN.toFixed(3)};
        mat3 dt=getTangentFrame(-vViewPosition,normal,duv);normal=normalize(dt*dn);}`;
      if(ribs&&params.normalMap)nm+=`{float rp=ropaObj.x*6.2832/${ribs.toFixed(4)};float rf=1.0-smoothstep(.6,1.6,fwidth(rp));
        mat3 rt=getTangentFrame(-vViewPosition,normal,ropaObj.xy);normal=normalize(normal+rt[0]*cos(rp)*.32*rf);}`;
      sh.fragmentShader=fs.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+nm+ROPA_SHADE);
    };
    m.customProgramCacheKey=()=>'vestidor-ropa-'+key;
    return m;
  };
  const clothParams=(piece,o)=>({normalMap:piece.cloth.material.normalMap||null,vertexColors:true,specularIntensity:.3,sheenRoughness:.7,sheenColor:new THREE.Color('#ffffff'),...o});
  const MATS={
    shirt:n=>ropaMaterial(clothParams(lib[n],{roughness:.78,sheen:.45}),{key:'shirt',detail:linen,tile:.11,detailN:.35,detailA:.05}),
    knit:n=>ropaMaterial(clothParams(lib[n],{roughness:.95,sheen:.7}),{key:'knit',ribs:.0042}),
    jacket:n=>ropaMaterial(clothParams(lib[n],{roughness:.88,sheen:.5}),{key:'jacket',detail:wool,tile:.16,detailN:.8,detailA:.10}),
    coat:n=>ropaMaterial(clothParams(lib[n],{roughness:.9,sheen:.55}),{key:'coat',detail:wool,tile:.22,detailN:.9,detailA:.12}),
    fold_shirt:n=>ropaMaterial(clothParams(lib[n],{roughness:.8,sheen:.45}),{key:'fold-shirt',detail:linen,tile:.11,detailN:.35,detailA:.05}),
    fold_tee:n=>ropaMaterial(clothParams(lib[n],{roughness:.9,sheen:.5}),{key:'fold-tee',detail:linen,tile:.07,detailN:.25,detailA:.04}),
    fold_knit:n=>ropaMaterial(clothParams(lib[n],{roughness:.95,sheen:.7}),{key:'fold-knit',ribs:.0045}),
  };
  const fixed={
    button:ropaMaterial({color:'#ffffff',roughness:.35,vertexColors:false},{key:'button'}),
    lining:ropaMaterial({color:'#2a211b',roughness:.6,sheen:.4},{key:'lining'}),
    wood:ropaMaterial({color:'#b98d5c',roughness:.42},{key:'wood'}),
    metal:ropaMaterial({color:'#d2b07a',metalness:1,roughness:.22},{key:'metal'}),
    sole_leather:ropaMaterial({color:'#3b2516',roughness:.55},{key:'sole-leather'}),
    sole_white:ropaMaterial({color:'#e9e5dc',roughness:.7},{key:'sole-white'}),
    sole_black:ropaMaterial({color:'#141111',roughness:.4},{key:'sole-black'}),
  };
  const shoeMat={
    loafer:ropaMaterial({vertexColors:true,roughness:.42,clearcoat:.35,clearcoatRoughness:.35,specularIntensity:.6},{key:'shoe-leather'}),
    pump:ropaMaterial({vertexColors:true,roughness:.32,clearcoat:.5,clearcoatRoughness:.2,specularIntensity:.7},{key:'shoe-patent'}),
    boot:ropaMaterial({vertexColors:true,roughness:.9,sheen:.6,sheenRoughness:.6,sheenColor:new THREE.Color('#ffffff')},{key:'shoe-suede'}),
    sneaker:ropaMaterial({vertexColors:true,roughness:.7,specularIntensity:.4},{key:'shoe-canvas'}),
  };
  const buttonColor={shirt:'#ece6da',jacket:'#2b211a',coat:'#241b15'};

  // Instances, grouped per mesh and per area (the vestidor's glazed wardrobes, the rest)
  // so whole groups are culled outside the view.
  const inZone=p=>ZONE.some(([a,b])=>p.x>=a[0]&&p.x<=b[0]&&p.z>=a[2]&&p.z<=b[2]);
  const batches=new Map();
  const put=(mesh,material,matrix,{color=null,shade=[0,0,0,3],area='x'}={})=>{
    const k=mesh.uuid+'|'+material.uuid+'|'+area;
    let b=batches.get(k);if(!b)batches.set(k,b={mesh,material,items:[]});
    b.items.push({matrix:matrix.clone(),color,shade});
  };
  const putPiece=(name,matrix,{color,shade,area,clothMat,buttons})=>{
    const piece=lib[name];
    for(const [part,mesh] of Object.entries(piece)){
      if(part==='cloth')put(mesh,clothMat,matrix,{color,shade,area});
      else if(part==='button')put(mesh,buttons||fixed.button,matrix,{shade,area,color:buttons?null:null});
      else if(fixed[part])put(mesh,fixed[part],matrix,{shade,area});
      else if(part==='wood'||part==='metal')put(mesh,fixed[part],matrix,{shade,area});
      else if(fixed[mesh.material?.name])put(mesh,fixed[mesh.material.name],matrix,{shade,area});
      else put(mesh,fixed.lining,matrix,{shade,area});
    }
  };
  const clothMats={};const matFor=n=>clothMats[n]??=(MATS[n]||MATS[n.split('_')[0]])(n);
  const buttonMats={};const buttonMat=kind=>buttonMats[kind]??=ropaMaterial({color:buttonColor[kind]||'#ece6da',roughness:.35},{key:'button-'+kind});

  // --- Hang them -------------------------------------------------------------------
  const TYPES=['shirt','knit','jacket','coat'];
  const drop={};for(const t of TYPES)for(const v of ['a','b'])drop[t+'_'+v]=-bbox(t+'_'+v).min.y;
  let setIndex=0,count=0;
  for(const bay of BAYS){
    const set=SETS[setIndex++%SETS.length].slice(0,bay.n);
    const len=bay.span[1]-bay.span[0],mid=(bay.span[0]+bay.span[1])/2;
    const dir=V(bay.dir[0],0,bay.dir[1]),out=V(bay.out[0],0,bay.out[1]);
    const spacing=Math.min(.098,(len-.20-(bay.narrow?.12:0))/Math.max(1,bay.n-1));
    // Garments stop short of what is below the rail (tray, drawers, worktop).
    const room=bay.y-(bay.bottom??.10)-.015;
    set.forEach(([type,color],k)=>{
      // The variant that fits (a long one a little shorter, at most 7 %); else a knit; else none.
      const pick=t=>{const vs=[`${t}_${(k+setIndex)%2?'b':'a'}`,`${t}_${(k+setIndex)%2?'a':'b'}`];
        for(const v of vs)if(drop[v]<=room)return [v,1];
        for(const v of vs)if(drop[v]*.93<=room)return [v,room/drop[v]];return null;};
      const chosen=pick(type)||pick('knit');if(!chosen)return;
      const [name,sy]=chosen,kind=name.split('_')[0];
      const along=bay.n===1?bay.span[1]-.17:mid+(k-(bay.n-1)/2)*spacing*(bay.dir[0]+bay.dir[1])+(rnd()-.5)*.012;
      const c=bay.axis==='z'?V(bay.at,bay.y,along):V(along,bay.y,bay.at);
      const turn=THREE.MathUtils.degToRad(bay.turn+(rnd()-.5)*8);
      const front=dir.clone().multiplyScalar(Math.cos(turn)).addScaledVector(out,Math.sin(turn)).normalize();
      const X=new THREE.Vector3().crossVectors(up,front).normalize();
      const tilt=new THREE.Matrix4().makeRotationAxis(X,(rnd()-.5)*.03);
      const basis=new THREE.Matrix4().makeBasis(X,up,front).premultiply(tilt).setPosition(c);
      const scaled=basis.clone().multiply(new THREE.Matrix4().makeScale(1,sy,1));
      const area=inZone(c)?'v':'x',flags=(k===0?1:0)+(k===set.length-1?2:0);
      const shade=[out.x,out.z,STRIP_Y+(bay.y-1.77),flags];
      putPiece(name,scaled,{color:new THREE.Color(COLORS[color]),shade,area,clothMat:matFor(name),buttons:buttonMat(kind)});
      put(lib.hanger.wood,fixed.wood,basis,{shade,area});
      const hb=new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up,out),up,out).setPosition(c);
      put(lib.hook.metal,fixed.metal,hb,{shade,area});
      count++;
    });
  }

  // --- Folded stacks on the upper shelves ------------------------------------------
  const shadowQuads={shelf:[],floor:[]};
  const quad=(list,centre,a,b)=>list.push([centre,a,b]);   // a, b: half extents (vectors)
  const FOLDS={white:'fold_shirt',ivory:'fold_shirt',ecru:'fold_tee',greige:'fold_knit',sand:'fold_knit'};
  const foldH={};for(const n of ['fold_shirt','fold_knit','fold_tee'])foldH[n]=bbox(n).max.y;
  let ci=0;
  for(const s of SHELVES){
    const out=V(s.out[0],0,s.out[1]);
    const aw=s.along[1]-s.along[0],dw=Math.abs(s.depth[1]-s.depth[0]);
    const nStacks=aw>.38?2:1,gap=.03,sw=(aw-.02-gap*(nStacks-1))/nStacks;
    const dc=(s.depth[0]+s.depth[1])/2,sd=Math.min(.30,dw-.01);
    for(let k=0;k<nStacks;k++){
      const ac=s.along[0]+.01+sw/2+k*(sw+gap)+(rnd()-.5)*.01;
      const centre=s.axis==='z'?V(dc,s.y,ac):V(ac,s.y,dc);
      centre.addScaledVector(out,(dw-sd)/2-.004);
      const Z=out.clone(),X=new THREE.Vector3().crossVectors(up,Z);
      let y=s.y;const items=3+(rnd()<.5?1:0);
      for(let it=0;it<items;it++){
        const color=STACK_COLORS[ci++%STACK_COLORS.length],name=FOLDS[color]||'fold_tee';
        const h=(name==='fold_knit'?.038:.030)+rnd()*.008,w=sw*(.94+rnd()*.05),d=sd*(.93+rnd()*.06);
        const yaw=(rnd()-.5)*.05,off=(rnd()-.5)*.012;
        const m=new THREE.Matrix4().makeBasis(X,up,Z).multiply(new THREE.Matrix4().makeRotationY(yaw));
        m.setPosition(centre.clone().addScaledVector(X,off).addScaledVector(Z,(rnd()-.5)*.01).setY(y));
        m.multiply(new THREE.Matrix4().makeScale(w/.30,h/foldH[name],d/.30));
        put(lib[name].cloth,matFor(name),m,{color:new THREE.Color(COLORS[color]),shade:[out.x,out.z,TOP_STRIP_Y,3],area:inZone(centre)?'v':'x'});
        y+=h;
      }
      quad(shadowQuads.shelf,centre.clone().setY(s.y+.0012),X.clone().multiplyScalar(sw/2+.03),Z.clone().multiplyScalar(sd/2+.03));
    }
  }
  for(const b of BASES){
    const out=V(b.out[0],0,b.out[1]),mid=(b.span[0]+b.span[1])/2,half=(b.span[1]-b.span[0])/2+.05;
    const centre=b.axis==='z'?V(b.at,.0015,mid):V(mid,.0015,b.at);
    const along=b.axis==='z'?V(0,0,1):V(1,0,0);
    quad(shadowQuads.floor,centre,along.multiplyScalar(half),out.multiplyScalar(.13));
  }

  // --- Shoes -----------------------------------------------------------------------
  // scripts/proyecto.py shoes() exports each shoe as a 4 cm wide beveled block (in the
  // bake). They are found here by their size (0,03-0,07 x 0,22-0,28 x 0,06-0,12 m, in the
  // dark, clay, fabric and stone meshes), removed (by index: the lightmap UVs stay
  // aligned) and replaced, row by row, by real pairs toes out, 5 cm behind the front.
  const shoeRows=findShoeRows(ctx,THREE);
  let removedShoes=0,pairs=0;
  if(shoeRows.boxes.length)removedShoes=ctx.removeExported({material:['dark','clay','fabric','stone'],box:shoeRows.boxes});
  const SHOE_TYPES=['loafer','sneaker','boot','pump','loafer','sneaker'];
  const SHOE_COLORS={loafer:['#3a2416','#17110d','#7a4a2a'],sneaker:['#ece8e0','#d8d2c6','#efece6'],boot:['#4a3426','#1f1812','#7d5f45'],pump:['#161212','#c79f86','#6e1e22']};
  const len={};for(const n of SHOE_TYPES)len[n]=bbox(n).max.z;
  for(const row of shoeRows.rows){
    const n=Math.max(1,Math.floor((row.length+.02)/.215)),pitch=row.length/n;
    for(let i=0;i<n;i++){
      const type=SHOE_TYPES[(pairs+i)%SHOE_TYPES.length],col=SHOE_COLORS[type][Math.floor((pairs+i)/SHOE_TYPES.length)%3];
      const centre=row.start.clone().addScaledVector(row.along,(i+.5)*pitch);
      for(const side of [-1,1]){
        const toeOut=THREE.MathUtils.degToRad(side*(3+rnd()*3));
        const fwd=row.out.clone().applyAxisAngle(up,toeOut);
        const toe=centre.clone().addScaledVector(row.along,side*.052+(rnd()-.5)*.006).addScaledVector(row.out,(rnd()-.5)*.012);
        const heel=toe.addScaledVector(fwd,-len[type]);
        const X=new THREE.Vector3().crossVectors(up,fwd).normalize();
        const m=new THREE.Matrix4().makeBasis(X,up,fwd).setPosition(heel.setY(row.y));
        const area=inZone(centre)?'v':'x';
        for(const [part,mesh] of Object.entries(lib[side>0?type+'_R':type])){
          if(part==='cloth')put(mesh,shoeMat[type],m,{color:new THREE.Color(col),area});
          else put(mesh,fixed[mesh.material?.name]||fixed.lining,m,{area});
        }
      }
    }
    pairs+=n;
  }

  // --- Build the instanced meshes ----------------------------------------------------
  const add=(name,geo,mat,lit=true)=>{
    const o=new THREE.Mesh(geo,mat);o.name=name;o.castShadow=false;o.receiveShadow=lit;
    group.add(o);if(lit)ctx.lightRuntimeObject(o);return o;
  };
  let tris=0;
  for(const {mesh,material,items} of batches.values()){
    const geo=mesh.geometry.clone();
    const shade=new Float32Array(items.length*4);items.forEach((it,i)=>shade.set(it.shade,i*4));
    geo.setAttribute('ropaShade',new THREE.InstancedBufferAttribute(shade,4));
    const im=new THREE.InstancedMesh(geo,material,items.length);
    im.name='Vestidor '+mesh.name;im.castShadow=false;im.receiveShadow=true;
    items.forEach((it,i)=>{im.setMatrixAt(i,it.matrix);if(it.color)im.setColorAt(i,it.color);});
    if(items.some(it=>it.color)&&!im.instanceColor)im.setColorAt(0,new THREE.Color(1,1,1));
    im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
    im.computeBoundingSphere();
    group.add(im);ctx.lightRuntimeObject(im);
    tris+=(geo.index?geo.index.count:geo.getAttribute('position').count)/3*items.length;
  }
  console.info(`[rooms/vestidor] ${count} garments, ${pairs} pairs of shoes (${removedShoes} exported shoe triangles out), ${batches.size} instanced meshes, ${Math.round(tris/1000)}k triangles`);

  // --- Contact shadows (multiplied over what is already drawn) ----------------------
  const falloff=(strength,plateau)=>{
    const N=64,data=new Uint8Array(N*N*4);
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const ex=Math.min(i+.5,N-i-.5)/(N/2),ey=Math.min(j+.5,N-j-.5)/(N/2);
      const v=1-strength*smooth(0,plateau,ex)*smooth(0,plateau,ey);
      data.set([v*255,v*255,v*255,255],(j*N+i)*4);
    }
    const t=new THREE.DataTexture(data,N,N);t.magFilter=t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
  };
  const multiply=map=>new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.ZeroFactor,blendDst:THREE.SrcColorFactor,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const quadsGeo=list=>{
    const pos=[],uv=[],idx=[];
    list.forEach(([c,a,b],k)=>{
      for(const [s,t] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=c.clone().addScaledVector(a,s).addScaledVector(b,t);pos.push(p.x,p.y,p.z);uv.push((s+1)/2,(t+1)/2);}
      idx.push(k*4,k*4+1,k*4+2,k*4,k*4+2,k*4+3);
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeBoundingSphere();return g;
  };
  // No slope factor: seen edge-on it pushed the stack shade in front of the closed doors.
  const shelfShadow=multiply(falloff(.55,.55));shelfShadow.side=THREE.DoubleSide;shelfShadow.polygonOffsetFactor=0;
  add('Vestidor sombra baldas',quadsGeo(shadowQuads.shelf),shelfShadow,false);
  const floorShadow=multiply(falloff(.55,.9));floorShadow.side=THREE.DoubleSide;
  add('Vestidor sombra zocalo',quadsGeo(shadowQuads.floor),floorShadow,false);

  // --- Wardrobe interiors: the strips light them from above -------------------------
  for(const piece of INTERIORS.length?ctx.splitExported({material:'wood',region:'shared',box:INTERIORS}):[]){
    const m=piece.material,prior=m.onBeforeCompile,key=m.customProgramCacheKey.call(m);
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        {vec3 vp=houseWorld,vn=normalize(houseNormal);
        float upper=step(${(SHELF_Y-.01).toFixed(3)},vp.y),hang=smoothstep(${(HANG_Y-.02).toFixed(3)},${HANG_Y.toFixed(3)},vp.y)*(1.0-upper),inside=max(hang,upper);
        float L=upper>.5?exp(-max(0.0,${TOP_STRIP_Y.toFixed(3)}-vp.y)/.20):exp(-max(0.0,${STRIP_Y.toFixed(3)}-vp.y)/.40);
        float f=mix(.94,mix(.70,1.55,L),inside);
        f*=vn.y<-.5?.70:1.0;
        float vert=1.0-abs(vn.y);
        f*=1.0-vert*(.34*exp(-max(0.0,vp.y-${HANG_Y.toFixed(3)})/.035)*hang+.28*exp(-max(0.0,vp.y-${SHELF_Y.toFixed(3)})/.03)*upper);
        // The hanging clothes shade the back panel below their shoulders.
        vec3 vo=vp.x<1.0?vec3(1.0,0.0,0.0):(vp.x>4.0?vec3(-1.0,0.0,0.0):vec3(0.0,0.0,1.0));
        float backP=step(.8,dot(vn,vo))*hang*step(vp.y,1.80);
        f*=1.0-backP*.45*smoothstep(.80,.98,vp.y)*(1.0-smoothstep(1.58,1.71,vp.y));
        // ... and the top of the drawer unit below their hems.
        f*=1.0-.28*step(.5,vn.y)*hang*(1.0-smoothstep(${(HANG_Y+.03).toFixed(3)},${(HANG_Y+.13).toFixed(3)},vp.y));
        outgoingLight*=f*mix(vec3(1.0),vec3(1.06,.95,.80),L*inside);}
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey=()=>key+'|vestidor-interior7';
  }

  // --- Glass doors: bronze tint and the room reflected in them ----------------------
  // The room probe (128 px) only gives a soft wash, so the sharp part of the reflection
  // is traced here: the reflected ray is intersected with the three glazed fronts, which
  // show their warm interiors, the bright LED lines under the shelves and the door
  // frames. Physical Fresnel per face (4 % head on, more at grazing), so the far
  // wardrobe and its strips appear in the central one seen at an angle, and what is
  // behind each pane stays sharp, only tinted.
  const tint=new THREE.MeshBasicMaterial({color:new THREE.Color(.93,.875,.79),transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.ZeroFactor,blendDst:THREE.SrcColorFactor});
  const f3=v=>v.toFixed(3);
  const glassFns=`varying vec3 vestGlassW;varying vec3 vestGlassN;
    // A glazed front seen in reflection: along = coordinate along the front.
    float vestFront(float y,float along,float a0,float a1,float dw){
      if(along<a0||along>a1||y<.103||y>2.194)return 0.0;
      float L=y>${f3(SHELF_Y)}?exp(-max(0.0,${f3(TOP_STRIP_Y)}-y)/.20):(y>${f3(HANG_Y)}?exp(-max(0.0,${f3(STRIP_Y)}-y)/.40):0.0);
      float g=.16+1.5*L;
      // Hanging clothes: darker, uneven vertical stripes.
      float cl=smoothstep(${f3(HANG_Y+.02)},${f3(HANG_Y+.08)},y)*(1.0-smoothstep(1.76,1.82,y));
      g*=1.0-cl*(.35+.25*sin(along*61.0)*sin(along*23.0+1.3));
      // Vertical LED strips up both sides of each two-leaf module.
      float um=mod(along-a0,2.0*dw);
      float led=(smoothstep(.02,.006,abs(um-.025))+smoothstep(.02,.006,abs(2.0*dw-um-.025)))*step(.15,y)*step(y,2.15);
      // Door frames (dark bronze) at every door edge, top and bottom.
      float u=mod(along-a0,dw),fr=min(min(u,dw-u),min(y-.103,2.194-y));
      float frame=smoothstep(.014,.024,fr);
      return (g*frame+.22*(1.0-frame))+9.0*led*frame;
    }
    vec3 vestReflect(vec3 P,vec3 R){
      float best=1e3,val=0.0,t;vec3 H;
      t=(${f3(.723)}-P.x)/R.x;if(R.x<-.01&&t>.05&&t<best){H=P+R*t;float v=vestFront(H.y,H.z,-5.433,-1.993,.43);if(v>0.0){best=t;val=v;}}
      t=(${f3(-5.060)}-P.z)/R.z;if(R.z<-.01&&t>.05&&t<best){H=P+R*t;float v=vestFront(H.y,H.x,1.623,3.584,.4902);if(v>0.0){best=t;val=v;}}
      t=(${f3(4.334)}-P.x)/R.x;if(R.x>.01&&t>.05&&t<best){H=P+R*t;float v=vestFront(H.y,H.z,-2.730,-1.990,.37);if(v>0.0){best=t;val=v;}}
      // Nothing glazed in that direction: the room's plaster, lit like the glass itself.
      return best<1e3?vec3(1.0,.80,.58)*val:vec3(.50,.46,.41);
    }
`;
  for(const piece of ctx.splitExported({material:'glass',region:'shared',box:ZONE})){
    const m=piece.material,prior=m.onBeforeCompile,key=m.customProgramCacheKey.call(m);
    m.opacity=.04;m.color.set('#5c4733');
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.vertexShader='varying vec3 vestGlassW;varying vec3 vestGlassN;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvestGlassW=(modelMatrix*vec4(transformed,1.0)).xyz;vestGlassN=normalize(mat3(modelMatrix)*objectNormal);');
      const before=shader.fragmentShader;
      shader.fragmentShader=glassFns+shader.fragmentShader.replace('totalSpecular*.6',
        `totalSpecular*.40+vestRefl`).replace('{float glassNV=',`
        vec3 vestV=normalize(vestGlassW-cameraPosition),vestN=normalize(vestGlassN);
        if(dot(vestN,vestV)>0.0)vestN=-vestN;
        float vestF=.04+.96*pow(1.0-saturate(-dot(vestN,vestV)),5.0);
        // Radiance unit: a lit surface at this spot (the baked irradiance).
        float vestE=max(dot(iblIrradiance,vec3(.2126,.7152,.0722))*RECIPROCAL_PI,.02);
        vec3 vestRefl=vestReflect(vestGlassW,reflect(vestV,vestN))*vestF*vestE;
        {float glassNV=`);
      if(before.indexOf('totalSpecular*.6')<0||before.indexOf('{float glassNV=')<0)console.warn('[rooms/vestidor] glass shader hook not found');
    };
    m.customProgramCacheKey=()=>key+'|vestidor-glass7';
    const t=new THREE.Mesh(piece.geometry,tint);t.name='Vestidor vidrio bronce';t.castShadow=false;group.add(t);
  }

  // --- Door frames, rails and handles: satin champagne bronze -----------------------
  // The render's frames catch the light along their edges; the dark brown flat finish
  // read as painted wood. A satin metal takes the room probe's reflections.
  for(const piece of ctx.splitExported({material:'bronze',region:'shared',box:ZONE})){
    const m=piece.material;m.color.set('#a3815a');m.metalness=.75;m.roughness=.28;m.needsUpdate=true;
  }
}

// Rows of the exported shoe blocks (proyecto.py shoes()): connected pieces of the dark,
// clay, fabric and stone meshes with a shoe block's size, grouped per shelf line and split
// where a module side breaks the row. A row's outward side is the nearest wardrobe front
// parallel to it (fronts in house.json), else the nearest rail's; rows with neither stay.
function findShoeRows(ctx,THREE){
  const comps=[];
  for(const mesh of ctx.staticMeshes){
    const ex=mesh.userData.exported;if(!ex||!['dark','clay','fabric','stone'].includes(ex.material))continue;
    const g=mesh.geometry,pos=g.getAttribute('position'),index=g.index;if(!pos)continue;
    const n=index?index.count:pos.count,ids=new Map(),parent=[],tri=new Int32Array(n);
    const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(let i=0;i<n;i++){
      const v=index?index.getX(i):i;
      const k=Math.round(pos.getX(v)*2000)*1e10+Math.round(pos.getY(v)*2000)*1e5+Math.round(pos.getZ(v)*2000);
      let id=ids.get(k);if(id===undefined){id=parent.length;parent.push(id);ids.set(k,id);}tri[i]=id;
    }
    for(let i=0;i<n;i+=3){const a=find(tri[i]);for(const j of [1,2]){const b=find(tri[i+j]);if(b!==a)parent[b]=a;}}
    const boxes=new Map();
    for(let i=0;i<n;i++){
      const r=find(tri[i]),v=index?index.getX(i):i,x=pos.getX(v),y=pos.getY(v),z=pos.getZ(v);
      let b=boxes.get(r);if(!b)boxes.set(r,b=[x,y,z,x,y,z]);
      if(x<b[0])b[0]=x;if(y<b[1])b[1]=y;if(z<b[2])b[2]=z;if(x>b[3])b[3]=x;if(y>b[4])b[4]=y;if(z>b[5])b[5]=z;
    }
    for(const b of boxes.values()){
      const sx=b[3]-b[0],sy=b[4]-b[1],sz=b[5]-b[2],a=Math.min(sx,sz),c=Math.max(sx,sz);
      if(a>.03&&a<.07&&c>.22&&c<.28&&sy>.06&&sy<.12)comps.push({b,longX:sx>sz});
    }
  }
  const groups=new Map();
  for(const c of comps){
    const lc=c.longX?(c.b[0]+c.b[3])/2:(c.b[2]+c.b[5])/2;
    const k=`${c.longX}|${Math.round(c.b[1]*100)}|${Math.round(lc*20)}`;
    (groups.get(k)||groups.set(k,[]).get(k)).push(c);
  }
  const fronts=ctx.data.fronts||[],rails=ctx.data.wardrobes?.rails||[];
  const rows=[],boxes=[];
  for(const list of groups.values()){
    const lx=list[0].longX,s0=lx?2:0,s1=lx?5:3,l0=lx?0:2,l1=lx?3:5;
    list.sort((p,q)=>p.b[s0]-q.b[s0]);
    const runs=[[list[0]]];
    for(let i=1;i<list.length;i++){if(list[i].b[s0]-list[i-1].b[s1]>.05)runs.push([]);runs[runs.length-1].push(list[i]);}
    for(const run of runs){
      const smin=Math.min(...run.map(c=>c.b[s0])),smax=Math.max(...run.map(c=>c.b[s1]));
      const lmin=Math.min(...run.map(c=>c.b[l0])),lmax=Math.max(...run.map(c=>c.b[l1])),y=Math.min(...run.map(c=>c.b[1]));
      const lc=(lmin+lmax)/2,sc=(smin+smax)/2;
      // Fronts parallel to the row (their out along the row's long axis), covering it.
      let best=null,bd=1.2;
      for(const f of fronts){
        const o=lx?f.out?.[0]:f.out?.[1];if(!f.edge||!f.pivot||!(Math.abs(o)>=.5))continue;
        const plane=lx?f.pivot[0]:f.pivot[1],s=lx?[f.pivot[1],f.edge[1]]:[f.pivot[0],f.edge[0]];
        if(sc<Math.min(...s)-.3||sc>Math.max(...s)+.3||f.y[0]>y+.05||f.y[1]<y)continue;
        const d=Math.abs(plane-lc);if(d<bd){bd=d;best=Math.sign(o);}
      }
      if(best===null)for(const r of rails){
        const o=lx?r.out[0]:r.out[1];if(!o)continue;
        const d=Math.hypot((lx?r.at:(r.span[0]+r.span[1])/2)-(lx?lc:sc),(lx?(r.span[0]+r.span[1])/2:r.at)-(lx?sc:lc));
        if(d<bd+.6){bd=d-.6;best=Math.sign(o);}
      }
      if(best===null)continue;
      const toe=best>0?lmax:lmin;
      rows.push({start:lx?new THREE.Vector3(toe,y,smin):new THREE.Vector3(smin,y,toe),along:lx?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0),
        out:lx?new THREE.Vector3(best,0,0):new THREE.Vector3(0,0,best),length:smax-smin,y});
      for(const c of run)boxes.push([[c.b[0]-.002,c.b[1]-.002,c.b[2]-.002],[c.b[3]+.002,c.b[4]+.002,c.b[5]+.002]]);
    }
  }
  return {rows,boxes};
}
