// Room module: vestidor. Owned by this room's builder; see rooms.mjs for ctx.
// Use ctx.THREE (never a second copy of three), ctx.group for new objects, and keep
// edits inside this room's zone (scripts/rooms/vestidor.json).
//
// Render 6: glazed oak wardrobes lit from above by the LED strip under each shelf.
// - Hanging clothes: thin open-hemmed garments (about 700 triangles each, merged per
//   fabric) draped over oak hangers whose middle and brass hook show above the collar;
//   sleeves hang apart from the body with a cuff seam. Folds, plackets, buttons, lapels
//   and knit ribs are drawn in the shader with pixel-wide antialiased lines (no
//   photographed detail map, which blurred at distance); vertex colours carry each
//   garment's colour, the overlap shadow between neighbours and the LED light.
// - Folded stacks on the upper shelves replace the exported round "pillows" (26.000
//   triangles), with contact shadows on the shelf.
// - Wardrobe interiors: warm gradient down from each strip, darker shelf undersides,
//   contact lines, and the clothes' shadow on the back panel and the drawer tops.
// - Glass doors: bronze tint; the sharp reflection of the other glazed fronts (warm
//   interiors, LED lines, frames) is traced in the shader with Fresnel per face.
// - Frames, rails and handles in satin champagne bronze.
// - Contact shadow on the floor along the wardrobe bases.

const ROD_Y=1.762;   // centre of the 14 mm bronze rails (house.bin)
const STRIP_Y=1.835, TOP_STRIP_Y=2.125;   // LED strips under the shelf and the top
// Rails per bay: fixed coordinate, [from, to] along the rail, outward normal of the
// wardrobe front, rail direction towards the main view, turn on the hook, garments.
const BAYS=[
  ...[[-5.626,-5.044],[-4.984,-4.402]].map(s=>({axis:'z',at:.570,span:s,out:[1,0],dir:[0,1],turn:58,n:3,narrow:true})),
  ...[[-4.342,-3.756],[-3.696,-3.109],[-3.049,-2.463],[-2.403,-1.816]].map(s=>({axis:'z',at:.417,span:s,out:[1,0],dir:[0,1],turn:40,n:5})),
  ...[[1.657,2.250],[2.310,2.904],[2.964,3.558]].map(s=>({axis:'x',at:-5.366,span:s,out:[0,1],dir:[1,0],turn:40,n:5})),
  ...[[-2.696,-2.286,4.563],[-2.226,-1.816,4.563],[-1.656,-1.246,4.548],[-1.186,-.776,4.548]].map(s=>({axis:'z',at:s[2],span:[s[0],s[1]],out:[-1,0],dir:[0,-1],turn:40,n:4})),
];
// Upper shelves (top at 1.864): footprint of the exported stacks per bay
// [along-front from, to], [depth from, to] (world), outward normal.
const SHELVES=[
  ...[[-4.265,-3.833],[-3.618,-3.187],[-2.972,-2.540],[-2.325,-1.894]].map(s=>({axis:'z',along:s,depth:[.201,.609],out:[1,0]})),
  ...[[-5.549,-5.121],[-4.907,-4.479]].map(s=>({axis:'z',along:s,depth:[.462,.666],out:[1,0]})),
  ...[[1.735,2.172],[2.389,2.825],[3.043,3.479]].map(s=>({axis:'x',along:s,depth:[-5.582,-5.174],out:[0,1]})),
  ...[[-2.646,-2.336],[-2.176,-1.866],[-1.606,-1.296],[-1.136,-.826]].map(s=>({axis:'z',along:s,depth:[4.416,4.712],out:[-1,0]})),
];
const SHELF_Y=1.864;
// Render 6 palette (sRGB).
const COLORS={white:'#eeeae3',ivory:'#ddd4c4',ecru:'#c3ae90',sand:'#a28a6c',greige:'#86776a',taupe:'#66553f',olive:'#59543f',brown:'#45362a',umber:'#2c241d'};
// Per bay, in hanging order: [type, colour].
const SETS=[
  [['shirt','white'],['jacket','brown'],['shirt','ivory'],['knit','olive'],['shirt','white']],
  [['jacket','umber'],['shirt','white'],['shirt','greige'],['coat','sand'],['shirt','ivory']],
  [['shirt','ecru'],['knit','brown'],['shirt','white'],['jacket','taupe'],['shirt','umber']],
  [['coat','taupe'],['shirt','white'],['jacket','olive'],['shirt','ivory'],['knit','brown']],
];
const STACK_COLORS=['white','ivory','ecru','white','greige','ivory','sand','white'];
// Wardrobe interiors (behind the glass) and their fronts.
const INTERIORS=[[[.10,.05,-5.67],[.715,2.17,-1.78]],[[1.60,.05,-5.70],[3.61,2.17,-5.068]],[[4.345,.05,-2.74],[4.85,2.17,-.74]]];
const ZONE=[[[0,-.2,-5.9],[4.4,3.2,-4.15]],[[0,-.2,-4.15],[.75,3.2,-1.79]],[[4.3,-.2,-4.15],[4.85,3.2,-.2]],[[4.4,-.2,-4.75],[4.85,3.2,-4.15]]];
// Floor contact strips: centre line on the wardrobe base, [from, to], outward normal.
const BASES=[{axis:'z',at:.727,span:[-5.65,-1.79],out:[1,0]},{axis:'x',at:-5.056,span:[1.62,3.60],out:[0,1]},{axis:'z',at:4.329,span:[-2.73,-.75],out:[-1,0]}];

