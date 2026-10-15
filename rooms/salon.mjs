// Room module: salon. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/salon.json).
//
// Ronda 5: the exported L sofa and the two armchairs read as soft foam blobs. They are
// rebuilt here as tailored upholstery on the same B01 footprints: modular frames, loose
// box cushions (seat and back) with crowned tops, bellied sides and piped seams, knife-
// edge throw pillows, contact darkening baked into vertex colours and a crisp contact
// shadow on the floor. The exported plinth and the armchair legs stay (baked light).

// Seeded value noise, smooth enough for fabric pulls.
function noise2(seed){
  const h=(x,y)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,2147483647)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  return (x,y)=>{
    const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v-.5;
  };
}

// Rounded rectangle outline in plan (x, z), corners of radius rc.
function rrect(x0,z0,x1,z1,rc=.045,step=.07,seg=5){
  const pts=[],cs=[[x1-rc,z1-rc,0],[x0+rc,z1-rc,Math.PI/2],[x0+rc,z0+rc,Math.PI],[x1-rc,z0+rc,Math.PI*1.5]];
  for(let c=0;c<4;c++){
    const [cx,cz,a0]=cs[c];
    for(let k=0;k<=seg;k++){const a=a0+k/seg*Math.PI/2;pts.push([cx+rc*Math.cos(a),cz+rc*Math.sin(a)]);}
    const [nx,nz]=cs[(c+1)%4],a1=a0+Math.PI/2,ex=cx+rc*Math.cos(a1),ez=cz+rc*Math.sin(a1);
    const tx=nx+rc*Math.cos(a1),tz=nz+rc*Math.sin(a1),len=Math.hypot(tx-ex,tz-ez),n=Math.max(1,Math.round(len/step));
    for(let k=1;k<n;k++)pts.push([ex+(tx-ex)*k/n,ez+(tz-ez)*k/n]);
  }
  return {outline:pts,corners:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]};
}

// Geometry builder that collects parts into one indexed mesh (position, normal, uv, color).
class Builder{
  constructor(THREE){this.THREE=THREE;this.pos=[];this.nor=[];this.uv=[];this.col=[];this.idx=[];}
  add(geo,shade=1){
    const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),u=geo.getAttribute('uv'),c=geo.getAttribute('color'),base=this.pos.length/3;
    for(let i=0;i<p.count;i++){
      this.pos.push(p.getX(i),p.getY(i),p.getZ(i));this.nor.push(n.getX(i),n.getY(i),n.getZ(i));
      this.uv.push(u?u.getX(i):0,u?u.getY(i):0);
      if(c)this.col.push(c.getX(i)*shade,c.getY(i)*shade,c.getZ(i)*shade);else this.col.push(shade,shade,shade);
    }
    const index=geo.index;
    if(index)for(let i=0;i<index.count;i++)this.idx.push(base+index.getX(i));
    else for(let i=0;i<p.count;i++)this.idx.push(base+i);
  }
  build(){
    const T=this.THREE,g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(this.nor,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(this.uv,2));g.setAttribute('color',new T.Float32BufferAttribute(this.col,3));
    g.setIndex(this.pos.length/3>65535?new T.Uint32BufferAttribute(this.idx,1):new T.Uint16BufferAttribute(this.idx,1));
    g.computeBoundingSphere();return g;
  }
}

