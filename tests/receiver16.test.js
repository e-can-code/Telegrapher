import test from 'node:test';
import assert from 'node:assert/strict';
import {detectSignal,detectWordRegions} from '../js/listen/signal-analysis.js';
function fixture(){const rate=1000,s=new Float32Array(4000);for(const [a,b] of [[.2,.3],[.4,.7],[1.45,1.55],[1.65,1.95]])for(let i=a*rate;i<b*rate;i++)s[i]=.4*Math.sin(i*.9);return {s,rate};}
test('receiver identifies separated passages and preserves their timestamps',()=>{const {s,rate}=fixture();const a=detectSignal(s,rate,4);assert.equal(a.words.length,2);assert.ok(a.words[0].start<.3);assert.ok(a.words[1].start>1.4);assert.equal(a.tones.length,4);});
test('silent audio has no fabricated words',()=>{assert.deepEqual(detectWordRegions(new Float32Array(1000),1000,1),[]);});
test('word detection is deterministic',()=>{const {s,rate}=fixture();assert.deepEqual(detectWordRegions(s,rate,4),detectWordRegions(s,rate,4));});
