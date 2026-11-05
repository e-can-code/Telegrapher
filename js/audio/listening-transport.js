import {renderCleanPCM} from './clean-morse.js';
import {stretchPCM} from './time-stretch.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// One output clock owns both the heard audio and its visual timeline. The
// independent start cue is scheduled here but never enters the Morse event map.
export class ListeningTransport extends EventTarget {
 constructor(){super();this.context=null;this.buffer=null;this.rendered=null;this.renderCache=new Map();
  this.tones=[];this.cleanOptions={};this.rate=1;this.mode='original';this._position=0;
  this._duration=0;this._volume=1;this.source=null;this.startAt=0;this.anchor=0;this.state='unloaded';
  this.scope={start:0,end:0};this.gap=.36;this.loop=false;this.generation=0;this.error=null;
  this.loadSerial=0;this.processing=false;
 }
 contextForPlayback(){this.context??=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});return this.context;}
 async load(blob){
  this.pause();const serial=++this.loadSerial;this.state='loading';this.renderCache.clear();this.buffer=null;this.tones=[];this.cleanOptions={};this._duration=0;
  const ctx=this.contextForPlayback(),bytes=await blob.arrayBuffer(),buffer=await ctx.decodeAudioData(bytes);
  if(serial!==this.loadSerial)return false;
  this.buffer=buffer;this._duration=buffer.duration;this.scope={start:0,end:buffer.duration};this._position=0;
  this.state='ready';this.mode='original';this.rendered=null;this.emit('loadedmetadata');this.emit('timeupdate');return true;
 }
 setMorseEvents(tones,options={}){
  this.tones=tones.filter(t=>t.end>t.start).map(t=>({start:t.start,end:t.end,...(t.mark?{mark:t.mark}:{})}));
  this.cleanOptions={...options};
  for(const key of [...this.renderCache.keys()])if(key.startsWith('clean:'))this.renderCache.delete(key);
 }
 get duration(){return this._duration;}
 get currentTime(){
  if(this.state!=='playing')return this._position;
  const elapsed=Math.max(0,this.clock()-this.startAt),span=this.scope.end-this.scope.start;
  if(!this.loop)return clamp(this.anchor+elapsed*this.rate,this.scope.start,this.scope.end);
  const total=span+this.gap*this.rate;if(total<=0)return this.scope.start;
  return this.scope.start+Math.min((this.anchor-this.scope.start+elapsed*this.rate)%total,span);
 }
 set currentTime(v){this.seek(v);}
 get playbackRate(){return this.rate;}
 get volume(){return this._volume;}
 set volume(v){this._volume=clamp(Number(v)||0,0,1);if(this.gain)this.gain.gain.value=this._volume;}
 get paused(){return this.state!=='playing';}
 get visualPosition(){
  if(this.paused)return this._position;
  const elapsed=Math.max(0,this.audibleClock()-this.startAt);
  const span=this.scope.end-this.scope.start;
  if(!this.loop)return clamp(this.anchor+elapsed*this.rate,this.scope.start,this.scope.end);
  const total=span+this.gap*this.rate;if(total<=0)return this.scope.start;
  return this.scope.start+Math.min((this.anchor-this.scope.start+elapsed*this.rate)%total,span);
 }
 get isMorseAudible(){return !this.paused&&this.audibleClock()>=this.startAt&&(this.loop?this.visualPosition<this.scope.end-1e-5:true);}
 // getOutputTimestamp gives context time at audio output, rather than the
 // look-ahead time at which JS may already have scheduled future samples.
 audibleClock(){
  if(!this.context)return 0;
  const stamp=this.context.getOutputTimestamp?.();
  if(stamp&&stamp.contextTime>0&&stamp.performanceTime>0){
   const elapsed=Math.max(0,(performance.now()-stamp.performanceTime)/1000);
   return Math.min(this.context.currentTime,stamp.contextTime+elapsed);
  }
  return Math.max(0,this.context.currentTime-(this.context.baseLatency||0));
 }
 clock(){return this.context?.currentTime||0;}
 emit(name){this.dispatchEvent(new Event(name));}
 setScope({start,end},loop=false,gap=.36){
  const s=clamp(Number(start)||0,0,this._duration),e=clamp(Number(end)||this._duration,s,this._duration);
  this.scope={start:s,end:e};this.loop=Boolean(loop);this.gap=Math.max(0,Number(gap)||0);
 }
 seek(time){
  const p=clamp(Number(time)||0,0,this._duration),running=!this.paused;
  this.pause();this._position=p;this.emit('seeked');this.emit('timeupdate');
  if(running)void this.play({cue:false}).catch(e=>this.emit('error'));
 }
 pause(){
  if(this.state==='playing')this._position=this.currentTime;
  ++this.generation;
  if(this.cueSource){try{this.cueSource.stop();}catch(_){ }this.cueSource=null;}
  if(this.source){const src=this.source;this.source=null;src.onended=null;try{src.stop();}catch(_){ }try{src.disconnect();}catch(_){}}
  if(this.state==='playing'){this.state='paused';this.emit('pause');}
 }
 makeBuffer(channels,sampleRate){
  const ctx=this.contextForPlayback(),buf=ctx.createBuffer(channels.length,channels[0].length,sampleRate);
  for(let c=0;c<channels.length;c++)buf.copyToChannel(channels[c],c);
  return buf;
 }
 async prepare(){
  if(!this.buffer)throw new Error('Open a WAV before playing.');
  const key=`${this.mode}:${this.rate}`;
  if(this.renderCache.has(key))return this.renderCache.get(key);
  this.processing=true;
  try{
   let result;
   if(this.mode==='clean'){
    if(!this.tones.length)throw new Error('Reliable Morse tone events are unavailable for Clean Morse.');
    const pcm=renderCleanPCM(this.tones,this._duration,this.rate,this.cleanOptions);
    result=this.makeBuffer([pcm],this.cleanOptions.sampleRate||22050);
   }else if(this.rate===1)result=this.buffer;
   else{
    // Yield first so browsers can paint a preparation indicator.
    await new Promise(resolve=>setTimeout(resolve,0));
    const chans=Array.from({length:this.buffer.numberOfChannels},(_,c)=>this.buffer.getChannelData(c));
    result=this.makeBuffer(stretchPCM(chans,this.buffer.sampleRate,this.rate),this.buffer.sampleRate);
   }
   this.renderCache.set(key,result);
   // A bounded cache avoids retaining every processed version of a large WAV.
   if(this.renderCache.size>3){const first=this.renderCache.keys().next().value;this.renderCache.delete(first);}
   return result;
  }finally{this.processing=false;}
 }
 async setSpeed(speed){
  const value=Number(speed);if(!(value>=.5&&value<=2))throw new RangeError('Speed must be between 0.5× and 2×');
  const running=!this.paused,p=this.currentTime;this.pause();this.rate=value;this._position=p;
  await this.prepare();this.emit('ratechange');if(running)await this.play({cue:false});
 }
 async setMode(mode){
  if(!['clean','original'].includes(mode))throw new Error('Unknown sound mode');
  if(mode==='clean'&&!this.tones.length)throw new Error('This recording has no reliable Morse event map.');
  const playing=!this.paused,p=this.currentTime;this.pause();this.mode=mode;this._position=p;
  await this.prepare();if(playing)await this.play({cue:false});this.emit('modechange');
 }
 scheduleCue(at){
  if(localStorage.getItem('telegrapher-start-cue')==='off')return;
  const ctx=this.context,o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';
  o.frequency.setValueAtTime(180,at);o.frequency.exponentialRampToValueAtTime(92,at+.035);
  g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.012*this._volume,at+.004);g.gain.exponentialRampToValueAtTime(.0001,at+.047);
  o.connect(g).connect(ctx.destination);o.start(at);o.stop(at+.05);this.cueSource=o;
  o.onended=()=>{if(this.cueSource===o)this.cueSource=null;try{o.disconnect();g.disconnect();}catch(_){}};
 }
 async play({start=this.scope.start,end=this.scope.end,loop=this.loop,gap=this.gap,cue=false}={}){
  if(!this.buffer)throw new Error('Load a recording first');
  this.setScope({start,end},loop,gap);
  if(!this.paused)return;
  const ctx=this.contextForPlayback();await ctx.resume();const gen=this.generation;
  const buffer=await this.prepare();if(gen!==this.generation)return;
  const pos=clamp(this._position,this.scope.start,this.scope.end);
  const from=pos>=this.scope.end-1e-4?this.scope.start:pos;
  const firstAt=ctx.currentTime+.025;
  const playAt=cue&&localStorage.getItem('telegrapher-start-cue')!=='off'?firstAt+.105:firstAt;
  const src=ctx.createBufferSource();
  let audioBuffer=buffer,offset=from/this.rate,duration=(this.scope.end-from)/this.rate;
  if(loop){
   const a=Math.round(this.scope.start/this.rate*buffer.sampleRate),b=Math.max(a+1,Math.round(this.scope.end/this.rate*buffer.sampleRate));
   const padded=b-a+Math.max(1,Math.round(this.gap*buffer.sampleRate));
   const cols=Array.from({length:buffer.numberOfChannels},(_,c)=>{
     const out=new Float32Array(padded);out.set(buffer.getChannelData(c).subarray(a,Math.min(b,buffer.length)));return out;
   });
   audioBuffer=this.makeBuffer(cols,buffer.sampleRate);offset=(from-this.scope.start)/this.rate;
   src.loop=true;
  }
  src.buffer=audioBuffer;this.gain??=ctx.createGain();this.gain.gain.value=this._volume;
  src.connect(this.gain);this.gain.connect(ctx.destination);
  this.source=src;this.anchor=from;this.startAt=playAt;this.state='playing';
  src.onended=()=>{if(gen!==this.generation)return;this._position=this.scope.end;this.source=null;this.state='ended';this.emit('ended');this.emit('pause');this.emit('timeupdate');};
  if(cue&&localStorage.getItem('telegrapher-start-cue')!=='off')this.scheduleCue(firstAt);
  if(loop)src.start(playAt,offset);
  else src.start(playAt,offset,Math.max(.001,duration));
  this.emit('play');this.emit('timeupdate');
 }
}
