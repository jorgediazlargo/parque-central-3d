import * as THREE from './assets/three.module.js';

// Shared lighting for every surface of the house, baked or not.
//
// - Irradiance probes (house-probes.bin, baked by Cycles with the lightmaps): an
//   ambient cube every 30 x 40 x 30 cm. Runtime objects (doors, bedding, room props)
//   take their diffuse light from them instead of generic fill lights, so they sit
//   in the same light as the baked surfaces around them.
// - Reflection probes: one HDR cube capture per room, taken in the viewer itself
//   (real textures, baked light), prefiltered with PMREM and packed side by side in
//   one CubeUV atlas. Each fragment picks the room it faces and samples it with a
//   box (parallax) projection, so floors, wood, stone, glass and metal reflect the
//   room they are in and not a generic studio.
// - Baked irradiance is routed through three's image-based diffuse path, so the
//   Fresnel energy split, the multiscattering and the fabric sheen all see it.

export const ROOM_HEIGHT=2.5;

// Raw float16 probe grid (day: info.file; night: house-light.json night.probes).
export async function fetchProbeData(file,version){
  const res=await fetch('./assets/'+file+'?v='+version,{cache:'no-cache'});
  if(!res.ok)throw Error('No se han podido descargar las sondas de luz.');
  return new Uint16Array(await res.arrayBuffer());
}
// The probe volume for the grid of `info`; its data (fetchProbeData) may come later.
export function probeVolume(info,data=null){
  const [nx,ny,nz]=info.dims;
  const tex=new THREE.Data3DTexture(data,nx,nz,6*ny);
  tex.type=THREE.HalfFloatType;tex.format=THREE.RGBAFormat;tex.minFilter=tex.magFilter=THREE.LinearFilter;
  tex.wrapS=tex.wrapT=tex.wrapR=THREE.ClampToEdgeWrapping;tex.unpackAlignment=1;tex.generateMipmaps=false;if(data)tex.needsUpdate=true;
  return {texture:tex,uniforms:{
    probeVolume:{value:tex},
    probeOrigin:{value:new THREE.Vector3(...info.origin)},
    probeStep:{value:new THREE.Vector3(...info.step)},
    probeDims:{value:new THREE.Vector3(nx,ny,nz)}
  }};
}

// Room boxes for the reflection probes: the plan rooms of house.json (minus the terrace).
export function probeRooms(data){
  return data.rooms.filter(r=>r.name!=='Terraza').map(r=>{
    const [[x0,z0],[x1,z1]]=r.box;
    return {name:r.name,min:new THREE.Vector3(x0,0,z0),max:new THREE.Vector3(x1,ROOM_HEIGHT,z1),center:new THREE.Vector3((x0+x1)/2,1.35,(z0+z1)/2)};
  });
}

// Curtain pockets (scripts/light_layout.py, house.json lightLines): a concealed line
// just under the ceiling in front of the sheers, aimed down. The bake lights the room
// with it; the sheers themselves are not baked, so they take its irradiance here, in
// closed form for a Lambertian strip (the same light, units and colour as Cycles).
const MAX_POCKETS=8;
export function pocketUniforms(data){
  const lines=(data.lightLines||[]).filter(l=>l.kind==='pocket').slice(0,MAX_POCKETS);
  const pad=(list,v)=>[...list,...Array(MAX_POCKETS-list.length).fill(v)];
  return {
    pocketCount:{value:lines.length},
    // a.x, a.z, b.x, b.z | y, power per metre (W/m, as bake_house area()), lean x, lean z
    pocketA:{value:pad(lines.map(l=>new THREE.Vector4(l.a[0],l.a[1],l.b[0],l.b[1])),new THREE.Vector4())},
    pocketB:{value:pad(lines.map(l=>new THREE.Vector4(l.y,l.power*.30,l.toward[0],l.toward[1])),new THREE.Vector4())},
    pocketColor:{value:pad(lines.map(l=>new THREE.Vector3(...l.color)),new THREE.Vector3())}
  };
}

