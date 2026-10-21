// Adaptive render quality: the tour starts at full quality and steps down (resolution,
// then multisampling) only while the machine cannot hold ~50 fps, and tries to climb back
// after a while of comfortable frames. A fast computer never leaves level 0.

// Levels from best to worst for a base pixel ratio (min(devicePixelRatio, 1.5)).
// Two samples instead of four changes under 0.6 % of the image (frame-time.mjs --compare).
// The two lowest levels also drop the contact occlusion pass (≈ 2–3 ms on the M1 at ×1,5):
// the bake already carries the room-scale shading.
export function qualityLevels(base){
  const raw=[[1,4,1],[1,2,1],[.83,2,1],[.67,2,0],[.5,2,0]].map(([k,samples,ao])=>({ratio:Math.max(.6,Math.round(base*k*100)/100),samples,ao:!!ao}));
  return raw.filter((l,i)=>i===0||l.ratio!==raw[i-1].ratio||l.samples!==raw[i-1].samples||l.ao!==raw[i-1].ao);
}

const WINDOW=45;          // frames averaged before judging
const SLOW=1/50;          // mean frame time above this (< 50 fps) is too slow
const FAST=1/57;          // mean frame time below this has headroom
const HOLD=[12,24,48,96]; // seconds at a level before trying one better, per failed attempt

export class AdaptiveQuality{
  // apply(level) resizes the renderer; save(index) persists the level for the next visit.
  constructor(levels,{apply,save=()=>{},start=0,fixed=false}){
    Object.assign(this,{levels,apply,save,fixed});
    this.index=Math.min(Math.max(0,start),levels.length-1);
    this.failures=new Array(levels.length).fill(0); // times a climb back to this level fell straight back
    this.reset();
  }
  reset(){this.sum=0;this.count=0;this.slowWindows=0;this.since=0;}
  get level(){return this.levels[this.index];}
  // dt: seconds since the previous frame, as the browser reports it; call while playing.
  frame(dt){
    if(this.fixed)return;
    if(!(dt>0)||dt>.25){this.sum=0;this.count=0;return;} // tab switch, pause, big stall: not a measure
    this.sum+=dt;this.count++;this.since+=dt;
    if(this.count<WINDOW)return;
    const mean=this.sum/this.count;this.sum=0;this.count=0;
    if(mean>SLOW){
      // Only sustained slowness counts (a door's shadow update or a GC pause is one window).
      this.slowWindows++;
      const severe=mean>1/20?3:mean>1/30?2:1;
      if(this.slowWindows>=2||severe>1)this.step(severe);
    }else{
      this.slowWindows=0;
      const wait=HOLD[Math.min(HOLD.length-1,this.failures[this.index-1]||0)];
      if(mean<FAST&&this.index>0&&this.failures[this.index-1]<HOLD.length&&this.since>=wait)this.step(-1);
    }
  }
  step(by){
    const next=Math.min(this.levels.length-1,Math.max(0,this.index+by));
    if(next===this.index){this.slowWindows=0;return;}
    // Falling back soon after a climb marks the better level as not sustainable.
    if(by>0&&this.climbedAt!==undefined&&this.index===this.climbedAt&&this.since<20)this.failures[this.index]++;
    this.climbedAt=by<0?next:undefined;
    this.index=next;this.slowWindows=0;this.since=0;
    this.apply(this.level);this.save(this.index);
  }
}
