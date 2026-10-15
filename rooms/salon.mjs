// Room module: salon. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/salon.json).
//
// Ronda 5: the exported L sofa and the two armchairs read as soft foam blobs. They are
// rebuilt here as tailored upholstery on the same B01 footprints: modular frames, loose
// box cushions (seat and back) with crowned tops, bellied sides and sewn seams, knife-
// edge throw pillows, contact darkening baked into vertex colours and a crisp contact
// shadow on the floor. The exported plinth and the armchair legs stay (baked light).
// Ronda 6: about a quarter of the triangles (no piping tubes; each slab is one welded
// mesh with smooth normals and a sewn groove), rounder and plumper cushions, creases
// shaded into the vertex colours, stronger contact shadows (the armchairs' one was
// under the rug) and a denser sheer.
// Ronda 7: the sofa in ivory bouclé (own texture scale, cloth mottle and slubs, no
// gloss), flatter cushions, an oak plinth of its own set back under the upholstery
// with a soft graded contact shadow (the exported plinth and the near-black core
// read as a floating black slab) and the cove lines glowing amber instead of white.
// Ronda 8: the sofa remade after render 1 as an armless modular sofa (back and seat
// blocks, smooth ivory linen, thin rounded oak plinth); see apply().

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
function rrect(x0,z0,x1,z1,rc=.045,step=.11,seg=4){
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

// Upholstered slab on a plan outline, as ONE connected mesh with welded smooth normals
// (ronda 6: moderate tessellation, the softness comes from the normals, not polygons).
// Rounded edges of radius r, crowned top, sides bellied between the seams and pinched
// at the corners, a sewn groove at the top seam (and optionally the bottom one) with
// small pulls along it, and creases where the top panel is drawn into the seam.
// Vertex colours carry the contact occlusion the probes cannot resolve ({axis, at, k,
// fall}), a low-side darkening (shade: [k, height]) and the dips of seams and creases.
function slab(T,{outline,corners=[],y0,y1,r=.03,rb=null,crown=0,bulge=0,lean=null,wrinkle=.0025,seed=1,contacts=[],
  bottom=false,flatCap=false,seam=true,bottomSeam=false,sag=0,shade=null}){
  // rb: radius of the bottom edge (defaults to r); a tighter one sits the block on its base.
  const R2=Math.min(r,rb??r);
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
  // Pull pattern along the perimeter (0..1): broad puckers, ~18 cm apart.
  const pull=i=>.5+.5*Math.sin(L[i]*34+nz(L[i]*3,seed*.7)*7);
  const pos=[],uv=[],dip=[],weld=[],idx=[];
  const vert=(p,u,d=0,wid=-1)=>{pos.push(...p);uv.push(...u);dip.push(d);weld.push(wid<0?pos.length/3-1:wid);return pos.length/3-1;};
  // Point of outline vertex i at profile angle phi (0 top, pi/2..pi/2+1 side, pi/2+1+pi/2 bottom).
  const ring=(i,phi,inset=0)=>{
    const [px,pz]=pts[i],[nx,nzz]=nor[i],q=[px-nx*r,pz-nzz*r];let off,y;
    if(phi<=Math.PI/2){off=r*Math.sin(phi);y=y1-r+r*Math.cos(phi);}
    else if(phi>=Math.PI/2+1){const a=phi-1;off=r-R2+R2*Math.sin(a);y=y0+R2+R2*Math.cos(a);}
    else{const t=phi-Math.PI/2;off=r;y=y1-r-t*(y1-y0-r-R2);}
    off+=bulge*w[i]*Math.max(0,1-((y-ym)/hs)**2)*(1+.25*nz(L[i]*6,seed))-inset;
    const s=shear(y);return [q[0]+nx*off+s[0],y,q[1]+nzz*off+s[1]];
  };
  const rows=[];// each row: n vertex ids
  const pushRow=row=>{
    const prev=rows[rows.length-1];rows.push(row);if(!prev)return;
    for(let i=0;i<n;i++){const a=prev[i],b=prev[(i+1)%n],c=row[i],d=row[(i+1)%n];idx.push(a,c,b,b,c,d);}
  };
  const capUV=p=>[p[0],p[2]],sideUV=(i,p)=>[L[i],p[1]];
  // Top cap.
  const yTop=y1,sh=shear(yTop);
  if(flatCap){
    const row=[];for(let i=0;i<n;i++){const p=ring(i,0);row.push(vert(p,capUV(p)));}
    const tri=T.ShapeUtils.triangulateShape(row.map(k=>new T.Vector2(pos[k*3],pos[k*3+2])),[]);
    // Same winding as the outline (positive plan area), like the rings below.
    for(const t of tri){
      const [a,b,c]=t.map(k=>row[k]),A=(pos[b*3]-pos[a*3])*(pos[c*3+2]-pos[a*3+2])-(pos[c*3]-pos[a*3])*(pos[b*3+2]-pos[a*3+2]);
      idx.push(...(A>=0?[a,b,c]:[a,c,b]));
    }
    rows.push(row);
  }else{
    const c=vert([C[0]+sh[0],yTop+crown-sag,C[1]+sh[1]],[C[0],C[1]]);
    const caps=[.38,.66,.84,.94,1];let first=true;
    for(const s of caps){
      const row=[];
      for(let i=0;i<n;i++){
        const q=[pts[i][0]-nor[i][0]*r,pts[i][1]-nor[i][1]*r];
        let yy=yTop+crown*(1-s**4)*(.6+.4*Math.sqrt(w[i]))-sag*Math.exp(-(((s-.15)/.45)**2));
        // Creases drawn into the seam: deepest just inside the edge, between the pulls.
        const e=Math.max(0,(s-.55)/.45),cr=wrinkle*3.6*e*(1-e)*(.25+.75*pull(i))*w[i];
        yy-=cr;yy+=.002*nz(q[0]*6+s,q[1]*6)*s*(1-s**6);
        const x=C[0]+(q[0]-C[0])*s+sh[0],z=C[1]+(q[1]-C[1])*s+sh[1];
        row.push(vert([x,yy,z],[x,z],cr/Math.max(wrinkle,1e-4)));
      }
      if(first){for(let i=0;i<n;i++)idx.push(c,row[i],row[(i+1)%n]);rows.push(row);first=false;}
      else pushRow(row);
    }
  }
  // Rounded top edge with the sewn groove at 45°, then the side, then the bottom edge.
  const d=Math.min(.35,.007/Math.max(r,.01)),Q=Math.PI/4;
  const profile=[[Q*.5,0]];
  if(seam)profile.push([Q-d,0],[Q,.0028,'groove'],[Q+d,0,'pull']);else profile.push([Q,0]);
  profile.push([Q*1.5,0,'pull'],[Math.PI/2,0]);
  for(const t of [.3,.62])profile.push([Math.PI/2+t,0]);
  profile.push([Math.PI/2+1,0]);
  if(bottomSeam)profile.push([Math.PI/2+1+Q-d,0],[Math.PI/2+1+Q,.0024,'groove'],[Math.PI/2+1+Q+d,0]);
  else profile.push([Math.PI/2+1+Q,0]);
  profile.push([Math.PI/2+1+Math.PI/2,0]);
  let sideUv=false;
  for(const [phi,inset,tag] of profile){
    const row=[];
    for(let i=0;i<n;i++){
      let ins=inset,dd=0;
      if(tag==='groove')dd=1.4;
      if(tag==='pull'){const pu=wrinkle*.9*pull(i)*w[i];ins+=pu;dd=pu/Math.max(wrinkle,1e-4)*.5;}
      const p=ring(i,phi,ins);
      if(tag==='groove'&&!sideUv){
        // Panel change: cap UVs end here, side UVs start (same point, welded normals).
        const a=vert(p,capUV(p),dd);row.push(a);
      }else row.push(vert(p,sideUv?sideUV(i,p):capUV(p),dd));
    }
    pushRow(row);
    if(tag==='groove'&&!sideUv){
      sideUv=true;const dup=row.map((k,i)=>vert([pos[k*3],pos[k*3+1],pos[k*3+2]],sideUV(i,[0,pos[k*3+1]]),dip[k],k));
      rows[rows.length-1]=dup;
    }
  }
  if(!seam&&!sideUv){/* no seam: keep cap UVs all the way (small slabs) */}
  if(bottom){
    const yb=y0,sb=shear(yb);
    for(const s of [.7,.35]){
      const row=[];
      for(let i=0;i<n;i++){const q=[pts[i][0]-nor[i][0]*r,pts[i][1]-nor[i][1]*r],x=C[0]+(q[0]-C[0])*s+sb[0],z=C[1]+(q[1]-C[1])*s+sb[1];row.push(vert([x,yb,z],[x,z]));}
      pushRow(row);
    }
    const c=vert([C[0]+sb[0],yb,C[1]+sb[1]],[C[0],C[1]]),last=rows[rows.length-1];
    for(let i=0;i<n;i++)idx.push(last[i],c,last[(i+1)%n]);
  }
  // Orientation: the triangle fan around the top must face up.
  {
    const t=idx.slice(0,3).map(k=>[pos[k*3],pos[k*3+1],pos[k*3+2]]);
    const ux=t[1][0]-t[0][0],uz=t[1][2]-t[0][2],vx=t[2][0]-t[0][0],vz=t[2][2]-t[0][2];
    const up=uz*vx-ux*vz;
    if(up<0)for(let i=0;i<idx.length;i+=3){const k=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=k;}
  }
  // Welded, area-weighted smooth normals.
  const N=new Float32Array(pos.length);
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
    const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2];
    const fx=uy*vz-uz*vy,fy=uz*vx-ux*vz,fz=ux*vy-uy*vx;
    for(const k of [idx[i],idx[i+1],idx[i+2]]){const o=weld[k]*3;N[o]+=fx;N[o+1]+=fy;N[o+2]+=fz;}
  }
  for(let k=0;k<weld.length;k++){const o=weld[k]*3,l=Math.hypot(N[o],N[o+1],N[o+2])||1;N[k*3]=N[o]/l;N[k*3+1]=N[o+1]/l;N[k*3+2]=N[o+2]/l;}
  for(let k=0;k<weld.length;k++)if(weld[k]!==k){const o=weld[k]*3;N[k*3]=N[o];N[k*3+1]=N[o+1];N[k*3+2]=N[o+2];}
  const col=[];
  for(let k=0;k<pos.length/3;k++){
    const p=[pos[k*3],pos[k*3+1],pos[k*3+2]];let ao=1;
    for(const c of contacts){const dd=Math.abs(p['xyz'.indexOf(c.axis)]-c.at);ao*=1-(c.k??.45)*Math.exp(-dd/(c.fall??.03));}
    if(shade)ao*=1-shade[0]*Math.max(0,1-(p[1]-y0)/shade[1])**1.5;
    // Down-facing cloth sees the floor and its own shadow.
    ao*=1-.18*Math.max(0,-N[k*3+1]);
    ao*=1-Math.min(.3,.14*dip[k]);
    col.push(ao,ao,ao);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(N,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(col,3));
  g.setIndex(idx);return g;
}

