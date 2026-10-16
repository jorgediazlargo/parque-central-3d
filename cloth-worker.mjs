import {clothPixels} from './cloth-maps.mjs?v=13691be8ab';

// One cloth kind per message; the pixels go back as transferred buffers.
onmessage=e=>{const p=clothPixels(e.data);postMessage(p,[p.color.buffer,p.normal.buffer]);};
