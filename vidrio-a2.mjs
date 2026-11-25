// Armario A2 con trasera de vidrio (menu option, off by default = the plan): Jorge's variant of
// 25/11/2026. Not in the proyecto de ejecución.
//
// In the plan the wardrobe A2 (G07: 1,96 x 0,60, two hanging modules of 0,98, glass doors in
// bronze frames to the vestidor, x 1,623-3,584, front at z -5,06, back at z -5,66) stands
// against a double pocket wall (z -5,91/-5,66: two 10 cm skins round the pockets of P8 and P9,
// plastered to the bedroom and the study, with switches on it). With the option on:
// - the pocket wall goes over A2's whole width, pockets, their heads and switches included, and
//   so does A2's melamine back: A2 reaches the bedroom/study face (z -5,91) through the old wall;
// - there, flush with that face, fixed clear glass in the same bronze frames as A2's doors
//   (26 mm, 19 mm deep): three panes, a double mullion on the module division (x 2,6035) and the
//   10 cm plaster pier where the study's screen M3 lands (x 3,091-3,192, which the brief keeps);
// - the 25 cm between the glass and the wardrobe is lined like A2's carcass (oak floor and top,
//   sides continuing its ends, the division continuing its own, the pier clad on its three inner
//   faces), so A2 reads as one piece of furniture through the wall; below it, A2's bronze plinth;
//   above 2,20 (A2's top and the vestidor's ceiling), a plaster bulkhead up to the bedroom's 2,55;
// - the piers either side of A2 stay (x 1,523-1,623 and 3,584-3,684, A2's ends) as the jambs of
//   P8 and P9, which become hinged leaves (vidrio-a2 doors in app.js) opening into the bedroom
//   and the study; the sliding ones go.
// The clothes, shelves, drawers and LED strips inside A2 stay; its doors still open to the vestidor.
// The bake (scripts/bake_vidrio_a2.py) sees this layout: the glass lets light through.

const BAND={x0:1.523,x1:3.684,z0:-5.91,z1:-5.66};      // the pocket wall over A2's width
const A2={x0:1.623,x1:3.584,back:-5.66,y0:.10,y1:2.20};  // proyecto.py 'A2 Vestidor armario 2'
const MID=(A2.x0+A2.x1)/2;                                // module division
const PIER={x0:3.091,x1:3.192};                           // where M3 meets the block (house.json 'Tabique')
const C=.018,F=.026,T=.019,CEIL=2.55;                     // carcass, glass frame width and depth (proyecto.py)
const GLASS_Z=BAND.z0;                                     // glass frames flush with the bedroom face

