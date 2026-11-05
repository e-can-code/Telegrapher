import test from 'node:test';
import assert from 'node:assert/strict';
import {backspace} from '../js/compose/backspace-model.js';
import {timeline} from '../js/audio/playback-timeline.js';
test('pending word boundary is deleted without removing a letter',()=>{
 const chars=[{marks:'....',wordBefore:false}];
 assert.deepEqual(backspace(chars,{pendingWord:true}),{chars,pendingWord:false,deleted:'space'});
});
test('word boundary preceding last letter is removed first',()=>{
 const chars=[{marks:'....',wordBefore:false},{marks:'..',wordBefore:true}];
 const result=backspace(chars);
 assert.equal(result.deleted,'space');assert.equal(result.chars.length,2);assert.equal(result.chars[1].wordBefore,false);
});
test('backspace removes only one letter',()=>{
 const chars=[{marks:'....',wordBefore:false},{marks:'..',wordBefore:false}];
 assert.deepEqual(backspace(chars).chars,[chars[0]]);
});
test('removing selected last letter preserves trailing word gap',()=>{
 const chars=[{marks:'....',wordBefore:false},{marks:'..',wordBefore:true}];
 const result=backspace(chars,{selectedIndex:1});
 assert.equal(result.pendingWord,true);assert.equal(result.chars.length,1);
});
test('timeline places first tone at zero and includes word silence',()=>{
 const entries=timeline([{marks:'....',wordBefore:false},{marks:'..',wordBefore:true}],20);
 assert.equal(entries[0].start,0);
 assert.equal(entries[4].start-entries[3].end,420);
});
