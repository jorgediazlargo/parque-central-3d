import * as THREE from './assets/three.module.js';

// Image textures decoded off the main thread (createImageBitmap). TextureLoader's <img>
// is decoded synchronously when it is uploaded, ~45 ms per 1k map on the M1; a bitmap
// uploads in a tenth of that, with the same texels (checked one by one for every map).
// A bitmap ignores flipY at upload, so the orientation is set when it is decoded:
// flipY false gives what TextureLoader uploads with texture.flipY = false. Code that
// draws texture.image into a canvas (rooms/dormitorio.mjs, mats.wood) expects an
// upright <img>: those maps keep TextureLoader.
const bitmaps=new Map();
function decode(url,flipY){
  const key=(flipY?'flip:':'none:')+url;
  if(!bitmaps.has(key)){
    const manager=THREE.DefaultLoadingManager;manager.itemStart(url);
    bitmaps.set(key,fetch(url).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return r.blob();})
      .then(blob=>createImageBitmap(blob,{imageOrientation:flipY?'flipY':'none',premultiplyAlpha:'none',colorSpaceConversion:'none'}))
      .then(b=>{manager.itemEnd(url);return b;},e=>{manager.itemError(url);manager.itemEnd(url);bitmaps.delete(key);throw e;}));
  }
  return bitmaps.get(key);
}
// Resolves to a new texture (its own wrap, repeat, colour space) once decoded.
export async function loadImageTexture(url,{flipY=true}={}){
  const t=new THREE.Texture(await decode(url,flipY));t.flipY=false;t.needsUpdate=true;return t;
}
// TextureLoader.load equivalent: the texture now, its image when decoded.
export function imageTexture(url,{flipY=true}={}){
  const t=new THREE.Texture();t.flipY=false;
  decode(url,flipY).then(b=>{t.image=b;t.needsUpdate=true;},e=>console.error(e));
  return t;
}
// Starts the download and decode now; a later load of the same URL reuses it.
export function prefetchImage(url,{flipY=true}={}){decode(url,flipY).catch(()=>{});}
