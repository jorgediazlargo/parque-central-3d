import * as THREE from './assets/three.module.js';
import {textile,textileNormal,textileNormalScale} from './textiles.mjs?v=2f3f9752c9';
import {probeVolume,fetchProbeData,patchLighting} from './lighting.mjs?v=65f7ecdcd5';

// Irradiance baked for the whole dwelling in one Cycles solution (scripts/bake_house.py).
// Each house.bin vertex gets a lightmap UV: (page + u) / 2 and v, with 1,1 for surfaces
// left to the probes (sheers) or, outdoors, to the sun (terrace, facade). Pages are
// HDR: RGBM of sqrt(linear / range) in lossless WebP. The same bake gives the
// irradiance probes (lighting.mjs) used by doors, bedding and room props.
// `lighting.uniforms` (probes + reflections) must be filled before the first render.
// upCoves: raised ceilings lit from their riser ([x0,z0,x1,z1,h], house.json coves 0 and 1).
// Their cove is baked about five times brighter than in renders 1 and 2: the share above
// the room's ambient is scaled down so the wash grades instead of clipping to white.
// Night: the same bake with the daylight off (data.night, same UVs). setMode('night'|'day')
// fetches the other pages and probes once and swaps them into the same textures, so no
// material is recompiled.
// RGBM needs the alpha untouched: decode without premultiplication or colour conversion.
const bitmaps=new THREE.ImageBitmapLoader().setOptions({imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
const bakeVersion=data=>data.contextSha256.slice(0,10)+data.samples;
const bakeFiles=(data,m)=>m==='night'?{pages:data.night.lightmaps,probes:data.night.probes}:{pages:data.lightmaps,probes:data.probes.file};
// Requests the bake of `mode` now (its JSON and UVs) and its pages and probes once
// `after` settles, so it downloads alongside the geometry; loadLightmap takes the result.
// The JSON and the UVs are versioned by content (scripts/version.mjs); the pages and
// probes by bake, so a re-denoise is revalidated (no-cache).
export function fetchLightmap(mode='day',{after=null}={}){
  const get=(url,read)=>fetch(url,{priority:'high'}).then(r=>{if(!r.ok)throw Error('No se ha podido descargar la iluminación.');return read(r);});
  const json=get('./assets/house-light.json?v=1f5371a28c',r=>r.json()),uvs=get('./assets/house-light.bin?v=4ff5024e34',r=>r.arrayBuffer());
  const files=Promise.all([json,uvs]);
  const maps=Promise.all([json,after]).then(([data])=>{
    if(data.encoding!=='rgbm-sqrt-range-64')throw Error('Iluminación con un formato antiguo.');
    const version=bakeVersion(data),{pages,probes}=bakeFiles(data,mode);
    return Promise.all([Promise.all(pages.map(name=>bitmaps.loadAsync('./assets/'+name+'?v='+version))),fetchProbeData(probes,version)]);
  });
  maps.catch(()=>{});  // reported by loadLightmap
  return {mode,files,maps};
}
// Resolves with the UVs; the pages and probes fill their textures when decoded (`loaded`),
// so the house is built (and its programs compiled) meanwhile.
export async function loadLightmap(renderer,sourceHash,lighting,{upCoves=[],prefetched=fetchLightmap()}={}){
  const {mode}=prefetched,[data,buffer]=await prefetched.files;
  if(data.sourceSha256!==await sourceHash)throw Error('La geometría y la iluminación no corresponden a la misma versión.');
  const version=bakeVersion(data),files=m=>bakeFiles(data,m);
  const pages=files(mode).pages.map(()=>new THREE.Texture()),probes=probeVolume(data.probes);
  const variants={[mode]:prefetched.maps.then(([bitmaps,probes])=>({bitmaps,probes}))};
  const loaded=variants[mode].then(v=>{
    pages.forEach((t,i)=>{t.image=v.bitmaps[i];t.needsUpdate=true;});
    probes.texture.image.data=v.probes;probes.texture.needsUpdate=true;
  });
  let current=mode;
  async function setMode(next){
    if(next===current)return false;
    variants[next]??=Promise.all([Promise.all(files(next).pages.map(name=>bitmaps.loadAsync('./assets/'+name+'?v='+version))),fetchProbeData(files(next).probes,version)])
      .then(([b,p])=>({bitmaps:b,probes:p})).catch(e=>{delete variants[next];throw e;});
    const v=await variants[next];
    pages.forEach((t,i)=>{t.image=v.bitmaps[i];t.needsUpdate=true;});
    probes.texture.image.data=v.probes;probes.texture.needsUpdate=true;
    current=next;return true;
  }
  for(const t of pages){t.channel=1;t.flipY=false;t.premultiplyAlpha=false;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.colorSpace=THREE.NoColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  lighting.probes=probes;
  const RANGE=data.range;
  const spans=new Map(data.meshes.map(m=>[m.sourceIndex,m]));
  const materials=new Map(),bases=new Map();
  function bind(geometry,sourceIndex){
    const m=spans.get(sourceIndex);if(!m)return false;
    geometry.setAttribute('uv1',new THREE.BufferAttribute(new Uint16Array(buffer,m.offset,m.count*2),2,true));return true;
  }
  // The living room and kitchen keep the finishes tuned with their former atlases.
  function material(base,kind,region){
    const id=kind+'-'+region;if(materials.has(id))return materials.get(id);
    const m=base.clone();m.defines={...m.defines,...base.defines};m.lightMap=pages[0];m.lightMapIntensity=1;
    if(region==='salon'){
      if(kind==='linen')m.color.set('#efebe4');
      if(kind==='fabric')m.color.set('#9d9189');
      if(kind==='rug')m.color.set('#b9ab94');
    }
    if(region==='kitchen'&&kind==='kitchenFabric')m.color.set('#776d60');
    m.onBeforeCompile=shader=>{
      base.onBeforeCompile(shader);
      shader.uniforms.planarLight={value:pages[1]};
      if(region==='salon')shader.fragmentShader=shader.fragmentShader.replace('yarnCloth*.018','yarnCloth*.004');
      if(region==='kitchen'&&kind==='kitchenOak')shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.rgb=mix(vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),diffuseColor.rgb,.88)*.90;
      `);
      // Coves are baked from the real ceiling geometry: drop the painted glow.
      shader.fragmentShader=shader.fragmentShader.replace(/float cove=0\.0;[\s\S]*?outgoingLight\+=vec3\([^)]*\)\*cove;/,'');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',THREE.ShaderChunk.lights_fragment_maps.replace(/#ifdef USE_LIGHTMAP[\s\S]*?#endif/,''));
      shader.fragmentShader='uniform sampler2D planarLight;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`
        {vec2 bakedUv=vec2(vLightMapUv.x*2.0,vLightMapUv.y);
        float baked=step(bakedUv.x,1.999);
        vec4 rgbm=bakedUv.x<1.0?texture2D(lightMap,bakedUv):texture2D(planarLight,bakedUv-vec2(1.0,0.0));
        vec3 bakedSqrt=rgbm.rgb*rgbm.a;
        vec3 bakedE=bakedSqrt*bakedSqrt*${(RANGE*Math.PI).toFixed(4)};
        ${kind==='wall'?upCoves.map(([x0,z0,x1,z1,h])=>`if(houseWorld.y>${(h+.01).toFixed(3)}&&all(greaterThan(houseWorld.xz,vec2(${(x0-.06).toFixed(3)},${(z0-.06).toFixed(3)})))&&all(lessThan(houseWorld.xz,vec2(${(x1+.06).toFixed(3)},${(z1+.06).toFixed(3)})))){float coveL=dot(bakedE,vec3(.2126,.7152,.0722));bakedE*=coveL>2.0?(2.0+.3*(coveL-2.0))/coveL:1.0;}`).join('\n'):''}
        // Texels the bake never wrote (outside every island: a few faces of mixed
        // orientation or slivers past the margin) read exactly black; they take the
        // probes instead of showing as black notches.
        baked*=smoothstep(.0004,.003,dot(bakedE,vec3(.2126,.7152,.0722)));
        #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
        // The bake is non-directional: relief (normal and bump maps) is shaded by how the
        // room's light (its reflection probe, diffuse) changes between the flat and the
        // perturbed normal.
        {float flatLum=dot(getIBLIrradiance(nonPerturbedNormal),vec3(.2126,.7152,.0722));
        float bumpLum=dot(iblIrradiance,vec3(.2126,.7152,.0722));
        bakedE*=flatLum>1e-4?clamp(sqrt(bumpLum/flatLum),.75,1.35):1.0;}
        #endif
        // Specular occlusion: where the bake is darker than the room's own light
        // (under furniture, in corners) reflections fade the same way.
        float envLum=dot(iblIrradiance,vec3(.2126,.7152,.0722));
        float specOcc=envLum>1e-4?clamp(dot(bakedE,vec3(.2126,.7152,.0722))/envLum*1.5,0.0,1.0):1.0;
        // Unbaked fragments (sheers indoors) take the probes; outdoors the sun and sky.
        float lpCover=0.0;vec3 lpE=vec3(0.0);
        if(baked<.999){lpCover=probeInterior(lpWorld+lpNormalW*.1);lpE=probeIrradiance(lpWorld+lpNormalW*.1,inverseTransformDirection(geometryNormal,viewMatrix));}
        float inside=max(baked,lpCover);
        irradiance*=1.0-inside;
        iblIrradiance=mix(mix(iblIrradiance,lpE,lpCover),bakedE,baked);
        reflectedLight.directDiffuse*=1.0-inside;
        reflectedLight.directSpecular*=1.0-inside;
        radiance*=mix(1.0,specOcc,baked);}
        #include <lights_fragment_end>
      `);
      patchLighting(shader,lighting.uniforms,'baked');
    };
    m.customProgramCacheKey=()=>'baked-'+id;m.userData={...m.userData,bakedLit:true};
    materials.set(id,m);bases.set(id,[base,kind,region]);return m;
  }
  function syncTextures(){
    for(const [id,m] of materials){
      const [base,kind,region]=bases.get(id);
      for(const k of ['map','normalMap','roughnessMap','bumpMap','bumpScale'])m[k]=base[k];
      m.normalScale.copy(base.normalScale);
      if(region==='salon'&&['linen','fabric','rug'].includes(kind)){m.map=textile(kind);m.normalMap=textileNormal(kind);m.normalScale.setScalar(textileNormalScale[kind]);m.bumpMap=null;}
      m.needsUpdate=true;
    }
  }
  return {bind,material,syncTextures,setMode,get mode(){return current;},pages,probes,data,loaded};
}
