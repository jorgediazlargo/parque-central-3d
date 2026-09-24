import * as THREE from './assets/three.module.js';

export function artwork() {
  const c=document.createElement('canvas');c.width=512;c.height=1024;
  const ctx=c.getContext('2d');ctx.fillStyle='#d9ccb5';ctx.fillRect(0,0,512,1024);
  // Original line composition inspired by the reference, not a crop of the render.
  ctx.strokeStyle='#494132';
  for(let r=70;r<1180;r+=16){
    ctx.beginPath();ctx.lineWidth=3.4;
    for(let j=0;j<=200;j++){
      const a=-Math.PI*.7+j/200*Math.PI*1.35;
      const rr=r+2.2*Math.sin(a*13+r*.07)+1.4*Math.sin(a*31+r*.013);
      const x=-35+rr*Math.cos(a),y=880+rr*.88*Math.sin(a);
      if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  return new THREE.MeshStandardMaterial({map:texture,roughness:.95,side:THREE.DoubleSide});
}

export function curtainMaterial(base) {
  const m=base.clone();m.defines={...m.defines,...base.defines};m.color.set('#ece5d9');m.opacity=.88;m.roughness=1;m.depthWrite=true;
  m.onBeforeCompile=shader=>{
    base.onBeforeCompile(shader);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
      reflectedLight.directSpecular=vec3(0.0);
      #include <lights_fragment_end>
    `);
  };
  m.customProgramCacheKey=()=> 'salon-sheer';return m;
}
