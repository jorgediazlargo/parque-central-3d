// Light baked per vertex for the salon's furniture (sofa, armchairs, plinth), which the room
// module builds at run time (rooms/salon.mjs) and the lightmap cannot hold: without it they
// take the probes (a 30 cm grid of ambient light, no sun or self-shadowing). Cycles bakes
// each vertex's irradiance with the house bake's lights, samples and clamp
// (scripts/luz_salon_cycles.py --vertex-bake): day, day without lights and night, RGBM
// like the lightmaps. A mesh takes it only if its key, vertex count and positions match
// the bake (the room module builds the same geometry every time); otherwise it keeps the probes.
const MODES={day:0,dayoff:1,night:2};
export async function applyVertexLight(THREE,{scene,lightmap,url='./assets/salon-vertex-light.json?v=d2c79ec8d4',bin='./assets/salon-vertex-light.bin?v=355f2999ab'}){
  const salon=scene.getObjectByName('room:salon');if(!salon||!lightmap.data.salonVertex)return 0;
  const [data,buffer]=await Promise.all([fetch(url).then(r=>r.json()),fetch(bin).then(r=>r.arrayBuffer())]);
  if(data.houseContextSha256!==lightmap.data.contextSha256||data.encoding!==lightmap.data.encoding)return 0;
  const byKey=new Map(data.meshes.map(m=>[m.key,m]));
  const mode={value:0},PI_RANGE=(data.range*Math.PI).toFixed(4);
  const meshes=[];let k=0;
  salon.traverse(o=>{if(o.isMesh&&o.visible&&[o.material].flat()[0]?.userData?.runtimeLit)meshes.push([o,'salon#'+(k++)+'#'+o.geometry.getAttribute('position').count]);});
  // The picture and the shelved recess keep the probes: a few vertices on a canvas or on a
  // shelf housed into its sides cannot hold their light (buried edge vertices smear black).
  // They still take a key, so the order matches the bake (scripts/luz_salon.mjs).
  const inPicture=o=>{for(let p=o;p;p=p.parent)if(p.name==='salon:cuadro'||p.name==='salon:baldas')return true;return false;};
  let applied=0;
  for(const [mesh,key] of meshes){
    const m=byKey.get(key),pos=mesh.geometry.getAttribute('position');if(!m||m.count!==pos.count||inPicture(mesh))continue;
    // Same geometry as baked: mean and first vertices within 1 mm.
    const mean=[0,0,0];for(let i=0;i<pos.count;i++){mean[0]+=pos.getX(i);mean[1]+=pos.getY(i);mean[2]+=pos.getZ(i);}
    if(mean.some((v,a)=>Math.abs(v/pos.count-m.mean[a])>1e-3)||m.first.some((p,i)=>Math.abs(pos.getX(i)-p[0])+Math.abs(pos.getY(i)-p[1])+Math.abs(pos.getZ(i)-p[2])>3e-3)){console.warn('Luz por vértice: geometría distinta en',key);continue;}
    const geo=mesh.geometry,n=m.count*4;
    ['vlDay','vlOff','vlNight'].forEach((name,i)=>geo.setAttribute(name,new THREE.BufferAttribute(new Uint8Array(buffer,m.offset+i*n,n),4,true)));
    const wrap=source=>{
      const mat=source.clone();mat.defines={...(source.defines||{})};mat.userData={...source.userData,vertexLit:true};
      const prior=source.onBeforeCompile,key=source.customProgramCacheKey.bind(source);
      mat.onBeforeCompile=(shader,r)=>{
        prior.call(mat,shader,r);
        shader.uniforms.vlMode=mode;
        shader.vertexShader='attribute vec4 vlDay,vlOff,vlNight;\nuniform float vlMode;\nvarying vec3 vVertexE;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          {vec4 c=vlMode<.5?vlDay:vlMode<1.5?vlOff:vlNight;vec3 s=c.rgb*c.a;vVertexE=s*s*${PI_RANGE};}`);
        const fs=shader.fragmentShader.replace(/float lpCover=probeInterior\(lpWorld\+lpNormalW\*\.1\);\s*vec3 lpE=probeIrradiance\([^;]*;/,'float lpCover=1.0;vec3 lpE=vVertexE;');
        if(fs===shader.fragmentShader)console.warn('Luz por vértice: sombreador sin sondas en',source.name);
        shader.fragmentShader='varying vec3 vVertexE;\n'+fs;
      };
      mat.customProgramCacheKey=()=>key()+'|vertex-lit';return mat;
    };
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(wrap):wrap(mesh.material);
    mesh.onBeforeRender=()=>{mode.value=MODES[lightmap.mode]??0;};
    applied++;
  }
  return applied;
}
