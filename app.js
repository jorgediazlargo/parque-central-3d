import * as THREE from './assets/three.module.js';
import {Reflector} from './assets/Reflector.js';
import {ReflectionProbes,probeRooms,lightObject,pocketUniforms} from './lighting.mjs?v=65f7ecdcd5';
import {Post} from './post.mjs?v=8fc2bec064';
import {artwork,curtainMaterial} from './salon.mjs?v=a68cd3a486';
import {loadLightmap,fetchLightmap} from './lightmap.mjs?v=dfa0ed6946';
import {kitchenColliders} from './kitchen.mjs?v=b9b650fbe8';
import {textile,textileNormal,textileDetail,textileNormalScale} from './textiles.mjs?v=2f3f9752c9';
import {masterBedding,hideExportedBedding,prepareBedding,beddingReady} from './bedding.mjs?v=322afdf762';
import {WorldPhysics,doorSegments,footprint,overlaps,inside} from './physics.mjs?v=142d51f6bb';
import {applyRooms,preloadRooms,cloneMaterial} from './rooms.mjs?v=23a0bca5eb';
import {loadImageTexture} from './images.mjs?v=3b580fe40e';
import {AdaptiveQuality,qualityLevels} from './quality.mjs?v=df6f58f222';
import {mirrorSight,WALL_NAMES} from './visibility.mjs?v=4bcf41157e';
import {createFronts} from './fronts.mjs?v=ad678e848d';
import {createVitrinas} from './vitrinas.mjs?v=b6f8705d44';

const $=id=>document.getElementById(id),canvas=$('world');
let scene,camera,renderer,composer,quality,data,physics,player,doors=[],curtains=[],staticMeshes=[],target=null,fronts={list:[],at:()=>null,step:()=>false};
let lightmap,roomStatus={},reflections,mirrorSpan=()=>{};const runtimeObjects=[];
// Día / Noche: the night bake (artificial light only, same UVs) swapped into the same
// lightmap and probe textures, the outdoor lights and backdrop, and the room modules'
// daylight effects (ctx.onTimeOfDay). Reflections are captured again after each switch.
const timeOfDay={night:false,listeners:new Set()},outdoor={};
// Probe and reflection uniforms shared by every lit material (filled in initScene).
const lighting={uniforms:{}};
let playing=false,ready=false,yaw=.05,pitch=0,velocity=[0,0],keys=new Set(),last=0,walkPhase=0,bobAmount=0,stepDistance=0;
let touchVector=[0,0],touchLook=null,dragLook=null,audioCtx,noticeTimer,roomTimer,rayTime=0,roomTime=0;
const mobile=matchMedia('(pointer:coarse)').matches,eye=1.6;
const raycaster=new THREE.Raycaster();raycaster.far=2.25;
const settings={sound:true,bob:!matchMedia('(prefers-reduced-motion:reduce)').matches,night:false,fullscreen:true,closet:false};
try{const saved=JSON.parse(localStorage.getItem('parque-preferences')||'{}');for(const key of ['sound','bob','night','fullscreen','closet'])if(key in saved)settings[key]=saved[key];}catch{}
// ?noche (or ?noche=1) opens at night, ?noche=0 by day, whatever was saved.
{const q=new URLSearchParams(location.search).get('noche');if(q!==null)settings.night=q!=='0';}
// ?vestidor=piedra opens with the stone and glass vestidor variant, ?vestidor=plano without it.
{const q=new URLSearchParams(location.search).get('vestidor');if(q!==null)settings.closet=q==='piedra';}
const savePreferences=()=>{try{localStorage.setItem('parque-preferences',JSON.stringify(settings));}catch{}};
for(const key of ['sound','bob','night','fullscreen','closet']) {
  $(key).checked=settings[key];$(key).onchange=()=>{settings[key]=$(key).checked;savePreferences();if(key==='night')setNight(settings.night);if(key==='closet')setCloset(settings.closet);if(key==='fullscreen'&&!settings.fullscreen)screenMode.exit();};
}
// Pantalla completa: Entrar fills the screen with the whole page (menu and prompts stay on
// top) when the option is on, and F switches it while walking. Walking full screen hides the
// header and the room label (shown for a moment on each change, .immersive). The keyboard
// lock keeps Esc for the pause; holding Esc still leaves full screen, as Chrome tells. Phones
// without the API (iPhone) get it from the home-screen icon (manifest, display: fullscreen).
const screenMode={
  supported:!!(document.fullscreenEnabled||document.webkitFullscreenEnabled),
  get on(){return !!(document.fullscreenElement||document.webkitFullscreenElement);},
  enter(){
    const root=document.documentElement,request=root.requestFullscreen?.bind(root)||root.webkitRequestFullscreen?.bind(root);
    if(!this.supported||this.on||!request)return;
    Promise.resolve(request({navigationUI:'hide'})).then(()=>navigator.keyboard?.lock?.(['Escape'])).catch(()=>{});
  },
  exit(){if(!this.on)return;navigator.keyboard?.unlock?.();(document.exitFullscreen||document.webkitExitFullscreen).call(document)?.catch?.(()=>{});},
  sync(){document.body.classList.toggle('immersive',playing&&this.on);}
};
if(!screenMode.supported)$('fullscreen').closest('label').hidden=true;
for(const type of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(type,()=>{
  screenMode.sync();
  // Switching screens can drop the capture (or it was refused): full screen lets it back without a click.
  if(playing&&!mobile&&!document.pointerLockElement)Promise.resolve(canvas.requestPointerLock()).catch(()=>{});
});
$('night').disabled=true;$('closet').disabled=true;  // until the house is lit (load)
function notice(text){$('notice').textContent=text;$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),2600);}

