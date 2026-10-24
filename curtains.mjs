// Curtains that open and close (E, like a door). Each panel hangs from a fixed end of the
// track (the anchor) and slides toward the other end; the cloth keeps its length, so the
// folds spread into soft waves when drawn and bunch into a deep stack when gathered.
//
//   createCurtain(THREE,{name,material,z,y0,y1,panels:[{anchor,dir,open,closed}]})
//
// Every panel is a ripple-fold sheet along x at depth z, from y0 to y1. `anchor` is the x
// of the fixed end, `dir` (+1/-1) the way the panel extends from it, `open` and `closed`
// its width gathered and drawn. The pleat count is fixed per panel (closed width / pitch);
// at width W the wavelength is W / pleats and the amplitude is the one that keeps the
// length of cloth of a closed pleat (pitch with amplitude `depth`).
// Returns {name,t,goal,meshes,set(t)}; t = 1 gathered (open), 0 drawn (closed). Meshes carry
// userData.curtain, so the first-person ray finds them like a door.

const TAU=Math.PI*2;

// Arc length of one period of a sine of amplitude g * wavelength, over the wavelength.
function arcRatio(g){
  let s=0;const n=48;
  for(let i=0;i<n;i++)s+=Math.hypot(1,TAU*g*Math.cos((i+.5)/n*TAU));
  return s/n;
}
// Amplitude / wavelength that gives a cloth length of `ratio` wavelengths (1 = flat).
function amplitudeFor(ratio){
  if(ratio<=1)return 0;
  let lo=0,hi=4;
  for(let i=0;i<28;i++){const mid=(lo+hi)/2;if(arcRatio(mid)<ratio)lo=mid;else hi=mid;}
  return (lo+hi)/2;
}

// Smooth 1-D value noise in [-1, 1].
function noise1(seed){
  const h=i=>{let k=Math.imul(i,374761393)+Math.imul(seed,668265263)|0;k=Math.imul(k^(k>>>13),1274126177);return ((k^(k>>>16))>>>0)/2147483648-1;};
  return x=>{const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return h(i)*(1-u)+h(i+1)*u;};
}

// Heights of the sample rows above y0 (denser at the hem and under the track).
const ROWS=[0,.012,.05,.088,.095,.16,.3,.5,.75,1.0,1.3,1.6,1.9,2.15,2.35,2.47];

function buildPanel(THREE,{anchor,dir,open,closed},{z,y0,y1,pitch,depth,segments,seed}){
  const n=noise1(seed),pleats=Math.max(2,Math.round(closed/pitch)),cols=pleats*segments;
  const rows=ROWS.map(v=>y0+v).filter(y=>y<y1-.03);rows.push(y1);
  const H=y1-y0,W=cols+1;
  // Fabric coordinate s (distance from the anchor along the closed panel) of each column;
  // columns run left to right in the world so the winding is the same for both sides.
  const sOf=i=>dir>0?i/cols:1-i/cols;
  // Uneven wavelength: cumulative phase along the cloth, scaled to exactly `pleats` folds.
  const phase=new Float32Array(W),raw=new Float32Array(W);
  for(let k=1;k<=cols;k++){
    const s=k/cols,xs=anchor+dir*closed*s,lam=pitch*(1+.30*n(xs*4.1)+.14*n(xs*13+3));
    raw[k]=raw[k-1]+TAU*(closed/cols)/lam;
  }
  for(let i=0;i<W;i++){const k=dir>0?i:cols-i;phase[i]=raw[k]*TAU*pleats/raw[cols];}
  const fold=pitch*arcRatio(depth/pitch);          // cloth in one closed pleat
  const J=rows.length,pos=new Float32Array(J*W*3),uv=new Float32Array(J*W*2),col=new Float32Array(J*W*3);
  const shift=new Float32Array(J*W),mod=new Float32Array(J*W),xs=new Float32Array(W);
  for(let i=0;i<W;i++)xs[i]=anchor+dir*closed*sOf(i);
  for(let j=0;j<J;j++){
    const y=rows[j],h=(y-y0)/H,swing=1-h;
    for(let i=0;i<W;i++){
      const x=xs[i],p=j*W+i;
      // Pinned at the track, drifting and swinging fuller toward the hem; tighter under the track.
      shift[p]=1.3*swing*n(x*2.3+7)+.6*swing*n(x*7.7+1)+.35*n(x*3.1+y*.9);
      mod[p]=(.85+.35*n(x*5.3+11)+.12*n(x*9+y*1.7))*(1+.28*swing*swing)*(1-.45*Math.max(0,1-(y1-y)/.35)**2);
      uv[p*2]=x;uv[p*2+1]=y;
    }
  }
  const idx=[];
  for(let j=0;j<J-1;j++)for(let i=0;i<W-1;i++){const a=j*W+i,b=a+1,c=a+W,d=c+1;idx.push(a,b,d,a,d,c);}
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setIndex(idx);
  // e in [0,1]: 1 = gathered. Rewrites positions, vertex tone and normals.
  const update=e=>{
    const w=closed+(open-closed)*e,lam=w/pleats,amp=amplitudeFor(fold/lam)*lam;
    for(let j=0;j<J;j++){
      const y=rows[j];
      for(let i=0;i<W;i++){
        const p=j*W+i,f=phase[i]+shift[p],s1=Math.sin(f),dz=amp*mod[p]*(s1+.2*Math.sin(2*f+1.3+xs[i]*3));
        pos[p*3]=anchor+dir*w*sOf(i);pos[p*3+1]=j===0?y0+.004*(1-Math.cos(f)):y;pos[p*3+2]=z+dz;
        // The back of each fold is darker (the probes carry no occlusion at that scale).
        const ao=.88+.12*(s1*.5+.5);col[p*3]=col[p*3+1]=col[p*3+2]=ao;
      }
    }
    geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;
    geo.computeVertexNormals();geo.computeBoundingSphere();
  };
  return {geo,update};
}