// Upholstered slab on a plan outline: rounded edges of radius r, crowned top (convex
// outlines), sides bellied between the seams and pinched at the corners, small pulls
// where the top panel is sewn to the piping. Contacts darken the cloth near touching
// surfaces ({axis, at, k, fall}), standing in for the occlusion the probes cannot resolve.
// Returns the geometry and the two piping loops (top and bottom seams).
function slab(T,{outline,corners=[],y0,y1,r=.03,crown=0,bulge=0,lean=null,wrinkle=.0025,seed=1,contacts=[],bottom=true,flatCap=false}){
  let pts=outline.map(p=>[...p]);
  let area=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];area+=a[0]*b[1]-b[0]*a[1];}
  if(area<0)pts.reverse();
  const n=pts.length,nor=[],L=[0],w=[];
  for(let i=0;i<n;i++){
    const a=pts[(i-1+n)%n],b=pts[i],c=pts[(i+1)%n];
    const e1=[b[0]-a[0],b[1]-a[1]],e2=[c[0]-b[0],c[1]-b[1]],l1=Math.hypot(...e1)||1,l2=Math.hypot(...e2)||1;
    let nx=e1[1]/l1+e2[1]/l2,nz=-e1[0]/l1-e2[0]/l2;const l=Math.hypot(nx,nz)||1;nor.push([nx/l,nz/l]);
    if(i)L.push(L[i-1]+Math.hypot(b[0]-a[0],b[1]-a[1]));
    const dc=corners.length?Math.min(...corners.map(q=>Math.hypot(b[0]-q[0],b[1]-q[1]))):1;
    const t=Math.min(1,Math.max(0,(dc-.04)/.22));w.push(t*t*(3-2*t));
  }
  const per=L[n-1]+Math.hypot(pts[0][0]-pts[n-1][0],pts[0][1]-pts[n-1][1]);
  const C=pts.reduce((s,p)=>[s[0]+p[0]/n,s[1]+p[1]/n],[0,0]);
  const nz=noise2(seed),ym=(y0+y1)/2,hs=Math.max(1e-3,(y1-y0)/2-r);
  const shear=y=>lean?[(y-y0)*lean[0],(y-y0)*lean[1]]:[0,0];
  // Point of outline vertex i at profile angle phi (0 top, pi bottom).
  const ring=(i,phi)=>{
    const [px,pz]=pts[i],[nx,nzz]=nor[i],q=[px-nx*r,pz-nzz*r];let off,y;
    if(phi<=Math.PI/2){off=r*Math.sin(phi);y=y1-r+r*Math.cos(phi);}
    else if(phi>=Math.PI/2+1){const a=phi-1;off=r*Math.sin(a);y=y0+r+r*Math.cos(a);}
    else{const t=phi-Math.PI/2;off=r;y=y1-r-t*(y1-y0-2*r);}
    off+=bulge*w[i]*Math.max(0,1-((y-ym)/hs)**2)*(1+.25*nz(L[i]*6,seed));
    const s=shear(y);return [q[0]+nx*off+s[0],y,q[1]+nzz*off+s[1]];
  };
  const out=[];
  const finish=(pos,uv,index,flip)=>{
    if(flip)for(let i=0;i<index.length;i+=3){const t=index[i+1];index[i+1]=index[i+2];index[i+2]=t;}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();
    const col=[];
    for(let i=0;i<pos.length;i+=3){
      let ao=1;const p=[pos[i],pos[i+1],pos[i+2]];
      for(const c of contacts){const d=Math.abs(p['xyz'.indexOf(c.axis)]-c.at);ao*=1-(c.k??.45)*Math.exp(-d/(c.fall??.03));}
      col.push(ao,ao,ao);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(col,3));out.push(g);
  };
  // Cap (top or bottom): rings toward the centre (or a flat triangulated cap), then
  // the rounded edge up to the seam at 45°.
  const arcPhis=top=>top?[.27,.53,Math.PI/4]:[Math.PI+1-.27,Math.PI+1-.53,Math.PI+1-Math.PI/4];
  const cap=(top)=>{
    const pos=[],uv=[],index=[],y=top?y1:y0;let prev;
    if(flatCap){
      const sh=shear(y),inner=pts.map((p,i)=>[p[0]-nor[i][0]*r+sh[0],p[1]-nor[i][1]*r+sh[1]]);
      const tri=T.ShapeUtils.triangulateShape(inner.map(p=>new T.Vector2(p[0],p[1])),[]);
      for(const p of inner){pos.push(p[0],y,p[1]);uv.push(p[0],p[1]);}
      for(const t of tri)index.push(...t);
      prev=0;
    }else{
      // Crown, then pulls where the panel is sewn to the piping.
      const sh=shear(y);pos.push(C[0]+sh[0],y+(top?crown:0),C[1]+sh[1]);uv.push(C[0],C[1]);prev=-1;
      for(const s of [.2,.42,.62,.78,.89,.96,1]){
        const start=pos.length/3;
        for(let i=0;i<n;i++){
          const q=[pts[i][0]-nor[i][0]*r,pts[i][1]-nor[i][1]*r];let yy=y;
          if(top){
            yy+=crown*(1-s**4)*(.6+.4*Math.sqrt(w[i]));
            const e=Math.max(0,(s-.8)/.2);yy-=wrinkle*4*e*(1-e)*(.55+.45*Math.sin(L[i]*55+nz(L[i]*4,3)*6))*w[i];
            yy+=.0025*nz(q[0]*7+s,q[1]*7)*s*(1-s**6);
          }
          const x=C[0]+(q[0]-C[0])*s+sh[0],z=C[1]+(q[1]-C[1])*s+sh[1];pos.push(x,yy,z);uv.push(x,z);
        }
        for(let i=0;i<n;i++){
          if(prev<0)index.push(0,start+i,start+(i+1)%n);
          else{const a=prev+i,b=prev+(i+1)%n,c=start+i,d=start+(i+1)%n;index.push(a,c,b,b,c,d);}
        }
        prev=start;
      }
    }
    for(const phi of arcPhis(top)){
      const start=pos.length/3;
      for(let i=0;i<n;i++){const p=ring(i,phi);pos.push(...p);uv.push(p[0],p[2]);}
      for(let i=0;i<n;i++){const a=prev+i,b=prev+(i+1)%n,c=start+i,d=start+(i+1)%n;index.push(a,c,b,b,c,d);}
      prev=start;
    }
    finishCheck(pos,uv,index,top);
  };
  const finishCheck=(pos,uv,index,top)=>{
    // Orientation: the cap must face up (top) or down (bottom).
    let s=0;for(let i=0;i<index.length;i+=3){
      const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3;
      const ux=pos[b]-pos[a],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vz=pos[c+2]-pos[a+2];s+=uz*vx-ux*vz;
    }
    finish(pos,uv,index,top?s<0:s>0);
  };
  cap(true);
  // Boxing strip between the seams: uv along the perimeter.
  {
    const pos=[],uv=[],index=[],phis=[];
    for(let k=0;k<=2;k++)phis.push(Math.PI/4+k/2*Math.PI/4);
    for(let k=1;k<=4;k++)phis.push(Math.PI/2+k/5);
    for(let k=0;k<=2;k++)phis.push(Math.PI/2+1+k/2*Math.PI/4);
    for(const [row,phi] of phis.entries()){
      for(let i=0;i<=n;i++){const p=ring(i%n,phi);pos.push(...p);uv.push(i<n?L[i]:per,p[1]);}
      if(row){const a0=(row-1)*(n+1),b0=row*(n+1);for(let i=0;i<n;i++)index.push(a0+i,b0+i,a0+i+1,a0+i+1,b0+i,b0+i+1);}
    }
    // Outward: compare with the outline normal of the first column.
    const a=index,p=pos;
    const ux=p[a[1]*3]-p[a[0]*3],uy=p[a[1]*3+1]-p[a[0]*3+1],uz=p[a[1]*3+2]-p[a[0]*3+2];
    const vx=p[a[2]*3]-p[a[0]*3],vy=p[a[2]*3+1]-p[a[0]*3+1],vz=p[a[2]*3+2]-p[a[0]*3+2];
    const cx=uy*vz-uz*vy,cz=ux*vy-uy*vx;
    finish(pos,uv,index,cx*nor[0][0]+cz*nor[0][1]<0);
  }
  if(bottom)cap(false);
  const loop=(phi)=>{const l=[];for(let i=0;i<n;i++)l.push(ring(i,phi));return l;};
  return {parts:out,pipes:[loop(Math.PI/4),loop(Math.PI/2+1+Math.PI/4)]};
}