// Knife-edge throw pillow (after bedding.mjs): pinched outline, full belly, corner pulls.
function pillow(T,W,H,Th,seed){
  const n=noise2(seed),nu=14,nv=14,parts=[];
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
function contactShadow(T,{x0,z0,x1,z1,y,draw,core=.72,halo=.28,ppm=200,layers=null}){
  const W=Math.round((x1-x0)*ppm),H=Math.round((z1-z0)*ppm),c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d'),toPx=(x,z)=>[(x-x0)*ppm,(z-z0)*ppm];
  const layer=(blur,alpha,grow)=>{
    const l=document.createElement('canvas');l.width=W;l.height=H;const lg=l.getContext('2d');
    lg.fillStyle='#000';draw(lg,toPx,grow*ppm);
    g.save();g.filter=`blur(${blur*ppm}px)`;g.globalAlpha=alpha;g.drawImage(l,0,0);g.restore();
  };
  // [blur, alpha, grow] in metres, widest first.
  for(const [b,a,gr] of layers||[[.26,halo*.55,.12],[.11,halo,.05],[.03,core*.75,.02],[.008,core,.008]])layer(b,a,gr);
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
  // Frame bars and the back board (so the canvas is not see-through at grazing angles), one mesh.
  const fb=new Builder(T),box=(dx,h,w,xx,yy,zz)=>fb.add(new T.BoxGeometry(dx,h,w).translate(xx,yy,zz));
  box(depth,fw,W,x+depth/2,y1-fw/2,cz);box(depth,fw,W,x+depth/2,y0+fw/2,cz);
  box(depth,H-2*fw,fw,x+depth/2,cy,z0+fw/2);box(depth,H-2*fw,fw,x+depth/2,cy,z1-fw/2);box(.004,H,W,x+.002,cy,cz);
  g.add(new T.Mesh(fb.build(),frame));
  ctx.lightRuntimeObject(g);return g;
}

// Ronda 7: upholstery that reads as cloth at 3–5 m. The shared linen tile (27 cm of
// fine weave) averages out to a flat white at that distance, so the sofa takes the
// photographed bouclé (Poly Haven Curly Teddy) at a tighter loop scale on its own
// texture copy, plus two things the photo tile cannot give: a cloth mottle of a few
// centimetres (yarn lots, nap direction) and slub streaks along the weft, both filtered
// by their screen footprint so they never shimmer. Lower specular: cloth has no gloss.
async function upholstery(ctx,source,{color,tile,detail,normal,mottle=.05,slub=.04,mottleF=[16,16],slubF=[9,170],specular=.25,sheen=.45,key,cloth='curly_teddy_natural'}){
  const T=ctx.THREE,m=ctx.cloneMaterial(source),dir=`./assets/polyhaven/${cloth}/${cloth}_`;
  const [map,nor]=await Promise.all([ctx.loadTexture(dir+'detail_1k.webp',{srgb:false}),ctx.loadTexture(dir+'nor_gl_1k.webp',{srgb:false})]);
  for(const t of [map,nor])t.repeat.set(1/tile,1/tile);
  m.map=map;m.normalMap=nor;m.normalScale.setScalar(normal);m.vertexColors=true;m.color.set(color);
  m.specularIntensity=specular;m.sheen=sheen;m.sheenRoughness=.9;m.roughness=.96;
  const prior=m.onBeforeCompile;
  m.onBeforeCompile=(s,r)=>{
    prior.call(m,s,r);
    s.fragmentShader=s.fragmentShader.replace(/texture2D\(map,vMapUv\)\.r\*2\.0,[0-9.]+\)/,`texture2D(map,vMapUv).r*2.0,${detail.toFixed(3)})`);
    const hash='float hashHouse(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}';
    s.fragmentShader=s.fragmentShader.replace(hash,hash+'\nfloat salonVN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashHouse(i),hashHouse(i+vec2(1,0)),f.x),mix(hashHouse(i+vec2(0,1)),hashHouse(i+1.0),f.x),f.y);}')
      .replace('#include <color_fragment>',`#include <color_fragment>
      {vec2 mo=vUv*vec2(${mottleF.map(v=>v.toFixed(1))}),sl=vUv*vec2(${slubF.map(v=>v.toFixed(1))});
      float fm=1.0-smoothstep(.35,1.2,max(fwidth(mo).x,fwidth(mo).y)),fs=1.0-smoothstep(.35,1.2,max(fwidth(sl).x,fwidth(sl).y));
      float mot=(salonVN(mo)+.5*salonVN(mo*2.3+7.1))/1.5-.5,sb=salonVN(sl)-.5;
      diffuseColor.rgb*=1.0+${mottle.toFixed(3)}*mot*fm+${slub.toFixed(3)}*sb*fs;}`);
  };
  m.customProgramCacheKey=()=>'salon-upholstery-'+key;
  return m;
}

