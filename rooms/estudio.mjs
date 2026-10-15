// Room module: estudio. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/estudio.json).
//
// Render 4: the screen (built in app.js, layout unchanged) gets slimmer, rounded oak
// profiles with a lit and a shaded edge, a deeper outer frame and shadow lines at the
// joints, merged into one mesh per group; the glass has a faint body, reflections,
// sheen and a glint along the profiles. The desk chairs are compact upholstered tub
// chairs on a five-star base with a contact shadow; the desk wall between the worktop
// and the shelf is plaster, so the oak top reads against it.

import {mergeGeometries} from '../assets/jsm/utils/BufferGeometryUtils.js';

const STILE=.026,RAIL=.032;           // app.js STUDY section (face widths)
const SLIM_STILE=.021,SLIM_RAIL=.025; // render 4: finer carpentry; paired stiles show a gap

export async function apply(ctx){
  const {THREE}=ctx;
  screen(ctx,THREE);
  chairs(ctx,THREE);
  deskWall(ctx,THREE);
}

// --- Screen -------------------------------------------------------------------------
function screen(ctx,THREE){
  const study=ctx.doors?.find(d=>d.name==='Estudio');if(!study)return;
  let frame=null;
  for(const g of study.groups)g.traverse(o=>{if(!frame&&o.isMesh&&o.material?.visible!==false&&!o.material.transparent)frame=o.material;});
  if(!frame)return;
  const groups=[...study.groups];
  for(const o of ctx.scene.children)if(o.isGroup&&!groups.includes(o)&&o.children.some(c=>c.material===frame))groups.push(o);

  // Oak profiles of render 4: mid oak, satin, light enough to read as timber against
  // the plaster (the bronze-dark profiles read as a wireframe). Vertex shade: the faces
  // keep full colour, the rounded edges and returns fall off, so each member shows
  // its section.
  const oak=ctx.cloneMaterial(frame);
  oak.color.set('#917a66');oak.metalness=0;oak.roughness=.38;oak.vertexColors=true;
  // Glint lines: the fixed screen's stiles (world z) and the rails (world y).
  const stileZ=[];
  for(const g of groups)if(!study.groups.includes(g)){
    g.updateMatrixWorld(true);
    for(const o of g.children)if(o.isMesh&&o.material===frame&&o.geometry.type==='BoxGeometry'&&Math.abs(o.geometry.parameters.width-STILE)<1e-4)stileZ.push(o.getWorldPosition(new THREE.Vector3()).z);
  }
  const glass=studyGlass(THREE,stileZ);

  // Rounded section: every member is its face outline extruded through the depth with
  // a rounded bevel inside the outline, so edges catch the light like turned timber.
  const bevel=(w,h)=>Math.min(.0075,Math.min(w,h)*.36);
  const extrudeShape=(shape,depth,r)=>{
    const t=Math.min(r,depth*.3);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:depth-2*t,bevelEnabled:true,bevelThickness:t,bevelSize:r,bevelOffset:-r,bevelSegments:3,curveSegments:32});
    geo.translate(0,0,-(depth-2*t)/2);return geo;
  };
  const rect=(w,h)=>{const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.lineTo(-w/2,-h/2);return s;};
  const bar=(w,h,d)=>extrudeShape(rect(w,h),d,bevel(w,h));
  // Door opening in the fixed screen's own x (it runs south from fixedStudy[0]).
  const z0=ctx.data.fixedStudy[0][1],doorFrom=Math.min(study.a[1],study.b[1])-z0,doorTo=Math.max(study.a[1],study.b[1])-z0;
  for(const g of groups){
    const parts=[],drop=[];
    // Paired stiles leave a 5 mm slot: a recessed dark web fills it, as the shadow
    // line between the two members of render 4 (the room showed through it).
    const stiles=g.children.filter(o=>o.isMesh&&o.material===frame&&o.geometry.type==='BoxGeometry'&&Math.abs(o.geometry.parameters.width-STILE)<1e-4&&o.geometry.parameters.height>.1);
    for(const a of stiles)for(const b of stiles){
      if(b.position.x-a.position.x>STILE-1e-4&&b.position.x-a.position.x<STILE+1e-4&&Math.abs(a.position.y-b.position.y)<1e-3){
        const p=a.geometry.parameters,web=bar(STILE-SLIM_STILE+.002,p.height-.01,p.depth-.014);
        web.translate((a.position.x+b.position.x)/2,a.position.y,a.position.z);shade(THREE,web,.32);parts.push(web);
      }
    }
    for(const o of [...g.children]){
      if(!o.isMesh)continue;
      if(o.material===ctx.mats.glass){o.material=glass;o.castShadow=false;paneRect(THREE,o.geometry,study.groups.includes(g)?0:1);continue;}
      if(o.material!==frame)continue;
      const geo=o.geometry,p=geo.parameters||{},leaf=study.groups.includes(g);let out,dx=0;
      if(geo.type==='BoxGeometry'){
        let {width:w,height:h,depth:d}=p;
        if(Math.abs(w-STILE)<1e-4&&h>.1){
          // Stiles; a leaf's stiles keep its outer edges, so no slot opens at the joints.
          // Same for the fixed stiles that frame the door opening.
          w=SLIM_STILE;const shift=(STILE-SLIM_STILE)/2;
          if(leaf)dx=(o.position.x<STILE?-1:1)*shift;
          else if(Math.abs(o.position.x-(doorFrom-STILE/2))<2e-3)dx=shift;
          else if(Math.abs(o.position.x-(doorTo+STILE/2))<2e-3)dx=-shift;
        }else if(Math.abs(h-RAIL)<1e-4&&w>.1)h=SLIM_RAIL;       // rails and sill/head of leaves
        out=bar(w,h,d);
      }else if(geo.type==='ExtrudeGeometry'){
        const shape=p.shapes,opt=p.options||{},depth=opt.depth;
        const shapes=(Array.isArray(shape)?shape:[shape]).map(s=>{
          const arcs=s.curves.filter(c=>c.isEllipseCurve);
          if(!s.holes.length&&arcs.length===2){
            // Inner concentric arc of a side lite: same centre line, slimmer.
            const [a,b]=arcs,rm=(a.xRadius+b.xRadius)/2,a0=Math.min(a.aStartAngle,a.aEndAngle),a1=Math.max(a.aStartAngle,a.aEndAngle);
            const n=new THREE.Shape();n.absarc(a.aX,a.aY,rm+SLIM_STILE/2,a0,a1,false);n.absarc(a.aX,a.aY,rm-SLIM_STILE/2,a1,a0,true);return n;
          }
          return s;
        });
        // app.js translated its extrusion to the panel centre (z - depth/2), already done here.
        // The outer arched frame (the one with a hole) is deeper, so its reveal shows.
        const outer=shapes.some(s=>s.holes.length);
        out=extrudeShape(shapes.length===1?shapes[0]:shapes,outer?.06:depth,.0075);
      }else continue;
      o.updateMatrix();out.applyMatrix4(o.matrix);out.translate(dx,0,0);shade(THREE,out,1);parts.push(out);
      geo.dispose();drop.push(o);
    }
    if(!parts.length)continue;
    // One mesh per group (fixed screen, each leaf): ~40 draw calls fewer.
    const merged=new THREE.Mesh(mergeGeometries(parts),oak);
    merged.castShadow=true;merged.receiveShadow=true;merged.userData={...drop[0].userData};
    for(const o of drop){g.remove(o);o.visible=false;} // detached; hidden for the door raycast
    g.add(merged);
    if(!study.groups.includes(g))ctx.staticMeshes.push(merged);
  }
}
// Vertex shade of a profile: faces (local ±z) full, the rounded edges and returns
// darker, except those turned up and towards the window side (local -x), which catch
// the light as in render 4: each member shows a lit and a shaded edge.
function shade(THREE,geo,base){
  const n=geo.getAttribute('normal'),c=new Float32Array(n.count*3),lx=-.6,ly=.8;
  for(let i=0;i<n.count;i++){
    const nz=Math.abs(n.getZ(i)),side=1-nz,nx=n.getX(i),ny=n.getY(i),l=Math.hypot(nx,ny)||1;
    const k=base*(.5+.5*Math.pow(nz,.7)+.75*side*Math.max(0,(nx*lx+ny*ly)/l));
    c[i*3]=c[i*3+1]=c[i*3+2]=k;
  }
  geo.setAttribute('color',new THREE.BufferAttribute(c,3));
  if(!geo.getAttribute('uv'))geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(n.count*2),2));
}
// Pane outline (local x/y bounds) and whether it is a fixed pane, for the edge glint.
function paneRect(THREE,geo,fixed){
  geo.computeBoundingBox();const b=geo.boundingBox,n=geo.getAttribute('position').count,a=new Float32Array(n*4),f=new Float32Array(n).fill(fixed);
  for(let i=0;i<n;i++)a.set([b.min.x,b.min.y,b.max.x,b.max.y],i*4);
  geo.setAttribute('paneRect',new THREE.BufferAttribute(a,4));geo.setAttribute('paneFixed',new THREE.BufferAttribute(f,1));
}

