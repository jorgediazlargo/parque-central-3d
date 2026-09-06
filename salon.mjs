import * as THREE from './assets/three.module.js';

// Generated irradiance affects only the geometry clipped to the salon boundary.
// Dynamic doors continue to use the existing scene lighting and moving colliders.
export async function loadSalon(renderer,sourceBuffer) {
  const [j,b]=await Promise.all([fetch('./assets/salon.json?v=salon-20260906'),fetch('./assets/salon.bin?v=salon-20260906')]);
  if(!j.ok||!b.ok)throw Error('No se ha podido descargar la iluminación del salón.');
  const data=await j.json(),buffer=await b.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',sourceBuffer)),v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==data.sourceSha256)throw Error('La geometría y la iluminación del salón no corresponden a la misma versión.');
  const light=await new THREE.TextureLoader().loadAsync('./assets/'+data.lightmap+'?v=salon-20260906');
  light.channel=1;light.generateMipmaps=false;light.minFilter=THREE.LinearFilter;light.colorSpace=THREE.NoColorSpace;light.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const materials=new Map(),bases=new Map();
  function material(base,kind) {
    if(materials.has(kind))return materials.get(kind);
    const m=base.clone();m.defines={...m.defines,...base.defines};m.lightMap=light;m.lightMapIntensity=1;
    if(kind==='linen')m.color.set('#eee8de');
    if(kind==='fabric')m.color.set('#a99b89');
    if(kind==='rug')m.color.set('#b9ab94');
    if(kind==='wall'){m.color.set('#e3d8c7');m.normalScale.set(.12,.12);}
    if(kind==='wood')m.color.set('#dedbd3');
    m.onBeforeCompile=shader=>{
      base.onBeforeCompile(shader);
      shader.fragmentShader=shader.fragmentShader.replace('yarnCloth*.018','yarnCloth*.004');
      shader.vertexShader='varying vec3 salonWorldPos;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsalonWorldPos=(modelMatrix*vec4(position,1.0)).xyz;');
      shader.fragmentShader='varying vec3 salonWorldPos;\n'+shader.fragmentShader;
      // The cove contribution is now baked from actual ceiling geometry.
      shader.fragmentShader=shader.fragmentShader.replace(/float cove=0\.0;[\s\S]*?outgoingLight\+=vec3\(1\.0,\.57,\.24\)\*cove;/,'');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',THREE.ShaderChunk.lights_fragment_maps.replace(/#ifdef USE_LIGHTMAP[\s\S]*?#endif/,''));
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
        vec3 salonIrradiance=texture2D(lightMap,vLightMapUv).rgb;
        float salonBlend=(1.0-smoothstep(9.80,10.18,salonWorldPos.x))*(1.0-smoothstep(-4.20,-3.70,salonWorldPos.z));
        irradiance=mix(irradiance,salonIrradiance*salonIrradiance*(4.0*PI),salonBlend);
        reflectedLight.directDiffuse*=1.0-salonBlend;
        reflectedLight.directSpecular*=1.0-salonBlend;
        iblIrradiance*=mix(1.0,.12,salonBlend);
        radiance*=mix(1.0,.20,salonBlend);
        #include <lights_fragment_end>
      `);
      if(kind==='floor')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        #include <map_fragment>
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.255,.145),.20);
      `);
    };
    m.customProgramCacheKey=()=>`salon-baked-${kind}`;
    materials.set(kind,m);bases.set(kind,base);return m;
  }
  function geometry(sourceIndex) {
    const spec=data.meshes.find(m=>m.sourceIndex===sourceIndex);if(!spec)return null;
    const floats=new Float32Array(buffer,spec.offset,spec.count*10),inter=new THREE.InterleavedBuffer(floats,10),g=new THREE.BufferGeometry();
    for(const [name,size,offset] of [['position',3,0],['normal',3,3],['uv',2,6],['uv1',2,8]])g.setAttribute(name,new THREE.InterleavedBufferAttribute(inter,size,offset));
    g.computeBoundingSphere();return g;
  }
  function syncTextures(){
    for(const [kind,m] of materials){
      const base=bases.get(kind);
      for(const k of ['map','normalMap','roughnessMap','bumpMap','bumpScale'])m[k]=base[k];
      if(['linen','fabric','rug'].includes(kind)){
        const t=textile(kind);m.map=t;m.bumpMap=t;m.bumpScale=kind==='rug'?.0006:kind==='fabric'?.0004:.00015;
      }
      m.needsUpdate=true;
    }
  }
  return {material,geometry,syncTextures};
}

