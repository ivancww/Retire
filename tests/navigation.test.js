import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextConversationStep, previousConversationStep } from '../src/navigation.js';
import { APP_VERSION } from '../src/version.js';

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
  assert.match(source, /class="[^"]*return-ava"/);
  assert.match(source, /返回 AVA/);
  assert.doesNotMatch(source, /官方資料已更新|本機資料|離線/);
  assert.doesNotMatch(source, /device|viewport|tablet|mobile/i);
});

test('Return AVA is a standalone bordered header control', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(source, /class="ava-button ava-button--secondary return-ava"/);
  assert.match(styles, /\.return-ava\s*\{/);
});

test('production Frontstage uses the canonical app version in its identity', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.equal(APP_VERSION, '0.6.0');
  assert.match(source, /brand-version/);
  assert.match(source, /V\$\{APP_VERSION\}/);
});

test('production Frontstage connects live inputs to rendered outputs and customer presentation', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /addEventListener\('input'/);
  assert.match(source, /data-live="earmarked"/);
  assert.match(source, /data-saving="annualContribution"/);
  assert.match(source, /data-saving="contributionYears"/);
  assert.match(source, /一鍵客戶展示/);
  assert.match(source, /返回規劃/);
  assert.doesNotMatch(source, /plan-table|33 年官方資料/);
});

test('customer journey uses the AVA page control and removes duplicate backward actions', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /function pageControl/);
  assert.match(source, /class="ava-button ava-button--secondary page-back"/);
  assert.match(source, /class="page-progress"/);
  assert.doesNotMatch(source, /上一步|上一題/);
});

test('journey distinguishes direct choice advance from explicit input advance', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /const explicitNext = q\.type !== 'choice'/);
  assert.match(source, /const nextNavigation = explicitNext \? `<div class="step-navigation">/);
  assert.match(source, /<\/article>\$\{nextNavigation\}\$\{mini\}/);
  assert.doesNotMatch(source, /explicitNext \? `<div class="actions">/);
  assert.match(source, /state\.step = nextConversationStep\(state\.step, questions\(\)\.length\)/);
  assert.match(source, /class="ava-button ava-button--primary next"/);
});

test('entry CTA remains in the entry card and ordinary question navigation uses step-navigation', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /class="ava-front__content hero"[\s\S]*class="ava-button ava-button--primary next"[^>]*>開始傾/);
  assert.match(source, /class="ava-button ava-button--secondary page-back"/);
  assert.doesNotMatch(source, /class="ava-button ava-button--secondary back"/);
});

test('choice cards use responsive available width without a universal fixed card height', () => {
  const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.choices\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit/);
  assert.doesNotMatch(styles, /\.ava-front__content\s*\{[^}]*height:/);
});
