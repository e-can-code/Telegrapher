import {soundProfile,sampleTone} from './sound-profiles.js';
import {eventsFor} from '../core/morse.js';
let context,osc,gain,live=false,livePitch=600,liveProfile="classic";
const waves=new Map();
function profileWave(c,p){
  if(waves.has(p.id))return waves.get(p.id);
  const real=new Float32Array(p.harmonics.length+1),imag=new Float32Array(real.length);
  p.harmonics.forEach((v,i)=>{imag[i+1]=v;});
  const wave=c.createPeriodicWave(real,imag,{disableNormalization:false});
  waves.set(p.id,wave);return wave;
}
function ctx(){context??=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});return context;}
function prepare(){
  const c=ctx();
  if(osc)return c;
  // Keep the oscillator running so subsequent presses only change gain.
  osc=c.createOscillator();gain=c.createGain();osc.type='sine';
  gain.gain.value=0;osc.connect(gain).connect(c.destination);osc.start();
  return c;
}
export function warmAudio(){const c=prepare();if(c.state!=='running')void c.resume().catch(()=>{});}
export function startTone(pitch,volume,profileId="classic"){
  const c=prepare();if(c.state!=='running')void c.resume().catch(()=>{});
  const t=c.currentTime;live=true;livePitch=pitch;liveProfile=profileId;const p=soundProfile(profileId);osc.setPeriodicWave(profileWave(c,p));osc.frequency.cancelScheduledValues(t);osc.frequency.setValueAtTime(pitch*p.dit,t);
  gain.gain.cancelScheduledValues(t);gain.gain.setValueAtTime(gain.gain.value,t);
  // A 2 ms attack limits clicks without an audible intentional delay.
  gain.gain.linearRampToValueAtTime(volume*.28,t+soundProfile(profileId).attack);
}
export function setLongTone(){if(!live||!osc)return;const p=soundProfile(liveProfile),t=ctx().currentTime;osc.frequency.cancelScheduledValues(t);osc.frequency.setTargetAtTime(livePitch*p.dah,t,.009);}
export function stopTone(){
  if(!osc||!live)return;live=false;const c=ctx(),t=c.currentTime;
  gain.gain.cancelScheduledValues(t);gain.gain.setValueAtTime(gain.gain.value,t);
  // A 3 ms release avoids a hard waveform discontinuity.
  gain.gain.linearRampToValueAtTime(0,t+soundProfile(liveProfile).release);
}
// Render directly to PCM: no microphone, no noise, no dependence on live timing.
export function wavFor(chars,wpm,pitch,profileId='classic'){
  const events=eventsFor(chars,wpm),rate=22050;
  const total=Math.ceil((events.reduce((n,e)=>n+e.seconds,0)+7*1.2/wpm)*rate);
  const pcm=new Int16Array(total);let pos=0;
  for(const event of events){const count=Math.round(event.seconds*rate);
    if(event.on){const mark=event.seconds>1.8/wpm?'-':'.';
      for(let j=0;j<count&&pos+j<total;j++){
        pcm[pos+j]=Math.round(.7*sampleTone(profileId,mark,pitch,event.seconds,j/rate,rate)*32767);
      }
    }pos+=count;
  }
  const bytes=new ArrayBuffer(44+pcm.byteLength),v=new DataView(bytes);
  const str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+pcm.byteLength,true);str(8,'WAVE');str(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);
  v.setUint16(34,16,true);str(36,'data');v.setUint32(40,pcm.byteLength,true);
  new Int16Array(bytes,44).set(pcm);return new Blob([bytes],{type:'audio/wav'});
}

let playback;
export function pausePlayback(){if(playback&&!playback.paused)playback.pause();}
export function resumePlayback(){if(playback&&playback.paused)return playback.play();return Promise.resolve();}
export function stopPlayback(){if(playback){playback.pause();URL.revokeObjectURL(playback.src);playback=null;}}
export function playWav(blob,onEnd){stopPlayback();const url=URL.createObjectURL(blob);const audio=new Audio(url);playback=audio;audio.onended=()=>{stopPlayback();onEnd?.();};audio.onerror=()=>{stopPlayback();onEnd?.();};audio.play().catch(()=>{stopPlayback();onEnd?.();});return audio;}
