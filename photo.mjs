// Modo foto: path tracing in the browser while the camera stands still.
//
// While the mode is on and the camera has not moved for STILL ms, the view is computed
// with three-gpu-pathtracer (assets/pathtracer.js: 0.0.24 with three-mesh-bvh 0.9.14,
// MIT, bundled against this three r180; downloaded only the first time the mode is
// used) and the samples accumulate; any movement goes back to the normal render at once.
// The traced HDR image goes through the same post-processing as the tour (post.mjs:
// exposure, bloom, tone mapping, grade), without its contact occlusion (the tracer has
// real contact shadows) and without grain.
//
// The tracer sees no lightmap and none of the shader patches of app.js, so it gets its
// own copy of the scene (buildScene) with plain physical materials: the H01 porcelain
// (floor) and H03 wall porcelain get world UVs and a tile texture with their joints; the
// H03 lime paint and white plastic paint are split per triangle with cal-mask.png; glass
// transmits, mirrors are polished metal; the terrace photograph glows (it is what the
// windows show). The light is the bake's own (addLights, assets/photo-lights.json):
// sun, world and window softboxes by day, the F05 fittings when the lamps are on and at
// night, with the powers Cycles gets.
//
// Interior light converges slowly, so the image is denoised with the tour's render of
// the same view as a guide (denoise): sharp and clean within ~16 samples, and the
// filter fades out over thousands, leaving the plain trace.

const STILL=1000;                                  // ms without movement before tracing
const VIEW_GLOW=.7;                                // the terrace photograph seen through the windows
const FACADE_Z=-8.6;                               // window glass beyond this is left out: the window softboxes light through it
const OPT=new URLSearchParams(location.search);
const num=(k,d)=>OPT.has(k)&&!isNaN(+OPT.get(k))?+OPT.get(k):d;
const FILTER=num('fotofiltro',1),FILTER_FULL=num('fotofiltrocompleto',256),FILTER_UNTIL=num('fotofiltrohasta',4096);
const PAINT='#f2efea',LIME='#e0d3c8';              // H03 / H04 (app.js wall shader)
const JOINT=.002;                                  // H01 joints, metres

// Porcelain rects of the floor shader (app.js 'floor'): oak inside these, porcelain out.
const OAK=[[-2.0,-12.0,5.113,-5.896],[13.019,-12.0,20.0,-4.799],[15.008,-5.0,16.774,-3.664],[5.084,-3.674,7.295,1.0],[4.783,-2.791,5.113,1.0]];
const CLOSET=[[5.084,-3.674,7.295,1.0],[4.783,-2.791,5.113,1.0]];   // porcelain with the vestidor option
const inRect=(x,z,r)=>x>=r[0]&&x<=r[2]&&z>=r[1]&&z<=r[3];
// K01-K02 mirrors (light_layout.MIRRORS) widened by 4 cm, as light_layout.mirror_led: x0, x1, z0, z1, y0, y1.
const MIRROR_LEDS=[[15.078,16.74,-3.678,-3.598,1.06,2.0],[18.21,18.29,-4.777,-3.596,1.06,2.0],[5.54,6.55,-3.67,-3.59,.11,2.04]];

export function photoSupported(renderer,mobile){
  return !mobile&&renderer.capabilities.isWebGL2&&!!renderer.extensions.get('EXT_color_buffer_float')&&renderer.capabilities.maxTextureSize>=8192;
}

