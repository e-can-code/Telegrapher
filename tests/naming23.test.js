import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMessageTitle,resolvedMessageTitle,wavFilename} from '../js/compose/message-naming.js';
test('user name overrides decoded message',()=>{
  assert.equal(resolvedMessageTitle('  Evening exchange ','HELLO'),'Evening exchange');
  assert.equal(resolvedMessageTitle('','HELLO'),'HELLO');
  assert.equal(resolvedMessageTitle('',''),'Untitled composition');
});
test('normalization keeps natural names',()=>{
  assert.equal(normalizeMessageTitle('  Notes   from  Wednesday\n'), 'Notes from Wednesday');
  assert.equal(normalizeMessageTitle('A'.repeat(130)).length, 100);
});
test('filename is safe and predictable',()=>{
  assert.equal(wavFilename('Evening message'),'Evening message.wav');
  assert.equal(wavFilename('A/B: test?'),'A-B- test-.wav');
  assert.equal(wavFilename('Example.wav'),'Example.wav');
  assert.equal(wavFilename('CON'),'Morse message.wav');
  assert.equal(wavFilename('...'),'Morse message.wav');
  assert.equal(wavFilename('光のメッセージ'),'光のメッセージ.wav');
});
