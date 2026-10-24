// Dormitorio principal y estudio diáfanos (menu option, off by default = the plan).
// On: the M3 screen (G06: fixed lites and the sliding pair), the two 30 cm piers (G01)
// that frame it, the head wall above it and the skirting (H03) round the piers go, so
// bedroom and study are one room. The bake is not recomputed: the removed triangles are
// split into meshes of their own (hidden), and the floor, ceiling and wall faces they
// covered, baked dark, get patches whose lightmap UVs are read from the lit surface
// beside them. Both rooms already share the oak floor (H01), the 2.55 m ceiling and the
// cove that runs round both (D02), so nothing else changes.

// World metres (x east, y up, z south). Piers: x 3.091-3.192, z -9.51..-9.21 and
// -6.21..-5.91; head wall x 3.074-3.174 from 2.20 to 2.55; skirting 1.2 cm either side.
// The facade pier (z -9.51) and the wall to the suite (z -5.91) stay.
const REMOVED=[[3.07,-.01,-9.505],[3.21,2.56,-5.925]];
const isRemoved=c=>c.name==='Vidrio fijo estudio'||
  (c.name==='Tabique'&&c.poly.every(([x,z])=>x>3.08&&x<3.2&&z>-9.52&&z<-5.9));
export const openPlanColliders=colliders=>colliders.filter(c=>!isRemoved(c));

// Patches: [material, plane axis, plane value, facing sign, target [[a0,b0],[a1,b1]],
// source rect]. Plane coordinates (a, b) are (x, z) on a floor or ceiling and (x, y)
// on a wall facing ±z. A patch reaches 6 cm past the old faces, over the darkened
// contact band, and reads a lit strip the same size further out; where both sides are
// lit it is split in two, each half reading its own side.
const W=[3.02,3.141],E=[3.141,3.262],SHIFT=.18;
const strips=(material,axis,value,sign,[b0,b1],[w0,w1]=W,[e0,e1]=E,d=SHIFT)=>[
  [material,axis,value,sign,[[w0,b0],[w1,b1]],[[w0-d,b0],[w1-d,b1]]],
  [material,axis,value,sign,[[e0,b0],[e1,b1]],[[e0+d,b0],[e1+d,b1]]]];
const PATCHES=[
  // Floor under the piers, their skirting and the contact band round them.
  ...strips('floor','y',0,1,[-9.510,-9.150]),...strips('floor','y',0,1,[-6.270,-5.910]),
  // Ceiling over the piers and the head wall.
  ...strips('wall','y',2.55,-1,[-9.510,-5.910],[3.014,3.133],[3.133,3.252],.2),
  // Facade pier: glazing at x 2.927 and 3.191, so its strip reads the narrow lit
  // part of the pier west of the old contact band.
  ['wall','z',-9.510,1,[[3.02,0],[3.191,2.55]],[[2.95,0],[3.02,2.55]]],
  // Wall to the suite, and the head band in front of it from 2.20.
  ...strips('wall','z',-5.910,-1,[0,2.20]),
  ['wall','z',-5.917,-1,[[3.02,2.20],[3.191,2.55]],[[2.84,2.20],[3.011,2.55]]],
  // Skirting where it met the piers: front and top faces.
  ['white','z',-9.498,1,[[3.091,0],[3.191,.08]],[[2.97,0],[3.07,.08]]],
  ['white','y',.08,1,[[3.091,-9.510],[3.191,-9.498]],[[2.975,-9.5095],[3.065,-9.4985]]],
  ['white','z',-5.922,-1,[[3.091,0],[3.191,.08]],[[2.97,0],[3.07,.08]]],
  ['white','y',.08,1,[[3.091,-5.922],[3.191,-5.910]],[[2.975,-5.9215],[3.065,-5.9105]]],
];
// H03: both rooms' walls are lime paint (acabados.py), but the mask has a 5 cm band of
// plastic paint where each pier met the facade and the suite wall: wall patches are
// lime throughout.
const limeMaterials=new Map();
function limeMaterial(cloneMaterial,source){
  if(!limeMaterials.has(source)){
    const m=cloneMaterial(source),prior=m.onBeforeCompile,priorKey=m.customProgramCacheKey?.bind(m);
    m.onBeforeCompile=(shader,r)=>{prior.call(m,shader,r);shader.fragmentShader=shader.fragmentShader.replace('float limeF=','float limeF=1.0;float limePlan=');};
    m.customProgramCacheKey=()=>(priorKey?priorKey():'')+'|openplan-lime';
    limeMaterials.set(source,m);
  }
  return limeMaterials.get(source);
}
const AXES={y:[0,2,1],z:[0,1,2]};  // plane (a, b) and normal components of a position