export async function apply(ctx){
  const {THREE,group}=ctx;

  // --- Remove the exported shirts, their stick hangers and the shelf "pillows" -------
  const band=(y0,y1)=>ZONE.map(([a,b])=>[[a[0],y0,a[2]],[b[0],y1,b[2]]]);
  ctx.removeExported({material:['linen','fabric','sage'],region:'shared',box:band(.7,1.75)});
  ctx.removeExported({material:'wood',region:'shared',box:band(1.684,1.706)});
  ctx.removeExported({material:'linen',region:'shared',box:band(1.87,2.03)});

  let seed=20261015;
  const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

  // --- Geometry helpers ------------------------------------------------------------
  // A (rows x cols) grid; at(j,i) -> [position, uv, fold(vec4), ao]. The fold attribute
  // feeds the cloth shader: across-garment coordinate (m), distance below the shoulder
  // (m), phase, kind (0 back, 1 shirt front, 2 jacket front, 3 knit front, 4 sleeve,
  // 5 plain).
  const grid=(rows,cols,at,{wrap=true,capEnd=false,capStart=false}={})=>{
    const pos=[],uv=[],fold=[],ao=[],idx=[];
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const [p,t,f,a]=at(j,i);pos.push(p.x,p.y,p.z);uv.push(t[0],t[1]);fold.push(...f);ao.push(a);}
    const cw=wrap?cols:cols-1;
    for(let j=0;j<rows-1;j++)for(let i=0;i<cw;i++){
      const a=j*cols+i,b=j*cols+(i+1)%cols,c=(j+1)*cols+(i+1)%cols,d=(j+1)*cols+i;
      idx.push(a,b,d,b,c,d);
    }
    const cap=(row,flip,shade)=>{
      const s=[0,0,0],f=[0,0,0,0];
      for(let i=0;i<cols;i++){const k=row*cols+i;for(let e=0;e<3;e++)s[e]+=pos[k*3+e];for(let e=0;e<4;e++)f[e]+=fold[k*4+e];}
      const k=pos.length/3;pos.push(s[0]/cols,s[1]/cols+(flip?.004:-.004),s[2]/cols);uv.push(0,0);fold.push(...f.map(v=>v/cols));ao.push(shade);
      for(let i=0;i<cols;i++){const a=row*cols+i,b=row*cols+(i+1)%cols;flip?idx.push(k,a,b):idx.push(k,b,a);}
    };
    if(capEnd)cap(rows-1,false,.55);if(capStart)cap(0,true,.8);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('clothFold',new THREE.Float32BufferAttribute(fold,4));
    g.setAttribute('ao',new THREE.Float32BufferAttribute(ao,1));
    g.setIndex(idx);g.computeVertexNormals();
    return g;
  };
  const spow=(v,e)=>Math.sign(v)*Math.abs(v)**e;

  // d: thickness (half) at the shoulders, chest and hem: hanging cloth is thin, the
  // hanger gives the shoulders their volume. The hem stays open (no closed "bag").
  const TYPES={
    shirt:{L:[.74,.80],W:.200,d:[.013,.020,.008],waist:.90,drop:.050,flare:.010,sleeve:.60,sr:[.040,.028],sz:.012,collar:true,front:1,fabric:'linen',hem:.045},
    jacket:{L:[.72,.77],W:.218,d:[.016,.032,.020],waist:.93,drop:.020,flare:.006,sleeve:.60,sr:[.046,.036],sz:.018,front:2,fabric:'linen',hem:0},
    knit:{L:[.60,.65],W:.196,d:[.013,.022,.012],waist:.88,drop:.064,flare:-.016,sleeve:.55,sr:[.042,.030],sz:.016,front:3,fabric:'fabric',hem:0},
    coat:{L:[.86,.90],W:.212,d:[.016,.036,.024],waist:.95,drop:.026,flare:.024,sleeve:.64,sr:[.050,.040],sz:.020,front:2,fabric:'linen',hem:0},
  };
  // Hanger: its centre line (local y below the rail centre), sloping to the tips like a
  // shoulder. The hook rises from its middle to the rail, so hanger and hook read.
  const HANG=.080,HANGER_H=.013,HANGER_D=.009;
  const hangerY=(x,W)=>-HANG-.040*Math.min(1,Math.abs(x)/(W-.012))**1.4;

  const garment=(type,narrow)=>{
    const T=TYPES[type],ph=rnd()*6.28,ph2=rnd()*6.28;
    const W=T.W*(narrow?.88:1)*(.97+rnd()*.06),L=T.L[0]+rnd()*(T.L[1]-T.L[0]);
    const yTop=-HANG+HANGER_H+.003,amp=type==='knit'?.004:.009;
    // Shoulder line: draped over the hanger (cloth just above its top edge), then falling
    // past its tips. The neck opening dips, deeper in front, so the middle of the hanger
    // and its hook show above the collar.
    const neck=x=>1-smooth(.058,.092,Math.abs(x));
    const yTip=hangerY(W,W)+HANGER_H+.003;
    const shoulderY=(x,front)=>Math.min(hangerY(x,W)+HANGER_H+.003,yTip-T.drop*Math.max(0,Math.abs(x)/W-.85)/.15)
      -neck(x)*(T.collar?(front?.022:.006):(front?.034:.014));
    const parts=[];
    // Body: a flattened open tube, thick only where the hanger fills the shoulders.
    const rows=13,cols=18;
    parts.push(grid(rows,cols,(j,i)=>{
      const v=(j/(rows-1))**1.2,f=i/cols*Math.PI*2,c=Math.cos(f),s=Math.sin(f);
      const w=W*(1-(1-T.waist)*Math.sin(Math.min(1,v*1.7)*Math.PI*.5))+T.flare*v*v;
      const d=v<.15?T.d[0]+(T.d[1]-T.d[0])*smooth(0,.15,v):T.d[1]+(T.d[2]-T.d[1])*smooth(.15,1,v);
      let x=w*spow(c,.6),z=d*spow(s,.85);
      // Drape: the whole sheet waves more towards the hem, the back a little less.
      z+=amp*v*(Math.sin(x*17+ph2)+.5*Math.sin(x*31+ph))*(s>0?1:.6);
      x+=c*Math.abs(c)*.006*v*Math.sin(v*9+ph);
      const yS=shoulderY(x,s>0);
      // Hem: shirt tails longer at the centre, a little uneven everywhere.
      const yH=yTop-L+T.hem*Math.abs(c)**1.5+.007*Math.sin(x*24+ph)+.004*Math.sin(x*53+ph2);
      const y=yS+(yH-yS)*v;
      // Local shade: side seams (where sleeves and neighbours overlap).
      const a=1-.30*smooth(.70,1,Math.abs(c))*Math.min(1,v*4);
      return [V(x,y,z+.004*v*v),[(f/(Math.PI*2))*2*(w+d),y],[x,yS-y,ph,s>.2?T.front:0],a];
    }));
    // Sleeves: from the shoulder point, hanging just outside the body, a little in front.
    for(const side of [-1,1]){
      const z0=(side>0?.008:-.004)+(rnd()-.5)*.008,len=T.sleeve*(.97+rnd()*.05),sy=shoulderY(W,false);
      const curve=new THREE.CatmullRomCurve3([
        V(side*(W-.030),sy+.002,z0*.3),
        V(side*(W+.010),sy-.06,z0),
        V(side*(W+.018),sy-.30,z0+.004),
        V(side*(W+.010+rnd()*.008),sy-len,z0+.010)]);
      const ph3=rnd()*6.28,rows2=8,cols2=7,P=curve.getSpacedPoints(rows2-1),Z=V(0,0,1);
      parts.push(grid(rows2,cols2,(j,i)=>{
        const t=j/(rows2-1),p=P[j],Tn=(j<rows2-1?P[j+1].clone().sub(p):p.clone().sub(P[j-1])).normalize();
        const a1=new THREE.Vector3().crossVectors(Tn,Z).normalize(),a2=new THREE.Vector3().crossVectors(a1,Tn).normalize();
        const cap=Math.min(1,.45+t*7),wob=1+.07*Math.sin(t*16+ph3);
        const rx=(T.sr[0]+(T.sr[1]-T.sr[0])*t)*cap*wob,rz=T.sz*cap*(1-.15*t),f=i/cols2*Math.PI*2;
        const q=p.clone().addScaledVector(a1,rx*Math.cos(f)).addScaledVector(a2,rz*Math.sin(f));
        // The side of the sleeve against the body is in its shadow: a dark crease
        // between sleeve and body.
        const inner=Math.max(0,-Math.cos(f)*Math.sign(a1.x*side||1));
        return [q,[i/cols2*.25,t*.6],[(1-t)*len,t*len,ph3,4],1-.45*inner];
      },{capEnd:true}));
    }
    // Shirt collar: a band round the neck, lower at the front.
    if(T.collar){
      parts.push(grid(3,12,(j,i)=>{
        const f=i/12*Math.PI*2,c=Math.cos(f),s=Math.sin(f),h=j/2,front=Math.max(0,s);
        const y=yTop-.014-.016*front+.022*h-.008*front*h;
        return [V(.058*c*(1+.10*h),y,(T.d[0]+.005)*s*(1+.20*h)),[f*.1,h*.03],[0,0,0,5],h<.5?.70:.92];
      }));
    }
    return {parts,W};
  };

  const hanger=W=>{
    const P=[-1,-.66,-.33,0,.33,.66,1].map(u=>V(u*(W-.012),hangerY(u*(W-.012),W),0));
    const curve=new THREE.CatmullRomCurve3(P),S=curve.getSpacedPoints(10);
    const pos=[],idx=[],cols=6;
    S.forEach((p,j)=>{
      const t=j/10,e=Math.abs(t*2-1),k=Math.min(1,(1-e)*12+.4),Tn=(j<10?S[j+1].clone().sub(p):p.clone().sub(S[j-1])).normalize();
      const a1=new THREE.Vector3().crossVectors(Tn,V(0,0,1)).normalize();
      for(let i=0;i<cols;i++){const f=i/cols*Math.PI*2;const q=p.clone().addScaledVector(a1,HANGER_H*(1-.2*e)*k*Math.cos(f)).add(V(0,0,HANGER_D*k*Math.sin(f)));pos.push(q.x,q.y,q.z);}
    });
    for(let j=0;j<10;j++)for(let i=0;i<cols;i++){const a=j*cols+i,b=j*cols+(i+1)%cols,c=(j+1)*cols+(i+1)%cols,d=(j+1)*cols+i;idx.push(a,b,d,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
  };
  // Hook over the rail, drawn in the plane across the rail (s = outward, y up): a neck
  // from the hanger to the rail, then the loop round the 14 mm rail.
  const hookCurve=new THREE.CatmullRomCurve3([[0,-HANG+HANGER_H*.5],[0,-.050],[0,-.026],[.006,-.015],[.0108,-.004],[.0092,.0065],[.003,.011],[-.004,.0106],[-.0096,.005],[-.0108,-.003],[-.0085,-.0095]].map(([s,y])=>V(0,y,s)));
  const hookGeo=new THREE.TubeGeometry(hookCurve,11,.0022,4,false);

  // --- Materials --------------------------------------------------------------------
  // One material per fabric: colour, overlap shade and LED light live in vertex colours.
  // No photographed detail map here: at 2-4 m its 20 cm slubs and loops read as melted,
  // blotchy cloth. The folds, seams, plackets and ribs are drawn in the shader, with
  // every line widened to at least a pixel (fwidth) so they stay crisp, never shimmer.
  const clothMat=kind=>{
    const m=ctx.cloneMaterial(ctx.mats[kind]);m.color.set('#ffffff');m.vertexColors=true;
    m.map=null;m.normalMap=null;m.sheen=.18;m.roughness=kind==='fabric'?.92:.80;
    const prior=m.onBeforeCompile,priorKey=m.customProgramCacheKey.bind(m),key=priorKey();
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.vertexShader='attribute vec4 clothFold;\nattribute vec3 clothAcross;\nvarying vec4 vClothFold;\nvarying vec3 vClothAcross;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvClothFold=clothFold;vClothAcross=normalize((viewMatrix*modelMatrix*vec4(clothAcross,0.0)).xyz);');
      shader.fragmentShader='varying vec4 vClothFold;\nvarying vec3 vClothAcross;\n'+
        // Antialiased line of half width w at distance d (at least about a pixel wide,
        // fading as it gets thinner than that).
        'float clothLine(float d,float w){float fw=max(fwidth(d),1e-5);return (1.0-smoothstep(w,w+fw*1.5,d))*min(1.0,w/fw*1.6);}\n'+
        shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        {float cu=vClothFold.x,cv=vClothFold.y,cph=vClothFold.z;int ck=int(vClothFold.w+.5);
        if(ck<5){
          // Vertical folds that deepen towards the hem; sleeves crease across.
          float grow=clamp(.3+cv/.28,.3,1.0);
          float p1=cu*41.0+cph+cv*2.2,p2=cu*83.0+cph*1.7-cv*3.1,p3=cu*19.0+cph*.6+cv*.8;
          float h=(sin(p1)*.55+sin(p2)*.2+sin(p3)*.75)*grow;
          float dh=(cos(p1)*22.6+cos(p2)*16.6+cos(p3)*14.3)*grow;
          if(ck==4){h=(sin(cv*41.0+cph)*.6+sin(cv*17.0+cph*2.0)*.4)*.7;dh=0.0;}
          normal=normalize(normal-vClothAcross*dh*(ck==3?.005:.010));
          diffuseColor.rgb*=.52+.53*smoothstep(-1.3,1.1,h);
          if(ck==4){
            // Cuff: a seam 6 cm from the end, the cuff band a touch lighter.
            diffuseColor.rgb*=1.0-.32*clothLine(abs(cu-.062),.0025);
            if(cu<.062)diffuseColor.rgb*=1.06;
          }
          if(ck==1){
            // Shirt placket edges and buttons.
            diffuseColor.rgb*=1.0-.28*clothLine(abs(abs(cu)-.016),.0015);
            vec2 bq=vec2(cu,mod(cv+.02,.085)-.0425);
            diffuseColor.rgb*=1.0-.30*clothLine(length(bq),.0035)*step(.03,cv);
          }
          if(ck==2){
            // Jacket lapels opening into the front edge.
            float lap=.030+.085*clamp(cv/.30,0.0,1.0);
            float line=cv<.30?abs(abs(cu)-lap):abs(cu);
            diffuseColor.rgb*=1.0-.40*clothLine(line,.0025);
            if(cv<.30&&abs(cu)<lap)diffuseColor.rgb*=.72;
            diffuseColor.rgb*=1.0-.3*clothLine(length(vec2(cu,cv-.40)),.006);
          }
          if(ck==3){
            // Knit: fine vertical ribs (faded out when finer than a pixel), ribbed hem.
            float rib=sin(cu*700.0);float fr=fwidth(cu*700.0);
            diffuseColor.rgb*=1.0-.07*(.5+.5*rib)*(1.0-smoothstep(.8,2.5,fr));
          }
        }}`);
    };
    m.customProgramCacheKey=()=>key+'|vestidor-cloth7';
    m.needsUpdate=true;
    return m;
  };
  const cloth={linen:{m:clothMat('linen'),geos:[]},fabric:{m:clothMat('fabric'),geos:[]}};
  const woodMat=new THREE.MeshStandardMaterial({color:'#b98d5c',roughness:.42});
  const brass=new THREE.MeshStandardMaterial({color:'#d2b07a',metalness:1,roughness:.22});
  const woodGeos=[],brassGeos=[];
  const up=V(0,1,0);

  // Vertex colours: linear colour x local shade x neighbours x LED light from the strip
  // at the wardrobe front (bright shoulders turned to it, darker hems and backs).
  const paint=(g,color,{front=null,first=true,last=true,centre,out,stripY=STRIP_Y,across})=>{
    const lin=new THREE.Color(COLORS[color]),p=g.getAttribute('position'),n=g.getAttribute('normal'),a=g.getAttribute('ao');
    const col=new Float32Array(p.count*3),ledDir=out.clone().multiplyScalar(.6).add(V(0,.8,0)).normalize();
    for(let i=0;i<p.count;i++){
      let s=a?a.getX(i):1;
      if(front){
        const nf=n.getX(i)*front.x+n.getZ(i)*front.z;
        if(nf>0&&!last)s*=1-.68*nf;
        if(nf<0&&!first)s*=1+.62*nf;
      }
      const depth=((p.getX(i)-centre.x)*out.x+(p.getZ(i)-centre.z)*out.z)/.22;
      s*=.80+.20*Math.min(1,Math.max(0,depth*.5+.5));
      const lf=Math.exp(-Math.max(0,stripY-p.getY(i))/.42);
      const fac=Math.min(1,Math.max(0,.5+.5*(n.getX(i)*ledDir.x+n.getY(i)*ledDir.y+n.getZ(i)*ledDir.z)));
      s*=.62+.62*lf*(.45+.55*fac);
      col[i*3]=lin.r*s;col[i*3+1]=lin.g*s;col[i*3+2]=lin.b*s;
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    const ac=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){ac[i*3]=across.x;ac[i*3+1]=across.y;ac[i*3+2]=across.z;}
    g.setAttribute('clothAcross',new THREE.BufferAttribute(ac,3));
  };

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
      const X=new THREE.Vector3().crossVectors(up,front).normalize();
      // Garments hang a touch off vertical, and the hook swivels to the rail.
      const tilt=new THREE.Matrix4().makeRotationAxis(X,(rnd()-.5)*.03);
      const basis=new THREE.Matrix4().makeBasis(X,up,front).premultiply(tilt).setPosition(c);
      const {parts,W}=garment(type,bay.narrow);
      for(const g of parts){
        g.applyMatrix4(basis);
        paint(g,color,{front,first:k===0,last:k===bay.n-1,centre:c,out,across:X});
        cloth[TYPES[type].fabric].geos.push(g);
      }
      const h=hanger(W);h.applyMatrix4(basis);woodGeos.push(h);
      const hb=new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up,out),up,out).setPosition(c);
      const hk=hookGeo.clone();hk.applyMatrix4(hb);brassGeos.push(hk);
    });
  }

  // --- Folded stacks on the upper shelves ------------------------------------------
  // Each piece: a slab with a rounded fold at the front, extruded across its width.
  const folded=(w,d,h,sag)=>{
    const prof=[[-d/2+.006,0],[d/2-h/2,0]];
    for(let k=1;k<6;k++){const a=-Math.PI/2+k*Math.PI/6;prof.push([d/2-h/2+h/2*Math.cos(a)*1.05,h/2+h/2*Math.sin(a)]);}
    prof.push([d/2-h/2,h],[-d/2+.006,h-.002],[-d/2,h*.5]);
    const n=prof.length,rings=[-1,0,1],pos=[],fold=[],uv=[],ao=[],idx=[];
    // The middle ring puffs up a little (soft cloth), the ends stay crisp.
    for(const r of rings)for(const [pd,ph] of prof){
      pos.push(r*w/2,ph+(r===0&&ph>h*.6?sag:0),pd+(r===0?.004:0));fold.push(0,0,0,5);uv.push(r*w*.8,(pd+ph)*1.6);
      ao.push(ph<.002?.72:ph>h-.003?1.0:.9);
    }
    for(let j=0;j<2;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n,c=(j+1)*n+(i+1)%n,e=(j+1)*n+i;idx.push(a,b,e,b,c,e);}
    // End caps with their own vertices (crisp folded edges).
    for(const r of [-1,1]){
      const base=pos.length/3;
      for(const [pd,ph] of prof){pos.push(r*w/2,ph,pd);fold.push(0,0,0,5);uv.push(pd*1.6,ph*1.6);ao.push(ph<.002?.7:.86);}
      const cIdx=pos.length/3;pos.push(r*w/2,h/2,0);fold.push(0,0,0,5);uv.push(0,0);ao.push(.8);
      for(let i=0;i<n;i++){const a=base+i,b=base+(i+1)%n;r>0?idx.push(cIdx,a,b):idx.push(cIdx,b,a);}
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('clothFold',new THREE.Float32BufferAttribute(fold,4));g.setAttribute('ao',new THREE.Float32BufferAttribute(ao,1));
    g.setIndex(idx);g.computeVertexNormals();return g;
  };
  const shadowQuads={shelf:[],floor:[]};
  const quad=(list,centre,a,b)=>list.push([centre,a,b]);   // a, b: half extents (vectors)
  let ci=0;
  for(const s of SHELVES){
    const out=V(s.out[0],0,s.out[1]);
    const aw=s.along[1]-s.along[0],dw=Math.abs(s.depth[1]-s.depth[0]);
    const nStacks=aw>.38?2:1,gap=.03,sw=(aw-.02-gap*(nStacks-1))/nStacks;
    const dc=(s.depth[0]+s.depth[1])/2,sd=Math.min(.30,dw-.01);
    for(let k=0;k<nStacks;k++){
      const ac=s.along[0]+.01+sw/2+k*(sw+gap)+(rnd()-.5)*.01;
      const centre=s.axis==='z'?V(dc,SHELF_Y,ac):V(ac,SHELF_Y,dc);
      centre.addScaledVector(out,(dw-sd)/2-.004);
      const Z=out.clone(),X=new THREE.Vector3().crossVectors(up,Z);
      let y=SHELF_Y;const items=3+(rnd()<.5?1:0);
      for(let it=0;it<items;it++){
        const h=.030+rnd()*.010,w=sw*(.94+rnd()*.05),d=sd*(.93+rnd()*.06);
        const g=folded(w,d,h,.002+rnd()*.002);
        const yaw=(rnd()-.5)*.05,off=(rnd()-.5)*.012;
        const m=new THREE.Matrix4().makeBasis(X,up,Z).multiply(new THREE.Matrix4().makeRotationY(yaw));
        m.setPosition(centre.clone().addScaledVector(X,off).addScaledVector(Z,(rnd()-.5)*.01).setY(y));
        g.applyMatrix4(m);
        paint(g,STACK_COLORS[ci++%STACK_COLORS.length],{centre,out,stripY:TOP_STRIP_Y,across:X});
        cloth.linen.geos.push(g);y+=h;
      }
      quad(shadowQuads.shelf,centre.clone().setY(SHELF_Y+.0012),X.clone().multiplyScalar(sw/2+.03),Z.clone().multiplyScalar(sd/2+.03));
    }
  }
  for(const b of BASES){
    const out=V(b.out[0],0,b.out[1]),mid=(b.span[0]+b.span[1])/2,half=(b.span[1]-b.span[0])/2+.05;
    const centre=b.axis==='z'?V(b.at,.0015,mid):V(mid,.0015,b.at);
    const along=b.axis==='z'?V(0,0,1):V(1,0,0);
    quad(shadowQuads.floor,centre,along.multiplyScalar(half),out.multiplyScalar(.13));
  }

  // Merge per material: a handful of draw calls for the whole room.
  const merge=(geos,names)=>{
    let nv=0,ni=0;for(const g of geos){nv+=g.getAttribute('position').count;ni+=g.index.count;}
    const arrays={},sizes={};
    for(const n of names){sizes[n]=geos[0].getAttribute(n).itemSize;arrays[n]=new Float32Array(nv*sizes[n]);}
    const idx=new Uint32Array(ni);let ov=0,oi=0;
    for(const g of geos){
      for(const n of names)arrays[n].set(g.getAttribute(n).array,ov*sizes[n]);
      const ix=g.index;for(let i=0;i<ix.count;i++)idx[oi+i]=ix.getX(i)+ov;
      ov+=g.getAttribute('position').count;oi+=ix.count;g.dispose();
    }
    const m=new THREE.BufferGeometry();
    for(const n of names)m.setAttribute(n,new THREE.BufferAttribute(arrays[n],sizes[n]));
    m.setIndex(new THREE.BufferAttribute(idx,1));m.computeBoundingSphere();return m;
  };
  const add=(name,geo,mat,lit=true)=>{
    const o=new THREE.Mesh(geo,mat);o.name=name;o.castShadow=false;o.receiveShadow=lit;
    group.add(o);if(lit)ctx.lightRuntimeObject(o);return o;
  };
  for(const [key,{m,geos}] of Object.entries(cloth))add('Vestidor ropa '+key,merge(geos,['position','normal','uv','color','clothFold','clothAcross']),m);
  add('Vestidor perchas roble',merge(woodGeos,['position','normal']),woodMat);
  add('Vestidor ganchos laton',merge(brassGeos,['position','normal']),brass);
  hookGeo.dispose();

  // --- Contact shadows (multiplied over what is already drawn) ----------------------
  const falloff=(strength,plateau)=>{
    const N=64,data=new Uint8Array(N*N*4);
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const ex=Math.min(i+.5,N-i-.5)/(N/2),ey=Math.min(j+.5,N-j-.5)/(N/2);
      const v=1-strength*smooth(0,plateau,ex)*smooth(0,plateau,ey);
      data.set([v*255,v*255,v*255,255],(j*N+i)*4);
    }
    const t=new THREE.DataTexture(data,N,N);t.magFilter=t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
  };
  const multiply=map=>new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.ZeroFactor,blendDst:THREE.SrcColorFactor,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const quadsGeo=list=>{
    const pos=[],uv=[],idx=[];
    list.forEach(([c,a,b],k)=>{
      for(const [s,t] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=c.clone().addScaledVector(a,s).addScaledVector(b,t);pos.push(p.x,p.y,p.z);uv.push((s+1)/2,(t+1)/2);}
      idx.push(k*4,k*4+1,k*4+2,k*4,k*4+2,k*4+3);
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeBoundingSphere();return g;
  };
  const shelfShadow=multiply(falloff(.55,.55));shelfShadow.side=THREE.DoubleSide;
  add('Vestidor sombra baldas',quadsGeo(shadowQuads.shelf),shelfShadow,false);
  const floorShadow=multiply(falloff(.55,.9));floorShadow.side=THREE.DoubleSide;
  add('Vestidor sombra zocalo',quadsGeo(shadowQuads.floor),floorShadow,false);

  // --- Wardrobe interiors: the strips light them from above -------------------------
  for(const piece of ctx.splitExported({material:'wood',region:'shared',box:INTERIORS})){
    const m=piece.material,prior=m.onBeforeCompile,key=m.customProgramCacheKey.call(m);
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        {vec3 vp=houseWorld,vn=normalize(houseNormal);
        float upper=step(1.852,vp.y),hang=smoothstep(.505,.53,vp.y)*(1.0-upper),inside=max(hang,upper);
        float L=upper>.5?exp(-max(0.0,${TOP_STRIP_Y.toFixed(3)}-vp.y)/.20):exp(-max(0.0,${STRIP_Y.toFixed(3)}-vp.y)/.40);
        float f=mix(.94,mix(.70,1.55,L),inside);
        f*=vn.y<-.5?.70:1.0;
        float vert=1.0-abs(vn.y);
        f*=1.0-vert*(.34*exp(-max(0.0,vp.y-.514)/.035)*hang+.28*exp(-max(0.0,vp.y-1.864)/.03)*upper);
        // The hanging clothes shade the back panel below their shoulders.
        vec3 vo=vp.x<1.0?vec3(1.0,0.0,0.0):(vp.x>4.0?vec3(-1.0,0.0,0.0):vec3(0.0,0.0,1.0));
        float backP=step(.8,dot(vn,vo))*hang*step(vp.y,1.80);
        f*=1.0-backP*.45*smoothstep(.80,.98,vp.y)*(1.0-smoothstep(1.58,1.71,vp.y));
        // ... and the top of the drawer unit below their hems.
        f*=1.0-.28*step(.5,vn.y)*hang*(1.0-smoothstep(.56,.66,vp.y));
        outgoingLight*=f*mix(vec3(1.0),vec3(1.06,.95,.80),L*inside);}
        #include <opaque_fragment>`);
    };
    m.customProgramCacheKey=()=>key+'|vestidor-interior7';
  }

  // --- Glass doors: bronze tint and the room reflected in them ----------------------
  // The room probe (128 px) only gives a soft wash, so the sharp part of the reflection
  // is traced here: the reflected ray is intersected with the three glazed fronts, which
  // show their warm interiors, the bright LED lines under the shelves and the door
  // frames. Physical Fresnel per face (4 % head on, more at grazing), so the far
  // wardrobe and its strips appear in the central one seen at an angle, and what is
  // behind each pane stays sharp, only tinted.
  const tint=new THREE.MeshBasicMaterial({color:new THREE.Color(.93,.875,.79),transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.ZeroFactor,blendDst:THREE.SrcColorFactor});
  const f3=v=>v.toFixed(3);
  const glassFns=`varying vec3 vestGlassW;varying vec3 vestGlassN;
    // A glazed front seen in reflection: along = coordinate along the front.
    float vestFront(float y,float along,float a0,float a1,float dw){
      if(along<a0||along>a1||y<.077||y>2.145)return 0.0;
      float L=y>1.864?exp(-max(0.0,${f3(TOP_STRIP_Y)}-y)/.20):(y>.53?exp(-max(0.0,${f3(STRIP_Y)}-y)/.40):0.0);
      float g=.16+1.5*L;
      // Hanging clothes: darker, uneven vertical stripes.
      float cl=smoothstep(.86,.92,y)*(1.0-smoothstep(1.64,1.70,y));
      g*=1.0-cl*(.35+.25*sin(along*61.0)*sin(along*23.0+1.3));
      // LED lines under the shelf and the top.
      float led=smoothstep(.022,.004,abs(y-${f3(STRIP_Y-.008)}))+smoothstep(.022,.004,abs(y-${f3(TOP_STRIP_Y-.008)}));
      // Door frames (dark bronze) at every door edge, top and bottom.
      float u=mod(along-a0,dw),fr=min(min(u,dw-u),min(y-.077,2.145-y));
      float frame=smoothstep(.014,.024,fr);
      return (g*frame+.22*(1.0-frame))+9.0*led*frame;
    }
    vec3 vestReflect(vec3 P,vec3 R){
      float best=1e3,val=0.0,t;vec3 H;
      t=(${f3(.723)}-P.x)/R.x;if(R.x<-.01&&t>.05&&t<best){H=P+R*t;float v=vestFront(H.y,H.z,-5.650,-1.792,.643);if(v>0.0){best=t;val=v;}}
      t=(${f3(-5.060)}-P.z)/R.z;if(R.z<-.01&&t>.05&&t<best){H=P+R*t;float v=vestFront(H.y,H.x,1.633,3.582,.6497);if(v>0.0){best=t;val=v;}}
      t=(${f3(4.333)}-P.x)/R.x;if(R.x>.01&&t>.05&&t<best){H=P+R*t;float v=vestFront(H.y,H.z,-2.720,-.752,.492);if(v>0.0){best=t;val=v;}}
      // Nothing glazed in that direction: the room's plaster, lit like the glass itself.
      return best<1e3?vec3(1.0,.80,.58)*val:vec3(.50,.46,.41);
    }
`;
  for(const piece of ctx.splitExported({material:'glass',region:'shared',box:ZONE})){
    const m=piece.material,prior=m.onBeforeCompile,key=m.customProgramCacheKey.call(m);
    m.opacity=.04;m.color.set('#5c4733');
    m.onBeforeCompile=(shader,r)=>{
      prior.call(m,shader,r);
      shader.vertexShader='varying vec3 vestGlassW;varying vec3 vestGlassN;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvestGlassW=(modelMatrix*vec4(transformed,1.0)).xyz;vestGlassN=normalize(mat3(modelMatrix)*objectNormal);');
      const before=shader.fragmentShader;
      shader.fragmentShader=glassFns+shader.fragmentShader.replace('totalSpecular*.6',
        `totalSpecular*.40+vestRefl`).replace('{float glassNV=',`
        vec3 vestV=normalize(vestGlassW-cameraPosition),vestN=normalize(vestGlassN);
        if(dot(vestN,vestV)>0.0)vestN=-vestN;
        float vestF=.04+.96*pow(1.0-saturate(-dot(vestN,vestV)),5.0);
        // Radiance unit: a lit surface at this spot (the baked irradiance).
        float vestE=max(dot(iblIrradiance,vec3(.2126,.7152,.0722))*RECIPROCAL_PI,.02);
        vec3 vestRefl=vestReflect(vestGlassW,reflect(vestV,vestN))*vestF*vestE;
        {float glassNV=`);
      if(before.indexOf('totalSpecular*.6')<0||before.indexOf('{float glassNV=')<0)console.warn('[rooms/vestidor] glass shader hook not found');
    };
    m.customProgramCacheKey=()=>key+'|vestidor-glass7';
    const t=new THREE.Mesh(piece.geometry,tint);t.name='Vestidor vidrio bronce';t.castShadow=false;group.add(t);
  }

  // --- Door frames, rails and handles: satin champagne bronze -----------------------
  // The render's frames catch the light along their edges; the dark brown flat finish
  // read as painted wood. A satin metal takes the room probe's reflections.
  for(const piece of ctx.splitExported({material:'bronze',region:'shared',box:ZONE})){
    const m=piece.material;m.color.set('#a3815a');m.metalness=.75;m.roughness=.28;m.needsUpdate=true;
  }
}
