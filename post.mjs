import * as THREE from './assets/three.module.js';

// HDR post-processing after one multisampled scene render:
//  1. contact occlusion: scalable ambient obscurance (SAO) from the resolved depth at
//     half resolution, small radius, two depth-aware blur passes. The bake carries the
//     room-scale shading; this only adds the contact darkening its texels are too coarse
//     for (feet, plinths, cushions, props added at runtime);
//  2. metering: centre-weighted log-average luminance of a 64² copy (mipmapped to 1 texel);
//  3. adaptation: a 1×1 target eases the exposure toward the metered value, only part of
//     the way, so dark rooms stay darker than bright ones (as in a photograph);
//  4. bloom: soft-knee threshold at half resolution, five-level dual-filter blur;
//  5. one full-screen composite: occlusion, exposure, bloom, tone mapping
//     (renderer.toneMapping), sRGB, then white balance, saturation, a gentle S-curve,
//     vignette and fine animated grain in display space.
const quadVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';

export class Post{
  constructor(renderer,scene,camera,{bloom=.12,threshold=1.1,knee=.7,key=.26,adapt=.45,minExposure=.55,maxExposure=2.6,base=.5,grain=.018,vignette=.30,
    white=[1.05,1,.92],saturation=1.12,contrast=.42,ao=1,aoRadius=.30,aoBias=.03,aoIntensity=3.2}={}){
    Object.assign(this,{renderer,scene,camera});
    this.settings={bloom,threshold,knee,key,adapt,minExposure,maxExposure,base,grain,vignette,white,saturation,contrast,ao,aoRadius,aoBias,aoIntensity};
    const half={type:THREE.HalfFloatType,depthBuffer:false,generateMipmaps:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter};
    this.sceneRT=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
    // The multisampled depth is resolved into this texture after each scene render.
    this.sceneRT.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.aoRT=[0,1].map(()=>new THREE.WebGLRenderTarget(1,1,half));
    this.lumRT=new THREE.WebGLRenderTarget(64,64,{...half,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
    this.expRT=[0,1].map(()=>new THREE.WebGLRenderTarget(1,1,{...half,type:THREE.FloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter}));
    this.mips=Array.from({length:5},()=>new THREE.WebGLRenderTarget(1,1,half));
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));this.quad.frustumCulled=false;
    this.quadScene=new THREE.Scene();this.quadScene.add(this.quad);this.quadCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const mat=(fragmentShader,uniforms,extra={})=>new THREE.ShaderMaterial({uniforms,vertexShader:quadVertex,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false,...extra});
    const viewPos=`uniform sampler2D depthTex;uniform mat4 projInv;
      vec3 viewPos(vec2 uv){float d=texture2D(depthTex,uv).r;vec4 v=projInv*vec4(uv*2.0-1.0,d*2.0-1.0,1.0);return v.xyz/v.w;}`;
    // SAO: 16 samples on a rotated spiral within aoRadius metres; normal from depth.
    // Output r = visibility (1 = open), g = view depth (for the bilateral blur).
    this.aoMat=mat(`${viewPos}uniform vec2 texel,projScale;uniform float radius,bias,intensity;varying vec2 vUv;
      void main(){
        float d=texture2D(depthTex,vUv).r;
        if(d>=1.0){gl_FragColor=vec4(1.0,1e4,0.0,1.0);return;}
        vec3 p=viewPos(vUv);
        vec3 px=viewPos(vUv+vec2(texel.x,0.0)),nx=viewPos(vUv-vec2(texel.x,0.0));
        vec3 py=viewPos(vUv+vec2(0.0,texel.y)),ny=viewPos(vUv-vec2(0.0,texel.y));
        vec3 dx=abs(px.z-p.z)<abs(nx.z-p.z)?px-p:p-nx,dy=abs(py.z-p.z)<abs(ny.z-p.z)?py-p:p-ny;
        vec3 n=normalize(cross(dx,dy));
        float noise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
        vec2 ssR=projScale*radius/max(-p.z,.05);
        float occ=0.0;
        for(int i=0;i<16;i++){
          float a=(float(i)+.5)/16.0;float ang=a*43.98+noise*6.2832;
          vec2 off=vec2(cos(ang),sin(ang))*a*ssR;
          vec3 v=viewPos(vUv+off)-p;float vv=dot(v,v);
          float f=max(radius*radius-vv,0.0)/(radius*radius);
          occ+=f*max(dot(v,n)/sqrt(vv+1e-4)-bias,0.0);
        }
        gl_FragColor=vec4(clamp(1.0-occ/16.0*intensity,0.0,1.0),-p.z,0.0,1.0);
      }`,{depthTex:{value:null},projInv:{value:new THREE.Matrix4()},texel:{value:new THREE.Vector2()},projScale:{value:new THREE.Vector2()},radius:{value:aoRadius},bias:{value:aoBias},intensity:{value:aoIntensity}});
    this.aoBlur=mat(`uniform sampler2D src;uniform vec2 dir;varying vec2 vUv;
      void main(){
        vec2 c=texture2D(src,vUv).rg;float sum=c.r,w=1.0;
        for(int i=-4;i<=4;i++){
          if(i==0)continue;
          vec2 s=texture2D(src,vUv+dir*float(i)).rg;
          float k=exp(-float(i*i)/18.0)*exp(-abs(s.g-c.g)/(.04*c.g+.01));
          sum+=s.r*k;w+=k;
        }
        gl_FragColor=vec4(sum/w,c.g,0.0,1.0);
      }`,{src:{value:null},dir:{value:new THREE.Vector2()}});
    this.meter=mat(`uniform sampler2D src;varying vec2 vUv;
      void main(){
        vec3 c=texture2D(src,vUv).rgb;float l=max(dot(c,vec3(.2126,.7152,.0722)),1e-4);
        vec2 d=(vUv-.5)*vec2(1.3,1.0);float w=exp(-dot(d,d)*5.0);
        gl_FragColor=vec4(w*log(l),w,0.0,1.0);
      }`,{src:{value:null}});
    this.adaptMat=mat(`uniform sampler2D lum,prev;uniform float rate,key,strength,lo,hi,first;varying vec2 vUv;
      void main(){
        vec4 m=textureLod(lum,vec2(.5),8.0);float avg=exp(m.x/max(m.y,1e-6));
        float target=clamp(pow(key/avg,strength),lo,hi);
        float p=texture2D(prev,vec2(.5)).r;
        gl_FragColor=vec4(first>.5?target:mix(p,target,rate),0.0,0.0,1.0);
      }`,{lum:{value:null},prev:{value:null},rate:{value:1},key:{value:key},strength:{value:adapt},lo:{value:minExposure},hi:{value:maxExposure},first:{value:1}});
    this.prefilter=mat(`uniform sampler2D src,exposure;uniform float threshold,knee;uniform vec2 texel;varying vec2 vUv;
      void main(){
        vec3 c=(texture2D(src,vUv+texel*vec2(-.5,-.5)).rgb+texture2D(src,vUv+texel*vec2(.5,-.5)).rgb
          +texture2D(src,vUv+texel*vec2(-.5,.5)).rgb+texture2D(src,vUv+texel*vec2(.5,.5)).rgb)*.25*texture2D(exposure,vec2(.5)).r;
        float b=max(max(c.r,c.g),c.b);float s=clamp(b-threshold+knee,0.0,2.0*knee);s=s*s/(4.0*knee+1e-4);
        gl_FragColor=vec4(min(c*max(s,b-threshold)/max(b,1e-4),vec3(64.0)),1.0);
      }`,{src:{value:null},exposure:{value:null},threshold:{value:threshold},knee:{value:knee},texel:{value:new THREE.Vector2()}});
    this.down=mat(`uniform sampler2D src;uniform vec2 texel;varying vec2 vUv;
      void main(){
        vec3 c=texture2D(src,vUv).rgb*4.0;
        c+=texture2D(src,vUv+texel*vec2(-1.0,-1.0)).rgb+texture2D(src,vUv+texel*vec2(1.0,-1.0)).rgb
          +texture2D(src,vUv+texel*vec2(-1.0,1.0)).rgb+texture2D(src,vUv+texel*vec2(1.0,1.0)).rgb;
        gl_FragColor=vec4(c/8.0,1.0);
      }`,{src:{value:null},texel:{value:new THREE.Vector2()}});
    this.up=mat(`uniform sampler2D src;uniform vec2 texel;varying vec2 vUv;
      void main(){
        vec3 c=(texture2D(src,vUv+texel*vec2(-1.0,0.0)).rgb+texture2D(src,vUv+texel*vec2(1.0,0.0)).rgb
          +texture2D(src,vUv+texel*vec2(0.0,-1.0)).rgb+texture2D(src,vUv+texel*vec2(0.0,1.0)).rgb)*2.0
          +texture2D(src,vUv+texel*vec2(-1.0,-1.0)).rgb+texture2D(src,vUv+texel*vec2(1.0,-1.0)).rgb
          +texture2D(src,vUv+texel*vec2(-1.0,1.0)).rgb+texture2D(src,vUv+texel*vec2(1.0,1.0)).rgb;
        gl_FragColor=vec4(c/12.0,1.0);
      }`,{src:{value:null},texel:{value:new THREE.Vector2()}},{blending:THREE.AdditiveBlending,transparent:true});
    this.final=new THREE.ShaderMaterial({
      uniforms:{src:{value:null},bloomTex:{value:null},aoTex:{value:null},exposure:{value:null},bloom:{value:bloom},base:{value:base},grain:{value:grain},vignette:{value:vignette},
        time:{value:0},resolution:{value:new THREE.Vector2()},white:{value:new THREE.Vector3(...white)},saturation:{value:saturation},contrast:{value:contrast},aoStrength:{value:ao},showAO:{value:0}},
      vertexShader:quadVertex,depthTest:false,depthWrite:false,
      fragmentShader:`uniform sampler2D src,bloomTex,aoTex,exposure;uniform float bloom,base,grain,vignette,time,saturation,contrast,aoStrength,showAO;uniform vec2 resolution;uniform vec3 white;varying vec2 vUv;
        float grainHash(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p.yx+19.19);return fract((p.x+p.y)*p.x);}
        void main(){
          float e=texture2D(exposure,vec2(.5)).r*base;
          float ao=mix(1.0,texture2D(aoTex,vUv).r,aoStrength);
          vec3 c=texture2D(src,vUv).rgb*ao*e*white+texture2D(bloomTex,vUv).rgb*bloom;
          gl_FragColor=vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // Saturation and a gentle S-curve around mid grey (blacks stay black).
          vec3 d=gl_FragColor.rgb;
          float dl=dot(d,vec3(.2126,.7152,.0722));d=max(mix(vec3(dl),d,saturation),0.0);
          d=clamp(d,0.0,1.0);d=mix(d,d*d*(3.0-2.0*d),contrast);
          vec2 v=vUv-.5;d*=1.0-dot(v,v)*vignette;
          float n=grainHash(floor(vUv*resolution)+fract(time*7.31)*vec2(97.0,61.0))-.5;
          d+=n*grain*(1.0-d*.6);
          gl_FragColor=vec4(clamp(d,0.0,1.0),1.0);
          if(showAO>.5)gl_FragColor=vec4(vec3(texture2D(aoTex,vUv).r),1.0);
        }`
    });
    this.first=true;this.frame=0;this.time=0;
  }
  setSize(w,h){
    this.sceneRT.setSize(w,h);
    for(const t of this.aoRT)t.setSize(Math.max(1,w>>1),Math.max(1,h>>1));
    let mw=Math.max(1,w>>1),mh=Math.max(1,h>>1);
    for(const m of this.mips){m.setSize(mw,mh);mw=Math.max(1,mw>>1);mh=Math.max(1,mh>>1);}
    this.final.uniforms.resolution.value.set(w,h);
  }
  pass(material,target){
    this.quad.material=material;this.renderer.setRenderTarget(target);this.renderer.render(this.quadScene,this.quadCam);
  }
  render(dt=1/60){
    const r=this.renderer,s=this.settings;
    r.setRenderTarget(this.sceneRT);r.render(this.scene,this.camera);
    const src=this.sceneRT.texture;
    // Contact occlusion (half resolution).
    const [aoA,aoB]=this.aoRT,ao=this.aoMat.uniforms,P=this.camera.projectionMatrix.elements;
    ao.depthTex.value=this.sceneRT.depthTexture;ao.projInv.value.copy(this.camera.projectionMatrixInverse);
    ao.texel.value.set(1/aoA.width,1/aoA.height);ao.projScale.value.set(P[0]*.5,P[5]*.5);ao.radius.value=s.aoRadius;ao.bias.value=s.aoBias;ao.intensity.value=s.aoIntensity;
    this.pass(this.aoMat,aoA);
    const b=this.aoBlur.uniforms;
    b.src.value=aoA.texture;b.dir.value.set(1/aoA.width,0);this.pass(this.aoBlur,aoB);
    b.src.value=aoB.texture;b.dir.value.set(0,1/aoA.height);this.pass(this.aoBlur,aoA);
    // Metering every frame is cheap (64²); adaptation eases over ~1.5 s.
    this.meter.uniforms.src.value=src;this.pass(this.meter,this.lumRT);
    const [prev,next]=this.frame%2?[this.expRT[1],this.expRT[0]]:[this.expRT[0],this.expRT[1]];this.frame++;
    const a=this.adaptMat.uniforms;a.lum.value=this.lumRT.texture;a.prev.value=prev.texture;a.rate.value=1-Math.exp(-dt*2.2);a.first.value=this.first?1:0;
    a.key.value=s.key;a.strength.value=s.adapt;a.lo.value=s.minExposure;a.hi.value=s.maxExposure;
    this.pass(this.adaptMat,next);this.first=false;
    // Bloom chain.
    const p=this.prefilter.uniforms;p.src.value=src;p.exposure.value=next.texture;p.threshold.value=s.threshold;p.knee.value=s.knee;
    p.texel.value.set(1/this.sceneRT.width,1/this.sceneRT.height);this.pass(this.prefilter,this.mips[0]);
    for(let i=1;i<this.mips.length;i++){
      const u=this.down.uniforms;u.src.value=this.mips[i-1].texture;u.texel.value.set(1/this.mips[i-1].width,1/this.mips[i-1].height);this.pass(this.down,this.mips[i]);
    }
    for(let i=this.mips.length-1;i>0;i--){
      const u=this.up.uniforms;u.src.value=this.mips[i].texture;u.texel.value.set(1/this.mips[i].width,1/this.mips[i].height);this.pass(this.up,this.mips[i-1]);
    }
    this.time+=dt;
    const f=this.final.uniforms;f.src.value=src;f.bloomTex.value=this.mips[0].texture;f.aoTex.value=aoA.texture;f.exposure.value=next.texture;
    f.bloom.value=s.bloom/this.mips.length;f.base.value=s.base;f.grain.value=s.grain;f.vignette.value=s.vignette;f.time.value=this.time;
    f.white.value.set(...s.white);f.saturation.value=s.saturation;f.contrast.value=s.contrast;f.aoStrength.value=s.ao;f.showAO.value=s.showAO?1:0;
    this.pass(this.final,null);
  }
}