const GLINT_Z=12;
function studyGlass(THREE,stileZ){
  const zs=[...stileZ.slice(0,GLINT_Z)];while(zs.length<GLINT_Z)zs.push(-1e3);
  // Float glass: a faint warm body that dims the study behind it by ~9 %, room
  // reflections with Fresnel (two faces), soft diagonal sheen bands and a thin glint
  // where each pane meets its frame, so the panes read as glass between the profiles.
  const m=new THREE.MeshPhysicalMaterial({color:'#3b3129',transparent:true,premultipliedAlpha:true,opacity:.13,roughness:.02,metalness:0,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1});
  m.onBeforeCompile=shader=>{
    shader.uniforms.paneStileZ={value:zs};
    shader.vertexShader='attribute vec4 paneRect;\nattribute float paneFixed;\nvarying vec4 vPaneRect;\nvarying float vPaneFixed;\nvarying vec2 vPaneLocal;\nvarying vec3 vPaneWorld;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvPaneRect=paneRect;vPaneFixed=paneFixed;vPaneLocal=position.xy;vPaneWorld=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=`uniform float paneStileZ[${GLINT_Z}];\nvarying vec4 vPaneRect;\nvarying float vPaneFixed;\nvarying vec2 vPaneLocal;\nvarying vec3 vPaneWorld;\n`+shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>',`
      {float glassNV=saturate(abs(dot(normal,geometryViewDir)));
      float glassF=.07+.93*pow(1.0-glassNV,5.0);
      // Edge: distance to the pane outline (straight edges), a hairline and a soft halo.
      vec2 lo=vPaneLocal-vPaneRect.xy,hi=vPaneRect.zw-vPaneLocal;
      float edge=min(min(lo.x,hi.x),min(lo.y,hi.y));
      for(int i=0;i<2;i++)edge=min(edge,abs(vPaneWorld.y-(i==0?.88:2.08))-${(SLIM_RAIL/2).toFixed(4)});
      if(vPaneFixed>.5)for(int i=0;i<${GLINT_Z};i++)edge=min(edge,abs(vPaneWorld.z-paneStileZ[i])-${(SLIM_STILE/2).toFixed(4)});
      float glint=exp(-max(edge,0.0)/.004)*.8+exp(-max(edge,0.0)/.025)*.25;
      // Sheen: two soft diagonal bands across the screen plane (z along, y up).
      float t=vPaneWorld.z*.85+vPaneWorld.y*.55;
      float sheen=pow(max(0.0,sin(t*2.3)),8.0)*.7+pow(max(0.0,sin(t*5.3+1.3)),14.0)*.3;
      vec3 glow=vec3(1.0,.93,.84)*(glint*.18+sheen*.05);
      gl_FragColor=vec4(totalDiffuse*diffuseColor.a+totalSpecular+glow,diffuseColor.a+(1.0-diffuseColor.a)*glassF*.85+glint*.05);}`);
  };
  m.customProgramCacheKey=()=>'glass-estudio-2';
  return m;
}

