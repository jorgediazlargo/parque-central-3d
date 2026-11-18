// Salón con chimenea (menu option, off by default = the plan): the owner's variant of
// 14/11/2026, after the studio's render «2a. Comedor con chimenea». Not in the proyecto
// de ejecución: B01 keeps the bare structural column (10,13-10,57 x -6,71/-6,17).
//
// «Chimenea baja» (Jorge 15-16/11/2026), the only one left (18/11: the long and the short
// ones are gone): the fire is not real (LED and vapour), so it can stand on its own, against
// the north face of the bare structural column, which stays as in the plan. A low block of
// exactly the column's section and finish (its faces are the column's own baked plaster: same
// materials, light read from the column face each one continues), 40 cm high, and on it a dark
// steel tray with the logs and the flames. Nothing over the fire (Jorge 18/11: no glass, no
// cap, no lintel, no back plate): it is open on every side and above.
//
// Runtime geometry, lit by the room probes like the furniture (lightObject); nothing is
// baked, so the bake still sees the bare column: the floor carries no baked shadow of the
// block (a soft contact decal stands in) and the flames light nothing (they glow through
// bloom). Hidden until the option is on; it then also blocks the way (polys, physics).
import {mergeGeometries} from './assets/jsm/utils/BufferGeometryUtils.js';

// World metres (x east, y up, z south). The column is 10.129-10.567 x -6.71/-6.17.
const COLUMN={x0:10.129,x1:10.567,z0:-6.71,z1:-6.17};
const BAND={y0:.40};                                        // the block's top, where the tray sits
export const VARIANTS={
  // The short one's fire half, to the column's north face, open above the 40 cm block.
  baja:{Z0:-7.254,Z1:-6.71,FIRE:{z0:-7.214,z1:-6.754}},
};

// Shown or not: set('' | 'baja').
export function createChimeneas(THREE,ctx){
  const all=Object.fromEntries(Object.keys(VARIANTS).map(k=>[k,createChimenea(THREE,ctx,k)]));
  const f={variant:'',
    get on(){return !!f.variant;},
    get polys(){return f.variant?all[f.variant].polys:[];},
    polysOf:v=>v?all[v].polys:[],
    set(v){v=v in all?v:'';for(const [k,c] of Object.entries(all))c.set(k===v);f.variant=v;},
    tick(t){if(f.variant)all[f.variant].tick(t);}};
  return f;
}

