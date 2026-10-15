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

const S=51.53901216893343;
const P=(x,y)=>[(x-106.5)/S,(y-619.85)/S];

export async function apply(ctx){
  const {THREE,group}=ctx;
  const [cx,cz]=P(240.675,431.735),A=41.235/S,B=20.625/S;

  // --- Remove exported pieces this module replaces -------------------------------
  ctx.removeExported({material:'stone',box:[[cx-A-.08,-.1,cz-B-.08],[cx+A+.08,.7,cz+B+.08]]});
  for(const x of [217.5,263.5]){
    const [wx]=P(x,0);
    ctx.removeExported({material:'bronze',box:[[wx-.06,.84,-2.02],[wx+.06,1.25,-1.79]]});
  }

  // --- Freestanding tub -------------------------------------------------------------
  const N=160,E=2.5;   // superellipse exponent: oval with gently flattened long sides
  const outline=t=>{const c=Math.cos(t),s=Math.sin(t);return [Math.sign(c)*Math.abs(c)**(2/E),Math.sign(s)*Math.abs(s)**(2/E)];};
  // Section as (inset from the outer rim outline in metres, height). Outer wall from
  // the floor up, rolled 2.2 cm rim, then the bowl down to its flat floor.
  const H=.565;
  const profile=[
    [.115,.004],[.092,.012],[.068,.03],[.048,.06],[.032,.10],[.020,.16],[.011,.24],[.005,.33],[.0015,.43],[0,.50],[0,.535],
    [.0012,.551],[.0045,.561],[.0095,H],[.0145,H-.001],[.019,.556],[.0215,.542],
    [.023,.52],[.027,.47],[.035,.41],[.048,.35],[.066,.29],[.09,.23],[.12,.175],[.155,.13],[.195,.10],[.24,.084],[.28,.078]
  ];
  const rimIndex=13;
  const pos=[],col=[],uv=[],idx=[];
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  profile.forEach(([d,y],j)=>{
    const inner=j>rimIndex+2;
    // Rim slightly brighter than both walls so the slim lip reads as a line.
    const ao=inner?.46+.42*smooth(.08,.52,y):j>=rimIndex-2&&j<=rimIndex+2?1.04:.50+.42*smooth(0,.22,y);
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
  pos.push(cx,yb,cz);col.push(.52,.52,.52);uv.push(0,0);
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
  const resin=new THREE.MeshPhysicalMaterial({color:'#f6efe7',map:tex,vertexColors:true,roughness:.45,
    clearcoat:.15,clearcoatRoughness:.4,side:THREE.DoubleSide});
  const tub=new THREE.Mesh(geo,resin);tub.name='Banera exenta resina';
  tub.castShadow=tub.receiveShadow=true;group.add(tub);

  // Contact shadow on the floor (the tub is lit by probes, which cannot occlude).
  {
    const w=512,h=256,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
    const pad=.16,sx=w/(2*(A+pad)),sz=h/(2*(B+pad));
    const blob=(inset,blur,alpha)=>{
      g.filter=`blur(${blur}px)`;g.fillStyle=`rgba(0,0,0,${alpha})`;g.beginPath();
      for(let i=0;i<=96;i++){const [ox,oz]=outline(i/96*Math.PI*2);g.lineTo(w/2+(A-inset)*ox*sx,h/2+(B-inset)*oz*sz);}
      g.fill();
    };
    blob(.06,22,.55);blob(.10,8,.6);
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

  // --- Brushed bronze taps --------------------------------------------------------
  const bronze=new THREE.MeshStandardMaterial({color:'#cbb298',metalness:.88,roughness:.3});
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
    const m=new THREE.Mesh(new THREE.TubeGeometry(path,180,radius,20,false),bronze);m.name=name;group.add(m);
    const tip=end.clone().add(V(0,-drop,0));
    const aer=new THREE.Mesh(new THREE.CylinderGeometry(radius*1.12,radius*1.12,.018,24),bronze);aer.position.copy(tip);group.add(aer);
    return tip;
  };
  const cyl=(r,h,x,y,z,rx=0,rz=0)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,28),bronze);m.position.set(x,y,z);m.rotation.set(rx,0,rz);group.add(m);return m;};

  // Floor-standing bath mixer, near side, right end (render 5).
  {
    // Screen right is west (the view looks south). Column just off the near wall,
    // gooseneck arching over the rim into the tub.
    const u=.80,[,oz]=outline(Math.acos(u**(E/2))),bx=cx-(A*u),bz=cz-B*oz-.07,dir=V(.3,0,1).normalize();
    cyl(.042,.012,bx,.006,bz);
    gooseneck('Grifo banera exento',V(bx,.012,bz),.98,dir,.115,.06,.0165);
    cyl(.022,.12,bx,.80,bz);                                   // mixer body
    const lever=cyl(.0065,.06,bx-.03,.84,bz-.01,0,Math.PI/2-.25);lever.rotation.y=-.9;
  }
  // Vanity gooseneck mixers with a lever beside each.
  for(const x of [217.5,263.5]){
    const [wx]=P(x,0),z=-1.832;
    cyl(.026,.012,wx,.856,z);
    gooseneck('Grifo lavabo cuello cisne',V(wx,.85,z),1.14,V(0,0,-1),.075,.045,.0125);
    cyl(.017,.07,wx+.11,.885,z+.005);cyl(.006,.06,wx+.11,.92,z-.02,Math.PI/2+.35,0);
  }

  // --- Vanity mirror ----------------------------------------------------------------
  // The planar reflector (app.js) renders the whole view into a 512² target, so the
  // mirror, a third of the frame, showed ~170 px of blocky reflection. Match its target
  // to the drawing buffer (capped at 2048), and give the glass the warm bronze tint of
  // render 5.
  ctx.scene.traverse(o=>{
    if(!o.isReflector)return;
    const target=o.getRenderTarget(),size=new THREE.Vector2(),prior=o.onBeforeRender;
    // Plain multiply instead of the stock overlay blend, which bends HDR values (bright
    // lines and shirts clipped, mid-tones lifted) so the reflection never matched the room.
    o.material.uniforms.color.value.setRGB(.80,.71,.60);
    o.material.fragmentShader=o.material.fragmentShader.replace('blendOverlay( base.rgb, color )','base.rgb * color');
    o.material.needsUpdate=true;
    o.onBeforeRender=function(renderer,...rest){
      renderer.getDrawingBufferSize(size);
      const w=Math.min(2048,Math.round(size.x)),h=Math.min(2048,Math.round(size.y));
      if(target.width!==w||target.height!==h)target.setSize(w,h);
      return prior.call(this,renderer,...rest);
    };
  });

  for(const o of group.children)if(o.isMesh&&o.name!=='Banera sombra contacto')ctx.lightRuntimeObject(o,{strength:o===tub?1.25:1});
}
