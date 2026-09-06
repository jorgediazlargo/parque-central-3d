import * as THREE from './assets/three.module.js';
import {Reflector} from './assets/Reflector.js';
import {EffectComposer} from './assets/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from './assets/jsm/postprocessing/RenderPass.js';
import {SSAOPass} from './assets/jsm/postprocessing/SSAOPass.js';
import {OutputPass} from './assets/jsm/postprocessing/OutputPass.js';
import {RoomEnvironment} from './assets/jsm/environments/RoomEnvironment.js';
import {kitchenColliders} from './kitchen.mjs';
import {WorldPhysics,doorSegments,footprint,overlaps,inside} from './physics.mjs?v=kitchen-right-20260906';

const $=id=>document.getElementById(id),canvas=$('world');
let scene,camera,renderer,composer,ao,data,physics,player,doors=[],staticMeshes=[],target=null;
let kitchenAlternative=false;
const kitchenLayers={original:[],alternative:[],island:[]};
let playing=false,ready=false,yaw=.05,pitch=0,velocity=[0,0],keys=new Set(),last=0,walkPhase=0,bobAmount=0,stepDistance=0;
let touchVector=[0,0],touchLook=null,dragLook=null,audioCtx,noticeTimer,rayTime=0,roomTime=0;
const mobile=matchMedia('(pointer:coarse)').matches,eye=1.69;
const raycaster=new THREE.Raycaster();raycaster.far=2.25;
const settings={sound:true,bob:!matchMedia('(prefers-reduced-motion:reduce)').matches};
try{Object.assign(settings,JSON.parse(localStorage.getItem('parque-preferences')||'{}'));}catch{}
for(const key of ['sound','bob']) {
  $(key).checked=settings[key];$(key).onchange=()=>{settings[key]=$(key).checked;try{localStorage.setItem('parque-preferences',JSON.stringify(settings));}catch{}};
}
function notice(text){$('notice').textContent=text;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),2600);}

