import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DOMAIN_LABELS, DOMAIN_OPERATIONS, editableFieldsFor, fieldLabel, operationFor, validateRows } from '../src/admin-contract.js';

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
  assert.throws(() => operationFor('returnRows'), /Unsupported Official domain/);
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
  assert.match(gas, /Return-plan data is read-only/);
  assert.match(gas, /Official identifiers cannot change/);
  assert.match(gas, /expectedRevision/);
  assert.match(gas, /Official revision conflict/);
  assert.match(gas, /retireRestoreSheet_/);
  assert.doesNotMatch(gas, /SpreadsheetApp\.openById\(body|\.getRange\(body/);
  assert.doesNotMatch(gas, /localStorage|sessionStorage|ADMIN_PASSWORD|private.?key/i);
});

test('Admin write flow requires positive acknowledgement and server re-read', () => {
  assert.match(admin, /request\(operationFor\(state\.domain\), \{ rows: source, expectedRevision: state\.revision \}\)/);
  assert.match(admin, /payload\.acknowledged !== true/);
  assert.match(admin, /request\('readOfficialConfig'\)/);
  assert.match(gas, /acknowledged: true/);
  assert.match(gas, /retireOfficialPayload_\(\)/);
});

test('Admin uses semantic true tabs, structured labels, typed controls, and preserves dirty drafts', () => {
  assert.match(admin, /role="tablist"/);
  assert.match(admin, /role="tab"/);
  assert.match(admin, /role="tabpanel"/);
  assert.match(admin, /目前有未保存的編輯/);
  assert.match(admin, /admin-cell.*data-original-type/);
  assert.match(admin, /伺服器重新讀取的 Official 資料與提交內容不一致/);
  assert.match(admin, /伺服器未提供完整 Official 持久化證據/);
  assert.match(admin, /回報表資料為唯讀/);
  assert.deepEqual(editableFieldsFor('pages', { page_id: 'p', page_type: 'conversation', protected: true, title: 'x' }), ['sort_order', 'title', 'subtitle', 'hero_label', 'visible']);
  assert.deepEqual(editableFieldsFor('returnRegistry', { plan_id: 'p', '分頁名稱': 's', '前台顯示名稱': 'x', '排序': 10, '啟用': true }), ['前台顯示名稱', '排序', '啟用']);
  assert.equal(fieldLabel('page_id'), '頁面 ID');
  assert.equal(fieldLabel('sort_order'), '排序');
});

console.log('Retire secure Admin contract, negative authorization/schema cases, and Official acknowledgement checks passed');
