// Iluminación propuesta (menu option, off by default = the F05 of the plan): our lighting
// review, described in scripts/luz_propuesta.py (assets/luz-propuesta.json).
// - Fixtures: the F05 pieces it replaces (every downlight ring, the entrance tracks, three
//   of five spots per kitchen track, the bedside and dining pendants, the hall wall
//   lights) are split out of the exported meshes and hidden; its own (trimless downlights,
//   step lights, strips, floor lamps, reading wall lights, the dining pendant) are built
//   here, lit by the probes like every runtime object.
// - Night: its own bake once there is one (lightmap mode 'nightProposal'); until then the
//   F05 night bake relit once on the GPU (relight.mjs): the lights it removes taken away,
//   its own added, the F05 lights it keeps at 2700 K.
// - Terrace (not baked): its night pools at 2200 K.
import {createRelight} from './relight.mjs?v=5e6867ce2e';
import {mergeGeometries} from './assets/jsm/utils/BufferGeometryUtils.js';

// Patches over the faces the removed fixtures covered (luz_propuesta.patches): plane
// coordinates (a, b) and the normal component of a position, per plane axis.
const AXES={x:[2,1,0],y:[0,2,1],z:[0,1,2]};
// Interpolated uv and lightmap uv1 of the exported surface (plane axis = value, facing
// sign) at plane point (a, b), with the mesh it belongs to.
function sample(meshes,axis,value,sign,a,b){
  const [ia,ib,in_]=AXES[axis];
  for(const mesh of meshes){
    const geo=mesh.geometry,pos=geo.getAttribute('position'),nor=geo.getAttribute('normal'),index=geo.index;
    const n=index?index.count:pos.count,v=k=>index?index.getX(k):k;
    for(let i=0;i<n;i+=3){
      const t=[v(i),v(i+1),v(i+2)];
      if(nor.getComponent(t[0],in_)*sign<.99)continue;
      if(t.some(k=>Math.abs(pos.getComponent(k,in_)-value)>.003))continue;
      const [p,q,r]=t.map(k=>[pos.getComponent(k,ia),pos.getComponent(k,ib)]);
      const d=(q[1]-r[1])*(p[0]-r[0])+(r[0]-q[0])*(p[1]-r[1]);if(Math.abs(d)<1e-12)continue;
      const l0=((q[1]-r[1])*(a-r[0])+(r[0]-q[0])*(b-r[1]))/d,l1=((r[1]-p[1])*(a-r[0])+(p[0]-r[0])*(b-r[1]))/d,l2=1-l0-l1;
      if(Math.min(l0,l1,l2)<-1e-5)continue;
      const lerp=name=>{const at=geo.getAttribute(name),out=[];for(let c=0;c<at.itemSize;c++)out.push(l0*at.getComponent(t[0],c)+l1*at.getComponent(t[1],c)+l2*at.getComponent(t[2],c));return out;};
      return {mesh,uv:lerp('uv'),uv1:lerp('uv1')};
    }
  }
  return null;
}
// shift: one offset or a list of them, tried in turn. A piece over no surface of that
// plane (a door opening) is left out, unless it covers a hole (cover: a recessed plate).
function patch(THREE,meshes,{axis,value,sign,rect:[[a0,b0],[a1,b1]],shift,cover}){
  const [ia,ib,in_]=AXES[axis],corners=[[0,0],[1,0],[1,1],[0,1]];
  const point=([u,v],[da,db])=>sample(meshes,axis,value,sign,a0+(a1-a0)*u+da,b0+(b1-b0)*v+db);
  if(!cover&&corners.some(c=>!point(c,[0,0])))return null;
  let at=null;
  // The four corners must read one chart of the atlas: the centre's lightmap UV is then
  // the mean of theirs (smart-UV walls are many charts; floors and ceilings one per room).
  const linear=(at,s)=>{const c=point([.5,.5],s);return c&&c.mesh===at[0].mesh&&[0,1].every(k=>Math.abs(c.uv1[k]-at.reduce((t,q)=>t+q.uv1[k],0)/4)<2e-5);};
  for(const s of Array.isArray(shift[0])?shift:[shift]){
    at=corners.map(c=>point(c,s));
    if(at.every(q=>q&&q.mesh===at[0].mesh)&&linear(at,s))break;
    at=null;
  }
  if(!at){console.warn('propuesta: no lit surface for patch',axis,value,[a0,b0]);return null;}
  const position=[],normal=[],uv=[],uv1=[];
  for(const k of [0,1,2,0,2,3]){
    const [u,v]=corners[k],p=[0,0,0],nn=[0,0,0];
    p[ia]=a0+(a1-a0)*u;p[ib]=b0+(b1-b0)*v;p[in_]=value+sign*.0006;nn[in_]=sign;
    position.push(...p);normal.push(...nn);uv.push(...at[k].uv);uv1.push(...at[k].uv1);
  }
  const geo=new THREE.BufferGeometry();
  for(const [name,data,size] of [['position',position,3],['normal',normal,3],['uv',uv,2],['uv1',uv1,2]])geo.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
  geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,at[0].mesh.material);mesh.receiveShadow=true;mesh.userData.exported={...at[0].mesh.userData.exported,split:'propuesta'};
  return mesh;
}

