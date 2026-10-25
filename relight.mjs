import * as THREE from './assets/three.module.js';

// The F05 night relit with the lighting proposal (propuesta.mjs), until the proposal has
// a night bake of its own. Done once when it is shown, not every frame:
// - lightmap pages: each baked triangle is drawn in its lightmap UVs into a copy of the
//   page, and every texel gets the bake's irradiance with the lights the proposal removes
//   taken away, its own added (closed form, no shadows, each light confined to its room
//   box) and the F05 lights it keeps recoloured; written back as the same RGBM, so the
//   materials only swap textures (lightmap.override) and their programs do not change;
// - irradiance probes (doors, props, bedding): the same for each probe and direction, on
//   the CPU.
// Light kinds (luz_propuesta.py): 0 disc, Lambertian (energy/PI x cos, optionally
// narrowed to a cone); 1 point, isotropic (energy/4PI); 2 strip, Lambertian line of
// energy per metre (closed form as lighting.mjs pocketWash); 3 halo: the near field a
// light baked on the wall it sits on, which no closed form gets right: there the bake
// gives way to the (smooth) probes, by weight 1 - exp(-erase), erase = energy at the
// light falling off as s² / (d² + s²).
const ROOMS=16,KEEP=4,KINDS={disc:0,point:1,line:2,halo:3};

const RELIGHT=`
uniform highp sampler2D relightLights;uniform int roomCount,keepCount;
uniform vec4 roomMin[${ROOMS}],roomMax[${ROOMS}];uniform vec3 tint,keepMin[${KEEP}],keepMax[${KEEP}];
uniform highp sampler3D probeVolume;uniform vec3 probeOrigin,probeStep,probeDims;
const float PI=3.141592653589793;
vec4 probeFetch(vec3 f,float dir){
  vec3 c=vec3((f.x+.5)/probeDims.x,(f.z+.5)/probeDims.z,(dir*probeDims.y+clamp(f.y,0.0,probeDims.y-1.0)+.5)/(6.0*probeDims.y));
  return texture(probeVolume,c);
}
vec3 probeIrradiance(vec3 p,vec3 n){
  vec3 f=(p-probeOrigin)/probeStep,n2=n*n;
  return PI*(n2.x*probeFetch(f,n.x>=0.0?0.0:1.0).rgb+n2.y*probeFetch(f,n.y>=0.0?2.0:3.0).rgb+n2.z*probeFetch(f,n.z>=0.0?4.0:5.0).rgb);
}
// Lights of the rooms whose box holds p: added (gain), taken away (loss), halo weight (erase).
void relight(vec3 p,vec3 n,inout vec3 gain,inout vec3 loss,inout float erase){
  for(int r=0;r<${ROOMS};r++){
    if(r>=roomCount)break;
    vec4 lo=roomMin[r],hi=roomMax[r];
    if(any(lessThan(p,lo.xyz-.02))||any(greaterThan(p,hi.xyz+.02)))continue;
    int first=int(lo.w),count=int(hi.w);
    for(int k=0;k<64;k++){
      if(k>=count)break;
      int i=first+k;
      vec4 a=texelFetch(relightLights,ivec2(0,i),0),d=texelFetch(relightLights,ivec2(1,i),0),c=texelFetch(relightLights,ivec2(2,i),0),b=texelFetch(relightLights,ivec2(3,i),0);
      vec3 e;
      if(a.w>2.5){vec3 v=p-a.xyz;erase+=abs(c.r)*b.w*b.w/(dot(v,v)+b.w*b.w);continue;}
      if(a.w<1.5){
        vec3 v=p-a.xyz;float d2=dot(v,v);v*=inversesqrt(max(d2,1e-8));
        float cr=max(dot(n,-v),0.0);
        if(a.w<.5){float ce=dot(d.xyz,v);e=c.rgb*(max(ce,0.0)*(c.w>-1.5?smoothstep(d.w,c.w,ce):1.0)*cr/(PI*(d2+b.w*b.w)));}
        else e=c.rgb*(cr/(4.0*PI*(d2+b.w*b.w)));
      }else{
        vec3 axis=b.xyz-a.xyz;float len=length(axis);axis/=len;
        float t=dot(p-a.xyz,axis);vec3 u=p-(a.xyz+axis*t);float q=max(length(u),.025);u/=q;
        float ce=max(dot(d.xyz,u),0.0),cr=max(dot(n,-u),0.0),t0=-t,t1=len-t;
        float g=t1/(2.0*(q*q+t1*t1))+atan(t1/q)/(2.0*q)-t0/(2.0*(q*q+t0*t0))-atan(t0/q)/(2.0*q);
        e=c.rgb*(ce*cr*g/PI);
      }
      if(c.r<0.0)loss-=e;else gain+=e;
    }
  }
}
// The loss scales the baked light by its share of it (luminance, so the hue stays),
// easing toward 12 % instead of clipping: the closed form has no shadows, the bake has.
vec3 relightE(vec3 e,vec3 p,vec3 n){
  vec3 gain=vec3(0.0),loss=vec3(0.0);float erase=0.0;relight(p,n,gain,loss,erase);
  if(erase>0.0)e=mix(probeIrradiance(p+n*.1,n),e,exp(-erase));
  vec3 t=tint;
  for(int i=0;i<${KEEP};i++){if(i>=keepCount)break;if(all(greaterThanEqual(p,keepMin[i]))&&all(lessThanEqual(p,keepMax[i])))t=vec3(1.0);}
  float share=dot(loss,vec3(.2126,.7152,.0722))/max(dot(e,vec3(.2126,.7152,.0722)),1e-6);
  return e*(.12+.88*exp(-share/.88))*t+gain;
}`;

