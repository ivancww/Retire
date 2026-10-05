import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Retire consumes the canonical Mother Design System locally', () => {
  const index = read('index.html');
  const main = read('src/main.js');
  const productCss = read('styles.css');
  for (const asset of ['design-system/tokens.css', 'design-system/components.css', 'design-system/frontend.css']) assert.match(index, new RegExp(asset.replaceAll('/', '\\/')));
  assert.match(index, /class="app-shell ava-front"/);
  assert.match(main, /ava-front__header/);
  assert.match(main, /ava-front__content/);
  assert.match(main, /ava-button ava-button--primary/);
  assert.match(main, /ava-input/);
  assert.doesNotMatch(productCss, /(^|\n):root\s*\{/);
  assert.doesNotMatch(productCss, /--(?:bg|surface|text|muted|faint|border|primary|brand|soft|gap|radius|target|font)\s*:/);
});

test('Pages validates on PR branches and deploys production only from main', () => {
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /branches:\n\s+- main/);
  assert.doesNotMatch(workflow, /branches:[\s\S]*step-b\/retire-registration-readiness/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /design-system\/tokens\.css/);
  assert.match(workflow, /design-system\/components\.css/);
  assert.match(workflow, /design-system\/frontend\.css/);
});

test('PWA shell owns canonical Design System assets without broad data deletion', () => {
  const sw = read('sw.js');
  for (const asset of ['./design-system/tokens.css', './design-system/components.css', './design-system/frontend.css']) assert.match(sw, new RegExp(asset.replaceAll('/', '\\/')));
  assert.doesNotMatch(sw, /localStorage\.clear|indexedDB\.deleteDatabase|caches\.delete\([^)]*\*/);
});