// Piping cord along a closed loop of points.
function piping(T,points,radius=.0045){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),true,'centripetal');
  const len=curve.getLength(),seg=Math.max(24,Math.round(len/.022));
  const g=new T.TubeGeometry(curve,seg,radius,5,true),uv=g.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*len,uv.getY(i)*radius*6.3);
  return g;
}

// Knife-edge throw pillow (after bedding.mjs): pinched outline, full belly, corner pulls.
function pillow(T,W,H,Th,seed){
  const n=noise2(seed),nu=20,nv=20,parts=[];
  const rim=(u,v)=>[u*W/2*(1-.08*(1-v*v)),v*H/2*(1-.08*(1-u*u))];
  for(const side of [1,-1]){
    const pos=[],uv=[],index=[];
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
      const u=-1+2*i/nu,v=-1+2*j/nv,[x,y]=rim(u,v),edge=Math.max(Math.abs(u),Math.abs(v)),ang=Math.atan2(v,u);
      let t=Th/2*Math.pow(Math.max(0,1-Math.abs(u)**3),.45)*Math.pow(Math.max(0,1-Math.abs(v)**3),.45);
      t*=(1+.10*(-v))*(1-.16*edge**4*(.5+.5*Math.sin(ang*9+seed)))*(1+.06*n(u*3+side*5,v*3));
      // A soft dent where the pillow folds over its lower half.
      t*=1-.08*Math.exp(-((v+.15)**2)/.02)*(1-u*u);
      pos.push(x,y,side*t);uv.push(x,y);
    }
    for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
      const a=i*(nv+1)+j,b=a+nv+1;
      if(side>0)index.push(a,b,a+1,b,b+1,a+1);else index.push(a,a+1,b,b,a+1,b+1);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setIndex(index);geo.computeVertexNormals();
    const col=[];for(let i=0;i<pos.length;i+=3){const e=Math.max(Math.abs(pos[i])/(W/2),Math.abs(pos[i+1])/(H/2));const ao=1-.12*Math.max(0,e-.75)/.25;col.push(ao,ao,ao);}
    geo.setAttribute('color',new T.Float32BufferAttribute(col,3));parts.push(geo);
  }
  return parts;
}

