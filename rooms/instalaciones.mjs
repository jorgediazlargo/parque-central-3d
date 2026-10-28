// Module: what the execution project installs across the whole dwelling, drawn at
// runtime and lit by the probes (no bake, no house.bin weight). Data in house.json,
// written by export_world.py from scripts/light_layout.py and scripts/instalaciones.py.
//
// - L01 Protección solar: electric roller blinds in the master bedroom (2,53), study
//   (1,29), play room and girls' bedroom (2,08), rolled up by default; one curtain wall
//   to wall across salon and dining, gathered in the four stacks of the plan; motorised
//   exterior shutters on every window, raised (guides and bottom slat in sight).
// - F06 sockets, data points, ceiling outlets and wall devices, F05 switch banks, F04
//   extract fans and outlets, F03 grilles (supply 0,89 m, return 0,50 m: in the
//   ceiling, in a riser of a raised ceiling or high on a wall) and Airzone thermostats.
// - Terrace (F05): its wall lights and soffit points are exported fixtures; at night
//   they throw soft pools on the walls and floor (the terrace is not baked).

export async function apply(ctx){
  const {THREE,data,group}=ctx;
  const sun=data.sunProtection,inst=data.installations;
  // I02 Schock sinks (granite composite in the worktop's colour): the bake leaves the
  // deep bowls nearly black, so they take the probes' light with the stone's finish.
  for(const box of [[[8.64,.70,-.82],[9.26,.905,-.40]],[[15.66,.70,-.775],[16.20,.897,-.305]]]){
    for(const piece of ctx.splitExported({material:'kitchenStone',box})){
      piece.material=ctx.cloneMaterial(ctx.mats.kitchenStone);delete piece.material.userData.bakedLit;
      piece.geometry.deleteAttribute('uv1');ctx.lightRuntimeObject(piece);
    }
  }
  // J03-J04 vanity tops of the aseo (C14, 158 × 40) and the secondary bath (C13, 110 × 45):
  // «porcelánico/mármol a elegir», so until it is chosen top, basin, faldon and free end
  // take the same plain honed warm white as the master bath's J04 (rooms/bano.mjs), not
  // the kitchen's quartzite. Same triangles and baked light.
  {
    const base=ctx.cloneMaterial(ctx.mats.white);base.color.set('#e3dcd1');base.roughness=.5;
    for(const box of [[[17.77,.74,-4.78],[18.30,.905,-3.58]],[[15.07,.74,-3.70],[16.75,.905,-3.20]]])
      for(const piece of ctx.splitExported({material:'stone',box}))piece.material=ctx.lightmap.material(base,'neutralTop','aseos');
  }
  // Door reveals over the export's jamb posts, which z-fought with the plaster reveal (a
  // jagged frame): two oak jambs as G02-G03 draw them (no head piece: the leaf reaches the
  // false ceiling), painted at the entrance (`finish`, export_world.py).
  {
    const parts={wood:[],wall:[]},DEPTH=.124,W=.03;
    for(const {corners:[a,b],finish='wood'} of data.jambs||[]){
      const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),tx=dx/L,tz=dz/L,yaw=Math.atan2(tx,tz),top=a[2];
      const put=(along,w,y0,y1)=>{const g=new THREE.BoxGeometry(DEPTH,y1-y0,w);g.rotateY(yaw);g.translate(a[0]+tx*along,(y0+y1)/2,a[1]+tz*along);parts[finish].push(g);};
      put(W/2-.002,W,0,top);put(L-W/2+.002,W,0,top);
    }
    for(const [finish,name] of [['wood','Jambas de roble'],['wall','Jambas pintadas']]){
      if(!parts[finish].length)continue;
      const m=new THREE.Mesh(merge(THREE,parts[finish]),ctx.cloneMaterial(ctx.mats[finish]));m.name=name;group.add(m);ctx.lightRuntimeObject(m);
    }
  }
  const plastic=new THREE.MeshStandardMaterial({color:'#f1efea',roughness:.32});
  const metal=new THREE.MeshStandardMaterial({color:'#e7e3da',roughness:.4,metalness:.3});
  const dark=new THREE.MeshStandardMaterial({color:'#2b2a27',roughness:.6});

  // --- Blinds and curtain (L01) --------------------------------------------------------
  const fabric=new THREE.MeshStandardMaterial({color:'#e9e3d8',roughness:1,side:THREE.DoubleSide});
  fabric.userData.translucency=.25;
  for(const b of sun.blinds){
    // On the window wall, under the bedroom ceiling (2,55), down to the 10 cm upstand.
    ctx.addBlind({name:'Estor · '+b.label,fabric,metal,x0:b.x0,x1:b.x1,z:b.z+.06,top:2.55,bottom:.10,t:1});
  }
  {
    const c=sun.curtain,cloth=ctx.cloneMaterial(ctx.mats.curtain);
    cloth.color.set('#ece5d9').multiplyScalar(.74);cloth.opacity=.86;cloth.userData.translucency=.2;
    // Each stack parks one leaf (the end stacks) or two (the piers): leaves meet midway
    // across each window when drawn.
    const packs=c.packs,leaves=[],mid=(a,b)=>(a+b)/2;
    for(let k=0;k<packs.length;k++){
      const [p0,p1]=packs[k],centre=k===0?p0:k===packs.length-1?p1:mid(p0,p1);
      const half=k===0||k===packs.length-1?p1-p0:(p1-p0)/2;
      if(k>0){const meet=mid(packs[k-1][1],p0);leaves.push({anchor:centre,dir:-1,open:half,closed:centre-meet});}
      if(k<packs.length-1){const meet=mid(p1,packs[k+1][0]);leaves.push({anchor:centre,dir:1,open:half,closed:meet-centre});}
    }
    ctx.addCurtain({name:'Cortina · salón y comedor',material:cloth,z:c.z+.055,y0:.035,y1:2.28,pitch:.13,depth:.03,seed:23,t:1,panels:leaves});
  }
  // Exterior shutters, raised: two guides over the opening's height and the bottom slat
  // right under its head (windows 0.90-2.40, balconeras 0.10-2.30).
  {
    const parts=[];
    for(const s of sun.shutters){
      const w=s.x1-s.x0,z=s.z-.03,sill=s.sill??.10,head=s.head??2.30;
      for(const x of [s.x0+.012,s.x1-.012])parts.push(box(THREE,.024,head-sill,.04,x,(head+sill)/2,z));
      parts.push(box(THREE,w-.024,.05,.012,(s.x0+s.x1)/2,head-.025,z));
    }
    const m=new THREE.Mesh(merge(THREE,parts),ctx.cloneMaterial(ctx.mats.ral9001||metal));m.name='Persianas exteriores';
    group.add(m);ctx.lightRuntimeObject(m);
  }

  // --- Sockets, switches, thermostats ------------------------------------------------------
  const plates=[],insets=[],holes=[],screens=[];
  // A plate of size w x h x d on the wall at `at` (x, z), centre height y.
  const onWall=(list,{at,normal},y,w,h,d,du=0)=>{
    const [nx,nz]=normal,g=new THREE.BoxGeometry(w,h,d);
    const yaw=Math.atan2(nx,nz);g.rotateY(yaw);
    g.translate(at[0]+nx*d/2-nz*du,y,at[1]+nz*d/2+nx*du);list.push(g);
  };
  for(const s of inst.sockets){
    onWall(plates,s,s.y,.082,.082,.009);
    onWall(insets,{at:s.at.map((v,i)=>v+s.normal[i]*.009),normal:s.normal},s.y,.05,.05,.004);
    for(const du of [-.0095,.0095])onWall(holes,{at:s.at.map((v,i)=>v+s.normal[i]*.013),normal:s.normal},s.y,.0048,.0048,.0006,du);
  }
  for(const s of inst.switches){
    const w=.082+.071*(s.gangs-1);
    onWall(plates,s,s.y,w,.082,.009);
    for(let i=0;i<s.gangs;i++)onWall(insets,{at:s.at.map((v,k)=>v+s.normal[k]*.009),normal:s.normal},s.y,.056,.056,.005,(i-(s.gangs-1)/2)*.071);
  }
  for(const t of inst.thermostats){
    onWall(plates,t,t.y,.09,.09,.016);
    onWall(screens,{at:t.at.map((v,i)=>v+t.normal[i]*.016),normal:t.normal},t.y+.008,.052,.04,.0008);
  }
  // F06 data points (RJ45 plate) and wall devices: panel, entry phone, buzzer, router, repeater.
  for(const d of inst.data||[]){
    onWall(plates,d,d.y,.082,.082,.009);
    onWall(holes,{at:d.at.map((v,i)=>v+d.normal[i]*.009),normal:d.normal},d.y,.016,.012,.0008);
  }
  for(const d of inst.devices||[]){
    const deep={cuadro:.012,router:.035,videoportero:.02}[d.name]||.015;
    onWall(plates,d,d.y,d.w,d.h,deep);
    const face={at:d.at.map((v,i)=>v+d.normal[i]*deep),normal:d.normal};
    if(d.name==='cuadro')onWall(holes,face,d.y-d.h/2+.03,.05,.004,.0008);           // finger pull
    if(d.name==='videoportero')onWall(screens,face,d.y+.03,.09,.07,.0008);
    if(d.name==='router')onWall(screens,face,d.y,d.w-.02,d.h-.02,.0008);
  }
  // F06 ceiling outlets for a screen and F04 ceiling extract fans: round plates.
  const disc=(list,x,y,z,r,t)=>{const g=new THREE.CylinderGeometry(r,r,t,32);g.translate(x,y-t/2,z);list.push(g);};
  for(const [x,z,h] of inst.ceilingPoints||[])disc(plates,x,h,z,.045,.008);
  for(const [x,z,h] of inst.fans||[]){disc(plates,x,h,z,.085,.012);disc(holes,x,h-.012,z,.055,.001);}
  // F04: the kitchen's extract grille in the riser of the island coffer, and the
  // carbon-filter outlet in the island plinth.
  if(inst.riserFan){const f=inst.riserFan;onWall(plates,f,f.y,.16,.16,.008);
    for(let i=0;i<5;i++)onWall(holes,{at:f.at.map((v,k)=>v+f.normal[k]*.008),normal:f.normal},f.y-.05+i*.025,.12,.007,.0008);}
  if(inst.plinthOutlet){const [x,z]=inst.plinthOutlet,o={at:[x,z+.003],normal:[0,1]};
    for(let i=0;i<4;i++)onWall(holes,o,.025+i*.02,.21,.009,.002);}
  const add=(list,mat,name)=>{if(!list.length)return;const m=new THREE.Mesh(merge(THREE,list),mat);m.name=name;group.add(m);ctx.lightRuntimeObject(m);};
  add(plates,plastic,'Mecanismos placas');add(insets,plastic,'Mecanismos teclas');add(holes,dark,'Mecanismos tomas');add(screens,dark,'Termostatos pantalla');

  // --- Linear grilles (F03) ------------------------------------------------------------
  {
    const frames=[],slots=[];
    for(const g of inst.grilles){
      const len=g.length||(g.kind==='supply'?.89:.50),H=.10,[ax,az]=g.a,[bx,bz]=g.b;
      const cx=(ax+bx)/2,cz=(az+bz)/2,alongX=Math.abs(bx-ax)>=Math.abs(bz-az);
      if(g.where==='ceiling'){
        const f=box(THREE,alongX?len:H,.006,alongX?H:len,cx,g.y-.003,cz);frames.push(f);
        for(let i=0;i<5;i++){const o=(i-2)*.016;slots.push(box(THREE,alongX?len-.03:.007,.002,alongX?.007:len-.03,cx+(alongX?0:o),g.y-.0065,cz+(alongX?o:0)));}
      }else{
        const [nx,nz]=g.normal,yaw=Math.atan2(nx,nz);
        const put=(w,h,d,off,dy=0)=>{const q=new THREE.BoxGeometry(w,h,d);q.rotateY(yaw);q.translate(cx+nx*off,g.y+dy,cz+nz*off);return q;};
        frames.push(put(len,H,.006,.003));
        for(let i=0;i<5;i++)slots.push(put(len-.03,.007,.002,.0065,(i-2)*.016));
      }
    }
    add(frames,metal,'Rejillas climatización');add(slots,dark,'Rejillas climatización lamas');
  }

  // --- Terrace at night ------------------------------------------------------------------
  // Additive pools: a warm wash up and down the wall round each wall light, and a pool
  // on the floor under each soffit point. Off by day.
  {
    const pool=radial(THREE),warm=new THREE.Color(1,.78,.56);
    const mat=k=>new THREE.MeshBasicMaterial({map:pool,color:warm.clone().multiplyScalar(k),transparent:true,depthWrite:false,
      blending:THREE.AdditiveBlending,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
    const night=new THREE.Group();night.name='Terraza luz nocturna';
    for(const s of data.terraceLights.sconces){
      const [nx,nz]=s.normal,q=new THREE.Mesh(new THREE.PlaneGeometry(1.5,2.4),mat(1.6));
      q.rotation.y=Math.atan2(nx,nz);q.position.set(s.at[0]+nx*.004,s.y+.08,s.at[1]+nz*.004);night.add(q);
      const f=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),mat(.6));f.rotation.x=-Math.PI/2;
      f.position.set(s.at[0]+nx*.6,-.006,s.at[1]+nz*.6);night.add(f);
    }
    for(const [x,z] of data.terraceLights.points){
      const f=new THREE.Mesh(new THREE.PlaneGeometry(2.6,2.6),mat(.9));f.rotation.x=-Math.PI/2;f.position.set(x,-.006,z);night.add(f);
    }
    group.add(night);
    ctx.onTimeOfDay(n=>{night.visible=n;});
  }
  console.info(`[rooms/instalaciones] ${sun.blinds.length} blinds, curtain, ${sun.shutters.length} shutters, ${inst.sockets.length} sockets, ${inst.switches.length} switch banks, ${inst.grilles.length} grilles`);
}

function box(THREE,w,h,d,x,y,z){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);return g;}

// Concatenates indexed geometries (position, normal, uv).
function merge(THREE,list){
  const out={position:[],normal:[],uv:[]},idx=[];let base=0;
  for(const g of list){
    for(const n of Object.keys(out))out[n].push(...g.getAttribute(n).array);
    for(const i of g.index.array)idx.push(i+base);
    base+=g.getAttribute('position').count;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(out.position,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(out.normal,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(out.uv,2));
  geo.setIndex(idx);geo.computeBoundingSphere();return geo;
}

// Soft radial falloff (1 at the centre, 0 at the rim) for the light pools.
function radial(THREE){
  const N=128,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
  const gr=g.createRadialGradient(N/2,N/2,0,N/2,N/2,N/2);
  for(const [t,a] of [[0,1],[.25,.62],[.5,.28],[.75,.08],[1,0]])gr.addColorStop(t,`rgba(255,255,255,${a})`);
  g.fillStyle=gr;g.fillRect(0,0,N,N);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
