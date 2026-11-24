// Dormitorio abierto al baño (menu option, off by default = the plan): Jorge's variant of
// 16/11/2026. Not in the proyecto de ejecución.
//
// In the plan the master bedroom reaches the vestidor y baño through two sliding doors,
// P8 «Suite izquierda» (x 0,723-1,523) and P9 «Suite derecha» (x 3,684-4,484), either side of
// a central block x 1,523-3,684: a double pocket wall (z -5,91/-5,66, its bedroom face plastered,
// light switches on it) and, on the bath side, the wardrobe A2 (196 x 60 cm, glass doors,
// shirts and shoes) between two 10 cm cheeks, its front at z -5,06.
// With the option on:
// - the whole block goes (walls, both cheeks, A2 with its fronts, clothes, shoes and LED strips,
//   the five switches on it): what A2 held is lost;
// - in its place, on A2's front line, a floor-to-ceiling oak palillería: 24 laths of 40 x 40 mm
//   with 52 mm gaps over the block's 2,161 m (z -5,10/-5,06, 2,20 m to the vestidor's false
//   ceiling), so the bath is seen from the bed and back; above the old wall line a plaster
//   bulkhead (2,20-2,55) closes the bedroom's higher ceiling, as over the doors;
// - P8 and P9 go, with the oak fascias over them: both ways are open (no colliders);
// - so does the study's glass screen (M3, arched oak frame at x 3,124, z -9,51/-5,91, floor to
//   ceiling: fixed panes, the French pair and its transom, app.js 'Mampara estudio'): the study
//   is open to the bedroom; only the façade pillar (Estructura, x 2,927-3,191, z -9,73/-9,51)
//   stays. The partition round the screen (two stubs, z -9,51/-9,21 and -6,21/-5,91, the lintel
//   over 2,20 and their skirtings) is gone in both versions (Jorge, 18/11/2026), carved out
//   here at load with a ceiling strip where it met the 2,55 m ceiling;
// - the bedroom's oak runs on to the palillería's line, z -5,06, wall to wall through both doorways
//   (floor shader, uniform suiteOpen); the vestidor y baño keeps its stone (Jorge, 16/11);
// - the freestanding tub moves 92,85 cm north, its rim 8 cm from the palillería, turned half a
//   turn so its floor-standing mixer (which stood on the north side, now 8 cm from the laths)
//   goes with it to the bath side, with a soft contact shadow of its own.
// Nothing is baked: the bake still sees the block, the doors' fascias and the old tub. Where the
// block stood (and 12 cm into each doorway) the floor's light is taken from the vestidor floor in
// front of the palillería (mirrored) blending into the bedroom's floor 20 cm clear of the old
// wall; the tub's old baked shadow is replaced by the rows 30 cm north and south of it
// (floorBakedFix in app.js, charts from fitChart below); the false ceiling over A2 is covered by
// the bulkhead's soffit; the bake's light still stops at the block line (no light through the
// laths in the lightmaps), the new pieces take the probes.

const BLOCK={x0:1.523,x1:3.684,z0:-5.91,z1:-5.06};            // pocket wall + cheeks + A2
const LATTICE={z0:-5.10,z1:-5.06,y1:2.20,lath:.04,count:24};   // oak laths, floor to the false ceiling
const BULKHEAD={y0:2.20,y1:2.55};                               // bedroom ceiling is at 2,55
const TUB={x:2.6031,z:-3.6513,b:.4002,gap:.08};                 // rooms/bano.mjs: centre, half width
const TUB_DZ=(LATTICE.z1+TUB.gap+TUB.b)-TUB.z;                  // -0,9285 m
const MIXER=[2.10,-4.10];                                       // rooms/bano.mjs floor mixer
// Colliders of the block (house.json: Tabique x3, the cheeks, A2's body) and the old tub.
export const inBlock=c=>{const xs=c.poly.map(p=>p[0]),zs=c.poly.map(p=>p[1]);
  return Math.min(...xs)>=BLOCK.x0-.002&&Math.max(...xs)<=BLOCK.x1+.002&&Math.min(...zs)>=BLOCK.z0-.002&&Math.max(...zs)<=BLOCK.z1+.002;};

