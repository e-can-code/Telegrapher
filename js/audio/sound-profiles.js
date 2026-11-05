// One sound vocabulary shared by the live key, WAV export and optional listening recoloring.
// Harmonics are deliberately restrained to keep short marks intelligible.
export const SOUND_PROFILES = Object.freeze([
  {id:'classic',name:'Classic Telegraph',kind:'radio',dit:1,dah:1,harmonics:[1],attack:.002,release:.005},
  {id:'valve',name:'Warm Valve',kind:'radio',dit:1,dah:1,harmonics:[1,.18,.06],attack:.003,release:.007},
  {id:'copper',name:'Copper Wire',kind:'radio',dit:1.06,dah:.98,harmonics:[1,.25,.08],attack:.002,release:.004},
  {id:'glass',name:'Glass Chimes',kind:'instrument',dit:1.34,dah:1,harmonics:[1,.1,.03],attack:.002,release:.012},
  {id:'wood',name:'Wood & Bell',kind:'instrument',dit:1.18,dah:.82,harmonics:[1,.3,.12],attack:.003,release:.010},
  {id:'silver',name:'Silver Pulse',kind:'instrument',dit:1.5,dah:1,harmonics:[1,.12],attack:.0015,release:.006},
  {id:'beacon',name:'Deep Beacon',kind:'instrument',dit:1,dah:1,harmonics:[1,.12,.03],attack:.004,release:.012},
  {id:'marimba',name:'Soft Marimba',kind:'instrument',dit:1.25,dah:.88,harmonics:[1,.24,.07],attack:.003,release:.012}
]);
export function soundProfile(id){return SOUND_PROFILES.find(p=>p.id===id)||SOUND_PROFILES[0];}
export function sampleTone(profileId,mark,pitch,seconds,t,rate=22050){
  const p=soundProfile(profileId),factor=mark==='-'?p.dah:p.dit;
  const fadeIn=Math.min(1,t/p.attack),fadeOut=Math.min(1,(seconds-t)/p.release);
  const envelope=Math.max(0,Math.min(fadeIn,fadeOut));
  const harmonics=p.harmonics;
  let wave=0,weight=0;
  for(let h=0;h<harmonics.length;h++){const amp=harmonics[h];wave+=amp*Math.sin(2*Math.PI*pitch*factor*(h+1)*t);weight+=amp;}
  return envelope*wave/weight;
}