// Oak plinth under the sofa (replaces the exported one, whose baked light left a black
// band under the old overhang): set back from the upholstery so it reads as a shadowed
// recess, vertex-darkened where the upholstery overhangs it and at its floor line.
async function oakPlinth(ctx,boxes,{y0,y1}){
  const T=ctx.THREE,b=new Builder(T),dir='./assets/polyhaven/white_oak_veneer/white_oak_veneer_';
  for(const [x0,z0,x1,z1,rc=0] of boxes){
    // Rounded in plan like the upholstery above it, so no square corner shows past it.
    let g;
    if(rc>0){
      const sh=new T.Shape(),{outline}=rrect(x0,z0,x1,z1,rc,1,6);
      outline.forEach(([x,z],i)=>i?sh.lineTo(x,-z):sh.moveTo(x,-z));
      g=new T.ExtrudeGeometry(sh,{depth:y1-y0,bevelEnabled:false,curveSegments:1}).rotateX(-Math.PI/2).translate(0,y0,0);
      g.deleteAttribute('uv');g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
    }else g=new T.BoxGeometry(x1-x0,y1-y0,z1-z0).translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2).toNonIndexed();
    const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),col=[];
    for(let i=0;i<p.count;i++){
      // Grain runs along the long side of each face; metric UVs.
      const along=Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i);
      uv.setXY(i,along/1.2,Math.abs(n.getY(i))>.5?(Math.abs(n.getX(i))>.5?p.getX(i):p.getZ(i))/1.2:p.getY(i)/1.2);
      const t=(p.getY(i)-y0)/(y1-y0);
      const ao=Math.abs(n.getY(i))>.5?(n.getY(i)>0?.5:.2):.72+.25*Math.max(0,Math.sin(Math.PI*(.15+.75*t)));
      col.push(ao,ao,ao);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(col,3));b.add(g);
  }
  const [map,nor,rough]=await Promise.all(['diff_1k.webp','nor_gl_1k.webp','rough_1k.webp'].map((f,i)=>ctx.loadTexture(dir+f,{srgb:!i})));
  const m=new T.MeshStandardMaterial({map,normalMap:nor,roughnessMap:rough,roughness:1,color:'#f4e2c6',vertexColors:true});
  m.normalScale.setScalar(.5);
  const mesh=new T.Mesh(b.build(),m);mesh.name='salon:peana';mesh.receiveShadow=true;
  return mesh;
}

