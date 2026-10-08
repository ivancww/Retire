import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DOMAIN_LABELS, DOMAIN_OPERATIONS, operationFor, validateRows } from '../src/admin-contract.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('src/admin-auth.js');
const admin = read('src/admin.js');
const gas = read('gas/RetireAdminApi.gs');
const index = read('index.html');
const main = read('src/main.js');

test('Admin entry is grant-gated and does not use browser-persistent authorization', () => {
  assert.match(main, /ENTRY_MODE === 'admin'/);
  assert.match(main, /mountAdmin\(app\)/);
  assert.match(auth, /action: 'exchangeAdminSession'/);
  assert.match(auth, /globalThis\.opener/);
  assert.match(auth, /event\.origin !== PLATFORM_ORIGIN/);
  assert.match(auth, /event\.source !== opener/);
  assert.match(auth, /browserProof/);
  assert.match(auth, /appId: APP_ID/);
  assert.match(auth, /clearLaunchFromUrl\(location\)/);
  assert.doesNotMatch(auth, /localStorage|sessionStorage|indexedDB|password|private.?key/i);
  assert.match(admin, /if \(!hasSession\(\)\)/);
  assert.match(admin, /AVA_RETURN_URL/);
  assert.match(admin, /acknowledged !== true/);
  assert.match(index, /design-system\/management\.css/);
});

test('Unsupported authorization and schema mutations fail before a write', () => {
  assert.throws(() => operationFor('unknown'), /Unsupported Official domain/);
  assert.throws(() => validateRows('returnRows', [{ policyYear: 0, withdrawalRate: 1, multiplier: 1 }]), /Invalid return-plan row/);
  assert.throws(() => validateRows('returnRows', [{ policyYear: 1, withdrawalRate: 'bad', multiplier: 1 }]), /Invalid return-plan row/);
  assert.deepEqual(validateRows('returnRows', [{ policyYear: 1, withdrawalRate: 0, multiplier: 1.16 }]), [{ policyYear: 1, withdrawalRate: 0, multiplier: 1.16 }]);
  assert.equal(DOMAIN_OPERATIONS.settings, 'updateSettings');
  assert.equal(DOMAIN_LABELS.returnRows, '回報表資料');
});

test('Retire backend uses Mother grant verification and fixed schema routes', () => {
  assert.match(gas, /retireAdminAction_\(body\)/);
  assert.match(gas, /action === 'exchangeAdminSession'/);
  assert.match(gas, /action: 'verifyAdminSession'/);
  assert.match(gas, /appId: RETIRE_ADMIN_APP_ID/);
  assert.match(gas, /ava-admin-session-v1/);
  assert.match(gas, /browserProof/);
  assert.match(gas, /RETIRE_ADMIN_SCHEMAS/);
  assert.match(gas, /LockService\.getScriptLock/);
  assert.match(gas, /Return plan is not registered or enabled/);
  assert.match(gas, /Official identifiers cannot change/);
  assert.doesNotMatch(gas, /SpreadsheetApp\.openById\(body|\.getRange\(body/);
  assert.doesNotMatch(gas, /localStorage|sessionStorage|ADMIN_PASSWORD|private.?key/i);
});

test('Admin write flow requires positive acknowledgement and server re-read', () => {
  assert.match(admin, /request\(operationFor\(state\.domain\), body\)/);
  assert.match(admin, /payload\.acknowledged !== true/);
  assert.match(admin, /request\('readOfficialConfig'\)/);
  assert.match(gas, /acknowledged: true/);
  assert.match(gas, /retireOfficialPayload_\(\)/);
});

console.log('Retire secure Admin contract, negative authorization/schema cases, and Official acknowledgement checks passed');
