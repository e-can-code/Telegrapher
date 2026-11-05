import test from 'node:test';
import assert from 'node:assert/strict';
import {detectSignal} from '../js/listen/signal-analysis.js';
import {ReceiverScope} from '../js/listen/receiver-scope.js';
import {createCelestialLayout, familyFor, wordSignature, orbitalPosition} from '../js/listen/celestial-layout.js';
const makeWords = count => Array.from({length:count},(_,i)=>({start:i*2,end:i*2+1,id:`word-${i+1}`}));
test('no automatic first-word selection or loop at entry',()=>{
 const s=new ReceiverScope();s.reset(makeWords(5),12);
 assert.equal(s.view,'overview');assert.equal(s.selected,-1);assert.equal(s.loop,false);
 assert.deepEqual(s.interval(),{start:0,end:12});
});
test('focus changes scope, not loop preference; back queues next word',()=>{
 const s=new ReceiverScope();s.reset(makeWords(5),12);
 s.setLoop(true);assert.equal(s.focus(1),2);assert.equal(s.interval().end,3);assert.equal(s.loop,true);
 assert.equal(s.back(),4);assert.equal(s.selected,-1);assert.equal(s.queued,2);
 assert.equal(s.interval().start,0);assert.equal(s.loop,true);
});
test('last focused word returns to recording end safely',()=>{
 const s=new ReceiverScope();s.reset(makeWords(2),5);s.focus(1);assert.equal(s.back(),5);
});
test('single word opens directly in focus and remains playable',()=>{
 const s=new ReceiverScope();s.reset(makeWords(1),3);assert.equal(s.view,'focus');assert.equal(s.interval().start,0);
 assert.equal(s.back(),null);assert.equal(s.view,'focus');
});
test('previous and next use true recording order',()=>{
 const s=new ReceiverScope();s.reset(makeWords(8),17);s.focus(4);
 assert.equal(s.neighbor(-1),6);assert.equal(s.selected,3);
 assert.equal(s.neighbor(1),8);assert.equal(s.selected,4);
});
test('word lookup excludes silent gaps',()=>{
 const s=new ReceiverScope();s.reset(makeWords(3),8);
 assert.equal(s.wordAt(.4),0);assert.equal(s.wordAt(1.5),-1);assert.equal(s.wordAt(2.3),1);
});
test('group navigation uses one selection owner',()=>{
 const s=new ReceiverScope(),words=makeWords(50);s.reset(words,100);
 const layout=createCelestialLayout(words);s.setGroups(layout.groups);
 s.enterGroup(2);s.focus(27);assert.equal(s.view,'focus');
 assert.equal(s.back(),56);assert.equal(s.view,'group');assert.equal(s.group,2);
 assert.equal(s.back(),56);assert.equal(s.view,'overview');
});
test('all 11 count categories have finite, stable 3D coordinates',()=>{
 const counts=[1,2,3,4,5,6,7,8,12,13,35,36,100,101,500];
 for(const n of counts){const layout=createCelestialLayout(makeWords(n));
  assert.equal(layout.points.length,n);assert.equal(layout.family,familyFor(n));
  for(const p of layout.points)for(const v of ['x','y','z','rate'])assert.ok(Number.isFinite(p[v]),`${n} ${v}`);
 }
});
test('six-word system begins orbital progression',()=>{
 assert.equal(createCelestialLayout(makeWords(5)).name,'Little Celestial Garden');
 assert.equal(createCelestialLayout(makeWords(6)).name,'Growing Orbit');
});
test('large groups partition all words without duplication or gaps',()=>{
 for(const n of [36,100,101,500]){
  const gs=createCelestialLayout(makeWords(n)).groups;let index=0;
  for(const g of gs){assert.equal(g.first,index);index=g.last;assert.ok(g.last>g.first)}
  assert.equal(index,n);
 }
});
test('orbits are deterministic and bounded while space order retains identity',()=>{
 const layout=createCelestialLayout(makeWords(35));
 const before=orbitalPosition(layout.points[3],22);
 assert.deepEqual(before,orbitalPosition(layout.points[3],22));
 assert.notDeepEqual(before,orbitalPosition(layout.points[3],30));
});
test('signature derives normalized structure, not raw letter count',()=>{
 const sig=wordSignature([{start:0,end:.1},{start:.2,end:.5}],{start:0,end:.6});
 assert.equal(sig.ratio,.5);assert.ok(sig.density<=1);
});

test('single-element words separated by word gaps remain separately selectable',()=>{
  const rate=1000,dot=.075,samples=new Float32Array(rate*13);let time=.2;
  for(let i=0;i<18;i++){
    for(let j=Math.round(time*rate);j<Math.round((time+dot)*rate);j++)samples[j]=.20;
    time+=dot+7*dot;
  }
  const detected=detectSignal(samples,rate,samples.length/rate);
  assert.equal(detected.words.length,18);
});
