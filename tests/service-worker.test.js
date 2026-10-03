import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const swSource = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

function createWorkerHarness() {
  const listeners = {};
  const cached = new Map();
  const deleted = [];
  const calls = { skipWaiting: 0, claim: 0, fetch: [] };
  const cache = {
    addAll: async (requests) => requests.forEach((request) => cached.set(String(request), { source: 'precache', ok: true, type: 'basic' })),
    put: async (request, response) => cached.set(request.url || String(request), response),
  };
  const context = {
    URL,
    Promise,
    Response,
    caches: {
      open: async () => cache,
      keys: async () => ['retire-v0.6.0', 'retire-shell', 'other-app-shell'],
      delete: async (name) => { deleted.push(name); return true; },
      match: async (request) => cached.get(request.url || String(request)),
    },
    fetch: async (request, options) => {
      calls.fetch.push({ request, options });
      return { ok: true, type: 'basic', clone() { return this; } };
    },
    self: {
      location: { origin: 'https://retire.example', href: 'https://retire.example/sw.js' },
      clients: { claim: async () => { calls.claim += 1; } },
      skipWaiting: async () => { calls.skipWaiting += 1; },
      addEventListener: (type, listener) => { listeners[type] = listener; },
    },
  };
  vm.runInNewContext(swSource, context);
  return { listeners, cached, deleted, calls };
}

async function lifecycle(harness, type) {
  let task;
  harness.listeners[type]({ waitUntil: (promise) => { task = promise; } });
  await task;
}

test('Retire worker installs, activates, claims, and removes only Retire shell caches', async () => {
  const harness = createWorkerHarness();
  await lifecycle(harness, 'install');
  await lifecycle(harness, 'activate');
  assert.equal(harness.calls.skipWaiting, 1);
  assert.equal(harness.calls.claim, 1);
  assert.deepEqual(harness.deleted, ['retire-v0.6.0']);
  assert.equal(harness.cached.get('./index.html').source, 'precache');
});

test('Retire shell requests revalidate online and retain a fallback cache', async () => {
  const harness = createWorkerHarness();
  let responsePromise;
  harness.listeners.fetch({
    request: { method: 'GET', mode: 'navigate', destination: '', url: 'https://retire.example/' },
    respondWith: (promise) => { responsePromise = promise; },
    waitUntil: () => {},
  });
  await responsePromise;
  assert.equal(harness.calls.fetch[0].options.cache, 'no-store');
  assert.equal(harness.cached.get('https://retire.example/').ok, true);
});

test('production registration checks for updates and bounds controllerchange reloads', () => {
  assert.match(mainSource, /navigator\.serviceWorker\.register\('\.\/sw\.js', \{ scope: '\.\/', updateViaCache: 'none' \}\)/);
  assert.match(mainSource, /\.then\(\(registration\) => registration\.update\(\)\)/);
  assert.match(mainSource, /controllerchange/);
  assert.match(mainSource, /if \(refreshing\) return/);
  assert.match(mainSource, /window\.location\.reload\(\)/);
  assert.doesNotMatch(mainSource, /localStorage\.clear|indexedDB\.deleteDatabase/);
  assert.doesNotMatch(swSource, /caches\.delete\([^)]*\*|localStorage\.clear|indexedDB\.deleteDatabase/);
});

test('Retire version and user data remain independent from the Platform', () => {
  assert.match(fs.readFileSync(new URL('../src/version.js', import.meta.url), 'utf8'), /APP_VERSION/);
  assert.match(fs.readFileSync(new URL('../src/data.js', import.meta.url), 'utf8'), /retire:user-data:v1/);
  assert.doesNotMatch(swSource, /platform|avaplatform/i);
});
