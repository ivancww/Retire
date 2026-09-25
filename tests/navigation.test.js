import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextConversationStep, previousConversationStep } from '../src/navigation.js';

test('summary back returns to the last answer without resetting data', () => {
  assert.equal(nextConversationStep(10, 11), 11);
  assert.equal(previousConversationStep(11), 10);
});

test('back navigation reaches the intro but never goes negative', () => {
  assert.equal(previousConversationStep(1), 0);
  assert.equal(previousConversationStep(0), 0);
});

test('forward navigation is bounded at summary', () => {
  assert.equal(nextConversationStep(99, 11), 11);
});

test('production Frontstage has persistent Return AVA and no device switcher', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /class="return-ava"/);
  assert.match(source, /返回 AVA/);
  assert.doesNotMatch(source, /device|viewport|tablet|mobile/i);
});
