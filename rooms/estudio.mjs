// Room module: estudio. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/estudio.json).
//
// Render 4: the screen (built in app.js, layout unchanged) gets slimmer, rounded oak
// profiles and clear glass with reflections; the desk chairs become upholstered tub
// chairs on a five-star base with a contact shadow; the desk wall between the worktop
// and the shelf is plaster, so the oak top reads against it.

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

  // Oak profiles of render 4: mid brown, satin, not the dark metallic bronze.
  const oak=ctx.cloneMaterial(frame);
  oak.color.set('#5a4a3e');oak.metalness=0;oak.roughness=.42;
  const glass=studyGlass(THREE);

  // Rounded section: every member is its face outline extruded through the depth with
  // a small bevel inside the outline, so edges catch the light like turned timber.
  const bevel=(w,h)=>Math.min(.0045,Math.min(w,h)*.22);
  const extrudeShape=(shape,depth,r)=>{
    const t=Math.min(r,depth*.3);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:depth-2*t,bevelEnabled:true,bevelThickness:t,bevelSize:r,bevelOffset:-r,bevelSegments:3,curveSegments:32});
    geo.translate(0,0,-(depth-2*t)/2);return geo;
  };
  const bar=(w,h,d)=>{
    const s=new THREE.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.lineTo(-w/2,-h/2);
    return extrudeShape(s,d,bevel(w,h));
  };
  for(const g of groups)g.traverse(o=>{
    if(!o.isMesh)return;
    if(o.material===ctx.mats.glass){o.material=glass;o.castShadow=false;return;}
    if(o.material!==frame)return;
    const geo=o.geometry,p=geo.parameters||{};
    if(geo.type==='BoxGeometry'){
      let {width:w,height:h,depth:d}=p;
      if(Math.abs(w-STILE)<1e-4&&h>.1)w=SLIM_STILE;          // stiles
      else if(Math.abs(h-RAIL)<1e-4&&w>.1)h=SLIM_RAIL;       // rails and sill/head of leaves
      o.geometry=bar(w,h,d);geo.dispose();
    }else if(geo.type==='ExtrudeGeometry'){
      const shape=p.shapes,opt=p.options||{},depth=opt.depth;
      const shapes=Array.isArray(shape)?shape:[shape];
      const out=shapes.map(s=>{
        const arcs=s.curves.filter(c=>c.isEllipseCurve);
        if(!s.holes.length&&arcs.length===2){
          // Inner concentric arc of a side lite: same centre line, slimmer.
          const [a,b]=arcs,rm=(a.xRadius+b.xRadius)/2,a0=Math.min(a.aStartAngle,a.aEndAngle),a1=Math.max(a.aStartAngle,a.aEndAngle);
          const n=new THREE.Shape();n.absarc(a.aX,a.aY,rm+SLIM_STILE/2,a0,a1,false);n.absarc(a.aX,a.aY,rm-SLIM_STILE/2,a1,a0,true);return n;
        }
        return s;
      });
      const g2=extrudeShape(out.length===1?out[0]:out,depth,.0045);
      // app.js translated its extrusion to the panel centre (z - depth/2), already done here.
      o.geometry=g2;geo.dispose();
    }
    o.material=oak;
  });
}

