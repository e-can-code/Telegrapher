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
  constructor(tiles){this.tiles=tiles;this.frame=0;this.entries=[];this.audio=null;this.pausedAt=null;this.lastCharacter=-1;}
  start(chars,wpm,audio){this.stop();this.entries=timeline(chars,wpm);this.audio=audio;this.lastCharacter=-1;this.tick();}
  tick=()=>{
    const elapsed=(this.audio?.currentTime??0)*1000;
    const current=this.entries.find(e=>elapsed>=e.start&&elapsed<e.end);
    const currentIndex=current?.character??-1;
    this.tiles.querySelectorAll('.tile').forEach((el,i)=>{
      el.classList.toggle('playing',i===currentIndex);
      el.dataset.mark=i===currentIndex?String(current.mark):'';
      el.querySelectorAll('.mark').forEach((m,j)=>m.classList.toggle('sounding',i===currentIndex&&j===current.mark));
    });
    // Gaps are visible units of the composition; illuminate the word boundary
    // during the silent interval, not during either adjacent character.
    const next=this.entries.find(e=>e.start>elapsed);
    const inWordGap=currentIndex<0 && next && next.character>0 &&
      this.entries.some(e=>e.character===next.character-1 && e.end<=elapsed) &&
      this.tiles.querySelectorAll('.tile')[next.character]?.classList.contains('word-start');
    this.tiles.querySelectorAll('.tile.word-start').forEach(el=>el.classList.remove('word-gap-playing'));
    if(inWordGap)this.tiles.querySelectorAll('.tile')[next.character]?.classList.add('word-gap-playing');
    if(currentIndex!==-1 && currentIndex!==this.lastCharacter){
      const tile=this.tiles.querySelectorAll('.tile')[currentIndex];
      if(tile){const left=tile.offsetLeft;const right=left+tile.offsetWidth;
        if(left<this.tiles.scrollLeft||right>this.tiles.scrollLeft+this.tiles.clientWidth)
          this.tiles.scrollTo({left:Math.max(0,left-10),behavior:'smooth'});
      }
    }
    this.lastCharacter=currentIndex;
    this.frame=requestAnimationFrame(this.tick);
  };
  pause(){cancelAnimationFrame(this.frame);}
  resume(){this.tick();}
  stop(){cancelAnimationFrame(this.frame);this.audio=null;this.lastCharacter=-1;
    this.tiles.querySelectorAll('.tile').forEach(el=>{el.classList.remove('playing','word-gap-playing');el.dataset.mark='';
      el.querySelectorAll('.mark').forEach(m=>m.classList.remove('sounding'));});}
}
