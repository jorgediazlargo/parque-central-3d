import * as THREE from './assets/three.module.js';
import {textile,textileBump} from './textiles.mjs?v=30c4725840';

// Irradiance baked for the whole dwelling in one Cycles solution (scripts/bake_house.py).
// Each house.bin vertex gets a lightmap UV: (page + u) / 2 and v, with 1,1 for surfaces
// left to the runtime lights (terrace, facade, sheers). Doors and the master bedding
// are not in house.bin and keep the runtime lights.
export async function loadLightmap(renderer,sourceHash){
  const [j,b]=await Promise.all([fetch('./assets/house-light.json?v=547d5a6c26',{cache:'no-cache'}),fetch('./assets/house-light.bin?v=f38209eb8e',{cache:'no-cache'})]);
  if(!j.ok||!b.ok)throw Error('No se ha podido descargar la iluminación.');
  const data=await j.json(),buffer=await b.arrayBuffer();
  if(data.sourceSha256!==sourceHash)throw Error('La geometría y la iluminación no corresponden a la misma versión.');
  const version=data.contextSha256.slice(0,10)+data.samples;
  const pages=await Promise.all(data.lightmaps.map(name=>new THREE.TextureLoader().loadAsync('./assets/'+name+'?v='+version)));
  for(const t of pages){t.channel=1;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.colorSpace=THREE.NoColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
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
        vec2 bakedUv=vec2(vLightMapUv.x*2.0,vLightMapUv.y);
        float baked=step(bakedUv.x,1.999);
        vec3 bakedLight=mix(texture2D(lightMap,bakedUv).rgb,texture2D(planarLight,bakedUv-vec2(1.0,0.0)).rgb,step(1.0,bakedUv.x));
        irradiance=mix(irradiance,bakedLight*bakedLight*(4.0*PI),baked);
        reflectedLight.directDiffuse*=1.0-baked;
        reflectedLight.directSpecular*=1.0-baked;
        iblIrradiance*=mix(1.0,.12,baked);
        radiance*=mix(1.0,.20,baked);
        #include <lights_fragment_end>
      `);
    };
    m.customProgramCacheKey=()=>'baked-'+id;
    materials.set(id,m);bases.set(id,[base,kind,region]);return m;
  }
  function syncTextures(){
    for(const [id,m] of materials){
      const [base,kind,region]=bases.get(id);
      for(const k of ['map','normalMap','roughnessMap','bumpMap','bumpScale'])m[k]=base[k];
      if(region==='salon'&&kind==='wall')m.normalScale.set(.12,.12);
      if(region==='salon'&&['linen','fabric','rug'].includes(kind)){const t=textile(kind);m.map=t;m.bumpMap=t;m.bumpScale=textileBump[kind];}
      m.needsUpdate=true;
    }
  }
  return {bind,material,syncTextures};
}