export function createSuiteAbierta(THREE,{scene,staticMeshes,data,doors,fronts,colliders,lightObject,lighting,mats,cloneMaterial,floor}){
  const group=new THREE.Group();group.name='Dormitorio abierto al baño';scene.add(group);
  const hidden=[];          // meshes holding what the option removes (visible when off)

  // ---- What goes: every triangle wholly inside the block (or the fascia over P9). ----
  const E=.003;
  const inBox=(b,x,y,z)=>x>=b[0]-E&&x<=b[3]+E&&y>=b[1]-E&&y<=b[4]+E&&z>=b[2]-E&&z<=b[5]+E;
  const BOXES=[
    [BLOCK.x0-.02,-.01,BLOCK.z0-.02,BLOCK.x1+.015,BULKHEAD.y1,BLOCK.z1+.015],   // switches stand 9 mm proud, skirtings 12 mm
    [3.684,2.19,-5.945,4.484,2.51,-5.92],                                       // oak fascia over P9
    [0.723,2.19,-5.945,1.523,2.51,-5.92],                                       // and over P8
  ];
  const PARTITION=[[3.07,-.005,-9.53,3.21,2.64,-5.905]];                       // bedroom/study partition: stubs, lintel, skirtings
  // The bedroom/estudio partition (x 3,091-3,192) ends against the block: its end face stays.
  const keepFace=()=>false;
  // The study screen (app.js 'Mampara estudio') stands inside the partition's box: never carved.
  const skip=o=>{for(let n=o;n;n=n.parent){if(n===group||n.userData.door||n.userData.frontGroup||n.name==='Mampara estudio')return true;}return false;};
  const users=new Map();scene.traverse(o=>{if(o.isMesh)users.set(o.geometry,(users.get(o.geometry)||0)+1);});
  scene.updateMatrixWorld(true);
  const A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3(),n=new THREE.Vector3(),box=new THREE.Box3();
  // Splits every triangle wholly inside one of `BOXES` into its own mesh; returns the meshes to hide.
  const carve=(BOXES,label)=>{
  const meshes=[],hidden=[];scene.traverse(o=>{if(o.isMesh&&!o.isReflector&&!skip(o)&&!o.userData.split&&o.geometry?.getAttribute('position'))meshes.push(o);});
  for(const mesh of meshes){
    const geo=mesh.geometry;
    if(!geo.boundingBox)geo.computeBoundingBox();
    box.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld);
    if(!BOXES.some(b=>box.max.x>=b[0]&&box.min.x<=b[3]&&box.max.y>=b[1]&&box.min.y<=b[4]&&box.max.z>=b[2]&&box.min.z<=b[5]))continue;
    if(Array.isArray(mesh.material)||geo.groups.length>1)continue;
    const pos=geo.getAttribute('position'),index=geo.index,count=index?index.count:pos.count,keep=[],hit=[];
    for(let i=0;i<count;i+=3){
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      A.fromBufferAttribute(pos,a).applyMatrix4(mesh.matrixWorld);B.fromBufferAttribute(pos,b).applyMatrix4(mesh.matrixWorld);C.fromBufferAttribute(pos,c).applyMatrix4(mesh.matrixWorld);
      n.subVectors(C,B).cross(A.clone().sub(B)).normalize();
      const out=BOXES.some(bx=>[A,B,C].every(p=>inBox(bx,p.x,p.y,p.z)))&&!keepFace(A,B,C,n);
      (out?hit:keep).push(a,b,c);
    }
    if(!hit.length)continue;
    if(!keep.length){hidden.push(mesh);continue;}
    if(users.get(geo)>1){console.warn('[suite-abierta] shared geometry left in place:',mesh.name);continue;}
    const part=new THREE.BufferGeometry();
    for(const [name,attr] of Object.entries(geo.attributes)){
      const size=attr.itemSize,src=attr.isInterleavedBufferAttribute?attr.data.array:attr.array;
      const stride=attr.isInterleavedBufferAttribute?attr.data.stride:size,offset=attr.isInterleavedBufferAttribute?attr.offset:0;
      const array=new src.constructor(hit.length*size);
      for(let i=0;i<hit.length;i++)for(let k=0;k<size;k++)array[i*size+k]=src[hit[i]*stride+offset+k];
      part.setAttribute(name,new THREE.BufferAttribute(array,size,attr.normalized));
    }
    part.computeBoundingSphere();
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(keep),1));
    const piece=new THREE.Mesh(part,mesh.material);piece.name=(mesh.name||'')+' ('+label+')';
    piece.matrixAutoUpdate=false;piece.matrix.copy(mesh.matrix);
    Object.assign(piece,{castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,renderOrder:mesh.renderOrder,frustumCulled:mesh.frustumCulled});
    piece.onBeforeRender=mesh.onBeforeRender;
    piece.userData={...mesh.userData,split:'suite-abierta'};
    mesh.parent.add(piece);if(staticMeshes.includes(mesh))staticMeshes.push(piece);
    hidden.push(piece);
  }
  return hidden;};
  // The partition first (always gone), then the block (gone with the option).
  const partition=carve(PARTITION,'tabique del estudio');
  for(const m of partition)m.visible=false;
  hidden.push(...carve(BOXES,'bloque central'));
  // A2's shoes (rooms/vestidor.mjs: instanced pairs, which the carving above cannot see):
  // the instances standing in the block collapse to nothing with the option on.
  const shoes=[];{const m4=new THREE.Matrix4(),p=new THREE.Vector3();
    scene.traverse(o=>{if(!o.isInstancedMesh||!/^Vestidor zapato/.test(o.name))return;
      o.updateMatrixWorld(true);const idx=[],keep=[];
      for(let i=0;i<o.count;i++){o.getMatrixAt(i,m4);p.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld);
        if(p.x>BLOCK.x0-.02&&p.x<BLOCK.x1+.02&&p.z>BLOCK.z0-.02&&p.z<BLOCK.z1+.05){idx.push(i);keep.push(m4.clone());}}
      if(idx.length)shoes.push({mesh:o,idx,keep});});}
  const hideShoes=on=>{const zero=new THREE.Matrix4().makeScale(0,0,0);
    for(const {mesh,idx,keep} of shoes){idx.forEach((i,k)=>mesh.setMatrixAt(i,on?zero:keep[k]));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}};
  // A2's eight fronts (glass doors and drawers): lifted closed into their groups, hidden with it.
  const a2=fronts.list.filter(f=>{const [x,z]=f.pivot||[0,0];return x>BLOCK.x0&&x<BLOCK.x1&&z>BLOCK.z0&&z<BLOCK.z1+.02;});
  for(const f of a2)fronts.set(f,0);
  const frontGroups=a2.map(f=>f.group).filter(Boolean);
  const gone=doors.filter(d=>['Suite derecha','Suite izquierda','Estudio'].includes(d.name));
  const screen=scene.getObjectByName('Mampara estudio');
  // The screen's panes and the partition's two stubs (the façade pillar, Estructura 2,927-3,191, stays).
  const screenColliders=colliders.filter(c=>c.name==='Vidrio fijo estudio');   // app.js drops the stubs' colliders
  const blockColliders=colliders.filter(inBlock);
  const tubCollider=colliders.find(c=>c.name==='Banera exenta piedra crema');

  // ---- Palillería, bulkhead (runtime geometry, lit by the probes). ----
  const boxGeo=(x0,x1,y0,y1,z0,z1)=>{
    const g=new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0);
    const p=g.getAttribute('position'),nn=g.getAttribute('normal'),uv=g.getAttribute('uv');
    // Metric UVs as the exported joinery: u along the face, v up (the grain runs up the laths).
    for(let i=0;i<p.count;i++){
      const x=p.getX(i)+(x0+x1)/2,y=p.getY(i)+(y0+y1)/2,z=p.getZ(i)+(z0+z1)/2;
      const ax=Math.abs(nn.getX(i)),ay=Math.abs(nn.getY(i));
      uv.setXY(i,ax>.5?-z:x,ay>.5?-z:y);
    }
    g.translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);return g;
  };
  const merge=list=>{
    const out=new THREE.BufferGeometry(),attrs=['position','normal','uv'];let total=0;
    for(const g of list)total+=g.index.count;
    const arrays=attrs.map(k=>new Float32Array(total*(k==='uv'?2:3)));let o=0;
    for(const g of list){const idx=g.index.array;for(let i=0;i<idx.length;i++,o++)attrs.forEach((k,j)=>{const a=g.getAttribute(k),s=a.itemSize;for(let c=0;c<s;c++)arrays[j][o*s+c]=a.array[idx[i]*s+c];});}
    attrs.forEach((k,j)=>out.setAttribute(k,new THREE.BufferAttribute(arrays[j],k==='uv'?2:3)));
    out.computeBoundingSphere();return out;
  };
  const W=BLOCK.x1-BLOCK.x0,gap=(W-LATTICE.count*LATTICE.lath)/(LATTICE.count-1);
  const laths=[];
  for(let i=0;i<LATTICE.count;i++){const x=BLOCK.x0+i*(LATTICE.lath+gap);laths.push(boxGeo(x,x+LATTICE.lath,0,LATTICE.y1,LATTICE.z0,LATTICE.z1));}
  const oak=new THREE.Mesh(merge(laths),cloneMaterial(mats.wood));oak.name='Palillería roble';
  oak.castShadow=oak.receiveShadow=true;
  // Bulkhead: over the old wall line, the two cheeks (the false ceiling spans A2 only) and A2.
  // It reaches down to the palillería 2 mm under the false ceiling: over A2 that ceiling keeps
  // the wardrobe's baked shade, which the bulkhead's probe-lit soffit covers.
  // And a 10 cm ceiling strip where the bedroom/study partition met the 2,55 m ceiling (the ceilings
  // of both rooms stop at it).
  const plaster=new THREE.Mesh(merge([boxGeo(BLOCK.x0,BLOCK.x1,BULKHEAD.y0-.002,BULKHEAD.y1,BLOCK.z0,BLOCK.z1)]),new THREE.MeshStandardMaterial({color:'#efe9e1',roughness:.92}));
  const strip=new THREE.Mesh(merge([boxGeo(3.088,3.194,BULKHEAD.y1-.002,BULKHEAD.y1+.05,-9.512,BLOCK.z0)]),plaster.material.clone());strip.name='Techo sobre el tabique del estudio';
  plaster.name='Dintel dormitorio abierto';plaster.receiveShadow=true;
  // The pillar's and the block's faces where the stubs met them were never lit by the bake: a
  // 4 mm plaster skin over each (the screen's jambs stand against them). The block's goes with
  // the block: with the option on it stood alone as a thin white post between the study and the
  // palillería (Jorge, 24/11/2026).
  const ends=new THREE.Mesh(merge([boxGeo(3.088,3.194,0,BULKHEAD.y1,-9.512,-9.506)]),plaster.material.clone());
  ends.name='Testa del tabique del estudio (pilar)';ends.receiveShadow=true;
  const blockEnd=new THREE.Mesh(merge([boxGeo(3.088,3.194,0,BULKHEAD.y1,BLOCK.z0-.004,BLOCK.z0+.002)]),plaster.material.clone());
  blockEnd.name='Testa del tabique del estudio (bloque)';blockEnd.receiveShadow=true;
  lightObject(oak,lighting,1.15);lightObject(plaster,lighting,1.3);lightObject(strip,lighting,1.7);lightObject(ends,lighting,1.3);lightObject(blockEnd,lighting,1.3);
  for(const m of [oak,plaster]){group.add(m);staticMeshes.push(m);}
  for(const m of [strip,ends,blockEnd]){scene.add(m);staticMeshes.push(m);}
  hidden.push(blockEnd);

  // ---- Tub and its floor mixer (rooms/bano.mjs), on a pivot at the tub's centre. ----
  const pivot=new THREE.Group();pivot.name='Bañera desplazada';pivot.position.set(TUB.x,0,TUB.z);scene.add(pivot);pivot.updateMatrixWorld(true);
  const bano=scene.getObjectByName('room:bano'),moved=[];
  if(bano){
    const c=new THREE.Vector3();
    for(const o of [...bano.children]){
      if(!o.isMesh)continue;
      let take=['Banera exenta resina','Banera desague','Banera sombra contacto'].includes(o.name);
      if(!take){box.setFromObject(o);box.getCenter(c);take=Math.hypot(c.x-MIXER[0],c.z-MIXER[1])<.25&&box.max.y<1.2&&box.max.y-box.min.y<1.2;}
      if(take){pivot.attach(o);moved.push(o);}
    }
  }
  let tubShadow=null;
  // A soft contact shadow of its own under the tub (the moved decal of rooms/bano.mjs is faint on oak).
  {
    const w=256,h=128,cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');
    const grad=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    grad.addColorStop(0,'rgba(255,255,255,.75)');grad.addColorStop(.62,'rgba(255,255,255,.6)');grad.addColorStop(.8,'rgba(255,255,255,.22)');grad.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=grad;g.fillRect(0,0,w,h);
    const img=g.getImageData(0,0,w,h);for(let i=0;i<img.data.length;i+=4){const a=img.data[i+3];img.data[i]=img.data[i+1]=img.data[i+2]=a;img.data[i+3]=255;}g.putImageData(img,0,0);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.60+.5,.80+.5).rotateX(-Math.PI/2),
      new THREE.MeshBasicMaterial({color:0x000000,alphaMap:new THREE.CanvasTexture(cv),transparent:true,opacity:.42,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}));
    shadow.position.set(TUB.x,.004,TUB.z+TUB_DZ);tubShadow=shadow;shadow.renderOrder=1;shadow.name='Bañera sombra de contacto (dormitorio abierto)';group.add(shadow);
  }
  const polys=[];
  for(let i=0;i<LATTICE.count;i++){const x=BLOCK.x0+i*(LATTICE.lath+gap);polys.push([[x,LATTICE.z0],[x+LATTICE.lath,LATTICE.z0],[x+LATTICE.lath,LATTICE.z1],[x,LATTICE.z1]]);}
  // One rectangle for the whole palillería (the gaps are far narrower than the walker).
  const latticePoly=[[BLOCK.x0,LATTICE.z0],[BLOCK.x1,LATTICE.z0],[BLOCK.x1,LATTICE.z1],[BLOCK.x0,LATTICE.z1]];
  const tubPoly=tubCollider?tubCollider.poly.map(([x,z])=>[x,z+TUB_DZ]):[];

  const state={on:false,group,moved:moved.length,lathGap:gap,tubShift:TUB_DZ,
    polys:[latticePoly,...(tubPoly.length?[tubPoly]:[])],
    // Where the visitor must not stand when the option changes: the new pieces when it turns
    // on, the block and the tub's own place when it turns off.
    // With its own bake (scripts/bake_abierto.py) the floor carries the tub's shadow: no decal of its own.
    baked(on){if(tubShadow)tubShadow.visible=!on;},
    blockedBy(on){return on?state.polys:[[[BLOCK.x0,BLOCK.z0],[BLOCK.x1,BLOCK.z0],[BLOCK.x1,BLOCK.z1],[BLOCK.x0,BLOCK.z1]],[[3.091,-9.51],[3.192,-9.51],[3.192,-5.91],[3.091,-5.91]],...(tubCollider?[tubCollider.poly]:[])];},
    set(on){
      state.on=on;group.visible=on;floor.value=on?1:0;
      for(const m of hidden)m.visible=!on;
      hideShoes(on);
      for(const g of frontGroups)g.visible=!on;
      if(on)for(const f of a2){f.t=f.goal=0;fronts.set(f,0);}
      for(const c of blockColliders)c.off=on;
      if(tubCollider)tubCollider.off=on;
      for(const d of gone){d.active=!on;for(const g of d.groups)g.visible=!on;if(on)d.t=d.goal=0;}
      if(screen)screen.visible=!on;
      for(const c of screenColliders)c.off=on;
      pivot.rotation.y=on?Math.PI:0;pivot.position.z=TUB.z+(on?TUB_DZ:0);pivot.updateMatrixWorld(true);
    }};
  state.set(false);
  console.info(`[suite-abierta] ${partition.length} meshes gone with the study partition, ${hidden.length} meshes hidden with the block, ${a2.length} fronts, ${blockColliders.length} colliders, ${moved.length} tub pieces, ${shoes.reduce((n,s)=>n+s.idx.length,0)} shoes; laths ${LATTICE.count} x ${LATTICE.lath*1000} mm, gap ${(gap*1000).toFixed(1)} mm`);
  return state;
}