// --- Chairs ---------------------------------------------------------------------------
// Render 4: two compact tub chairs, back just above the worktop (top 77 cm), 54 cm
// wide, seat front at the desk edge. Fine bouclé (loops at 40 % of the shared scale),
// vertex occlusion inside the tub and under the seat, a contact shadow under the base.
// Per chair: one upholstery mesh, one base mesh, one shadow quad.
function chairs(ctx,THREE){
  // Exported chairs (small seat and back pad on a dark base): replaced.
  ctx.removeExported({material:'fabric',box:[[4.30,.37,-8.46],[4.77,.84,-7.20]]});
  ctx.removeExported({material:'dark',box:[[4.30,0,-8.43],[4.81,.74,-7.19]]});

  const fabric=ctx.cloneMaterial(ctx.mats.fabric);fabric.color.set('#77716b');fabric.vertexColors=true;
  fabric.normalScale=fabric.normalScale.clone().multiplyScalar(.55);fabric.sheen=.25;
  const base=ctx.cloneMaterial(ctx.mats.dark);base.color.set('#1f1d1a');base.roughness=.5;
  const upholstery=mergeGeometries([tubShell(THREE),seatCushion(THREE)]),frame=starBase(THREE);
  const shadowMat=contactShadow(THREE);
  for(const [x,z,turn] of [[4.21,-8.22,.05],[4.21,-7.27,-.04]]){
    const chair=new THREE.Group();chair.position.set(x,0,z);chair.rotation.y=turn;
    chair.add(new THREE.Mesh(upholstery,fabric),new THREE.Mesh(frame,base));
    chair.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    ctx.lightRuntimeObject(chair);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.78,.78),shadowMat);
    shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.004,0);shadow.renderOrder=1;chair.add(shadow);
    ctx.group.add(chair);
  }
}

