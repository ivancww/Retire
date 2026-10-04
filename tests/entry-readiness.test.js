import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const architecture = fs.readFileSync(new URL('../ARCHITECTURE.md', import.meta.url), 'utf8');

assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('avaEntry'\)/);
assert.match(source, /const USER_ENTRY = ENTRY_MODE === 'user'/);
assert.match(source, /const AVA_PLATFORM_URL = 'https:\/\/ivancww\.github\.io\/avaplatform\/'/);
assert.match(source, /USER_ENTRY \? `.*user-edit-toggle/s);
assert.match(source, /function userEditPanel\(\)/);
assert.match(source, /state\.preview = true/);
assert.match(source, /Object\.assign\(userOverrides, state\.draftOverrides\)/);
assert.match(source, /writeUserData\(\{ \.\.\.state\.data, userOverrides \}\)/);
assert.match(source, /data-override="presentationTitle"/);
assert.match(source, /data-override="presentationSubtitle"/);
assert.match(source, /function presentation\(result\).*userOverrides/s);
assert.doesNotMatch(source, /localStorage\.clear\(|indexedDB\.deleteDatabase\(/);
assert.match(architecture, /retire:user-data:v1.*userOverrides/);
assert.match(architecture, /https:\/\/ivancww\.github\.io\/avaplatform\//);

console.log('Retire entry modes, same-Frontstage User Edit/Preview/Save Local, and Return-to-AVA checks passed');