export function artwork() {
  const c=document.createElement('canvas');c.width=512;c.height=1024;
  const ctx=c.getContext('2d');ctx.fillStyle='#d9ccb5';ctx.fillRect(0,0,512,1024);
  // Original line composition inspired by the reference, not a crop of the render.
  ctx.strokeStyle='#494132';
  for(let r=70;r<1180;r+=16){
    ctx.beginPath();ctx.lineWidth=3.4;
    for(let j=0;j<=200;j++){
      const a=-Math.PI*.7+j/200*Math.PI*1.35;
      const rr=r+2.2*Math.sin(a*13+r*.07)+1.4*Math.sin(a*31+r*.013);
      const x=-35+rr*Math.cos(a),y=880+rr*.88*Math.sin(a);
      if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  return new THREE.MeshStandardMaterial({map:texture,roughness:.95,side:THREE.DoubleSide});
}

export function curtainMaterial(base) {
  const m=base.clone();m.defines={...m.defines,...base.defines};m.color.set('#ece5d9');m.opacity=.88;m.roughness=1;m.depthWrite=true;
  m.onBeforeCompile=shader=>{
    base.onBeforeCompile(shader);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
      reflectedLight.directSpecular=vec3(0.0);
      #include <lights_fragment_end>
    `);
  };
  m.customProgramCacheKey=()=> 'salon-sheer';return m;
}

// Avoid adding screen-space shadow halos on top of Cycles contact shadows.
// World-position masking leaves the existing AO in every other room intact.
export function maskSalonAO(ao,camera) {
  const m=ao.copyMaterial;
  Object.assign(m.uniforms,{
    salonDepth:{value:ao.normalRenderTarget.depthTexture},
    salonProjectionInverse:{value:camera.projectionMatrixInverse},
    salonCameraWorld:{value:camera.matrixWorld}
  });
  m.fragmentShader=m.fragmentShader.replace('void main()',`
    uniform sampler2D salonDepth;
    uniform mat4 salonProjectionInverse;
    uniform mat4 salonCameraWorld;
    void main()
  `).replace('gl_FragColor = opacity * texel;',`
    float depth=texture2D(salonDepth,vUv).x;
    vec4 p=salonProjectionInverse*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);
    vec3 world=(salonCameraWorld*vec4(p.xyz/p.w,1.0)).xyz;
    float living=smoothstep(5.075,5.22,world.x)*(1.0-smoothstep(10.03,10.18,world.x))
      *smoothstep(-8.55,-8.40,world.z)*(1.0-smoothstep(-3.85,-3.70,world.z));
    gl_FragColor=opacity*mix(texel,vec4(1.0),living);
  `);
  m.needsUpdate=true;
}


function textile(kind){
  const c=document.createElement('canvas');c.width=c.height=512;
  const ctx=c.getContext('2d'),pixels=ctx.createImageData(512,512);
  let seed=3817;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const i=(y*512+x)*4;
    const yarn=(x%4<2?4:-4)+(y%4<2?3:-3);
    const slub=3*Math.sin(x*.08+2*Math.sin(y*.025));
    const v=(kind==='linen'?244:224)+yarn+slub+(random()-.5)*16;
    pixels.data.set([v,v-2,v-5,255],i);
  }
  ctx.putImageData(pixels,0,0);
  if(kind==='fabric'){
    ctx.strokeStyle='rgba(95,82,66,.075)';ctx.lineWidth=2;
    for(let y=-48;y<560;y+=64)for(let x=-48;x<560;x+=64){
      for(let r=10;r<29;r+=6){ctx.beginPath();ctx.ellipse(x+(y%128?16:0),y,r,r*1.2,.35,0,Math.PI*2);ctx.stroke();}
    }
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(kind==='rug'?2.5:4,kind==='rug'?2.5:4);t.anisotropy=8;return t;
}