// Floor contact shadow: a dark core under the footprint with a tight edge and a soft halo.
function contactShadow(T,{x0,z0,x1,z1,y,draw,core=.72,halo=.28,ppm=200}){
  const W=Math.round((x1-x0)*ppm),H=Math.round((z1-z0)*ppm),c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d'),toPx=(x,z)=>[(x-x0)*ppm,(z-z0)*ppm];
  const layer=(blur,alpha,grow)=>{
    const l=document.createElement('canvas');l.width=W;l.height=H;const lg=l.getContext('2d');
    lg.fillStyle='#000';draw(lg,toPx,grow*ppm);
    g.save();g.filter=`blur(${blur*ppm}px)`;g.globalAlpha=alpha;g.drawImage(l,0,0);g.restore();
  };
  layer(.12,halo,.06);layer(.03,core*.7,.025);layer(.008,core,.012);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;
  const m=new T.MeshBasicMaterial({map:t,color:0x000000,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,toneMapped:false});
  // Black RGB, darkness in alpha.
  m.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\n diffuseColor.a*=texture2D(map,vMapUv).a;\n#endif');};
  m.customProgramCacheKey=()=>'salon-contact-shadow';
  const geo=new T.PlaneGeometry(x1-x0,z1-z0);geo.rotateX(-Math.PI/2);
  const mesh=new T.Mesh(geo,m);mesh.position.set((x0+x1)/2,y,(z0+z1)/2);mesh.renderOrder=1;
  return mesh;
}

