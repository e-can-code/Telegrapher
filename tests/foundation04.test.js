import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles/compose.css',import.meta.url),'utf8');
const controller=readFileSync(new URL('../js/compose/compose-controller.js',import.meta.url),'utf8');
test('clear action is unique and located between space and backspace',()=>{
  assert.equal((html.match(/id="clearBtn"/g)||[]).length,1);
  const toolbar=html.match(/<div class="edit-toolbar"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(toolbar);
  assert.ok(toolbar.indexOf('id="spaceBtn"') < toolbar.indexOf('id="clearBtn"'));
  assert.ok(toolbar.indexOf('id="clearBtn"') < toolbar.indexOf('id="backspaceBtn"'));
  assert.match(controller,/\$\('clearBtn'\)\.onclick=/);
  assert.match(controller,/change\(\[\]\)/);
});
test('Morse key suppresses Android rectangular tap highlight while keeping keyboard focus',()=>{
  assert.match(css,/-webkit-tap-highlight-color:\s*transparent/);
  assert.match(css,/\.key:focus:not\(:focus-visible\)/);
  assert.match(css,/\.key:focus-visible/);
});
