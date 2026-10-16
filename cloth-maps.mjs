// Pixels of the cloth maps of the master bed (bedding.mjs) and the girls' beds
// (rooms/ninas.mjs), pure arithmetic: computed in workers (cloth-worker.mjs) while the
// house loads, the same values as on the main thread.

// Seeded value noise, smooth enough for folds.
export function noise2(seed){
  const h=(x,y)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,2147483647)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  return (x,y)=>{
    const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v-.5;
  };
}

// Tileable cloth maps: colour + normal from a height field (RGBA, size² texels).
function bedPixels(kind){
  const N=1024,H=new Float32Array(N*N),C=new Float32Array(N*N);
  let seed=kind==='waffle'?911:kind==='sheet'?577:233;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const at=(x,y)=>((y+N)%N)*N+((x+N)%N);
  if(kind==='waffle'){
    // Waffle weave: 9 mm cells with raised ridges (tile 0.5 m → 2 px/mm).
    const cell=18;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const u=(x%cell)/cell-.5,v=(y%cell)/cell-.5,r=Math.max(Math.abs(u),Math.abs(v));
      const pocket=Math.pow(Math.max(0,1-r*2.2),1.5),yarn=.18*Math.sin(x*1.6)*Math.sin(y*1.6);
      H[y*N+x]=-.9*pocket+yarn;C[y*N+x]=-.10*pocket;
    }
  }else{
    // Washed linen / percale: slub yarns along the weft and soft random creases.
    const n1=noise2(seed),n2=noise2(seed+7);
    const rowSlub=new Float32Array(N);for(let y=0;y<N;y++)rowSlub[y]=random()<.14?(random()-.3)*1.4:0;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
      const slub=rowSlub[y]*Math.max(0,n1(x/37,y/3));
      const weave=.10*((x&1)^(y&1)?1:-1);
      H[y*N+x]=slub*.6+weave;
      // Tonal mottling of stone-washed cloth, tileable by sampling a torus.
      const a=x/N*Math.PI*2,b=y/N*Math.PI*2;
      C[y*N+x]=.025*n2(3+Math.cos(a)*4,3+Math.sin(a)*4+b*.6)+.035*slub;
    }
    // Mostly broad, soft creases; a few fine crinkles of washed cloth.
    const creases=kind==='sheet'?150:190;
    for(let k=0;k<creases;k++){
      const fine=random()<.2,cx=random()*N,cy=random()*N,len=fine?40+random()*90:90+random()*260,w=fine?2+random()*2:6+random()*18;
      const ang=random()*Math.PI,dx=Math.cos(ang),dy=Math.sin(ang),amp=(random()<.5?-1:1)*(fine?.25+random()*.3:.5+random()*1.2)*w/8;
      const bend=(random()-.5)*.004,r=Math.ceil(len/2+w*3);
      for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
        let s=ox*dx+oy*dy;const q=-ox*dy+oy*dx-bend*s*s;
        if(Math.abs(s)>len/2||Math.abs(q)>w*3)continue;
        const taper=Math.sin(Math.PI*(s/len+.5));
        H[at(Math.round(cx+ox),Math.round(cy+oy))]+=amp*taper*taper*Math.exp(-(q*q)/(w*w));
      }
    }
  }
  const color=new Uint8ClampedArray(N*N*4),normal=new Uint8ClampedArray(N*N*4);
  const strength=kind==='waffle'?1.4:.55;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,gx=(H[at(x+1,y)]-H[at(x-1,y)])*strength,gy=(H[at(x,y+1)]-H[at(x,y-1)])*strength,l=Math.hypot(gx,gy,1);
    normal.set([(-gx/l*.5+.5)*255,(gy/l*.5+.5)*255,(1/l*.5+.5)*255,255],i*4);
    const v=Math.max(0,Math.min(255,248*(1+C[i]+H[i]*.012)));
    color.set([v,v,v,255],i*4);
  }
  return {size:N,color,normal};
}

