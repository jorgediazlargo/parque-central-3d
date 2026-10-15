// Room module: vestidor. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/vestidor.json).
//
// Render 6: the hanging clothes. The exported shirts (flat extruded outlines on two
// sticks) become soft garments on light oak shoulder hangers with brass hooks over
// the bronze rails: rounded shoulders, a body that flares and drapes in vertical
// folds, sleeves hanging at the sides, collars on the shirts. Colours from render 6:
// whites, ecru, greige, taupe and brown. Each garment is turned on its hook (as when
// pushed along the rail), so the nearest one shows its front, the rest their sleeves.
// The shallow west wardrobe (27 cm inside) turns them further so they fit.

const ROD_Y=1.762;   // centre of the 14 mm bronze rails (house.bin)
// Rails per bay: fixed coordinate, [from, to] along the rail, outward normal of the
// wardrobe front, rail direction towards the main view, turn on the hook, garments.
const BAYS=[
  ...[[-5.626,-5.044],[-4.984,-4.402]].map(s=>({axis:'z',at:.570,span:s,out:[1,0],dir:[0,1],turn:62,n:3,narrow:true})),
  ...[[-4.342,-3.756],[-3.696,-3.109],[-3.049,-2.463],[-2.403,-1.816]].map(s=>({axis:'z',at:.417,span:s,out:[1,0],dir:[0,1],turn:26,n:5})),
  ...[[1.657,2.250],[2.310,2.904],[2.964,3.558]].map(s=>({axis:'x',at:-5.366,span:s,out:[0,1],dir:[1,0],turn:26,n:5})),
  ...[[-2.696,-2.286,4.563],[-2.226,-1.816,4.563],[-1.656,-1.246,4.548],[-1.186,-.776,4.548]].map(s=>({axis:'z',at:s[2],span:[s[0],s[1]],out:[-1,0],dir:[0,-1],turn:32,n:4})),
];
// Render 6 palette (sRGB).
const COLORS={white:'#e6e0d6',ivory:'#d9cfbf',ecru:'#c4b39b',sand:'#a89178',greige:'#8c7a66',taupe:'#6c5a49',brown:'#4e3d30',umber:'#3c3027'};
// Per bay, in hanging order: [type, colour].
const SETS=[
  [['shirt','white'],['jacket','brown'],['shirt','taupe'],['knit','sand'],['shirt','ivory']],
  [['jacket','umber'],['shirt','white'],['shirt','greige'],['coat','taupe'],['shirt','ivory']],
  [['shirt','ecru'],['knit','brown'],['shirt','white'],['jacket','taupe'],['shirt','brown']],
  [['coat','sand'],['shirt','taupe'],['jacket','umber'],['shirt','white'],['knit','greige']],
];