export async function apply(ctx){
  const T=ctx.THREE,{group}=ctx;
  // ---- L sofa (B01): main run against the west wall, chaise run along the south. ----
  // Ronda 8, after render 1: an armless modular sofa. Each run is two upholstered blocks
  // on a thin oak plinth: a deep back block from the plinth to 0.80 m (it also covers the baked
  // shadow of the old back cushions on the wall) and one thick
  // seat block (no separate base or loose cushions) with a large rounded edge and a
  // welt just below it. The back ends flush with the seat at the south end and stops
  // short of it at the north end, where the seat runs on with a rounded end. Smooth
  // ivory cotton-linen instead of bouclé; only knife-edge throw pillows are loose.
  const removed=ctx.removeExported({material:'linen',region:'salon',box:[[5.2,0,-8.4],[8.4,1.2,-4.7]]});
  const linen=await upholstery(ctx,ctx.mats.linen,{cloth:'rough_linen',color:'#f0eae0',tile:.11,detail:.32,normal:.45,mottle:.035,slub:.022,specular:.2,sheen:.35,key:'sofa'});
  const sofa=new Builder(T);
  const put=g=>sofa.add(g);
  const BX=5.257,FX=6.140,NZ=-8.28,SZ=-4.75,CX=8.278,CZ=-5.627,PL=.04,SEAT=.43,BACK=.80,DEPTH=.23;
  const backX=BX+DEPTH,backZ=SZ-DEPTH,backN=NZ+.26;
  // Blocks darken toward the plinth (shade) so the sofa sits on it instead of floating.
  const shade=[.14,.2],plinth={axis:'y',at:PL,k:.3,fall:.03};
  const block={r:.075,rb:.018,bulge:.005,wrinkle:.0018,shade};
  // Back blocks: the main one wraps the corner; slightly crowned tops, rounder ends.
  put(slab(T,{...rrect(BX,backN,backX,SZ,.09),y0:PL,y1:BACK,...block,r:.085,crown:.006,seed:2,
    contacts:[plinth]}));
  put(slab(T,{...rrect(backX+.003,backZ,CX,SZ,.09),y0:PL,y1:BACK,...block,r:.085,crown:.006,seed:3,
    contacts:[plinth,{axis:'x',at:backX,k:.3,fall:.025}]}));
  // Seat blocks: the main one covers the corner square and runs past the back to the
  // north end; the south run butts against it. Soft sit dips, contact with the backs.
  const seat={...block,y0:PL,y1:SEAT,crown:.008,sag:.004,wrinkle:.0028};
  put(slab(T,{...rrect(backX+.003,NZ,FX,backZ-.003,.11),...seat,seed:10,
    contacts:[plinth,{axis:'x',at:backX,k:.42,fall:.04},{axis:'z',at:backZ,k:.3,fall:.04}]}));
  put(slab(T,{...rrect(FX+.004,CZ,CX,backZ-.003,.09),...seat,seed:11,
    contacts:[plinth,{axis:'z',at:backZ,k:.42,fall:.04},{axis:'x',at:FX,k:.3,fall:.02}]}));
  // Throw pillows as in render 1: a large one and a small one on the main run near the
  // corner, a large one in the corner and another along the south run, all leaning
  // back against the blocks, in the same mesh and material (one draw call).
  const pillowB=sofa,tmp=new T.Object3D();
  const addPillow=(W,H,Th,seed,x,y,z,ry,rx,rz)=>{
    tmp.rotation.order='YXZ';tmp.rotation.set(rx,ry,rz);tmp.position.set(x,y,z);tmp.updateMatrix();
    for(const g of pillow(T,W,H,Th,seed)){g.applyMatrix4(tmp.matrix);pillowB.add(g,1.02);}
  };
  addPillow(.55,.53,.16,5,backX+.09,SEAT+.245,-6.35,Math.PI/2,-.30,.05);
  addPillow(.42,.40,.12,4,backX+.07,SEAT+.185,-5.72,Math.PI/2,-.34,-.06);
  addPillow(.55,.53,.16,3,backX+.30,SEAT+.245,backZ-.10,Math.PI*.82,-.30,.04);
  addPillow(.55,.53,.16,7,6.95,SEAT+.245,backZ-.09,Math.PI,-.31,-.05);
  const sofaMesh=new T.Mesh(sofa.build(),linen);sofaMesh.castShadow=true;sofaMesh.receiveShadow=true;
  const sofaGroup=new T.Group();sofaGroup.name='salon:sofa';sofaGroup.add(sofaMesh);
  group.add(sofaGroup);
  // Thin oak plinth set back 2.5 cm from the upholstery (the exported one goes).
  const removedPlinth=ctx.removeExported({material:'wood',region:'salon',box:[[5.24,-.01,-8.3],[8.3,.095,-4.74]]});
  const PI=.025,plinthBoxes=[[BX+PI,NZ+PI,FX-PI,SZ-PI,.08],[FX-PI,CZ+PI,CX-PI,SZ-PI,.07]];
  const plinthMesh=await oakPlinth(ctx,plinthBoxes,{y0:0,y1:PL});
  const plinthGroup=new T.Group();plinthGroup.add(plinthMesh);group.add(plinthGroup);ctx.lightRuntimeObject(plinthGroup);
  // Under the sofa the nearest probes are inside the upholstery (no cover), so the
  // plinth fell back to the outdoor sky and sun and glowed. It samples the probes
  // 30 cm up and in front of its face instead, where the room light is valid.
  {const m=plinthMesh.material,prior=m.onBeforeCompile,key=m.customProgramCacheKey.bind(m);
    m.onBeforeCompile=(sh,r)=>{prior.call(m,sh,r);sh.vertexShader=sh.vertexShader.replace('lpWorld=(modelMatrix*lpw).xyz;}','lpWorld=(modelMatrix*lpw).xyz;lpWorld.y=max(lpWorld.y,.34);}');};
    m.customProgramCacheKey=()=>key()+'|salon-plinth';}

  // ---- Armchairs (B01): seat shell, box seat cushion and curved back roll. ----
  // Fabric after render 1: a heathered wool weave (Poly Wool Herringbone, Poly Haven, specks
  // removed) at 40 cm with short slubs along the weft, not the pale shared bouclé. Under
  // the house's warm light a cool grey reads as the render's taupe (measured against
  // renders 1 and 2: same mean colour within 2–4 levels and the same weave contrast).
  const removedChairs=ctx.removeExported({material:'fabric',region:'salon',box:[[8.2,.2,-7.55],[9.2,1.0,-5.65]]});
  const weave=await upholstery(ctx,ctx.mats.fabric,{cloth:'poly_wool_herringbone',color:'#9b9da6',tile:.4,detail:1.7,normal:1.2,
    mottle:.06,mottleF:[20,20],slub:.4,slubF:[25,250],specular:.25,sheen:.38,key:'chairs'});
  const chairs=new Builder(T);
  const poly=name=>ctx.data.colliders.find(c=>c.name===name)?.poly;
  const smooth=(p,count)=>new T.CatmullRomCurve3(p.map(([x,z])=>new T.Vector3(x,0,z)),true,'centripetal').getSpacedPoints(count).slice(0,count).map(v=>[v.x,v.z]);
  for(const side of ['norte','sur']){
    const base=poly(`Butaca salon ${side} base asiento tapizado`),seat=poly(`Butaca salon ${side} asiento tapizado`),back=poly(`Butaca salon ${side} respaldo tapizado`);
    if(!base||!seat||!back)continue;
    chairs.add(slab(T,{outline:smooth(base,40),y0:.255,y1:.335,r:.03,bulge:.006,seed:50,bottom:true,seam:false,bottomSeam:false,
      contacts:[{axis:'y',at:.335,k:.45,fall:.02}]}));
    chairs.add(slab(T,{outline:smooth(seat,48),y0:.335,y1:.475,r:.05,crown:.02,sag:.008,bulge:.012,wrinkle:.004,seed:51,
      contacts:[{axis:'y',at:.335,k:.5,fall:.025}]}));
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
    const outline=[],N=22,Rm=R-t/2;
    for(let k=0;k<=N;k++){const a=a0+(a1-a0)*k/N;outline.push([cxx+R*Math.cos(a),czz+R*Math.sin(a)]);}
    for(let k=1;k<6;k++){const e=[cxx+Rm*Math.cos(a1),czz+Rm*Math.sin(a1)];outline.push([e[0]+t/2*Math.cos(a1+Math.PI*k/6),e[1]+t/2*Math.sin(a1+Math.PI*k/6)]);}
    for(let k=N;k>=0;k--){const a=a0+(a1-a0)*k/N;outline.push([cxx+(R-t)*Math.cos(a),czz+(R-t)*Math.sin(a)]);}
    for(let k=1;k<6;k++){const e=[cxx+Rm*Math.cos(a0),czz+Rm*Math.sin(a0)];outline.push([e[0]+t/2*Math.cos(a0+Math.PI+Math.PI*k/6),e[1]+t/2*Math.sin(a0+Math.PI+Math.PI*k/6)]);}
    chairs.add(slab(T,{outline,y0:.645,y1:.885,r:.042,bulge:.01,wrinkle:.003,seed:52,flatCap:true,bottom:false,bottomSeam:true,contacts:[]}));
  }
  const chairMesh=new T.Mesh(chairs.build(),weave);chairMesh.castShadow=true;chairMesh.receiveShadow=true;
  const chairGroup=new T.Group();chairGroup.name='salon:butacas';chairGroup.add(chairMesh);group.add(chairGroup);
  ctx.lightRuntimeObject(sofaGroup);ctx.lightRuntimeObject(chairGroup);

  // ---- Contact shadows on the rug / floor. ----
  // Ronda 7: soft occlusion from the set-back plinth outwards (about 0.6 at the plinth,
  // half that at the upholstery edge, gone 20 cm out), not a black slab.
  group.add(contactShadow(T,{x0:5.1,z0:-8.55,x1:8.8,z1:-4.25,y:.0125,layers:[[.24,.16,.13],[.09,.22,.06],[.03,.28,.025],[.008,.34,.006]],draw:(g,p,grow)=>{
    for(const [x0,z0,x1,z1] of plinthBoxes){const [a,b]=p(x0,z0),[c,d]=p(x1,z1);g.fillRect(a-grow,b-grow,c-a+2*grow,d-b+2*grow);}
  }}));
  group.add(contactShadow(T,{x0:7.8,z0:-7.95,x1:9.6,z1:-5.25,y:.0125,core:.4,halo:.34,draw:(g,p,grow)=>{
    for(const side of ['norte','sur']){
      const s=poly(`Butaca salon ${side} asiento tapizado`);if(!s)continue;
      g.beginPath();s.forEach(([x,z],i)=>{const [a,b]=p(x,z);i?g.lineTo(a,b):g.moveTo(a,b);});g.closePath();g.fill();
    }
  }}));
  // ---- Sheer (ronda 6): the shared sheer (translucency .75) burns out against the
  // daylight behind it. This room's piece gets its own clone: less light through, a
  // touch denser and greyer, so the pleats read instead of a white block.
  const sheers=ctx.splitExported({material:'curtain',region:'salon',box:[[5.15,-.2,-8.75],[10.1,3.2,-3.66]]});
  for(const m of sheers){m.material.userData.translucency=.2;m.material.opacity=.86;m.material.color.multiplyScalar(.74);}
  // ---- Cove lines (ronda 7): the shared LED material (emissive ×9) clips to a white
  // wire along the coves; in render 1 the strip is hidden and only its warm wash shows.
  // This room's lines glow amber, a few times the ceiling, not a burnt line.
  const leds=ctx.splitExported({material:'led',region:'salon',box:[[5.15,2.2,-8.75],[10.1,2.5,-3.66]]});
  for(const m of leds){m.material.emissive.set('#ffbe86');m.material.emissiveIntensity=1.6;m.material.color.set('#f3d6b0');}
  // ---- Painting (secondary): larger canvas over the plaster/oak junction, dark lines. ----
  const removedArt=ctx.removeExported({material:'art',region:'salon',box:[[5.15,.6,-7.7],[5.3,2.1,-6.7]]})
    +ctx.removeExported({material:'wood',region:'salon',box:[[5.201,.7,-7.6],[5.24,2.0,-6.78]]});
  group.add(painting(T,ctx));
  console.info(`[rooms/salon] painting replaced (${removedArt}), sheers ${sheers.length}`);
  console.info(`[rooms/salon] plinth ${removedPlinth}, leds ${leds.length}`);
  console.info(`[rooms/salon] sofa rebuilt (${removed} exported triangles), armchairs rebuilt (${removedChairs})`);
}
