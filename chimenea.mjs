// Salón con chimenea (menu option, off by default = the plan): the owner's variant of
// 14/11/2026, after the studio's render «2a. Comedor con chimenea». Not in the proyecto
// de ejecución: B01 keeps the bare structural column (10,13-10,57 x -6,71/-6,17).
//
// The column grows into a lime-plaster block from the floor to the ceiling, 1,70 m along
// the salón-comedor line and 75 cm thick, standing on a low pale-stone plinth that runs
// on past its north end as a bench. At 40-98 cm a band in black steel holds, as in 2a, a
// three-sided glass gas fireplace (front to the salón, back to the comedor and the side,
// so it is seen through) and an open log store, split by a steel pier.
// Mirrored against the render: the fire cannot pass through the structural column, which
// sits in the block's south half, so the fire takes the north end (by the windows) with
// the bench past it, and the logs the 27 cm in front of the column. The south end stays
// 1,15 m clear of the wall for the way between salón and comedor.
//
// Runtime geometry, lit by the room probes like the furniture (lightObject); nothing is
// baked, so the bake still sees the bare column: the floor carries no baked shadow of the
// block (a soft contact decal stands in) and the flames light nothing (they glow through
// bloom). Hidden until the option is on; it then also blocks the way (polys, physics).
import {mergeGeometries} from './assets/jsm/utils/BufferGeometryUtils.js';

// World metres (x east, y up, z south).
const X0=9.85,X1=10.60,Z0=-7.60,Z1=-5.90;                 // block
const PLINTH={x0:9.82,x1:10.63,z0:-8.04,z1:-5.90,y:.40};   // bench past the north end
const BAND={y0:.40,y1:.98};                                 // fire and logs opening
const FIRE={z0:-7.56,z1:-6.88};                             // glass on west, north and east
const PIER={z0:-6.88,z1:-6.74};                             // steel between fire and logs
const LOGS={z0:-6.74,z1:-5.98,x1:10.12};                    // niche, 27 cm deep, before the column
const STEEL=.012;                                           // lining thickness

