import {eventsFor} from '../core/morse.js';
// Each tone event carries its character and mark index for visual tracking.
export function timeline(chars,wpm) {
  const unit=1200/wpm;let cursor=0;const entries=[];
  chars.forEach((c,i)=>{
    if(i)cursor+=(c.wordBefore?7:3)*unit;
    [...c.marks].forEach((mark,j)=>{
      if(j)cursor+=unit;
      const length=(mark==='-'?3:1)*unit;
      entries.push({character:i,mark:j,start:cursor,end:cursor+length});cursor+=length;
    });
  });
  return entries;
}
export class PlaybackHighlight {
  constructor(tiles){this.tiles=tiles;this.frame=0;this.started=0;this.entries=[];this.pausedAt=null;}
  start(chars,wpm){this.stop();this.entries=timeline(chars,wpm);this.started=performance.now();this.pausedAt=null;this.tick();}
  tick=()=>{
    const elapsed=performance.now()-this.started;
    const current=this.entries.find(e=>elapsed>=e.start && elapsed<e.end);
    this.tiles.querySelectorAll('.tile').forEach((el,i)=>{
      el.classList.toggle('playing',i===current?.character);
      el.dataset.mark=i===current?.character?String(current.mark):'';
      el.querySelectorAll('.mark').forEach((m,j)=>m.classList.toggle('sounding',i===current?.character&&j===current.mark));
    });
    this.frame=requestAnimationFrame(this.tick);
  };
  pause(){if(this.pausedAt===null){this.pausedAt=performance.now();cancelAnimationFrame(this.frame);}}
  resume(){if(this.pausedAt!==null){this.started+=performance.now()-this.pausedAt;this.pausedAt=null;this.tick();}}
  stop(){this.pausedAt=null;cancelAnimationFrame(this.frame);this.tiles.querySelectorAll('.tile').forEach(el=>{el.classList.remove('playing');el.dataset.mark='';});}
}
