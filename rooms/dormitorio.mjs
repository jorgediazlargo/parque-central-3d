// Room module: dormitorio. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/dormitorio.json).
//
// Render 3 (round 5): no LED line is seen anywhere in the room. The light is a curtain
// pocket hidden over the sheers and a vertical slot beside the wardrobe front; the
// bake side of that (headboard strip, ceiling slit, vertical slot) is proposed in
// review-loop/proposals/r5-dormitorio.md. Here: hide the visible lines, add the rug
// under the bed (lit by the floor's own baked light) and darken the oak a little.

// Floor rug of render 3: pale wool, 2.20 x 2.38 m, from under the nightstands to
// about 55 cm past the foot of the bed (bed: x 0.20-2.20, z -8.71 to -6.71).
// Diffuse transmission of the voile (the shared sheer has .75 and read blown out).
const SHEER_T=.42;
const RUG={x0:.55,x1:2.75,z0:-8.90,z1:-6.52,h:.012};

// The shared oak veneer map with its grain contrast raised (×1.75 around the mean).
function oakGrain(THREE,source){
  const img=source?.image;if(!img?.width)return null;
  const N=img.width,M=img.height,c=document.createElement('canvas');c.width=N;c.height=M;
  const g=c.getContext('2d');g.drawImage(img,0,0);
  const im=g.getImageData(0,0,N,M),d=im.data,mean=[0,0,0];
  for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++)mean[k]+=d[i+k];
  for(let k=0;k<3;k++)mean[k]/=d.length/4;
  for(let i=0;i<d.length;i+=4){
    const l=(d[i]-mean[0])*.3+(d[i+1]-mean[1])*.59+(d[i+2]-mean[2])*.11;
    for(let k=0;k<3;k++)d[i+k]=Math.max(0,Math.min(255,mean[k]+(d[i+k]-mean[k])+l*.75*mean[k]/mean[1]));
  }
  g.putImageData(im,0,0);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.copy(source.repeat);t.anisotropy=source.anisotropy;t.flipY=source.flipY;return t;
}

function rand(seed){let s=seed>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

// Voile coverage (alpha) and a faint value detail: fine weave plus slubby threads.
// 512 px = 40 cm.
function voileTexture(THREE){
  const N=512,c=document.createElement('canvas');c.width=c.height=N;
  const g=c.getContext('2d'),im=g.createImageData(N,N),d=im.data,r=rand(33);
  const warp=new Float32Array(N),weft=new Float32Array(N);
  for(let i=0;i<N;i++){warp[i]=(r()-.5)*.10;weft[i]=(r()-.5)*.06;}
  for(let i=0;i<40;i++){const x=Math.floor(r()*N),w=1+Math.floor(r()*2),a=(r()-.3)*.12;for(let k=0;k<w;k++)warp[(x+k)%N]+=a;}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const p=(y*N+x)*4,s=warp[x]+weft[y];
    const v=.5+s*.35;
    d[p]=d[p+1]=d[p+2]=Math.round(Math.max(0,Math.min(1,v))*255);
    d[p+3]=Math.round(Math.max(0,Math.min(1,.52+s*.6))*255);
  }
  g.putImageData(im,0,0);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=8;t.premultiplyAlpha=false;return t;
}

// Smooth 2-D value noise in [-1, 1].
function noise2(seed){
  const h=(x,y)=>{let k=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,2147483647)|0;k=Math.imul(k^(k>>>13),1274126177);return ((k^(k>>>16))>>>0)/2147483648-1;};
  return (x,y)=>{
    const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
  };
}