// Original line composition (not a copy of the render's artwork): a fan of hand-drawn
// concentric arcs rising from the lower right, ink on raw cream canvas.
function artCanvas(T,W,H){
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  g.fillStyle='#ddd1bc';g.fillRect(0,0,W,H);
  const n=noise2(77);
  // Canvas grain and a faint wash.
  const img=g.getImageData(0,0,W,H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,v=6*n(x/40,y/40)+4*((x*7+y*13)%5-2)/2+3*Math.sin(y*.9);img.data[i]+=v;img.data[i+1]+=v;img.data[i+2]+=v*.9;}
  g.putImageData(img,0,0);
  g.strokeStyle='#1d1915';g.lineCap='round';
  const cx=W*1.0,cy=H*1.0;
  for(let r=W*.40,k=0;r<W*1.08;r+=W*.017,k++){
    g.beginPath();g.lineWidth=W*(.0062+.0018*Math.sin(k*1.7));g.globalAlpha=.9+.1*Math.sin(k*.9);
    for(let j=0;j<=240;j++){
      const a=Math.PI+j/240*Math.PI/2,rr=r*(1+.012*n(j/30,k*.7)+.006*Math.sin(a*23+k));
      const x=cx+rr*Math.cos(a),y=cy+rr*1.02*Math.sin(a);
      if(!j)g.moveTo(x,y);else g.lineTo(x,y);
    }
    g.stroke();
  }
  g.globalAlpha=1;
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;
}
function painting(T,ctx){
  const z0=-7.80,z1=-6.68,y0=.78,y1=2.02,x=5.206,depth=.032,fw=.022,g=new T.Group();g.name='salon:cuadro';
  const frame=new T.MeshStandardMaterial({color:'#6b5240',roughness:.62});
  const canvas=new T.MeshStandardMaterial({map:artCanvas(T,1024,Math.round(1024*(y1-y0)/(z1-z0))),roughness:.96});
  const W=z1-z0,H=y1-y0,cz=(z0+z1)/2,cy=(y0+y1)/2;
  const face=new T.Mesh(new T.PlaneGeometry(W-2*fw,H-2*fw),canvas);face.rotation.y=Math.PI/2;face.position.set(x+depth-.006,cy,cz);g.add(face);
  const bar=(w,h,yy,zz)=>{const m=new T.Mesh(new T.BoxGeometry(depth,h,w),frame);m.position.set(x+depth/2,yy,zz);g.add(m);};
  bar(W,fw,y1-fw/2,cz);bar(W,fw,y0+fw/2,cz);bar(fw,H-2*fw,cy,z0+fw/2);bar(fw,H-2*fw,cy,z1-fw/2);
  // Back board, so the canvas is not see-through at grazing angles.
  const back=new T.Mesh(new T.BoxGeometry(.004,H,W),frame);back.position.set(x+.002,cy,cz);g.add(back);
  ctx.lightRuntimeObject(g);return g;
}

