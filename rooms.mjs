import * as THREE from './assets/three.module.js';
import {GLTFLoader} from './assets/jsm/loaders/GLTFLoader.js';
import {lightObject} from './lighting.mjs?v=65f7ecdcd5';
import {loadImageTexture} from './images.mjs?v=3b580fe40e';
import {clothMaps} from './bedding.mjs?v=322afdf762';
import {createCurtain,createBlind} from './curtains.mjs?v=023dd6f85e';

// Per-room modules (rooms/<id>.mjs), each exporting `async function apply(ctx)`.
// They run after the house, textures and baked light are ready and before the tour
// starts. A failing module is logged and skipped: the others still apply.
export const ROOM_IDS=['salon','comedor','dormitorio','estudio','bano','vestidor','ninas','juegos','cocina','instalaciones'];
export const PLAN_SCALE=51.53901216893343;
// B01 plan points (PDF units) to world metres [x, z]; y is height.
export const plan=(x,y)=>[(x-106.5)/PLAN_SCALE,(y-619.85)/PLAN_SCALE];

// Material clone that keeps the shader patches (onBeforeCompile, cache key, defines),
// which Material.clone() drops. Use it before changing a shared or baked material.
export function cloneMaterial(source){
  const m=source.clone();
  m.defines={...(source.defines||{}),...(m.defines||{})};
  if(source.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile)m.onBeforeCompile=source.onBeforeCompile;
  if(Object.prototype.hasOwnProperty.call(source,'customProgramCacheKey'))m.customProgramCacheKey=source.customProgramCacheKey;
  return m;
}

function toBoxes(box){
  const list=Array.isArray(box)&&Array.isArray(box[0])&&Array.isArray(box[0][0])?box:[box];
  return list.map(b=>b instanceof THREE.Box3?b:new THREE.Box3(new THREE.Vector3(...b[0]),new THREE.Vector3(...b[1])));
}
function exportedMeshes(staticMeshes,{material,region}={}){
  const want=v=>v==null?()=>true:Array.isArray(v)?x=>v.includes(x):x=>x===v;
  const okMaterial=want(material),okRegion=want(region);
  return staticMeshes.filter(m=>m.userData.exported&&okMaterial(m.userData.exported.material)&&okRegion(m.userData.exported.region));
}
// Triangles (as first-vertex indices into the index list) whose centroid is in a box,
// or null if none is. Read straight from the arrays; a mesh whose vertices all lie
// outside every box has none, so its triangles are not walked.
function partition(geo,boxes){
  const pos=geo.getAttribute('position'),index=geo.index,n=index?index.count:pos.count;
  const interleaved=pos.isInterleavedBufferAttribute,P=interleaved?pos.data.array:pos.array;
  const stride=interleaved?pos.data.stride:pos.itemSize,offset=interleaved?pos.offset:0,I=index?.array;
  if(pos.normalized)throw Error('partition: normalised positions');
  let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
  for(let v=0,o=offset;v<pos.count;v++,o+=stride){
    const x=P[o],y=P[o+1],z=P[o+2];
    if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(z<z0)z0=z;if(z>z1)z1=z;
  }
  const near=boxes.filter(b=>b.max.x>=x0&&b.min.x<=x1&&b.max.y>=y0&&b.min.y<=y1&&b.max.z>=z0&&b.min.z<=z1);
  if(!near.length)return null;
  const keep=[],hit=[];
  for(let i=0;i<n;i+=3){
    const a=I?I[i]:i,b=I?I[i+1]:i+1,d=I?I[i+2]:i+2,pa=a*stride+offset,pb=b*stride+offset,pd=d*stride+offset;
    const cx=(P[pa]+P[pb]+P[pd])/3,cy=(P[pa+1]+P[pb+1]+P[pd+1])/3,cz=(P[pa+2]+P[pb+2]+P[pd+2])/3;
    (near.some(bx=>cx>=bx.min.x&&cx<=bx.max.x&&cy>=bx.min.y&&cy<=bx.max.y&&cz>=bx.min.z&&cz<=bx.max.z)?hit:keep).push(a,b,d);
  }
  return hit.length?{keep,hit}:null;
}
// Drops triangles by index only: every attribute (position, uv, uv1 lightmap) stays aligned.
function keepOnly(geo,keep){geo.setIndex(new THREE.BufferAttribute(new Uint32Array(keep),1));}