export function createChimenea(THREE,{scene,staticMeshes,lightObject,lighting},variant='baja'){
  const {Z0,Z1,FIRE}=VARIANTS[variant];
  const X0=COLUMN.x0,X1=COLUMN.x1;
  const PLINTH={x0:X0,x1:X1,z0:Z0,z1:Z1};                       // the block stands on the floor like the column
  const IN=-.003;                                               // the steel tray 3 mm inside the block's faces
  const group=new THREE.Group();group.name='Salón con chimenea '+variant;
  // Boxes with metric UVs (u, v in metres on every face), so the plaster keeps its scale.
  const box=(x0,x1,y0,y1,z0,z1)=>{
    const g=new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0);
    const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i)+(x0+x1)/2,y=p.getY(i)+(y0+y1)/2,z=p.getZ(i)+(z0+z1)/2;
      const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i));
      uv.setXY(i,ax>.5?z:x,ay>.5?z:y);
    }
    g.translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
    return g;
  };
  const lists={steel:[],char:[],decal:[]};

  // ---- The block (the column's plaster) up to 40 cm, and on it the steel tray, its whole length. ----
  group.add(...columnFaces(THREE,staticMeshes,{x0:X0,x1:X1,z0:Z0,z1:Z1,top:BAND.y0}));
  lists.steel.push(box(X0-IN,X1+IN,BAND.y0,BAND.y0+.07,Z0-IN,Z1));

  // ---- Ceramic logs on the burner (char). ----
  const cyl=(r,len,axis,cx,cy,cz,seg=14)=>{
    const g=new THREE.CylinderGeometry(r,r*.94,len,seg,1,false);
    if(axis==='x')g.rotateZ(Math.PI/2);else if(axis==='z')g.rotateX(Math.PI/2);
    g.translate(cx,cy,cz);return g;
  };
  const fx=(X0+X1)/2,fz=(FIRE.z0+FIRE.z1)/2,bed=BAND.y0+.07;
  lists.char.push(cyl(.034,.38,'z',fx-.07,bed+.03,fz+.01));
  lists.char.push(cyl(.031,.35,'z',fx+.08,bed+.03,fz-.02));
  {const g=cyl(.029,.30,'x',fx,bed+.075,fz);g.rotateY(0);lists.char.push(g);}
  {const g=new THREE.CylinderGeometry(.027,.025,.26,12);g.rotateZ(Math.PI/2);g.rotateY(.55);g.translate(fx,bed+.07,fz+.08);lists.char.push(g);}

  // ---- Contact shadow round the block (the bake never saw it). ----
  {
    const pad=.16,w=PLINTH.x1-PLINTH.x0+2*pad,d=PLINTH.z1-PLINTH.z0+2*pad;
    const g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);
    g.translate((PLINTH.x0+PLINTH.x1)/2,.0025,(PLINTH.z0+PLINTH.z1)/2);lists.decal.push(g);
  }

  // ---- Materials. ----
  const mats={
    steel:new THREE.MeshStandardMaterial({color:'#1b1a18',roughness:.55,metalness:.35}),
    char:new THREE.MeshStandardMaterial({color:'#2b2723',roughness:.95,emissive:'#ff4a12',emissiveIntensity:.05}),
    decal:new THREE.MeshBasicMaterial({map:shadowTexture(THREE),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
  };
  for(const [key,list] of Object.entries(lists)){
    if(!list.length)continue;
    const mesh=new THREE.Mesh(mergeGeometries(list.map(g=>g.index?g.toNonIndexed():g).map(g=>{for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);return g;})),mats[key]);
    mesh.name='chimenea:'+key;
    mesh.castShadow=mesh.receiveShadow=key!=='decal';
    if(key!=='decal')lightObject(mesh,lighting);
    group.add(mesh);
  }

  // ---- Flames: crossed animated quads (additive), and a warm glow on the bed. ----
  const flame=new THREE.ShaderMaterial({
    uniforms:{time:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:'varying vec2 vUv;varying float vSeed;attribute float seed;void main(){vUv=uv;vSeed=seed;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform float time;varying vec2 vUv;varying float vSeed;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 uv=vUv;float t=time*1.7+vSeed*13.0;
        float turb=n(vec2(uv.x*5.0+vSeed*7.0,uv.y*3.0-t*2.2))*.6+n(vec2(uv.x*11.0,uv.y*7.0-t*3.5))*.4;
        float x=abs(uv.x-.5+(turb-.5)*.22*uv.y)*2.0;
        float tongue=(1.0-uv.y*(1.0+.45*sin(t*1.3+vSeed*4.0)*(.6+.4*turb)))-x*x*2.2;
        float body=smoothstep(0.0,.6,tongue)*smoothstep(0.0,.12,uv.y);
        body*=.75+.5*turb;
        vec3 hot=vec3(1.0,.86,.55),warm=vec3(1.0,.45,.10),deep=vec3(.55,.10,.02);
        vec3 c=mix(deep,warm,smoothstep(.05,.45,body));c=mix(c,hot,smoothstep(.55,.95,body)*(1.0-uv.y));
        gl_FragColor=vec4(c*body*1.7,1.0);
      }`
  });
  {
    const quads=[];let s=0;
    const W=.22,H=.27;
    for(const [ox,oz,turn,scale] of [[-.04,-.13,.3,.9],[.04,-.06,-.25,1],[-.03,.01,.15,1.15],[.05,.07,-.4,.95],[-.04,.13,.2,.85],[.02,-.09,1.4,.8],[0,.04,1.7,.9],[.06,-.01,.7,.75],[-.06,.09,-.8,.8],[0,-.16,1.2,.6]]){
      const q=new THREE.PlaneGeometry(W*scale,H*scale);q.translate(0,H*scale/2,0);q.rotateY(turn);
      q.translate(fx+ox,bed+.02,fz+oz);
      q.setAttribute('seed',new THREE.BufferAttribute(new Float32Array(4).fill(s++*.37),1));
      quads.push(q);
    }
    const mesh=new THREE.Mesh(mergeGeometries(quads),flame);mesh.name='chimenea:llamas';mesh.renderOrder=1;mesh.frustumCulled=false;
    group.add(mesh);
    const ember=new THREE.Mesh(new THREE.PlaneGeometry(X1-X0-.08,FIRE.z1-FIRE.z0-.10).rotateX(-Math.PI/2).translate(fx,bed+.002,fz),
      new THREE.MeshBasicMaterial({color:'#ff7a30',map:emberTexture(THREE),transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    ember.name='chimenea:brasas';group.add(ember);
  }

  scene.add(group);
  // Collision footprint (block and plinth), as physics polygons [x, z].
  const rect=(x0,x1,z0,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
  const polys=[rect(X0,X1,Z0,Z1)];
  const state={on:false,polys,group,
    set(on){state.on=on;group.visible=on;},
    tick(t){flame.uniforms.time.value=t;const f=.9+.1*Math.sin(t*7.3)*Math.sin(t*3.1);mats.char.emissiveIntensity=.06*f;}};
  state.set(false);
  return state;
}

// The block's plaster: west, east and north faces up to `top` (the steel tray covers its top), each
// with the material of the column face it continues and that face's baked light (its
// lightmap UVs, read at the matching point of the column: same height, z or x mapped
// across), so block and column are one finish in every light. The column is split in
// two exported regions at x 10,18 (salón and shared walls).
function columnFaces(THREE,staticMeshes,{x0,x1,z0,z1,top}){
  const C=COLUMN,eps=.002;
  // Column triangles per face: west (x0, normal -x), east (x1, +x), north (z0, -z).
  const faces={west:[],east:[],north:[]};
  for(const mesh of staticMeshes){
    if(mesh.userData.exported?.material!=='wall')continue;
    const g=mesh.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),l=g.getAttribute('uv1');
    if(!l)continue;
    const count=g.index?g.index.count:p.count;
    for(let i=0;i<count;i+=3){
      const v=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k);
      const P=v.map(k=>[p.getX(k),p.getY(k),p.getZ(k)]),L=v.map(k=>[l.getX(k),l.getY(k)]),nx=n.getX(v[0]),nz=n.getZ(v[0]);
      const inZ=P.every(q=>q[2]>=C.z0-eps&&q[2]<=C.z1+eps),inX=P.every(q=>q[0]>=C.x0-eps&&q[0]<=C.x1+eps);
      if(nx<-.9&&inZ&&P.every(q=>Math.abs(q[0]-C.x0)<eps))faces.west.push({mesh,uv:P.map(q=>[-q[2],q[1]]),L});
      else if(nx>.9&&inZ&&P.every(q=>Math.abs(q[0]-C.x1)<eps))faces.east.push({mesh,uv:P.map(q=>[-q[2],q[1]]),L});
      else if(nz<-.9&&inX&&P.every(q=>Math.abs(q[2]-C.z0)<eps))faces.north.push({mesh,uv:P.map(q=>[q[0],q[1]]),L});
    }
  }
  // (mesh, lightmap UV) at a point (a, b) of a column face, in that face's (u, v) plane.
  const at=(face,a,b)=>{
    let best=null;
    for(const t of faces[face]){
      const [p,q,r]=t.uv,d=(q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]);if(Math.abs(d)<1e-9)continue;
      const w1=((a-p[0])*(r[1]-p[1])-(r[0]-p[0])*(b-p[1]))/d,w2=((q[0]-p[0])*(b-p[1])-(a-p[0])*(q[1]-p[1]))/d,w0=1-w1-w2;
      const worst=Math.min(w0,w1,w2);
      if(!best||worst>best.worst)best={worst,mesh:t.mesh,uv:[0,1].map(k=>w0*t.L[0][k]+w1*t.L[1][k]+w2*t.L[2][k])};
      if(worst>=-1e-6)break;
    }
    if(!best)throw Error('Columna sin luz horneada');
    return best;
  };
  const mz=z=>C.z0+.002+(z-z0)/(z1-z0)*(C.z1-C.z0-.004);             // block z -> column z
  // The column's north face has a lightmap seam at 1,016 m: the cap reads its light just below.
  const SPLIT=10.18,NORTH_MAX=.95,clampY=y=>Math.min(Math.max(y,.002),2.5);
  const quads=new Map();                                             // material -> triangles
  // A rectangle: corners (world), normal, the column face and its (a, b) for each corner.
  const quad=(corners,normal,face,ab)=>{
    const looks=ab.map(([a,b])=>at(face,a,b));
    // The middle decides the material (a quad never crosses the region split).
    const mid=at(face,(ab[0][0]+ab[2][0])/2,(ab[0][1]+ab[2][1])/2).mesh.material;
    if(!quads.has(mid))quads.set(mid,[]);
    const list=quads.get(mid),uvOf=c=>Math.abs(normal[0])>.5?[-c[2],c[1]]:Math.abs(normal[1])>.5?[c[0],-c[2]]:[c[0],c[1]];
    for(const k of [0,1,2,0,2,3])list.push({p:corners[k],n:normal,uv:uvOf(corners[k]),l:looks[k].uv});
  };
  const side=(x,face,normal,ya,yb,za,zb)=>{
    const c=normal[0]<0?[[x,ya,za],[x,ya,zb],[x,yb,zb],[x,yb,za]]:[[x,ya,zb],[x,ya,za],[x,yb,za],[x,yb,zb]];  // counter-clockwise from outside
    quad(c,normal,face,c.map(q=>[-mz(q[2]),clampY(q[1])]));
  };
  for(const [x,face,normal] of [[x0,'west',[-1,0,0]],[x1,'east',[1,0,0]]])side(x,face,normal,0,top,z0,z1);
  // North face: lit like the shared part of the column's north face (its
  // salón strip, x < 10,18, is two texels wide: read at its edge it frays into dots).
  const nx=x=>Math.max(x,SPLIT+.03);
  {
    const [xa,xb]=[x0,x1];
    const c=[[xb,0,z0],[xa,0,z0],[xa,top,z0],[xb,top,z0]];
    quad(c,[0,0,-1],'north',c.map(q=>[nx(q[0]),Math.min(clampY(q[1]),NORTH_MAX)]));
  }
  return [...quads].map(([material,list])=>{
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(list.flatMap(v=>v.p),3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(list.flatMap(v=>v.n),3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(list.flatMap(v=>v.uv),2));
    g.setAttribute('uv1',new THREE.Float32BufferAttribute(list.flatMap(v=>v.l),2));
    const mesh=new THREE.Mesh(g,material);mesh.name='chimenea:columna';mesh.castShadow=mesh.receiveShadow=true;
    return mesh;
  });
}

// Soft rectangular contact shadow (alpha falls off within the padding).
function shadowTexture(THREE){
  const s=128,c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d');
  const img=g.createImageData(s,s);
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){
    const u=Math.min(x,s-1-x)/(s*.2),v=Math.min(y,s-1-y)/(s*.06);
    const a=Math.min(1,u)*Math.min(1,v);const k=(y*s+x)*4;
    img.data[k]=img.data[k+1]=img.data[k+2]=0;img.data[k+3]=Math.round(150*a*a);
  }
  g.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

// Glowing bed under the flames: a soft, patchy ellipse (embers), dark at the edges.
function emberTexture(THREE){
  const s=128,c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d');
  const img=g.createImageData(s,s);let seed=11;const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
  const spots=Array.from({length:40},()=>[rnd()*s,s*.15+rnd()*s*.7,4+rnd()*9]);
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){
    const u=(x/s-.5)*2,v=(y/s-.5)*2,r=Math.max(0,1-(u*u*1.4+v*v*1.1));
    let e=0;for(const [px,py,pr] of spots)e+=Math.max(0,1-Math.hypot(x-px,y-py)/pr);
    const a=Math.min(1,r*r*(.25+.6*Math.min(1,e)));const k=(y*s+x)*4;
    img.data[k]=img.data[k+1]=img.data[k+2]=Math.round(255*a);img.data[k+3]=255;
  }
  g.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
