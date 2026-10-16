import * as THREE from './assets/three.module.js';
import {imageTexture} from './images.mjs?v=3b580fe40e';

// Upholstery, linen and rug surfaces shared by real-time and baked rooms, from
// photographed CC0 Poly Haven fabrics (scripts/derive_polyhaven.py):
//   fabric -> Curly Teddy Natural (bouclé-like loops), tile 33 cm
//   linen  -> Rough Linen, tile 27 cm
//   rug    -> Hessian 230 shown at twice its scale (a jute weave), tile 54 cm
// `textile(kind)` is a grey detail map (0.5 = the material's own colour, linear data):
// shaders multiply by 2 * detail * amount, so each finish keeps its tuned colour and
// only takes the photographed structure. `textileNormal(kind)` is its normal map.
// Furniture UVs are metric; rugs use a world-plan projection of 4 units per metre.
const SOURCES={fabric:'curly_teddy_natural',linen:'rough_linen',rug:'hessian_230'};
const TILE={fabric:.33,linen:.27,rug:.54};
export const textileDetail={fabric:.85,linen:.55,rug:.9};
export const textileNormalScale={fabric:.9,linen:.55,rug:1.1};
const cache=new Map();
function load(kind,map){
  const id=kind+map;if(cache.has(id))return cache.get(id);
  const asset=SOURCES[kind];
  const t=imageTexture(`./assets/polyhaven/${asset}/${asset}_${map}_1k.webp`);
  t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;
  const r=kind==='rug'?1/(TILE.rug*4):1/TILE[kind];t.repeat.set(r,r);
  cache.set(id,t);return t;
}
export const textile=kind=>load(SOURCES[kind]?kind:'fabric','detail');
export const textileNormal=kind=>load(SOURCES[kind]?kind:'fabric','nor_gl');
// Kept for callers of the former procedural bump maps: no bump with normal maps.
export const textileBump={rug:0,linen:0,fabric:0};