const porcelainMap={value:null},vestidorStone={value:0},crosscutNormal={value:null},plasterMap={value:null},plasterNormal={value:null},limeMask={value:null},limeBox={value:new THREE.Vector4(0,0,1,1)};
const PLASTER_TILE=.75;  // metres per plaster.webp tile (style_textures.py)
// Clear glass: a faint tinted body, reflections (box-projected room probes) at full
// strength and the background let through by what neither takes (Schlick Fresnel),
// in premultiplied alpha. A plain transparent material scaled its reflections by its
// 13 % opacity, so glazing read as a smoky film with no reflections.
function glassMaterial(){
  // Each face takes 4 % (8 % a pane) with a faint bronze body; the lit body colour is
  // kept low, since added light is what made the glazing read as a milky veil.
  const m=new THREE.MeshPhysicalMaterial({color:'#6f6355',transparent:true,premultipliedAlpha:true,opacity:.04,roughness:.03,metalness:0,depthWrite:false,side:THREE.DoubleSide});
  m.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>',`
      // Room reflections at 60 %: a 128 px probe reflected at grazing angles read as a
      // frosted smear over whatever is behind the glass.
      {float glassNV=saturate(abs(dot(normal,geometryViewDir)));
      float glassF=(.04+.96*pow(1.0-glassNV,5.0))*.6;
      gl_FragColor=vec4(totalDiffuse*diffuseColor.a+totalSpecular*.6,diffuseColor.a+(1.0-diffuseColor.a)*glassF);}`);
  };
  m.customProgramCacheKey=()=>'glass';
  return m;
}
function material(color,kind,roughness=.7){
  const m=kind==='fabric'||kind==='linen'||kind==='rug'?new THREE.MeshPhysicalMaterial({color,roughness,sheen:.38,sheenRoughness:.85,sheenColor:'#e8dfd0',side:THREE.DoubleSide}):new THREE.MeshStandardMaterial({color,roughness,side:THREE.DoubleSide});
  m.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 houseWorld;\nvarying vec3 houseNormal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nhouseWorld=(modelMatrix*vec4(position,1.0)).xyz;houseNormal=normalize(mat3(modelMatrix)*normal);');
      shader.fragmentShader='varying vec3 houseWorld;\nvarying vec3 houseNormal;\nfloat hashHouse(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'+shader.fragmentShader;
      // Rugs are flat: a world-space projection gives every rug a knotted surface,
      // including the round ones whose exported UVs collapse.
      if(kind==='rug')shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
        {vec2 rugUv=(modelMatrix*vec4(position,1.0)).xz*4.0;
        #ifdef USE_MAP
        vMapUv=rugUv;
        #endif
        #ifdef USE_NORMALMAP
        vNormalMapUv=rugUv;
        #endif
        }`);
      if(['fabric','linen','rug'].includes(kind)){
        // Photographed fabric (textiles.mjs): grey detail on the material's own colour.
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
          diffuseColor.rgb*=mix(1.0,texture2D(map,vMapUv).r*2.0,${textileDetail[kind].toFixed(3)});
        #endif`);
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
      if(kind==='kitchenStone'){
        shader.vertexShader='varying vec3 stoneWorldNormal;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nstoneWorldNormal=normalize(mat3(modelMatrix)*normal);');
        shader.fragmentShader='varying vec3 stoneWorldNormal;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
          vec3 weight=pow(abs(normalize(stoneWorldNormal)),vec3(4.0));weight/=dot(weight,vec3(1.0));
          vec3 stoneSurface=texture2D(map,houseWorld.zy*1.1).rgb*weight.x
            +texture2D(map,houseWorld.xz*1.1).rgb*weight.y+texture2D(map,houseWorld.xy*1.1).rgb*weight.z;
          diffuseColor.rgb*=stoneSurface;
        #endif`);
      }
      if(kind==='crosscut'){
        // Kitchen travertine of render 9 (style_textures.py crosscut): colour and relief
        // projected in world metres (0.91 m tile), so the island ends, worktop and tall
        // panel share one continuous figure; the relief is a world-space normal map
        // blended per axis (UDN), so its curled strokes catch the cove light.
        shader.uniforms.crosscutNormal=crosscutNormal;
        shader.vertexShader='varying vec3 stoneWorldNormal;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nstoneWorldNormal=normalize(mat3(modelMatrix)*normal);');
        shader.fragmentShader='uniform sampler2D crosscutNormal;\nvarying vec3 stoneWorldNormal;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
          vec3 ccW=pow(abs(normalize(stoneWorldNormal)),vec3(4.0));ccW/=dot(ccW,vec3(1.0));
          vec2 ccX=houseWorld.zy*1.1,ccY=houseWorld.xz*1.1,ccZ=houseWorld.xy*1.1;
          #ifdef USE_MAP
          diffuseColor.rgb*=texture2D(map,ccX,CROSSCUT_BIAS).rgb*ccW.x+texture2D(map,ccY,CROSSCUT_BIAS).rgb*ccW.y+texture2D(map,ccZ,CROSSCUT_BIAS).rgb*ccW.z;
          #endif`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          {vec3 ccN=inverseTransformDirection(normal,viewMatrix);
          vec2 ccTX=(texture2D(crosscutNormal,ccX).xy*2.0-1.0)*CROSSCUT_RELIEF,ccTY=(texture2D(crosscutNormal,ccY).xy*2.0-1.0)*CROSSCUT_RELIEF,
            ccTZ=(texture2D(crosscutNormal,ccZ).xy*2.0-1.0)*CROSSCUT_RELIEF;
          ccN=normalize(vec3(ccN.x,ccTX.y+ccN.y,ccTX.x+ccN.z)*ccW.x+vec3(ccTY.x+ccN.x,ccN.y,ccTY.y+ccN.z)*ccW.y+vec3(ccTZ.xy+ccN.xy,ccN.z)*ccW.z);
          normal=normalize((viewMatrix*vec4(ccN,0.0)).xyz);}`).replace('void main() {','#define CROSSCUT_RELIEF 1.0\n#define CROSSCUT_BIAS -0.8\nvoid main() {');
      }
      if(kind==='terrace'){
        // Terrace porcelain (photo): pale warm-grey 80 cm squares on the facade grid, fine joints,
        // each piece a touch lighter or darker, with a soft mottle.
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          vec2 terraceAt=(houseWorld.xz-vec2(4.39,-10.88))/.80;
          vec2 terraceCell=floor(terraceAt),terraceF=fract(terraceAt);
          float terraceEdge=min(min(terraceF.x,1.0-terraceF.x),min(terraceF.y,1.0-terraceF.y));
          float terraceJoint=1.0-smoothstep(.0035,.0035+max(fwidth(terraceEdge),1e-4)*1.5,terraceEdge);
          float terraceTone=hashHouse(terraceCell);
          float terraceMottle=sin(houseWorld.x*5.3+sin(houseWorld.z*3.1)*2.0)*sin(houseWorld.z*4.7+sin(houseWorld.x*2.3)*1.7);
          vec3 terraceColour=vec3(.74,.735,.715)*(1.0+.09*(terraceTone-.5))*(1.0+.025*terraceMottle);
          diffuseColor.rgb=mix(terraceColour,terraceColour*.55,terraceJoint);`);
      }
      if(kind==='stone')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\nvec2 stoneUv=vec2(.045,.25)+fract(vMapUv)*vec2(.26,.17);diffuseColor*=texture2D(map,stoneUv);\n#endif');
      if(kind==='wall'){
        // Lime plaster of renders 1, 3 and 4 (style_textures.py plaster): sand grain,
        // pores, calcite flecks and trowelled streaks, projected in world metres as the
        // export lays its UVs. Two samples of the tile at unrelated scales and turns hide
        // the repeat; the relief tilts the normal in the same frame. Over it the
        // limewash clouds, now a faint breath (at ±13 % they read as stains).
        // H03: lime paint only on the faces the plan marks (cal-mask.png, sampled 1 cm in
        // front of the wall); every other wall and every ceiling (H04) is smooth white
        // plastic paint.
        shader.uniforms.plasterMap=plasterMap;shader.uniforms.plasterNormal=plasterNormal;
        shader.uniforms.limeMask=limeMask;shader.uniforms.limeBox=limeBox;
        shader.fragmentShader='uniform sampler2D plasterMap,plasterNormal,limeMask;\nuniform vec4 limeBox;\n'+shader.fragmentShader.replace('void main() {',`
          #define PLASTER_TILE ${PLASTER_TILE.toFixed(2)}
          #define PLASTER_RELIEF 1.6
          const mat2 plasterTurn=mat2(.8387,.5446,-.5446,.8387),plasterBack=mat2(.8387,-.5446,.5446,.8387);
          void main() {`).replace('#include <map_fragment>',`
          float limeCeiling=smoothstep(-.45,-.85,houseNormal.y);
          vec2 limeN=houseNormal.xz;limeN=length(limeN)>.001?normalize(limeN):vec2(0.0);
          float limeF=texture2D(limeMask,(houseWorld.xz+limeN*.01-limeBox.xy)/(limeBox.zw-limeBox.xy)).r*step(abs(houseNormal.y),.5);
          vec3 plasterAxis=abs(houseNormal),plasterT=vec3(1.0,0.0,0.0),plasterB=vec3(0.0,1.0,0.0);vec2 plasterAt=houseWorld.xy;
          if(plasterAxis.y>max(plasterAxis.x,plasterAxis.z)){plasterAt=vec2(houseWorld.x,-houseWorld.z);plasterB=vec3(0.0,0.0,-1.0);}
          else if(plasterAxis.x>plasterAxis.z){plasterAt=vec2(-houseWorld.z,houseWorld.y);plasterT=vec3(0.0,0.0,-1.0);}
          vec2 plasterUvA=plasterAt/PLASTER_TILE,plasterUvB=plasterTurn*plasterAt/(PLASTER_TILE*1.29)+vec2(.37,.61);
          float plasterAmount=mix(.12,1.0,limeF);
          diffuseColor.rgb*=1.0+((texture2D(plasterMap,plasterUvA).rgb*1.9922-1.0)+(texture2D(plasterMap,plasterUvB).rgb*1.9922-1.0)*.7)*plasterAmount;
          #ifdef USE_MAP
          float lime=(texture2D(map,vMapUv).r-.5)*.5+(texture2D(map,vMapUv*.37+vec2(.31,.17)).r-.5)*.4;
          diffuseColor.rgb*=1.0+lime*mix(.30,.25,limeCeiling)*limeF*vec3(.92,1.0,1.15);
          #endif
          // White plastic paint (#f2efea) where there is no lime (#e0d3c8).
          diffuseColor.rgb*=mix(vec3(1.19,1.326,1.424),vec3(1.0),limeF);`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          {vec2 plasterTilt=((texture2D(plasterNormal,plasterUvA).xy*2.0-1.0)+plasterBack*(texture2D(plasterNormal,plasterUvB).xy*2.0-1.0)*.7)*PLASTER_RELIEF*plasterAmount;
          vec3 plasterN=inverseTransformDirection(normal,viewMatrix);
          normal=normalize((viewMatrix*vec4(normalize(plasterN+plasterT*plasterTilt.x+plasterB*plasterTilt.y),0.0)).xyz);}`);
      }
      if(kind==='floor'){
        // H01 pavements: oak planks (no herringbone) in bedrooms, the play room, their
        // hall and the closet beside the kitchen; 120 cm porcelain at 45° elsewhere.
        shader.uniforms.porcelainMap=porcelainMap;shader.uniforms.vestidorStone=vestidorStone;
        shader.fragmentShader='uniform sampler2D porcelainMap;\nuniform float vestidorStone;\nfloat floorRect(vec2 p,vec4 r){return step(r.x,p.x)*step(p.x,r.z)*step(r.y,p.y)*step(p.y,r.w);}\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          vec2 floorAt=houseWorld.xz;
          float porcelainMask=(1.0-clamp(floorRect(floorAt,vec4(-2.0,-12.0,5.113,-5.896))+floorRect(floorAt,vec4(13.019,-12.0,20.0,-4.799))
            +floorRect(floorAt,vec4(15.008,-5.0,16.774,-3.664))+floorRect(floorAt,vec4(5.084,-3.674,7.295,1.0))
            +floorRect(floorAt,vec4(4.783,-2.791,5.113,1.0)),0.0,1.0));
          // Long pale planks of natural oak, warm honey as in the renders.
          float oakValue=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          vec3 oakFloor=mix(vec3(oakValue),diffuseColor.rgb,.9)*vec3(1.14,1.0,.83)*1.30;
          // Render 7: paler, less orange oak in the girls' room.
          float girlsFloor=step(15.78,houseWorld.x)*step(houseWorld.z,-4.87);
          oakFloor=mix(oakFloor,mix(vec3(oakValue*1.30),oakFloor,.55)*vec3(1.0,1.02,1.08),girlsFloor);
          // Porcelain module 1.20 m on the diagonal (proyecto de ejecución H01), band crossing on the H01 set-out point
          // at the entrance. Each piece is mirrored or turned at random to break repeats.
          vec2 porcelainAt=floorAt-vec2(14.086,-.218);
          vec2 porcelainUv=vec2(porcelainAt.x+porcelainAt.y,porcelainAt.x-porcelainAt.y)*(.70710678/1.20)+.098;
          vec2 porcelainCell=floor(porcelainUv),porcelainF=fract(porcelainUv);
          float porcelainA=hashHouse(porcelainCell),porcelainB=hashHouse(porcelainCell+17.3);
          const float porcelainBand=.196;
          if(porcelainF.x>porcelainBand&&porcelainF.y>porcelainBand){
            if(porcelainA>.5)porcelainF.x=1.0+porcelainBand-porcelainF.x;
            if(fract(porcelainA*7.0)>.5)porcelainF.y=1.0+porcelainBand-porcelainF.y;
            if(porcelainB>.5)porcelainF=porcelainF.yx;
          }else if(porcelainF.x>porcelainBand&&porcelainB>.5)porcelainF.x=1.0+porcelainBand-porcelainF.x;
          else if(porcelainF.y>porcelainBand&&porcelainB>.5)porcelainF.y=1.0+porcelainBand-porcelainF.y;
          vec3 porcelainFloor=textureGrad(porcelainMap,porcelainF,dFdx(porcelainUv),dFdy(porcelainUv)).rgb*.96;
          // Each piece a touch lighter or darker, as fired stone is (±3.5 %).
          porcelainFloor*=1.0+.07*(porcelainB-.5);
          // Vestidor en piedra y vitrinas (vitrinas.mjs, menu option): the vestidor interior
          // and its passage take the porcelain of the rest of the house instead of oak.
          porcelainMask=max(porcelainMask,vestidorStone*clamp(floorRect(floorAt,vec4(5.084,-3.674,7.295,1.0))+floorRect(floorAt,vec4(4.783,-2.791,5.113,1.0)),0.0,1.0));
          diffuseColor.rgb=mix(oakFloor,porcelainFloor,porcelainMask);
        `);
        // Honed porcelain, as in the reference: matte, no highlights. Its own pores
        // and joints (darker is lower) give the relief the plank normals would fake.
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.82,porcelainMask);')
          .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;','mapN.xy *= normalScale*(1.0-porcelainMask);')+`
          if(porcelainMask>0.0){
            // The darker band is a tone, not a step down: as relief it read as a wide joint.
            float porcelainBandM=1.0-step(porcelainBand,porcelainF.x)*step(porcelainBand,porcelainF.y);
            float porcelainH=(dot(porcelainFloor,vec3(.3333))+porcelainBandM*.17)*.0009;
            vec3 porcelainDx=dFdx(-vViewPosition),porcelainDy=dFdy(-vViewPosition);
            vec3 porcelainR1=cross(porcelainDy,normal),porcelainR2=cross(normal,porcelainDx);
            float porcelainDet=dot(porcelainDx,porcelainR1)*faceDirection;
            vec3 porcelainGrad=sign(porcelainDet)*(dFdx(porcelainH)*porcelainR1+dFdy(porcelainH)*porcelainR2);
            normal=normalize(mix(normal,normalize(abs(porcelainDet)*normal-porcelainGrad),porcelainMask));
          }`);
      }
      if(kind==='wood')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        // Natural oak veneer of the renders (photographed white oak): sandy, muted, never orange.
        float veneerValue=dot(diffuseColor.rgb,vec3(.28,.59,.13));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(veneerValue),.12)*vec3(1.0,.975,.95);
      `);
      if(kind==='wallTile'){
        // H03 wall porcelain (baths and showers): the floor's porcelain in 120 cm squares
        // laid square on the wall, fine joints, each piece turned or toned a little.
        shader.uniforms.porcelainMap=porcelainMap;
        shader.fragmentShader='uniform sampler2D porcelainMap;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          vec3 tileN=abs(houseNormal);
          vec2 tileAt=tileN.x>tileN.z?vec2(houseWorld.z,houseWorld.y):vec2(houseWorld.x,houseWorld.y);
          if(tileN.y>.5)tileAt=houseWorld.xz;
          vec2 tileUv=tileAt/1.20+vec2(.13,0.0),tileCell=floor(tileUv),tileF=fract(tileUv);
          float tileA=hashHouse(tileCell);
          vec2 tileS=vec2(tileA>.5?1.0-tileF.x:tileF.x,fract(tileA*7.0)>.5?1.0-tileF.y:tileF.y);
          vec3 tileColour=textureGrad(porcelainMap,.196+tileS*.804,dFdx(tileUv)*.804,dFdy(tileUv)*.804).rgb*.96*(1.0+.06*(hashHouse(tileCell+5.1)-.5));
          float tileEdge=min(min(tileF.x,1.0-tileF.x),min(tileF.y,1.0-tileF.y));
          float tileJoint=1.0-smoothstep(.0015,.0015+max(fwidth(tileEdge),1e-4)*1.5,tileEdge);
          diffuseColor.rgb=mix(tileColour,tileColour*.6,tileJoint);`);
      }
      if(kind==='lacquer'){
        const [sage,cream]=['#bcc2b0','#e6e0d6'].map(c=>new THREE.Color(c));
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float girlsRoom=step(15.78,houseWorld.x)*step(houseWorld.z,-4.80);
          float playRoom=step(13.0,houseWorld.x)*(1.0-step(15.78,houseWorld.x))*step(houseWorld.z,-4.70);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(${[cream.r,cream.g,cream.b].map(v=>v.toFixed(4))}),playRoom);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(${[sage.r,sage.g,sage.b].map(v=>v.toFixed(4))}),girlsRoom);
        `);
      }
      if(kind==='wall'){
        let glow='float cove=0.0;';
        for(const i of data?.litCoves||[]){
          const [x0,z0,x1,z1,h]=data.coves[i];
          glow+=`{vec2 q=houseWorld.xz;vec2 lo=vec2(${x0.toFixed(5)},${z0.toFixed(5)}),hi=vec2(${x1.toFixed(5)},${z1.toFixed(5)});vec2 outer=max(max(lo-q,q-hi),vec2(0.0));float edge=min(min(abs(q.x-lo.x),abs(q.x-hi.x)),min(abs(q.y-lo.y),abs(q.y-hi.y)));cove+=exp(-edge*7.0-length(outer)*13.0-abs(houseWorld.y-${(h+.07).toFixed(3)})*6.0)*.42;}`;
        }
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',glow+'\noutgoingLight+=vec3(1.0,.62,.32)*cove;\n// Terrace soffit (photo): pale, lit by the sunlit floor and the sky, which the bake does not carry out there.\nfloat terraceSoffit=step(2.5,houseWorld.y)*step(houseWorld.z,-8.7)*step(4.3,houseWorld.x)*step(houseWorld.x,14.4);\noutgoingLight+=diffuseColor.rgb*vec3(1.0,.985,.95)*.85*terraceSoffit;\n#include <opaque_fragment>');
      }
    };m.customProgramCacheKey=()=>kind||'plain';
  if(['fabric','linen','rug'].includes(kind))m.defines={USE_UV:''};
  return m;
}
const mats={wall:material('#e0d3c8','wall',.92),stone:material('#ebe5dc','kitchenStone',.5),kitchenStone:material('#f2e7d7','stone',.38),floor:material('#ffffff','floor',.62),
  wood:material('#ffffff','wood',.58),terrace:material('#d6d5d1','terrace',.78),white:material('#ece8e0'),fabric:material('#aa9f98','fabric',.9),linen:material('#ece8e1','linen',.93),
  bronze:material('#5e4733',null,.36),dark:material('#28251f','trim',.42),glass:glassMaterial(),
  led:new THREE.MeshStandardMaterial({color:'#ffe1a3',emissive:'#ffc98a',emissiveIntensity:9}),
  sage:material('#797e59','fabric'),lacquer:material('#d8ccba','lacquer',.58),rug:material('#b8aa95','rug',.96),
  blackstone:material('#39362d','stone',.35),clay:material('#a9613f',null,.65),curtain:material('#e9e0cf','fabric')};