export async function apply(ctx){
  const T=ctx.THREE,{group}=ctx;
  // ---- L sofa (B01): main run against the west wall, chaise run along the south. ----
  const removed=ctx.removeExported({material:'linen',region:'salon',box:[[5.2,0,-8.4],[8.4,1.2,-4.7]]});
  const linen=ctx.cloneMaterial(ctx.mats.linen);linen.vertexColors=true;linen.color.set('#efebe3');
  const sofa=new Builder(T),cords=new Builder(T);
  const put=(res,{pipes=[0,1]}={})=>{for(const g of res.parts)sofa.add(g);for(const k of pipes)cords.add(piping(T,res.pipes[k]),.86);};
  const BX=5.257,FX=6.140,NZ=-8.28,SZ=-4.75,CX=8.278,CZ=-5.627,PL=.085,BASE=.30,SEAT=.465;
  const backX=5.475,backZ=-4.975,frameTop=.655;
  // Frames: back of the main run, back of the chaise run, north arm, two seat bases.
  put(slab(T,{...rrect(BX,NZ,backX,SZ,.045),y0:PL,y1:frameTop,r:.035,bulge:.004,seed:2,bottom:false,
    contacts:[{axis:'y',at:PL,k:.5,fall:.04},{axis:'x',at:backX,k:.35,fall:.025}]}));
  put(slab(T,{...rrect(backX+.004,backZ,CX,SZ,.045),y0:PL,y1:frameTop,r:.035,bulge:.004,seed:3,bottom:false,
    contacts:[{axis:'y',at:PL,k:.5,fall:.04},{axis:'z',at:backZ,k:.35,fall:.025},{axis:'x',at:backX,k:.4,fall:.02}]}));
  put(slab(T,{...rrect(backX+.004,NZ,FX,-8.07,.045),y0:PL,y1:.62,r:.035,crown:.006,bulge:.006,seed:4,bottom:false,
    contacts:[{axis:'y',at:PL,k:.5,fall:.04},{axis:'z',at:-8.07,k:.4,fall:.03},{axis:'x',at:backX,k:.35,fall:.02}]}));
  put(slab(T,{...rrect(backX+.004,-8.066,FX,backZ-.004,.032),y0:PL,y1:BASE,r:.022,bulge:.003,seed:5,bottom:false,
    contacts:[{axis:'y',at:PL,k:.5,fall:.035},{axis:'y',at:BASE,k:.45,fall:.02}]}),{pipes:[0]});
  put(slab(T,{...rrect(FX+.004,CZ,CX,backZ-.004,.032),y0:PL,y1:BASE,r:.022,bulge:.003,seed:6,bottom:false,
    contacts:[{axis:'y',at:PL,k:.5,fall:.035},{axis:'y',at:BASE,k:.45,fall:.02},{axis:'x',at:FX,k:.35,fall:.02}]}),{pipes:[0]});
  // Loose seat cushions: three on the main run, two on the chaise run.
  const gap=.008,mz0=-8.066,mz1=backZ-.004,mw=(mz1-mz0-2*gap)/3,cushion={y0:BASE+.002,y1:SEAT,r:.032,crown:.016,bulge:.009,wrinkle:.003};
  const seatsMain=[0,1,2].map(k=>[mz0+k*(mw+gap),mz0+k*(mw+gap)+mw]);
  for(const [k,[z0,z1]] of seatsMain.entries())
    put(slab(T,{...rrect(backX+.006,z0,FX+.006,z1,.045),...cushion,seed:10+k,bottom:false,
      contacts:[{axis:'y',at:BASE,k:.5,fall:.025},{axis:'z',at:z0,k:k?.4:.3,fall:.02},{axis:'z',at:z1,k:k<2?.4:.3,fall:.02},{axis:'x',at:backX+.21,k:.25,fall:.04}]}));
  const cx0=FX+.012,cw=(CX+.006-cx0-gap)/2;
  for(const k of [0,1]){
    const x0=cx0+k*(cw+gap),x1=x0+cw;
    put(slab(T,{...rrect(x0,CZ-.006,x1,backZ-.004,.045),...cushion,seed:20+k,bottom:false,
      contacts:[{axis:'y',at:BASE,k:.5,fall:.025},{axis:'x',at:x0,k:.4,fall:.02},{axis:'x',at:x1,k:k?.25:.4,fall:.02},{axis:'z',at:backZ-.21,k:.25,fall:.04}]}));
  }
  // Loose back cushions resting on the seats, leaning back 7°.
  const lean=Math.tan(7*Math.PI/180),backTop=.865;
  for(const [k,[z0,z1]] of seatsMain.entries())
    put(slab(T,{...rrect(backX+.004,z0+.004,backX+.214,z1-.004,.06),y0:SEAT-.01,y1:backTop,r:.045,crown:.012,bulge:.012,lean:[-lean,0],wrinkle:.003,seed:30+k,bottom:false,
      contacts:[{axis:'y',at:SEAT-.01,k:.45,fall:.03}]}));
  const bx0=backX+.214+.004,bw=(CX-bx0-gap)/2;
  for(const k of [0,1]){
    const x0=bx0+k*(bw+gap);
    put(slab(T,{...rrect(x0,backZ-.214,x0+bw,backZ-.004,.06),y0:SEAT-.01,y1:backTop,r:.045,crown:.012,bulge:.012,lean:[0,lean],wrinkle:.003,seed:40+k,bottom:false,
      contacts:[{axis:'y',at:SEAT-.01,k:.45,fall:.03}]}));
  }
  const sofaMesh=new T.Mesh(sofa.build(),linen),cordMesh=new T.Mesh(cords.build(),linen);
  // Throw pillows: three on the main run, two on the chaise run near the corner.
  const pillowMat=ctx.cloneMaterial(ctx.mats.linen);pillowMat.vertexColors=true;pillowMat.color.set('#f2efe9');
  const pillows=new T.Group();
  const addPillow=(W,H,Th,seed,x,y,z,ry,rx,rz)=>{
    const b=new Builder(T);for(const g of pillow(T,W,H,Th,seed))b.add(g);
    const m=new T.Mesh(b.build(),pillowMat);m.rotation.order='YXZ';m.rotation.set(rx,ry,rz);m.position.set(x,y,z);pillows.add(m);
  };
  const front=backX+.214+.02;
  addPillow(.50,.48,.15,3,front+.06,SEAT+.23,-6.95,Math.PI/2,-.30,.03);
  addPillow(.46,.44,.14,4,front+.06,SEAT+.215,-6.30,Math.PI/2,-.32,-.05);
  addPillow(.50,.48,.15,5,front+.06,SEAT+.23,-5.62,Math.PI/2,-.30,.06);
  addPillow(.46,.44,.14,6,6.42,SEAT+.215,backZ-.214-.08,Math.PI,-.31,-.04);
  addPillow(.50,.48,.15,7,7.05,SEAT+.23,backZ-.214-.08,Math.PI,-.29,.05);
  for(const o of [sofaMesh,cordMesh,...pillows.children]){o.castShadow=true;o.receiveShadow=true;}
  const sofaGroup=new T.Group();sofaGroup.name='salon:sofa';sofaGroup.add(sofaMesh,cordMesh,pillows);
  group.add(sofaGroup);

  // ---- Armchairs (B01): seat shell, box seat cushion and curved back roll, piped. ----
  const removedChairs=ctx.removeExported({material:'fabric',region:'salon',box:[[8.2,.2,-7.55],[9.2,1.0,-5.65]]});
  const boucle=ctx.cloneMaterial(ctx.mats.fabric);boucle.vertexColors=true;
  const chairs=new Builder(T),chairCords=new Builder(T);
  const poly=name=>ctx.data.colliders.find(c=>c.name===name)?.poly;
  const smooth=(p,count)=>new T.CatmullRomCurve3(p.map(([x,z])=>new T.Vector3(x,0,z)),true,'centripetal').getSpacedPoints(count).slice(0,count).map(v=>[v.x,v.z]);
  for(const side of ['norte','sur']){
    const base=poly(`Butaca salon ${side} base asiento tapizado`),seat=poly(`Butaca salon ${side} asiento tapizado`),back=poly(`Butaca salon ${side} respaldo tapizado`);
    if(!base||!seat||!back)continue;
    const b=slab(T,{outline:smooth(base,72),y0:.255,y1:.335,r:.025,bulge:.004,seed:50,bottom:true,contacts:[{axis:'y',at:.335,k:.4,fall:.02}]});
    for(const g of b.parts)chairs.add(g);chairCords.add(piping(T,b.pipes[0],.004),.82);
    const s=slab(T,{outline:smooth(seat,96),y0:.335,y1:.475,r:.035,crown:.018,bulge:.008,wrinkle:.003,seed:51,bottom:false,contacts:[{axis:'y',at:.335,k:.45,fall:.025}]});
    for(const g of s.parts)chairs.add(g);for(const p of s.pipes)chairCords.add(piping(T,p,.0045),.82);
    // Back roll: circle fitted to the outer arc of the exported back, band 9 cm thick.
    const arc=back.slice(4,back.length-4);
    let sx=0,sz=0;for(const [x,z] of arc){sx+=x;sz+=z;}sx/=arc.length;sz/=arc.length;
    // Algebraic circle fit (Kasa).
    let Suu=0,Svv=0,Suv=0,Suuu=0,Svvv=0,Suvv=0,Svuu=0;
    for(const [x,z] of arc){const u=x-sx,v=z-sz;Suu+=u*u;Svv+=v*v;Suv+=u*v;Suuu+=u*u*u;Svvv+=v*v*v;Suvv+=u*v*v;Svuu+=v*u*u;}
    const det=Suu*Svv-Suv*Suv,uc=((Suuu+Suvv)/2*Svv-(Svvv+Svuu)/2*Suv)/det,vc=((Svvv+Svuu)/2*Suu-(Suuu+Suvv)/2*Suv)/det;
    const cxx=sx+uc,czz=sz+vc,R=Math.sqrt(uc*uc+vc*vc+(Suu+Svv)/arc.length),t=.095;
    // Unwrapped sweep of the arc, made increasing.
    const angles=arc.map(([x,z])=>Math.atan2(z-czz,x-cxx));
    let a0=angles[0],a1=a0;
    for(let k=1;k<angles.length;k++){let d=angles[k]-angles[k-1];while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;a1+=d;}
    if(a1<a0)[a0,a1]=[a1,a0];
    const outline=[],N=40,Rm=R-t/2;
    for(let k=0;k<=N;k++){const a=a0+(a1-a0)*k/N;outline.push([cxx+R*Math.cos(a),czz+R*Math.sin(a)]);}
    for(let k=1;k<8;k++){const a=a1+Math.PI*k/8,e=[cxx+Rm*Math.cos(a1),czz+Rm*Math.sin(a1)];outline.push([e[0]+t/2*Math.cos(a1+Math.PI*k/8),e[1]+t/2*Math.sin(a1+Math.PI*k/8)]);}
    for(let k=N;k>=0;k--){const a=a0+(a1-a0)*k/N;outline.push([cxx+(R-t)*Math.cos(a),czz+(R-t)*Math.sin(a)]);}
    for(let k=1;k<8;k++){const e=[cxx+Rm*Math.cos(a0),czz+Rm*Math.sin(a0)];outline.push([e[0]+t/2*Math.cos(a0+Math.PI+Math.PI*k/8),e[1]+t/2*Math.sin(a0+Math.PI+Math.PI*k/8)]);}
    const r=slab(T,{outline,y0:.645,y1:.885,r:.042,bulge:.008,seed:52,flatCap:true,bottom:true,contacts:[]});
    for(const g of r.parts)chairs.add(g);for(const p of r.pipes)chairCords.add(piping(T,p,.0045),.82);
  }
  const chairMesh=new T.Mesh(chairs.build(),boucle),chairCordMesh=new T.Mesh(chairCords.build(),boucle);
  for(const o of [chairMesh,chairCordMesh]){o.castShadow=true;o.receiveShadow=true;}
  const chairGroup=new T.Group();chairGroup.name='salon:butacas';chairGroup.add(chairMesh,chairCordMesh);group.add(chairGroup);
  ctx.lightRuntimeObject(sofaGroup);ctx.lightRuntimeObject(chairGroup);

  // ---- Contact shadows on the rug / floor. ----
  group.add(contactShadow(T,{x0:5.1,z0:-8.45,x1:8.45,z1:-4.6,y:.0125,core:.9,halo:.38,draw:(g,p,grow)=>{
    const rect=(x0,z0,x1,z1)=>{const [a,b]=p(x0,z0),[c,d]=p(x1,z1);g.fillRect(a-grow,b-grow,c-a+2*grow,d-b+2*grow);};
    rect(BX,NZ,FX,SZ);rect(FX-.01,CZ,CX,SZ);
  }}));
  group.add(contactShadow(T,{x0:8.0,z0:-7.75,x1:9.4,z1:-5.45,y:.003,core:.32,halo:.30,draw:(g,p,grow)=>{
    for(const side of ['norte','sur']){
      const s=poly(`Butaca salon ${side} asiento tapizado`);if(!s)continue;
      g.beginPath();s.forEach(([x,z],i)=>{const [a,b]=p(x,z);i?g.lineTo(a,b):g.moveTo(a,b);});g.closePath();g.fill();
    }
  }}));
  // ---- Painting (secondary): larger canvas over the plaster/oak junction, dark lines. ----
  const removedArt=ctx.removeExported({material:'art',region:'salon',box:[[5.15,.6,-7.7],[5.3,2.1,-6.7]]})
    +ctx.removeExported({material:'wood',region:'salon',box:[[5.201,.7,-7.6],[5.24,2.0,-6.78]]});
  group.add(painting(T,ctx));
  console.info(`[rooms/salon] painting replaced (${removedArt})`);
  console.info(`[rooms/salon] sofa rebuilt (${removed} exported triangles), armchairs rebuilt (${removedChairs})`);
}