export function createVidrioA2(THREE,{scene,staticMeshes,mats,cloneMaterial,lightObject,lighting,suiteOn=()=>false}){
  const group=new THREE.Group();group.name='Armario A2 trasera de vidrio';scene.add(group);

  // ---- What goes: every triangle wholly inside the wall band (skirtings and switch plates on it
  // included) and A2's back panel. The block's triangles may already sit in pieces split off by
  // suite-abierta.mjs: those are split again. The jambs of P8 and P9 (faces on x 1,523 / 3,684) stay.
  const E=.003;
  // The back panel (12 mm, z -5,66/-5,648) shares its inner plane with the back edges of the shelves
  // and the division: of what lies there only what faces the interior (its own face) goes.
  const BOXES=[[BAND.x0,-.01,BAND.z0-.025,BAND.x1,CEIL+.01,BAND.z1+.004],
               [A2.x0-.004,A2.y0-.005,A2.back-.004,A2.x1+.004,A2.y1+.005,A2.back+.0125]];
  const inBox=(b,p,e=E)=>p.x>=b[0]-e&&p.x<=b[3]+e&&p.y>=b[1]-e&&p.y<=b[4]+e&&p.z>=b[2]-e&&p.z<=b[5]+e;
  const backPanel=(P,nz)=>P.every(p=>inBox(BOXES[1],p,0))&&(nz>-.2||P.every(p=>p.z<A2.back+.009));
  const jamb=(A,B,Cc,n)=>Math.abs(n.x)>.5&&[A,B,Cc].every(p=>Math.abs(p.x-BAND.x0)<.002)||Math.abs(n.x)>.5&&[A,B,Cc].every(p=>Math.abs(p.x-BAND.x1)<.002);
  const skip=o=>{for(let n=o;n;n=n.parent){if(n===group||n.userData.door||n.userData.frontGroup||n.name==='Mampara estudio'||n.name==='Dormitorio abierto al baño'||/\(tabique del estudio\)$/.test(n.name||''))return true;}return false;};
  const users=new Map();scene.traverse(o=>{if(o.isMesh)users.set(o.geometry,(users.get(o.geometry)||0)+1);});
  scene.updateMatrixWorld(true);
  const hidden=[];   // {mesh, suite: piece of the open bedroom's block (hidden with that option too)}
  const A=new THREE.Vector3(),B=new THREE.Vector3(),Cv=new THREE.Vector3(),n=new THREE.Vector3(),box=new THREE.Box3();
  const meshes=[];scene.traverse(o=>{if(o.isMesh&&!o.isReflector&&!o.isInstancedMesh&&!skip(o)&&(!o.userData.split||o.userData.split==='suite-abierta')&&o.geometry?.getAttribute('position'))meshes.push(o);});
  for(const mesh of meshes){
    const geo=mesh.geometry;
    if(!geo.boundingBox)geo.computeBoundingBox();
    box.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld);
    if(!BOXES.some(b=>box.max.x>=b[0]&&box.min.x<=b[3]&&box.max.y>=b[1]&&box.min.y<=b[4]&&box.max.z>=b[2]&&box.min.z<=b[5]))continue;
    if(Array.isArray(mesh.material)||geo.groups.length>1)continue;
    const pos=geo.getAttribute('position'),index=geo.index,count=index?index.count:pos.count,keep=[],hit=[];
    for(let i=0;i<count;i+=3){
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      A.fromBufferAttribute(pos,a).applyMatrix4(mesh.matrixWorld);B.fromBufferAttribute(pos,b).applyMatrix4(mesh.matrixWorld);Cv.fromBufferAttribute(pos,c).applyMatrix4(mesh.matrixWorld);
      n.subVectors(Cv,B).cross(A.clone().sub(B)).normalize();
      const out=([A,B,Cv].every(p=>inBox(BOXES[0],p))||backPanel([A,B,Cv],n.z))&&!jamb(A,B,Cv,n);
      (out?hit:keep).push(a,b,c);
    }
    if(!hit.length)continue;
    const fromSuite=mesh.userData.split==='suite-abierta';
    if(!keep.length){hidden.push({mesh,suite:fromSuite});continue;}
    if(users.get(geo)>1){console.warn('[vidrio-a2] shared geometry left in place:',mesh.name);continue;}
    const part=new THREE.BufferGeometry();
    for(const [name,attr] of Object.entries(geo.attributes)){
      const size=attr.itemSize,src=attr.isInterleavedBufferAttribute?attr.data.array:attr.array;
      const stride=attr.isInterleavedBufferAttribute?attr.data.stride:size,offset=attr.isInterleavedBufferAttribute?attr.offset:0;
      const array=new src.constructor(hit.length*size);
      for(let i=0;i<hit.length;i++)for(let k=0;k<size;k++)array[i*size+k]=src[hit[i]*stride+offset+k];
      part.setAttribute(name,new THREE.BufferAttribute(array,size,attr.normalized));
    }
    part.computeBoundingSphere();
    if(index||!fromSuite)geo.setIndex(new THREE.BufferAttribute(new Uint32Array(keep),1));
    else{   // a non-indexed piece of suite-abierta.mjs: rebuilt from what stays
      for(const [name,attr] of Object.entries(geo.attributes)){
        const size=attr.itemSize,array=new attr.array.constructor(keep.length*size);
        for(let i=0;i<keep.length;i++)for(let k=0;k<size;k++)array[i*size+k]=attr.array[keep[i]*size+k];
        geo.setAttribute(name,new THREE.BufferAttribute(array,size,attr.normalized));
      }
      geo.computeBoundingSphere();geo.boundingBox=null;
    }
    const piece=new THREE.Mesh(part,mesh.material);piece.name=(mesh.name||'')+' (trasera A2)';
    piece.matrixAutoUpdate=false;piece.matrix.copy(mesh.matrix);
    Object.assign(piece,{castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,renderOrder:mesh.renderOrder,frustumCulled:mesh.frustumCulled});
    piece.onBeforeRender=mesh.onBeforeRender;
    piece.userData={...mesh.userData,split:'vidrio-a2'};
    mesh.parent.add(piece);if(staticMeshes.includes(mesh))staticMeshes.push(piece);
    hidden.push({mesh:piece,suite:fromSuite});
  }

  // ---- What comes (runtime geometry, lit by the probes; the variant's bake sees it). ----
  const boxGeo=(x0,x1,y0,y1,z0,z1)=>{
    const g=new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0);
    const p=g.getAttribute('position'),nn=g.getAttribute('normal'),uv=g.getAttribute('uv');
    // Metric UVs as the exported joinery: u along the face, v up (the grain runs up the panels).
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
  const add=(name,boxes,material,strength,shadow=true)=>{
    const m=new THREE.Mesh(merge(boxes.map(b=>boxGeo(...b))),material);m.name=name;
    m.castShadow=shadow;m.receiveShadow=true;if(strength)lightObject(m,lighting,strength);
    group.add(m);staticMeshes.push(m);return m;
  };
  const zBack=GLASS_Z+T;                                          // the lining starts behind the frames
  // Plaster: the piers (A2's ends and M3's landing) and the bulkhead over the glass.
  const plasterMat=new THREE.MeshStandardMaterial({color:'#efe9e1',roughness:.92});
  add('A2 vidrio machones',[[BAND.x0,A2.x0,0,A2.y1,BAND.z0,BAND.z1],[A2.x1,BAND.x1,0,A2.y1,BAND.z0,BAND.z1],[PIER.x0,PIER.x1,0,A2.y1,BAND.z0,BAND.z1],
    [BAND.x0,BAND.x1,A2.y1,CEIL,BAND.z0,BAND.z1]],plasterMat,1.3);
  // Skirting (H02, 8 cm, 12 mm proud) on the piers' bedroom face, as it ran on the wall.
  add('A2 vidrio rodapié',[[BAND.x0,A2.x0,0,.08,BAND.z0-.012,BAND.z0],[A2.x1,BAND.x1,0,.08,BAND.z0-.012,BAND.z0],[PIER.x0-.012,PIER.x1+.012,0,.08,BAND.z0-.012,BAND.z0]],cloneMaterial(mats.white),1.3);
  // Oak lining: floor and top continuing A2's, its ends and division carried through, the pier clad.
  const oak=[[A2.x0,A2.x1,A2.y0,A2.y0+C,zBack,A2.back],[A2.x0,A2.x1,A2.y1-C,A2.y1,zBack,A2.back],
    [A2.x0,A2.x0+C,A2.y0,A2.y1,zBack,A2.back],[A2.x1-C,A2.x1,A2.y0,A2.y1,zBack,A2.back],
    [MID-C/2,MID+C/2,A2.y0+C,A2.y1-C,zBack,A2.back+.012],
    [PIER.x0-C,PIER.x0,A2.y0+C,A2.y1-C,zBack,A2.back+.012],[PIER.x1,PIER.x1+C,A2.y0+C,A2.y1-C,zBack,A2.back+.012],
    [PIER.x0-C,PIER.x1+C,A2.y0+C,A2.y1-C,A2.back,A2.back+.012]];
  add('A2 vidrio forro roble',oak,cloneMaterial(mats.wood),1.15);
  // Bronze plinth under the glass, flush with A2's toe colour (G07).
  add('A2 vidrio zócalo',[[A2.x0,PIER.x0,0,A2.y0,GLASS_Z+.005,A2.back],[PIER.x1,A2.x1,0,A2.y0,GLASS_Z+.005,A2.back]],cloneMaterial(mats.bronze),1);
  // Glass panes in A2's door frames: per pane two stiles, head and sill (the mullion is two stiles).
  const panes=[[A2.x0,MID],[MID,PIER.x0],[PIER.x1,A2.x1]],frames=[],glass=[];
  for(const [x0,x1] of panes){
    const a=x0+.0012,b=x1-.0012;
    frames.push([a,a+F,A2.y0,A2.y1,GLASS_Z,GLASS_Z+T],[b-F,b,A2.y0,A2.y1,GLASS_Z,GLASS_Z+T],
      [a+F,b-F,A2.y0,A2.y0+F,GLASS_Z,GLASS_Z+T],[a+F,b-F,A2.y1-F,A2.y1,GLASS_Z,GLASS_Z+T]);
    glass.push([a+F,b-F,A2.y0+F,A2.y1-F,GLASS_Z+T*.4,GLASS_Z+T*.6]);
  }
  // A2's frames and glass as rooms/vestidor.mjs finishes them: satin champagne bronze, and the
  // glass's bronze body as a multiplying tint over what is behind.
  const bronze=cloneMaterial(mats.bronze);bronze.color.set('#a3815a');bronze.metalness=.75;bronze.roughness=.28;
  add('A2 vidrio marcos',frames,bronze,1);
  const panesMesh=add('A2 vidrio paños',glass,mats.glass,0,false);lightObject(panesMesh,lighting);
  const tint=new THREE.Mesh(panesMesh.geometry,new THREE.MeshBasicMaterial({color:new THREE.Color(.93,.875,.79),transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.ZeroFactor,blendDst:THREE.SrcColorFactor}));
  tint.name='A2 vidrio tinte bronce';tint.castShadow=false;group.add(tint);

  const state={on:false,group,
    // Where the visitor must not stand when the option changes: nothing new reaches into a room.
    blockedBy(){return [];},
    refresh(){for(const {mesh,suite} of hidden)mesh.visible=!state.on&&!(suite&&suiteOn());},
    set(on){state.on=!!on;group.visible=state.on;state.refresh();}};
  state.set(false);
  console.info(`[vidrio-a2] ${hidden.length} meshes hidden with the pocket wall and A2's back; ${panes.length} panes`);
  return state;
}
