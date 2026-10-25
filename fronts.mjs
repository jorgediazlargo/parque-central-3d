// Openable joinery fronts (scripts/proyecto.py): wardrobe and kitchen doors, drawers,
// the oven's drop-down door, lift-up doors and the breakfast unit's pocket doors.
//
// The fronts are exported in their own layer (house.json meshes with layer 'fronts'),
// merged by material like everything else, so closed they cost no extra draw calls. Each
// vertex carries its front's id (attribute frontId, from the mesh's frontRanges); room
// modules that split or restyle those meshes keep it. The first time a front opens, its
// triangles are lifted out of whatever meshes hold them into a group pivoting on its
// hinge (or sliding on its runners). They keep their material and baked light.
//
//   const fronts=createFronts(THREE,{data,staticMeshes,scene});
//   fronts.at(hit)            front under a raycast hit, or null
//   fronts.toggle(front)      opens or closes it
//   fronts.set(front,t)       puts it at t (0 closed, 1 open) at once
//   fronts.step(dt)           animates; returns true while something moves
//
// Front spec (house.json fronts): {id, kind:'hinge'|'pocket'|'drawer'|'flap', label,
// pivot:[x,z], edge:[x,z] (free edge, hinge kinds), out:[x,z] (outward normal), angle,
// travel (drawer / pocket, m), along:[x,z] and hingeY (flap), y:[bottom, top]}.

const ease=t=>t*t*(3-2*t);
const T=.019,GAP=.0025;   // proyecto.py: leaf thickness, joint between fronts

export function createFronts(THREE,{data,staticMeshes,scene}){
  const specs=data.fronts||[],fronts=specs.map(s=>({...s,name:s.label,t:0,goal:0,group:null}));
  // Per-vertex front ids on the exported front meshes.
  for(const mesh of staticMeshes){
    const ex=mesh.userData.exported;if(!ex||ex.layer!=='fronts')continue;
    const spec=data.meshes[ex.sourceIndex],geo=mesh.geometry,n=geo.getAttribute('position').count,ids=new Float32Array(n).fill(-1);
    for(const [id,start,count] of spec.frontRanges||[])ids.fill(id,start,start+count);
    geo.setAttribute('frontId',new THREE.BufferAttribute(ids,1));
  }
  const holders=()=>staticMeshes.filter(m=>m.geometry?.getAttribute('frontId')&&!m.userData.front);

  function at(hit){
    const ids=hit?.object?.geometry?.getAttribute('frontId');if(!ids||!hit.face)return null;
    const id=ids.getX(hit.face.a);return id>=0?fronts[id]:null;
  }

  // Moves the triangles of front f into meshes of its own under a pivot group.
  function lift(f){
    const group=new THREE.Group();group.name='Frente '+f.id;group.userData.frontGroup=f;
    let [px,pz]=f.pivot||[0,0];const py=f.kind==='flap'?f.hingeY:0;
    if(f.kind==='hinge'){
      // Turn about the leaf's front edge on the hinge side (the exported pivot is on the
      // carcass front): two leaves hinged on one divider then open side by side, each
      // within its own module, instead of crossing.
      const ex=f.edge[0]-px,ez=f.edge[1]-pz,L=Math.hypot(ex,ez);
      px+=ex/L*GAP/2+f.out[0]*T;pz+=ez/L*GAP/2+f.out[1]*T;
    }
    group.position.set(px,py,pz);scene.add(group);f.base=group.position.clone();
    for(const mesh of holders()){
      const geo=mesh.geometry,ids=geo.getAttribute('frontId'),index=geo.index,n=index?index.count:ids.count;
      const keep=[],hit=[];
      for(let i=0;i<n;i+=3){
        const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
        (ids.getX(a)===f.id?hit:keep).push(a,b,c);
      }
      if(!hit.length)continue;
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
      const piece=new THREE.Mesh(part,mesh.material);
      piece.position.set(-px,-py,-pz);piece.castShadow=mesh.castShadow;piece.receiveShadow=mesh.receiveShadow;
      piece.userData.exported={...mesh.userData.exported,front:f.id};piece.userData.front=f;
      piece.renderOrder=mesh.renderOrder;group.add(piece);staticMeshes.push(piece);
    }
    f.group=group;
    if(f.kind==='hinge'||f.kind==='pocket'){
      // Turning sign: the free edge must leave towards the room.
      const ex=f.edge[0]-px,ez=f.edge[1]-pz;f.sign=Math.sign(ez*f.out[0]-ex*f.out[1])||1;
    }
    if(f.kind==='flap'){
      const a=new THREE.Vector3(f.along[0],0,f.along[1]).normalize();f.axis=a;
      // a x up moves the top of the leaf; a door hinged at its top swings its bottom out.
      f.sign=Math.sign(-a.z*f.out[0]+a.x*f.out[1])*(f.up?-1:1)||1;
    }
  }

  function place(f){
    const g=f.group,t=f.t;
    if(f.kind==='hinge')g.rotation.y=f.sign*f.angle*ease(t);
    else if(f.kind==='pocket'){
      // Swing to 90 degrees, then slide back into the pocket beside the opening.
      const a=ease(Math.min(1,t/.55)),s=ease(Math.max(0,(t-.55)/.45));
      g.rotation.y=f.sign*f.angle*a;
      g.position.set(f.base.x-f.out[0]*f.travel*s,f.base.y,f.base.z-f.out[1]*f.travel*s);
    }
    else if(f.kind==='drawer'){const e=ease(t)*f.travel;g.position.set(f.base.x+f.out[0]*e,f.base.y,f.base.z+f.out[1]*e);}
    else if(f.kind==='flap')g.quaternion.setFromAxisAngle(f.axis,f.sign*f.angle*ease(t));
  }

  return {
    list:fronts,at,
    toggle(f){if(!f.group)lift(f);f.goal=f.goal>.5?0:1;},
    // Sets a front straight to t (review captures).
    set(f,t){if(!f.group)lift(f);f.t=f.goal=t;place(f);},
    step(dt){
      let moving=false;
      for(const f of fronts){
        if(!f.group||Math.abs(f.goal-f.t)<1e-5)continue;
        const speed=f.kind==='drawer'?1.6:f.kind==='pocket'?.75:1.1;
        f.t+=Math.sign(f.goal-f.t)*Math.min(dt*speed,Math.abs(f.goal-f.t));place(f);moving=true;
      }
      return moving;
    }
  };
}
