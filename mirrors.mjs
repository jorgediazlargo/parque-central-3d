// Real mirror reflections, cropped to the mirror's screen box.
//
// cropReflection(THREE, reflector) turns a stock Reflector into one that draws only the
// pixels the mirror covers (rooms/bano.mjs, vanity mirror: the stock one rendered the
// whole view into its target, 29 → 20 FPS). The reflected view is cropped to the
// mirror's own screen box, so the target holds only mirror pixels, and the cropped
// frustum culls everything the mirror cannot show. The reflection is drawn 1:1 with
// the screen (up to 2048 a side) and multisampled ×4 like the main pass. The target is
// allocated once at the drawing-buffer size and the crop drawn into its corner, so
// walking past a mirror does not reallocate multisampled buffers.
//
// createMirrors(...) adds the K01-K02 mirrors C01 (aseo), C02 (baño secundario) and C03
// (vestidor interior), until now pale probe-lit glass, as such reflectors. Each one only
// draws while the camera is in front of it, a plan line of sight reaches it and the
// adaptive quality is at one of its two best levels on a computer; otherwise it hides
// and the exported silvered pane (mats.mirror) shows, as before.

// scripts/light_layout.py MIRRORS (world metres): ends of the wall line, its normal into
// the room, bottom and top. The pane (proyecto.py mirrors) is 6 mm thick, 9 mm off the
// wall: its face is 15 mm in front of the line.
export const MIRRORS=[
  {name:'C01 aseo',a:[15.118,-3.6382],b:[16.700,-3.6382],n:[0,1],bottom:1.10,top:1.96},
  {name:'C02 bano secundario',a:[18.2499,-4.7366],b:[18.2499,-3.6365],n:[-1,0],bottom:1.10,top:1.96},
  {name:'C03 vestidor interior',a:[5.58,-3.6299],b:[6.51,-3.6299],n:[0,1],bottom:.15,top:2.00}
];
const FACE=.0155;

let drawing=false;   // a mirror inside a mirror's reflection keeps its last image
export function cropReflection(THREE,o,{budget=1e6,clipBias=.003}={}){
  const target=o.getRenderTarget(),virtualCamera=o.camera,textureMatrix=o.material.uniforms.textureMatrix.value;
  target.samples=4;target.dispose();target.scissorTest=true;
  const size=new THREE.Vector2(),crop=new THREE.Matrix4(),pv=new THREE.Matrix4(),corner=new THREE.Vector4();
  const plane=new THREE.Plane(),normal=new THREE.Vector3(),mirrorPos=new THREE.Vector3(),camPos=new THREE.Vector3(),rot=new THREE.Matrix4();
  const look=new THREE.Vector3(),view=new THREE.Vector3(),aim=new THREE.Vector3(),clip=new THREE.Vector4(),q=new THREE.Vector4();
  o.geometry.computeBoundingBox();const bb=o.geometry.boundingBox;
  o.onBeforeRender=function(renderer,scene,camera){
    if(drawing)return;
    if(o.userData.inSight&&!o.userData.inSight(camera))return;   // behind walls: keep the last reflection
    mirrorPos.setFromMatrixPosition(o.matrixWorld);camPos.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(o.matrixWorld);normal.set(0,0,1).applyMatrix4(rot);
    view.subVectors(mirrorPos,camPos);
    if(view.dot(normal)>0)return;
    // Mirror's screen box (NDC); the whole screen when a corner is behind the eye.
    pv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(o.matrixWorld);
    let x0=1,x1=-1,y0=1,y1=-1,behind=false;
    for(const [x,y] of [[bb.min.x,bb.min.y],[bb.max.x,bb.min.y],[bb.min.x,bb.max.y],[bb.max.x,bb.max.y]]){
      corner.set(x,y,0,1).applyMatrix4(pv);
      if(corner.w<camera.near){behind=true;break;}
      const nx=corner.x/corner.w,ny=corner.y/corner.w;x0=Math.min(x0,nx);x1=Math.max(x1,nx);y0=Math.min(y0,ny);y1=Math.max(y1,ny);
    }
    renderer.getDrawingBufferSize(size);
    const mx=4/size.x,my=4/size.y;   // 2 px margin for the bilinear taps
    if(behind){x0=y0=-1;x1=y1=1;}
    x0=Math.max(-1,x0-mx);x1=Math.min(1,x1+mx);y0=Math.max(-1,y0-my);y1=Math.min(1,y1+my);
    if(x1<=x0||y1<=y0)return;
    // The mirrored camera's image is flipped left to right (its right axis is the
    // reflection of the camera's, negated), so the box is cropped at -ox. Cropping at
    // ox only held with the mirror centred on screen: seen from the side, the part of
    // the mirror outside the overlap sampled past the reflection (streaks).
    const sx=2/(x1-x0),sy=2/(y1-y0),ox=(x0+x1)/2,oy=(y0+y1)/2;
    crop.set(sx,0,0,sx*ox, 0,sy,0,-sy*oy, 0,0,1,0, 0,0,0,1);
    // Target at the drawing-buffer size (at most 2048 a side); the crop fills its
    // lower-left w × h at screen resolution, or at most `budget` pixels when the mirror
    // fills the view (a second full-screen pass: 50 → 39 FPS at 1535 × 1024).
    const W=Math.min(2048,size.x),H=Math.min(2048,size.y);
    if(target.width!==W||target.height!==H)target.setSize(W,H);
    const bw=(x1-x0)/2*size.x,bh=(y1-y0)/2*size.y,k=Math.min(1,Math.sqrt(budget/(bw*bh)));
    const w=Math.min(W,Math.ceil(bw*k)),h=Math.min(H,Math.ceil(bh*k));
    target.viewport.set(0,0,w,h);target.scissor.set(0,0,w,h);
    // Stock Reflector placement of the mirrored camera.
    view.reflect(normal).negate().add(mirrorPos);
    rot.extractRotation(camera.matrixWorld);
    look.set(0,0,-1).applyMatrix4(rot).add(camPos);
    aim.subVectors(mirrorPos,look).reflect(normal).negate().add(mirrorPos);
    virtualCamera.position.copy(view);virtualCamera.up.set(0,1,0).applyMatrix4(rot).reflect(normal);
    virtualCamera.lookAt(aim);virtualCamera.far=camera.far;virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.multiplyMatrices(crop,camera.projectionMatrix);
    const u=w/W,v=h/H;
    textureMatrix.set(.5*u,0,0,.5*u, 0,.5*v,0,.5*v, 0,0,.5,.5, 0,0,0,1);
    textureMatrix.multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse).multiply(o.matrixWorld);
    // Oblique near plane on the mirror (Lengyel), as the stock Reflector.
    plane.setFromNormalAndCoplanarPoint(normal,mirrorPos).applyMatrix4(virtualCamera.matrixWorldInverse);
    clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    const e=virtualCamera.projectionMatrix.elements;
    q.set((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
    clip.multiplyScalar(2/clip.dot(q));
    e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+1-clipBias;e[14]=clip.w;
    virtualCamera.projectionMatrixInverse.copy(virtualCamera.projectionMatrix).invert();
    o.visible=false;drawing=true;
    const current=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),xr=renderer.xr.enabled,shadowAuto=renderer.shadowMap.autoUpdate;
    renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
    renderer.setRenderTarget(target);renderer.state.buffers.depth.setMask(true);
    if(renderer.autoClear===false)renderer.clear();
    renderer.render(scene,virtualCamera);
    renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadowAuto;renderer.setRenderTarget(current,face,mip);   // a cube capture's face, not face 0
    if(camera.viewport!==undefined)renderer.state.viewport(camera.viewport);
    o.visible=true;drawing=false;
  };
  return o;
}