// Each baked triangle in its page's UV space; uv1 = ((page + u) / 2, v), (1, 1) = not baked.
const VERTEX=`precision highp float;
in vec3 position,normal;in vec2 uv1;uniform mat4 modelMatrix;uniform float page;
out vec3 vWorld,vNormal;out vec2 vUv;
void main(){
  vec2 b=vec2(uv1.x*2.0,uv1.y);float pg=floor(b.x);vUv=b-vec2(pg,0.0);
  vWorld=(modelMatrix*vec4(position,1.0)).xyz;vNormal=mat3(modelMatrix)*normal;
  gl_Position=abs(pg-page)<.5?vec4(vUv*2.0-1.0,0.0,1.0):vec4(2.0,2.0,2.0,1.0);
}`;
const FRAGMENT=`precision highp float;precision highp int;
in vec3 vWorld,vNormal;in vec2 vUv;uniform sampler2D src;uniform float range;out vec4 outColor;
${RELIGHT}
void main(){
  vec4 rgbm=texture(src,vUv);vec3 s=rgbm.rgb*rgbm.a,e=s*s*range*PI;
  e=relightE(e,vWorld,normalize(vNormal));
  vec3 v=sqrt(clamp(e/(range*PI),0.0,1.0));float m=ceil(max(max(max(v.r,v.g),v.b),1e-6)*255.0)/255.0;
  outColor=vec4(v/m,m);
}`;
const COPY_VERTEX=`in vec3 position;in vec2 uv;out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const COPY_FRAGMENT=`precision highp float;in vec2 vUv;uniform sampler2D src;out vec4 outColor;void main(){outColor=texture(src,vUv);}`;

// The same, for one probe (CPU): irradiance e [r, g, b] on a surface at p facing n.
function relightJS(lights,rooms,spec,e,p,n){
  const gain=[0,0,0],loss=[0,0,0];
  for(const r of rooms){
    const [lo,hi]=r.box;
    if(p[0]<lo[0]-.02||p[1]<lo[1]-.02||p[2]<lo[2]-.02||p[0]>hi[0]+.02||p[1]>hi[1]+.02||p[2]>hi[2]+.02)continue;
    for(const l of r.lights){
      let k=0;
      if(l.kind==='halo')continue;  // the probes are what the halo gives way to
      if(l.kind==='line'){
        const a=l.a,ax=[l.b[0]-a[0],l.b[1]-a[1],l.b[2]-a[2]],len=Math.hypot(...ax);ax.forEach((_,i)=>ax[i]/=len);
        const t=(p[0]-a[0])*ax[0]+(p[1]-a[1])*ax[1]+(p[2]-a[2])*ax[2],u=[0,1,2].map(i=>p[i]-(a[i]+ax[i]*t)),q=Math.max(Math.hypot(...u),.025);
        u.forEach((_,i)=>u[i]/=q);
        const ce=Math.max(l.dir[0]*u[0]+l.dir[1]*u[1]+l.dir[2]*u[2],0),cr=Math.max(-(n[0]*u[0]+n[1]*u[1]+n[2]*u[2]),0),t0=-t,t1=len-t;
        const g=t1/(2*(q*q+t1*t1))+Math.atan(t1/q)/(2*q)-t0/(2*(q*q+t0*t0))-Math.atan(t0/q)/(2*q);
        k=ce*cr*g/Math.PI;
      }else{
        const v=[p[0]-l.at[0],p[1]-l.at[1],p[2]-l.at[2]],d2=v[0]*v[0]+v[1]*v[1]+v[2]*v[2],len=Math.sqrt(Math.max(d2,1e-8));v.forEach((_,i)=>v[i]/=len);
        const cr=Math.max(-(n[0]*v[0]+n[1]*v[1]+n[2]*v[2]),0),s=l.half;
        if(l.kind==='disc'){
          const ce=l.dir[0]*v[0]+l.dir[1]*v[1]+l.dir[2]*v[2];
          let cone=1;if(l.cone){const o=Math.cos(l.cone[1]*Math.PI/180),i=Math.cos(l.cone[0]*Math.PI/180),x=Math.min(1,Math.max(0,(ce-o)/(i-o)));cone=x*x*(3-2*x);}
          k=Math.max(ce,0)*cone*cr/(Math.PI*(d2+s*s));
        }else k=cr/(4*Math.PI*(d2+s*s));
      }
      const out=l.sign===-1?loss:gain;for(let c=0;c<3;c++)out[c]+=l.color[c]*l.energy*k;
    }
  }
  const keep=spec.keep3000.slice(0,KEEP).some(([lo,hi])=>p.every((v,i)=>v>=lo[i]&&v<=hi[i])),t=keep?[1,1,1]:spec.tint;
  const lum=c=>.2126*c[0]+.7152*c[1]+.0722*c[2],share=lum(loss)/Math.max(lum(e),1e-6),f=.12+.88*Math.exp(-share/.88);
  return e.map((v,c)=>v*f*t[c]+gain[c]);
}

export function createRelight({THREE:T=THREE,renderer,spec,lightmap,staticMeshes}){
  // Lights sorted by room, 4 RGBA float texels each: position + kind, direction + cos
  // outer, signed energy x colour + cos inner, end of a strip + half size.
  const names=Object.keys(spec.rooms).slice(0,ROOMS),lights=[];
  for(const name of names)for(const l of spec.lights)if(l.room===name)lights.push({...l,half:(l.size||l.radius||.05)/2});
  const data=new Float32Array(Math.max(1,lights.length)*16);
  lights.forEach((l,i)=>{
    const sign=l.sign===-1?-1:1,cos=a=>Math.cos(a*Math.PI/180);
    data.set([...(l.kind==='line'?l.a:l.at),KINDS[l.kind], ...(l.dir||[0,-1,0]),l.cone?cos(l.cone[1]):-1,
      ...l.color.map(c=>c*l.energy*sign),l.cone?cos(l.cone[0]):-2, ...(l.b||[0,0,0]),l.half],i*16);
  });
  const table=new T.DataTexture(data,4,Math.max(1,lights.length),T.RGBAFormat,T.FloatType);table.needsUpdate=true;
  const rooms=names.map(n=>({box:spec.rooms[n],first:lights.findIndex(l=>l.room===n),lights:lights.filter(l=>l.room===n)}));
  const pad=(list,v)=>[...list,...Array.from({length:ROOMS-list.length},()=>v.clone())];
  const uniforms={
    src:{value:null},page:{value:0},range:{value:lightmap.data.range},relightLights:{value:table},
    roomCount:{value:rooms.length},roomMin:{value:pad(rooms.map(r=>new T.Vector4(...r.box[0],r.first)),new T.Vector4())},
    roomMax:{value:pad(rooms.map(r=>new T.Vector4(...r.box[1],r.lights.length)),new T.Vector4())},
    tint:{value:new T.Vector3(...spec.tint)},keepCount:{value:Math.min(KEEP,spec.keep3000.length)},
    keepMin:{value:Array.from({length:KEEP},(_,i)=>new T.Vector3(...(spec.keep3000[i]?.[0]||[0,0,0])))},
    keepMax:{value:Array.from({length:KEEP},(_,i)=>new T.Vector3(...(spec.keep3000[i]?.[1]||[0,0,0])))},
    ...lightmap.probes.uniforms
  };
  const material=new T.RawShaderMaterial({glslVersion:T.GLSL3,uniforms,vertexShader:VERTEX,fragmentShader:FRAGMENT,side:T.DoubleSide,depthTest:false,depthWrite:false});
  // Edges again as lines: the texels the triangles' borders cross are relit too, so the
  // bilinear filter never blends a relit texel with an unrelit margin.
  const edges=new T.RawShaderMaterial({glslVersion:T.GLSL3,uniforms,vertexShader:VERTEX,fragmentShader:FRAGMENT,side:T.DoubleSide,depthTest:false,depthWrite:false,wireframe:true});
  const copy=new T.Mesh(new T.PlaneGeometry(2,2),new T.RawShaderMaterial({glslVersion:T.GLSL3,uniforms:{src:uniforms.src},vertexShader:COPY_VERTEX,fragmentShader:COPY_FRAGMENT,depthTest:false,depthWrite:false}));
  copy.frustumCulled=false;
  const copyScene=new T.Scene().add(copy),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  for(const m of staticMeshes){
    if(!m.material?.userData?.bakedLit||!m.geometry.getAttribute('uv1')||m.userData.exported?.split==='propuesta')continue;
    m.updateMatrixWorld();
    for(const mat of [material,edges]){
      const proxy=new T.Mesh(m.geometry,mat);proxy.matrixAutoUpdate=false;proxy.matrix.copy(m.matrixWorld);proxy.matrixWorld.copy(m.matrixWorld);proxy.frustumCulled=false;
      scene.add(proxy);
    }
  }
  scene.matrixWorldAutoUpdate=false;

  // Every material reading the bake: lightmap.override swaps the pages of those it made,
  // and the room modules' clones (rooms.mjs cloneMaterial) share their planar-page uniform
  // but hold their own lightMap.
  const baked=new Set();for(const m of staticMeshes)if(m.material?.userData?.bakedLit)baked.add(m.material);
  const show=list=>{lightmap.override(list);for(const m of baked)m.lightMap=(list||lightmap.pages)[0];};
  let targets=[],shown=null,probesBase=null;
  function pages(){
    for(const [i,t] of lightmap.pages.entries()){
      const {width,height}=t.image;
      if(targets[i]?.width!==width||targets[i]?.height!==height){
        targets[i]?.dispose();
        targets[i]=new T.WebGLRenderTarget(width,height,{type:T.UnsignedByteType,format:T.RGBAFormat,depthBuffer:false,generateMipmaps:false,minFilter:T.LinearFilter,magFilter:T.LinearFilter});
        Object.assign(targets[i].texture,{channel:1,colorSpace:T.NoColorSpace,anisotropy:t.anisotropy});
      }
    }
    const prior=renderer.getRenderTarget(),clear=renderer.autoClear;renderer.autoClear=false;
    lightmap.pages.forEach((t,i)=>{
      renderer.setRenderTarget(targets[i]);
      uniforms.src.value=t;uniforms.page.value=i;
      renderer.render(copyScene,camera);renderer.render(scene,camera);
    });
    renderer.setRenderTarget(prior);renderer.autoClear=clear;
    show(targets.map(t=>t.texture));
    shown=lightmap.pages.map(t=>t.image);
  }
  function probes(){
    const tex=lightmap.probes.texture,base=tex.image.data,[nx,ny,nz]=[tex.image.width,tex.image.depth/6,tex.image.height];
    const {probeOrigin:{value:o},probeStep:{value:st}}=lightmap.probes.uniforms;
    const out=base.slice(),half=T.DataUtils,dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for(let j=0;j<ny;j++)for(let k=0;k<nz;k++)for(let i=0;i<nx;i++){
      const p=[o.x+i*st.x,o.y+j*st.y,o.z+k*st.z];
      if(!rooms.some(({box:[lo,hi]})=>p.every((v,c)=>v>=lo[c]-.3&&v<=hi[c]+.3)))continue;
      for(let d=0;d<6;d++){
        const at=(((d*ny+j)*nz+k)*nx+i)*4;
        const e=[0,1,2].map(c=>half.fromHalfFloat(base[at+c])*Math.PI),r=relightJS(lights,rooms,spec,e,p,dirs[d]);
        for(let c=0;c<3;c++)out[at+c]=half.toHalfFloat(Math.max(0,r[c])/Math.PI);
      }
    }
    probesBase=base;tex.image.data=out;tex.needsUpdate=true;
  }
  return {
    // Relights the night now shown (pages and probes); again only if its pages changed.
    apply(){
      if(lightmap.pages.some(t=>!t.image))return;  // not loaded yet: again once it is
      if(!shown||shown.some((img,i)=>img!==lightmap.pages[i].image))pages();
      else show(targets.map(t=>t.texture));
      if(!probesBase||lightmap.probes.texture.image.data===probesBase)probes();
    },
    // The bake as it is.
    restore(){
      show(null);
      if(probesBase&&lightmap.probes.texture.image.data!==probesBase){lightmap.probes.texture.image.data=probesBase;lightmap.probes.texture.needsUpdate=true;}
      probesBase=null;
    },
    dispose(){for(const t of targets)t.dispose();targets=[];shown=null;}
  };
}
