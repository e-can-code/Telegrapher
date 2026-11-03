import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
test('only Compose and Quiet listening workspaces',()=>{const h=read('index.html');assert.match(h,/id="composeView"/);assert.match(h,/id="listenView"/);assert.doesNotMatch(h,/id="signalPanel"|id="horizonStudio"|id="listenLens"/);});
test('independent library and quiet initialization',()=>{const s=read('js/app.js');assert.match(s,/initLibrary\(\)/);assert.match(s,/initQuiet\(\)/);});
test('compose exports same sound profile for Listen',()=>{const s=read('js/compose/compose-controller.js');assert.match(s,/accept\?\.\(wavFor\(state\.chars, state\.speed, state\.pitch, state\.soundProfile\)\)/);});
test('quiet uses one media element and one playback control',()=>{const s=read('js/listen/quiet-controller.js');assert.match(s,/const audio=new Audio\(\)/);assert.match(s,/audio\.play\(\)/);assert.equal((read('index.html').match(/id="listenPlay"/g)||[]).length,1);});
test('library opens audio in quiet',()=>{const s=read('js/library-controller.js');assert.match(s,/morse:library-open-audio/);assert.match(s,/data-workspace/);});
