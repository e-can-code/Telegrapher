import test from 'node:test';
import assert from 'node:assert/strict';
import {signalEnvelope,audiblePosition} from '../js/listen/signal-envelope.js';
const tones=[{start:.20,end:.32},{start:.44,end:.80}];
test('no signal flare when playback is paused',()=>assert.equal(signalEnvelope(.25,tones,false),0));
test('no signal flare between tones during active playback',()=>assert.equal(signalEnvelope(.38,tones,true),0));
test('tone onset, sustain and release have distinct levels',()=>{
 assert.equal(signalEnvelope(.2,tones,true),0);
 assert.equal(signalEnvelope(.25,tones,true),1);
 assert.ok(signalEnvelope(.315,tones,true)<1);
 assert.equal(signalEnvelope(.32,tones,true),0);
});
test('audible playhead does not anticipate a tone',()=>{
 assert.equal(signalEnvelope(audiblePosition(.19),tones,true),0);
 assert.ok(signalEnvelope(audiblePosition(.22),tones,true)>0);
});
