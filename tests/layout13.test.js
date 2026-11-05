import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/telegrapher13.css', import.meta.url), 'utf8');
const quiet = fs.readFileSync(new URL('../js/listen/quiet-controller.js', import.meta.url), 'utf8');
const between = (a,b) => html.slice(html.indexOf(a),html.indexOf(b));
test('speed is before stage and playback follows stage', () => {
 assert.ok(html.indexOf('class="foundation-speed"') < html.indexOf('id="listenStage"'));
 assert.ok(html.indexOf('id="listenStage"') < html.indexOf('id="listenPlay"'));
});
test('single source for each critical control', () => {
 for (const id of ['listenStage','listenPlay','listenBack','listenNotesText','listenNotesKeys','shareBtn'])
  assert.equal(html.match(new RegExp(`id="${id}"`,'g'))?.length,1,id);
});
test('viewport layout owns its flexible stage and compact state',()=>{
 assert.match(css,/\.listen-workspace \.foundation-stage\s*\{/);
 assert.match(css,/flex:1 1 0!important/);
 assert.match(css,/\.listen-workspace\.notes-open \.foundation-stage/);
 assert.match(css,/body\.notes-writing \.app/);
});
test('opening notes never autofocuses native input',()=>{
 assert.match(quiet,/No focus here/);
 assert.doesNotMatch(between('id="listenNotesPanel"','id="listenError"'),/autofocus/);
});
test('custom Morse entry retains the Brass Helmsman',()=>{
 for (const mark of ['brass-helmsman','brass-dit','brass-dah','data-note="backspace"']) assert.ok(html.includes(mark));
});