Object.assign(mats,{
  // Kitchen oak: a cool tint offsets the warm cove light so the fronts read as the
  // muted grey-brown oak of render 9 (about 96/68/44 on screen), not orange walnut.
  kitchenOak:material('#c0c3c8','wood',.55),
  kitchenFabric:material('#a69a89','fabric',.94),shirt:material('#8ea7c6','linen',.9),
  kitchenBronze:material('#66513a',null,.38),kitchenDark:material('#262622',null,.42),
  ovenGlass:material('#141916',null,.20),ovenWindow:material('#202820',null,.27),
  ovenDisplay:material('#556158',null,.38),sinkSteel:material('#969c95',null,.36),hobMark:material('#575a52',null,.4)
});
mats.kitchenBronze.metalness=.72;mats.sinkSteel.metalness=.72;mats.ovenGlass.metalness=.28;
// Separate cream stone uses continuous metric UVs and matching surface maps.
mats.kitchenStone=material('#e9e1d6','kitchenStone',.55);
// Kitchen island, worktops and tall panel (region kitchen): cross-cut travertine.
mats.kitchenCrosscut=material('#e9f2ff','crosscut',.5);
mats.bronze.metalness=.65;
// Proyecto de ejecución: textured melamine (wardrobe interiors), anthracite (kitchen
// interiors), wall porcelain, and the cabinet LED strips the bake leaves out (they only
// glow when a front opens).
Object.assign(mats,{melamine:material('#ded8cd',null,.75),anthracite:material('#3b3a37',null,.6),wallTile:material('#ffffff','wallTile',.72),
  ledStrip:new THREE.MeshStandardMaterial({color:'#ffe1a3',emissive:'#ffcf96',emissiveIntensity:4})});
