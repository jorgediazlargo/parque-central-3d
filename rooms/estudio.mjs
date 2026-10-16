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
  decor(ctx,THREE);
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
  // Round 7: the house's photographed oak veneer (grain along each member, its normal
  // and roughness for the satin sheen), tinted to the mid oak of render 4 and with the
  // grain contrast raised (the veneer is very even at 2 cm width).
  const oak=ctx.cloneMaterial(frame),wood=ctx.mats.wood;
  oak.color.set('#b2ab9c');oak.metalness=0;oak.roughness=.6;oak.vertexColors=true;
  if(wood.map){oak.map=wood.map;oak.normalMap=wood.normalMap;oak.roughnessMap=wood.roughnessMap;oak.normalScale=new THREE.Vector2(.7,.7);}
  {
    const prior=oak.onBeforeCompile,priorKey=oak.customProgramCacheKey?.bind(oak);
    oak.onBeforeCompile=(shader,r)=>{
      prior.call(oak,shader,r);
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
        {vec3 oakT=texture2D(map,vMapUv).rgb;
        // Grain contrast x3 in luminance (hue kept); a slow figure along the member.
        float oakL=dot(oakT,vec3(.2126,.7152,.0722))/.2024;
        vec3 oakC=oakT*clamp(1.0+(oakL-1.0)*2.0,.35,1.8);
        oakC*=.93+.07*texture2D(map,vMapUv*vec2(.13,.031)+.37).g/.191;
        diffuseColor.rgb*=oakC;}
        #endif`);
    };
    oak.customProgramCacheKey=()=>(priorKey?priorKey():'')+'|estudio-oak-7';
  }
  // Glint lines: the fixed screen's stiles (world z) and the rails (world y).
  const stileZ=[];
  for(const g of groups)if(!study.groups.includes(g)){
    g.updateMatrixWorld(true);
    for(const o of g.children)if(o.isMesh&&o.material===frame&&o.geometry.type==='BoxGeometry'&&Math.abs(o.geometry.parameters.width-STILE)<1e-4)stileZ.push(o.getWorldPosition(new THREE.Vector3()).z);
  }
  const glass=studyGlass(THREE,stileZ);
  ctx.onTimeOfDay(night=>{PANE_GLOW.value=night?.3:1;});

  // Rounded section: every member is its face outline extruded through the depth with
  // a rounded bevel inside the outline, so edges catch the light like turned timber.
  const bevel=(w,h)=>Math.min(.0075,Math.min(w,h)*.36);
  const extrudeShape=(shape,depth,r)=>{
    const t=Math.min(r,depth*.3);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:depth-2*t,bevelEnabled:true,bevelThickness:t,bevelSize:r,bevelOffset:-r,bevelSegments:3,curveSegments:32});
    geo.translate(0,0,-(depth-2*t)/2);return geo;
  };
  const rect=(w,h)=>{const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.lineTo(-w/2,-h/2);return s;};
  const bar=(w,h,d)=>{const g=extrudeShape(rect(w,h),d,bevel(w,h));memberUv(THREE,g,h>=w?'v':'h');return g;};
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
        // The outer arched frame (the one with a hole) is deeper, so its reveal shows. It is
        // rebuilt as its members (sill, jambs, arcs, head) with a joint between them, so the
        // grain follows each member (one cap with a hole spans long triangles across them).
        const outer=shapes.find(s=>s.holes.length);
        if(outer){
          const arcO=outer.curves.find(c=>c.isEllipseCurve),arcI=outer.holes[0].curves.find(c=>c.isEllipseCurve);
          const b=new THREE.Box2();for(const q of outer.getPoints())b.expandByPoint(q);
          const L=b.max.x,H=b.max.y,r=arcO.xRadius,f=r-arcI.xRadius,cy=H-r;
          const box2=(x0,y0,x1,y1)=>{const s=new THREE.Shape();s.moveTo(x0,y0);s.lineTo(x1,y0);s.lineTo(x1,y1);s.lineTo(x0,y1);s.lineTo(x0,y0);return s;};
          const ring=(cx,a0,a1)=>{const s=new THREE.Shape();s.absarc(cx,cy,r,a0,a1,false);s.absarc(cx,cy,r-f,a1,a0,true);return s;};
          out=[];const j=.0015; // joint
          for(const [s,how] of [[box2(0,0,L,f-j),'h'],[box2(0,f,f,cy-j),'v'],[box2(L-f,f,L,cy-j),'v'],[box2(r+j,H-f,L-r-j,H),'h'],
                                [ring(r,Math.PI/2,Math.PI),null],[ring(L-r,0,Math.PI/2),null]]){
            const g=extrudeShape(s,.06,.0075);memberUv(THREE,g,how||[s]);out.push(g);
          }
        }else{
          out=extrudeShape(shapes.length===1?shapes[0]:shapes,depth,.0075);
          memberUv(THREE,out,shapes);
        }
      }else continue;
      o.updateMatrix();
      for(const piece of Array.isArray(out)?out:[out]){piece.applyMatrix4(o.matrix);piece.translate(dx,0,0);shade(THREE,piece,.92+.16*rand());parts.push(piece);}
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
// Grain along each member (the veneer's grain runs along v; 1 uv = 1 m): stiles along
// y, rails along x, arcs along their curve. A random offset per member, so no two
// pieces show the same figure. `how`: 'v', 'h' or the extruded shapes (arcs inside).
let seed=7;
function rand(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646;}
function memberUv(THREE,geo,how){
  const pos=geo.getAttribute('position'),uv=new Float32Array(pos.count*2),ou=rand(),ov=rand()*2;
  const arcs=[];
  if(Array.isArray(how))for(const s of how)for(const path of [s,...s.holes])for(const c of path.curves)if(c.isEllipseCurve){
    const mid=(c.aStartAngle+c.aEndAngle)/2;arcs.push({x:c.aX,y:c.aY,r:c.xRadius,left:Math.cos(mid)<0});
  }
  let x0=Infinity,x1=-Infinity;
  if(Array.isArray(how)){for(let i=0;i<pos.count;i++){x0=Math.min(x0,pos.getX(i));x1=Math.max(x1,pos.getX(i));}}
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);let u,v;
    const arc=arcs.find(a=>y>=a.y-1e-4&&(a.left?x<=a.x+1e-4:x>=a.x-1e-4));
    if(arc){const dx=x-arc.x,dy=y-arc.y;u=Math.hypot(dx,dy)+z;v=Math.atan2(dy,dx)*arc.r;}
    else if(how==='v'||(Array.isArray(how)&&(x<x0+.08||x>x1-.08))){u=x+z;v=y;}
    else{u=y+z;v=x;}
    uv[i*2]=u+ou;uv[i*2+1]=v+ov;
  }
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}
// Pane outline (local x/y bounds) and whether it is a fixed pane, for the edge glint.
function paneRect(THREE,geo,fixed){
  geo.computeBoundingBox();const b=geo.boundingBox,n=geo.getAttribute('position').count,a=new Float32Array(n*4),f=new Float32Array(n).fill(fixed);
  for(let i=0;i<n;i++)a.set([b.min.x,b.min.y,b.max.x,b.max.y],i*4);
  geo.setAttribute('paneRect',new THREE.BufferAttribute(a,4));geo.setAttribute('paneFixed',new THREE.BufferAttribute(f,1));
}

