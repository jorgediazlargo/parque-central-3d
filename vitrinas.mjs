// Vestidor en piedra y vitrinas (menu option, off by default = the plan): the owner's
// variant of 25/10/2026, not in the proyecto de ejecución.
// - Floor: the vestidor interior and its passage take the porcelain of the rest of the
//   house (and of the suite vestidor) instead of oak (app.js, floor shader, uniform
//   vestidorStone; this module only flips it).
// - Vestidor interior: the clothes wall A4 (six doors) and the shoe cabinet A6 (two) get
//   bronze-framed glass leaves like the suite's A1-A3 (proyecto.py door(glass=True):
//   2.6 cm frame, pane in the middle of the leaf), keeping their Formani pulls; the linen
//   cupboard and the heat-pump door (A5) stay oak, so what is shown is clothes and shoes.
// The oak leaves are moved, with their baked light, into meshes of their own (by front
// id) and hidden while the option is on; the glass leaves carry the same front ids, so
// fronts.mjs opens them with their pulls. Nothing to bake: the bake never sees the
// fronts (bake_house.py), so the interiors are already lit as if open.
import {mergeGeometries} from './assets/jsm/utils/BufferGeometryUtils.js';

export const GLAZED=[31,32,35,36,37,38,42,43];
const T=.019,GAP=.0025,FRAME=.026;   // proyecto.py: leaf thickness, joint, glass frame

export function createVitrinas(THREE,{data,staticMeshes,scene,mats,cloneMaterial,lightObject,lighting,floor}){
  const glazed=new Set(GLAZED);
  // Oak leaves: split out of every mesh holding front triangles (fronts.mjs frontId).
  const oak=[];
  for(const mesh of [...staticMeshes]){
    const geo=mesh.geometry,ids=geo.getAttribute('frontId');
    if(!ids||mesh.userData.front||mesh.userData.exported?.material!=='wood')continue;
    const index=geo.index,n=index?index.count:ids.count,keep=[],hit=[];
    for(let i=0;i<n;i+=3){
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      (glazed.has(ids.getX(a))?hit:keep).push(a,b,c);
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
    part.computeBoundingSphere();geo.setIndex(new THREE.BufferAttribute(new Uint32Array(keep),1));
    const piece=new THREE.Mesh(part,cloneMaterial(mesh.material));
    piece.castShadow=mesh.castShadow;piece.receiveShadow=mesh.receiveShadow;piece.renderOrder=mesh.renderOrder;
    piece.userData.exported={...mesh.userData.exported,split:'vitrinas'};
    scene.add(piece);staticMeshes.push(piece);oak.push(piece.material);
  }

  // Glass leaves, in world space, over the same span as the oak ones.
  const frames=[],panes=[];
  for(const f of data.fronts.filter(f=>glazed.has(f.id))){
    const P=new THREE.Vector3(f.pivot[0],0,f.pivot[1]),E=new THREE.Vector3(f.edge[0],0,f.edge[1]);
    const along=E.clone().sub(P),w=along.length();along.normalize();
    const out=new THREE.Vector3(f.out[0],0,f.out[1]),turn=Math.atan2(-along.z,along.x);
    const [y0,y1]=f.y,a=GAP/2,b=w-GAP/2;
    // s along the leaf from the hinge, t outwards from the carcass front, y up.
    const box=(list,s0,s1,t0,t1,z0,z1)=>{
      const g=new THREE.BoxGeometry(s1-s0,z1-z0,t1-t0);g.rotateY(turn);
      const c=P.clone().addScaledVector(along,(s0+s1)/2).addScaledVector(out,(t0+t1)/2);
      g.translate(c.x,(z0+z1)/2,c.z);
      g.setAttribute('frontId',new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(f.id),1));
      list.push(g);
    };
    for(const s of [a,b-FRAME])box(frames,s,s+FRAME,0,T,y0,y1);
    for(const z of [y0,y1-FRAME])box(frames,a+FRAME,b-FRAME,0,T,z,z+FRAME);
    box(panes,a+FRAME,b-FRAME,T*.4,T*.6,y0+FRAME,y1-FRAME);
  }
  const leaves=[];
  for(const [list,material,shadow] of [[frames,mats.bronze,true],[panes,mats.glass,false]]){
    const mesh=new THREE.Mesh(mergeGeometries(list),cloneMaterial(material));
    mesh.name='Vitrinas vestidor interior';mesh.castShadow=shadow;mesh.receiveShadow=true;
    lightObject(mesh,lighting);scene.add(mesh);staticMeshes.push(mesh);leaves.push(mesh.material);
  }

  const state={on:false,set(on){
    state.on=on;floor.value=on?1:0;
    for(const m of oak)m.visible=!on;
    for(const m of leaves)m.visible=on;
  }};
  state.set(false);
  return state;
}