export function createCurtain(THREE,{name,material,z,y0,y1,panels,pitch=.095,depth=.027,segments=12,seed=19,t=1}){
  const built=panels.map((p,k)=>buildPanel(THREE,p,{z,y0,y1,pitch,depth,segments,seed:seed+k*13}));
  const curtain={name,t,goal:t,meshes:[]};
  for(const [k,b] of built.entries()){
    const mesh=new THREE.Mesh(b.geo,material);
    mesh.name=`${name} ${k+1}`;mesh.userData.curtain=curtain;mesh.receiveShadow=true;mesh.castShadow=false;
    curtain.meshes.push(mesh);
  }
  // Same easing both ways; t is the travel, e the shape.
  curtain.set=v=>{curtain.t=v;const e=v*v*(3-2*v);for(const b of built)b.update(e);};
  curtain.set(t);
  return curtain;
}

// Electric roller blind (L01): a cassette under the ceiling, the fabric and a weighted
// bottom bar. t = 1 rolled up (open), 0 down to `bottom`. Same interface as a curtain
// ({name,t,goal,meshes,set}): E raises and lowers it.
//
//   createBlind(THREE,{name,fabric,metal,x0,x1,z,top,bottom,t})
//
// x0..x1 along the window wall at depth z (the fabric plane), the cassette's top at
// `top`. The fabric's UVs are in metres (u along x, v down from the roller).
export function createBlind(THREE,{name,fabric,metal,x0,x1,z,top,bottom,t=1}){
  const W=x1-x0,CASE=.085,roll=top-CASE+.012,blind={name,t,goal:t,meshes:[]};
  const cassette=new THREE.Mesh(new THREE.BoxGeometry(W+.03,CASE,CASE),metal);
  cassette.position.set((x0+x1)/2,top-CASE/2,z+.01);
  const pos=new Float32Array(12),uv=new Float32Array(8),geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setIndex([0,2,1,1,2,3]);
  const cloth=new THREE.Mesh(geo,fabric);
  const bar=new THREE.Mesh(new THREE.BoxGeometry(W-.01,.03,.018),metal);
  for(const [k,m] of [cassette,cloth,bar].entries()){m.name=`${name} ${['cajón','tejido','contrapeso'][k]}`;m.userData.curtain=blind;blind.meshes.push(m);}
  blind.set=v=>{
    blind.t=v;const e=v*v*(3-2*v),y=bottom+(roll-.03-bottom)*e;
    pos.set([x0,roll,z, x1,roll,z, x0,y,z, x1,y,z]);uv.set([0,0, W,0, 0,roll-y, W,roll-y]);
    geo.attributes.position.needsUpdate=geo.attributes.uv.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();
    cloth.visible=roll-y>.004;bar.position.set((x0+x1)/2,y-.015,z+.004);
  };
  blind.set(t);
  return blind;
}