export function createPhotoMode(THREE,ctx){
  const {renderer,scene,camera,composer,mobile,onStatus=()=>{}}=ctx;
  const supported=photoSupported(renderer,mobile);
  let active=false,lib=null,tracer=null,photoScene=null,builtFor=null,building=null,lastMove=performance.now(),tracing=false,start=0,cleanAt=0;
  const lastView=new Float32Array(32);
  let status='';
  const say=s=>{if(s!==status){status=s;onStatus(s);}};

  function moved(){
    const a=camera.matrixWorld.elements,b=camera.projectionMatrix.elements;let changed=false;
    for(let i=0;i<16;i++){if(Math.abs(a[i]-lastView[i])>1e-5||Math.abs(b[i]-lastView[16+i])>1e-5)changed=true;lastView[i]=a[i];lastView[16+i]=b[i];}
    return changed;
  }

  // --- Textures ---------------------------------------------------------------------
  // The porcelain image is one 1.20 m piece with its darker band (app.js): a copy with
  // the H01 joints drawn on its edges and along the band, and the H03 wall version (the
  // square part only, joints on its edges).
  function tileTexture(image,{crop=0,lines}){
    const w=image.width,h=image.height,c=document.createElement('canvas');
    const sx=Math.round(crop*w),sy=Math.round(crop*h);c.width=w-sx;c.height=h-sy;
    const g=c.getContext('2d');g.drawImage(image,sx,sy,w-sx,h-sy,0,0,c.width,c.height);
    const px=Math.max(1,JOINT/1.2*c.width);g.fillStyle='rgba(60,52,44,.42)';
    for(const t of lines){const x=t*c.width;g.fillRect(x-px/2,0,px,c.height);g.fillRect(0,x-px/2,c.width,px);}
    g.fillRect(c.width-px/2,0,px,c.height);g.fillRect(0,c.height-px/2,c.width,px);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.anisotropy=8;return tex;
  }
  function maskReader(){
    const t=ctx.limeMask.value,box=ctx.limeBox.value;if(!t?.image)return ()=>0;
    const im=t.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;
    const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);const px=g.getImageData(0,0,c.width,c.height).data;
    return (x,z)=>{const u=(x-box.x)/(box.z-box.x),v=(z-box.y)/(box.w-box.y);if(u<0||u>1||v<0||v>1)return 0;
      const i=(Math.min(c.height-1,Math.floor(v*c.height))*c.width+Math.min(c.width-1,Math.floor(u*c.width)))*4;return px[i]/255;};
  }

  // --- Geometry -----------------------------------------------------------------------
  // World-space, non-interleaved, non-indexed copy of the triangles that pass `keep`
  // (centroid, normal), with position, normal and uv (uvOf(p, n) or the source's).
  const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_n=new THREE.Vector3(),_m=new THREE.Vector3(),_t=new THREE.Vector3();
  function worldTriangles(o,{keep=null,uvOf=null}={}){
    const g=o.geometry,pos=g.attributes.position,nor=g.attributes.normal,uv=g.attributes.uv,idx=g.index;
    const n=idx?idx.count:pos.count,P=[],N=[],U=[];
    const nm=new THREE.Matrix3().getNormalMatrix(o.matrixWorld),vi=k=>idx?idx.getX(k):k;
    for(let k=0;k+2<n;k+=3){
      const i0=vi(k),i1=vi(k+1),i2=vi(k+2);
      _a.fromBufferAttribute(pos,i0).applyMatrix4(o.matrixWorld);_b.fromBufferAttribute(pos,i1).applyMatrix4(o.matrixWorld);_c.fromBufferAttribute(pos,i2).applyMatrix4(o.matrixWorld);
      _n.subVectors(_c,_b).cross(_t.subVectors(_a,_b)).normalize();
      if(keep){_m.copy(_a).add(_b).add(_c).divideScalar(3);if(!keep(_m,_n))continue;}
      for(const [i,p] of [[i0,_a],[i1,_b],[i2,_c]]){
        P.push(p.x,p.y,p.z);
        if(nor){_t.fromBufferAttribute(nor,i).applyMatrix3(nm).normalize();N.push(_t.x,_t.y,_t.z);}else N.push(_n.x,_n.y,_n.z);
        if(uvOf){const [u,v]=uvOf(p,_n);U.push(u,v);}else if(uv)U.push(uv.getX(i),uv.getY(i));else U.push(0,0);
      }
    }
    if(!P.length)return null;
    const out=new THREE.BufferGeometry();
    out.setAttribute('position',new THREE.Float32BufferAttribute(P,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));out.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
    return out;
  }

  // --- Materials ----------------------------------------------------------------------
  const cache=new Map();
  function physical(m){
    if(cache.has(m))return cache.get(m);
    const out=new THREE.MeshPhysicalMaterial({side:m.side});
    for(const k of ['color','emissive'])if(m[k]?.isColor)out[k].copy(m[k]);
    for(const k of ['map','roughnessMap','metalnessMap','normalMap','emissiveMap','alphaMap'])if(m[k]?.isTexture&&m[k].image)out[k]=m[k];
    for(const k of ['roughness','metalness','emissiveIntensity','opacity','sheen','sheenRoughness','transmission','ior','thickness'])if(typeof m[k]==='number')out[k]=m[k];
    if(m.sheenColor?.isColor)out.sheenColor.copy(m.sheenColor);
    if(m.normalScale)out.normalScale.copy(m.normalScale);
    out.transparent=m.transparent&&m.opacity<.99;
    // Cloth maps are grey detail around 0.5 in the tour's shader: kept as relief only.
    if(m.sheen>0)out.map=null;
    // F05 fittings (LED strips, downlights) by day: off, a pale diffuser. As emitters
    // found only by chance they were bright speckles that took minutes to settle (phase 2
    // turns them into real lights for the night).
    if(out.emissiveIntensity>0&&(out.emissive.r+out.emissive.g+out.emissive.b)>0){out.color.copy(out.emissive).lerp(new THREE.Color(1,1,1),.6);out.emissive.set(0);out.emissiveMap=null;}
    cache.set(m,out);return out;
  }
  const special={};
  function materials(){
    if(special.glass)return special;
    special.glass=new THREE.MeshPhysicalMaterial({color:'#f6f3ee',roughness:0,metalness:0,transmission:1,ior:1.5,thickness:.01,side:THREE.DoubleSide});
    special.mirror=new THREE.MeshPhysicalMaterial({color:'#dcdcd8',roughness:.015,metalness:1});
    special.bronzeMirror=new THREE.MeshPhysicalMaterial({color:new THREE.Color(.74,.65,.55),roughness:.015,metalness:1});
    special.paint=new THREE.MeshPhysicalMaterial({color:PAINT,roughness:.9});
    special.lime=new THREE.MeshPhysicalMaterial({color:LIME,roughness:.92});
    const img=ctx.porcelainMap.value?.image;
    special.porcelain=new THREE.MeshPhysicalMaterial({color:new THREE.Color(.96,.96,.96),roughness:.82,map:img?tileTexture(img,{lines:[.196]}):null});
    special.wallTile=new THREE.MeshPhysicalMaterial({color:new THREE.Color(.96,.96,.96),roughness:.72,map:img?tileTexture(img,{crop:.196,lines:[]}):null});
    return special;
  }

  function hidden(o){for(let n=o;n;n=n.parent)if(!n.visible)return true;return false;}
  function buildScene(){
    const out=new THREE.Scene(),S=materials(),lime=maskReader(),closet=ctx.vestidorStone.value>0;
    const add=(geo,mat)=>{if(geo)out.add(new THREE.Mesh(geo,mat));};
    scene.updateMatrixWorld(true);
    scene.traverse(o=>{
      if(!o.isMesh||hidden(o))return;
      const m=Array.isArray(o.material)?o.material[0]:o.material,kind=o.userData.exported?.material;
      if(o.isReflector){if(!o.userData.mirror)add(worldTriangles(o),S.bronzeMirror);return;}   // vanity; C01-C03 are the exported panes
      if(m.isShaderMaterial||m.isPointsMaterial||m.isLineBasicMaterial)return;
      if(m.isMeshBasicMaterial){
        // The terrace photograph glows; the sky dome and the contact shadows stay out.
        if(m.map&&m.vertexColors){
          const glow=new THREE.MeshPhysicalMaterial({color:0,emissive:'#ffffff',emissiveMap:m.map,emissiveIntensity:VIEW_GLOW,side:THREE.DoubleSide});
          add(worldTriangles(o),glow);
        }
        return;
      }
      if(kind==='led'){
        // As the bake (bake_probes.led_strength): ceiling lines, diffusers and the terrace
        // fittings have their own lights (or none by day); the K02 mirror strips emit
        // 220 W/m² and the shelf and cabinet strips 1500 W/m² (shelf strips from their bottom
        // face, the vertical ones all round), which light the wardrobe interiors. Radiance = W/m² / π. Off when the lamps are.
        const on=ctx.night()||ctx.lamps(),mirrorLed=p=>MIRROR_LEDS.some(b=>p.x>b[0]&&p.x<b[1]&&p.z>b[2]&&p.z<b[3]&&p.y>b[4]&&p.y<b[5]);
        const quiet=p=>p.y>2.15||p.z<-8.7&&p.x>4.3&&p.x<14.4||(ctx.data.wallLights||[]).some(w=>Math.hypot(p.x-w.at[0],p.z-w.at[1])<.15&&Math.abs(p.y-w.y)<.15);
        const cls=(p,n)=>!on||quiet(p)?0:mirrorLed(p)?1:n.y<.5?2:0;   // vertical strips emit from every side, shelf strips downwards (led_direction)
        add(worldTriangles(o,{keep:(p,n)=>cls(p,n)===0}),physical(m));
        add(worldTriangles(o,{keep:(p,n)=>cls(p,n)===1}),new THREE.MeshPhysicalMaterial({color:0,emissive:'#fff1dc',emissiveIntensity:220/Math.PI}));
        add(worldTriangles(o,{keep:(p,n)=>cls(p,n)===2}),new THREE.MeshPhysicalMaterial({color:0,emissive:'#ffd6ad',emissiveIntensity:1500/Math.PI}));
        return;
      }
      if(kind==='glass'||m.customProgramCacheKey?.()==='glass'){add(worldTriangles(o,{keep:p=>p.z>FACADE_Z}),S.glass);return;}
      if(kind==='mirror'||m===ctx.mats.mirror){add(worldTriangles(o),S.mirror);return;}
      if(kind==='floor'){
        const porcelain=(p)=>!OAK.some(r=>inRect(p.x,p.z,r))||closet&&CLOSET.some(r=>inRect(p.x,p.z,r));
        add(worldTriangles(o,{keep:(p,n)=>!(n.y>.5&&porcelain(p))}),physical(m));
        add(worldTriangles(o,{keep:(p,n)=>n.y>.5&&porcelain(p),uvOf:p=>{const x=p.x-14.086,z=p.z+.218,k=.70710678/1.2;return [(x+z)*k+.098,(x-z)*k+.098];}}),S.porcelain);
        return;
      }
      if(kind==='wallTile'){
        add(worldTriangles(o,{uvOf:(p,n)=>{const ax=Math.abs(n.x),az=Math.abs(n.z),ay=Math.abs(n.y);
          const at=ay>.5?[p.x,p.z]:ax>az?[p.z,p.y]:[p.x,p.y];return [at[0]/1.2+.13,at[1]/1.2];}}),S.wallTile);
        return;
      }
      if(kind==='wall'||m===ctx.mats.wall){
        // H03 lime where the plan marks it (sampled 1 cm in front of the face), else paint.
        const isLime=(p,n)=>Math.abs(n.y)<.5&&lime(p.x+n.x*.01,p.z+n.z*.01)>.5;
        add(worldTriangles(o,{keep:(p,n)=>isLime(p,n)}),S.lime);
        add(worldTriangles(o,{keep:(p,n)=>!isLime(p,n)}),S.paint);
        return;
      }
      add(worldTriangles(o),physical(m));
    });
    addLights(out);
    return out;
  }

  // The bake's lights (assets/photo-lights.json, scripts/photo_lights.py from F05): by day
  // the sun, the world and the window softboxes, plus the lamps when they are on; at night
  // the lamps and a faint world. Same powers as Cycles: an area light of E watts and area
  // A has radiance E / (A·π), the sun 14 W/m², a sphere light P/(4π) W/sr. The tracer
  // never shows area lights to the camera: the windows show the terrace photograph and
  // the fittings their own (unlit) surface.
  function addLights(out){
    const L=lights,night=ctx.night(),lamps=night||ctx.lamps();
    const world=night?L.world.night:L.world.day,c=new THREE.Color(...world.color);
    const sky=new lib.GradientEquirectTexture(64);sky.topColor.copy(c);sky.bottomColor.copy(c);sky.update();
    out.environment=sky;out.environmentIntensity=world.strength;out.background=sky;out.backgroundIntensity=world.strength;
    if(!night){
      const sun=new THREE.DirectionalLight(new THREE.Color(...L.sun.color),L.sun.strength),t=new THREE.Vector3(...L.sun.travel);
      sun.position.set(9,1.2,-6).addScaledVector(t,-60);sun.target.position.set(9,1.2,-6);out.add(sun,sun.target);
    }
    // Ceiling height above a plan point, for the recessed fittings (as bake_house ceiling_at).
    const rc=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0),meshes=out.children.filter(o=>o.isMesh);
    const ceiling=(x,z)=>{rc.set(new THREE.Vector3(x,1.4,z),up);rc.far=3;const h=rc.intersectObjects(meshes,false)[0];return h?h.point.y:2.5;};
    const z=new THREE.Vector3(),x=new THREE.Vector3(),y=new THREE.Vector3();
    for(const r of [...(night?[]:L.day),...(lamps?L.lamps:[])]){
      const pos=new THREE.Vector3(...r.pos),target=new THREE.Vector3(...r.target);
      if(r.belowCeiling!==undefined){const h=ceiling(pos.x,pos.z)-r.belowCeiling;target.y+=h-pos.y;pos.y=h;}
      if(r.maxBelowCeiling!==undefined){const h=Math.min(pos.y,ceiling(pos.x,pos.z)-r.maxBelowCeiling);target.y+=h-pos.y;pos.y=h;}
      const [w,h]=r.size,l=new THREE.RectAreaLight(new THREE.Color(...r.color),r.energy/(w*h*Math.PI),w,h);
      l.position.copy(pos);
      if(r.axis){
        // Local X (the width) along the line, -Z toward the target, as bake_house area(axis).
        z.subVectors(pos,target).normalize();x.set(...r.axis);x.addScaledVector(z,-x.dot(z)).normalize();y.crossVectors(z,x);
        l.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
      }else l.lookAt(target);
      out.add(l);
    }
    if(lamps)for(const p of L.pendants){
      const l=new THREE.PointLight(new THREE.Color(...p.color),p.power/(4*Math.PI),0,2);l.position.set(...p.pos);l.radius=p.radius;out.add(l);
    }
  }

  let lights=null;
  async function ensureBuilt(){
    const key=ctx.signature();
    if(photoScene&&builtFor===key)return true;
    if(building)return false;
    building=(async()=>{
      say('Preparando la foto…');
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));   // let the notice show
      const t0=performance.now();
      lib??=await import('./assets/pathtracer.js?v=21f4139213');
      lights??=await fetch('./assets/photo-lights.json?v=9160ada16a').then(r=>{if(!r.ok)throw Error('photo-lights.json');return r.json();});
      if(!tracer){
        tracer=new lib.WebGLPathTracer(renderer);
        Object.assign(tracer,{renderToCanvas:false,renderDelay:0,minSamples:1,fadeDuration:0,dynamicLowRes:false,rasterizeScene:false,
          bounces:num('fotorebotes',4),transmissiveBounces:4,filterGlossyFactor:.5,renderScale:num('fotoescala',.5)});
        const t=num('fototeselas',1);tracer.tiles.set(t,t);tracer.textureSize.set(num('fototextura',1024),num('fototextura',1024));
      }
      const s=buildScene();
      tracer.setScene(s,camera);
      photoScene=s;builtFor=key;ctx.onBuilt?.(performance.now()-t0);
    })().catch(e=>{console.error(e);say('El modo foto no ha podido arrancar en este equipo.');active=false;}).finally(()=>{building=null;});
    return false;
  }

  // Denoising guided by the tour's own render of the same view (the last raster frame,
  // drawn before the camera stood still: composer.sceneRT, colour and depth). The trace
  // is divided by that image (what is left is mostly light), the ratio is smoothed with
  // an edge-aware à-trous filter (steps 1-2-4-8, stopping at depth and colour edges of
  // the guide), and multiplied back: textures and edges stay as sharp as the tour at full
  // resolution while the noise of the light goes. A firefly clamp runs first. The filter
  // fades out as samples add up, so a long exposure ends up as the plain trace.
  let dn=null;
  const quadVS='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  const LIN=`uniform sampler2D depthTex;uniform float near,far;
    float lin(vec2 uv){float d=texture2D(depthTex,uv).r;return near*far/(far-d*(far-near));}
    float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}`;
  function setupDenoise(){
    const opts={type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter};
    const mat=(fs,uniforms)=>new THREE.ShaderMaterial({uniforms,vertexShader:quadVS,fragmentShader:fs,depthTest:false,depthWrite:false});
    dn={rt:[0,1,2].map(()=>new THREE.WebGLRenderTarget(1,1,opts)),scene:new THREE.Scene(),cam:new THREE.OrthographicCamera(-1,1,1,-1,0,1)};
    dn.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));dn.quad.frustumCulled=false;dn.scene.add(dn.quad);
    // Ratio trace / guide, the trace clamped to 4x the mean of its 3x3 neighbours.
    dn.ratio=mat(`uniform sampler2D trace,guide;uniform vec2 traceTexel;varying vec2 vUv;
      float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
      void main(){
        vec3 c=texture2D(trace,vUv).rgb,m=vec3(0.0);
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)if(x!=0||y!=0)m+=texture2D(trace,vUv+vec2(x,y)*traceTexel).rgb;
        m/=8.0;float l=lum(c),lim=4.0*lum(m)+1e-4;if(l>lim)c*=lim/l;
        vec3 g=texture2D(guide,vUv).rgb;
        gl_FragColor=vec4(c/(g+vec3(.02)),1.0);}`,{trace:{value:null},guide:{value:null},traceTexel:{value:new THREE.Vector2()}});
    dn.atrous=mat(`${LIN}uniform sampler2D src,guide;uniform vec2 texel;uniform float stepPx,sigmaG,sigmaZ;varying vec2 vUv;
      const float K[3]=float[3](.375,.25,.0625);
      void main(){
        vec3 g0=texture2D(guide,vUv).rgb;float l0=log(lum(g0)+.01),z0=lin(vUv);
        vec3 sum=vec3(0.0);float wsum=0.0;
        for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
          vec2 uv=vUv+vec2(x,y)*texel*stepPx;
          float lg=log(lum(texture2D(guide,uv).rgb)+.01),z=lin(uv);
          float w=K[abs(x)]*K[abs(y)]*exp(-pow(lg-l0,2.0)/sigmaG-pow((z-z0)/(z0*sigmaZ),2.0));
          sum+=texture2D(src,uv).rgb*w;wsum+=w;}
        gl_FragColor=vec4(sum/max(wsum,1e-5),1.0);}`,{src:{value:null},guide:{value:null},depthTex:{value:null},near:{value:.05},far:{value:100},
        texel:{value:new THREE.Vector2()},stepPx:{value:1},sigmaG:{value:.1},sigmaZ:{value:.03}});
    // Mean of the ratio (64² copy, mipmapped to one texel): the trace is scaled by its
    // inverse per channel, so the photograph keeps the overall level and white balance of
    // the tour (its auto exposure only adapts part of the way) and the trace decides how
    // the light is spread.
    dn.mean=new THREE.WebGLRenderTarget(64,64,{type:THREE.HalfFloatType,depthBuffer:false,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
    dn.copy=mat(`uniform sampler2D src;varying vec2 vUv;void main(){gl_FragColor=vec4(clamp(texture2D(src,vUv).rgb,0.0,8.0),1.0);}`,{src:{value:null}});
    dn.compose=mat(`uniform sampler2D ratio,guide,trace,mean;uniform float strength;varying vec2 vUv;
      void main(){vec3 g=texture2D(guide,vUv).rgb,gain=1.0/max(textureLod(mean,vec2(.5),6.0).rgb,vec3(1e-3));
        vec3 f=texture2D(ratio,vUv).rgb*(g+vec3(.02));
        gl_FragColor=vec4(mix(texture2D(trace,vUv).rgb,f,strength)*gain,1.0);}`,{ratio:{value:null},guide:{value:null},trace:{value:null},mean:{value:null},strength:{value:1}});
  }
  function pass(material,target){dn.quad.material=material;renderer.setRenderTarget(target);renderer.render(dn.scene,dn.cam);}
  function denoise(n){
    const src=tracer.target,guideRT=composer.sceneRT;
    const strength=!FILTER?0:n<=FILTER_FULL?1:Math.max(0,1-Math.log2(n/FILTER_FULL)/Math.log2(FILTER_UNTIL/FILTER_FULL));
    if(strength<=0)return src.texture;
    if(!dn)setupDenoise();
    const W=guideRT.width,H=guideRT.height;
    for(const rt of dn.rt)if(rt.width!==W||rt.height!==H)rt.setSize(W,H);
    const prior=renderer.getRenderTarget(),[a,b,c]=dn.rt;
    const r=dn.ratio.uniforms;r.trace.value=src.texture;r.guide.value=guideRT.texture;r.traceTexel.value.set(1/src.width,1/src.height);pass(dn.ratio,a);
    const u=dn.atrous.uniforms;u.guide.value=guideRT.texture;u.depthTex.value=guideRT.depthTexture;u.near.value=camera.near;u.far.value=camera.far;
    u.texel.value.set(1/W,1/H);u.sigmaG.value=.08+.4*strength;
    let from=a,to=b;
    for(const step of [1,2,4,8,16]){u.src.value=from.texture;u.stepPx.value=step;pass(dn.atrous,to);[from,to]=[to,from];}
    dn.copy.uniforms.src.value=from.texture;pass(dn.copy,dn.mean);
    const k=dn.compose.uniforms;k.mean.value=dn.mean.texture;k.ratio.value=from.texture;k.guide.value=guideRT.texture;k.trace.value=src.texture;k.strength.value=strength;
    pass(dn.compose,c);
    renderer.setRenderTarget(prior);
    return c.texture;
  }

  return {
    supported,
    get active(){return active;},
    get samples(){return tracer&&tracing?tracer.samples:0;},
    get tracing(){return tracing;},
    set(on){
      active=on&&supported;tracing=false;
      if(on&&!supported)say('El modo foto necesita un ordenador con GPU compatible (no disponible en móvil).');
      else say(on?'Modo foto: quédate quieto para calcular':'');
    },
    // Called every frame before the normal render; true when it drew the frame itself.
    frame(dt){
      if(!active)return false;
      const now=performance.now();
      if(moved()){lastMove=now;if(tracing){tracing=false;say('Modo foto: quédate quieto para calcular');}return false;}
      if(now-lastMove<STILL)return false;
      if(!tracing){
        if(!photoScene||builtFor!==ctx.signature()){ensureBuilt();return false;}
        tracer.updateCamera();tracer.reset();tracing=true;start=now;cleanAt=0;
      }
      tracer.renderSample();
      if(tracer.samples<1)return false;
      const n=Math.floor(tracer.samples);
      const g=composer.settings.grain;composer.settings.grain=0;composer.render(dt,denoise(n));composer.settings.grain=g;
      if(!cleanAt&&n>=ctx.cleanSamples)cleanAt=now;
      say(`Modo foto · ${n} muestras${cleanAt?' · lista':''} · G guarda PNG`);
      return true;
    },
    timing(){return {start,cleanAt,samples:tracer?.samples||0};},
    // Seconds-free accessor for tests: forces a trace from the current pose.
    get ready(){return !!photoScene&&!building;}
  };
}
