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
const RUG={x0:.55,x1:2.75,z0:-8.90,z1:-6.52,h:.012};

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

  // 3. Contrast: the headboard, nightstands and bed base in a deeper, warmer oak, as in
  // render 3 (the veneer there reads clearly darker than the plaster).
  for(const piece of ctx.splitExported({material:'wood',box:[[.19,0,-9.45],[2.25,1.2,-6.0]]})){
    piece.material.color.set('#c9b190');
  }

  // 4. Vertical slot of render 3 beside the wardrobe front: a 3 cm reveal, floor to
  // ceiling, on the east jamb of the dressing-room opening (in render 3 the dark
  // vertical line where the wardrobe front ends, x ~ 1.46-1.52 m in this pose). Its
  // concealed light is proposed in r5-dormitorio.md (light_layout 'Slot Principal').
  const slot=new THREE.Mesh(new THREE.BoxGeometry(.03,2.55,.003),ctx.cloneMaterial(ctx.mats.dark));
  slot.position.set(1.545,2.55/2,-5.9115);slot.name='Ranura vertical dormitorio';
  ctx.group.add(slot);ctx.lightRuntimeObject(slot,{strength:.6});
}