export function makeContext({id,scene,camera,renderer,mats,staticMeshes,lightmap,data,doors,curtains=[],lighting,timeOfDay={night:false,listeners:new Set()}}){
  const group=new THREE.Group();group.name='room:'+id;scene.add(group);
  const gltf=new GLTFLoader();
  return {
    id,THREE,scene,camera,renderer,mats,staticMeshes,lightmap,data,doors,curtains,group,plan,cloneMaterial,
    // Cloth colour + normal maps computed in workers (cloth-maps.mjs): {map, normalMap}.
    clothMaps,
    // glTF/glb; resolves to the parsed gltf ({scene, ...}). URLs relative to index.html.
    loadModel:url=>gltf.loadAsync(url),
    loadTexture:async(url,{srgb=true,repeat=true}={})=>{
      const t=await loadImageTexture(url);if(srgb)t.colorSpace=THREE.SRGBColorSpace;
      if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
    },
    // Strip exported (house.bin) triangles whose centroid lies in a world box
    // [[x0,y0,z0],[x1,y1,z1]] (or a list of them / THREE.Box3). Optional filters:
    // material ('wall', 'wood', ... or a list) and region ('shared', 'salon', 'kitchen').
    // Returns the number of triangles removed.
    removeExported({material,region,box}){
      const boxes=toBoxes(box);let removed=0;
      for(const mesh of exportedMeshes(staticMeshes,{material,region})){
        const parts=partition(mesh.geometry,boxes);
        if(parts){keepOnly(mesh.geometry,parts.keep);removed+=parts.hit.length/3;}
      }
      return removed;
    },
    // Moves exported triangles in a box into new meshes of their own (one per source
    // mesh), keeping their baked lightmap UVs and a cloned material, so a room can
    // change the finish of its own walls/furniture without touching other rooms.
    // Returns the new meshes (already in the scene). If you replace the material's
    // onBeforeCompile, also give it its own customProgramCacheKey.
    splitExported({material,region,box}){
      const boxes=toBoxes(box),out=[];
      for(const mesh of exportedMeshes(staticMeshes,{material,region})){
        const geo=mesh.geometry,parts=partition(geo,boxes);if(!parts)continue;
        const {keep,hit}=parts;
        const part=new THREE.BufferGeometry();
        for(const [name,attr] of Object.entries(geo.attributes)){
          // Raw values (no denormalisation): the lightmap UVs are normalised Uint16.
          const size=attr.itemSize,src=attr.isInterleavedBufferAttribute?attr.data.array:attr.array;
          const stride=attr.isInterleavedBufferAttribute?attr.data.stride:size,offset=attr.isInterleavedBufferAttribute?attr.offset:0;
          const array=new src.constructor(hit.length*size);
          for(let i=0;i<hit.length;i++)for(let k=0;k<size;k++)array[i*size+k]=src[hit[i]*stride+offset+k];
          part.setAttribute(name,new THREE.BufferAttribute(array,size,attr.normalized));
        }
        part.computeBoundingSphere();keepOnly(geo,keep);
        const piece=new THREE.Mesh(part,cloneMaterial(mesh.material));
        piece.receiveShadow=mesh.receiveShadow;piece.castShadow=mesh.castShadow;
        piece.userData.exported={...mesh.userData.exported,split:id};
        group.add(piece);staticMeshes.push(piece);out.push(piece);
      }
      return out;
    },
    // Curtain that the visitor opens and closes with E (curtains.mjs: panels
    // {anchor,dir,open,closed} in world x, hung at depth z from y0 to y1; t = 1 gathered,
    // 0 drawn). The meshes are lit like lightRuntimeObject, take `material` as given
    // (translucency in its userData) and join the ray that finds doors. Returns the curtain.
    addCurtain(options){
      const curtain=createCurtain(THREE,options);
      for(const mesh of curtain.meshes){lightObject(mesh,lighting);group.add(mesh);staticMeshes.push(mesh);}
      curtains.push(curtain);return curtain;
    },
    // Roller blind (curtains.mjs createBlind): opens (rolls up) and closes with E like a
    // curtain; lit like lightRuntimeObject. Returns the blind.
    addBlind(options){
      const blind=createBlind(THREE,options);
      for(const mesh of blind.meshes){lightObject(mesh,lighting);group.add(mesh);staticMeshes.push(mesh);}
      curtains.push(blind);return blind;
    },
    // Lights runtime meshes like the baked rooms: diffuse light from the irradiance
    // probes baked by Cycles with the lightmaps (an ambient cube every 30 cm, so a
    // vase on a shelf gets the light of that shelf), reflections from the room's
    // box-projected reflection probe, no generic fill lights indoors. Materials are
    // cloned, never patched in place; strength scales the probe light. Returns the
    // object. Reflection probes are captured after every room module has run, so
    // new props also show up in reflections.
    lightRuntimeObject(object,{strength=1}={}){return lightObject(object,lighting,strength);},
    // Día / Noche. The lightmaps, probes and reflections switch on their own; a module
    // registers here only what it adds for daylight (a window wash, a lit backdrop):
    // fn(night) runs now with the current state and on every switch, before the
    // reflections are captured again. It may return a promise.
    get night(){return timeOfDay.night;},
    onTimeOfDay(fn){timeOfDay.listeners.add(fn);return fn(timeOfDay.night);}
  };
}

// Fetches and evaluates the modules (definitions only) while the house loads.
const modules=new Map();
export function preloadRooms(ids=ROOM_IDS){
  for(const id of ids)if(!modules.has(id)){const m=import(`./rooms/${id}.mjs`);m.catch(()=>{});modules.set(id,m);}  // reported by applyRooms
}
export async function applyRooms(base,ids=ROOM_IDS){
  const status={};preloadRooms(ids);
  await Promise.all(ids.map(async id=>{
    try{
      const module=await modules.get(id);
      await module.apply(makeContext({...base,id}));
      status[id]='ok';
    }catch(e){
      status[id]='error: '+(e?.message||e);
      console.error(`[rooms/${id}] failed:`,e);
    }
  }));
  return status;
}
