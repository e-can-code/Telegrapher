import test from 'node:test';
import assert from 'node:assert/strict';
import {eventsFor} from '../js/core/morse.js';
import {exactAnalysis,renderCleanPCM} from '../js/audio/clean-morse.js';
import {stretchPCM} from '../js/audio/time-stretch.js';
import {readFileSync} from 'node:fs';
const sr=22050;
const rms=(a)=>Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);
function frequency(samples){let crossings=0;for(let i=1;i<samples.length;i++)if(samples[i-1]<0&&samples[i]>=0)crossings++;return crossings/(samples.length/sr);}
test('exact composition derives two words without guessing punctuation',()=>{
 const chars=[{marks:'....'},{marks:'..',wordBefore:true}];
 const a=exactAnalysis(chars,15,3);
 assert.equal(a.words.length,2);assert.equal(a.tones.length,6);assert.equal(a.words[1].start,1.12);
 assert.equal(a.tones[0].mark,'.');
});
test('generated slow Morse doubles tone and gap duration without changing pitch',()=>{
 const tones=[{start:.1,end:.18,mark:'.'},{start:.26,end:.50,mark:'-'}];
 const output=renderCleanPCM(tones,1,.5,{pitch:600,sampleRate:sr});
 assert.equal(output.length,sr*2);
 const silence=output.subarray(Math.round(.37*sr),Math.round(.5*sr));
 assert.ok(rms(silence)<.001);
 const tone=output.subarray(Math.round(.56*sr),Math.round(.76*sr));
 assert.ok(Math.abs(frequency(tone)-600)<12,frequency(tone));
});
test('WSOLA keeps pure carrier frequency and duration over supported speeds',()=>{
 const sample=new Float32Array(sr);for(let i=0;i<sr;i++)sample[i]=.45*Math.sin(2*Math.PI*600*i/sr);
 for(const speed of [.5,.75,1.25,1.5,2]){
  const stretched=stretchPCM([sample],sr,speed)[0];
  assert.ok(Math.abs(stretched.length-sr/speed)<2);
  assert.ok(Math.abs(frequency(stretched)-600)<8,`speed ${speed}, frequency ${frequency(stretched)}`);
  assert.ok(rms(stretched)>.26,`speed ${speed}, RMS ${rms(stretched)}`);
 }
});
test('WSOLA leaves source channels unchanged',()=>{
 const left=new Float32Array(sr/2),right=new Float32Array(sr/2);
 left[200]=.8;right[300]=-.8;
 const copy=stretchPCM([left,right],sr,.75);
 assert.ok(Math.abs(left[200]-.8)<1e-6);assert.ok(Math.abs(right[300]+.8)<1e-6);
 assert.equal(copy.length,2);
});
test('start cue has no appearance in event-to-light map',()=>{
 const src=readFileSync(new URL('../js/audio/listening-transport.js',import.meta.url),'utf8');
 assert.match(src,/scheduleCue\(firstAt\)/);
 assert.match(src,/const playAt=cue/);
 assert.match(src,/this\.audibleClock\(\)>=this\.startAt/);
 const quiet=readFileSync(new URL('../js/listen/quiet-controller.js',import.meta.url),'utf8');
 assert.match(quiet,/signalEnvelope\(audio\.visualPosition,tones,audio\.isMorseAudible\)/);
 assert.doesNotMatch(quiet,/gentleCue\(\);await audio\.play/);
});
test('web package includes Receiver entry and no stale v1.8 cache',()=>{
 const root=new URL('../',import.meta.url);
 const app=readFileSync(new URL('js/app.js',root),'utf8');
 const sw=readFileSync(new URL('sw.js',root),'utf8');
 assert.match(app,/import\('\.\/listen\/quiet-controller\.js'\)/);
 assert.match(sw,/telegrapher-v2\.2/);
 assert.doesNotMatch(sw,/telegrapher-v1\.8/);
});