function material(color,kind,roughness=.7){
  const m=kind==='fabric'||kind==='linen'||kind==='rug'?new THREE.MeshPhysicalMaterial({color,roughness,sheen:.38,sheenRoughness:.85,sheenColor:'#e8dfd0',side:THREE.DoubleSide}):new THREE.MeshStandardMaterial({color,roughness,side:THREE.DoubleSide});
  m.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 houseWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nhouseWorld=(modelMatrix*vec4(position,1.0)).xyz;');
      shader.fragmentShader='varying vec3 houseWorld;\nfloat hashHouse(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'+shader.fragmentShader;
      if(['fabric','linen','rug'].includes(kind)){
        // Derivative-filtered weave remains stable at walking distance.
        const freq=kind==='rug'?240:kind==='linen'?1350:950;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec2 clothUv=vUv*${freq.toFixed(1)};
          vec2 footprintCloth=fwidth(clothUv);
          float fadeCloth=1.0-smoothstep(.8,2.8,max(footprintCloth.x,footprintCloth.y));
          float weaveCloth=sin(clothUv.x)*sin(clothUv.y);
          float yarnCloth=sin(clothUv.x*.081+sin(clothUv.y*.061))*sin(clothUv.y*.077);
          diffuseColor.rgb*=.975+weaveCloth*fadeCloth*.035+yarnCloth*.018;
        `);
      }
      if(kind==='stone')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\nvec2 stoneUv=vec2(.045,.25)+fract(vMapUv)*vec2(.26,.17);diffuseColor*=texture2D(map,stoneUv);\n#endif');
      if(kind==='wall')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\ndiffuseColor.rgb*=mix(vec3(.88),texture2D(map,vMapUv).rgb,.18);\n#endif');
      if(kind==='wall'){
        let glow='float cove=0.0;';
        for(const r of data?.coves||[]){
          const [x0,z0,x1,z1,h]=r;
          glow+=`{vec2 q=houseWorld.xz;vec2 lo=vec2(${x0.toFixed(5)},${z0.toFixed(5)}),hi=vec2(${x1.toFixed(5)},${z1.toFixed(5)});vec2 outer=max(max(lo-q,q-hi),vec2(0.0));float edge=min(min(abs(q.x-lo.x),abs(q.x-hi.x)),min(abs(q.y-lo.y),abs(q.y-hi.y)));cove+=exp(-edge*8.0-length(outer)*15.0-abs(houseWorld.y-${(h+.07).toFixed(3)})*7.0)*.52;}`;
        }
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',glow+'\noutgoingLight+=vec3(1.0,.57,.24)*cove;\n#include <opaque_fragment>');
      }
    };m.customProgramCacheKey=()=>kind||'plain';
  if(['fabric','linen','rug'].includes(kind))m.defines={USE_UV:''};
  return m;
}
const mats={wall:material('#dfd0b9','wall',.86),stone:material('#f2e7d7','stone',.38),kitchenStone:material('#f2e7d7','stone',.38),floor:material('#eee0cb','floor',.54),
  tile:material('#d4c5ae','stone',.6),
  wood:material('#efdfc8','wood',.48),white:material('#ece8e0'),fabric:material('#bcb09d','fabric',.89),linen:material('#ebe5d9','linen',.93),
  bronze:material('#765439',null,.31),dark:material('#28251f',null,.42),glass:new THREE.MeshPhysicalMaterial({color:'#d5c9b8',transparent:true,opacity:.13,roughness:.085,metalness:.16,depthWrite:false,side:THREE.DoubleSide}),
  led:new THREE.MeshStandardMaterial({color:'#ffe1a3',emissive:'#ffbe6d',emissiveIntensity:3.8}),
  sage:material('#797e59','fabric'),lacquer:material('#bfb7a7',null,.4),rug:material('#b6a58a','rug',.96),
  blackstone:material('#39362d','stone',.35),clay:material('#a9613f',null,.65),curtain:material('#e9e0cf','fabric')};
mats.bronze.metalness=.65;
mats.curtain.transparent=true;mats.curtain.opacity=.62;mats.curtain.depthWrite=false;

async function surfaceTextures(){
  const loader=new THREE.TextureLoader();
  for(const [asset,targets,scale,strength] of [
    ['wood_floor',['floor'],.59,.22],
    ['marble_01',['stone','tile','blackstone','kitchenStone'],.55,.12],['white_plaster_02',['wall'],.8,.24]]){
    const maps=await Promise.all(['diff','nor_gl','rough'].map(c=>loader.loadAsync(`./assets/textures/${asset}_${c}_1k.jpg`)));
    maps.forEach((t,i)=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(scale,scale);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(i===0)t.colorSpace=THREE.SRGBColorSpace;});
    for(const key of targets){mats[key].map=maps[0];mats[key].normalMap=maps[1];mats[key].roughnessMap=maps[2];mats[key].normalScale.set(strength,strength);mats[key].needsUpdate=true;}
  }
  // Dedicated veneer: no flooring seams on cabinetry, doors, tables or slats.
  const veneer=await loader.loadAsync('./assets/textures/oak_veneer.png');
  veneer.colorSpace=THREE.SRGBColorSpace;veneer.wrapS=veneer.wrapT=THREE.RepeatWrapping;
  veneer.repeat.set(.65,.42);veneer.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  mats.wood.map=veneer;mats.wood.bumpMap=veneer;mats.wood.bumpScale=.00065;mats.wood.needsUpdate=true;
}

function box(group,w,h,d,x,y,z,mat){
  const geo=new THREE.BoxGeometry(w,h,d),uv=geo.getAttribute('uv'),pos=geo.getAttribute('position'),norm=geo.getAttribute('normal');
  for(let i=0;i<uv.count;i++){
    if(Math.abs(norm.getY(i))>.5)uv.setXY(i,pos.getX(i),-pos.getZ(i));
    else uv.setXY(i,Math.abs(norm.getX(i))>.5?-pos.getZ(i):pos.getX(i),pos.getY(i));
  }
  const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=mat!==mats.glass;o.receiveShadow=true;group.add(o);return o;
}
function leaf(width,height,glass,door){
  const group=new THREE.Group();
  if(glass){
    box(group,width-.035,height-.035,.014,width/2,height/2,0,mats.glass);
    for(const x of [.012,width-.012])box(group,.024,height,.035,x,height/2,0,mats.bronze);
    const terrace=door?.name?.startsWith('Terraza');
    for(const y of terrace?[.012,height-.012]:[.012,height-.012,.73,height-.40])box(group,width,.020,.034,width/2,y,0,mats.bronze);
    if(door?.name==='Estudio')box(group,.022,height,.032,width/2,height/2,0,mats.bronze);
    if(door){
      for(const side of [-1,1]){
        box(group,.014,.29,.018,Math.max(.06,width-.075),1.02,side*.06,mats.bronze);
        for(const y of [.90,1.14])box(group,.014,.014,.055,Math.max(.06,width-.075),y,side*.036,mats.bronze);
      }
    }
  }else{
    const finish=door?.name==='Entrada'?mats.wood:mats.wall;
    // Flush plaster leaf with fine shadow gaps, matching the concealed doors.
    box(group,width-.008,height-.012,.046,width/2,height/2,0,finish);
    for(const x of [.003,width-.003])box(group,.003,height,.048,x,height/2,0,mats.dark);
    for(const z of [-.048,.048]) {
      box(group,.11,.018,.025,width-.10,1.03,z,mats.bronze);
      const rose=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.010,24),mats.bronze);
      rose.rotation.x=Math.PI/2;rose.position.set(width-.065,1.03,z*.58);group.add(rose);
    }
  }
  // An invisible full panel makes even thin glass easy to select.
  const hit=box(group,width,height,.055,width/2,height/2,0,new THREE.MeshBasicMaterial({visible:false}));
  hit.userData.door=door;group.traverse(o=>{if(o.isMesh)o.userData.door=door;});
  return group;
}
function placeDoor(d,t){
  const seg=doorSegments(d,t);
  seg.forEach(([a,b],i)=>{const g=d.groups[i];g.position.set(a[0],0,a[1]);g.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);});
  d.polys=seg.map(([a,b])=>footprint(a,b));
}
function setupDoors(){
  doors=data.doors.map(spec=>{
    const d={...spec,t:0,goal:0,groups:[],polys:[]};
    const n=d.panels||1,w=Math.hypot(d.b[0]-d.a[0],d.b[1]-d.a[1])/n;
    for(let i=0;i<n;i++){const g=leaf(w,d.height,d.glass,d);d.groups.push(g);scene.add(g);}
    placeDoor(d,0);return d;
  });
  const [a,b]=data.fixedStudy,g=leaf(Math.hypot(b[0]-a[0],b[1]-a[1]),2.2,true,null);
  g.position.set(a[0],0,a[1]);g.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);scene.add(g);
  const fixedWidth=Math.hypot(b[0]-a[0],b[1]-a[1]);
  for(const x of [fixedWidth/2])box(g,.022,2.18,.028,x,1.09,0,mats.bronze);
  const study=doors.find(d=>d.name==='Estudio'),length=Math.hypot(study.b[0]-a[0],study.b[1]-a[1]);
  // Continuous arch with rounded upper corners matching the architect's bronze screen.
  const path=new THREE.CurvePath(),v=(x,y)=>new THREE.Vector3(x,y,0),h=2.40,r=.34;
  path.add(new THREE.LineCurve3(v(0,0),v(0,h-r)));
  path.add(new THREE.QuadraticBezierCurve3(v(0,h-r),v(0,h),v(r,h)));
  path.add(new THREE.LineCurve3(v(r,h),v(length-r,h)));
  path.add(new THREE.QuadraticBezierCurve3(v(length-r,h),v(length,h),v(length,h-r)));
  path.add(new THREE.LineCurve3(v(length,h-r),v(length,0)));
  const arch=new THREE.Mesh(new THREE.TubeGeometry(path,100,.014,8,false),mats.bronze);g.add(arch);
  for(let x=.36;x<length-.2;x+=.58)box(g,.021,.20,.027,x,2.30,0,mats.bronze);
  box(g,length-.68,.18,.012,length/2,2.29,0,mats.glass);
  g.traverse(o=>{if(o.isMesh)staticMeshes.push(o);});
}
function activeDoorPolys(){return doors.filter(d=>d.active!==false).flatMap(d=>d.polys);}
function shown(o){for(let n=o;n;n=n.parent)if(!n.visible)return false;return true;}
function setKitchenVariant(on,announce=true){
  if(!ready||on===kitchenAlternative)return;
  if(playing)pause();
  kitchenAlternative=on;
  const d=doors.find(x=>x.name==='Cocina');
  if(d){d.active=!on;d.groups.forEach(g=>g.visible=!on);}
  kitchenLayers.original.forEach(m=>m.visible=!on);
  kitchenLayers.alternative.forEach(m=>m.visible=on);
  const [dx,dz]=data.kitchenVariant.islandOffset;
  kitchenLayers.island.forEach(m=>m.position.set(on?dx:0,0,on?dz:0));
  physics=new WorldPhysics(kitchenColliders(data,on),data.floors);
  // Keep the viewpoint for direct comparison; only relocate if new geometry overlaps it.
  if(physics.blocked(player,activeDoorPolys()))player=[...data.spawn];
  velocity=[0,0];target=null;rayTime=1;
  camera.position.set(player[0],eye,player[1]);
  $('kitchenVariant').checked=on;
  renderer.shadowMap.needsUpdate=true;
  if(announce)notice(on?'Alternativa: cocina abierta, isla adelantada y encimera al fondo.':'Cocina original.');
}
function initScene(buffer){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#c4d7de');
  camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.035,180);camera.rotation.order='YXZ';
  scene.add(new THREE.HemisphereLight('#f1e7d6','#847459',.78));
  const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(environment,.035).texture;scene.environmentIntensity=.26;environment.dispose();pmrem.dispose();
  const sun=new THREE.DirectionalLight('#fff1d9',1.8);sun.position.set(9,17,-25);sun.target.position.set(9,0,-3);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-16,right:16,top:13,bottom:-13,near:1,far:65});sun.shadow.normalBias=.024;sun.shadow.bias=-.0001;scene.add(sun,sun.target);
  for(const spec of data.meshes){
    const stride=data.stride||6,floats=new Float32Array(buffer,spec.offset,spec.count*stride),inter=new THREE.InterleavedBuffer(floats,stride),geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.InterleavedBufferAttribute(inter,3,0));geo.setAttribute('normal',new THREE.InterleavedBufferAttribute(inter,3,3));
    if(stride>=8)geo.setAttribute('uv',new THREE.InterleavedBufferAttribute(inter,2,6));
    geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,mats[spec.material]||mats.wall);
    mesh.receiveShadow=true;mesh.castShadow=!['glass','led','curtain'].includes(spec.material);scene.add(mesh);staticMeshes.push(mesh);
    if(kitchenLayers[spec.layer])kitchenLayers[spec.layer].push(mesh);
    if(spec.layer==='alternative')mesh.visible=false;
  }
  // Soft electric fill complements daylight under the real ceiling geometry.
  for(const [x,z,power] of [[2,-7,4],[5,-7,4],[9,-6,6],[12,-6,6],[16,-7,4],[17.5,-7,4],[11,-1.6,5],[3,-2,5],[15,-2,4]]){
    const l=new THREE.PointLight('#ffd6a0',power,6,2);l.position.set(x,2.12,z);scene.add(l);
  }
  physics=new WorldPhysics(kitchenColliders(data,false),data.floors);player=[...data.spawn];setupDoors();
  const m=data.vanityMirror;
  if(m){
    const mirror=new Reflector(new THREE.PlaneGeometry(m.width,m.top-m.bottom),{color:0xc9c9c9,textureWidth:512,textureHeight:512,clipBias:.003,multisample:0});
    mirror.position.set(m.center[0],(m.top+m.bottom)/2,m.center[1]);mirror.rotation.y=Math.PI;
    scene.add(mirror);staticMeshes.push(mirror);
  }
  if(physics.blocked(player,activeDoorPolys()))throw Error('El punto de entrada no está libre.');
  camera.position.set(player[0],eye,player[1]);
  composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  ao=new SSAOPass(scene,camera,innerWidth,innerHeight,16);ao.kernelRadius=.24;ao.minDistance=.0001;ao.maxDistance=.04;
  composer.addPass(ao);composer.addPass(new OutputPass());
  ao.setSize(Math.floor(innerWidth*.65),Math.floor(innerHeight*.65));
}
async function exterior(){
  const loader=new THREE.TextureLoader();
  const [park,city]=await Promise.all(['vista-parque.png','vista-ciudad.png'].map(n=>loader.loadAsync('./assets/'+n)));
  for(const [tex,x,z,width,rot] of [[park,2,-49,48,0],[city,50,-47,48,-.08]]){
    tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
    const h=width*tex.image.height/tex.image.width;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,h),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,toneMapped:false}));
    mesh.position.set(x,eye+(.41-.5)*h,z);mesh.rotation.y=rot;scene.add(mesh);
  }
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(260,260),material('#73826a'));ground.rotation.x=-Math.PI/2;ground.position.set(8,-22,-20);scene.add(ground);
}

function pause(){
  if(!ready)return;playing=false;keys.clear();velocity=[0,0];touchVector=[0,0];$('joystick').firstElementChild.style.transform='';
  $('menu').hidden=false;$('crosshair').hidden=true;$('interaction').hidden=true;$('touch').hidden=true;$('enter').textContent='Continuar recorrido';
  if(document.pointerLockElement)document.exitPointerLock();$('enter').focus();
}
async function enter(){
  if(!ready)return;
  playing=true;$('menu').hidden=true;$('reset').hidden=false;$('crosshair').hidden=false;$('touch').hidden=!mobile;
  if(settings.sound){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();await audioCtx.resume();}catch{settings.sound=false;}}
  if(!mobile){try{await canvas.requestPointerLock();}catch{notice('Arrastra el ratón para mirar. W A S D para caminar.');}}
}
function interact(){
  if(!playing||!target)return;target.goal=target.goal>.5?0:1;
  notice((target.goal?'Abriendo · ':'Cerrando · ')+label(target.name));rayTime=1;
}
function label(s){return ({'Terraza salon':'Terraza · salón','Terraza comedor':'Terraza · comedor','Terraza izquierda':'Terraza','Bano secundario':'Baño','WC suite':'WC suite','Ducha suite':'Ducha suite','Suite izquierda':'Suite · vestidor','Suite derecha':'Suite · baño','Suite principal':'Dormitorio principal','Distribuidor dormitorios':'Distribuidor','Paso despensa bano':'Paso al baño','Dormitorio secundario':'Dormitorio niñas'})[s]||s;}
function step(){
  if(!settings.sound||!audioCtx||audioCtx.state!=='running')return;
  const now=audioCtx.currentTime,duration=.115,buffer=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*duration),audioCtx.sampleRate);
  const channel=buffer.getChannelData(0);for(let i=0;i<channel.length;i++)channel[i]=(Math.random()*2-1)*Math.exp(-i/channel.length*6);
  const noise=audioCtx.createBufferSource();noise.buffer=buffer;
  const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=350+Math.random()*120;
  const gain=audioCtx.createGain();gain.gain.setValueAtTime(.10,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  noise.connect(filter).connect(gain).connect(audioCtx.destination);noise.start(now);noise.stop(now+duration);
  noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
}
function updateTarget(){
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=raycaster.intersectObjects([...staticMeshes.filter(shown),...doors.filter(d=>d.active!==false).flatMap(d=>d.groups)],true);
  // The closest surface must be an actual door, preventing interaction through walls.
  target=hits[0]?.object.userData.door||null;
  $('interaction').hidden=!target||!playing;
  if(target)$('interaction').querySelector('span').textContent=(target.goal>.5?'Cerrar · ':'Abrir · ')+label(target.name);
  $('touchDoor').disabled=!target;
}
function frame(time){
  requestAnimationFrame(frame);const dt=Math.min((time-last)/1000||0,.045);last=time;
  if(!ready)return;
  if(playing){
    let doorChanged=false;
    for(const d of doors){
      if(d.active===false||Math.abs(d.goal-d.t)<.00001)continue;
      const next=d.t+Math.sign(d.goal-d.t)*Math.min(dt*.85,Math.abs(d.goal-d.t));
      const proposed=doorSegments(d,next).map(([a,b])=>footprint(a,b));
      if(proposed.some(p=>overlaps(player,physics.radius+.025,p))){
        if(!d.blocked){notice('Deja espacio para que se mueva la puerta.');d.blocked=true;}continue;
      }
      d.blocked=false;d.t=next;placeDoor(d,next);doorChanged=true;
    }
    let x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touchVector[0];
    let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touchVector[1];
    const mag=Math.hypot(x,forward);if(mag>1){x/=mag;forward/=mag;}
    const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?2.05:1.32;
    const desired=[(Math.cos(yaw)*x-Math.sin(yaw)*forward)*speed,(-Math.sin(yaw)*x-Math.cos(yaw)*forward)*speed];
    const smoothing=1-Math.exp(-dt*(mag>.01?8:12));velocity=velocity.map((v,i)=>v+(desired[i]-v)*smoothing);
    const next=physics.move(player,velocity[0]*dt,velocity[1]*dt,activeDoorPolys());
    const dist=Math.hypot(next[0]-player[0],next[1]-player[1]);player=next;
    stepDistance+=dist;walkPhase+=dist*Math.PI/.62;
    if(stepDistance>.62){stepDistance%=.62;step();}
    bobAmount+=(Math.min(1,dist/(dt*1.1||1))*(settings.bob?1:0)-bobAmount)*(1-Math.exp(-dt*10));
    camera.position.set(player[0],eye+Math.sin(walkPhase*2)*.012*bobAmount,player[1]);
    camera.rotation.set(pitch,yaw,Math.sin(walkPhase)*.002*bobAmount,'YXZ');
    if(doorChanged)renderer.shadowMap.needsUpdate=true;
    rayTime+=dt;roomTime+=dt;if(rayTime>.12){updateTarget();rayTime=0;}
    if(roomTime>.4){
      let name='Recibidor';
      if(inside(player,data.floors[3]))name='Terraza';
      else for(const r of data.rooms.slice(1)){const [a,b]=r.box;if(player[0]>=a[0]&&player[0]<=b[0]&&player[1]>=a[1]&&player[1]<=b[1]){name=r.name;break;}}
      $('room').textContent=name;roomTime=0;
    }
  }
  composer.render();
}
function look(dx,dy){yaw-=dx*.0021;pitch=THREE.MathUtils.clamp(pitch-dy*.0021,-1.3,1.3);}
$('enter').onclick=enter;$('pause').onclick=pause;$('interaction').onclick=interact;$('touchDoor').onclick=interact;
$('kitchenVariant').onchange=e=>setKitchenVariant(e.target.checked);
$('reset').onclick=()=>{player=[...data.spawn];velocity=[0,0];yaw=.05;pitch=0;camera.position.set(player[0],eye,player[1]);camera.rotation.set(0,yaw,0);notice('Has vuelto a la entrada.');};
addEventListener('keydown',e=>{
  if(e.code==='Escape'){pause();return;}if(!playing)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.code==='KeyE'&&!e.repeat)interact();
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&playing&&!mobile)pause();});
canvas.addEventListener('mousemove',e=>{if(playing&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
canvas.addEventListener('pointerdown',e=>{
  if(!playing)return;
  if(e.pointerType==='touch'){touchLook={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}
  else if(document.pointerLockElement===canvas)interact();
  else{dragLook={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0};canvas.setPointerCapture(e.pointerId);}
});
canvas.addEventListener('pointermove',e=>{
  const state=e.pointerType==='touch'?touchLook:dragLook;if(!playing||!state||state.id!==e.pointerId)return;
  const dx=e.clientX-state.x,dy=e.clientY-state.y;look(dx,dy);state.x=e.clientX;state.y=e.clientY;state.moved=(state.moved||0)+Math.abs(dx)+Math.abs(dy);
});
function releaseLook(e){if(dragLook?.id===e.pointerId){if(dragLook.moved<5)interact();dragLook=null;}if(touchLook?.id===e.pointerId)touchLook=null;}
canvas.addEventListener('pointerup',releaseLook);canvas.addEventListener('pointercancel',releaseLook);
let joyId=null;
function joystick(e){const r=$('joystick').getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/40,y=(e.clientY-r.top-r.height/2)/40;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}touchVector=[x,y];$('joystick').firstElementChild.style.transform=`translate(${x*30}px,${y*30}px)`;}
$('joystick').onpointerdown=e=>{joyId=e.pointerId;$('joystick').setPointerCapture(e.pointerId);joystick(e);};
$('joystick').onpointermove=e=>{if(e.pointerId===joyId)joystick(e);};
function stopJoy(){joyId=null;touchVector=[0,0];$('joystick').firstElementChild.style.transform='';}
$('joystick').onpointerup=stopJoy;$('joystick').onpointercancel=stopJoy;
addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer?.setSize(innerWidth,innerHeight);ao?.setSize(Math.floor(innerWidth*.65),Math.floor(innerHeight*.65));});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('error').hidden=false;$('error').textContent='Se ha interrumpido la vista 3D. Recarga la página para recuperarla.';$('enter').disabled=true;});
async function load(){
  try{
    const [j,b]=await Promise.all([fetch('./assets/house.json?v=kitchen-right-20260906'),fetch('./assets/house.bin?v=b01-full-20260906')]);
    if(!j.ok||!b.ok)throw Error('No se ha podido descargar el modelo.');
    data=await j.json();initScene(await b.arrayBuffer());await Promise.all([exterior(),surfaceTextures()]);
    renderer.compile(scene,camera);renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    ready=true;$('enter').disabled=false;$('kitchenVariant').disabled=false;$('enter').textContent='Entrar en casa';requestAnimationFrame(frame);
  }catch(e){
    console.error(e);$('error').hidden=false;$('error').textContent='No se ha podido iniciar el recorrido. Comprueba la conexión y que Chrome tenga la aceleración gráfica activada, y recarga la página.';
    $('enter').textContent='Recargar';$('enter').disabled=false;$('enter').onclick=()=>location.reload();
  }
}
load();