const MAX_ROOMS=16,CAPTURE_SIZE=128;
export class ReflectionProbes{
  constructor(rooms){
    this.rooms=rooms.slice(0,MAX_ROOMS);
    const pad=(list,v)=>[...list,...Array(MAX_ROOMS-list.length).fill(v)];
    this.uniforms={
      reflCount:{value:this.rooms.length},
      reflMin:{value:pad(this.rooms.map(r=>r.min.clone()),new THREE.Vector3(1e5,1e5,1e5))},
      reflMax:{value:pad(this.rooms.map(r=>r.max.clone()),new THREE.Vector3(1e5,1e5,1e5))},
      reflCenter:{value:pad(this.rooms.map(r=>r.center.clone()),new THREE.Vector3())},
      reflEnabled:{value:0}
    };
    this.atlas=null;
    // Black CubeUV environment as tall as the atlas (PMREM: 4 × the cube size, the only
    // part of the atlas that enters a program). The captures see it, with reflEnabled 0:
    // no reflection reaches them, as without an environment, but every material compiles
    // to the very program the tour draws with.
    const height=4*CAPTURE_SIZE;
    this.blank=new THREE.DataTexture(new Uint16Array(4*height),1,height,THREE.RGBAFormat,THREE.HalfFloatType);
    this.blank.mapping=THREE.CubeUVReflectionMapping;this.blank.needsUpdate=true;
  }
  // Compiles every program the captures and the tour draw with, in parallel where the
  // browser can (KHR_parallel_shader_compile): into an HDR target, as the composer and
  // the captures do, with a CubeUV environment.
  // wait false: only starts them (no polling), for a compile that overlaps other work.
  compile(renderer,scene,camera,target,{wait=true}={}){
    const prior=renderer.getRenderTarget(),environment=scene.environment;
    scene.environment=this.blank;renderer.setRenderTarget(target);
    const ready=wait?renderer.compileAsync(scene,camera):renderer.compile(scene,camera);
    renderer.setRenderTarget(prior);scene.environment=environment;
    return ready;
  }
  // Captures every room (6 x size² HDR) and builds the atlas used as scene.environment.
  capture(renderer,scene,size=CAPTURE_SIZE){
    const cubeRT=new THREE.WebGLCubeRenderTarget(size,{type:THREE.HalfFloatType,generateMipmaps:false});
    const cam=new THREE.CubeCamera(.05,60,cubeRT);scene.add(cam);
    const pmrem=new THREE.PMREMGenerator(renderer);
    const tone=renderer.toneMapping,environment=scene.environment,background=scene.background;
    let atlas=null,tileW=0,tileH=0;
    const copy=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      uniforms:{src:{value:null}},depthTest:false,depthWrite:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:'uniform sampler2D src;varying vec2 vUv;void main(){gl_FragColor=texture2D(src,vUv);}'
    }));
    const copyScene=new THREE.Scene();copyScene.add(copy);const copyCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.uniforms.reflEnabled.value=0;scene.environment=this.blank;
    this.rooms.forEach((room,i)=>{
      cam.position.copy(room.center);cam.update(renderer,scene);
      const rt=pmrem.fromCubemap(cubeRT.texture);
      if(!atlas){
        tileW=rt.width;tileH=rt.height;
        atlas=new THREE.WebGLRenderTarget(tileW*this.rooms.length,tileH,{type:THREE.HalfFloatType,depthBuffer:false,generateMipmaps:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
        atlas.texture.mapping=THREE.CubeUVReflectionMapping;
      }
      copy.material.uniforms.src.value=rt.texture;
      atlas.viewport.set(i*tileW,0,tileW,tileH);
      renderer.setRenderTarget(atlas);renderer.render(copyScene,copyCam);renderer.setRenderTarget(null);
      rt.dispose();
    });
    atlas.viewport.set(0,0,atlas.width,atlas.height);
    scene.remove(cam);cubeRT.dispose();pmrem.dispose();copy.geometry.dispose();copy.material.dispose();
    renderer.toneMapping=tone;scene.background=background;
    if(this.atlas)this.atlas.dispose();
    this.atlas=atlas;scene.environment=atlas.texture;scene.environmentIntensity=1;
    this.uniforms.reflEnabled.value=1;
    return atlas;
  }
}

