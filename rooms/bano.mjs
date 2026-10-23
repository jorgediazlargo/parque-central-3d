// Room module: bano. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/bano.json).
//
// Render 5 against B01: the exported bath (a heavy elliptical bowl, light in real
// time, not baked) becomes a slender freestanding oval tub of the same 160 × 80 cm
// footprint and position (plan x=240.675, y=431.735), smooth cream resin-stone with a
// 2 cm rolled rim, a base that tucks in towards the floor and a soft contact shadow.
// Render 5 shows a floor-standing brushed-bronze bath mixer at the near right end of
// the tub: it is added there. The vanity's thin rod taps become gooseneck mixers with
// a side lever, also in brushed bronze.
// Round 6: polished brass fixtures with contact shadows, travertine vanity top (the
// kitchen's crosscut stone, baked light kept), tub lit from above its rim (the probes
// inside the old exported bowl are dark), and a mirror reflection cropped to the
// mirror's own screen box (sharp at a fraction of the cost of a full-screen pass).

const S=51.53901216893343;
const P=(x,y)=>[(x-106.5)/S,(y-619.85)/S];
const TAPS=[213,260];

export async function apply(ctx){
  const {THREE,group}=ctx;
  const [cx,cz]=P(240.675,431.735),A=41.235/S,B=20.625/S;

  // --- Remove exported pieces this module replaces -------------------------------
  ctx.removeExported({material:'stone',box:[[cx-A-.08,-.1,cz-B-.08],[cx+A+.08,.7,cz+B+.08]]});
  // C12 (proyecto de ejecución): basins centred at plan x 213 and 260, taps 2 pt off the back.
  for(const x of TAPS){
    const [wx]=P(x,0);
    ctx.removeExported({material:'bronze',box:[[wx-.06,.84,-2.22],[wx+.06,1.25,-1.99]]});
  }

  // --- Freestanding tub -------------------------------------------------------------
  const N=128,E=2.5;   // superellipse exponent: oval with gently flattened long sides
  const outline=t=>{const c=Math.cos(t),s=Math.sin(t);return [Math.sign(c)*Math.abs(c)**(2/E),Math.sign(s)*Math.abs(s)**(2/E)];};
  // Section as (inset from the outer rim outline in metres, height). Outer wall from
  // the floor up, rolled 2.2 cm rim, then the bowl down to its flat floor.
  const H=.565;
  // Round 6: a wider flat floor and steeper inner walls (the narrow trough read as a
  // bowl or a chair from the closet), and a 3.3 cm rolled rim with a flat crown.
  const profile=[
    [.115,.004],[.092,.012],[.068,.03],[.048,.06],[.032,.10],[.020,.16],[.011,.24],[.005,.33],[.0015,.43],[0,.50],[0,.535],
    [.002,.553],[.007,.563],[.014,H],[.022,H],[.029,.562],[.033,.552],
    // Bowl: an elliptical quadrant from the wall under the lip to the flat floor (round
    // 7: the tighter bend at the bottom drew a dark crease that outlined the floor like
    // a seat cut-out from the closet).
    ...Array.from({length:12},(_,k)=>{const a=k/11*Math.PI/2;return [.035+.19*(1-Math.cos(a)),.092+.438*(1-Math.sin(a))];})
  ];
  const rimIndex=14;
  const pos=[],col=[],uv=[],idx=[];
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  profile.forEach(([d,y],j)=>{
    const inner=j>rimIndex+2;
    // Rim slightly brighter than both walls so the slim lip reads as a line.
    // Round 7: more contrast between the shaded bowl and the lit crown, so from the
    // closet (near end out of frame) the far rim reads as a thin lip over a bowl.
    const ao=inner?.28+.40*smooth(.10,.52,y)-(j===rimIndex+3?.06:0):j>=rimIndex-1&&j<=rimIndex+1?1.18:j===rimIndex-2||j===rimIndex+2?1.0:.48+.30*smooth(0,.22,y);
    for(let i=0;i<N;i++){
      const t=i/N*Math.PI*2,[ox,oz]=outline(t);
      pos.push(cx+(A-d)*ox,y,cz+(B-d)*oz);col.push(ao,ao,ao);uv.push(i/N*6,y*1.6+j*.002);
    }
  });
  for(let j=0;j<profile.length-1;j++)for(let i=0;i<N;i++){
    const a=j*N+i,b=j*N+(i+1)%N,c=(j+1)*N+(i+1)%N,d=(j+1)*N+i;
    idx.push(a,d,b,b,d,c);
  }
  // Flat centre of the bowl.
  const last=(profile.length-1)*N,centre=pos.length/3,yb=profile[profile.length-1][1];
  pos.push(cx,yb,cz);col.push(.27,.27,.27);uv.push(0,0);
  for(let i=0;i<N;i++)idx.push(centre,last+i,last+(i+1)%N);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();
  // Orientation check: outward normals on the outer wall (winding may flip).
  {const n=geo.getAttribute('normal'),k=5*N;if(n.getZ(k+N/4)<0){for(let i=0;i<idx.length;i+=3){const t=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=t;}geo.setIndex(idx);geo.computeVertexNormals();}}

  // Very faint mottling: honed resin-stone, not veined travertine.
  const tex=(()=>{
    const s=256,c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d');
    g.fillStyle='rgb(240,240,240)';g.fillRect(0,0,s,s);
    let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let k=0;k<900;k++){
      const x=rnd()*s,y=rnd()*s,r=2+rnd()*14,v=228+rnd()*24|0;
      g.fillStyle=`rgba(${v},${v},${v},.10)`;
      for(const dx of [-s,0,s])for(const dy of [-s,0,s]){g.beginPath();g.arc(x+dx,y+dy,r,0,Math.PI*2);g.fill();}
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.anisotropy=8;return t;
  })();
  const resin=new THREE.MeshStandardMaterial({color:'#efe5d8',map:tex,vertexColors:true,roughness:.5,
    envMapIntensity:.7,side:THREE.DoubleSide});
  const tub=new THREE.Mesh(geo,resin);tub.name='Banera exenta resina';
  // Brass waste at the west end of the bowl's flat floor: from the closet, whose view
  // looks down into the tub, it says bath at once.
  {
    const drain=new THREE.Mesh(new THREE.CylinderGeometry(.034,.037,.006,32),new THREE.MeshPhysicalMaterial({color:'#d9c29a',metalness:1,roughness:.22,envMapIntensity:1.6}));
    drain.position.set(cx-.32,yb+.002,cz);drain.name='Banera desague';group.add(drain);
  }
  tub.castShadow=tub.receiveShadow=true;group.add(tub);

  // Contact shadow on the floor (the tub is lit by probes, which cannot occlude).
  {
    const w=512,h=256,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
    const pad=.22,sx=w/(2*(A+pad)),sz=h/(2*(B+pad));
    const blob=(inset,blur,alpha)=>{
      g.filter=`blur(${blur}px)`;g.fillStyle=`rgba(0,0,0,${alpha})`;g.beginPath();
      for(let i=0;i<=96;i++){const [ox,oz]=outline(i/96*Math.PI*2);g.lineTo(w/2+(A-inset)*ox*sx,h/2+(B-inset)*oz*sz);}
      g.fill();
    };
    blob(-.05,30,.30);blob(.02,16,.45);blob(.08,6,.55);
    const t=new THREE.CanvasTexture(c);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2*(A+pad),2*(B+pad)),
      new THREE.MeshBasicMaterial({color:0x000000,alphaMap:t,transparent:true,opacity:.8,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
    // alphaMap reads green: draw the mask as luminance.
    g.globalCompositeOperation='source-over';
    const img=g.getImageData(0,0,w,h);for(let i=0;i<img.data.length;i+=4){const a=img.data[i+3];img.data[i]=img.data[i+1]=img.data[i+2]=a;img.data[i+3]=255;}
    g.filter='none';g.putImageData(img,0,0);t.needsUpdate=true;
    shadow.rotation.x=-Math.PI/2;shadow.position.set(cx,.003,cz);shadow.renderOrder=1;shadow.name='Banera sombra contacto';
    group.add(shadow);
  }

  // Probes: the baked grid still holds the old exported bowl, whose solid walls left
  // dark probes inside the tub (a brown loop on the bowl floor). The tub samples the
  // probes from above its rim instead; the vertex colours carry its own occlusion.
  const liftProbes=m=>{
    const prior=m.onBeforeCompile,key=m.customProgramCacheKey.bind(m);
    m.onBeforeCompile=(shader,r)=>{
      prior(shader,r);
      shader.fragmentShader=shader.fragmentShader.replaceAll('probeIrradiance(lpWorld+lpNormalW*.1,','probeIrradiance(vec3(lpWorld.x,max(lpWorld.y,.78),lpWorld.z)+lpNormalW*.1,')
        .replaceAll('probeInterior(lpWorld+lpNormalW*.1)','probeInterior(vec3(lpWorld.x,max(lpWorld.y,.78),lpWorld.z)+lpNormalW*.1)');
    };
    m.customProgramCacheKey=()=>key()+'|bano-tub';
    return m;
  };

  // Soft round contact shadow (alpha in the luminance, see the tub shadow above).
  const blobTex=(()=>{
    const s=128,c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d');
    const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    gr.addColorStop(0,'#fff');gr.addColorStop(.35,'#bbb');gr.addColorStop(.7,'#333');gr.addColorStop(1,'#000');
    g.fillStyle=gr;g.fillRect(0,0,s,s);return new THREE.CanvasTexture(c);
  })();
  const shadows=[];
  const contact=(x,y,z,rx,rz,opacity,map=blobTex)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(2*rx,2*rz),new THREE.MeshBasicMaterial({color:0x000000,alphaMap:map,transparent:true,
      opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.renderOrder=1;group.add(m);shadows.push(m);return m;
  };

  // --- Polished brass taps ----------------------------------------------------------
  // Render 5: warm brass with bright, crisp highlights (the room probe reflected by a
  // near-mirror lacquer), not the matte copper of round 5.
  const bronze=new THREE.MeshPhysicalMaterial({color:'#e8d2ac',metalness:1,roughness:.12,clearcoat:1,clearcoatRoughness:.03,envMapIntensity:2.2});
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  class Arc extends THREE.Curve{
    constructor(c,dir,r){super();this.c=c;this.dir=dir;this.r=r;}
    getPoint(t,out=new THREE.Vector3()){const f=Math.PI*t;return out.copy(this.c).addScaledVector(this.dir,-this.r*Math.cos(f)).add(V(0,this.r*Math.sin(f),0));}
  }
  // Column from `base` up to `top`, a half-circle gooseneck towards `dir`, and a
  // short drop to the spout. Returns the spout end.
  const gooseneck=(name,base,top,dir,r,drop,radius)=>{
    const path=new THREE.CurvePath();
    const t0=V(base.x,top,base.z),c=t0.clone().addScaledVector(dir,r),end=t0.clone().addScaledVector(dir,2*r);
    path.add(new THREE.LineCurve3(base.clone(),t0));path.add(new Arc(c,dir,r));path.add(new THREE.LineCurve3(end,end.clone().add(V(0,-drop,0))));
    const m=new THREE.Mesh(new THREE.TubeGeometry(path,72,radius,14,false),bronze);m.name=name;group.add(m);
    const tip=end.clone().add(V(0,-drop,0));
    const aer=new THREE.Mesh(new THREE.CylinderGeometry(radius*1.15,radius*1.15,.02,18),bronze);aer.position.copy(tip);group.add(aer);
    return tip;
  };
  const cyl=(r,h,x,y,z,rx=0,rz=0,r2=r)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r2,h,24),bronze);m.position.set(x,y,z);m.rotation.set(rx,0,rz);group.add(m);return m;};

  // Floor-standing bath mixer at the near right corner of the tub, as in render 5: a
  // slender 19 mm column 1.02 m tall on a small floor rose, 10 cm off the tub's wall,
  // its gooseneck arching over the rim so the spout hangs 5 cm inside the bowl. Round 7:
  // the round-6 mixer (38 mm, 0.9 m from the camera) was huge in the bath view and
  // floated apart from the tub in the closet view; this one hugs the tub's wall.
  {
    const bx=2.10,bz=-4.10,dir=V(.6,0,.8);
    cyl(.034,.007,bx,.0035,bz,0,0,.038);cyl(.0135,.035,bx,.024,bz,0,0,.016);   // floor rose + collar
    gooseneck('Grifo banera exento',V(bx,.04,bz),.92,dir,.10,.06,.0095);
    cyl(.0155,.10,bx,.70,bz);cyl(.0105,.012,bx,.756,bz,0,0,.0155);         // mixer body + cap
    const lever=cyl(.005,.06,bx-.03,.735,bz-.02,0,Math.PI/2-.2);lever.rotation.y=.6;
    contact(bx,.0035,bz,.07,.07,.7);
  }
  // Vanity gooseneck mixers with a lever beside each, contact shadows on the stone.
  // As in render 5 the neck turns towards screen right (west) over the basin, so it
  // reads in profile from the bath instead of as a flat post seen spout-on.
  for(const x of TAPS){
    const [bx]=P(x,0),wx=bx+.05,z=-2.032,lx=bx-.13;
    cyl(.03,.012,wx,.856,z,0,0,.032);
    gooseneck('Grifo lavabo cuello cisne',V(wx,.85,z),1.15,V(-.6,0,-.8),.078,.045,.0155);
    cyl(.02,.075,lx,.8875,z+.005);cyl(.0068,.065,lx,.925,z-.022,Math.PI/2+.35,0);
    cyl(.024,.006,lx,.853,z+.005);
    contact(wx,.8505,z,.07,.05,.7);contact(lx,.8505,z+.005,.05,.04,.6);
  }

  // --- Vanity top: travertine with figure and relief -------------------------------
  // The exported top was a plain smooth stone. Render 5 has a cross-cut travertine
  // slab: the kitchen's crosscut finish (world-projected colour and relief), on the
  // same baked light (split triangles keep their lightmap UVs).
  {
    const top=ctx.splitExported({material:'stone',box:[[1.5,.59,-2.46],[3.55,.87,-1.98]]});
    const base=ctx.cloneMaterial(ctx.mats.kitchenCrosscut);base.color.set('#f4f0ea');
    // ctx.lightmap.material keeps the baked light; its program is keyed by kind-region.
    for(const piece of top)piece.material=ctx.lightmap.material(base,'crosscut','bano');
    // Shade where the slab meets the mirror: the counter stands off its reflection.
    const c=document.createElement('canvas');c.width=4;c.height=64;const g=c.getContext('2d');
    const gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,'#000');gr.addColorStop(.55,'#333');gr.addColorStop(1,'#fff');
    g.fillStyle=gr;g.fillRect(0,0,4,64);
    contact(2.522,.8503,-2.03,.97,.04,.55,new THREE.CanvasTexture(c));
  }

  // Two amber bottles right of the right-hand tap (render 5; screen right is west).
  {
    const amber=new THREE.MeshPhysicalMaterial({color:'#4a2410',roughness:.12,metalness:0,clearcoat:1,clearcoatRoughness:.05,envMapIntensity:1.4});
    const label=new THREE.MeshStandardMaterial({color:'#e9e0d0',roughness:.8});
    const cap=new THREE.MeshStandardMaterial({color:'#151210',roughness:.35,metalness:.2});
    const prof=[[0,0],[.024,0],[.026,.004],[.026,.15],[.024,.162],[.012,.172],[.011,.19]].map(([r,y])=>new THREE.Vector2(r,y));
    for(const [x,z,h] of [[1.93,-2.03,1],[1.86,-2.035,.93]]){
      const b=new THREE.Mesh(new THREE.LatheGeometry(prof,24),amber);b.scale.set(1,h,1);b.position.set(x,.85,z);group.add(b);
      const l=new THREE.Mesh(new THREE.CylinderGeometry(.0265,.0265,.07*h,24,1,true),label);l.position.set(x,.85+.085*h,z);group.add(l);
      const k=new THREE.Mesh(new THREE.CylinderGeometry(.012,.013,.03,16),cap);k.position.set(x,.85+.19*h+.015,z);group.add(k);
      const p=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.035,8),cap);p.position.set(x,.85+.19*h+.04,z);p.rotation.z=Math.PI/2.2;p.position.x-=.01;group.add(p);
      contact(x,.8505,z,.05,.05,.55);
    }
  }

  // --- Shower door: satin smoked glass in a dark frame -------------------------------
  // Round 6 critics: the clear leaf showed the shower's back wall as a flat, blown-out
  // white panel. Its own glass: a warm smoked satin body that takes half the light
  // (the shower behind is only hinted), slightly blurred room reflections at full
  // strength, and a dark bronze frame and pull. Doors are probe-lit after the modules.
  {
    const door=ctx.doors.find(d=>d.name==='Ducha suite');
    if(door){
      const glass=ctx.cloneMaterial(ctx.mats.glass);
      glass.color.set('#a39584');glass.opacity=.52;glass.roughness=.14;
      // Body shading in the leaf's own metres (box UVs are local x, y): light falling
      // off from the downlights at the top and a soft diagonal sheen across the pane.
      {
        const w=128,h=512,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
        const v=g.createLinearGradient(0,0,0,h);v.addColorStop(0,'#fff');v.addColorStop(.35,'#e2ddd6');v.addColorStop(1,'#a8a197');
        g.fillStyle=v;g.fillRect(0,0,w,h);
        g.globalCompositeOperation='lighter';g.filter='blur(14px)';
        g.fillStyle='rgba(80,75,70,.55)';g.beginPath();g.moveTo(0,h*.42);g.lineTo(w,h*.22);g.lineTo(w,h*.34);g.lineTo(0,h*.56);g.fill();
        g.fillStyle='rgba(55,52,48,.5)';g.beginPath();g.moveTo(0,h*.60);g.lineTo(w,h*.43);g.lineTo(w,h*.46);g.lineTo(0,h*.64);g.fill();
        const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
        const lw=Math.hypot(door.b[0]-door.a[0],door.b[1]-door.a[1]);
        t.repeat.set(1/lw,1/door.height);t.offset.set(.5,.5);   // box UVs are centred on the pane
        glass.map=t;
      }
      const prior=glass.onBeforeCompile;
      glass.onBeforeCompile=(shader,r)=>{
        prior.call(glass,shader,r);
        // Room reflections at full strength (the stock glass keeps 60 %).
        shader.fragmentShader=shader.fragmentShader.replace('totalSpecular*.6','totalSpecular*1.0');
      };
      glass.customProgramCacheKey=()=>'glass|bano-shower';
      const frame=ctx.cloneMaterial(ctx.mats.bronze);frame.color.set('#2a221c');frame.roughness=.38;
      for(const g of door.groups)g.traverse(o=>{
        if(!o.isMesh)return;
        if(o.material===ctx.mats.glass)o.material=glass;
        else if(o.material===ctx.mats.bronze)o.material=frame;
      });
    }
  }

  // --- Vanity mirror ----------------------------------------------------------------
  // The stock Reflector renders the whole view into its target, a full extra pass of
  // the house to fill a mirror covering a ninth of the frame (round 5 sized it to the
  // drawing buffer: 29 → 20 FPS). Here the reflected view is cropped to the mirror's
  // own screen box, so the target holds only mirror pixels, and the cropped frustum
  // culls everything the mirror cannot show.
  // The reflection is drawn 1:1 with the screen (up to 2048 a side) and multisampled ×4
  // like the main pass: at 1024 px without MSAA it was softer than the room around it
  // and stair-stepped every edge (shelf LEDs, hangers, pillows, the ceiling step). The
  // target is allocated once at the drawing-buffer size and the crop drawn into its
  // corner, so walking past the mirror does not reallocate multisampled buffers.
  ctx.scene.traverse(o=>{
    if(!o.isReflector)return;
    const target=o.getRenderTarget(),virtualCamera=o.camera,textureMatrix=o.material.uniforms.textureMatrix.value;
    target.samples=4;target.dispose();target.scissorTest=true;
    const BUDGET=1e6,clipBias=.003,size=new THREE.Vector2(),crop=new THREE.Matrix4(),pv=new THREE.Matrix4(),corner=new THREE.Vector4();
    const plane=new THREE.Plane(),normal=new THREE.Vector3(),mirrorPos=new THREE.Vector3(),camPos=new THREE.Vector3(),rot=new THREE.Matrix4();
    const look=new THREE.Vector3(),view=new THREE.Vector3(),aim=new THREE.Vector3(),clip=new THREE.Vector4(),q=new THREE.Vector4();
    o.geometry.computeBoundingBox();const bb=o.geometry.boundingBox;
    // Bronze mirror: silver behind a tinted pane. Plain multiply instead of the stock
    // overlay blend, which bends HDR values (bright lines and shirts clipped, mid-tones
    // lifted) so the reflection never matched the room. Seen obliquely the light crosses
    // more tinted glass (deeper bronze) while the front face reflects more (Schlick,
    // n = 1.5): along the wall the mirror reads as glass, not as a flat print. Square on,
    // .04 + .92 × tint keeps the calibrated (.74, .65, .55).
    o.material.uniforms.color.value.setRGB((.74-.04)/.92,(.65-.04)/.92,(.55-.04)/.92);
    o.material.vertexShader=o.material.vertexShader.replace('varying vec4 vUv;','varying vec4 vUv;varying vec3 vMirrorView,vMirrorNormal;')
      .replace('vUv = textureMatrix','vMirrorView=(modelViewMatrix*vec4(position,1.0)).xyz;vMirrorNormal=normalMatrix*vec3(0.0,0.0,1.0);\n\t\t\tvUv = textureMatrix');
    o.material.fragmentShader=o.material.fragmentShader.replace('varying vec4 vUv;',`varying vec4 vUv;varying vec3 vMirrorView,vMirrorNormal;
      vec3 mirrorTint(){
        float c=clamp(abs(dot(normalize(vMirrorView),normalize(vMirrorNormal))),0.0,1.0);
        float F=.04+.96*pow(1.0-c,5.0),ct=sqrt(1.0-(1.0-c*c)/2.25);
        return F+(1.0-F)*(1.0-F)*pow(color,vec3(1.0/ct));
      }`).replace('blendOverlay( base.rgb, color )','base.rgb*mirrorTint()');
    o.material.needsUpdate=true;
    o.onBeforeRender=function(renderer,scene,camera){
      if(o.userData.inSight&&!o.userData.inSight(camera))return;   // behind walls: keep the last reflection
      mirrorPos.setFromMatrixPosition(o.matrixWorld);camPos.setFromMatrixPosition(camera.matrixWorld);
      rot.extractRotation(o.matrixWorld);normal.set(0,0,1).applyMatrix4(rot);
      view.subVectors(mirrorPos,camPos);
      if(view.dot(normal)>0)return;
      // Mirror's screen box (NDC); the whole screen when a corner is behind the eye.
      pv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(o.matrixWorld);
      let x0=1,x1=-1,y0=1,y1=-1,behind=false;
      for(const [x,y] of [[bb.min.x,bb.min.y],[bb.max.x,bb.min.y],[bb.min.x,bb.max.y],[bb.max.x,bb.max.y]]){
        corner.set(x,y,0,1).applyMatrix4(pv);
        if(corner.w<camera.near){behind=true;break;}
        const nx=corner.x/corner.w,ny=corner.y/corner.w;x0=Math.min(x0,nx);x1=Math.max(x1,nx);y0=Math.min(y0,ny);y1=Math.max(y1,ny);
      }
      renderer.getDrawingBufferSize(size);
      const mx=4/size.x,my=4/size.y;   // 2 px margin for the bilinear taps
      if(behind){x0=y0=-1;x1=y1=1;}
      x0=Math.max(-1,x0-mx);x1=Math.min(1,x1+mx);y0=Math.max(-1,y0-my);y1=Math.min(1,y1+my);
      if(x1<=x0||y1<=y0)return;
      // The mirrored camera's image is flipped left to right (its right axis is the
      // reflection of the camera's, negated), so the box is cropped at -ox. Cropping at
      // ox (rounds 6–7) only held with the mirror centred on screen: seen from the side,
      // the part of the mirror outside the overlap sampled past the reflection (streaks).
      const sx=2/(x1-x0),sy=2/(y1-y0),ox=(x0+x1)/2,oy=(y0+y1)/2;
      crop.set(sx,0,0,sx*ox, 0,sy,0,-sy*oy, 0,0,1,0, 0,0,0,1);
      // Target at the drawing-buffer size (at most 2048 a side); the crop fills its
      // lower-left w × h at screen resolution, or at most BUDGET pixels when the mirror
      // fills the view (a second full-screen pass: 50 → 39 FPS at 1535 × 1024).
      const W=Math.min(2048,size.x),H=Math.min(2048,size.y);
      if(target.width!==W||target.height!==H)target.setSize(W,H);
      const bw=(x1-x0)/2*size.x,bh=(y1-y0)/2*size.y,k=Math.min(1,Math.sqrt(BUDGET/(bw*bh)));
      const w=Math.min(W,Math.ceil(bw*k)),h=Math.min(H,Math.ceil(bh*k));
      target.viewport.set(0,0,w,h);target.scissor.set(0,0,w,h);
      // Stock Reflector placement of the mirrored camera.
      view.reflect(normal).negate().add(mirrorPos);
      rot.extractRotation(camera.matrixWorld);
      look.set(0,0,-1).applyMatrix4(rot).add(camPos);
      aim.subVectors(mirrorPos,look).reflect(normal).negate().add(mirrorPos);
      virtualCamera.position.copy(view);virtualCamera.up.set(0,1,0).applyMatrix4(rot).reflect(normal);
      virtualCamera.lookAt(aim);virtualCamera.far=camera.far;virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.multiplyMatrices(crop,camera.projectionMatrix);
      const u=w/W,v=h/H;
      textureMatrix.set(.5*u,0,0,.5*u, 0,.5*v,0,.5*v, 0,0,.5,.5, 0,0,0,1);
      textureMatrix.multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse).multiply(o.matrixWorld);
      // Oblique near plane on the mirror (Lengyel), as the stock Reflector.
      plane.setFromNormalAndCoplanarPoint(normal,mirrorPos).applyMatrix4(virtualCamera.matrixWorldInverse);
      clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
      const e=virtualCamera.projectionMatrix.elements;
      q.set((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
      clip.multiplyScalar(2/clip.dot(q));
      e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+1-clipBias;e[14]=clip.w;
      virtualCamera.projectionMatrixInverse.copy(virtualCamera.projectionMatrix).invert();
      o.visible=false;
      const current=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),xr=renderer.xr.enabled,shadowAuto=renderer.shadowMap.autoUpdate;
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
      renderer.setRenderTarget(target);renderer.state.buffers.depth.setMask(true);
      if(renderer.autoClear===false)renderer.clear();
      renderer.render(scene,virtualCamera);
      renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadowAuto;renderer.setRenderTarget(current,face,mip);   // a cube capture's face, not face 0
      if(camera.viewport!==undefined)renderer.state.viewport(camera.viewport);
      o.visible=true;
    };
  });

  for(const o of group.children)if(o.isMesh&&!shadows.includes(o)&&o.name!=='Banera sombra contacto'&&!o.userData.exported)
    ctx.lightRuntimeObject(o,{strength:o===tub?1.0:1});
  tub.material=liftProbes(ctx.cloneMaterial(tub.material));
  {const drain=group.getObjectByName('Banera desague');drain.material=liftProbes(ctx.cloneMaterial(drain.material));}
  // Brass highlight: the room probe (128 px, soft) cannot give the crisp streaks of
  // the downlights that make the brass of render 5 read as solid metal. A virtual
  // light above and in front of the viewer adds them, scaled by the probe light.
  const lit=ctx.cloneMaterial(group.children.find(o=>o.material?.userData?.runtimeLit&&o.name==='Grifo banera exento').material);
  {
    const prior=lit.onBeforeCompile,key=lit.customProgramCacheKey.bind(lit);
    lit.onBeforeCompile=(shader,r)=>{
      prior(shader,r);
      shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`
        {vec3 hiV=inverseTransformDirection(geometryViewDir,viewMatrix),hiN=inverseTransformDirection(normal,viewMatrix);
        vec3 hiR=reflect(-hiV,hiN),hiL=normalize(vec3(0.0,1.0,0.0)+hiV*.9);
        float hi=pow(max(dot(hiR,hiL),0.0),48.0)+.25*pow(max(dot(hiR,hiL),0.0),6.0);
        reflectedLight.indirectSpecular+=material.specularColor*hi*dot(iblIrradiance,vec3(.2126,.7152,.0722))*RECIPROCAL_PI*6.0;}
        #include <aomap_fragment>`);
    };
    lit.customProgramCacheKey=()=>key()+'|bano-brass';
    for(const o of group.children)if(o.isMesh&&o.material?.userData?.runtimeLit&&o.material.color?.getHexString()===bronze.color.getHexString()&&o.material.metalness===1)o.material=lit;
  }
}
