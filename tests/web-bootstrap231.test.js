import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('web distribution has bundled classic entry point and preserves Receiver markup',()=>{
 const index=read('index.html');
 assert.match(index,/<script defer src="js\/telegrapher-bundle\.js\?v=2\.5"/);
 assert.doesNotMatch(index,/<script type="module" src="js\/app\.js/);
 for(const id of ['receiverInstrument','receiverCanvas','receiverPlay','receiverPrevious','receiverNext','receiverLoop'])
  assert.match(index,new RegExp('id="'+id+'"'));
});
test('browser bundle contains all Receiver and Compose sources',()=>{
 const bundle=read('js/telegrapher-bundle.js');
 for(const module of ['js/listen/quiet-controller.js','js/listen/celestial-receiver.js','js/listen/receiver-scope.js','js/compose/message-naming.js'])
  assert.ok(bundle.includes(JSON.stringify(module)), 'missing module '+module);
 assert.match(bundle,/load\(["\']js\/app\.js["\']\)/);
});
test('offline manifest includes bundled script and current version',()=>{
 const sw=read('sw.js');
 assert.match(sw,/telegrapher-v2\.5/);
 assert.match(sw,/\.\/js\/telegrapher-bundle\.js/);
});