// GLSL shared by all patched materials. Needs the varying lpWorld (world position).
export const LIGHTING_PARS=`
varying vec3 lpWorld;
uniform highp sampler3D probeVolume;uniform vec3 probeOrigin,probeStep,probeDims;
uniform vec3 reflMin[${MAX_ROOMS}],reflMax[${MAX_ROOMS}],reflCenter[${MAX_ROOMS}];uniform int reflCount;uniform float reflEnabled;
float reflTile=0.0;vec3 reflBoxMin=vec3(-1e5),reflBoxMax=vec3(1e5),reflBoxCenter=vec3(0.0);
vec4 probeFetch(vec3 f,float dir){
  vec3 c=vec3((f.x+.5)/probeDims.x,(f.z+.5)/probeDims.z,(dir*probeDims.y+clamp(f.y,0.0,probeDims.y-1.0)+.5)/(6.0*probeDims.y));
  return texture(probeVolume,c);
}
uniform vec4 pocketA[${MAX_POCKETS}],pocketB[${MAX_POCKETS}];uniform vec3 pocketColor[${MAX_POCKETS}];uniform int pocketCount;
// Irradiance (W/m²) on a surface at p facing n from the pocket strips. Strip of power
// P per metre, Lambertian, normal ne perpendicular to its axis: with r the distance to
// the axis and t along it, E = P/PI * cos_e * cos_r * [t/(2(r²+t²)) + atan(t/r)/(2r)].
vec3 pocketWash(vec3 p,vec3 n){
  vec3 e=vec3(0.0);
  for(int i=0;i<${MAX_POCKETS};i++){
    if(i>=pocketCount)break;
    vec3 a=vec3(pocketA[i].x,pocketB[i].x,pocketA[i].y),b=vec3(pocketA[i].z,pocketB[i].x,pocketA[i].w);
    vec3 axis=b-a;float len=length(axis);axis/=len;
    float s=dot(p-a,axis);vec3 u=p-(a+axis*s);float r=max(length(u),.025);u/=r;
    vec3 ne=normalize(vec3(pocketB[i].z*.22,-1.0,pocketB[i].w*.22));
    float ce=max(dot(ne,u),0.0),cr=max(dot(n,-u),0.0);
    float t0=-s,t1=len-s;
    float g=t1/(2.0*(r*r+t1*t1))+atan(t1/r)/(2.0*r)-t0/(2.0*(r*r+t0*t0))-atan(t0/r)/(2.0*r);
    e+=pocketColor[i]*(pocketB[i].y/PI*ce*cr*g);
  }
  return e;
}
// Ambient cube: irradiance (W/m², as the lightmaps × PI) on a surface facing n at p (world).
vec3 probeIrradiance(vec3 p,vec3 n){
  vec3 f=(p-probeOrigin)/probeStep,n2=n*n;
  return PI*(n2.x*probeFetch(f,n.x>=0.0?0.0:1.0).rgb+n2.y*probeFetch(f,n.y>=0.0?2.0:3.0).rgb+n2.z*probeFetch(f,n.z>=0.0?4.0:5.0).rgb);
}
// 1 inside the dwelling, 0 outdoors (terrace, facade).
float probeInterior(vec3 p){return probeFetch((p-probeOrigin)/probeStep,2.0).a;}
// Picks the room box the surface faces (point pushed 12 cm along its normal).
void selectReflection(vec3 p,vec3 n){
  vec3 q=p+n*.12;float best=1e9;
  for(int i=0;i<${MAX_ROOMS};i++){
    if(i>=reflCount)break;
    vec3 d=max(max(reflMin[i]-q,q-reflMax[i]),vec3(0.0));float dist=dot(d,d);
    if(dist<best){best=dist;reflTile=float(i);reflBoxMin=reflMin[i];reflBoxMax=reflMax[i];reflBoxCenter=reflCenter[i];}
  }
}
vec3 boxProject(vec3 p,vec3 r){
  p=clamp(p,reflBoxMin+.02,reflBoxMax-.02);
  vec3 t=max((reflBoxMax-p)/r,(reflBoxMin-p)/r);float s=min(min(t.x,t.y),t.z);
  return p+r*max(s,0.0)-reflBoxCenter;
}
`;

// Box-projected replacement of three's getIBLRadiance.
const IBL_RADIANCE=`
  vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
    #ifdef ENVMAP_TYPE_CUBE_UV
      vec3 reflectVec = reflect( - viewDir, normal );
      reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
      reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
      vec3 projected = normalize( boxProject( lpWorld, reflectVec ) );
      reflectVec = normalize( mix( projected, reflectVec, roughness * roughness ) );
      vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
      return envMapColor.rgb * envMapIntensity * reflEnabled;
    #else
      return vec3( 0.0 );
    #endif
  }`;

export function lightingUniforms(probes,reflections){return {...probes.uniforms,...reflections.uniforms};}

