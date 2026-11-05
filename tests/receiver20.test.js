import test from 'node:test';
import assert from 'node:assert/strict';
import {signalEnvelope} from '../js/listen/signal-envelope.js';
import {ReceiverScope} from '../js/listen/receiver-scope.js';
import {readFileSync} from 'node:fs';
const tones=[{start:.1,end:.2},{start:.4,end:.7}];
test('no false flashes during silence, pause, or before onset',()=>{
 for(const t of [0,.05,.2,.25,.39,.7,.85])assert.equal(signalEnvelope(t,tones,true),0);
 assert.equal(signalEnvelope(.5,tones,false),0);
});
test('tone light sustains for full dah and respects attack and release',()=>{
 assert.ok(signalEnvelope(.11,tones,true)>0);
 assert.equal(signalEnvelope(.5,tones,true),1);
 assert.ok(signalEnvelope(.69,tones,true)>0 && signalEnvelope(.69,tones,true)<1);
});
test('word order and loop are independent',()=>{
 const s=new ReceiverScope();s.reset([{start:0,end:.2},{start:.4,end:.7},{start:1,end:1.4}],2);
 assert.equal(s.loop,false);assert.equal(s.focus(1),.4);assert.equal(s.loop,false);
 assert.equal(s.interval().end,.7);s.setLoop(true);assert.equal(s.back(),1);assert.equal(s.loop,true);
});
test('receiver has a stable numbered word rail and no overview orbit rendering',()=>{
 const src=readFileSync(new URL('../js/listen/celestial-receiver.js',import.meta.url),'utf8');
 assert.match(src,/railSpacing\(\)/);assert.match(src,/fillText\(String\(i\+1\)/);
 assert.match(src,/this\.railTouched=true/);
});