// The floor's baked light as a linear chart of world x, z (bakedUv = vLightMapUv * (2, 1)),
// fitted on the floor's own triangles: [u, v] each as (a, b, c) for a*x + b*z + c. Points are
// sampled in the region and read through their triangle; null if the region is not one chart.
export function fitChart(THREE,floorMesh,[x0,z0,x1,z1]){
  const geo=floorMesh.geometry,pos=geo.getAttribute('position'),uv=geo.getAttribute('uv1'),nor=geo.getAttribute('normal');
  if(!uv)return null;
  const index=geo.index,count=index?index.count:pos.count,tris=[];
  for(let i=0;i<count;i+=3){
    const v=[0,1,2].map(k=>index?index.getX(i+k):i+k);
    if(nor.getY(v[0])<.9||Math.abs(pos.getY(v[0]))>.003)continue;
    tris.push(v.map(k=>[pos.getX(k),pos.getZ(k),uv.getX(k)*2,uv.getY(k)]));
  }
  const rows=[];
  for(let i=0;i<=8;i++)for(let j=0;j<=8;j++){
    const x=x0+(x1-x0)*i/8,z=z0+(z1-z0)*j/8;
    for(const [a,b,c] of tris){
      const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-12)continue;
      const l1=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(z-c[1]))/den,l2=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(z-c[1]))/den,l3=1-l1-l2;
      if(l1<-1e-6||l2<-1e-6||l3<-1e-6)continue;
      rows.push([x,z,l1*a[2]+l2*b[2]+l3*c[2],l1*a[3]+l2*b[3]+l3*c[3]]);break;
    }
  }
  if(rows.length<40)return null;
  // Least squares on [x, z, 1] for u and v.
  const solve=k=>{
    const M=[[0,0,0],[0,0,0],[0,0,0]],r=[0,0,0];
    for(const row of rows){const f=[row[0],row[1],1];for(let i=0;i<3;i++){r[i]+=f[i]*row[k];for(let j=0;j<3;j++)M[i][j]+=f[i]*f[j];}}
    const m=new THREE.Matrix3().set(...M[0],...M[1],...M[2]).invert().elements;   // column-major
    return [0,1,2].map(i=>m[i]*r[0]+m[3+i]*r[1]+m[6+i]*r[2]);
  };
  const U=solve(2),V=solve(3);
  const err=Math.max(...rows.map(([x,z,u,v])=>Math.max(Math.abs(U[0]*x+U[1]*z+U[2]-u),Math.abs(V[0]*x+V[1]*z+V[2]-v))));
  return err<4e-4?{u:U,v:V,err,points:rows.length}:null;
}