export function createChimenea(THREE,{scene,staticMeshes,lightObject,lighting,plaster,plasterNormal}){
  const group=new THREE.Group();group.name='Salón con chimenea';
  // Ceiling over the block (D02 says 2,55 in the salón; the cove sits by the walls).
  let ceiling=2.55;
  {
    const rc=new THREE.Raycaster(new THREE.Vector3((X0+X1)/2,1.4,(Z0+Z1)/2),new THREE.Vector3(0,1,0),0,3);
    const hit=rc.intersectObjects(staticMeshes.filter(m=>m.visible),false).find(h=>h.distance>.5);
    if(hit&&hit.point.y>2.1&&hit.point.y<2.8)ceiling=hit.point.y;
  }

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
  const lists={plaster:[],stone:[],steel:[],glass:[],char:[],bark:[],ends:[],decal:[]};

  // ---- Lime-plaster block: everything but the band, plus jambs at the south end. ----
  lists.plaster.push(box(X0,X1,BAND.y1,ceiling-.002,Z0,Z1));
  lists.plaster.push(box(X0,X1,BAND.y0,BAND.y1,LOGS.z1,Z1));          // south jamb
  lists.plaster.push(box(LOGS.x1,X1,BAND.y0,BAND.y1,PIER.z1,LOGS.z1)); // casing of the column
  // ---- Pale stone plinth (bench). ----
  lists.stone.push(box(PLINTH.x0,PLINTH.x1,0,PLINTH.y,PLINTH.z0,PLINTH.z1));

  // ---- Black steel: soffit, pier, the log niche lining, the fire's bed and lintel. ----
  lists.steel.push(box(X0-.004,X1+.004,BAND.y1-STEEL,BAND.y1,Z0-.004,LOGS.z1)); // soffit/lintel
  lists.steel.push(box(X0-.004,X1+.004,BAND.y0,BAND.y1,PIER.z0,PIER.z1));        // pier
  lists.steel.push(box(X0,LOGS.x1,BAND.y0,BAND.y0+STEEL,PIER.z1,LOGS.z1));      // niche floor
  lists.steel.push(box(LOGS.x1-STEEL,LOGS.x1,BAND.y0,BAND.y1,PIER.z1,LOGS.z1)); // niche back
  lists.steel.push(box(X0,LOGS.x1,BAND.y0,BAND.y1,LOGS.z1-STEEL,LOGS.z1));      // niche side
  lists.steel.push(box(X0-.004,X1+.004,BAND.y0,BAND.y0+.07,Z0-.004,PIER.z0));   // fire bed and front rail
  // Corner posts of the glass box (slim), so the three panes read as one firebox.
  for(const x of [X0-.004,X1-.012])lists.steel.push(box(x,x+.016,BAND.y0+.07,BAND.y1,Z0-.004,Z0+.012));

  // ---- Glass: west, east and north panes. ----
  const gy0=BAND.y0+.07,gy1=BAND.y1-STEEL;
  lists.glass.push(box(X0-.003,X0+.003,gy0,gy1,Z0+.012,PIER.z0));
  lists.glass.push(box(X1-.003,X1+.003,gy0,gy1,Z0+.012,PIER.z0));
  lists.glass.push(box(X0+.012,X1-.012,gy0,gy1,Z0-.003,Z0+.003));

  // ---- Ceramic logs on the burner (char) and the stacked logs of the niche. ----
  const cyl=(r,len,axis,cx,cy,cz,seg=14)=>{
    const g=new THREE.CylinderGeometry(r,r*.94,len,seg,1,false);
    if(axis==='x')g.rotateZ(Math.PI/2);else if(axis==='z')g.rotateX(Math.PI/2);
    g.translate(cx,cy,cz);return g;
  };
  const fx=(X0+X1)/2,fz=(FIRE.z0+FIRE.z1)/2,bed=BAND.y0+.07;
  lists.char.push(cyl(.034,.52,'z',fx-.07,bed+.03,fz+.01));
  lists.char.push(cyl(.031,.48,'z',fx+.08,bed+.03,fz-.02));
  {const g=cyl(.029,.42,'x',fx,bed+.075,fz);g.rotateY(0);lists.char.push(g);}
  {const g=new THREE.CylinderGeometry(.027,.025,.40,12);g.rotateZ(Math.PI/2);g.rotateY(.55);g.translate(fx,bed+.07,fz+.08);lists.char.push(g);}

  // Logs: rows packed like render 2a, ends to the salón; slight jitter in size and depth.
  let seed=7;const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
  const nz0=LOGS.z0+.006,nz1=LOGS.z1-STEEL-.004,ny0=BAND.y0+STEEL,top=BAND.y1-STEEL-.03;
  const r0=.052,dz=r0*2.02,dy=r0*1.75;
  for(let row=0;;row++){
    const y=ny0+r0+row*dy;if(y+r0>top)break;
    const off=row%2?r0:0,count=Math.floor((nz1-nz0-off)/dz);
    const z0=nz0+off+(nz1-nz0-off-count*dz)/2;
    for(let k=0;k<count;k++){
      const r=r0*(.88+.12*rnd()),len=.25-.03*rnd(),x=X0+.01+len/2+.012*rnd();
      const g=new THREE.CylinderGeometry(r,r,len,13,1,false);g.rotateZ(Math.PI/2);g.rotateX(rnd()*Math.PI);
      g.translate(x,y,z0+dz/2+k*dz);
      // groups: 0 side (bark), 1 and 2 caps (cut ends)
      const side=g.clone();side.clearGroups();
      const idx=g.index.array,first=g.groups[0];
      side.setIndex(Array.from(idx.slice(first.start,first.start+first.count)));
      const ends=g.clone();ends.clearGroups();
      ends.setIndex(Array.from(idx.slice(g.groups[1].start)));
      // Each log its own tone: seasoned oak and ash, a few darker.
      const tone=rnd()<.18?.62+.12*rnd():.82+.2*rnd(),warm=.96+.06*rnd();
      for(const part of [side,ends]){const n=part.getAttribute('position').count,c=new Float32Array(n*3);
        for(let i=0;i<n;i++){c[i*3]=tone*warm;c[i*3+1]=tone;c[i*3+2]=tone*(2-warm);}part.setAttribute('color',new THREE.BufferAttribute(c,3));}
      lists.bark.push(side);lists.ends.push(ends);
    }
  }

  // ---- Contact shadow round the plinth (the bake never saw it). ----
  {
    const pad=.16,w=PLINTH.x1-PLINTH.x0+2*pad,d=PLINTH.z1-PLINTH.z0+2*pad;
    const g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);
    g.translate((PLINTH.x0+PLINTH.x1)/2,.0025,(PLINTH.z0+PLINTH.z1)/2);lists.decal.push(g);
  }

  // ---- Materials. ----
  const plasterMat=new THREE.MeshStandardMaterial({color:'#ddd3c6',roughness:.9,map:plaster||null,normalMap:plasterNormal||null});
  // plaster.webp is a detail tile centred on mid-grey (the walls' shader doubles it), 0,75 m a tile.
  if(plaster){plasterMat.map=plaster.clone();plasterMat.map.repeat.set(1/.75,1/.75);plasterMat.map.needsUpdate=true;
    plasterMat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n  diffuseColor.rgb*=1.0+(texture2D(map,vMapUv).rgb*1.9922-1.0)*.8;\n#endif');};
    plasterMat.customProgramCacheKey=()=>'chimenea-plaster';}
  if(plasterNormal){plasterMat.normalMap=plasterNormal.clone();plasterMat.normalMap.repeat.set(1/.75,1/.75);plasterMat.normalMap.needsUpdate=true;plasterMat.normalScale.set(.6,.6);}
  const mats={
    plaster:plasterMat,
    stone:new THREE.MeshStandardMaterial({color:'#e4dacb',roughness:.72,normalMap:plasterNormal||null,normalScale:new THREE.Vector2(.25,.25)}),
    steel:new THREE.MeshStandardMaterial({color:'#1b1a18',roughness:.55,metalness:.35}),
    glass:new THREE.MeshStandardMaterial({color:'#0e0d0c',roughness:.04,metalness:0,transparent:true,opacity:.16,depthWrite:false}),
    char:new THREE.MeshStandardMaterial({color:'#2b2723',roughness:.95,emissive:'#ff4a12',emissiveIntensity:.05}),
    bark:new THREE.MeshStandardMaterial({color:'#6a5a4a',roughness:.92,vertexColors:true}),
    ends:new THREE.MeshStandardMaterial({color:'#b59e84',roughness:.88,vertexColors:true}),
    decal:new THREE.MeshBasicMaterial({map:shadowTexture(THREE),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
  };
  for(const [key,list] of Object.entries(lists)){
    if(!list.length)continue;
    const mesh=new THREE.Mesh(mergeGeometries(list.map(g=>g.index?g.toNonIndexed():g).map(g=>{for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);return g;})),mats[key]);
    mesh.name='chimenea:'+key;
    mesh.castShadow=!['glass','decal'].includes(key);mesh.receiveShadow=key!=='decal';
    if(key==='glass')mesh.renderOrder=2;
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
    for(const [ox,oz,turn,scale] of [[-.04,-.18,.3,.9],[.04,-.08,-.25,1],[-.03,.02,.15,1.15],[.05,.1,-.4,.95],[-.04,.19,.2,.85],[.02,-.13,1.4,.8],[0,.06,1.7,.9],[.06,-.02,.7,.75],[-.06,.12,-.8,.8],[0,-.23,1.2,.6]]){
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
  // Collision footprint (block and bench), as physics polygons [x, z].
  const rect=(x0,x1,z0,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
  const polys=[rect(PLINTH.x0,PLINTH.x1,PLINTH.z0,PLINTH.z1),rect(X0,X1,Z0,Z1)];
  const state={on:false,polys,group,
    set(on){state.on=on;group.visible=on;},
    tick(t){flame.uniforms.time.value=t;const f=.9+.1*Math.sin(t*7.3)*Math.sin(t*3.1);mats.char.emissiveIntensity=.06*f;}};
  state.set(false);
  return state;
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
