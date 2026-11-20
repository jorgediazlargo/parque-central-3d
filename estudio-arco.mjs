// Estudio en arco (menu option, off by default = the plan): Jorge's variant of 20/11/2026, not in
// the proyecto de ejecución. The study's glass screen (M3) goes, so bedroom and study read as one
// room, the upholstered bench comes back to the foot of the bed (B01/G06, 0,45 x 1,33) and the
// study's back wall becomes a lime-plaster arch, as in the reference render he sent:
// - the C9 joinery goes (both tall wardrobes, the desk, the open shelving with its LED strip, the
//   panel by the pillar, what the rooms put in and on them, the sockets and switches on that wall);
// - in its place, on the wardrobes' front line (x 4,48) and down to the back wall (x 5,084, so
//   0,60 deep), a slender plaster frame from the window wall to the pillar (Jorge, 20/11: the first
//   one, 0,25 jambs and a 0,20 band, too heavy): a 0,12 jamb on the window side, 0,23 on the other,
//   the least that cases the pillar (its face at z -6,123), a 0,12 band under the 2,55 ceiling and an
//   opening of 3,26 x 2,43 with r 0,40 corners;
// - inside it, wall to wall: an oak top at 0,74 (0,57 deep), two wall-hung drawer units of 0,45
//   (three drawers, 15 cm off the floor) at its ends, two 24" iMacs in light blue with their
//   keyboards and mice 1,12 m apart about the opening's middle, and the two study chairs in front of
//   them; an LED strip in the soffit washes the back wall and the top;
// - the bench is runtime geometry again (its exported mesh and collider left with the 19/11 bake).
// Nothing is baked: the new pieces take the probes. In the niche they read the room's probes just
// in front of the arch (those behind it were filled from the old joinery), shaded with the depth
// of the niche and lit by the soffit strip while the lamps are on (`lamps`). The floor along M3's
// line takes the light either side of it, as with the open bedroom (floor shader, `floor`).

import {mergeGeometries,toCreasedNormals} from './assets/jsm/utils/BufferGeometryUtils.js';

const FACE=4.48,BACK=5.084;                          // arch face (wardrobe fronts, P9's jamb) and back wall
const ROOM={z0:-9.523,z1:-5.782};                    // window wall to the pillar's casing (C9 by the pillar)
const OPEN={z0:-9.403,z1:-6.14,top:2.43,r:.40};      // 0,12 jamb, 0,23 by the pillar, 0,12 band
const CEILING=2.55;
const SKIN=5.066;                                    // plaster over the back wall (sockets, skirting, old panel)
const DESK={x0:FACE+.015,top:.74,thick:.04};
const UNIT={w:.45,y0:.15,fronts:[[.15,.385],[.388,.558],[.561,.70]]};   // drawer units; three fronts each
const MID=(OPEN.z0+OPEN.z1)/2,SEATS=[MID-.56,MID+.56];  // the two places, 1,12 m apart
const BENCH={x0:2.255,x1:2.707,z0:-8.373,z1:-7.04,h:.43,plinth:.07};
const STRIP={x:4.525,y:OPEN.top-.012,z0:OPEN.z0+OPEN.r+.02,z1:OPEN.z1-OPEN.r-.02};
// Exported and runtime pieces wholly inside this box go with the option (walls, floor and ceiling stay).
const GONE=[4.43,-.005,-9.53,BACK-.0005,CEILING+.006,-5.77];
const GONE_COLLIDERS=['C9 Estudio armario baldas cuerpo','C9 Estudio armario colgar cuerpo','Escritorio estudio tablero','Estudio lampara base'];