// Value noise whose lattice wraps every P cells (seamless when N/scale = P).
function noiseT(seed,P){
  const h=(x,y)=>{x=((x%P)+P)%P;y=((y%P)+P)%P;let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,2147483647)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
  return (x,y)=>{
    const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v-.5;
  };
}

// The girls' duvets (rooms/ninas.mjs): washed-linen colour + normal maps, tile 0.6 m
// (1024 px). What reads at 2-3 m is what a photo of stonewashed linen shows: slub streaks a few millimetres thick
// running with the weft, a blotchy dye mottle at 1-5 cm and soft creases; the
// crinkle is kept sparse so the cloth does not read as crumpled paper.
function ninasLinenPixels(){
  const N=1024,H=new Float32Array(N*N),C=new Float32Array(N*N);
  let seed=389;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const at=(x,y)=>((y+N)%N)*N+((x+N)%N);
  const along=noiseT(seed,16),mottle=noiseT(seed+3,16),grain=noiseT(seed+5,128),fleck=noiseT(seed+11,256);
  // Slub bands 2-4 px (1.2-2.4 mm) thick, each with its own sign and strength.
  const band=new Float32Array(N);
  for(let y=0;y<N;){const w=2+Math.floor(random()*3),v=random()<.30?(random()-.42)*2:0;for(let k=0;k<w&&y<N;k++,y++)band[y]=v*(k===0||k===w-1?.55:1);}
  // Heather: wider bands (4-9 mm) of slightly lighter or darker yarn, the streaks
  // that still read on a duvet seen from across the room.
  const heather=new Float32Array(N);
  for(let y=0;y<N;){const w=6+Math.floor(random()*10),v=(random()-.5)*2;for(let k=0;k<w&&y<N;k++,y++)heather[y]=v*Math.sin(Math.PI*(k+.5)/w);}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const slub=band[y]*Math.max(0,along(x/64,y/16)*2.2),weave=.10*((x&1)^(y&1)?1:-1);
    H[y*N+x]=slub*.45+weave;
    C[y*N+x]=.085*mottle(x/64,y/64)+.045*grain(x/8,y/8)+.025*fleck(x/4,y/4)+.09*slub+.05*heather[y]*(.4+along(x/64+5,y/16+3)*1.6);
  }
  for(let k=0;k<110;k++){
    const fine=random()<.4,cx=random()*N,cy=random()*N,len=fine?40+random()*90:120+random()*300,w=fine?2+random()*2:8+random()*18;
    const ang=random()*Math.PI,dx=Math.cos(ang),dy=Math.sin(ang),amp=(random()<.5?-1:1)*(fine?.18+random()*.2:.4+random()*.9)*w/8;
    const bend=(random()-.5)*.004,r=Math.ceil(len/2+w*3);
    for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){
      const s=ox*dx+oy*dy,q=-ox*dy+oy*dx-bend*s*s;
      if(Math.abs(s)>len/2||Math.abs(q)>w*3)continue;
      const taper=Math.sin(Math.PI*(s/len+.5));
      H[at(Math.round(cx+ox),Math.round(cy+oy))]+=amp*taper*taper*Math.exp(-(q*q)/(w*w));
    }
  }
  const color=new Uint8ClampedArray(N*N*4),normal=new Uint8ClampedArray(N*N*4);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,gx=(H[at(x+1,y)]-H[at(x-1,y)])*.55,gy=(H[at(x,y+1)]-H[at(x,y-1)])*.55,l=Math.hypot(gx,gy,1);
    normal.set([(-gx/l*.5+.5)*255,(gy/l*.5+.5)*255,(1/l*.5+.5)*255,255],i*4);
    const v=Math.max(0,Math.min(255,236*(1+C[i]+H[i]*.012)));
    color.set([v,v*.995,v*.985,255],i*4);
  }
  return {size:N,color,normal};
}

const PIXELS={linen:()=>bedPixels('linen'),sheet:()=>bedPixels('sheet'),waffle:()=>bedPixels('waffle'),'ninas-linen':ninasLinenPixels};
export const CLOTH_KINDS=Object.keys(PIXELS);
export function clothPixels(kind){return PIXELS[kind]();}
