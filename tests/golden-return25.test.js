import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ListeningTransport} from '../js/audio/listening-transport.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('completion begins at audible end of first selected interval',()=>{
 const transport=new ListeningTransport();
 transport.state='playing';transport.loop=true;transport.rate=1;
 transport.scope={start:2,end:4};transport.anchor=2;transport.startAt=10;transport.gap=.6;
 transport.audibleClock=()=>12.15;
 assert.ok(Math.abs(transport.loopCompletionAge-.15)<1e-6);
 transport.audibleClock=()=>11.99;
 assert.equal(transport.loopCompletionAge,-1);
 transport.audibleClock=()=>12.65;
 assert.equal(transport.loopCompletionAge,-1);
});
test('loop completion resets on pause and does not emit a Morse tone',()=>{
 const transport=new ListeningTransport();transport.state='paused';transport.loop=true;
 transport.scope={start:0,end:1};assert.equal(transport.loopCompletionAge,-1);
 const receiver=read('js/listen/celestial-receiver.js');
 assert.match(receiver,/drawLoopReturn/);
 assert.match(receiver,/loopCompletionAge/);
});
test('Receiver controls are restart word and next word, not letter stepping',()=>{
 const source=read('js/listen/quiet-controller.js'),html=read('index.html');
 assert.match(source,/addEventListener\('click',restartCurrentWord\)/);
 assert.match(source,/addEventListener\('click',playNextWord\)/);
 assert.match(html,/aria-label="Restart current word"/);
 assert.match(html,/aria-label="Play next word"/);
});