// Shader pieces of the niche (inserted into the probe-lit materials, lighting.mjs).
const NICHE=`
uniform float arcoLed;
vec3 arcoProbeAt(vec3 p){return vec3(min(p.x,${(FACE-.08).toFixed(3)}),p.y,p.x>${FACE.toFixed(3)}?clamp(p.z,${(OPEN.z0+.06).toFixed(3)},${(OPEN.z1-.06).toFixed(3)}):p.z);}
float arcoNiche(vec3 p){
  float a=clamp((p.x-${FACE.toFixed(3)})/${(BACK-FACE).toFixed(3)},0.0,1.0);
  float dz=max(min(p.z-(${OPEN.z0.toFixed(3)}),${OPEN.z1.toFixed(3)}-p.z),0.0),dy=max(${OPEN.top.toFixed(3)}-p.y,0.0);
  float k=mix(1.0,.80,a)*(1.0-.25*a*exp(-dz/.14))*(1.0-.22*a*exp(-dy/.14));
  // Under the top: the desk shades it, more towards the wall.
  k*=1.0-step(p.y,${(DESK.top-.045).toFixed(3)})*step(${DESK.x0.toFixed(3)},p.x)*mix(.25,.55,a);
  return k;
}
vec3 arcoWash(vec3 p,vec3 n){
  vec3 a=vec3(${STRIP.x.toFixed(3)},${STRIP.y.toFixed(3)},${STRIP.z0.toFixed(3)}),b=vec3(${STRIP.x.toFixed(3)},${STRIP.y.toFixed(3)},${STRIP.z1.toFixed(3)});
  vec3 axis=b-a;float len=length(axis);axis/=len;
  float s=dot(p-a,axis);vec3 u=p-(a+axis*s);float r=max(length(u),.03);u/=r;
  vec3 ne=normalize(vec3(.5,-1.0,0.0));
  float ce=max(dot(ne,u),0.0),cr=max(dot(n,-u),0.0);
  float t0=-s,t1=len-s;
  float g=t1/(2.0*(r*r+t1*t1))+atan(t1/r)/(2.0*r)-t0/(2.0*(r*r+t0*t0))-atan(t0/r)/(2.0*r);
  float lit=1.0-step(p.y,${(DESK.top-.005).toFixed(3)})*step(${(DESK.x0-.01).toFixed(3)},p.x);   // nothing under the top
  return vec3(1.0,.80,.62)*(arcoLed/PI*ce*cr*g)*lit;
}`;
const LED={value:0};
const LED_POWER=22;

