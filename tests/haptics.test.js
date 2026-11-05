import test from 'node:test';
import assert from 'node:assert/strict';
import {hapticPattern} from '../js/compose/haptics.js';
test('off disables all tactile events',()=>{for(const event of ['contact','threshold','release'])assert.equal(hapticPattern('off',event),0);});
test('crafted distinguishes contact from dah threshold',()=>{assert.ok(hapticPattern('crafted','threshold')>hapticPattern('crafted','contact'));assert.equal(hapticPattern('crafted','release'),0);});
test('gentle does not vibrate on dah threshold',()=>assert.equal(hapticPattern('gentle','threshold'),0));
test('expressive includes a restrained release',()=>assert.ok(hapticPattern('expressive','release')>0));
test('invalid settings fail safely',()=>assert.equal(hapticPattern('invalid','contact'),0));