// Interpolated attributes of the exported, lightmapped surface at plane point (a, b).
function sample(meshes,axis,value,sign,a,b){
  const [ia,ib,in_]=AXES[axis];
  for(const mesh of meshes){
    const geo=mesh.geometry,pos=geo.getAttribute('position'),nor=geo.getAttribute('normal'),index=geo.index;
    const n=index?index.count:pos.count,v=k=>index?index.getX(k):k;
    for(let i=0;i<n;i+=3){
      const t=[v(i),v(i+1),v(i+2)];
      if(nor.getComponent(t[0],in_)*sign<.99)continue;
      if(t.some(k=>Math.abs(pos.getComponent(k,in_)-value)>.002))continue;
      const [p,q,r]=t.map(k=>[pos.getComponent(k,ia),pos.getComponent(k,ib)]);
      const d=(q[1]-r[1])*(p[0]-r[0])+(r[0]-q[0])*(p[1]-r[1]);if(Math.abs(d)<1e-12)continue;
      const l0=((q[1]-r[1])*(a-r[0])+(r[0]-q[0])*(b-r[1]))/d,l1=((r[1]-p[1])*(a-r[0])+(p[0]-r[0])*(b-r[1]))/d,l2=1-l0-l1;
      if(Math.min(l0,l1,l2)<-1e-5)continue;
      const lerp=name=>{const at=geo.getAttribute(name),out=[];
        for(let c=0;c<at.itemSize;c++)out.push(l0*at.getComponent(t[0],c)+l1*at.getComponent(t[1],c)+l2*at.getComponent(t[2],c));return out;};
      return {mesh,uv:lerp('uv'),uv1:lerp('uv1')};
    }
  }
  return null;
}
function patch({THREE,cloneMaterial},meshes,[material,axis,value,sign,[[a0,b0],[a1,b1]],[[s0,t0],[s1,t1]]]){
  const [ia,ib,in_]=AXES[axis],corners=[[0,0],[1,0],[1,1],[0,1]];
  const at=corners.map(([u,v])=>sample(meshes.filter(m=>m.userData.exported.material===material),axis,value,sign,s0+(s1-s0)*u,t0+(t1-t0)*v));
  if(at.some(s=>!s)||at.some(s=>s.mesh!==at[0].mesh)){console.warn('openplan: no lit surface for',material,axis,value,[a0,b0]);return null;}
  const position=[],normal=[],uv=[],uv1=[];
  for(const k of [0,1,2,0,2,3]){
    const [u,v]=corners[k],p=[0,0,0],nn=[0,0,0];
    p[ia]=a0+(a1-a0)*u;p[ib]=b0+(b1-b0)*v;p[in_]=value+sign*.0006;nn[in_]=sign;
    position.push(...p);normal.push(...nn);uv.push(...at[k].uv);uv1.push(...at[k].uv1);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('uv1',new THREE.Float32BufferAttribute(uv1,2));
  geo.computeBoundingSphere();
  const lime=material==='wall'&&axis==='z',mesh=new THREE.Mesh(geo,lime?limeMaterial(cloneMaterial,at[0].mesh.material):at[0].mesh.material);mesh.receiveShadow=true;mesh.visible=false;
  mesh.userData.exported={...at[0].mesh.userData.exported,split:'openplan'};
  return mesh;
}

// ctx: rooms.mjs context. screen: the fixed M3 group (app.js). Returns set(open).
export function createOpenPlan(ctx,{screen}){
  const {staticMeshes,doors}=ctx;
  // Split first: the patches lie inside the same box.
  const removed=ctx.splitExported({material:['wall','white'],box:REMOVED});
  const lit=staticMeshes.filter(m=>m.userData.exported&&!removed.includes(m)&&m.geometry.getAttribute('uv1')&&m.geometry.getAttribute('uv'));
  const patches=PATCHES.map(p=>patch(ctx,lit,p)).filter(Boolean);
  for(const m of patches){ctx.group.add(m);staticMeshes.push(m);}
  const study=doors.find(d=>d.name==='Estudio');
  return open=>{
    for(const m of removed)m.visible=!open;
    for(const m of patches)m.visible=open;
    screen.visible=!open;
    if(study){study.active=!open;for(const g of study.groups)g.visible=!open;}
  };
}