// Continuous veneer sheet, W x H metres at 2.1 mm/px, vertical grain, cut from the shared
// 50 cm white oak tile: boards of 26-36 cm (as the panel joints of render 3), each its own
// strip of the tile, mirrored at random and stretched 2.2x along the grain, with the
// tile's next repeat replaced by a different strip cross-faded over 15 cm. Faint joints,
// ±3 % tone per board and a gentle grain lift. Columns past 3.4 m hold two wide boards
// for the bed base (grain along its length).
const VENEER={W:4.3,H:2.15};
function veneerSheet(THREE,source){
  const img=source?.image;if(!img?.width)return null;
  const PX=2048,PY=1024,mx=PX/VENEER.W,my=PY/VENEER.H,r=rand(23);
  const c=document.createElement('canvas');c.width=PX;c.height=PY;const g=c.getContext('2d');
  const t=document.createElement('canvas'),tg=t.getContext('2d');
  const seg=1.1,ov=.15,edges=[0];
  while(edges.at(-1)<3.35)edges.push(edges.at(-1)+.26+r()*.10);
  edges[edges.length-1]=3.40;edges.push(3.86,4.3);
  for(let b=0;b<edges.length-1;b++){
    const x0=Math.round(edges[b]*mx),x1=Math.round(edges[b+1]*mx),bw=x1-x0;
    const srcW=Math.min(img.width-1,(edges[b+1]-edges[b])/.5*img.width),flip=r()<.5;
    for(let k=0,y=0;y<VENEER.H;k++,y+=seg-ov){
      const sh=Math.round(seg*my),dy=Math.round(y*my);
      t.width=bw;t.height=sh;tg.save();
      if(flip){tg.translate(bw,0);tg.scale(-1,1);}
      tg.drawImage(img,r()*(img.width-srcW),0,srcW,img.height,0,0,bw,sh);tg.restore();
      if(k){const gr=tg.createLinearGradient(0,0,0,ov*my);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,1)');
        tg.globalCompositeOperation='destination-in';tg.fillStyle=gr;tg.fillRect(0,0,bw,sh);tg.globalCompositeOperation='source-over';}
      g.drawImage(t,x0,dy);
    }
    const tone=.97+r()*.03;g.globalCompositeOperation='multiply';g.fillStyle=`rgb(${[tone,tone*.995,tone*.99].map(v=>Math.round(v*255))})`;
    g.fillRect(x0,0,bw,PY);g.globalCompositeOperation='source-over';
    g.fillStyle='rgba(70,48,30,.30)';g.fillRect(x0,0,1,PY);
  }
  const im=g.getImageData(0,0,PX,PY),d=im.data,mean=[0,0,0];
  for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++)mean[k]+=d[i+k];
  for(let k=0;k<3;k++)mean[k]/=d.length/4;
  for(let i=0;i<d.length;i+=4){
    const l=(d[i]-mean[0])*.3+(d[i+1]-mean[1])*.59+(d[i+2]-mean[2])*.11;
    for(let k=0;k<3;k++)d[i+k]=Math.max(0,Math.min(255,d[i+k]+l*.35*mean[k]/mean[1]));
  }
  g.putImageData(im,0,0);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;return {map};
}
// Sheet UVs: headboard faces take the sheet by (z, y); the bed base runs its length
// along the grain (front by z, sides and top by x) on the two base boards.
function veneerUv(THREE,geo,box,isBase){
  const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=new Float32Array(p.count*2);
  const {W,H}=VENEER;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),nx=n?Math.abs(n.getX(i)):0,nz=n?Math.abs(n.getZ(i)):0;
    let u,v;
    if(!isBase){u=(z-box.min.z+.02)/W;v=(y-box.min.y+.4)/H;}
    else if(nx>.7){u=(3.45+(y-box.min.y))/W;v=(z-box.min.z+.03)/H;}
    else if(nz>.7){u=(3.91+(y-box.min.y))/W;v=(x-box.min.x+.03)/H;}
    else{u=(3.91+(z-box.min.z)*.17)/W;v=(x-box.min.x+.03)/H;}
    uv[i*2]=u;uv[i*2+1]=v;
  }
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}
// Alpha ramp for contact shadow strips: opaque at the plane's bottom edge (v = 0), soft.
function edgeFade(THREE){
  const c=document.createElement('canvas');c.width=4;c.height=64;const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,64,0,0);gr.addColorStop(0,'#fff');gr.addColorStop(.25,'#7a7a7a');gr.addColorStop(1,'#000');
  g.fillStyle=gr;g.fillRect(0,0,4,64);return new THREE.CanvasTexture(c);
}

