import * as THREE from './assets/three.module.js';
import {GLTFLoader} from './assets/jsm/loaders/GLTFLoader.js';
import {lightObject} from './lighting.mjs?v=1aa5e4f212';

// Per-room modules (rooms/<id>.mjs), each exporting `async function apply(ctx)`.
// They run after the house, textures and baked light are ready and before the tour
// starts. A failing module is logged and skipped: the others still apply.
export const ROOM_IDS=['salon','comedor','dormitorio','estudio','bano','vestidor','ninas','juegos','cocina'];
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
// Triangles (as first-vertex indices into the index list) whose centroid is in a box.
function partition(geo,boxes){
  const pos=geo.getAttribute('position'),index=geo.index,n=index?index.count:pos.count;
  const keep=[],hit=[],c=new THREE.Vector3();
  for(let i=0;i<n;i+=3){
    const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,d=index?index.getX(i+2):i+2;
    c.set((pos.getX(a)+pos.getX(b)+pos.getX(d))/3,(pos.getY(a)+pos.getY(b)+pos.getY(d))/3,(pos.getZ(a)+pos.getZ(b)+pos.getZ(d))/3);
    (boxes.some(bx=>bx.containsPoint(c))?hit:keep).push(a,b,d);
  }
  return {keep,hit};
}
// Drops triangles by index only: every attribute (position, uv, uv1 lightmap) stays aligned.
function keepOnly(geo,keep){geo.setIndex(new THREE.BufferAttribute(new Uint32Array(keep),1));}

export function makeContext({id,scene,camera,renderer,mats,staticMeshes,lightmap,data,doors,lighting}){
  const group=new THREE.Group();group.name='room:'+id;scene.add(group);
  const gltf=new GLTFLoader();
  return {
    id,THREE,scene,camera,renderer,mats,staticMeshes,lightmap,data,doors,group,plan,cloneMaterial,
    // glTF/glb; resolves to the parsed gltf ({scene, ...}). URLs relative to index.html.
    loadModel:url=>gltf.loadAsync(url),
    loadTexture:async(url,{srgb=true,repeat=true}={})=>{
      const t=await new THREE.TextureLoader().loadAsync(url);if(srgb)t.colorSpace=THREE.SRGBColorSpace;
      if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
    },
    // Strip exported (house.bin) triangles whose centroid lies in a world box
    // [[x0,y0,z0],[x1,y1,z1]] (or a list of them / THREE.Box3). Optional filters:
    // material ('wall', 'wood', ... or a list) and region ('shared', 'salon', 'kitchen').
    // Returns the number of triangles removed.
    removeExported({material,region,box}){
      const boxes=toBoxes(box);let removed=0;
      for(const mesh of exportedMeshes(staticMeshes,{material,region})){
        const {keep,hit}=partition(mesh.geometry,boxes);
        if(hit.length){keepOnly(mesh.geometry,keep);removed+=hit.length/3;}
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
        const geo=mesh.geometry,{keep,hit}=partition(geo,boxes);if(!hit.length)continue;
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
    // Lights runtime meshes like the baked rooms: diffuse light from the irradiance
    // probes baked by Cycles with the lightmaps (an ambient cube every 30 cm, so a
    // vase on a shelf gets the light of that shelf), reflections from the room's
    // box-projected reflection probe, no generic fill lights indoors. Materials are
    // cloned, never patched in place; strength scales the probe light. Returns the
    // object. Reflection probes are captured after every room module has run, so
    // new props also show up in reflections.
    lightRuntimeObject(object,{strength=1}={}){return lightObject(object,lighting,strength);}
  };
}

export async function applyRooms(base,ids=ROOM_IDS){
  const status={};
  await Promise.all(ids.map(async id=>{
    try{
      const module=await import(`./rooms/${id}.mjs`);
      await module.apply(makeContext({...base,id}));
      status[id]='ok';
    }catch(e){
      status[id]='error: '+(e?.message||e);
      console.error(`[rooms/${id}] failed:`,e);
    }
  }));
  return status;
}