// Upholstered tub: a lathed shell, high at the back and sloping down to the arms,
// open at the front (+x, towards the desk).
function tubShell(THREE){
  const ro=.272,ri=.226,y0=.40,top=.745,rr=(ro-ri)/2;
  const pts=[];
  pts.push(new THREE.Vector2(ri+.01,y0+.02),new THREE.Vector2(ro-.03,y0),new THREE.Vector2(ro-.005,y0+.03));
  pts.push(new THREE.Vector2(ro+.005,y0+.13),new THREE.Vector2(ro+.003,top-.10),new THREE.Vector2(ro,top));
  for(let i=1;i<10;i++){const a=i/10*Math.PI;pts.push(new THREE.Vector2(ri+rr+rr*Math.cos(a),top+rr*Math.sin(a)*1.1));}
  pts.push(new THREE.Vector2(ri,top),new THREE.Vector2(ri-.004,y0+.12),new THREE.Vector2(ri+.01,y0+.02));
  const open=2.0; // front opening, radians
  // Lathe: x = r sin(phi), z = r cos(phi); the back faces -x (phi = -pi/2).
  const geo=new THREE.LatheGeometry(pts,48,Math.PI/2+open/2,2*Math.PI-open);
  const pos=geo.getAttribute('position');
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const fromBack=Math.abs(Math.atan2(z,-x)); // 0 at the back, pi at the front
    const t=THREE.MathUtils.smoothstep(fromBack,.55,Math.PI-open/2);
    const k=1-.30*t;
    pos.setXYZ(i,x*.93,y0+(y-y0)*k,z*1.0);
  }
  geo.computeVertexNormals();
  // Occlusion: the inside of the tub darkens towards the seat, the outside towards the base.
  const c=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i)/.93,y=pos.getY(i),z=pos.getZ(i),r=Math.hypot(x,z);
    const inner=r<(ri+rr);
    const k=inner?.62+.38*THREE.MathUtils.smoothstep(y,y0+.03,y0+.30):.72+.28*THREE.MathUtils.smoothstep(y,y0-.01,y0+.16);
    c[i*3]=c[i*3+1]=c[i*3+2]=k;
  }
  geo.setAttribute('color',new THREE.BufferAttribute(c,3));
  metricUv(THREE,geo);return geo.toNonIndexed();
}
function seatCushion(THREE){
  const w=.44,d=.40,r=.09,s=new THREE.Shape();
  s.moveTo(-d/2+r,-w/2);s.lineTo(d/2-r,-w/2);s.quadraticCurveTo(d/2,-w/2,d/2,-w/2+r);s.lineTo(d/2,w/2-r);s.quadraticCurveTo(d/2,w/2,d/2-r,w/2);
  s.lineTo(-d/2+r,w/2);s.quadraticCurveTo(-d/2,w/2,-d/2,w/2-r);s.lineTo(-d/2,-w/2+r);s.quadraticCurveTo(-d/2,-w/2,-d/2+r,-w/2);
  const geo=new THREE.ExtrudeGeometry(s,{depth:.035,bevelEnabled:true,bevelThickness:.022,bevelSize:.022,bevelSegments:4,curveSegments:8});
  geo.rotateX(-Math.PI/2);geo.translate(.03,.425,0);geo.computeVertexNormals();
  const pos=geo.getAttribute('position'),c=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){const k=.6+.4*THREE.MathUtils.smoothstep(pos.getY(i),.41,.48);c[i*3]=c[i*3+1]=c[i*3+2]=k;}
  geo.setAttribute('color',new THREE.BufferAttribute(c,3));
  metricUv(THREE,geo);return geo.index?geo.toNonIndexed():geo;
}
// Five-star swivel base merged into one geometry.
function starBase(THREE){
  const parts=[],m=new THREE.Matrix4(),e=new THREE.Euler(),q=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1);
  const add=(geo,x,y,z,rx=0,ry=0,rz=0)=>{
    const g=geo.index?geo.toNonIndexed():geo.clone();
    m.compose(new THREE.Vector3(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),one);g.applyMatrix4(m);parts.push(g);
  };
  add(new THREE.CylinderGeometry(.12,.12,.022,24),0,.385,0);                   // seat plate
  add(new THREE.CylinderGeometry(.022,.022,.27,12),0,.24,0);                   // column
  add(new THREE.CylinderGeometry(.032,.028,.14,12),0,.17,0);                   // gas sleeve
  add(new THREE.CylinderGeometry(.048,.052,.05,16),0,.105,0);                  // hub
  const legLen=.28,legGeo=new THREE.BoxGeometry(legLen,.030,.040);
  legGeo.translate(legLen/2,0,0);
  const wheel=new THREE.CylinderGeometry(.024,.024,.020,12);wheel.rotateX(Math.PI/2);
  const fork=new THREE.BoxGeometry(.028,.038,.028);
  for(let i=0;i<5;i++){
    const a=i/5*Math.PI*2+Math.PI/5;
    add(legGeo,0,.10,0,0,a,-.13);
    const ex=Math.cos(a)*legLen*.99,ez=-Math.sin(a)*legLen*.99;
    add(fork,ex,.066,ez,0,a,0);
    add(wheel,ex+Math.cos(a)*.012,.025,ez-Math.sin(a)*.012,0,a,0);
  }
  return mergeGeometries(parts);
}
// Metric UVs times `scale`: the shared bouclé tile (33 cm) shrunk to read as a fine weave.
function metricUv(THREE,geo,scale=2.5){
  const pos=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    if(Math.abs(n.getY(i))>.7){uv[i*2]=x*scale;uv[i*2+1]=z*scale;}else{uv[i*2]=Math.atan2(z,x)*.27*scale;uv[i*2+1]=y*scale;}
  }
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}
function contactShadow(THREE){
  // Soft dark disc under the base (probe light casts no shadow): radial falloff in the shader.
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv;void main(){float d=length(vUv-.5)*2.0;float a=.80*pow(1.0-smoothstep(0.0,1.0,d),1.6)+.25*(1.0-smoothstep(.15,.45,d));gl_FragColor=vec4(0.0,0.0,0.0,min(a,.9));}'});
}

