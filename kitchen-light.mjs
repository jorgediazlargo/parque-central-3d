import * as THREE from './assets/three.module.js';

// Each layout owns its UVs and irradiance. Island offsets never reuse another bake.
export async function loadKitchen(renderer,sourceBuffer){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',sourceBuffer)),v=>v.toString(16).padStart(2,'0')).join('');
  const variants=await Promise.all(['original','alternative'].map(async variant=>{
    const [j,b]=await Promise.all([fetch(`./assets/kitchen-${variant}.json`),fetch(`./assets/kitchen-${variant}.bin`)]);
    if(!j.ok||!b.ok)throw Error('No se ha podido descargar la luz de la cocina.');
    const data=await j.json(),buffer=await b.arrayBuffer();
    if(data.sourceSha256!==hash||data.variant!==variant)throw Error('La luz de cocina no corresponde a esta distribución.');
    const light=await new THREE.TextureLoader().loadAsync('./assets/'+data.lightmap);
    light.channel=1;light.colorSpace=THREE.NoColorSpace;light.generateMipmaps=false;light.minFilter=THREE.LinearFilter;
    const geometries=new Map(),materials=new Map(),bases=new Map();
    for(const s of data.meshes){
      const inter=new THREE.InterleavedBuffer(new Float32Array(buffer,s.offset,s.count*10),10),g=new THREE.BufferGeometry();
      for(const [name,size,offset] of [['position',3,0],['normal',3,3],['uv',2,6],['uv1',2,8]])g.setAttribute(name,new THREE.InterleavedBufferAttribute(inter,size,offset));
      g.computeBoundingSphere();geometries.set(s.sourceIndex,g);
    }
    function material(base,kind){
      if(materials.has(kind))return materials.get(kind);
      const m=base.clone();if(kind==='kitchenFabric')m.color.set('#776d60');m.defines={...base.defines};m.lightMap=light;m.lightMapIntensity=1;
      m.onBeforeCompile=shader=>{
        base.onBeforeCompile(shader);
        if(kind==='floor')shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          roughnessFactor=mix(roughnessFactor,.78,smoothstep(-3.70,-3.0,houseWorld.z));
        `);
        if(kind==='kitchenOak')shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          diffuseColor.rgb=mix(vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),diffuseColor.rgb,.60)*.78;
        `);
        shader.fragmentShader=shader.fragmentShader.replace(/float cove=0\.0;[\s\S]*?outgoingLight\+=vec3\(1\.0,\.57,\.24\)\*cove;/,'');
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',THREE.ShaderChunk.lights_fragment_maps.replace(/#ifdef USE_LIGHTMAP[\s\S]*?#endif/,''));
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
          vec3 kitchenIrradiance=texture2D(lightMap,vLightMapUv).rgb;
          ${kind==='wall'?`// Reject isolated dark texels at adjoining ceiling cells, preserving broad shadows.
          if(houseWorld.y>2.15){
            vec2 texel=vec2(2.0/4096.0,0.0);
            vec3 neighbors=max(max(texture2D(lightMap,vLightMapUv+texel).rgb,texture2D(lightMap,vLightMapUv-texel).rgb),
              max(texture2D(lightMap,vLightMapUv+texel.yx).rgb,texture2D(lightMap,vLightMapUv-texel.yx).rgb));
            kitchenIrradiance=max(kitchenIrradiance,neighbors);
          }`:''}
          float kitchenBlend=smoothstep(-3.70,-3.43,houseWorld.z);
          irradiance=mix(irradiance,kitchenIrradiance*kitchenIrradiance*(4.0*PI),kitchenBlend);
          reflectedLight.directDiffuse*=1.0-kitchenBlend;
          reflectedLight.directSpecular*=1.0-kitchenBlend;
          iblIrradiance*=mix(1.0,.12,kitchenBlend);
          radiance*=mix(1.0,${kind==='floor'?'0.035':'.40'},kitchenBlend);
          #include <lights_fragment_end>
        `);
      };
      m.customProgramCacheKey=()=>`kitchen-${variant}-${kind}`;materials.set(kind,m);bases.set(kind,base);return m;
    }
    function sync(){for(const [kind,m] of materials){const b=bases.get(kind);for(const k of ['map','normalMap','roughnessMap','bumpMap','bumpScale'])m[k]=b[k];m.needsUpdate=true;}}
    return {geometries,material,sync};
  }));
  const registered=[];
  return {
    register(mesh,index,base,kind){
      const choices=variants.map(v=>{const g=v.geometries.get(index);return g?{geometry:g,material:v.material(base,kind)}:null});
      if(!choices.some(Boolean))return;
      registered.push({mesh,choices});Object.assign(mesh,choices[0]||choices[1]);
    },
    setVariant(on){for(const {mesh,choices} of registered){const choice=choices[on?1:0];if(choice)Object.assign(mesh,choice);}},
    syncTextures(){variants.forEach(v=>v.sync());}
  };
}

export function maskKitchenAO(ao){
  // maskSalonAO already supplies the world position reconstructed from scene depth.
  const m=ao.copyMaterial;
  m.fragmentShader=m.fragmentShader.replace('gl_FragColor=opacity*mix(texel,vec4(1.0),living);',`
    float kitchen=smoothstep(7.315,7.35,world.x)*(1.0-smoothstep(13.33,13.365,world.x))
      *smoothstep(-3.70,-3.43,world.z)*(1.0-smoothstep(-.27,-.23,world.z));
    gl_FragColor=opacity*mix(texel,vec4(1.0),max(living,kitchen));
  `);m.needsUpdate=true;
}
