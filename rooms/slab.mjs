// Shared by the room modules (not a room itself): stone and porcelain laid out slab by
// slab, as a fabricator cuts them. Used by cocina.mjs (Taj Mahal quartzite of the
// kitchen) and by cocina.mjs, bano.mjs and instalaciones.mjs (Laminam «Taj Mahal» of the
// lavadero and the three vanity tops). Maps: scripts/cocina_textures.py.

const hash=r=>{const x=Math.sin(r*12.9898+78.233)*43758.5453;return x-Math.floor(x);};

// Taj Mahal quartzite (kitchen): 2 cm, polished. The photo is taken as one whole 320 x 240
// cm slab (veins 1-5 cm wide, as on a real slab): the 2.96 m island top fits in one piece,
// with no bookmatch line across it (a 2 m slab put one there).
export const QUARTZITE={slab:[3.2,2.4],roughness:.14};
// Laminam «Taj Mahal», DNA finish: matte and slightly textured; one photo = one 324 x 162
// cm slab (length, width).
export const LAMINAM={slab:[3.24,1.62],roughness:.66,relief:.32};
// Kitchen ground colour (the luminance the old crosscut base had): the map carries the
// stone's own warm cream. Laminam: white, its map at the vanity tops' former luminance.
export const STONE_WHITE=.88;

// One random number per connected piece (front, slab, cheek) of a non-indexed geometry,
// as a vertex attribute: per-piece texture cuts and tones.
export function pieceSeeds(THREE,geo){
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
export const seedVertex=shader=>{
  shader.vertexShader='attribute float pieceSeed;\nvarying float vPieceSeed;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPieceSeed=pieceSeed;');
  shader.fragmentShader='varying float vPieceSeed;\n'+shader.fragmentShader;
};

// Where each piece sits in the slab, per vertex: origin, a 2x2 map from the piece's own
// plane (metres from the origin, horizontal first) to slab UV, and offset + bookmatch
// flag. Lying (slab length horizontal) or standing, whichever fits, at a random place
// inside the slab. Wider than both: two mirrored halves, meeting at one of the lining's
// joints if both sides fit (a bookmatch needs a joint), else at the centre; a piece taller
// than the slab keeps the slab's top edge at the ceiling (the joint goes low, behind the
// island). Planes: x-facing (z,y), y-facing (x,z), z-facing (x,y).
export function slabLayout(THREE,geo,root,joints,[L,W],ceiling=2.2){
  const pos=geo.getAttribute('position'),n=pos.count,box=new Map();
  for(let i=0;i<n;i++){
    let b=box.get(root[i]);if(!b)box.set(root[i],b={lo:[1e9,1e9,1e9],hi:[-1e9,-1e9,-1e9]});
    for(let a=0;a<3;a++){const v=pos.getComponent(i,a);b.lo[a]=Math.min(b.lo[a],v);b.hi[a]=Math.max(b.hi[a],v);}
  }
  const lay=new Map();
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
    const pv=ut>1&&v===1?1-(Math.min(b.hi[v],ceiling)-c[v])/(stand?L:W):.5+(r2-.5)*Math.max(0,1-ut);
    lay.set(r,{c,A:stand?[0,1/W,1/L,0]:[1/L,0,0,1/W],B:stand?[pv,ph,+(mirror!==null)]:[ph,pv,+(mirror!==null)]});
  }
  const c=new Float32Array(n*3),A=new Float32Array(n*4),B=new Float32Array(n*3);
  for(let i=0;i<n;i++){const l=lay.get(root[i]);c.set(l.c,i*3);A.set(l.A,i*4);B.set(l.B,i*3);}
  geo.setAttribute('slabCentre',new THREE.BufferAttribute(c,3));
  geo.setAttribute('slabA',new THREE.BufferAttribute(A,4));
  geo.setAttribute('slabB',new THREE.BufferAttribute(B,3));
}

// The slab laid out over each piece on a material of the kitchen's crosscut program
// (app.js; the lightmap's or not). `shade` is GLSL run where the normal maps are read;
// `normal` (a texture, in slab UV) and `relief` give the surface its texture, none = flat.
export function slabStone(m,{map,shade='',key,normal=null,relief=0}){
  const prior=m.onBeforeCompile;
  m.map=map;
  m.onBeforeCompile=(shader,r)=>{
    prior.call(m,shader,r);
    seedVertex(shader);
    if(normal)shader.uniforms.crosscutNormal={value:normal};
    shader.vertexShader='attribute vec3 slabCentre,slabB;\nattribute vec4 slabA;\nvarying vec3 vSlabCentre,vSlabB;\nvarying vec4 vSlabA;\n'
      +shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSlabCentre=slabCentre;vSlabA=slabA;vSlabB=slabB;');
    shader.fragmentShader=shader.fragmentShader.replace('void main() {',`varying vec3 vSlabCentre,vSlabB;
      varying vec4 vSlabA;
      vec2 slabUv(vec2 p){return mat2(vSlabA.xy,vSlabA.zw)*vec2(mix(p.x,abs(p.x),vSlabB.z),p.y)+vSlabB.xy;}
      void main() {`);
    shader.fragmentShader=shader.fragmentShader.replace('#define CROSSCUT_RELIEF 1.0',`#define CROSSCUT_RELIEF ${(normal?relief:0).toFixed(3)}`)
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
}

// Laminam «Taj Mahal» over exported vanity/lavadero pieces, keeping their triangles and
// baked light (the kitchen's crosscut program on ctx.lightmap.material); `region` keys
// the program.
let laminamMaps=null;
export async function laminam(ctx,pieces,region,version){
  const {THREE}=ctx;
  // One texture pair for the three modules that use it (one GPU upload).
  laminamMaps??=Promise.all([['laminam',true],['laminam_nor',false]].map(([n,srgb])=>ctx.loadTexture(`./assets/rooms/banos/${n}.webp?v=${version}`,{srgb})))
    .then(maps=>{for(const t of maps)t.wrapS=t.wrapT=THREE.MirroredRepeatWrapping;return maps;});
  const [map,normal]=await laminamMaps;
  const base=ctx.cloneMaterial(ctx.mats.kitchenCrosscut);
  base.color.setRGB(.98,1.0,1.03);base.roughness=LAMINAM.roughness;
  for(const piece of pieces){
    slabLayout(THREE,piece.geometry,pieceSeeds(THREE,piece.geometry),[],LAMINAM.slab);
    piece.material=ctx.cloneMaterial(ctx.lightmap.material(base,'laminam',region));
    slabStone(piece.material,{map,normal,relief:LAMINAM.relief,key:'laminam-'+region+'-'+version});
  }
}