export async function apply(ctx){
  const {THREE,group}=ctx;

  // --- Remove the exported shirts and their stick hangers --------------------------
  const zone=[[[0,.7,-5.9],[4.4,1.75,-4.15]],[[0,.7,-4.15],[.75,1.75,-1.79]],[[4.3,.7,-4.15],[4.85,1.75,-.2]],[[4.4,.7,-4.75],[4.85,1.75,-4.15]]];
  ctx.removeExported({material:['linen','fabric','sage'],region:'shared',box:zone});
  ctx.removeExported({material:'wood',region:'shared',box:zone.map(([a,b])=>[[a[0],1.684,a[2]],[b[0],1.706,b[2]]])});

  let seed=20261015;
  const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);

  // --- Geometry helpers (local frame: x across the shoulders, y up, z out of the front;
  // origin at the rail centre) -------------------------------------------------------
  const grid=(rows,cols,at,{wrap=true,capEnd=null,capStart=null}={})=>{
    const pos=[],uv=[],idx=[];
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const [p,t]=at(j,i);pos.push(p.x,p.y,p.z);uv.push(t[0],t[1]);}
    const cw=wrap?cols:cols-1;
    for(let j=0;j<rows-1;j++)for(let i=0;i<cw;i++){
      const a=j*cols+i,b=j*cols+(i+1)%cols,c=(j+1)*cols+(i+1)%cols,d=(j+1)*cols+i;
      idx.push(a,b,d,b,c,d);
    }
    const cap=(row,flip)=>{
      let cx=0,cy=0,cz=0;for(let i=0;i<cols;i++){cx+=pos[(row*cols+i)*3];cy+=pos[(row*cols+i)*3+1];cz+=pos[(row*cols+i)*3+2];}
      const k=pos.length/3;pos.push(cx/cols,cy/cols+(flip?.004:-.004),cz/cols);uv.push(0,0);
      for(let i=0;i<cols;i++){const a=row*cols+i,b=row*cols+(i+1)%cols;flip?idx.push(k,a,b):idx.push(k,b,a);}
    };
    if(capEnd)cap(rows-1,false);if(capStart)cap(0,true);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeVertexNormals();
    return g;
  };
  const spow=(v,e)=>Math.sign(v)*Math.abs(v)**e;

  // Sweep an elliptical section along a curve: section(t) -> [rx, rz] (rx in the plane
  // of the garment, rz towards its front).
  const sweep=(curve,rows,cols,section,{capEnd=true,capStart=false}={})=>{
    const P=curve.getSpacedPoints(rows-1),Z=V(0,0,1);
    return grid(rows,cols,(j,i)=>{
      const t=j/(rows-1),p=P[j],T=(j<rows-1?P[j+1].clone().sub(p):p.clone().sub(P[j-1])).normalize();
      const a1=new THREE.Vector3().crossVectors(T,Z).normalize(),a2=new THREE.Vector3().crossVectors(a1,T).normalize();
      const [rx,rz]=section(t),f=i/cols*Math.PI*2;
      return [p.clone().addScaledVector(a1,rx*Math.cos(f)).addScaledVector(a2,rz*Math.sin(f)),[i/cols*.25,t*.6]];
    },{capEnd,capStart});
  };

  const TYPES={
    shirt:{L:[.74,.80],W:.205,D:.032,drop:.050,flare:.012,sleeve:.60,sr:[.050,.033],sz:.016,collar:true,fabric:'linen'},
    jacket:{L:[.74,.78],W:.220,D:.048,drop:.030,flare:.006,sleeve:.60,sr:[.058,.042],sz:.024,collar:false,fabric:'linen',lapel:true},
    knit:{L:[.62,.66],W:.200,D:.040,drop:.070,flare:-.012,sleeve:.55,sr:[.050,.036],sz:.026,collar:false,fabric:'fabric'},
    coat:{L:[.86,.90],W:.215,D:.050,drop:.035,flare:.022,sleeve:.64,sr:[.060,.044],sz:.026,collar:false,fabric:'linen',lapel:true},
  };

  const garment=(type,narrow)=>{
    const T=TYPES[type],ph=rnd()*6.28,ph2=rnd()*6.28;
    const W=T.W*(narrow?.88:1)*(.97+rnd()*.06),L=T.L[0]+rnd()*(T.L[1]-T.L[0]),D=T.D;
    const yTop=-.071,amp=type==='knit'?.005:.009;
    const shoulderY=x=>yTop-T.drop*Math.min(1,Math.abs(x)/W)**1.6;
    const parts=[];
    // Body: a flattened tube, pinched shut along the shoulder line, vertical folds.
    const rows=19,cols=26;
    parts.push(grid(rows+1,cols,(j,i)=>{
      const v=(j/rows)**1.25,f=i/cols*Math.PI*2,c=Math.cos(f),s=Math.sin(f);
      const w=W*(1-.07*Math.sin(Math.min(1,v*1.6)*Math.PI*.5))+T.flare*v*v;
      const shoulder=Math.min(1,v/.11),d=Math.max(.002,D*Math.sqrt(1-(1-shoulder)**2)*(1-.3*v));
      let x=w*spow(c,.72),z=d*spow(s,.9);
      const fold=amp*(.25+v)*Math.sin(x*36+ph)+amp*.6*v*Math.sin(x*67+ph2)+amp*.8*v*v*Math.sin(x*17+ph2*.7);
      z+=Math.abs(s)**.5*Math.sign(s)*fold;
      x+=c*Math.abs(c)*amp*.5*v*Math.sin(v*11+ph);
      const yS=shoulderY(x),yH=yTop-L+.010*Math.sin(x*24+ph)+.006*Math.sin(x*53+ph2);
      return [V(x,yS+(yH-yS)*v,z+.006*v*v),[(f/(Math.PI*2))*2*(w+d)*1.6,yS+(yH-yS)*v]];
    },{capEnd:true}));
    // Sleeves: from the shoulder seam, hanging at the sides, a little in front.
    for(const side of [-1,1]){
      const z0=(side>0?.010:-.006)+(rnd()-.5)*.01,len=T.sleeve*(.97+rnd()*.05);
      const curve=new THREE.CatmullRomCurve3([
        V(side*(W-.035),shoulderY(W)+.004,z0*.3),
        V(side*(W+.006),shoulderY(W)-.07,z0),
        V(side*(W+.016),yTop-.30,z0+.004),
        V(side*(W+.010+rnd()*.008),yTop-len,z0+.010)]);
      const ph3=rnd()*6.28;
      parts.push(sweep(curve,13,10,t=>{
        const cap=Math.min(1,.45+t*7),wob=1+.07*Math.sin(t*16+ph3);
        const r=(T.sr[0]+(T.sr[1]-T.sr[0])*t)*cap*wob;
        return [r,T.sz*cap*(1-.15*t)];
      },{capEnd:true}));
    }
    // Shirt collar: a band round the neck, lower at the front.
    if(T.collar){
      parts.push(grid(3,20,(j,i)=>{
        const f=i/20*Math.PI*2,c=Math.cos(f),s=Math.sin(f),h=j/2;
        const front=Math.max(0,s);
        return [V(.062*c*(1+.12*h),yTop-.004-.028*front+.026*h-.010*front*h,(D*.95+.004)*s*(1+.10*h)),[f*.1,h*.03]];
      },{}));
    }
    // Lapels on jackets and coats: two slim raised panels down the front.
    if(T.lapel){
      for(const side of [-1,1]){
        parts.push(grid(6,4,(j,i)=>{
          const t=j/5,x0=side*(.045+.06*t),x1=side*(.045+.06*t+.055*(1-t*.6));
          const x=i<2?x0:x1,lift=(i===0||i===3)?0:.004;
          const y=yTop-.02-t*.30,zf=D*(1-.3*((y-yTop)/-L))+.002+lift;
          return [V(x,y,zf),[x,y]];
        },{wrap:false}));
      }
    }
    return parts;
  };

  const hanger=W=>{
    const curve=new THREE.CatmullRomCurve3([-1,-.5,0,.5,1].map(u=>V(u*(W-.012),-.057-.032*Math.abs(u)**1.6,0)));
    return sweep(curve,15,8,t=>{const e=Math.abs(t*2-1),k=Math.min(1,(1-e)*14+.35);return [.0115*(1-.25*e)*k,.0058*k];},{capEnd:true,capStart:true});
  };
  // Hook over the rail, drawn in the plane across the rail (s = outward, y up).
  const hookCurve=new THREE.CatmullRomCurve3([[0,-.050],[0,-.030],[.006,-.016],[.0108,-.004],[.0092,.0065],[.003,.011],[-.004,.0106],[-.0096,.005],[-.0108,-.003],[-.0085,-.0095]].map(([s,y])=>V(0,y,s)));
  const hookGeo=new THREE.TubeGeometry(hookCurve,26,.0021,6,false);

  // --- Materials --------------------------------------------------------------------
  const cloth={};
  const clothMat=(kind,color)=>{
    const key=kind+color;if(cloth[key])return cloth[key];
    const m=ctx.cloneMaterial(ctx.mats[kind]);m.color.set(COLORS[color]);m.vertexColors=true;
    return cloth[key]={m,geos:[]};
  };
  const woodMat=new THREE.MeshStandardMaterial({color:'#c29a6e',roughness:.48});
  const brass=new THREE.MeshStandardMaterial({color:'#b79565',metalness:1,roughness:.32});
  const woodGeos=[],brassGeos=[];

  // --- Hang them -------------------------------------------------------------------
  let setIndex=0;
  for(const bay of BAYS){
    const set=SETS[setIndex++%SETS.length].slice(0,bay.n);
    const len=bay.span[1]-bay.span[0],mid=(bay.span[0]+bay.span[1])/2;
    const dir=V(bay.dir[0],0,bay.dir[1]),out=V(bay.out[0],0,bay.out[1]);
    const spacing=Math.min(.098,(len-.20-(bay.narrow?.12:0))/Math.max(1,bay.n-1));
    set.forEach(([type,color],k)=>{
      const along=mid+(k-(bay.n-1)/2)*spacing*(bay.dir[0]+bay.dir[1])+(rnd()-.5)*.012;
      const c=bay.axis==='z'?V(bay.at,ROD_Y,along):V(along,ROD_Y,bay.at);
      const turn=THREE.MathUtils.degToRad(bay.turn+(rnd()-.5)*8);
      const front=dir.clone().multiplyScalar(Math.cos(turn)).addScaledVector(out,Math.sin(turn)).normalize();
      const X=new THREE.Vector3().crossVectors(V(0,1,0),front).normalize();
      // Garments hang a touch off vertical, and the hook swivels to the rail.
      const tilt=new THREE.Matrix4().makeRotationAxis(X,(rnd()-.5)*.03);
      const basis=new THREE.Matrix4().makeBasis(X,V(0,1,0),front).premultiply(tilt).setPosition(c);
      const parts=garment(type,bay.narrow),mat=clothMat(TYPES[type].fabric,color);
      // Soft occlusion baked into vertex colours: faces turned to the next garment on
      // the rail, the back of the wardrobe and the crowded shoulders read darker.
      const first=k===0,last=k===bay.n-1;
      for(const g of parts){
        g.applyMatrix4(basis);
        const p=g.getAttribute('position'),n=g.getAttribute('normal'),col=new Float32Array(p.count*3);
        for(let i=0;i<p.count;i++){
          const nf=n.getX(i)*front.x+n.getZ(i)*front.z;
          let ao=1;
          if(nf>0&&!last)ao*=1-.5*nf;
          if(nf<0&&!first)ao*=1+.5*nf;
          const depth=((p.getX(i)-c.x)*out.x+(p.getZ(i)-c.z)*out.z)/.22;
          ao*=.80+.20*Math.min(1,Math.max(0,depth*.5+.5));
          ao*=.86+.14*Math.min(1,(ROD_Y-.09-p.getY(i))/.25);
          col[i*3]=col[i*3+1]=col[i*3+2]=ao;
        }
        g.setAttribute('color',new THREE.BufferAttribute(col,3));
        mat.geos.push(g);
      }
      const h=hanger(TYPES[type].W*(bay.narrow?.88:1));h.applyMatrix4(basis);woodGeos.push(h);
      const hb=new THREE.Matrix4().makeBasis(dir,V(0,1,0),out).setPosition(c);
      const hk=hookGeo.clone();hk.applyMatrix4(hb);brassGeos.push(hk);
    });
  }

  // Merge per material: a handful of draw calls for the whole room.
  const merge=geos=>{
    let nv=0,ni=0;for(const g of geos){nv+=g.getAttribute('position').count;ni+=g.index.count;}
    const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),uv=new Float32Array(nv*2),col=new Float32Array(nv*3).fill(1),idx=new Uint32Array(ni);
    let ov=0,oi=0;
    for(const g of geos){
      const p=g.getAttribute('position'),n=g.getAttribute('normal'),t=g.getAttribute('uv'),ix=g.index;
      pos.set(p.array,ov*3);nor.set(n.array,ov*3);uv.set(t.array,ov*2);if(g.getAttribute('color'))col.set(g.getAttribute('color').array,ov*3);
      for(let i=0;i<ix.count;i++)idx[oi+i]=ix.getX(i)+ov;
      ov+=p.count;oi+=ix.count;g.dispose();
    }
    const m=new THREE.BufferGeometry();
    m.setAttribute('position',new THREE.BufferAttribute(pos,3));m.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    m.setAttribute('uv',new THREE.BufferAttribute(uv,2));m.setAttribute('color',new THREE.BufferAttribute(col,3));m.setIndex(new THREE.BufferAttribute(idx,1));
    m.computeBoundingSphere();return m;
  };
  const add=(name,geos,mat)=>{
    const o=new THREE.Mesh(merge(geos),mat);o.name=name;o.castShadow=false;o.receiveShadow=true;
    group.add(o);ctx.lightRuntimeObject(o);
  };
  for(const [key,{m,geos}] of Object.entries(cloth))add('Vestidor prendas '+key,geos,m);
  add('Vestidor perchas roble',woodGeos,woodMat);
  add('Vestidor ganchos laton',brassGeos,brass);
  hookGeo.dispose();
}