// Emissive faces, as the F05 LEDs (app.js mats.led) but at 2700 K / 3000 K.
const GLOW={K2700:['#ffd09a','#ffad62'],K3000:['#ffe1b8','#ffc58a']};

export async function createProposal(ctx,{mats}){
  const {THREE,data:house}=ctx;
  const res=await fetch('./assets/luz-propuesta.json?v=8eb335e29c',{cache:'no-cache'});
  if(!res.ok)throw Error('No se ha podido descargar la iluminación propuesta.');
  const spec=await res.json();

  // F05 fixtures that go: split once (their triangles keep their place and light), hidden
  // while the option is on. One call per material set: each walks every exported mesh.
  const sets=new Map();
  for(const h of spec.hide){const k=h.material.join();if(!sets.has(k))sets.set(k,{material:h.material,box:[]});sets.get(k).box.push(h.box);}
  const retired=[];for(const s of sets.values())retired.push(...ctx.splitExported(s));

  // Fixtures of the proposal.
  const group=new THREE.Group();group.name='Iluminación propuesta';group.visible=false;ctx.group.add(group);
  const lit=ctx.staticMeshes.filter(m=>m.userData.exported?.material==='wall'&&m.geometry.getAttribute('uv1')&&!retired.includes(m));
  // Long patches in pieces of at most 10 cm: each piece interpolates its lightmap UVs
  // between its own corners, so it never spans two charts of the atlas.
  for(const q of spec.patches){
    const [[a0,b0],[a1,b1]]=q.rect,na=Math.ceil((a1-a0)/.1),nb=Math.ceil((b1-b0)/.1);
    for(let i=0;i<na;i++)for(let j=0;j<nb;j++){
      const m=patch(THREE,lit,{...q,rect:[[a0+(a1-a0)*i/na,b0+(b1-b0)*j/nb],[a0+(a1-a0)*(i+1)/na,b0+(b1-b0)*(j+1)/nb]]});
      if(m)group.add(m);
    }
  }
  const glow=(kind,k=6)=>new THREE.MeshStandardMaterial({color:GLOW[kind][0],emissive:GLOW[kind][1],emissiveIntensity:k,roughness:.6});
  const flush=m=>{m.polygonOffset=true;m.polygonOffsetFactor=-2;m.polygonOffsetUnits=-4;return m;};
  const hole=flush(new THREE.MeshStandardMaterial({color:'#15110d',roughness:.9})),core=flush(glow('K2700',9)),core3000=flush(glow('K3000',9));
  const strip=glow('K2700',5),strip3000=glow('K3000',5),lowGlow=glow('K2700',2.2),shade=new THREE.MeshStandardMaterial({color:'#efe4d0',emissive:'#ffb877',emissiveIntensity:1.6,roughness:.9,side:THREE.DoubleSide});
  const alabaster=new THREE.MeshStandardMaterial({color:'#f3e7d5',emissive:'#ffbf80',emissiveIntensity:2.4,roughness:.55,side:THREE.DoubleSide});
  const bronze=mats.bronze||new THREE.MeshStandardMaterial({color:'#6b4a2c',metalness:.8,roughness:.35});
  const brass=new THREE.MeshStandardMaterial({color:'#b08a52',metalness:.45,roughness:.4});
  const dark=mats.dark||new THREE.MeshStandardMaterial({color:'#111',roughness:.6});
  const white=mats.glossWhite||mats.white||new THREE.MeshStandardMaterial({color:'#eee'});
  const inKeep=(p)=>spec.keep3000.some(([lo,hi])=>p[0]>=lo[0]&&p[0]<=hi[0]&&p[2]>=lo[2]&&p[2]<=hi[2]);
  const add=(geo,mat,lit=true)=>{const m=new THREE.Mesh(geo,mat);m.castShadow=false;m.receiveShadow=lit;group.add(m);return m;};
  const disc=(r,seg=24)=>new THREE.CircleGeometry(r,seg).rotateX(Math.PI/2);  // facing down
  // A box from a to b (world), w across, t thick, its thickness along `up`.
  function bar(a,b,w,t,up,mat){
    const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),len=A.distanceTo(B),m=add(new THREE.BoxGeometry(len,t,w),mat,false);
    const x=B.clone().sub(A).normalize(),y=new THREE.Vector3(...up).normalize(),z=new THREE.Vector3().crossVectors(x,y).normalize();y.crossVectors(z,x);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));m.position.copy(A).add(B).multiplyScalar(.5);return m;
  }
  for(const f of spec.fixtures){
    if(f.type==='trimless'){
      // Flush black aperture (no ring) with the source set deep in it: a small core, off
      // centre toward where an adjustable one is aimed.
      const [x,h,z]=f.at,warm=inKeep(f.at)?core3000:core;
      add(disc(f.radius||.036),hole,false).position.set(x,h-.0008,z);
      const c=add(disc(f.adjustable?.015:.017),warm,false);c.position.set(x+f.aim[0]*.008,h-.0012,z+f.aim[2]*.008);
    }else if(f.type==='step'){
      // Recessed step light 8 x 5 cm: dark louvre, the light under it.
      const [x,y,z]=f.at,[nx,nz]=f.normal,rot=Math.atan2(nx,nz);
      const plate=add(new THREE.BoxGeometry(.08,.05,.006),dark);plate.rotation.y=rot;plate.position.set(x+nx*.002,y,z+nz*.002);
      const slot=add(new THREE.BoxGeometry(.066,.012,.004),lowGlow,false);slot.rotation.y=rot;slot.position.set(x+nx*.004,y-.012,z+nz*.004);
    }else if(['strip','hidden','linear','slot','vertical'].includes(f.type)){
      const warm=inKeep(f.a)?strip3000:strip,d=f.dir,up=Math.abs(d[1])>.5?[0,1,0]:[-d[0],-d[1],-d[2]];
      if(f.type==='linear'){
        // Slim recessed profile: black body, opal diffuser.
        bar(f.a,f.b,f.width+.02,.004,[0,1,0],dark).position.y-=.0005;
        bar(f.a,f.b,f.width,.003,[0,1,0],warm).position.y-=.0025;
      }else if(f.type==='slot'){
        bar(f.a,f.b,f.width+.012,.004,[0,1,0],white).position.y+=.006;
        bar(f.a,f.b,f.width,.002,[0,1,0],warm).position.y+=.004;
      }else if(f.type==='vertical'){
        bar(f.a,f.b,f.width,.008,[f.normal[0],0,f.normal[1]],warm);
      }else bar(f.a,f.b,f.width,.006,up,f.type==='hidden'?lowGlow:warm);
    }else if(f.type==='floorLamp'){
      // Floor lamp: bronze base and stem, linen drum lit from inside.
      const [x,,z]=f.at,[d,hgt]=f.shade,top=f.height;
      add(new THREE.CylinderGeometry(.14,.15,.02,32),bronze).position.set(x,.01,z);
      add(new THREE.CylinderGeometry(.009,.009,top-hgt*.6,12),bronze).position.set(x,(top-hgt*.6)/2,z);
      add(new THREE.CylinderGeometry(d/2*.92,d/2,hgt,40,1,true),shade,false).position.set(x,top-hgt/2,z);
      add(disc(d/2*.9,32),glow('K2700',3),false).position.set(x,top-hgt+.04,z);
    }else if(f.type==='pendant'){
      // Alabaster bowl (Ø 46, 18 cm deep) on three brass rods, brass canopy.
      const [x,y,z]=f.at,R=f.diameter/2,pts=[];
      for(let i=0;i<=16;i++){const a=i/16*Math.PI/2;pts.push(new THREE.Vector2(Math.max(.002,Math.sin(a)*R),y+.18-Math.cos(a)*.18));}
      add(new THREE.LatheGeometry(pts,48),alabaster,false).position.set(x,0,z);
      add(new THREE.CylinderGeometry(.07,.07,.025,32),brass).position.set(x,f.ceiling-.0125,z);
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;bar([x+Math.cos(a)*R*.97,y+.175,z+Math.sin(a)*R*.97],[x,f.ceiling-.02,z],.005,.005,[-Math.sin(a),0,Math.cos(a)],brass);}
      add(new THREE.SphereGeometry(.03,16,8),glow('K2700',8),false).position.set(x,y+.12,z);
    }else if(f.type==='reader'){
      // Wall light with a reading arm: round brass plate, arm, small head aimed down.
      const [x,y,z]=f.at,[nx,nz]=f.normal,arm=f.arm;
      const plate=add(new THREE.CylinderGeometry(.045,.045,.012,32),brass);plate.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz));plate.position.set(x+nx*.006,y,z+nz*.006);
      const rod=add(new THREE.CylinderGeometry(.005,.005,arm,10),brass);rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,nz));
      rod.position.set(x+nx*arm/2,y,z+nz*arm/2);
      const head=add(new THREE.CylinderGeometry(.022,.032,.09,24,1,true),brass);head.position.set(x+nx*arm,y-.06,z+nz*arm);
      add(disc(.028,24),glow('K2700',6),false).position.set(x+nx*arm,y-.104,z+nz*arm);
    }
  }
  // One mesh per material: the pieces (a few hundred) would each be a draw call.
  group.updateMatrixWorld(true);
  const byMaterial=new Map();
  for(const m of group.children){if(!byMaterial.has(m.material))byMaterial.set(m.material,[]);byMaterial.get(m.material).push(m);}
  group.clear();
  for(const [material,list] of byMaterial){
    const geos=list.map(m=>{const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrix);return g;});
    const names=Object.keys(geos[0].attributes).filter(n=>geos.every(g=>g.attributes[n]));
    for(const g of geos)for(const n of Object.keys(g.attributes))if(!names.includes(n))g.deleteAttribute(n);
    const mesh=new THREE.Mesh(mergeGeometries(geos),material);mesh.receiveShadow=list[0].receiveShadow;mesh.castShadow=false;
    mesh.userData={...list[0].userData};group.add(mesh);
  }
  for(const o of group.children)if(!o.userData.exported)ctx.lightRuntimeObject(o);

  // Night without a bake of its own: the F05 night relit (built on first use).
  let relight=null;
  // Terrace night pools (rooms/instalaciones.mjs) at 2200 K.
  const pools=[];ctx.scene.getObjectByName('Terraza luz nocturna')?.traverse(o=>{if(o.isMesh)pools.push([o.material,o.material.color.clone()]);});
  const terrace=new THREE.Color(...spec.terrace.color);

  let on=false;
  return {
    get on(){return on;},
    // night: the current time of day; baked: the lightmap shows the proposal's own night.
    set(next,{night,baked}){
      on=next;
      for(const m of retired)m.visible=!on;
      group.visible=on;
      if(on&&night&&!baked){
        relight??=createRelight({THREE,renderer:ctx.renderer,spec,lightmap:ctx.lightmap,staticMeshes:ctx.staticMeshes});
        relight.apply();
      }else relight?.restore();
      for(const [m,c] of pools){const k=Math.max(c.r,c.g,c.b);m.color.copy(on?terrace.clone().multiplyScalar(k):c);}
    }
  };
}