function studyGlass(THREE){
  // Clear float glass: barely any body, full room reflections with Fresnel, so the
  // panes read as glass (frame and lights mirrored at an angle) without a milky veil.
  const m=new THREE.MeshPhysicalMaterial({color:'#7d7466',transparent:true,premultipliedAlpha:true,opacity:.035,roughness:.02,metalness:0,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1});
  m.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>',`
      {float glassNV=saturate(abs(dot(normal,geometryViewDir)));
      float glassF=(.045+.955*pow(1.0-glassNV,5.0));
      gl_FragColor=vec4(totalDiffuse*diffuseColor.a+totalSpecular*.95,diffuseColor.a+(1.0-diffuseColor.a)*glassF*.9);}`);
  };
  m.customProgramCacheKey=()=>'glass-estudio';
  return m;
}

// --- Chairs ---------------------------------------------------------------------------
function chairs(ctx,THREE){
  // Exported chairs (small seat and back pad on a dark base): replaced.
  ctx.removeExported({material:'fabric',box:[[4.30,.37,-8.46],[4.77,.84,-7.20]]});
  ctx.removeExported({material:'dark',box:[[4.30,0,-8.43],[4.81,.74,-7.19]]});

  const fabric=ctx.cloneMaterial(ctx.mats.fabric);fabric.color.set('#6a6c70');
  const base=ctx.cloneMaterial(ctx.mats.dark);base.color.set('#1f1d1a');base.roughness=.5;
  const shell=tubShell(THREE),cushion=seatCushion(THREE);
  const shadowMat=contactShadow(THREE);
  for(const [x,z,turn] of [[4.27,-8.22,.05],[4.27,-7.27,-.04]]){
    const chair=new THREE.Group();chair.position.set(x,0,z);chair.rotation.y=turn;
    const s=new THREE.Mesh(shell,fabric),c=new THREE.Mesh(cushion,fabric);
    chair.add(s,c);
    starBase(THREE,chair,base);
    chair.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    ctx.lightRuntimeObject(chair);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.85,.85),shadowMat);
    shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.004,0);shadow.renderOrder=1;chair.add(shadow);
    ctx.group.add(chair);
  }
}

// Upholstered tub: a lathed shell, high at the back and sloping down to the arms,
// open at the front (+x, towards the desk).
function tubShell(THREE){
  const ro=.30,ri=.245,y0=.40,top=.80,rr=(ro-ri)/2;
  const pts=[];
  pts.push(new THREE.Vector2(ri+.01,y0+.02),new THREE.Vector2(ro-.03,y0),new THREE.Vector2(ro-.005,y0+.03));
  pts.push(new THREE.Vector2(ro+.006,y0+.15),new THREE.Vector2(ro+.004,top-.12),new THREE.Vector2(ro,top));
  for(let i=1;i<12;i++){const a=i/12*Math.PI;pts.push(new THREE.Vector2(ri+rr+rr*Math.cos(a),top+rr*Math.sin(a)*1.1));}
  pts.push(new THREE.Vector2(ri,top),new THREE.Vector2(ri-.004,y0+.12),new THREE.Vector2(ri+.01,y0+.02));
  const open=1.95; // front opening, radians
  // Lathe: x = r sin(phi), z = r cos(phi); the back faces -x (phi = -pi/2).
  const geo=new THREE.LatheGeometry(pts,56,Math.PI/2+open/2,2*Math.PI-open);
  const pos=geo.getAttribute('position');
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const fromBack=Math.abs(Math.atan2(z,-x)); // 0 at the back, pi at the front
    const t=THREE.MathUtils.smoothstep(fromBack,.55,Math.PI-open/2);
    const k=1-.27*t;
    pos.setXYZ(i,x*.93,y0+(y-y0)*k,z*1.03);
  }
  geo.computeVertexNormals();metricUv(THREE,geo);return geo;
}
function seatCushion(THREE){
  const w=.50,d=.44,r=.10,s=new THREE.Shape();
  s.moveTo(-d/2+r,-w/2);s.lineTo(d/2-r,-w/2);s.quadraticCurveTo(d/2,-w/2,d/2,-w/2+r);s.lineTo(d/2,w/2-r);s.quadraticCurveTo(d/2,w/2,d/2-r,w/2);
  s.lineTo(-d/2+r,w/2);s.quadraticCurveTo(-d/2,w/2,-d/2,w/2-r);s.lineTo(-d/2,-w/2+r);s.quadraticCurveTo(-d/2,-w/2,-d/2+r,-w/2);
  const geo=new THREE.ExtrudeGeometry(s,{depth:.04,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:4,curveSegments:10});
  geo.rotateX(-Math.PI/2);geo.translate(.03,.425,0);geo.computeVertexNormals();metricUv(THREE,geo);return geo;
}
function starBase(THREE,chair,mat){
  const add=(geo,x,y,z,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);chair.add(m);return m;};
  add(new THREE.CylinderGeometry(.13,.13,.025,28),0,.385,0);                   // seat plate
  add(new THREE.CylinderGeometry(.024,.024,.27,16),0,.24,0);                   // column
  add(new THREE.CylinderGeometry(.034,.030,.14,16),0,.17,0);                   // gas sleeve
  add(new THREE.CylinderGeometry(.05,.055,.05,20),0,.105,0);                   // hub
  const legLen=.30,legGeo=new THREE.BoxGeometry(legLen,.032,.042);
  legGeo.translate(legLen/2,0,0);
  const wheel=new THREE.CylinderGeometry(.026,.026,.022,16);wheel.rotateX(Math.PI/2);
  const fork=new THREE.BoxGeometry(.03,.04,.03);
  for(let i=0;i<5;i++){
    const a=i/5*Math.PI*2+Math.PI/5;
    const leg=add(legGeo,0,.10,0,0,a,-.13);
    const ex=Math.cos(a)*legLen*.99,ez=-Math.sin(a)*legLen*.99;
    add(fork,ex,.068,ez,0,a,0);
    add(wheel,ex+Math.cos(a)*.012,.027,ez-Math.sin(a)*.012,0,a,0);
    void leg;
  }
}
function metricUv(THREE,geo){
  const pos=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    if(Math.abs(n.getY(i))>.7){uv[i*2]=x;uv[i*2+1]=z;}else{uv[i*2]=Math.atan2(z,x)*.3;uv[i*2+1]=y;}
  }
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}
function contactShadow(THREE){
  // Soft dark disc under the base (probe light casts no shadow): radial falloff in the shader.
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv;void main(){float d=length(vUv-.5)*2.0;float a=.72*pow(1.0-smoothstep(0.0,1.0,d),1.2);gl_FragColor=vec4(0.0,0.0,0.0,a);}'});
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