// --- Desk wall ------------------------------------------------------------------------
// The oak back panel of the desk niche (x 5.035, y 0.74-2.38) is one baked quad. Its
// light stays; below the shelf (y < 1.62) it takes the plaster finish of render 4.
function deskWall(ctx,THREE){
  const parts=ctx.splitExported({material:'wood',box:[[5.03,.7,-8.86],[5.04,2.4,-6.72]]});
  const wall=ctx.mats.wall,plaster=wall.map;
  for(const piece of parts){
    const m=piece.material,prior=m.onBeforeCompile,priorKey=m.customProgramCacheKey?.bind(m);
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.uniforms.deskPlaster={value:plaster};
      shader.uniforms.deskPlasterColor={value:wall.color.clone()};
      shader.fragmentShader='uniform sampler2D deskPlaster;\nuniform vec3 deskPlasterColor;\n'+shader.fragmentShader
        .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          bool deskIsPlaster=houseWorld.y<1.62;
          if(deskIsPlaster){
            vec3 lime=texture2D(deskPlaster,houseWorld.zy*.6).rgb;
            diffuseColor.rgb=deskPlasterColor*lime;roughnessFactor=.92;
          }`)
        .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nif(houseWorld.y<1.62)normal=nonPerturbedNormal;');
    };
    m.customProgramCacheKey=()=>(priorKey?priorKey():'')+'|estudio-desk-wall';
    m.needsUpdate=true;
  }
}