function radialShadow(THREE){
  const N=64,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
  const grad=g.createRadialGradient(N/2,N/2,0,N/2,N/2,N/2);
  grad.addColorStop(0,'rgba(0,0,0,1)');grad.addColorStop(.5,'rgba(0,0,0,.55)');grad.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grad;g.fillRect(0,0,N,N);return new THREE.CanvasTexture(c);
}

function lathe(THREE,profile,segments){
  const geo=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),segments);
  geo.computeVertexNormals();return geo;
}

export async function apply(ctx){
  const {THREE}=ctx;

  // 1. Visible LED lines out: headboard strip (top edge of the oak panel), the ceiling
  // slit at the back left and the curtain-pocket line (concealed in render 3). Their
  // meshes do not emit in the bake (pocket, slit) or are proposed off (headboard).
  ctx.removeExported({material:'led',box:[
    [[.21,1.115,-9.29],[.245,1.145,-6.05]],    // Cama principal cabecero LED
    [[.20,2.50,-6.01],[.72,2.545,-5.96]],      // LED rendija Slot Principal
    [[.58,2.50,-9.35],[3.10,2.545,-9.31]]]});  // LED rendija Pocket Principal (ends at the screen)

  // 2. Rug: its top samples the floor's baked page (planar UVs, so the bed's contact
  // shadow and the window light fall on it as on the oak around it).
  const floors=ctx.staticMeshes.filter(m=>m.userData.exported?.material==='floor'&&m.geometry.getAttribute('uv1'));
  const tris=[];
  for(const mesh of floors){
    const g=mesh.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),l=g.getAttribute('uv1'),ix=g.index;
    const count=ix?ix.count:p.count;
    for(let i=0;i<count;i+=3){
      const v=[0,1,2].map(k=>ix?ix.getX(i+k):i+k);
      if(v.some(k=>Math.abs(p.getY(k))>.005||n.getY(k)<.9))continue;
      const xs=v.map(k=>p.getX(k)),zs=v.map(k=>p.getZ(k));
      if(Math.max(...xs)<RUG.x0||Math.min(...xs)>RUG.x1||Math.max(...zs)<RUG.z0||Math.min(...zs)>RUG.z1)continue;
      tris.push({xs,zs,uv:v.map(k=>[l.getX(k),l.getY(k)])});
    }
  }
  const lightUv=(x,z)=>{
    for(const t of tris){
      const [ax,bx,cx]=t.xs,[az,bz,cz]=t.zs,d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(d)<1e-9)continue;
      const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,c=1-a-b;
      if(a>-1e-4&&b>-1e-4&&c>-1e-4)return [0,1].map(k=>a*t.uv[0][k]+b*t.uv[1][k]+c*t.uv[2][k]);
    }
    return null;
  };
  const geo=new THREE.BoxGeometry(RUG.x1-RUG.x0,RUG.h,RUG.z1-RUG.z0);
  geo.translate((RUG.x0+RUG.x1)/2,RUG.h/2,(RUG.z0+RUG.z1)/2);
  const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv'),uv1=new Float32Array(pos.count*2);
  let baked=true;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i),u=lightUv(x,z);
    if(!u){baked=false;break;}
    uv1[i*2]=u[0];uv1[i*2+1]=u[1];uv.setXY(i,x,z);
  }
  let rugMat;
  if(baked){
    geo.setAttribute('uv1',new THREE.BufferAttribute(uv1,2));
    rugMat=ctx.cloneMaterial(ctx.lightmap.material(ctx.mats.rug,'rug','shared'));
  }else rugMat=ctx.cloneMaterial(ctx.mats.rug);
  // Oatmeal wool: greyer than the oak and about as dark (render 3).
  rugMat.color.set('#ab9c88');rugMat.sheenColor?.set('#d9cdbd');
  const rug=new THREE.Mesh(geo,rugMat);rug.name='Alfombra dormitorio principal';
  rug.receiveShadow=true;rug.userData.room='dormitorio';
  ctx.group.add(rug);ctx.staticMeshes.push(rug);
  if(!baked)ctx.lightRuntimeObject(rug);

  // 3. Oak of render 3: pale, neutral white oak. The baked light and the grade push
  // mid-dark wood to orange, so the tint is cool. Nightstands keep the shared 50 cm
  // veneer tile (grain raised); the headboard and the bed base get one continuous
  // veneer sheet each (see veneerSheet): no tile repeats across their 3.3 and 2 m.
  const grain=oakGrain(THREE,ctx.mats.wood.map);
  for(const piece of ctx.splitExported({material:'wood',box:[[.226,.32,-9.12],[.57,.5,-6.07]]})){
    piece.material.color.set('#d8dde6');
    if(grain){piece.material.map=grain;piece.material.needsUpdate=true;}
  }
  const sheet=veneerSheet(THREE,ctx.mats.wood.map);
  const headboard=ctx.splitExported({material:'wood',box:[[.19,0,-9.3],[.235,1.2,-6.0]]});
  const base=ctx.splitExported({material:'wood',box:[[.19,0,-8.75],[2.25,.3,-6.68]]});
  let panel=null;
  for(const [pieces,tint,isBase] of [[headboard,'#f6f6f8',false],[base,'#e3e8f0',true]]){
    const box=new THREE.Box3();for(const p of pieces){p.geometry.computeBoundingBox();box.union(p.geometry.boundingBox);}
    if(!isBase)panel=box;
    for(const piece of pieces){
      const m=piece.material;m.color.set(tint);
      if(!sheet)continue;
      veneerUv(THREE,piece.geometry,box,isBase);
      m.map=sheet.map;
      for(const k of ['normalMap','roughnessMap'])if(m[k]){m[k]=m[k].clone();m[k].repeat.set(VENEER.W/.5,VENEER.H/.5);m[k].needsUpdate=true;}
      m.needsUpdate=true;
    }
  }
  // Soft contact shadow where the 4.5 cm panel stands off the wall (top and both ends),
  // so it sits in the plaster instead of reading as a sticker.
  if(panel&&!panel.isEmpty()){
    const fade=edgeFade(THREE),wallX=panel.min.x+.0015,top=panel.max.y;
    const strip=(w,h,cx,cy,cz,rot,o)=>{
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:0x1a120a,alphaMap:fade,transparent:true,opacity:o,
        depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4,toneMapped:false}));
      m.rotation.set(0,Math.PI/2,rot);m.position.set(cx,cy,cz);m.renderOrder=1;ctx.group.add(m);
    };
    const W=panel.max.z-panel.min.z,cz=(panel.max.z+panel.min.z)/2;
    // Plane v (the fade) runs up for the top strip, away from the panel for the ends.
    strip(W+.03,.045,wallX,top+.0225,cz,0,.30);                      // above the top edge
    strip(top,.035,wallX,top/2,panel.max.z+.0175,Math.PI/2,.26);     // south end
    strip(top,.035,wallX,top/2,panel.min.z-.0175,-Math.PI/2,.26);    // north end
  }

  // 4. Vertical slot of render 3 beside the wardrobe front: a 3 cm reveal, floor to
  // ceiling, on the east jamb of the dressing-room opening (in render 3 the dark
  // vertical line where the wardrobe front ends, x ~ 1.46-1.52 m in this pose). Its
  // concealed light is proposed in r5-dormitorio.md (light_layout 'Slot Principal').
  const slot=new THREE.Mesh(new THREE.BoxGeometry(.03,2.55,.003),ctx.cloneMaterial(ctx.mats.dark));
  slot.position.set(1.545,2.55/2,-5.9115);slot.name='Ranura vertical dormitorio';
  ctx.group.add(slot);ctx.lightRuntimeObject(slot,{strength:.6});
  // 5. Sheers of render 3: the exported sheet (shared material, translucency .75, read
  // as a blown-out white block) becomes a ripple-fold voile, wall to screen, that lets
  // the windows and their frames show faintly (coverage ~50 %). Fold flanks seen edge-on
  // thin out, so each crest is a soft roll and not the hard edge of a slat; hem doubled,
  // no sheen.
  ctx.removeExported({material:'curtain',box:[[.55,-.1,-9.5],[3.1,2.7,-9.3]]});
  const voile=voileTexture(THREE);voile.repeat.set(1/.4,1/.4);
  const sheerMat=new THREE.MeshStandardMaterial({color:'#ece6dc',map:voile,roughness:1,metalness:0,vertexColors:true,
    transparent:true,depthWrite:false,side:THREE.DoubleSide});
  sheerMat.color.multiplyScalar(1.5);sheerMat.defines={USE_UV:''};
  sheerMat.userData.translucency=SHEER_T;
  sheerMat.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        {float hem=1.0-smoothstep(.085,.095,vUv.y);
        diffuseColor.a=mix(diffuseColor.a,1.0-(1.0-diffuseColor.a)*(1.0-diffuseColor.a),hem);
        float nv=abs(dot(normal,normalize(vViewPosition)));
        // Fold edges seen side-on fade instead of drawing a hard line (round, soft rolls).
        diffuseColor.a*=mix(.22,1.0,smoothstep(.05,.65,nv));}`)
      .replace('#include <lights_fragment_end>','reflectedLight.directSpecular=vec3(0.0);\n#include <lights_fragment_end>');
  };
  sheerMat.customProgramCacheKey=()=>'dormitorio-voile';
  // Two halves of the same voile, drawn by default (the render); E gathers each one at its end.
  const half=(3.085-.60)/2;
  ctx.addCurtain({name:'Cortinas dormitorio',material:sheerMat,z:-9.40,y0:.012,y1:2.55,pitch:.095,depth:.027,seed:19,t:0,
    panels:[{anchor:.60,dir:1,open:.26,closed:half},{anchor:3.085,dir:-1,open:.26,closed:half}]});

  // 6. Nightstand props of render 3 (tops at y 0.49): left, a stoneware bud vase with a
  // branch and two books; right, a low ceramic bowl. Lathes and boxes, a few hundred
  // triangles in all, probe lit, with soft contact shadows.
  const top=.49,props=new THREE.Group();props.name='Objetos mesillas';
  const stone=new THREE.MeshStandardMaterial({color:'#b3a593',roughness:.85});
  const vase=new THREE.Mesh(lathe(THREE,[[0,0],[.034,0],[.046,.035],[.05,.075],[.042,.12],[.018,.16],[.014,.175],[.017,.182],[.012,.182],[.01,.15]],20),stone);
  vase.scale.setScalar(1.35);vase.position.set(.33,top,-6.15);props.add(vase);
  // Branch: thin stems with small leaves.
  const r=rand(5),stemPos=[],leafPos=[];
  const stems=[[.33,-6.15,0,.34,-.04,.03],[.33,-6.15,0,.26,.05,-.04],[.33,-6.15,0,.20,-.05,-.07]];
  for(const [x,z,,h,dx,dz] of stems){
    const a=new THREE.Vector3(x,top+.22,z),b=new THREE.Vector3(x+dx,top+.22+h,z+dz),m=a.clone().lerp(b,.5).add(new THREE.Vector3(dx*.4,0,dz*.4));
    const curve=new THREE.QuadraticBezierCurve3(a,m,b);
    stemPos.push(new THREE.TubeGeometry(curve,6,.0035,4,false));
    for(let i=0;i<9;i++){
      const t=.25+.75*i/9,p=curve.getPoint(t),side=i%2?1:-1;
      const leaf=new THREE.PlaneGeometry(.026,.06);leaf.translate(0,.03,0);
      leaf.rotateZ(side*(.7+r()*.4));leaf.rotateY(r()*Math.PI*2);leaf.translate(p.x,p.y,p.z);leafPos.push(leaf);
    }
  }
  const merge=list=>{const geo=mergeGeometries(THREE,list);return geo;};
  const stemMesh=new THREE.Mesh(merge(stemPos),new THREE.MeshStandardMaterial({color:'#5b4a37',roughness:.9}));
  const leafMesh=new THREE.Mesh(merge(leafPos),new THREE.MeshStandardMaterial({color:'#6b7049',roughness:.8,side:THREE.DoubleSide}));
  props.add(stemMesh,leafMesh);
  // Books, spines toward the bed.
  const books=[[.22,.03,.16,'#d6cbb9',-.08],[.20,.022,.145,'#a9a093',.06]];
  let y=top;
  for(const [w,h,dpt,col,rot] of books){
    const b=new THREE.Mesh(new THREE.BoxGeometry(dpt,h,w),new THREE.MeshStandardMaterial({color:col,roughness:.8}));
    b.position.set(.43,y+h/2,-6.33);b.rotation.y=rot;props.add(b);y+=h;
  }
  // Bowl on the right nightstand.
  const bowl=new THREE.Mesh(lathe(THREE,[[0,.004],[.03,0],[.05,.006],[.072,.026],[.085,.052],[.081,.054],[.068,.03],[.045,.014],[0,.012]],28),
    new THREE.MeshStandardMaterial({color:'#9d958b',roughness:.7}));
  bowl.scale.set(1.3,1.2,1.3);bowl.position.set(.37,top,-8.90);props.add(bowl);
  ctx.group.add(props);ctx.lightRuntimeObject(props);
  const blob=radialShadow(THREE);
  for(const [x,z,sx,sz,o] of [[.33,-6.15,.2,.2,.55],[.43,-6.33,.28,.22,.35],[.37,-8.90,.28,.28,.45]]){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(sx,sz),new THREE.MeshBasicMaterial({color:0,map:blob,transparent:true,opacity:o,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4,toneMapped:false}));
    m.rotation.x=-Math.PI/2;m.position.set(x,top+.001,z);m.renderOrder=1;ctx.group.add(m);
  }

  // 7. Bed linen of render 3: washed linen with soft creases, not a smooth CGI shell.
  // bedding.mjs (shared) builds the dressing; here only its meshes in this room change:
  // the duvet, sheet cuff and throw get the same crease field (so the layers stay
  // concentric), the pillows a few dents, and a vertex tone darkens crease valleys and
  // the lower drape. Geometry and triangle count unchanged; materials cloned.
  crumpleBedding(ctx);
}

// Crease field of washed linen (metres, along the surface normal): broad swells plus
// tapered linear creases radiating loosely from the edges and the pillows.
function creaseField(seed,{x0,x1,z0,z1}){
  const n=noise2(seed),r=rand(seed),list=[];
  for(let k=0;k<34;k++){
    const cx=x0+r()*(x1-x0),cz=z0+r()*(z1-z0),ang=(r()-.5)*1.9+(r()<.5?0:Math.PI/2),len=.18+r()*.5,w=.016+r()*.03;
    list.push({cx,cz,dx:Math.cos(ang),dz:Math.sin(ang),len,w,amp:(r()<.6?-1:1)*(.003+r()*.005),bend:(r()-.5)*1.2});
  }
  return (x,z)=>{
    let h=.006*n(x/.26,z/.26)+.0025*n(x/.10+5,z/.10+3);
    for(const c of list){
      const ox=x-c.cx,oz=z-c.cz,s=ox*c.dx+oz*c.dz;if(Math.abs(s)>c.len/2)continue;
      const q=-ox*c.dz+oz*c.dx-c.bend*s*s;if(Math.abs(q)>c.w*3)continue;
      const t=Math.sin(Math.PI*(s/c.len+.5));h+=c.amp*t*t*Math.exp(-q*q/(c.w*c.w));
    }
    return h;
  };
}
function crumpleBedding(ctx){
  const {THREE}=ctx,bed={x0:.2,x1:2.2,z0:-8.71,z1:-6.71};
  // The bedding group: parent of the mattress (ExtrudeGeometry) inside the bed footprint.
  const mattress=ctx.staticMeshes.find(m=>!m.userData.exported&&m.geometry?.type==='ExtrudeGeometry'&&m.material?.isMeshPhysicalMaterial&&
    (m.geometry.computeBoundingBox(),m.geometry.boundingBox.getCenter(new THREE.Vector3()).distanceTo(new THREE.Vector3(1.2,.4,-7.71))<.3));
  const group=mattress?.parent;if(!group)return;
  const top=creaseField(61,bed),side=noise2(67);
  const toned=(mesh,normalScale)=>{
    const m=mesh.material.clone();m.vertexColors=true;m.color.multiplyScalar(.93);if(normalScale)m.normalScale.multiplyScalar(normalScale);mesh.material=m;
  };
  for(const mesh of group.children){
    if(!mesh.isMesh||mesh===mattress||!mesh.geometry.index)continue;
    const g=mesh.geometry,p=g.getAttribute('position'),nr=g.getAttribute('normal'),col=new Float32Array(p.count*3);
    const disp=new Float32Array(p.count);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),ny=nr.getY(i),wt=Math.min(1,Math.max(0,(ny-.45)/.4));
      // Hanging sides: soft irregular swells running down the drape.
      const along=Math.abs(nr.getZ(i))>Math.abs(nr.getX(i))?x:z;
      const hang=Math.min(1,Math.max(0,(.50-y)/.08));
      disp[i]=wt*top(x,z)+(1-wt)*hang*(.008*side(along/.08,y/.45)+.004*side(along/.03+9,y/.2));
    }
    for(let i=0;i<p.count;i++){
      const d=disp[i];
      p.setXYZ(i,p.getX(i)+nr.getX(i)*d,p.getY(i)+nr.getY(i)*d,p.getZ(i)+nr.getZ(i)*d);
      const y=p.getY(i),low=Math.min(1,Math.max(0,(.47-y)/.22));
      const v=(1+Math.max(-1,Math.min(1,d/.006))*.18)*(1-.22*low);
      col.set([v,v,v],i*3);
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();
    toned(mesh,1.25);
  }
  // Pillows: dents and a couple of creases on each face.
  let seed=71;
  group.traverse(o=>{
    if(!o.isMesh||o.parent===group||o.geometry.type==='TubeGeometry'||!o.geometry.index)return;
    const g=o.geometry,p=g.getAttribute('position'),nr=g.getAttribute('normal'),f=creaseField(seed++,{x0:-.35,x1:.35,z0:-.24,z1:.24});
    const col=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),edge=Math.max(Math.abs(x)/.4,Math.abs(y)/.27),w=Math.max(0,1-edge**4);
      const d=f(x,y)*1.3*w;
      p.setXYZ(i,x+nr.getX(i)*d,y+nr.getY(i)*d,p.getZ(i)+nr.getZ(i)*d);
      const v=1+Math.max(-1,Math.min(1,d/.005))*.06;col.set([v,v,v],i*3);
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();
    toned(o,1.2);
  });
}

// Minimal non-indexed merge of position/normal/uv (same attribute set).
function mergeGeometries(THREE,list){
  const flat=list.map(g=>g.index?g.toNonIndexed():g),out=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv']){
    const size=flat[0].getAttribute(name).itemSize,total=flat.reduce((n,g)=>n+g.getAttribute(name).count,0),arr=new Float32Array(total*size);
    let o=0;for(const g of flat){arr.set(g.getAttribute(name).array,o);o+=g.getAttribute(name).array.length;}
    out.setAttribute(name,new THREE.BufferAttribute(arr,size));
  }
  return out;
}
