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
const SHEER_T=.3;
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
  for(let i=0;i<70;i++){const x=Math.floor(r()*N),w=1+Math.floor(r()*3),a=(r()-.3)*.22;for(let k=0;k<w;k++)warp[(x+k)%N]+=a;}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const p=(y*N+x)*4,s=warp[x]+weft[y];
    const v=.5+s*.35;
    d[p]=d[p+1]=d[p+2]=Math.round(Math.max(0,Math.min(1,v))*255);
    d[p+3]=Math.round(Math.max(0,Math.min(1,.50+s))*255);
  }
  g.putImageData(im,0,0);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=8;t.premultiplyAlpha=false;return t;
}

// Ripple-fold sheer along x (x0..x1) at depth z, from y0 to y1, pleats ~14 cm, uneven.
// Metric UVs (u = x, v = y). Shading normals keep 35 % of the pleat turn; vertex colour
// shades the back of each fold (the probes carry no occlusion at that scale).
function sheerGeometry(THREE,{x0,x1,z,y0,y1,pitch=.14,depth=.045}){
  const r=rand(7),cols=Math.round((x1-x0)/pitch*9),rows=[y0,y0+.07,1.0,y1];
  const pts=[];let phase=0;
  for(let i=0;i<=cols;i++){
    const x=x0+(x1-x0)*i/cols,lam=pitch*(1+.16*Math.sin(x*7.3)+.10*Math.sin(x*19.1+1)+.06*(r()-.5));
    if(i)phase+=2*Math.PI*(x1-x0)/cols/lam;
    const amp=depth*(.75+.25*Math.sin(x*4.1+2)*Math.sin(x*11.3));
    pts.push([x,amp*Math.sin(phase),amp*Math.cos(phase)*2*Math.PI/lam,Math.sin(phase)]);
  }
  const pos=[],nor=[],uv=[],col=[],idx=[];
  for(const [j,y] of rows.entries())for(const [x,dz,slope,f] of pts){
    // Fuller toward the hem (cloth weight).
    const k=1+.15*(1-Math.min(1,(y-y0)/1.2));
    pos.push(x,y,z+dz*k);
    const nx=-slope*k*.35,l=Math.hypot(nx,1);nor.push(nx/l,0,1/l);uv.push(x,y);
    const ao=.80+.20*(f*.5+.5);col.push(ao,ao,ao);
  }
  const W=pts.length;
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<W-1;i++){const a=j*W+i,b=a+1,c=a+W,d=c+1;idx.push(a,b,d,a,d,c);}
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geo.setIndex(idx);return geo;
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

  // 3. Oak of render 3: pale, neutral white oak with a legible grain. The baked light
  // and the grade push mid-dark wood to orange, so the tint is cool, and the veneer's
  // own grain (stddev ~7/255, it read as a flat colour) is raised.
  const grain=oakGrain(THREE,ctx.mats.wood.map);
  const tints=[['nightstands',[[.226,.32,-9.12],[.57,.5,-6.07]],'#d8dde6'],
    ['headboard',[[.19,0,-9.3],[.235,1.2,-6.0]],'#f4f5f8'],
    ['base',[[.19,0,-8.75],[2.25,.3,-6.68]],'#dde5f0']];
  for(const [,box,tint] of tints)for(const piece of ctx.splitExported({material:'wood',box})){
    piece.material.color.set(tint);
    if(grain){piece.material.map=grain;piece.material.needsUpdate=true;}
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
  // the windows and their frames show faintly. Coverage rises toward grazing views (the
  // side of each pleat reads denser, its face thinner), hem doubled, no sheen.
  ctx.removeExported({material:'curtain',box:[[.55,-.1,-9.5],[3.1,2.7,-9.3]]});
  const voile=voileTexture(THREE);voile.repeat.set(1/.4,1/.4);
  const sheerMat=new THREE.MeshStandardMaterial({color:'#ece6dc',map:voile,roughness:1,metalness:0,vertexColors:true,
    transparent:true,depthWrite:false,side:THREE.DoubleSide});
  sheerMat.color.multiplyScalar(2);sheerMat.defines={USE_UV:''};
  sheerMat.userData.translucency=SHEER_T;
  sheerMat.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        {float hem=1.0-smoothstep(.085,.095,vUv.y);
        diffuseColor.a=mix(diffuseColor.a,1.0-(1.0-diffuseColor.a)*(1.0-diffuseColor.a),hem);
        float nv=max(abs(dot(normal,normalize(vViewPosition))),.12);
        diffuseColor.a=1.0-pow(1.0-diffuseColor.a,mix(1.0,1.0/nv,.45));}`)
      .replace('#include <lights_fragment_end>','reflectedLight.directSpecular=vec3(0.0);\n#include <lights_fragment_end>');
  };
  sheerMat.customProgramCacheKey=()=>'dormitorio-voile';
  const sheer=new THREE.Mesh(sheerGeometry(THREE,{x0:.60,x1:3.085,z:-9.40,y0:.015,y1:2.55}),sheerMat);
  sheer.name='Visillo dormitorio principal';
  ctx.group.add(sheer);ctx.lightRuntimeObject(sheer);

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
