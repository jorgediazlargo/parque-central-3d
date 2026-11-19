import {GLTFLoader} from './assets/jsm/loaders/GLTFLoader.js';

// The visitor's own body, seen only in the mirrors (rooms/bano.mjs vanity with the M2
// mirror leaves, C01-C03 in mirrors.mjs). Microsoft Rocketbox Male_Adult_16 (MIT; see
// assets/avatar/LICENSE-rocketbox.txt), converted by scripts/avatar_blender.py with three
// motion-capture clips: idle, walk and walkFast (in place).
//
// - Drawn on AVATAR_LAYER only: the walking camera, the reflection probes and the aiming
//   ray never see it; the mirrors' cameras enable that layer (mirrors.mjs cropReflection).
// - Placed under the camera, facing where it looks; its eyes at the eye height (the model
//   is 1,81 m, eyes at ≈ 1,69 m, as the adult view). At the children's eye heights it hides:
//   a scaled-down adult would not be them.
// - Walk and fast walk play at the measured ground speed of each clip (stride from the
//   feet), phase-locked to each other and blended by the walking speed; idle when still.
//   Walking backwards plays the walk in reverse; sideways, the hips turn up to 50° toward
//   the motion and the chest and head turn back toward the view.
// - The head and neck follow the view's pitch, so looking down in front of a mirror the
//   reflection looks down too.
// - Lit like the other runtime objects (probes of the bake), with a soft contact shadow on
//   the floor (also on AVATAR_LAYER).
export const AVATAR_LAYER=1;
const ADULT_EYE=1.69,MODEL_EYE=1.69;