export function createEstudioArco(THREE,{scene,staticMeshes,doors,fronts,colliders,lightObject,lighting,mats,cloneMaterial,floor}){
  const group=new THREE.Group();group.name='Estudio en arco';scene.add(group);

  // The C9 doors (fronts.mjs): lifted closed into their groups, hidden with the rest (lifted first:
  // the split below leaves their triangles alone).
  const c9=fronts.list.filter(f=>{const [x,z]=f.pivot||[0,0];return x>FACE-.05&&x<BACK&&z>ROOM.z0-.01&&z<ROOM.z1;});
  for(const f of c9)fronts.set(f,0);
  const frontGroups=c9.map(f=>f.group).filter(Boolean);
  // ---- What goes: every triangle wholly inside GONE, split from its mesh. ----
  const skip=o=>{for(let n=o;n;n=n.parent){if(n===group||n.userData.door||n.userData.frontGroup||n.name==='Mampara estudio'||n.name==='Dormitorio abierto al baño'||n.name.startsWith('Silla estudio'))return true;}
    return o.userData.split==='suite-abierta'||/^(Rejillas|Estor)/.test(o.name||'')||['wall','floor','ceiling'].includes(o.userData.exported?.material);};
  const hidden=[],users=new Map();
  scene.traverse(o=>{if(o.isMesh)users.set(o.geometry,(users.get(o.geometry)||0)+1);});
  scene.updateMatrixWorld(true);
  {
    const meshes=[],box=new THREE.Box3(),v=new THREE.Vector3(),[x0,y0,z0,x1,y1,z1]=GONE;
    scene.traverse(o=>{if(o.isMesh&&!o.isReflector&&!o.isSkinnedMesh&&!o.isInstancedMesh&&o.geometry?.getAttribute('position')&&!skip(o))meshes.push(o);});
    for(const mesh of meshes){
      const geo=mesh.geometry;if(!geo.boundingBox)geo.computeBoundingBox();
      box.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld);
      if(box.max.x<x0||box.min.x>x1||box.max.y<y0||box.min.y>y1||box.max.z<z0||box.min.z>z1)continue;
      if(Array.isArray(mesh.material)||geo.groups.length>1)continue;
      const pos=geo.getAttribute('position'),index=geo.index,count=index?index.count:pos.count,keep=[],hit=[];
      const inside=i=>{v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);return v.x>=x0&&v.x<=x1&&v.y>=y0&&v.y<=y1&&v.z>=z0&&v.z<=z1;};
      for(let i=0;i<count;i+=3){
        const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
        (inside(a)&&inside(b)&&inside(c)?hit:keep).push(a,b,c);
      }
      if(!hit.length)continue;
      if(!keep.length){hidden.push(mesh);continue;}
      if(users.get(geo)>1){console.warn('[estudio-arco] shared geometry left in place:',mesh.name);continue;}
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
      const piece=new THREE.Mesh(part,mesh.material);piece.name=(mesh.name||'')+' (estudio en arco)';
      piece.matrixAutoUpdate=false;piece.matrix.copy(mesh.matrix);
      Object.assign(piece,{castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,renderOrder:mesh.renderOrder,frustumCulled:mesh.frustumCulled});
      piece.onBeforeRender=mesh.onBeforeRender;
      piece.userData={...mesh.userData,split:'estudio-arco'};
      mesh.parent.add(piece);if(staticMeshes.includes(mesh))staticMeshes.push(piece);
      hidden.push(piece);
    }
  }
  const oldColliders=colliders.filter(c=>GONE_COLLIDERS.includes(c.name));
  const chairs=[];scene.traverse(o=>{if(o.name.startsWith('Silla estudio'))chairs.push(o);});
  // Where the partition's stubs met the façade pillar and the block, suite-abierta.mjs lays a plain
  // plaster skin, which M3's jambs hide; without M3 it shows, so it takes the walls' lime meanwhile.
  const ends=scene.getObjectByName('Testas del tabique del estudio'),endsPlain=ends?.material;
  const chairsAt=chairs.map(c=>({c,position:c.position.clone(),turn:c.rotation.y}));

  // ---- Materials. ----
  const metric=(g,s=1)=>{const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i));uv[i*2]=(ax>.5?-p.getZ(i):p.getX(i))*s;uv[i*2+1]=(ay>.5?-p.getZ(i):p.getY(i))*s;}
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;};
  const box=(x0,x1,y0,y1,z0,z1)=>{const g=new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0).toNonIndexed();g.translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);return metric(g);};
  // The walls' lime plaster (app.js material 'wall'), lime everywhere (not only where H03 marks it).
  const lime=cloneMaterial(mats.wall);
  {const prior=lime.onBeforeCompile;lime.onBeforeCompile=(s,r)=>{prior.call(lime,s,r);s.fragmentShader=s.fragmentShader.replace('float plasterAmount=','limeF=1.0;float plasterAmount=');};
    lime.customProgramCacheKey=()=>'wall|estudio-arco';}
  const oak=cloneMaterial(mats.wood);
  const fabric=cloneMaterial(mats.fabric);fabric.color.set('#a39c92');
  const plinthFabric=cloneMaterial(mats.fabric);plinthFabric.color.set('#857d73');
  const std=(color,roughness,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const look={
    lime,oak,fabric,plinthFabric,
    shell:std('#86b0e6',.36,.15),      // iMac back and stand: anodised light blue
    chin:std('#a9c8f0',.4,.08),        // its front chin
    bezel:std('#f3f2ef',.35),
    screen:std('#0b0d10',.08),
    keys:std('#f4f4f1',.5),
    led:new THREE.MeshStandardMaterial({color:'#fff3e2',emissive:'#ffd9ae',emissiveIntensity:1.6,roughness:.4}),
  };
  // Probe light with the niche's shade and the soffit strip (lighting.mjs runtimeLit, then this).
  const niche=m=>{
    const n=m.clone();n.defines={...(m.defines||{})};n.userData={...m.userData};
    const prior=m.onBeforeCompile,key=m.customProgramCacheKey.bind(m);
    n.onBeforeCompile=(s,r)=>{
      prior.call(n,s,r);s.uniforms.arcoLed=LED;
      s.fragmentShader=s.fragmentShader
        .replace('uniform float probeStrength;','uniform float probeStrength;\n'+NICHE)
        .replace('vec3 lpE=probeIrradiance(lpWorld+lpNormalW*.1,','vec3 lpE=arcoNiche(lpWorld)*probeIrradiance(arcoProbeAt(lpWorld)+lpNormalW*.1,')
        .replace('#include <lights_fragment_end>','reflectedLight.indirectDiffuse+=diffuseColor.rgb*arcoWash(lpWorld,normalize(inverseTransformDirection(normal,viewMatrix)))*RECIPROCAL_PI;\n#include <lights_fragment_end>');
    };
    n.customProgramCacheKey=()=>key()+'|estudio-arco-nicho';
    return n;
  };
  let endsLime=null;
  if(ends){const m=new THREE.Mesh(new THREE.BufferGeometry(),look.lime);lightObject(m,lighting,1);endsLime=m.material;}
  const add=(geo,mat,{lit=true,strength=1,inNiche=true,parent=group,name}={})=>{
    const mesh=new THREE.Mesh(geo,mat);mesh.name=name||'';mesh.castShadow=mesh.receiveShadow=true;
    if(lit){lightObject(mesh,lighting,strength);if(inNiche)mesh.material=niche(mesh.material);}
    parent.add(mesh);staticMeshes.push(mesh);return mesh;
  };

  // ---- The arch: one U of plaster from the window wall to the pillar, 0,60 deep. ----
  {
    // Drawn in (a, y) with a = -z, extruded from the face to the back wall (local z -> world x).
    const s=new THREE.Shape(),{z0,z1,top,r}=OPEN;
    s.moveTo(-ROOM.z0,0);s.lineTo(-z0,0);s.lineTo(-z0,top-r);
    s.absarc(-z0-r,top-r,r,0,Math.PI/2,false);
    s.lineTo(-z1+r,top);
    s.absarc(-z1+r,top-r,r,Math.PI/2,Math.PI,false);
    s.lineTo(-z1,0);s.lineTo(-ROOM.z1,0);s.lineTo(-ROOM.z1,CEILING+.002);s.lineTo(-ROOM.z0,CEILING+.002);s.lineTo(-ROOM.z0,0);
    let g=new THREE.ExtrudeGeometry(s,{depth:BACK-FACE,bevelEnabled:false,curveSegments:40});
    g.applyMatrix4(new THREE.Matrix4().set(0,0,1,FACE, 0,1,0,0, -1,0,0,0, 0,0,0,1));
    g=toCreasedNormals(g,Math.PI/6);
    add(g,look.lime,{name:'Arco del estudio'});
  }
  // Plaster over the back wall inside the arch (its baked light is the old joinery's shade).
  add(box(SKIN,SKIN+.004,0,OPEN.top+.01,OPEN.z0-.01,OPEN.z1+.01),look.lime,{name:'Fondo del arco'});
  // LED strip in the soffit: an opal line 2 cm wide just behind the arch's edge.
  const strip=new THREE.Mesh(box(STRIP.x-.01,STRIP.x+.01,OPEN.top-.004,OPEN.top-.001,STRIP.z0,STRIP.z1),look.led);
  strip.name='Arco LED';group.add(strip);

  // ---- Desk top and drawer units. ----
  add(box(DESK.x0,SKIN,DESK.top-DESK.thick,DESK.top,OPEN.z0-.003,OPEN.z1+.003),look.oak,{name:'Escritorio en arco'});
  for(const [za,zb] of [[OPEN.z0,OPEN.z0+UNIT.w],[OPEN.z1-UNIT.w,OPEN.z1]]){
    const parts=[box(DESK.x0+.02,SKIN-.004,UNIT.y0,DESK.top-DESK.thick,za-(za===OPEN.z0?.003:-.001),zb+(zb===OPEN.z1?.003:-.001))];   // carcass behind the fronts, into the jamb
    for(const [ya,yb] of UNIT.fronts)parts.push(box(DESK.x0,DESK.x0+.019,ya,yb-.003,za+.002,zb-.002));
    add(mergeGeometries(parts),look.oak,{name:'Cajonera volada'});
  }

  // ---- Two iMacs (24", 54,7 x 46,1 cm), keyboards and mice. ----
  {
    const rounded=(w,h,r)=>{const s=new THREE.Shape(),x=w/2,y=h/2;s.moveTo(-x+r,-y);s.lineTo(x-r,-y);s.absarc(x-r,-y+r,r,-Math.PI/2,0,false);s.lineTo(x,y-r);s.absarc(x-r,y-r,r,0,Math.PI/2,false);
      s.lineTo(-x+r,y);s.absarc(-x+r,y-r,r,Math.PI/2,Math.PI,false);s.lineTo(-x,-y+r);s.absarc(-x+r,-y+r,r,Math.PI,Math.PI*1.5,false);return s;};
    // Faces toward -x: local (u along z, v up, w toward the wall) -> world.
    const toWorld=(g,x,y,z)=>{g.applyMatrix4(new THREE.Matrix4().set(0,0,1,x, 0,1,0,y, -1,0,0,z, 0,0,0,1));return g;};
    const W=.547,H=.375,T=.0115,base=DESK.top+.086,front=4.865;
    const lists={shell:[],chin:[],bezel:[],screen:[],keys:[]};
    for(const z of SEATS){
      const cy=base+H/2;
      lists.shell.push(toWorld(new THREE.ExtrudeGeometry(rounded(W,H,.018),{depth:T,bevelEnabled:false,curveSegments:8}),front,cy,z));
      // Front: white glass with the screen, the coloured chin below (61 mm).
      const chin=.061;
      lists.bezel.push(toWorld(new THREE.ShapeGeometry(rounded(W-.002,H-.002,.017),8).rotateY(Math.PI),front-.0004,cy,z));
      lists.chin.push(toWorld(new THREE.PlaneGeometry(W-.002,chin).rotateY(Math.PI),front-.0007,base+.001+chin/2,z));
      lists.screen.push(toWorld(new THREE.PlaneGeometry(.5224,.2938).rotateY(Math.PI),front-.0008,base+H-.0125-.2938/2,z));
      // Stand: foot plate on the top and the slanted blade up to the panel's back.
      lists.shell.push(box(front-.03,front+.117,DESK.top,DESK.top+.005,z-.065,z+.065));
      {const g=new THREE.BoxGeometry(.006,.26,.13).toNonIndexed();g.rotateZ(.42);g.translate(front+.068,DESK.top+.12,z);lists.shell.push(metric(g));}
      // Magic Keyboard and Mouse, colour-matched.
      lists.shell.push(box(4.575,4.69,DESK.top,DESK.top+.007,z-.1395,z+.1395));
      lists.keys.push(box(4.582,4.684,DESK.top+.007,DESK.top+.0095,z-.133,z+.133));
      {const g=new THREE.SphereGeometry(.5,24,12,0,Math.PI*2,0,Math.PI/2);g.scale(.113,.044,.057);g.translate(4.63,DESK.top,z+.235);lists.keys.push(metric(g.toNonIndexed()));}
    }
    for(const [k,list] of Object.entries(lists)){
      const g=mergeGeometries(list.map(x=>{const y=x.index?x.toNonIndexed():x;for(const a of Object.keys(y.attributes))if(!['position','normal','uv'].includes(a))y.deleteAttribute(a);if(!y.getAttribute('uv'))metric(y);return y;}));
      add(g,look[k],{name:'iMac '+k});
    }
    // Soft contact shade under each foot and keyboard.
    const shade=new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
      uniforms:{size:{value:new THREE.Vector2(1,1)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec2 vUv;void main(){vec2 d=abs(vUv-.5)*2.0;float e=max(d.x,d.y);gl_FragColor=vec4(0.0,0.0,0.0,.32*(1.0-smoothstep(.55,1.0,e)));}'});
    const quads=[];
    for(const z of SEATS){
      quads.push(new THREE.PlaneGeometry(.2,.2).rotateX(-Math.PI/2).translate(front+.045,DESK.top+.0015,z));
      quads.push(new THREE.PlaneGeometry(.15,.31).rotateX(-Math.PI/2).translate(4.632,DESK.top+.0015,z));
    }
    const shadeMesh=new THREE.Mesh(mergeGeometries(quads),shade);shadeMesh.renderOrder=1;shadeMesh.name='iMac sombras';group.add(shadeMesh);
  }

  // ---- The bench at the foot of the bed (B01/G06), upholstered on a recessed plinth. ----
  const benchGroup=new THREE.Group();benchGroup.name='Banco principal';scene.add(benchGroup);
  {
    const {x0,x1,z0,z1,h,plinth}=BENCH,cx=(x0+x1)/2,cz=(z0+z1)/2;
    const pad=(w,d,r)=>{const s=new THREE.Shape(),x=w/2,y=d/2;s.moveTo(-x+r,-y);s.lineTo(x-r,-y);s.absarc(x-r,-y+r,r,-Math.PI/2,0,false);s.lineTo(x,y-r);s.absarc(x-r,y-r,r,0,Math.PI/2,false);
      s.lineTo(-x+r,y);s.absarc(-x+r,y-r,r,Math.PI/2,Math.PI,false);s.lineTo(-x,-y+r);s.absarc(-x+r,-y+r,r,Math.PI,Math.PI*1.5,false);return s;};
    const body=(w,d,y0,y1,r,bevel)=>{
      const g=new THREE.ExtrudeGeometry(pad(w,d,r),{depth:y1-y0-2*bevel,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelOffset:-bevel,bevelSegments:5,curveSegments:10});
      g.rotateX(-Math.PI/2);g.translate(cx,y0+bevel,cz);return toCreasedNormals(g,Math.PI/3);
    };
    add(body(x1-x0,z1-z0,plinth,h,.05,.045),look.fabric,{inNiche:false,parent:benchGroup,name:'Banco principal cojín'});
    add(body(x1-x0-.06,z1-z0-.06,0,plinth+.01,.03,0),look.plinthFabric,{inNiche:false,parent:benchGroup,name:'Banco principal zócalo'});
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(x1-x0+.24,z1-z0+.24).rotateX(-Math.PI/2),new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
      uniforms:{halfSize:{value:new THREE.Vector2((x1-x0)/2,(z1-z0)/2)},pad:{value:.12}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec2 halfSize;uniform float pad;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.0*(halfSize+pad);vec2 q=abs(p)-halfSize+.03;float d=length(max(q,0.0))+min(max(q.x,q.y),0.0);float a=.55*(1.0-smoothstep(-.05,pad,d))+.25*(1.0-smoothstep(-.12,.0,d));gl_FragColor=vec4(0.0,0.0,0.0,min(a,.7));}'}));
    shadow.position.set(cx,.003,cz);shadow.renderOrder=1;shadow.name='Banco principal sombra';benchGroup.add(shadow);
  }

  const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
  const polys=[rect(FACE,ROOM.z0,BACK,ROOM.z1),rect(BENCH.x0,BENCH.z0,BENCH.x1,BENCH.z1)];
  const state={on:false,group,polys,hidden:hidden.length,
    // Where the visitor must not stand when the option changes: the new pieces when it turns on,
    // M3's line and the old joinery when it turns off.
    blockedBy(on){return on?polys:[rect(3.09,-9.51,3.20,-5.91),rect(FACE,ROOM.z0,BACK,-6.12)];},
    lamps(on){LED.value=on?LED_POWER:0;look.led.emissiveIntensity=on?1.6:0;look.led.color.set(on?'#fff3e2':'#e4e0d8');},
    set(on){
      state.on=on;group.visible=benchGroup.visible=on;floor.value=on?1:0;
      for(const m of hidden)m.visible=!on;
      for(const g of frontGroups)g.visible=!on;
      if(on)for(const f of c9){f.t=f.goal=0;fronts.set(f,0);}
      for(const c of oldColliders)c.off=on;
      if(ends)ends.material=on?endsLime:endsPlain;
      chairsAt.forEach(({c,position,turn},i)=>{
        if(on){c.position.set(FACE-.30,position.y,SEATS[i]??position.z);c.rotation.y=i?-.06:.06;}
        else{c.position.copy(position);c.rotation.y=turn;}
        c.updateMatrixWorld(true);
      });
    }};
  state.lamps(true);state.set(false);
  console.info(`[estudio-arco] ${hidden.length} meshes hidden, ${c9.length} fronts, ${oldColliders.length} colliders, ${chairs.length} chairs`);
  return state;
}