const GLINT_Z=12;
// Bedroom window wall: the sheers run along x at this z (north wall of the suite).
const WIN={z:-9.40,x0:.15,x1:3.05,k:.16};
// Sheen, glints and the reflected window are painted light: at night (ctx.onTimeOfDay)
// only the pocket-lit sheers and the lamps are there to reflect, so they drop.
const PANE_GLOW={value:1};
function studyGlass(THREE,stileZ){
  const zs=[...stileZ.slice(0,GLINT_Z)];while(zs.length<GLINT_Z)zs.push(-1e3);
  // Float glass: a faint warm body that dims the study behind it by ~9 %, room
  // reflections with Fresnel (two faces), soft diagonal sheen bands and a thin glint
  // where each pane meets its frame, so the panes read as glass between the profiles.
  // Round 7: the body is a light warm haze lit by the bedroom (it veils the study a
  // little: less contrast, warmer), the room reflection is stronger, and the bedroom
  // window wall (the sheers, WIN) is reflected analytically: light vertical folds
  // on the left panes that move with the viewer, as in render 4.
  const m=new THREE.MeshPhysicalMaterial({color:'#8f7d6a',transparent:true,premultipliedAlpha:true,opacity:.12,roughness:.02,metalness:0,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1});
  m.onBeforeCompile=shader=>{
    shader.uniforms.paneStileZ={value:zs};shader.uniforms.paneGlow=PANE_GLOW;
    shader.vertexShader='attribute vec4 paneRect;\nattribute float paneFixed;\nvarying vec4 vPaneRect;\nvarying float vPaneFixed;\nvarying vec2 vPaneLocal;\nvarying vec3 vPaneWorld;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvPaneRect=paneRect;vPaneFixed=paneFixed;vPaneLocal=position.xy;vPaneWorld=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=`uniform float paneStileZ[${GLINT_Z}];\nuniform float paneGlow;\nvarying vec4 vPaneRect;\nvarying float vPaneFixed;\nvarying vec2 vPaneLocal;\nvarying vec3 vPaneWorld;\n`+shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>',`
      {float glassNV=saturate(abs(dot(normal,geometryViewDir)));
      float glassF=.07+.93*pow(1.0-glassNV,5.0);
      // Edge: distance to the pane outline (straight edges), a hairline and a soft halo.
      vec2 lo=vPaneLocal-vPaneRect.xy,hi=vPaneRect.zw-vPaneLocal;
      float edge=min(min(lo.x,hi.x),min(lo.y,hi.y));
      for(int i=0;i<2;i++)edge=min(edge,abs(vPaneWorld.y-(i==0?.88:2.08))-${(SLIM_RAIL/2).toFixed(4)});
      if(vPaneFixed>.5)for(int i=0;i<${GLINT_Z};i++)edge=min(edge,abs(vPaneWorld.z-paneStileZ[i])-${(SLIM_STILE/2).toFixed(4)});
      float glint=exp(-max(edge,0.0)/.004)*.8+exp(-max(edge,0.0)/.025)*.25;
      // Window: the view ray mirrored in the screen plane (normal x) meets the sheers.
      vec3 winV=normalize(vPaneWorld-cameraPosition),winR=vec3(-winV.x,winV.y,winV.z);float win=0.0;
      if(winR.z<-.01){
        vec3 h=vPaneWorld+winR*((${WIN.z.toFixed(3)}-vPaneWorld.z)/winR.z);
        float inX=smoothstep(${WIN.x0.toFixed(3)},${(WIN.x0+.2).toFixed(3)},h.x)*(1.0-smoothstep(${(WIN.x1-.15).toFixed(3)},${WIN.x1.toFixed(3)},h.x));
        float inY=smoothstep(.10,.55,h.y)*(1.0-smoothstep(2.20,2.45,h.y));
        float folds=.45+.55*pow(.5+.5*sin(h.x*${(Math.PI*2/.115).toFixed(3)}+sin(h.x*7.0)),2.0);
        win=inX*inY*folds*(.75+.25*smoothstep(.3,2.2,h.y));
      }
      // Sheen: soft vertical bands keyed to the reflected azimuth (the bedroom's sheer
      // folds and window light), so they slide across the panes as the viewer moves.
      vec3 shV=normalize(vPaneWorld-cameraPosition);
      float t=atan(shV.z,abs(shV.x))*6.5+vPaneWorld.y*.2;
      float sheen=(pow(max(0.0,sin(t)),4.0)*.75+pow(max(0.0,sin(t*2.9+1.3)),8.0)*.25)*smoothstep(.2,1.0,vPaneWorld.y)*(1.0-.4*smoothstep(1.6,2.4,vPaneWorld.y));
      vec3 glow=(vec3(1.0,.95,.88)*(glint*.18+sheen*.2)+vec3(1.0,.96,.90)*win*${WIN.k.toFixed(3)}*(.6+4.0*glassF))*paneGlow;
      gl_FragColor=vec4(totalDiffuse*diffuseColor.a+totalSpecular*2.0+glow,diffuseColor.a+(1.0-diffuseColor.a)*glassF*.85+glint*.05+win*.03);}`);
  };
  m.customProgramCacheKey=()=>'glass-estudio-7';
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
  // Twin-wheel casters (5.6 cm wheels under a hood), as in render 4.
  const wheel=new THREE.CylinderGeometry(.028,.028,.012,16);wheel.rotateX(Math.PI/2);
  const hub=new THREE.CylinderGeometry(.009,.009,.034,8);hub.rotateX(Math.PI/2);
  const hood=new THREE.BoxGeometry(.036,.022,.030),fork=new THREE.CylinderGeometry(.008,.008,.02,8);
  for(let i=0;i<5;i++){
    const a=i/5*Math.PI*2+Math.PI/5;
    add(legGeo,0,.10,0,0,a,-.13);
    const ex=Math.cos(a)*legLen*.99,ez=-Math.sin(a)*legLen*.99,px=Math.sin(a),pz=Math.cos(a);
    add(fork,ex,.068,ez);
    const wx=ex+Math.cos(a)*.016,wz=ez-Math.sin(a)*.016;
    add(hood,wx,.052,wz,0,a,0);add(hub,wx,.029,wz,0,a,0);
    for(const k of [-1,1])add(wheel,wx+px*k*.0115,.029,wz+pz*k*.0115,0,a,0);
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
function contactShadow(THREE,k=1){
  // Soft dark disc under the base (probe light casts no shadow): radial falloff in the shader.
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv;void main(){float d=length(vUv-.5)*2.0;float a=.80*pow(1.0-smoothstep(0.0,1.0,d),1.6)+.25*(1.0-smoothstep(.15,.45,d));gl_FragColor=vec4(0.0,0.0,0.0,min(a,.9)*'+k.toFixed(3)+');}'});
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

// --- Shelf and desk decor -------------------------------------------------------------
// Render 4: books in groups (upright rows and lying stacks, paper, linen and grey
// covers), a black glazed bowl, a cream vase, a trailing plant over the right end of
// the shelf, a bronze mushroom lamp and a stone bowl on the desk. Replaces the
// exported row of 13 evenly spaced books, the T lamp and the stacked-disc plant.
// One mesh per material; contact shades under each piece.
const SHELF={front:4.648,lower:1.645,upper:1.985,desk:.75};
const BAYS=[[-8.824,-8.108],[-8.087,-7.370],[-7.349,-6.749]];
function decor(ctx,THREE){
  ctx.removeExported({material:['fabric','clay'],box:[[4.70,1.64,-8.70],[4.93,1.93,-7.25]]});
  ctx.removeExported({material:'clay',box:[[4.64,1.64,-7.10],[4.81,1.79,-6.94]]});
  ctx.removeExported({material:'sage',box:[[4.58,1.18,-7.14],[4.82,1.82,-6.88]]});
  ctx.removeExported({material:['dark','bronze','led'],box:[[4.49,.745,-8.43],[4.73,1.075,-8.17]]});

  seed=4242;
  const books=[],shades=[];
  const COVERS=['#ebe6dc','#e2dccf','#d3cbbd','#c2b8a8','#a9a092','#8f897f','#ded5c3','#b9ab95','#77736c','#cfc6b6','#9a8b76','#e8e2d6'];
  const book=(t,h,d,cover)=>{
    // Canonical: depth along x (spine at -x), height y, thickness z; covers on ±z.
    const g=new THREE.BoxGeometry(d,h,t).toNonIndexed(),n=g.getAttribute('normal'),c=new Float32Array(n.count*3);
    const cv=new THREE.Color(cover),paper=new THREE.Color('#e9e2d2').multiplyScalar(.92+.08*rand());
    for(let i=0;i<n.count;i++){
      const nx=n.getX(i),nz=n.getZ(i),col=(nx<-.5||Math.abs(nz)>.5)?cv:paper;
      c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;
    }
    g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;
  };
  const pick=()=>COVERS[Math.floor(rand()*COVERS.length)];
  // Upright row from z0 towards +z; the last book leans on the row when lean is set.
  const row=(y0,z0,count,{hMin=.20,hMax=.27,lean=0}={})=>{
    let z=z0;
    for(let i=0;i<count;i++){
      const t=.016+rand()*.026,h=hMin+rand()*(hMax-hMin),d=Math.min(.21,h*.68+rand()*.03),g=book(t,h,d,pick());
      const x=SHELF.front+.05+rand()*.025+d/2;
      if(lean&&i===count-1){
        // Pivot on the bottom edge nearest the row, lean back onto it.
        const pz=z+h*Math.sin(lean)*.92;g.translate(0,h/2,t/2);g.rotateX(-lean);g.translate(x,y0,pz);z=pz+t;
      }else{g.translate(x,y0+h/2,z+t/2);z+=t+.0008+(rand()<.15?.004:0);}
      books.push(g);
    }
    return z;
  };
  const stack=(y0,zc,count)=>{
    let y=y0;
    for(let i=0;i<count;i++){
      const t=.02+rand()*.025,h=.20+rand()*.07,d=Math.min(.20,h*.7),g=book(t,h,d,pick());
      g.rotateX(Math.PI/2);g.rotateY((rand()-.5)*.12);g.translate(SHELF.front+.06+d/2,y+t/2,zc+(rand()-.5)*.02);y+=t;books.push(g);
    }
    return y;
  };
  // Lower shelf.
  row(SHELF.lower,-8.40,9);
  row(SHELF.lower,-8.075,6,{lean:.22});stack(SHELF.lower,-7.56,4);
  stack(SHELF.lower,-7.23,2);
  // Upper shelf.
  row(SHELF.upper,-8.81,5,{hMin:.22,hMax:.30,lean:.18});
  row(SHELF.upper,-6.97,6,{hMin:.22,hMax:.31});
  stack(SHELF.upper,-8.30,3);

  const shelfX=SHELF.front+.16;
  // Ceramics share one mesh (vertex colour); placed by translating their geometry.
  const pots=[];
  const ceramic=(geo,color)=>{
    const g=geo.index?geo.toNonIndexed():geo,c=new THREE.Color(color),n=g.getAttribute('position').count,a=new Float32Array(n*3);
    for(let i=0;i<n;i++)a.set([c.r,c.g,c.b],i*3);g.setAttribute('color',new THREE.BufferAttribute(a,3));pots.push(g);return g;
  };
  const at=(g,x,y,z)=>g.translate(x,y,z);
  const items=[];
  // Black glazed bowl, lower left bay; cream vase, upper middle bay.
  at(ceramic(lathe(THREE,[[0,0],[.055,0],[.075,.012],[.088,.04],[.092,.066],[.085,.066],[.078,.043],[.062,.018],[0,.012]],28),'#1d1b19'),shelfX,SHELF.lower,-8.62);
  shades.push([shelfX,SHELF.lower,-8.62,.22,.8]);
  at(ceramic(lathe(THREE,[[0,0],[.04,0],[.058,.04],[.064,.10],[.05,.16],[.03,.20],[.034,.215],[.028,.215],[.022,.20],[0,.19]],24),'#d9d1c3'),shelfX+.02,SHELF.upper,-7.73);
  shades.push([shelfX+.02,SHELF.upper,-7.73,.17,.7]);
  // Pot with a trailing plant, right end of the lower shelf (over the desk).
  const potZ=-6.93,potX=SHELF.front+.11;
  at(ceramic(lathe(THREE,[[0,0],[.045,0],[.058,.02],[.066,.11],[.071,.125],[.064,.125],[.058,.11],[0,.105]],24),'#cdc5b8'),potX,SHELF.lower,potZ);
  shades.push([potX,SHELF.lower,potZ,.18,.8]);
  const leaves=new THREE.Mesh(trailingPlant(THREE,potX,SHELF.lower+.12,potZ),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,side:THREE.DoubleSide}));
  items.push(leaves);
  // Desk: bronze mushroom lamp where the T lamp stood, stone bowl at the right end.
  const lamp=mushroomLamp(THREE);lamp.position.set(4.608,SHELF.desk,-8.302);items.push(lamp);
  shades.push([4.608,SHELF.desk,-8.302,.22,.7]);
  at(ceramic(lathe(THREE,[[0,0],[.06,0],[.09,.015],[.105,.045],[.108,.058],[.1,.058],[.094,.042],[.07,.02],[0,.014]],28),'#a39c91'),4.80,SHELF.desk,-7.06);
  shades.push([4.80,SHELF.desk,-7.06,.26,.8]);

  const paper=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82});
  const glaze=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.45,side:THREE.DoubleSide});
  const decorGroup=new THREE.Group();decorGroup.add(new THREE.Mesh(mergeGeometries(books),paper),new THREE.Mesh(mergeGeometries(pots),glaze),...items);
  decorGroup.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  ctx.lightRuntimeObject(decorGroup);
  const quads=shades.map(([x,y,z,size])=>{const q=new THREE.PlaneGeometry(size,size);q.rotateX(-Math.PI/2);q.translate(x,y+.002,z);return q;});
  const shadeMesh=new THREE.Mesh(mergeGeometries(quads),contactShadow(THREE,.75));shadeMesh.renderOrder=1;decorGroup.add(shadeMesh);
  ctx.group.add(decorGroup);
}
function lathe(THREE,pts,segments){
  const g=new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),segments);g.computeVertexNormals();return g;
}
function mushroomLamp(THREE){
  const g=new THREE.Group(),bronze=new THREE.MeshStandardMaterial({color:'#3d3128',roughness:.42,metalness:.45,side:THREE.DoubleSide});
  const parts=[];
  const base=new THREE.CylinderGeometry(.062,.066,.014,32);base.translate(0,.007,0);parts.push(base);
  const stem=new THREE.CylinderGeometry(.011,.013,.18,16);stem.translate(0,.104,0);parts.push(stem);
  const dome=[[.102,.188]];for(let i=0;i<=12;i++){const a=i/12*Math.PI/2;dome.push([Math.max(.0005,Math.cos(a)*.115),.19+Math.sin(a)*.10]);}
  parts.push(lathe(THREE,dome,36));
  g.add(new THREE.Mesh(mergeGeometries(parts.map(p=>p.index?p.toNonIndexed():p)),bronze));
  // Warm glow under the dome (seen only from low angles).
  const glow=new THREE.Mesh(new THREE.CircleGeometry(.1,24),new THREE.MeshBasicMaterial({color:'#ffd9a6'}));
  glow.rotation.x=Math.PI/2;glow.position.y=.188;g.add(glow);
  return g;
}
// Pothos-like trailing plant: a mound of leaves over the pot and strands that run to
// the shelf edge and hang down the desk wall, leaves every ~3 cm turned to the room.
function trailingPlant(THREE,px,py,pz){
  const pos=[],col=[],green=['#4c5c33','#5b6b3c','#3f4e2b','#687845','#53643a'].map(c=>new THREE.Color(c));
  const leaf=(x,y,z,size,yaw,pitch,roll,tone)=>{
    const l=size,w=size*.62,fold=size*.12;
    const v=[[0,0,0],[-w/2,l*.42,0],[0,l,0],[w/2,l*.42,0],[0,l*.45,-fold]];
    const e=new THREE.Euler(pitch,yaw,roll,'YXZ'),q=new THREE.Quaternion().setFromEuler(e);
    const p=v.map(a=>new THREE.Vector3(...a).applyQuaternion(q).add(new THREE.Vector3(x,y,z)));
    const c=green[Math.floor(tone*green.length)%green.length];
    for(const [a,b,d] of [[0,1,4],[1,2,4],[2,3,4],[3,0,4]]){
      for(const k of [a,b,d]){pos.push(p[k].x,p[k].y,p[k].z);const s=k===4?1.12:.9;col.push(c.r*s,c.g*s,c.b*s);}
    }
  };
  // Mound over the pot.
  for(let i=0;i<26;i++){
    const a=rand()*Math.PI*2,r=rand()*.07;
    leaf(px+Math.cos(a)*r,py+rand()*.05,pz+Math.sin(a)*r,.045+rand()*.025,a+Math.PI/2+(rand()-.5),-.4-rand()*.8,(rand()-.5)*.6,rand());
  }
  // Strands: out to the shelf front edge, then down.
  for(let s=0;s<9;s++){
    const a=Math.PI+(rand()-.5)*2.2,len=.12+rand()*.5;
    let x=px+Math.cos(a)*.05,y=py+.01,z=pz+Math.sin(a)*.05;
    const edge=SHELF.front-.01,dz=(rand()-.5)*.35;
    const steps=Math.round((Math.abs(x-edge)+len)/.028);
    for(let k=0;k<steps;k++){
      if(x>edge){x-=.028;z+=dz*.028;y=Math.max(SHELF.lower+.005,y-.006);}
      else{y-=.022;x-=.002+rand()*.003;z+=Math.sin(k*.7+s)*.006;}
      const size=.032+rand()*.02-(k/steps)*.01;
      leaf(x,y,z+(rand()-.5)*.02,size,-Math.PI/2+(rand()-.5)*1.4,(rand()-.5)*.9+(x<=edge?.6:-.8),(rand()-.5)*.9,rand());
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.computeVertexNormals();return g;
}
