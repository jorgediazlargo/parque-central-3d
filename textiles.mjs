import * as THREE from './assets/three.module.js';

// Tileable upholstery maps shared by real-time and baked rooms. One texture
// spans 25 cm (repeat 4 on metric UVs), so 1 px ≈ 0.5 mm.
const cache=new Map();
export function textile(kind){
  if(cache.has(kind))return cache.get(kind);
  const N=512,c=document.createElement('canvas');c.width=c.height=N;
  const ctx=c.getContext('2d'),pixels=ctx.createImageData(N,N);
  let seed=3817+kind.length*97;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const base=kind==='linen'?242:kind==='rug'?214:222;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=(y*N+x)*4;
    let v;
    if(kind==='linen'){
      // Plain weave with irregular slubs along the weft.
      const yarn=(x%4<2?3:-3)+(y%4<2?2:-2);
      const slub=4*Math.sin(y*.09+2.3*Math.sin(x*.021))*Math.max(0,Math.sin(x*.047+y*.003));
      v=base+yarn+slub+(random()-.5)*10;
    }else if(kind==='rug'){
      // Chunky knotted wool/jute: offset rows of 8 mm loops, visible at standing height.
      const row=Math.floor(y/16),u=(x+row*8)%16-8,w=y%16-8,loop=1-Math.min(1,(u*u+w*w)/60);
      v=base+34*loop-14+(row%2?4:-4)+(random()-.5)*14;
    }else{
      // Bouclé: fine grain; loops are drawn below.
      v=base+(random()-.5)*14;
    }
    pixels.data.set([v,v-2,v-5,255],i);
  }
  ctx.putImageData(pixels,0,0);
  if(kind!=='linen'&&kind!=='rug'){
    // Dense curled loops, drawn with wrap-around so the tile stays seamless.
    ctx.lineCap='round';
    for(let k=0;k<5200;k++){
      const x=random()*N,y=random()*N,r=2+random()*3.4,a=random()*Math.PI*2,light=random()<.55;
      const ry=r*(.6+random()*.5),arc=Math.PI*(1.1+random()*.8);
      ctx.strokeStyle=light?`rgba(255,250,242,${.13+random()*.15})`:`rgba(70,58,46,${.07+random()*.11})`;
      ctx.lineWidth=1.1+random()*.9;
      for(const ox of [-N,0,N])for(const oy of [-N,0,N]){
        if(x+ox<-8||x+ox>N+8||y+oy<-8||y+oy>N+8)continue;
        ctx.beginPath();ctx.ellipse(x+ox,y+oy,r,ry,a,0,arc);ctx.stroke();
      }
    }
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(kind==='rug'?2.5:4,kind==='rug'?2.5:4);t.anisotropy=8;
  cache.set(kind,t);return t;
}
export const textileBump={rug:.0007,linen:.00015,fabric:.00055};
