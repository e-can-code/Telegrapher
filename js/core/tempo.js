// PARIS standard: 50 timing units per word.
export const unitForWpm = wpm => 1200 / wpm;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Broad sending styles allow adaptation without chasing every hesitation.
export const BANDS = {meandering:[4,7],comfortable:[7,11],flowing:[11,17],swift:[17,25]};
export class Tempo {
  constructor(unit = unitForWpm(7), automatic = true, band = 'comfortable') {
    this.band = BANDS[band] ? band : 'comfortable';
    this.automatic = automatic; this.samples = [];
    this.unit = this.limit(unit);
  }
  limit(unit) {const [lo,hi]=BANDS[this.band];return clamp(unit,unitForWpm(hi),unitForWpm(lo));}
  setBand(band) {
    this.band=BANDS[band]?band:'comfortable';this.samples=[];
    const [lo,hi]=BANDS[this.band];this.unit=unitForWpm((lo+hi)/2);
  }
  setManual(wpm) {this.unit=this.limit(unitForWpm(wpm));this.samples=[];}
  // Recognition is more tolerant than ideal 1:3:7 sending guidance.
  mark(duration,unit=this.unit){return duration >= 2*unit ? '-' : '.';}
  gap(duration,unit=this.unit){return duration >= 11*unit?'word':duration >= 4.5*unit?'letter':'inside';}
  observe(duration,mark){
    if(!this.automatic || duration<35 || duration>1800)return this.unit;
    const normalized=duration/(mark==='-'?3:1);
    if(normalized<this.unit*.6 || normalized>this.unit*1.5)return this.unit;
    this.samples.push({normalized,mark});if(this.samples.length>24)this.samples.shift();
    // Mixed marks prevent an unusual run of long holds from moving the clock.
    if(this.samples.length<8 || !this.samples.some(s=>s.mark==='.') || !this.samples.some(s=>s.mark==='-'))return this.unit;
    const values=this.samples.map(s=>s.normalized).sort((a,b)=>a-b);
    const n=values.length,median=n%2?values[n>>1]:(values[n/2-1]+values[n/2])/2;
    // Three percent maximum per mark: steady adaptation, no visual jumps.
    this.unit=this.limit(clamp(median,this.unit*.97,this.unit*1.03));
    return this.unit;
  }
}
