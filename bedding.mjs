import * as THREE from './assets/three.module.js';
import {GLTFLoader} from './assets/jsm/loaders/GLTFLoader.js';
import {clothPixels,CLOTH_KINDS} from './cloth-maps.mjs?v=13691be8ab';

// Master bed dressing after render 3: washed-linen duvet draped over the sides,
// folded top sheet, two pairs of piped pillows and a taupe waffle throw at the
// foot. Simulated as cloth in Blender (scripts/bedding_blender.py →
// assets/rooms/camas/master.glb): the duvet dropped on the mattress hangs in real
// drape folds with cone folds at the corners, sheet and throw dropped on it, the
// pillows inflated with pressure (corner creases, piping on the seam), occlusion
// baked into the vertex colours. Added at run time so the exported model (and the
// baked light hashes) stay untouched; the exported duvet, pillows and blanket are
// hidden instead. World coordinates in metres: head at low X, 2 × 2 m mattress.
export const MASTER_BED={x0:.1997,x1:2.1997,z0:-8.7103,z1:-6.7101};
const TOP=.52;

// Exported bedding triangles to drop: inside the bed footprint, down to 5 cm off the
// floor (the old blanket hung lower than the simulated duvet's foot does).
export function hideExportedBedding(geo){
  const pos=geo.getAttribute('position'),keep=[],b=MASTER_BED;
  for(let i=0;i<pos.count;i+=3){
    let x=0,y=0,z=0;
    for(let k=0;k<3;k++){x+=pos.getX(i+k);y+=pos.getY(i+k);z+=pos.getZ(i+k);}
    x/=3;y/=3;z/=3;
    if(x>b.x0-.02&&x<2.245&&z>b.z0-.06&&z<b.z1+.06&&y>.05)continue;
    keep.push(i,i+1,i+2);
  }
  if(keep.length<pos.count)geo.setIndex(keep);
}

// Tileable cloth maps: colour + normal from a height field. `size` metres per tile.
// The pixels are computed in workers as soon as the page starts (prepareBedding); the
// textures exist at once and take them when they arrive, before anything is drawn.
const pixels=new Map();
function computePixels(kind){
  if(!pixels.has(kind)){
    let result;
    try{
      const worker=new Worker(new URL('./cloth-worker.mjs?v=97b3581079',import.meta.url),{type:'module'});
      result=new Promise((resolve,reject)=>{worker.onmessage=e=>{worker.terminate();resolve(e.data);};worker.onerror=e=>{worker.terminate();reject(e);};});
      worker.postMessage(kind);
      result=result.catch(()=>clothPixels(kind));
    }catch{result=Promise.resolve().then(()=>clothPixels(kind));}
    pixels.set(kind,result);
  }
  return pixels.get(kind);
}
// The simulated dressing, fetched with the cloth maps as the page starts.
let masterModel=null;
const loadMaster=()=>masterModel||=new GLTFLoader().loadAsync('./assets/rooms/camas/master.glb?v=5ea85b43f2');
export function prepareBedding(){for(const kind of CLOTH_KINDS)computePixels(kind);loadMaster().catch(()=>{});}
const mapCache=new Map();
// Also for the rooms (ctx.clothMaps): cloth-maps.mjs CLOTH_KINDS.
export function clothMaps(kind){
  if(mapCache.has(kind))return mapCache.get(kind);
  const N=1024,col=document.createElement('canvas'),nor=document.createElement('canvas');col.width=col.height=nor.width=nor.height=N;
  const map=new THREE.CanvasTexture(col),normalMap=new THREE.CanvasTexture(nor);
  map.colorSpace=THREE.SRGBColorSpace;
  for(const t of [map,normalMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  const ready=computePixels(kind).then(({size,color,normal})=>{
    col.getContext('2d').putImageData(new ImageData(color,size,size),0,0);nor.getContext('2d').putImageData(new ImageData(normal,size,size),0,0);
    map.needsUpdate=normalMap.needsUpdate=true;
  });
  const maps={map,normalMap,ready};mapCache.set(kind,maps);return maps;
}
// Resolves when every cloth map has its pixels.
export const beddingReady=()=>Promise.all([...mapCache.values()].map(m=>m.ready));

function cloth(color,kind,{normal=.75,roughness=.92,sheen=.55,ao=false}={}){
  const {map,normalMap}=clothMaps(kind);
  return new THREE.MeshPhysicalMaterial({color,map,normalMap,normalScale:new THREE.Vector2(normal,normal),roughness,vertexColors:ao,
    sheen,sheenRoughness:.62,sheenColor:new THREE.Color(color).lerp(new THREE.Color('#ffffff'),.35),side:THREE.DoubleSide});
}

export async function masterBedding(){
  const group=new THREE.Group(),{x0,x1,z0,z1}=MASTER_BED,L=x1-x0,Wh=(z1-z0)/2,cz=(z0+z1)/2;
  const sheet=cloth('#f1eee8','sheet',{normal:.6}),
        linen=cloth('#ece6dc','linen',{ao:true}),cuff=cloth('#f1eee8','sheet',{normal:.6,ao:true}),
        throwMat=cloth('#a3968a','waffle',{normal:1,roughness:.95,sheen:.7,ao:true}),
        pillowMat=cloth('#eee9e0','sheet',{normal:.55,ao:true}),
        piping=new THREE.MeshPhysicalMaterial({color:'#d9d0c3',roughness:.85,sheen:.4,vertexColors:true});

  // Mattress in a fitted sheet, soft rounded edges (the cloth simulation's collider).
  const bevel=.035,outline=new THREE.Shape(),hx=L/2-.005-bevel,hz=Wh-.005-bevel,cr=.03;
  outline.moveTo(-hx+cr,-hz);outline.lineTo(hx-cr,-hz);outline.quadraticCurveTo(hx,-hz,hx,-hz+cr);outline.lineTo(hx,hz-cr);
  outline.quadraticCurveTo(hx,hz,hx-cr,hz);outline.lineTo(-hx+cr,hz);outline.quadraticCurveTo(-hx,hz,-hx,hz-cr);outline.lineTo(-hx,-hz+cr);outline.quadraticCurveTo(-hx,-hz,-hx+cr,-hz);
  const bed=new THREE.ExtrudeGeometry(outline,{depth:TOP-.29-2*bevel,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:5,curveSegments:6});
  const buv=bed.getAttribute('uv');for(let i=0;i<buv.count;i++)buv.setXY(i,buv.getX(i)/.6,buv.getY(i)/.6);
  bed.rotateX(-Math.PI/2);bed.translate((x0+x1)/2,.29+bevel,cz);
  group.add(new THREE.Mesh(bed,sheet));

  // Duvet, sheet cuff, throw and pillows in the bed's frame (x along from the head,
  // z across): one mesh each, UVs in cloth tiles, occlusion in the vertex colours.
  try{
    const dressing=(await loadMaster()).scene;dressing.name='Ropa de cama';
    dressing.position.set(x0,0,cz);
    dressing.traverse(o=>{
      if(!o.isMesh)return;
      o.material=o.name.endsWith('_piping')?piping:o.name==='duvet'?linen:o.name==='cuff'?cuff:o.name==='throw'?throwMat:pillowMat;
    });
    group.add(dressing);
  }catch(e){console.error('[bedding] master.glb',e);}
  group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return group;
}