// Patches a MeshStandard/Physical shader (call last in onBeforeCompile).
// mode 'baked': lightmap materials (the fragment code sets bakedE / baked before
// lights_fragment_end); 'runtime': probe-lit runtime objects.
export function patchLighting(shader,uniforms,mode,{strength=1,translucency=0}={}){
  Object.assign(shader.uniforms,uniforms);
  shader.uniforms.probeStrength={value:strength};
  shader.vertexShader='varying vec3 lpWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
    {vec4 lpw=vec4(transformed,1.0);
    #ifdef USE_INSTANCING
    lpw=instanceMatrix*lpw;
    #endif
    #ifdef USE_BATCHING
    lpw=batchingMatrix*lpw;
    #endif
    lpWorld=(modelMatrix*lpw).xyz;}`);
  let fs=shader.fragmentShader;
  // CubeUV atlas: one tile per room, side by side.
  fs=fs.replace('#include <cube_uv_reflection_fragment>',THREE.ShaderChunk.cube_uv_reflection_fragment.replace('uv.y *= CUBEUV_TEXEL_HEIGHT;',`uv.y *= CUBEUV_TEXEL_HEIGHT;
      uv.x = ( uv.x + reflTile ) / float( reflCount );`));
  fs=fs.replace('#include <envmap_physical_pars_fragment>',THREE.ShaderChunk.envmap_physical_pars_fragment.replace(/vec3 getIBLRadiance\([\s\S]*?\n\t}\n/,IBL_RADIANCE+'\n'));
  fs=fs.replace('#include <common>','#include <common>\n'+LIGHTING_PARS+'\nuniform float probeStrength;\n');
  fs=fs.replace('#include <lights_fragment_begin>',`
    vec3 lpNormalW=normalize(inverseTransformDirection(nonPerturbedNormal,viewMatrix));
    selectReflection(lpWorld,lpNormalW);
    #include <lights_fragment_begin>`);
  if(mode==='runtime'){
    fs=fs.replace('#include <lights_fragment_end>',`
      {float lpCover=probeInterior(lpWorld+lpNormalW*.1);
      vec3 lpE=probeIrradiance(lpWorld+lpNormalW*.1,inverseTransformDirection(geometryNormal,viewMatrix))*probeStrength;
      irradiance*=1.0-lpCover;
      iblIrradiance=mix(iblIrradiance,lpE,lpCover);
      reflectedLight.directDiffuse*=1.0-lpCover;
      reflectedLight.directSpecular*=1.0-lpCover;
      ${translucency>0?`// Sheers and blinds: daylight from behind shines through (diffuse transmission).
      reflectedLight.indirectDiffuse+=diffuseColor.rgb*probeIrradiance(lpWorld-lpNormalW*.12,-lpNormalW)*RECIPROCAL_PI*${translucency.toFixed(3)}*lpCover;
      // Curtain pockets wash the room face of the sheers (both faces: the folds turn).
      {vec3 lpN=normalize(inverseTransformDirection(normal,viewMatrix));
      reflectedLight.indirectDiffuse+=diffuseColor.rgb*(pocketWash(lpWorld,lpN)+pocketWash(lpWorld,-lpN)*.35)*RECIPROCAL_PI*lpCover*probeStrength;}`:''}}
      #include <lights_fragment_end>`);
  }
  shader.fragmentShader=fs;
  return shader;
}

// Material clone lit like the baked rooms (see rooms.mjs lightRuntimeObject).
const runtimeCache=new Map();
export function runtimeLit(source,lighting,strength=1){
  if(!source||source.userData?.runtimeLit||source.userData?.bakedLit||!/MeshStandardMaterial|MeshPhysicalMaterial/.test(source.type))return source;
  const key=source.uuid+'@'+strength;if(runtimeCache.has(key))return runtimeCache.get(key);
  const m=source.clone();m.defines={...(source.defines||{}),...(m.defines||{})};
  const prior=source.onBeforeCompile,priorKey=Object.prototype.hasOwnProperty.call(source,'customProgramCacheKey')?source.customProgramCacheKey.bind(source):()=>'';
  m.userData={...source.userData,runtimeLit:true};
  m.onBeforeCompile=(shader,r)=>{
    if(prior!==THREE.Material.prototype.onBeforeCompile)prior.call(m,shader,r);
    patchLighting(shader,lighting.uniforms,'runtime',{strength,translucency:source.userData?.translucency||0});
  };
  m.customProgramCacheKey=()=>priorKey()+'|runtime-lit'+(source.userData?.translucency||0);
  runtimeCache.set(key,m);return m;
}
export function lightObject(object,lighting,strength=1){
  object.traverse(o=>{
    if(!o.isMesh&&!o.isSkinnedMesh&&!o.isInstancedMesh)return;
    o.material=Array.isArray(o.material)?o.material.map(m=>runtimeLit(m,lighting,strength)):runtimeLit(o.material,lighting,strength);
  });
  return object;
}