// E01-E03 bicolour aluminium; M2 mirror leaves (probe reflections, no second pass).
mats.ral9001=material('#e9e2d0',null,.45);mats.facadeGold=material('#a88a52',null,.4);mats.facadeGold.metalness=.6;
mats.mirrorLeaf=new THREE.MeshStandardMaterial({color:'#e4e4de',metalness:1,roughness:.18});
// K01-K02 mirrors (silvered glass, probe reflections); I02 finishes: Tece flush plates
// in gloss white, taps in brushed nickel (G4, G5), raw brushed metal (G3), copper (G7).
// The room probes give these small mirrors almost no reflection (a black pane), so they
// read as pale silvered glass: probe-lit grey with a glossy sheen, no second pass.
mats.mirror=new THREE.MeshStandardMaterial({color:'#b9bcba',metalness:.35,roughness:.12});
Object.assign(mats,{glossWhite:material('#f3f1ec',null,.14),nickel:material('#bdb8ae',null,.3),rawMetal:material('#93897b',null,.4),copper:material('#b39280',null,.36)});
mats.nickel.metalness=.9;mats.rawMetal.metalness=.85;mats.copper.metalness=.9;
// Wet-zone slabs share the floor: porcelain of the H01 plan.
mats.tile=mats.floor;
mats.curtain.transparent=true;mats.curtain.opacity=.62;mats.curtain.depthWrite=false;mats.curtain.userData.translucency=.75;