// Clear silvered glass: silver behind a near-colourless pane, a plain multiply (the stock
// overlay blend bends HDR values) with the pane's Fresnel at grazing angles.
function silver(o){
  o.material.uniforms.color.value.setRGB(.86,.86,.84);
  o.material.vertexShader=o.material.vertexShader.replace('varying vec4 vUv;','varying vec4 vUv;varying vec3 vMirrorView,vMirrorNormal;')
    .replace('vUv = textureMatrix','vMirrorView=(modelViewMatrix*vec4(position,1.0)).xyz;vMirrorNormal=normalMatrix*vec3(0.0,0.0,1.0);\n\t\t\tvUv = textureMatrix');
  o.material.fragmentShader=o.material.fragmentShader.replace('varying vec4 vUv;',`varying vec4 vUv;varying vec3 vMirrorView,vMirrorNormal;
    vec3 mirrorTint(){
      float c=clamp(abs(dot(normalize(vMirrorView),normalize(vMirrorNormal))),0.0,1.0);
      float F=.04+.96*pow(1.0-c,5.0);
      return F+(1.0-F)*color;
    }`).replace('blendOverlay( base.rgb, color )','base.rgb*mirrorTint()');
  o.material.needsUpdate=true;
}

// enabled(): whether the quality level allows extra mirror passes now.
export function createMirrors(THREE,Reflector,{scene,walls,doors,mirrorSight,enabled}){
  const list=MIRRORS.map(m=>{
    const width=Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1]),height=m.top-m.bottom;
    const o=new Reflector(new THREE.PlaneGeometry(width,height),{textureWidth:16,textureHeight:16,clipBias:.003,multisample:0});
    o.name='Espejo '+m.name+' reflejo';o.userData.mirror=m.name;
    o.position.set((m.a[0]+m.b[0])/2+m.n[0]*FACE,(m.bottom+m.top)/2,(m.a[1]+m.b[1])/2+m.n[1]*FACE);
    o.rotation.y=Math.atan2(m.n[0],m.n[1]);
    silver(o);cropReflection(THREE,o,{budget:5e5});
    const sight=mirrorSight({a:m.a,b:m.b},walls);
    o.visible=false;scene.add(o);
    return {o,m,sight};
  });
  return {
    list,
    // Per frame, before rendering: show a mirror only where its reflection is drawn.
    update(camera){
      const on=enabled(),x=camera.position.x,z=camera.position.z;
      for(const {o,m,sight} of list){
        const front=(x-(m.a[0]+m.b[0])/2)*m.n[0]+(z-(m.a[1]+m.b[1])/2)*m.n[1]>FACE;
        o.visible=on&&front&&sight.visible([x,z],doors());
      }
    }
  };
}
