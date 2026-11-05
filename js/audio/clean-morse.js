import {sampleTone} from './sound-profiles.js';
import {eventsFor} from '../core/morse.js';

export function exactAnalysis(chars,wpm,duration){
 const events=eventsFor(chars,wpm),tones=[],words=[];
 let t=0,start=0,wordStart=null,lastTone=null;
 for(const event of events){
  if(event.on){if(wordStart===null)wordStart=t;tones.push({start:t,end:t+event.seconds,mark:event.seconds>=2*1.2/wpm?'-':'.'});lastTone=t+event.seconds;}
  else if(event.seconds>=(6*1.2/wpm)&&wordStart!==null){words.push({start:wordStart,end:lastTone});wordStart=null;}
  t+=event.seconds;
 }
 if(wordStart!==null)words.push({start:wordStart,end:lastTone});
 return {tones,words:words.map((w,i)=>({...w,id:`word-${i+1}`,label:`Word ${i+1}`,confidence:'exact'})),duration};
}

export function renderCleanPCM(tones,originalDuration,speed,{pitch=600,profile='classic',sampleRate=22050}={}){
 if(!(speed>=.5&&speed<=2))throw new RangeError('Unsupported speed');
 const length=Math.ceil(originalDuration*sampleRate/speed), samples=new Float32Array(Math.max(1,length));
 for(const tone of tones){
  const a=Math.max(0,Math.round(tone.start/speed*sampleRate));
  const b=Math.min(samples.length,Math.round(tone.end/speed*sampleRate));
  if(b<=a)continue;
  const seconds=(b-a)/sampleRate,mark=tone.mark||((tone.end-tone.start)>.17?'-':'.');
  for(let i=a;i<b;i++)samples[i]=.62*sampleTone(profile,mark,pitch,seconds,(i-a)/sampleRate,sampleRate);
 }
 return samples;
}
