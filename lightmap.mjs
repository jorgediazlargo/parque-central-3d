import * as THREE from './assets/three.module.js';
import {textile,textileNormal,textileNormalScale} from './textiles.mjs?v=2f3f9752c9';
import {probeVolume,fetchProbeData,patchLighting} from './lighting.mjs?v=344884d358';

// Irradiance baked for the whole dwelling in one Cycles solution (scripts/bake_house.py).
// Each house.bin vertex gets a lightmap UV: (page + u) / 2 and v, with 1,1 for surfaces
// left to the probes (sheers) or, outdoors, to the sun (terrace, facade). Pages are
// HDR: RGBM of sqrt(linear / range) in lossless WebP. The same bake gives the
// irradiance probes (lighting.mjs) used by doors, bedding and room props.
// `lighting.uniforms` (probes + reflections) must be filled before the first render.
// upCoves: raised ceilings lit from their riser ([x0,z0,x1,z1,h], house.json coves 0 and 1).
// Their cove is baked about five times brighter than in renders 1 and 2: the share above
// the room's ambient is scaled down so the wash grades instead of clipping to white.
// Not in the salon (23/11/2026, review/luz-salon): there the plan's light is kept as baked,
// as the Cycles reference shows it (the ceiling read half as bright as path traced).
// Night: the same bake with the daylight off (data.night, same UVs). setMode('night'|'day')
// fetches the other pages and probes once and swaps them into the same textures, so no
// material is recompiled. The day bake has every artificial light on too; 'dayoff' is the
// daylight alone (data.dayOff, same UVs), for Luces encendidas unticked.
// RGBM needs the alpha untouched: decode without premultiplication or colour conversion.
const bitmaps=new THREE.ImageBitmapLoader().setOptions({imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
const bakeVersion=data=>data.contextSha256.slice(0,10)+data.samples;
// Without its own bake (an older house-light.json) 'dayoff' is the day.
const modeOf=(data,m)=>m==='dayoff'&&!data.dayOff?'day':m;
// Layout variants baked into the same UVs (data[variant], e.g. 'abierto': scripts/bake_abierto.py,
// «Dormitorio abierto al baño»): only their pages and probes differ. Used while made on this house bake.
const variantOf=(data,v)=>v&&data[v]?.houseContextSha256===data.contextSha256?v:null;
const bakeOf=(data,v)=>v?{...data[v],probes:{file:data[v].probes}}:data;
const bakeFiles=(data,m,variant=null)=>{const b=bakeOf(data,variant),v={night:b.night,dayoff:b.dayOff}[m];
  return {...(v?{pages:v.lightmaps,probes:v.probes}:{pages:b.lightmaps,probes:b.probes.file}),version:bakeVersion(b)};};
// Progressive loading: the first mode shows the reduced pages (data.lowres, 1/4 of the size,
// scripts/lightmap_lowres.py) and swaps in the full ones when they arrive. Variants have none.
const lowPages=(data,m,variant=null)=>variant?null:data.lowres?.[{night:'night',dayoff:'dayOff'}[m]||'lightmaps'];
const salonFiles=(data,m)=>({night:data.night,dayoff:data.dayOff}[m]||data).lightmaps;
const salonUsable=(s,data)=>!!s&&s.data.houseContextSha256===data.contextSha256&&s.data.sourceSha256===data.sourceSha256&&s.data.encoding===data.encoding;
// The salon's open sides (house.json region 'salon' ends there): dining room and kitchen.
// Along z the salon is only open through the kitchen opening (M1, from x0 on); west of it
// the wall where M1 parks closes it, and there the house bake's coarser texels darkened the
// wall, its skirting line and the ceiling edge (seen with «Cocina sin puerta», 24/11/2026).
// The skirting, the wall's returns (faces along x) and its west end (x < 5.4, the door head)
// keep the house bake: the salon bake is blotchy on those small faces.
const SALON_OPEN={x:10.18,z:-3.70,x0:7.915};
const loadPages=(names,version)=>Promise.all(names.map(name=>bitmaps.loadAsync('./assets/'+name+'?v='+version)));
// Requests the bake of `mode` now (its JSON and UVs) and its pages and probes once
// `after` settles, so it downloads alongside the geometry; loadLightmap takes the result.
// The JSON and the UVs are versioned by content (scripts/version.mjs); the pages and
// probes by bake, so a re-denoise is revalidated (no-cache).
export function fetchLightmap(mode='day',{after=null,variant=null}={}){
  const get=(url,read)=>fetch(url,{priority:'high'}).then(r=>{if(!r.ok)throw Error('No se ha podido descargar la iluminación.');return read(r);});
  const json=get('./assets/house-light.json?v=f3d45ef7f6',r=>r.json()),uvs=get('./assets/house-light.bin?v=6f1a46df34',r=>r.arrayBuffer());
  // Denser bake of the living room (scripts/bake_salon.py), when there is one for this house bake.
  // house-light.json names it (`salon`) once bake_salon.py has run on this house bake.
  const salon=json.then(data=>data.salon?Promise.all([get('./assets/salon-light.json?v=4aa3ce7463',r=>r.json()),get('./assets/salon-light.bin?v=a1e6827915',r=>r.arrayBuffer())])
    .then(([data,buffer])=>({data,buffer})):null).catch(e=>{console.warn('Sin la luz detallada del salón:',e);return null;});
  const files=Promise.all([json,uvs,salon]);
  const maps=Promise.all([json,after]).then(([data])=>{
    if(data.encoding!=='rgbm-sqrt-range-64')throw Error('Iluminación con un formato antiguo.');
    const m=modeOf(data,mode),v=variantOf(data,variant),{pages,probes,version}=bakeFiles(data,m,v);
    return Promise.all([loadPages(lowPages(data,m,v)||pages,version),fetchProbeData(probes,version),salon.then(s=>salonUsable(s,data)?loadPages(salonFiles(s.data,m),bakeVersion(s.data)):null)]);
  });
  // The full pages start once the reduced ones are in (they would share the bandwidth).
  const full=Promise.all([json,maps]).then(([data])=>{const m=modeOf(data,mode),v=variantOf(data,variant),f=bakeFiles(data,m,v);return lowPages(data,m,v)?loadPages(f.pages,f.version):null;});
  maps.catch(()=>{});full.catch(()=>{});  // reported by loadLightmap
  return {mode,variant,files,maps,full};
}
// Resolves with the UVs; the pages and probes fill their textures when decoded (`loaded`),
// so the house is built (and its programs compiled) meanwhile.
export async function loadLightmap(renderer,sourceHash,lighting,{upCoves=[],prefetched=fetchLightmap()}={}){
  const [data,buffer,salonBake]=await prefetched.files,mode=modeOf(data,prefetched.mode);
  // The salon's meshes (house.json region 'salon') read their own denser pages when the
  // salon bake was made on this house bake and covers every salon mesh of it.
  const salon=salonUsable(salonBake,data)&&data.meshes.every(m=>m.sourceKey?.[2]!=='salon'||salonBake.data.meshes.some(s=>s.sourceIndex===m.sourceIndex))?salonBake:null;
  const salonSpans=new Map((salon?.data.meshes||[]).map(m=>[m.sourceIndex,m]));
  const salonPages=salon?salon.data.lightmaps.map(()=>new THREE.Texture()):null;
  if(data.sourceSha256!==await sourceHash)throw Error('La geometría y la iluminación no corresponden a la misma versión.');
  const layout0=variantOf(data,prefetched.variant),key=(m,v)=>(v||'')+'|'+m;
  const pages=bakeFiles(data,mode).pages.map(()=>new THREE.Texture()),probes=probeVolume(data.probes);
  const variants={[key(mode,layout0)]:prefetched.maps.then(([bitmaps,probes,salonBitmaps])=>({bitmaps,probes,salonBitmaps}))};
  // A new image of another size needs a new GPU texture (storage is allocated once).
  const fill=(textures,bitmaps)=>textures.forEach((t,i)=>{if(t.image&&t.image.width!==bitmaps[i].width)t.dispose();t.image=bitmaps[i];t.needsUpdate=true;});
  const show=(bitmaps,salonBitmaps)=>{fill(pages,bitmaps);if(salonPages&&salonBitmaps)fill(salonPages,salonBitmaps);};
  const loaded=variants[key(mode,layout0)].then(v=>{
    show(v.bitmaps,v.salonBitmaps);
    probes.texture.image.data=v.probes;probes.texture.needsUpdate=true;
  });
  let current=mode,layout=layout0;
  // The full pages replace the reduced ones, unless the mode or layout changed meanwhile
  // (switching loads the other pages at full size directly).
  const sharp=Promise.all([loaded,prefetched.full]).then(([,full])=>{
    if(!full)return;
    const k=key(mode,layout0);variants[k]=variants[k].then(v=>({...v,bitmaps:full}));
    if(current===mode&&layout===layout0)show(full);  // the salon pages are already full size
  }).catch(e=>console.warn('Iluminación en alta resolución no disponible:',e));
  async function switchTo(nextMode,nextLayout){
    const k=key(nextMode,nextLayout),f=bakeFiles(data,nextMode,nextLayout);
    variants[k]??=Promise.all([loadPages(f.pages,f.version),fetchProbeData(f.probes,f.version),salon?loadPages(salonFiles(salon.data,nextMode),bakeVersion(salon.data)):null])
      .then(([b,p,s])=>({bitmaps:b,probes:p,salonBitmaps:s})).catch(e=>{delete variants[k];throw e;});
    const v=await variants[k];
    show(v.bitmaps,v.salonBitmaps);
    probes.texture.image.data=v.probes;probes.texture.needsUpdate=true;
    current=nextMode;layout=nextLayout;return true;
  }
  async function setMode(next){
    next=modeOf(data,next);
    if(next===current)return false;
    return switchTo(next,layout);
  }
  // Layout variant ('abierto' or null); false when unchanged or without its own bake.
  async function setVariant(next){
    next=variantOf(data,next);
    if(next===layout)return false;
    return switchTo(current,next);
  }
  for(const t of [...pages,...(salonPages||[])]){t.channel=1;t.flipY=false;t.premultiplyAlpha=false;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.colorSpace=THREE.NoColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  lighting.probes=probes;
  const RANGE=data.range;
  const spans=new Map(data.meshes.map(m=>[m.sourceIndex,m]));
  const materials=new Map(),bases=new Map();
  function bind(geometry,sourceIndex){
    const m=spans.get(sourceIndex),s=salonSpans.get(sourceIndex);
    if(s)geometry.setAttribute('salonUv',new THREE.BufferAttribute(new Uint16Array(salon.buffer,s.offset,s.count*2),2,true));
    if(!m)return false;
    geometry.setAttribute('uv1',new THREE.BufferAttribute(new Uint16Array(buffer,m.offset,m.count*2),2,true));return true;
  }
  // The living room and kitchen keep the finishes tuned with their former atlases.
  function material(base,kind,region){
    const id=kind+'-'+region;if(materials.has(id))return materials.get(id);
    const own=region==='salon'&&salonPages;
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
      if(own){
        // The salon's own denser pages (bake_salon.py, unclamped indirect light). Toward the
        // open sides (dining room at +x, hall at +z) they hand over to the house bake over
        // 1.2 m, so the two bakes meet without a step.
        shader.uniforms.salonLight0={value:salonPages[0]};shader.uniforms.salonLight1={value:salonPages[1]};
        shader.vertexShader='attribute vec2 salonUv;\nvarying vec2 vSalonUv;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSalonUv=salonUv;');
        shader.fragmentShader='uniform sampler2D salonLight0,salonLight1;\nvarying vec2 vSalonUv;\n'+shader.fragmentShader;
      }
      if(region==='salon')shader.fragmentShader=shader.fragmentShader.replace('yarnCloth*.018','yarnCloth*.004');
      // Coves are baked from the real ceiling geometry: drop the painted glow.
      shader.fragmentShader=shader.fragmentShader.replace(/float cove=0\.0;[\s\S]*?outgoingLight\+=vec3\([^)]*\)\*cove;/,'');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',THREE.ShaderChunk.lights_fragment_maps.replace(/#ifdef USE_LIGHTMAP[\s\S]*?#endif/,''));
      shader.fragmentShader='uniform sampler2D planarLight;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`
        {vec2 bakedUv=vec2(vLightMapUv.x*2.0,vLightMapUv.y);
        float baked=step(bakedUv.x,1.999);
        vec4 rgbm=bakedUv.x<1.0?texture2D(lightMap,bakedUv):texture2D(planarLight,bakedUv-vec2(1.0,0.0));${kind==='floor'?'\n        rgbm=floorBakedFix(rgbm,lightMap,planarLight,houseWorld.xz);':''}
        vec3 bakedSqrt=rgbm.rgb*rgbm.a;
        vec3 bakedE=bakedSqrt*bakedSqrt*${(RANGE*Math.PI).toFixed(4)};${own?`
        {vec2 sUv=vec2(vSalonUv.x*2.0,vSalonUv.y);
        if(sUv.x<1.999){vec4 s=sUv.x<1.0?texture2D(salonLight0,sUv):texture2D(salonLight1,sUv-vec2(1.0,0.0));
        vec3 sSqrt=s.rgb*s.a;vec3 salonE=sSqrt*sSqrt*${(RANGE*Math.PI).toFixed(4)};
        float salonW=(1.0-smoothstep(${(SALON_OPEN.x-1.2).toFixed(2)},${SALON_OPEN.x.toFixed(2)},houseWorld.x))*(1.0-smoothstep(${(SALON_OPEN.z-1.2).toFixed(2)},${SALON_OPEN.z.toFixed(2)},houseWorld.z)*(1.0-${kind==='white'?'0.0':`(1.0-smoothstep(${SALON_OPEN.x0.toFixed(3)},${(SALON_OPEN.x0+.7).toFixed(3)},houseWorld.x))*smoothstep(5.25,5.45,houseWorld.x)*step(abs(lpNormalW.x),.5)`}));
        // Texels the salon bake left black (a few small concave pieces: the bowl) keep the house bake.
        float salonL=dot(salonE,vec3(.2126,.7152,.0722)),houseL=dot(bakedE,vec3(.2126,.7152,.0722));
        bakedE=mix(bakedE,salonE,salonW*step(.0004,salonL)*smoothstep(.03,.12,salonL/max(houseL,1e-4)));}}`:''}
        ${kind==='wall'?upCoves.filter(([x0,,x1])=>!((x0+x1)/2>5.15&&(x0+x1)/2<10.1)).map(([x0,z0,x1,z1,h])=>`if(houseWorld.y>${(h+.01).toFixed(3)}&&all(greaterThan(houseWorld.xz,vec2(${(x0-.06).toFixed(3)},${(z0-.06).toFixed(3)})))&&all(lessThan(houseWorld.xz,vec2(${(x1+.06).toFixed(3)},${(z1+.06).toFixed(3)})))){float coveL=dot(bakedE,vec3(.2126,.7152,.0722));bakedE*=coveL>2.0?(2.0+.3*(coveL-2.0))/coveL:1.0;}`).join('\n'):''}
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
  return {bind,material,syncTextures,setMode,setVariant,get mode(){return current;},get variant(){return layout;},hasVariant:v=>!!variantOf(data,v),pages,salonPages,probes,data,loaded,sharp};
}
