import test from 'node:test';
import assert from 'node:assert/strict';
import {createCelestialLayout,wordSignature} from '../js/listen/celestial-layout.js';
const words=n=>Array.from({length:n},(_,i)=>({start:i*2,end:i*2+1}));
test('six-word arrangement is orbital, with stable readable identities',()=>{
 const l=createCelestialLayout(words(6));
 assert.equal(l.name,'Growing Orbit');
 assert.equal(l.points.length,6);
 const radii=l.points.map(p=>Math.hypot(p.x,p.z));
 assert.ok(Math.max(...radii)-Math.min(...radii)<.6,'six words should not form an expanding snail tail');
 assert.equal(new Set(l.points.map(p=>p.index)).size,6);
});
test('ring count grows in bounded tiers with measured Morse events',()=>{
 for(const [count,expected] of [[1,3],[3,3],[4,4],[6,4],[7,5],[11,6],[16,7],[23,8]]){
  const tones=Array.from({length:count},(_,i)=>({start:i*.15,end:i*.15+.08}));
  const s=wordSignature(tones,{start:0,end:count*.15});
  assert.equal(s.elementCount,count);assert.equal(s.ringCount,expected);
 }
});
test('missing tone metadata uses a safe nonzero visual ring count',()=>{
 assert.equal(wordSignature([],{start:0,end:1}).ringCount,4);
});