// Every surface map is requested (and decoded off the main thread) when the page starts;
// surfaceTextures assigns them once the renderer exists.
function loadSurfaceMaps(){
  const image=loadImageTexture;
  const sets=[['laminate_floor_02',['floor'],.59,.28,'2k'],['marble_01',['blackstone'],.55,.12]].map(([asset,targets,scale,strength,colour='1k'])=>
    Promise.all([['diff',colour],['nor_gl','1k'],['rough','1k']].map(([c,r])=>image(`./assets/textures/${asset}_${c}_${r}.${r==='2k'?'webp':'jpg'}`))).then(maps=>({maps,targets,scale,strength})));
  return Promise.all([Promise.all(sets),
    image('./assets/textures/porcelain.webp?v=46956a859b',{flipY:false}),
    // rooms/dormitorio.mjs draws mats.wood.map's image into a canvas: an upright <img>.
    Promise.all([new THREE.TextureLoader().loadAsync('./assets/polyhaven/white_oak_veneer/white_oak_veneer_diff_1k.webp?v=2fbb230119'),
      ...['nor_gl','rough'].map(m=>image(`./assets/polyhaven/white_oak_veneer/white_oak_veneer_${m}_1k.webp`))]),
    Promise.all(['diff','nor_gl','rough'].map(m=>image(`./assets/polyhaven/mocha_oak_veneer/mocha_oak_veneer_${m}_1k.webp`))),
    image('./assets/textures/travertine.webp?v=2bc29d0cfa'),
    Promise.all(['stone_crosscut','stone_crosscut_nor'].map(n=>image(`./assets/textures/${n}.webp`))),
    Promise.all(['./assets/textures/limewash.webp?v=76a3d72611','./assets/textures/plaster.webp?v=c910d3af3d',
      './assets/textures/plaster_nor.webp?v=70c8c6dff6','./assets/textures/white_plaster_02_rough_1k.jpg?v=4ff1fe957c'].map(n=>image(n))),
    image('./assets/cal-mask.png?v=426724678d',{flipY:false})]);
}
async function surfaceTextures(loading){
  const [sets,porcelain,oak,kitchenOak,stone,[crosscut,crosscutNor],[lime,plaster,plasterNor,plasterRough],mask]=await loading;
  for(const {maps,targets,scale,strength} of sets){
    maps.forEach((t,i)=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(scale,scale);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(i===0)t.colorSpace=THREE.SRGBColorSpace;});
    for(const key of targets){mats[key].map=maps[0];mats[key].normalMap=maps[1];mats[key].roughnessMap=maps[2];mats[key].normalScale.set(strength,strength);mats[key].needsUpdate=true;}
  }
  porcelain.colorSpace=THREE.SRGBColorSpace;porcelain.wrapS=porcelain.wrapT=THREE.RepeatWrapping;
  porcelain.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());porcelainMap.value=porcelain;
  // Dedicated veneer: no flooring seams on cabinetry, doors, tables or slats.
  // Photographed CC0 white oak veneer (Poly Haven), 50 cm tile, vertical grain; its own
  // normal and roughness give the satin sheen and pores the renders show.
  oak.forEach((t,i)=>{t.colorSpace=i?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});
  {const m=mats.wood;m.map=oak[0];m.normalMap=oak[1];m.roughnessMap=oak[2];m.normalScale.set(.45,.45);m.bumpMap=null;m.needsUpdate=true;}
  // Kitchen fronts of render 9: fine straight quarter-cut grain (Mocha Oak Veneer, CC0,
  // 1 m tile, grain contrast raised by derive_polyhaven.py), turned to run vertically.
  kitchenOak.forEach((t,i)=>{t.colorSpace=i?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.rotation=Math.PI/2;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});
  {const m=mats.kitchenOak;m.map=kitchenOak[0];m.normalMap=kitchenOak[1];m.roughnessMap=kitchenOak[2];m.normalScale.set(.6,.6);m.bumpMap=null;m.needsUpdate=true;}
  stone.colorSpace=THREE.SRGBColorSpace;stone.wrapS=stone.wrapT=THREE.RepeatWrapping;stone.anisotropy=8;
  for(const key of ['kitchenStone','stone']){mats[key].map=stone;mats[key].bumpMap=stone;mats[key].bumpScale=.0012;mats[key].needsUpdate=true;}
  for(const t of [crosscut,crosscutNor]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  crosscut.colorSpace=THREE.SRGBColorSpace;mats.kitchenCrosscut.map=crosscut;mats.kitchenCrosscut.needsUpdate=true;crosscutNormal.value=crosscutNor;
  // Walls: lime plaster colour and relief (shader uniforms), limewash clouds as the
  // map and the roughness of Poly Haven's White Plaster 02.
  for(const t of [lime,plaster,plasterNor,plasterRough]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  lime.repeat.set(.6,.6);plasterRough.repeat.set(.8,.8);plasterMap.value=plaster;plasterNormal.value=plasterNor;
  mats.wall.map=lime;mats.wall.roughnessMap=plasterRough;mats.wall.needsUpdate=true;
  // H03 lime-paint mask (export_world.py, acabados.py): 1 cm per pixel over data.limeMask.box.
  mask.generateMipmaps=false;mask.minFilter=mask.magFilter=THREE.LinearFilter;mask.colorSpace=THREE.NoColorSpace;limeMask.value=mask;
  if(data?.limeMask)limeBox.value.set(...data.limeMask.box);
  // Bouclé, slub linen and knotted rug read as real textiles at walking distance.
  for(const [key,kind] of [['fabric','fabric'],['kitchenFabric','fabric'],['sage','fabric'],['clay','fabric'],['linen','linen'],['shirt','linen'],['rug','rug']]){
    const m=mats[key];m.map=textile(kind);m.normalMap=textileNormal(kind);m.normalScale.setScalar(textileNormalScale[kind]);m.bumpMap=null;m.needsUpdate=true;
  }

}

function box(group,w,h,d,x,y,z,mat){
  const geo=new THREE.BoxGeometry(w,h,d),uv=geo.getAttribute('uv'),pos=geo.getAttribute('position'),norm=geo.getAttribute('normal');
  for(let i=0;i<uv.count;i++){
    if(Math.abs(norm.getY(i))>.5)uv.setXY(i,pos.getX(i),-pos.getZ(i));
    else uv.setXY(i,Math.abs(norm.getX(i))>.5?-pos.getZ(i):pos.getX(i),pos.getY(i));
  }
  const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=mat!==mats.glass;o.receiveShadow=true;group.add(o);return o;
}
// Studio screen after render 4: warm bronze-oak profiles, paired stiles at every joint,
// rails at hand and transom height and arched side lites with an inner concentric arc.
// M3 (G06): oak frame 3.00 x 2.20, rails at 0.78 and 1.87, arcs of 0.30 at the top corners.
const STUDY={frame:.035,stile:.026,depth:.045,rails:[.78,1.87],height:2.20,side:.11,radius:.30};
const studyFrame=material('#ffffff','wood',.55);
function studyPanel(group,width,height){
  const {stile,depth,rails}=STUDY;
  box(group,width-.02,height-.02,.010,width/2,height/2,0,mats.glass);
  for(const x of [stile/2,width-stile/2])box(group,stile,height,depth,x,height/2,0,studyFrame);
  for(const y of [.015,...rails,height-.015])box(group,width,.032,depth,width/2,y,0,studyFrame);
  // Sliding leaf: slim vertical pull near the meeting stile, on both faces.
  const x=width-stile-.035;
  for(const side of [-1,1]){
    box(group,.014,.32,.014,x,1.02,side*(depth/2+.030),studyFrame);
    for(const y of [.88,1.16])box(group,.012,.012,.030,x,y,side*(depth/2+.015),studyFrame);
  }
}
function leaf(width,height,glass,door){
  const group=new THREE.Group();
  if(glass&&door?.name==='Estudio')studyPanel(group,width,height);
  else if(door?.finish==='mirror'){
    // M2 (G05): mirror leaf in a slim Rimex bronze frame, the same on both faces.
    box(group,width-.03,height-.03,.012,width/2,height/2,0,mats.mirrorLeaf);
    for(const x of [.01,width-.01])box(group,.02,height,.032,x,height/2,0,mats.bronze);
    for(const y of [.01,height-.01])box(group,width,.02,.032,width/2,y,0,mats.bronze);
  }
  else if(glass){
    box(group,width-.035,height-.035,.014,width/2,height/2,0,mats.glass);
    const terrace=door?.name?.startsWith('Terraza'),kitchen=door?.name==='Cocina';
    // E01-E03: bicolour aluminium, RAL 9001 on the room side and gold outside. The
    // room is +Z in the world; a leaf drawn westwards (E3) has its local +Z outside.
    const room=terrace&&door.b[0]<door.a[0]?-1:1;
    const profile=(w,h,x,y,depth=.035)=>{
      if(!terrace)return box(group,w,h,depth,x,y,0,mats.bronze);
      box(group,w,h,depth/2,x,y,room*depth/4,mats.ral9001);box(group,w,h,depth/2,x,y,-room*depth/4,mats.facadeGold);
    };
    for(const x of [.012,width-.012])profile(terrace?.05:.024,height,x,height/2);
    // M1 (G04): double rail at 1.00 and 1.10 and a double stile 0.10 in from each edge.
    for(const y of terrace?[.025,height-.025]:kitchen?[.012,height-.012,1.00,1.10]:[.012,height-.012,.73,height-.40])profile(width,terrace?.05:.020,width/2,y,.034);
    if(kitchen)for(const x of [.10,width-.10])for(const dx of [-.016,.016])box(group,.012,height,.024,x+dx,height/2,0,mats.kitchenBronze);
    if(door){
      for(const side of [-1,1]){
        // Suite leaves park inside the 10 cm wall skin: a flush pull stays within it instead of poking through the plaster.
        if(door.type==='slide'){box(group,.014,.29,.012,Math.max(.06,width-.075),1.02,side*.022,mats.bronze);continue;}
        if(terrace){box(group,.022,.16,.02,width-.03,1.05,side*.04,side*room>0?mats.ral9001:mats.facadeGold);continue;}
        box(group,.014,.29,.018,Math.max(.06,width-.075),1.02,side*.06,mats.bronze);
        for(const y of [.90,1.14])box(group,.014,.014,.055,Math.max(.06,width-.075),y,side*.036,mats.bronze);
      }
    }
  }else{
    // Floor-to-ceiling oak leaf with fine shadow gaps.
    box(group,width-.008,height-.012,.046,width/2,height/2,0,mats.wood);
    for(const x of [.003,width-.003])box(group,.003,height,.048,x,height/2,0,mats.dark);
    // P8 and P9 slide inside the wall skin: a flush recessed pull, no lever.
    if(door?.type==='slide'){for(const z of [-.024,.024])box(group,.016,.30,.004,width-.06,1.03,z,mats.bronze);}
    // G02: concealed hinges and a magnetic catch, both black: the catch on the lock edge.
    else{box(group,.003,.12,.02,width-.0015,1.03,0,mats.dark);for(const y of [.25,1.10,1.95])box(group,.003,.10,.016,.0015,y,0,mats.dark);}
    if(door?.type!=='slide')for(const z of [-.048,.048]) {
      box(group,.11,.018,.025,width-.10,1.03,z,mats.bronze);
      const rose=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.010,24),mats.bronze);
      rose.rotation.x=Math.PI/2;rose.position.set(width-.065,1.03,z*.58);group.add(rose);
    }
  }
  // An invisible full panel makes even thin glass easy to select.
  const hit=box(group,width,height,.055,width/2,height/2,0,new THREE.MeshBasicMaterial({visible:false}));
  hit.userData.door=door;group.traverse(o=>{if(o.isMesh)o.userData.door=door;});
  if(door?.name==='Cocina')group.traverse(o=>{if(o.material===mats.bronze)o.material=mats.kitchenBronze;});
  return group;
}
function placeDoor(d,t){
  const seg=doorSegments(d,t);
  seg.forEach(([a,b],i)=>{const g=d.groups[i];g.position.set(a[0],d.base||0,a[1]);g.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);});
  d.polys=seg.map(([a,b])=>footprint(a,b));
}
function setupDoors(){
  doors=data.doors.map(spec=>{
    // spec.open: a door that starts open (M1, the kitchen screen, parks on the wall).
    const t=spec.open||0,d={...spec,t,goal:t,groups:[],polys:[]};
    const n=d.panels||1,w=Math.hypot(d.b[0]-d.a[0],d.b[1]-d.a[1])/n;
    for(let i=0;i<n;i++){const g=leaf(w,d.height,d.glass,d);d.groups.push(g);scene.add(g);runtimeObjects.push(g);}
    placeDoor(d,t);return d;
  });
  const [a,b]=data.fixedStudy,g=new THREE.Group(),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  g.position.set(a[0],0,a[1]);g.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);scene.add(g);runtimeObjects.push(g);
  const study=doors.find(d=>d.name==='Estudio'),along=p=>((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/length;
  const {frame:f,stile,depth,rails,height:h,side,radius:r}=STUDY,doorFrom=along(study.a),doorTo=along(study.b);
  const extrude=(shape,z=0,mat=studyFrame,d=depth)=>{
    const geo=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,curveSegments:24});geo.translate(0,0,z-d/2);
    const o=new THREE.Mesh(geo,mat);o.castShadow=mat!==mats.glass;o.receiveShadow=true;g.add(o);return o;
  };
  const arched=(inset,x0=inset,x1=length-inset)=>{
    const s=new THREE.Shape(),rr=r-inset;
    s.moveTo(x0,inset);s.lineTo(x1,inset);
    if(x1>length-r)s.lineTo(x1,h-r),s.absarc(length-r,h-r,rr,0,Math.PI/2,false);else s.lineTo(x1,h-inset);
    if(x0<r)s.lineTo(r,h-inset),s.absarc(r,h-r,rr,Math.PI/2,Math.PI,false);else s.lineTo(x0,h-inset);
    s.lineTo(x0,inset);return s;
  };
  // Outer frame with rounded upper corners, sill included.
  const outer=arched(0);outer.holes.push(arched(f));extrude(outer);
  // Fixed glazing on both sides of the French pair.
  for(const [x0,x1] of [[f,doorFrom],[doorTo,length-f]])extrude(arched(f,x0,x1),0,mats.glass,.010);
  // Stiles at the door opening; rails across the fixed panels.
  box(g,stile,h-2*f,depth,doorFrom-stile/2,h/2,0,studyFrame);box(g,stile,h-2*f,depth,doorTo+stile/2,h/2,0,studyFrame);
  for(const y of rails)for(const [x0,x1] of [[f,doorFrom],[doorTo,length-f]])box(g,x1-x0,.032,depth,(x0+x1)/2,y,0,studyFrame);
  // Narrow side lite of each fixed panel: a stile `side` in from the jamb that turns
  // into an arc concentric with the frame's corner and runs on as a top rail.
  const ri=r-side;
  for(const [x,cx,a0,a1,x0,x1] of [[side,r,Math.PI/2,Math.PI,r,doorFrom],[length-side,length-r,0,Math.PI/2,doorTo,length-r]]){
    const arc=new THREE.Shape();
    arc.absarc(cx,h-r,ri+stile/2,a0,a1,false);arc.absarc(cx,h-r,ri-stile/2,a1,a0,true);extrude(arc);
    box(g,stile,h-r-f,depth,x,(h-r+f)/2,0,studyFrame);
    box(g,x1-x0,stile,depth,(x0+x1)/2,h-side,0,studyFrame);
  }
  g.traverse(o=>{if(o.isMesh)staticMeshes.push(o);});
}
// Every texture the scene draws with goes to the GPU now (while the GPU process compiles
// the programs) rather than during the first capture. Same data: only the time changes.
function uploadTextures(){
  const seen=new Set(),visit=t=>{if(t?.isTexture&&!t.isRenderTargetTexture&&t.version>0&&!seen.has(t)){seen.add(t);renderer.initTexture(t);}};
  scene.traverse(o=>{
    for(const m of [o.material].flat()){
      if(!m)continue;for(const v of Object.values(m))visit(v);
      for(const u of Object.values(renderer.properties.get(m).uniforms||m.uniforms||{}))visit(u?.value);
    }
  });
}
function activeDoorPolys(){return doors.filter(d=>d.active!==false).flatMap(d=>d.polys);}
// Glass doors (the shower's) do not hide the mirror.
function opaqueDoorPolys(){return doors.filter(d=>d.active!==false&&!d.glass).flatMap(d=>d.polys);}
function shown(o){for(let n=o;n;n=n.parent)if(!n.visible)return false;return true;}
async function initScene(buffer,bake){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1;
  renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  // Checked before its first draw, each program costs four synchronous round trips to the
  // GPU process: reportShaderErrors does it once the tour is ready.
  renderer.debug.checkShaderErrors=false;
  scene=new THREE.Scene();scene.background=new THREE.Color('#c4d7de');
  camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.035,180);camera.rotation.order='YXZ';
  // Sky and sun light only what is outdoors (terrace, facade): indoors every surface
  // takes the baked light or the probes baked with it (lighting.mjs).
  const sky=new THREE.HemisphereLight('#dfe9f2','#8a7a64',.9);scene.add(sky);
  const sun=new THREE.DirectionalLight('#ffe2bd',2.1);Object.assign(outdoor,{sky,sun});sun.position.set(9,17,-25);sun.target.position.set(9,0,-3);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-16,right:16,top:13,bottom:-13,near:1,far:65});sun.shadow.normalBias=.024;sun.shadow.bias=-.0001;scene.add(sun,sun.target);
  const hash=crypto.subtle.digest('SHA-256',buffer).then(h=>Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join(''));
  lightmap=await loadLightmap(renderer,hash,lighting,{upCoves:(data.litCoves||[]).map(i=>data.coves[i]),prefetched:bake});
  reflections=new ReflectionProbes(probeRooms(data));
  lighting.uniforms={...lightmap.probes.uniforms,...reflections.uniforms,...pocketUniforms(data)};
  mats.art=artwork();const sheer=curtainMaterial(mats.curtain);sheer.userData.translucency=.75;
  for(const [sourceIndex,spec] of data.meshes.entries()){
    if(spec.layer==='alternative')continue;
    const stride=data.stride||6,floats=new Float32Array(buffer,spec.offset,spec.count*stride),inter=new THREE.InterleavedBuffer(floats,stride),geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.InterleavedBufferAttribute(inter,3,0));geo.setAttribute('normal',new THREE.InterleavedBufferAttribute(inter,3,3));
    if(stride>=8)geo.setAttribute('uv',new THREE.InterleavedBufferAttribute(inter,2,6));
    // Sheers hang along the facade (x): their pleats turn the normals up to ±45°, which
    // striped them hard in the probe light. Soft cloth scatters more evenly: damp the
    // pleat component of the shading normals.
    if(spec.material==='curtain')for(let i=0;i<spec.count;i++){
      const o=i*stride+3,nx=floats[o]*.45,ny=floats[o+1],nz=floats[o+2],l=Math.hypot(nx,ny,nz)||1;
      floats[o]=nx/l;floats[o+1]=ny/l;floats[o+2]=nz/l;
    }
    geo.computeBoundingSphere();
    const key=spec.region==='kitchen'&&spec.material==='kitchenStone'?'kitchenCrosscut':spec.material;
    let finish=mats[key]||mats.wall;
    if(lightmap.bind(geo,sourceIndex))finish=lightmap.material(finish,key,spec.region);
    if(spec.region==='shared'&&['linen','fabric'].includes(spec.material))hideExportedBedding(geo);
    else if(spec.material==='curtain')finish=sheer;
    if(spec.material==='art'){const uv=geo.getAttribute('uv'),pos=geo.getAttribute('position');for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getZ(i)+7.543)/(36.8/51.53901216893343),(pos.getY(i)-.74)/1.21);}
    const mesh=new THREE.Mesh(geo,finish);mesh.userData.exported={material:spec.material,region:spec.region,layer:spec.layer,sourceIndex};
    mesh.receiveShadow=true;mesh.castShadow=!['glass','led','curtain'].includes(spec.material);scene.add(mesh);staticMeshes.push(mesh);
  }
  // Joinery fronts: per-vertex ids now, so room modules that split their meshes keep them.
  fronts=createFronts(THREE,{data,staticMeshes,scene});
  // The master bed dressing replaces the exported duvet, pillows and blanket.
  const bedding=masterBedding();scene.add(bedding);runtimeObjects.push(bedding);bedding.traverse(o=>{if(o.isMesh)staticMeshes.push(o);});
  physics=new WorldPhysics(kitchenColliders(data),data.floors);player=[...data.spawn];setupDoors();
  const m=data.vanityMirror;
  if(m){
    const mirror=new Reflector(new THREE.PlaneGeometry(m.width,m.top-m.bottom),{color:0xc9c9c9,textureWidth:512,textureHeight:512,clipBias:.003,multisample:0});
    mirror.position.set(m.center[0],(m.top+m.bottom)/2,m.center[1]);mirror.rotation.y=Math.PI;
    scene.add(mirror);staticMeshes.push(mirror);
    // The mirror draws the house a second time (rooms/bano.mjs): only while a line of sight reaches it.
    const sight=mirrorSight(m,kitchenColliders(data).filter(c=>WALL_NAMES.test(c.name)).map(c=>c.poly));
    mirror.userData.inSight=cam=>{const e=cam.matrixWorld.elements;return sight.visible([e[12],e[14]],opaqueDoorPolys());};
    // M2: the mirror leaves on either side of the vanity are coplanar with its mirror. A
    // closed leaf joins the reflection (the probes alone left them a dark grey); an
    // opening one leaves it and keeps its own probe reflection.
    const leaves=doors.filter(d=>d.finish==='mirror');
    mirrorSpan=()=>{
      let x0=m.center[0]-m.width/2,x1=m.center[0]+m.width/2;
      for(const d of leaves){
        if(d.t>.01)continue;
        const lo=Math.min(d.a[0],d.b[0])-.02,hi=Math.max(d.a[0],d.b[0])+.02;
        if(hi<=x0+.05)x0=Math.min(x0,lo);else if(lo>=x1-.05)x1=Math.max(x1,hi);
      }
      mirror.scale.x=(x1-x0)/m.width;mirror.position.x=(x0+x1)/2;
    };
    mirrorSpan();
  }
  if(physics.blocked(player,activeDoorPolys()))throw Error('El punto de entrada no está libre.');
  camera.position.set(player[0],eye,player[1]);
  // HDR scene, contact occlusion, auto exposure, bloom, tone mapping and grain (post.mjs).
  composer=new Post(renderer,scene,camera);
  // Night exposure: a lower key and floor so the auto exposure keeps it an evening (pools
  // of lamplight, dark corners) instead of lifting it back to daylight brightness.
  const {key,minExposure,contrast,vignette,white}=composer.settings;
  outdoor.post=[{key,minExposure,contrast,vignette,white},{key:.11,minExposure:.2,contrast:.5,vignette:.38,white:[1.06,1,.9]}];
  const size=renderer.getDrawingBufferSize(new THREE.Vector2());composer.setSize(size.x,size.y);
  // Resolution and multisampling follow the machine's speed (quality.mjs). ?calidad=N pins a level
  // (0 = best); otherwise the last level this browser settled on is the starting point.
  const levels=qualityLevels(renderer.getPixelRatio()),pinned=new URLSearchParams(location.search).get('calidad');
  let saved=0;try{saved=+localStorage.getItem('parque-quality')||0;}catch{}
  quality=new AdaptiveQuality(levels,{start:pinned!==null?+pinned:saved,fixed:pinned!==null,apply:applyQuality,
    save:i=>{try{localStorage.setItem('parque-quality',i);}catch{}}});
  applyQuality(quality.level);
}
function applyQuality({ratio,samples,ao}){
  composer.settings.ao=ao?1:0;
  if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
  if(composer.sceneRT.samples!==samples){composer.sceneRT.samples=samples;composer.sceneRT.dispose();}
  const size=renderer.getDrawingBufferSize(new THREE.Vector2());composer.setSize(size.x,size.y);
}
// The terrace photograph and its estimated depth (scripts/terraza_view.py), plus the same
// photograph graded for night, with lit windows (scripts/night_views.py).
const loadViews=()=>Promise.all([loadImageTexture('./assets/vista-terraza.webp?v=4caf839e65'),loadImageTexture('./assets/vista-terraza-noche.webp?v=3392a2d48d'),
  fetch('./assets/vista-terraza.bin?v=0b2ae12633').then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}: vista-terraza.bin`);return r.arrayBuffer();})]);
// The photograph was taken from the terrace edge: a grid of vertices on the camera rays at the
// estimated depth, so walking indoors shifts the near things (pool, trees, the side wing) against
// the far city. Beyond TERRACE_RANGE the surface is pulled radially onto a sphere (the sky is at
// 5000 m in the data, past the far plane): the view from the origin does not change.
// The photo looks ~6.4° down: TERRACE_PITCH levels it so the far horizon sits at eye height.
const TERRACE_ORIGIN=[9.4,eye,-10.7],TERRACE_YAW=-.03,TERRACE_PITCH=-.112,TERRACE_RANGE=145;
function terraceGeometry(buffer){
  const head=new DataView(buffer),[tanHalf,aspect,minDepth,maxDepth]=[0,4,8,12].map(o=>head.getFloat32(o,true)),cols=head.getUint16(16,true),rows=head.getUint16(18,true);
  const depth=new Uint16Array(buffer,20,cols*rows),lo=Math.log(minDepth),span=Math.log(maxDepth)-lo;
  const position=new Float32Array(cols*rows*3),uv=new Float32Array(cols*rows*2),color=new Float32Array(cols*rows*4),index=new Uint16Array((cols-1)*(rows-1)*6);
  // The photo ends in a hard edge: its border fades into the sky dome (vertex alpha).
  const edge=(t,w)=>{const a=Math.min(t,1-t)/w;return a>=1?1:a*a*(3-2*a);};
  for(let r=0,i=0,k=0;r<rows;r++)for(let c=0;c<cols;c++,i++){
    const u=c/(cols-1),v=r/(rows-1),d=Math.exp(lo+depth[i]/65535*span),x=(2*u-1)*tanHalf*d,y=(1-2*v)*tanHalf/aspect*d;
    const pull=Math.min(1,TERRACE_RANGE/Math.hypot(x,y,d));
    position.set([x*pull,y*pull,-d*pull],i*3);uv[i*2]=u;uv[i*2+1]=1-v;
    color.set([1,1,1,edge(u,.04)*edge(v,.06)],i*4);
    if(c<cols-1&&r<rows-1){index.set([i,i+cols,i+1,i+1,i+cols,i+cols+1],k);k+=6;}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.BufferAttribute(color,4));geometry.setIndex(new THREE.BufferAttribute(index,1));
  return geometry;
}
async function exterior(loading){
  const [tex,night,buffer]=await loading;
  for(const t of [tex,night]){t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);}
  const view=new THREE.Mesh(terraceGeometry(buffer),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,toneMapped:false,vertexColors:true,transparent:true}));
  view.position.set(...TERRACE_ORIGIN);view.rotation.order='YXZ';view.rotation.set(TERRACE_PITCH,TERRACE_YAW,0);view.frustumCulled=false;view.renderOrder=-1;scene.add(view);  // transparent (edge fade): drawn before the glass, which is transparent too
  outdoor.views=[[view.material,tex,night]];
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(260,260),material('#73826a'));ground.rotation.x=-Math.PI/2;ground.position.set(8,-58,-20);scene.add(ground);
  outdoor.ground=ground.material;
  // Sky around the photograph: where it ends, views read the flat background as an
  // overexposed card. A vertical gradient (blue zenith, hazy horizon at eye level, hazy
  // ground) at display brightness like the photo; its colours continue the photo's edges.
  // At night: deep blue zenith, the city's warm glow on the horizon, dark ground.
  const gradient=stops=>{const c=document.createElement('canvas');c.width=4;c.height=512;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,512);
    for(const [t,col] of stops)gr.addColorStop(t,col);
    g.fillStyle=gr;g.fillRect(0,0,4,512);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;};
  outdoor.skies=[gradient([[0,'#3469bd'],[.33,'#477dc6'],[.42,'#74a6db'],[.47,'#99bad5'],[.5,'#a7b4bf'],[.515,'#8d9588'],[.6,'#7e8873'],[1,'#6e7663']]),
    gradient([[0,'#05070f'],[.33,'#0f1423'],[.42,'#1d1f2c'],[.47,'#40353a'],[.5,'#57443a'],[.515,'#15141a'],[.6,'#0c0c0f'],[1,'#08080a']])];
  const dome=new THREE.Mesh(new THREE.SphereGeometry(150,32,24),new THREE.MeshBasicMaterial({map:outdoor.skies[0],side:THREE.BackSide,toneMapped:false,depthWrite:false}));
  dome.position.set(...TERRACE_ORIGIN);dome.renderOrder=-1;scene.add(dome);outdoor.dome=dome.material;
  outdoorLight(timeOfDay.night);
}
// Terrace and facade (not baked): sun and sky by day; by night a faint cool moonlight
// and sky, the backdrop graded for night. Indoors everything takes the bake or probes.
function outdoorLight(night){
  const {sky,sun}=outdoor;
  sky.color.set(night?'#3a4866':'#dfe9f2');sky.groundColor.set(night?'#1a1712':'#8a7a64');sky.intensity=night?.22:.9;
  sun.color.set(night?'#a9bde0':'#ffe2bd');sun.intensity=night?.18:2.1;
  scene.background.set(night?'#06080f':'#c4d7de');
  Object.assign(composer.settings,outdoor.post[night?1:0]);
  if(outdoor.dome){outdoor.dome.map=outdoor.skies[night?1:0];for(const [m,day,dark] of outdoor.views)m.map=night?dark:day;outdoor.ground.color.set(night?'#141712':'#73826a');}
}
let timeSwitch=Promise.resolve();
function setNight(night){
  timeSwitch=timeSwitch.then(async()=>{
    if(!ready||night===timeOfDay.night)return;
    notice(night?'Encendiendo las luces…':'Amaneciendo…');
    await lightmap.setMode(night?'night':'day');
    timeOfDay.night=night;outdoorLight(night);
    await Promise.all([...timeOfDay.listeners].map(fn=>fn(night)));
    reflections.capture(renderer,scene);renderer.shadowMap.needsUpdate=true;idle(reportShaderErrors);
    notice(night?'Noche · todas las luces encendidas':'Día');
  }).catch(e=>{console.error(e);notice('No se ha podido cambiar la luz.');settings.night=timeOfDay.night;$('night').checked=timeOfDay.night;savePreferences();});
  return timeSwitch;
}

// Vestidor en piedra y vitrinas (vitrinas.mjs): travertine floor and glass doors in the
// vestidor interior: porcelain floor and glass doors instead of the plan's oak.
let closet=null;
function setCloset(on){
  timeSwitch=timeSwitch.then(()=>{
    if(!ready||!closet||on===closet.on)return;
    closet.set(on);reflections.capture(renderer,scene);renderer.shadowMap.needsUpdate=true;idle(reportShaderErrors);
    notice(on?'Vestidor en piedra y vitrinas':'Vestidor según el plano');
  }).catch(e=>{console.error(e);notice('No se ha podido cambiar el vestidor.');settings.closet=!!closet?.on;$('closet').checked=settings.closet;savePreferences();});
  return timeSwitch;
}

// Link errors, reported as three would at first draw (renderer.debug.checkShaderErrors).
const checkedPrograms=new Set();
const idle=fn=>(window.requestIdleCallback||setTimeout)(fn);
function reportShaderErrors(){
  const gl=renderer.getContext();
  for(const p of renderer.info.programs){
    if(checkedPrograms.has(p))continue;checkedPrograms.add(p);
    if(gl.getProgramParameter(p.program,gl.LINK_STATUS))continue;
    const [vs,fs]=gl.getAttachedShaders(p.program),log=s=>gl.getShaderInfoLog(s)?.trim()||'';
    console.error(`THREE.WebGLProgram: Shader Error ${gl.getError()} - VALIDATE_STATUS ${gl.getProgramParameter(p.program,gl.VALIDATE_STATUS)}\n\n`+
      `Program: ${p.name}\n\nProgram Info Log: ${gl.getProgramInfoLog(p.program)?.trim()||''}\n${log(vs)}\n${log(fs)}`);
  }
}

function pause(){
  if(!ready)return;playing=false;quality.reset();keys.clear();velocity=[0,0];touchVector=[0,0];$('joystick').firstElementChild.style.transform='';
  $('menu').hidden=false;$('crosshair').hidden=true;$('interaction').hidden=true;$('touch').hidden=true;$('enter').textContent='Continuar recorrido';screenMode.sync();
  if(document.pointerLockElement)document.exitPointerLock();$('enter').focus();
}
async function enter(){
  if(!ready)return;
  playing=true;quality.reset();$('menu').hidden=true;$('reset').hidden=false;$('crosshair').hidden=false;$('touch').hidden=!mobile;
  // Mouse capture and full screen both need the click: ask for them before any await.
  if(!mobile)Promise.resolve(canvas.requestPointerLock()).catch(()=>notice('Arrastra el ratón para mirar. W A S D para caminar.'));
  if(settings.fullscreen)screenMode.enter();screenMode.sync();
  if(settings.sound){try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();await audioCtx.resume();}catch{settings.sound=false;}}
}
function interact(){
  if(!playing||!target)return;
  if(fronts.list.includes(target))fronts.toggle(target);else target.goal=target.goal>.5?0:1;
  notice((target.goal?'Abriendo · ':'Cerrando · ')+label(target.name));rayTime=1;
}
function label(s){return ({'Terraza salon':'Terraza · salón','Terraza comedor':'Terraza · comedor','Terraza izquierda':'Terraza','Bano secundario':'Baño','WC suite':'WC suite','Ducha suite':'Ducha suite','Suite izquierda':'Suite · vestidor','Suite derecha':'Suite · baño','Suite principal':'Dormitorio principal','Distribuidor dormitorios':'Distribuidor','Paso despensa bano':'Paso al baño','Dormitorio secundario':'Dormitorio niñas','Cortinas salón':'Cortinas · salón','Cortinas dormitorio':'Cortinas · dormitorio'})[s]||s;}
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
  // The closest surface must be an actual door or curtain, preventing interaction through walls.
  target=hits[0]?.object.userData.door||hits[0]?.object.userData.curtain||fronts.at(hits[0])||null;
  $('interaction').hidden=!target||!playing;
  if(target)$('interaction').querySelector('span').textContent=(target.goal>.5?'Cerrar · ':'Abrir · ')+label(target.name);
  $('touchDoor').disabled=!target;
}
function frame(time){
  requestAnimationFrame(frame);const raw=(time-last)/1000,dt=Math.min(raw||0,.045);last=time;
  if(!ready)return;
  if(playing){
    quality.frame(raw);
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
    for(const c of curtains){
      if(Math.abs(c.goal-c.t)<.00001)continue;
      c.set(c.t+Math.sign(c.goal-c.t)*Math.min(dt*.5,Math.abs(c.goal-c.t)));
    }
    if(doorChanged){renderer.shadowMap.needsUpdate=true;mirrorSpan();}
    fronts.step(dt);
    rayTime+=dt;roomTime+=dt;if(rayTime>.12){updateTarget();rayTime=0;}
    if(roomTime>.4){
      let name='Recibidor';
      if(inside(player,data.floors[3]))name='Terraza';
      else for(const r of data.rooms.slice(1)){const [a,b]=r.box;if(player[0]>=a[0]&&player[0]<=b[0]&&player[1]>=a[1]&&player[1]<=b[1]){name=r.name;break;}}
      if($('room').textContent!==name){$('room').textContent=name;$('room').classList.add('fresh');clearTimeout(roomTimer);roomTimer=setTimeout(()=>$('room').classList.remove('fresh'),2600);}roomTime=0;
    }
  }
  renderer.info.reset();composer.render(dt||1/60);
}
function look(dx,dy){yaw-=dx*.0021;pitch=THREE.MathUtils.clamp(pitch-dy*.0021,-1.3,1.3);}
$('enter').onclick=enter;$('pause').onclick=pause;$('interaction').onclick=interact;$('touchDoor').onclick=interact;
$('reset').onclick=()=>{player=[...data.spawn];velocity=[0,0];yaw=.05;pitch=0;camera.position.set(player[0],eye,player[1]);camera.rotation.set(0,yaw,0);notice('Has vuelto a la entrada.');};
addEventListener('keydown',e=>{
  if(e.code==='Escape'){pause();return;}if(!playing)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyN','KeyF'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.code==='KeyE'&&!e.repeat)interact();
  if(e.code==='KeyN'&&!e.repeat){settings.night=!timeOfDay.night;$('night').checked=settings.night;savePreferences();setNight(settings.night);}
  if(e.code==='KeyF'&&!e.repeat&&screenMode.supported){settings.fullscreen=!screenMode.on;$('fullscreen').checked=settings.fullscreen;savePreferences();if(settings.fullscreen)screenMode.enter();else screenMode.exit();}
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
addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const size=renderer.getDrawingBufferSize(new THREE.Vector2());composer?.setSize(size.x,size.y);});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('error').hidden=false;$('error').textContent='Se ha interrumpido la vista 3D. Recarga la página para recuperarla.';$('enter').disabled=true;});
async function load(){
  try{
    // Downloads in the order the build needs them, all at once within each step: the
    // geometry, the UVs of its bake, the surface maps and the backdrop first (with the
    // room modules and the cloth maps' workers); then the bake's pages and probes, which
    // only the last room module and the captures read. Shared bandwidth would otherwise
    // deliver the geometry last.
    const get=(url,read)=>fetch(url,{priority:'high'}).then(r=>{if(!r.ok)throw Error('No se ha podido descargar el modelo.');return read(r);});
    const house=Promise.all([get('./assets/house.json?v=da98e82f2a',r=>r.json()),get('./assets/house.bin?v=e14ff2aa29',r=>r.arrayBuffer())]);
    const surfaceMaps=loadSurfaceMaps(),views=loadViews();
    for(const kind of ['fabric','linen','rug']){textile(kind);textileNormal(kind);}
    preloadRooms();prepareBedding();
    for(const p of [surfaceMaps,views])p.catch(()=>{});  // reported where awaited
    const bake=fetchLightmap(settings.night?'night':'day',{after:Promise.allSettled([house,surfaceMaps,views])});
    const [json,buffer]=await house;
    const progress=window.loadProgress;progress?.stage(.1);
    data=json;timeOfDay.night=settings.night;await initScene(buffer,bake);progress?.stage(.35);await Promise.all([exterior(views),surfaceTextures(surfaceMaps)]);progress?.stage(.5);
    lightmap.syncTextures();
    // Per-room refinements (rooms/<id>.mjs); a failing module is logged and skipped.
    const rooms=applyRooms({scene,camera,renderer,mats,staticMeshes,lightmap,data,doors,curtains,lighting,timeOfDay});
    // The house's programs compile in the GPU process while the room modules run; those
    // the modules change or add are compiled after them. Issued once the modules' first
    // synchronous part has run: their canvas read-backs would wait behind the compiles.
    setTimeout(()=>reflections.compile(renderer,scene,camera,composer.sceneRT,{wait:false}));
    roomStatus=await rooms;progress?.stage(.7);
    // Vestidor en piedra y vitrinas (menu option): built now, shown or hidden on demand.
    closet=createVitrinas(THREE,{data,staticMeshes,scene,mats,cloneMaterial,lightObject,lighting,floor:vestidorStone});
    closet.set(settings.closet);
    // Doors, the study screen, the master bedding and the mirror frame are not baked:
    // they take the probes. Then each room is captured for its reflections, props included.
    for(const o of runtimeObjects)lightObject(o,lighting);
    for(const o of staticMeshes)if(o.userData.exported&&!o.material.userData?.bakedLit)lightObject(o,lighting);
    const compiled=reflections.compile(renderer,scene,camera,composer.sceneRT);composer.compile();
    await Promise.all([beddingReady(),lightmap.loaded]);progress?.stage(.85);uploadTextures();await compiled;
    // The sun's shadow map depends on the geometry and the doors only: drawn once (by the
    // first capture) and again when a door moves, not for every face of every capture.
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    reflections.capture(renderer,scene);
    ready=true;progress?.done();$('night').disabled=false;$('closet').disabled=false;
    // The tour starts on the reduced lightmaps: reflections again once the full pages are in.
    lightmap.sharp.then(()=>{timeSwitch=timeSwitch.then(()=>reflections.capture(renderer,scene));});
    const params=new URLSearchParams(location.search);
    if(params.get('start')==='kitchen'){
      const start=[(738-106.5)/51.53901216893343,(389-619.85)/51.53901216893343];
      if(!physics.blocked(start,activeDoorPolys())){player=start;yaw=Math.PI;pitch=0;camera.position.set(player[0],eye,player[1]);camera.rotation.set(0,yaw,0);}
    }
    $('enter').disabled=false;$('enter').textContent='Entrar en casa';requestAnimationFrame(frame);
    idle(reportShaderErrors);
  }catch(e){
    console.error(e);window.loadProgress?.fail();$('error').hidden=false;$('error').textContent='No se ha podido iniciar el recorrido. Comprueba la conexión y que Chrome tenga la aceleración gráfica activada, y recarga la página.';
    $('enter').textContent='Recargar';$('enter').disabled=false;$('enter').onclick=()=>location.reload();
  }
}
load();