export async function createAvatar(THREE,{scene,lightObject,lighting,url='./assets/avatar/persona.glb?v=b88e020891'}){
  const gltf=await new GLTFLoader().loadAsync(url);
  const root=new THREE.Group();root.name='Persona (espejos)';
  const model=gltf.scene;model.rotation.y=Math.PI;   // the export faces +z; the view looks to -z at yaw 0
  const hips=new THREE.Group();hips.add(model);root.add(hips);
  let skinned=null;
  model.traverse(o=>{
    o.layers.set(AVATAR_LAYER);
    if(o.isSkinnedMesh){skinned=o;o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;
      const m=o.material;m.side=THREE.FrontSide;m.envMapIntensity=.6;if(m.normalMap)m.normalScale.set(1,1);}
  });
  lightObject(root,lighting);
  const bone=name=>skinned.skeleton.bones.find(b=>b.name.replace(/_/g,' ')===name)||model.getObjectByName(name);
  const head=bone('Bip01 Head'),neck=bone('Bip01 Neck'),chest=bone('Bip01 Spine2'),footL=bone('Bip01 L Foot'),footR=bone('Bip01 R Foot');

  // Soft contact shadow, a radial falloff multiplied onto the floor.
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const grad=g.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(0,0,0,.55)');grad.addColorStop(.5,'rgba(0,0,0,.28)');grad.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grad;g.fillRect(0,0,128,128);
  const blob=new THREE.Mesh(new THREE.PlaneGeometry(.75,.55).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,color:0x000000,opacity:.9,polygonOffset:true,polygonOffsetFactor:-2}));
  blob.position.y=.003;blob.layers.set(AVATAR_LAYER);blob.renderOrder=1;root.add(blob);

  const mixer=new THREE.AnimationMixer(model);
  // Root (Biped COM) keeps its bob and sway, not any drift across the floor.
  const clip=name=>{
    const c=gltf.animations.find(a=>a.name===name).clone();
    for(const t of c.tracks)if(/\.position$/.test(t.name)&&!/Pelvis|Spine|Neck|Head|Clavicle|Arm|Hand|Finger|Thigh|Calf|Foot|Toe/.test(t.name)){
      const v=t.values,x0=v[0],z0=v[2];for(let i=0;i<v.length;i+=3){v[i]=x0;v[i+2]=z0;}
    }
    return c;
  };
  const clips={idle:clip('idle'),walk:clip('walk'),walkFast:clip('walkFast')};
  const actions=Object.fromEntries(Object.entries(clips).map(([k,c])=>[k,mixer.clipAction(c)]));
  for(const a of Object.values(actions)){a.play();a.setEffectiveWeight(0);}
  actions.idle.setEffectiveWeight(1);

  // Ground speed of a walk clip: over one cycle the feet's largest separation along the
  // walking direction is a step; two steps a cycle.
  const pa=new THREE.Vector3(),pb=new THREE.Vector3();
  const speedOf=name=>{
    for(const a of Object.values(actions))a.setEffectiveWeight(0);
    const a=actions[name];a.setEffectiveWeight(1);let step=0;
    for(let i=0;i<48;i++){
      a.time=i/48*a.getClip().duration;mixer.update(0);model.updateMatrixWorld(true);
      footL.getWorldPosition(pa);footR.getWorldPosition(pb);model.worldToLocal(pa);model.worldToLocal(pb);
      step=Math.max(step,Math.abs(pa.z-pb.z));
    }
    a.setEffectiveWeight(0);
    return 2*step/a.getClip().duration;
  };
  const speeds={walk:speedOf('walk'),walkFast:speedOf('walkFast')};
  actions.idle.setEffectiveWeight(1);actions.walk.time=actions.walkFast.time=0;

  scene.add(root);
  let move=0,fast=0,phase=0,turn=0,lastX=null,lastZ=null,dir=1;
  const q=new THREE.Quaternion(),qp=new THREE.Quaternion(),axis=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0);
  // Rotate a bone by a world-space rotation about its own pivot (after the clip pose).
  const turnBone=(b,worldAxis,angle)=>{
    if(!b||!angle)return;
    b.parent.getWorldQuaternion(qp);
    q.setFromAxisAngle(worldAxis,angle);
    b.quaternion.premultiply(qp.clone().invert().multiply(q).multiply(qp));
    b.updateMatrixWorld(true);
  };
  return {
    root,speeds,
    update(dt,{x,z,yaw,pitch,eye}){
      root.visible=eye>=1.5;
      if(!root.visible)return;
      dt=Math.max(dt,1e-4);
      // Ground velocity from the position (the physics may slide along a wall).
      const vx=lastX===null?0:(x-lastX)/dt,vz=lastZ===null?0:(z-lastZ)/dt;lastX=x;lastZ=z;
      const speed=Math.hypot(vx,vz);
      const k=1-Math.exp(-dt*8);
      move+=((speed>.08?1:0)-move)*k;
      fast+=(THREE.MathUtils.clamp((speed-speeds.walk)/Math.max(.05,speeds.walkFast-speeds.walk),0,1)-fast)*k;
      // Facing: the view's yaw; moving sideways the hips turn toward the motion (up to
      // 50°), moving backwards the walk plays in reverse.
      const fx=-Math.sin(yaw),fz=-Math.cos(yaw);
      if(speed>.08){
        const along=(vx*fx+vz*fz)/speed,side=(vx*Math.cos(yaw)-vz*Math.sin(yaw))/speed;
        dir=along<-.2?-1:1;
        const want=THREE.MathUtils.clamp(Math.atan2(-side,Math.abs(along)+1e-3)*(dir<0?-1:1),-.87,.87);
        turn+=(want-turn)*k;
      }else turn+=(0-turn)*k;
      root.position.set(x,0,z);root.rotation.y=yaw;hips.rotation.y=turn;
      // One phase for both walk clips at the blended ground speed.
      const clipSpeed=THREE.MathUtils.lerp(speeds.walk,speeds.walkFast,fast);
      const rate=move>.01?THREE.MathUtils.clamp(speed/Math.max(clipSpeed,.1),.4,1.8):1;
      phase=(phase+dir*dt*rate/THREE.MathUtils.lerp(clips.walk.duration,clips.walkFast.duration,fast)+1)%1;
      actions.walk.time=phase*clips.walk.duration;actions.walkFast.time=phase*clips.walkFast.duration;
      actions.idle.setEffectiveWeight(1-move);actions.walk.setEffectiveWeight(move*(1-fast));actions.walkFast.setEffectiveWeight(move*fast);
      actions.walk.timeScale=actions.walkFast.timeScale=0;   // driven by phase
      mixer.update(dt);
      const s=eye/MODEL_EYE;hips.scale.setScalar(s>.96&&s<1.06?s:1);
      root.updateMatrixWorld(true);
      // Chest and head turn back toward the view; the head and neck follow its pitch.
      turnBone(chest,yAxis,-turn*.45);
      turnBone(neck,yAxis,-turn*.3);turnBone(head,yAxis,-turn*.25);
      axis.set(Math.cos(yaw),0,-Math.sin(yaw));
      const p=THREE.MathUtils.clamp(pitch,-.9,.6);
      turnBone(neck,axis,p*.35);turnBone(head,axis,p*.6);
    }
  };
}
