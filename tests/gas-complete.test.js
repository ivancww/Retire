import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../gas/RetireCompleteCandidate.gs', import.meta.url), 'utf8');

class Range {
  constructor(sheet, row, column, numRows, numColumns) { this.sheet = sheet; this.row = row; this.column = column; this.numRows = numRows; this.numColumns = numColumns; }
  getValues() { return this.sheet.data.slice(this.row - 1, this.row - 1 + this.numRows).map(values => values.slice(this.column - 1, this.column - 1 + this.numColumns)); }
  setValues(values) {
    for (let r = 0; r < values.length; r += 1) for (let c = 0; c < values[r].length; c += 1) this.sheet.data[this.row - 1 + r][this.column - 1 + c] = values[r][c];
    if (this.sheet.failAfterSet) { this.sheet.failAfterSet = false; throw new Error('fixture read-after-write failure'); }
  }
}

class Sheet {
  constructor(name, data) { this.name = name; this.data = data.map(row => [...row]); this.failAfterSet = false; }
  getDataRange() { return new Range(this, 1, 1, this.data.length, this.data[0].length); }
  getRange(row, column, numRows = 1, numColumns = 1) { return new Range(this, row, column, numRows, numColumns); }
  getLastColumn() { return this.data[0].length; }
  getLastRow() { return this.data.length; }
}

class Spreadsheet {
  constructor(sheets) { this.sheets = new Map(sheets.map(sheet => [sheet.name, sheet])); }
  getSheetByName(name) { return this.sheets.get(name); }
}

const rows = (headers, values) => [headers, ...values];
const planNames = ['回報表_auto', '回報表_withdraw8', '回報表_withdraw15', '回報表_withdraw20', '回報表_withdraw25', '回報表_withdraw30'];
const fixtureSheets = [
  new Sheet('設定', rows(['key', 'value', 'type', 'description', 'formula'], [['retire_age', 65, 'number', 'retirement age', '=B2*1']])),
  new Sheet('頁面設定', rows(['page_id', 'sort_order', 'page_type', 'title', 'subtitle', 'hero_label', 'visible', 'protected'], [['home', 1, 'conversation', 'Home', 'Sub', 'Hero', true, false]])),
  new Sheet('選項設定', rows(['group_id', 'option_id', 'sort_order', 'label', 'value', 'active'], [['income', 'salary', 1, 'Salary', 'salary', true]])),
  new Sheet('退休階段', rows(['stage_id', 'sort_order', 'name', 'start_age', 'end_age', 'spending_percent', 'active', 'description'], [['early', 1, 'Early', 60, 70, 100, true, 'early stage']])),
  new Sheet('資產類別', rows(['asset_id', 'sort_order', 'name', 'default_growth_rate', 'active', 'description'], [['equity', 1, 'Equity', 0.05, true, 'equity']])),
  new Sheet('計算設定', rows(['calculation_id', 'name', 'enabled', 'detail_default_open', 'description'], [['sustainability', 'Sustainability', true, false, 'calc']])),
  new Sheet('回報表設定', rows(['plan_id', '分頁名稱', '前台顯示名稱', '排序', '啟用'], planNames.map((sheetName, index) => [sheetName.replace('回報表_', ''), sheetName, `Plan ${index + 1}`, index + 1, true])))
];
for (const [index, sheetName] of planNames.entries()) fixtureSheets.push(new Sheet(sheetName, rows(['保單年度', '領取百分比', '倍數'], [[1, 0.04 + index / 1000, 1.1], [2, 0.045 + index / 1000, 1.2]])));

function setup() {
  const spreadsheet = new Spreadsheet(fixtureSheets.map(sheet => new Sheet(sheet.name, sheet.data)));
  const locks = { waited: 0, released: 0 };
  const context = {
    SpreadsheetApp: { getActive: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'AVA_PLATFORM_ADMIN_AUTH_URL' ? 'https://ava.test/admin-auth' : null }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { locks.waited += 1; }, releaseLock: () => { locks.released += 1; } }) },
    UrlFetchApp: { fetch: (_url, options) => {
      const request = JSON.parse(options.payload);
      const body = request.action === 'exchangeAdminSession'
        ? { success: true, appId: 'retire', adminSessionProof: 'fixture-proof', expiresAt: new Date(Date.now() + 3600000).toISOString(), contract: 'ava-admin-session-v1' }
        : { success: true, appId: 'retire', expiresAt: new Date(Date.now() + 3600000).toISOString(), contract: 'ava-admin-session-v1' };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
    } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(String(value), 'utf8').digest()]
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: value => ({ value, setMimeType() { return this; }, getContentText() { return this.value; } }) }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'RetireCompleteCandidate.gs' });
  const post = body => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).getContentText());
  const get = parameter => JSON.parse(context.doGet({ parameter }).getContentText());
  return { context, spreadsheet, locks, post, get };
}

function auth(env) {
  const exchange = env.post({ action: 'exchangeAdminSession', appId: 'retire', launchTicket: 'fixture-ticket', browserProof: 'browser-proof', launchNonce: 'nonce' });
  assert.equal(exchange.success, true);
  return exchange.adminSessionProof;
}

test('complete GAS candidate has one GET and one POST entry point', () => {
  assert.equal((source.match(/function doGet\s*\(/g) || []).length, 1);
  assert.equal((source.match(/function doPost\s*\(/g) || []).length, 1);
  assert.match(source, /RETIRE_API_VERSION = '2\.0\.0'/);
  assert.match(source, /Return-plan data is read-only/);
  assert.match(source, /LockService\.getScriptLock/);
  assert.match(source, /serverReadAfterWrite: true/);
});

test('fixture GET contract and dynamic registry preserve six read-only plans', () => {
  const env = setup();
  assert.deepEqual(env.get({ action: 'health' }), { ok: true, app: 'Retire', apiVersion: '2.0.0' });
  const bootstrap = env.get({ action: 'bootstrap' });
  assert.equal(bootstrap.ok, true);
  assert.deepEqual(Object.keys(bootstrap.data), ['settings', 'pages', 'options', 'stages', 'assets', 'calculations', 'returnRegistry']);
  assert.equal(bootstrap.returnPlans.length, 6);
  assert.equal(bootstrap.returnPlans[0].displayName, 'Plan 1');
  assert.equal(bootstrap.returnTables.auto[0].withdrawalPercent, 4);
  assert.equal(env.get({ action: 'returnPlans' }).returnPlans.length, 6);
  const sheet = env.get({ action: 'sheet', sheetName: '設定' });
  assert.deepEqual(sheet.headers, ['key', 'value', 'type', 'description', 'formula']);
});

test('fixture Admin authorization, all writable domains, revision, lock, and read-after-write', () => {
  const env = setup();
  assert.equal(env.post({ action: 'readOfficialConfig' }).success, false);
  const proof = auth(env);
  const read = env.post({ action: 'readOfficialConfig', adminSessionProof: proof });
  assert.equal(read.success, true);
  const cases = [
    ['settings', 'value', 66], ['pages', 'title', 'Updated home'], ['options', 'label', 'Updated salary'],
    ['stages', 'name', 'Updated early'], ['assets', 'name', 'Updated equity'], ['calculations', 'name', 'Updated calc'],
    ['returnRegistry', '前台顯示名稱', 'Updated plan']
  ];
  let revision = read.revision;
  for (const [domain, field, value] of cases) {
    const payload = structuredClone(read.official.domains[domain]);
    payload[0][field] = value;
    const operation = { settings: 'updateSettings', pages: 'updatePageSettings', options: 'updateOptions', stages: 'updateRetirementStages', assets: 'updateAssetCategories', calculations: 'updateCalculationSettings', returnRegistry: 'updateReturnPlanRegistry' }[domain];
    const saved = env.post({ action: operation, adminSessionProof: proof, rows: payload, expectedRevision: revision });
    assert.equal(saved.success, true, `${domain} write failed: ${saved.error}`);
    assert.equal(saved.acknowledged, true);
    assert.equal(saved.persisted, true);
    assert.equal(saved.readAfterWrite, true);
    assert.equal(saved.evidence.serverReadAfterWrite, true);
    revision = saved.revision;
  }
  assert.ok(env.locks.waited >= 7);
  assert.equal(env.locks.waited, env.locks.released);
});

test('fixture rejects direct writes, protected fields, stale revisions, and return-row writes', () => {
  const env = setup();
  const proof = auth(env);
  const read = env.post({ action: 'readOfficialConfig', adminSessionProof: proof });
  const protectedRows = structuredClone(read.official.domains.pages);
  protectedRows[0].page_id = 'changed-id';
  const protectedResult = env.post({ action: 'updatePageSettings', adminSessionProof: proof, rows: protectedRows, expectedRevision: read.revision });
  assert.equal(protectedResult.success, false);
  assert.match(protectedResult.error, /Protected Official field/);
  const staleRows = structuredClone(read.official.domains.settings);
  staleRows[0].value = 99;
  const stale = env.post({ action: 'updateSettings', adminSessionProof: proof, rows: staleRows, expectedRevision: 'stale-revision' });
  assert.equal(stale.success, false);
  assert.match(stale.error, /revision conflict/);
  const readonly = env.post({ action: 'updateReturnPlanRows', adminSessionProof: proof, rows: [] });
  assert.equal(readonly.success, false);
  assert.match(readonly.error, /read-only/);
});

test('fixture writes only allowlisted columns and restores them after a failed write', () => {
  const env = setup();
  const proof = auth(env);
  const before = env.post({ action: 'readOfficialConfig', adminSessionProof: proof });
  const settings = env.spreadsheet.getSheetByName('設定');
  const formulaBefore = settings.data[1][4];
  const rowsToWrite = structuredClone(before.official.domains.settings);
  rowsToWrite[0].value = 67;
  const ok = env.post({ action: 'updateSettings', adminSessionProof: proof, rows: rowsToWrite, expectedRevision: before.revision });
  assert.equal(ok.success, true);
  assert.equal(settings.data[1][4], formulaBefore);
  const after = env.post({ action: 'readOfficialConfig', adminSessionProof: proof });
  const originalValue = after.official.domains.settings[0].value;
  const failingRows = structuredClone(after.official.domains.settings);
  failingRows[0].value = 68;
  settings.failAfterSet = true;
  const failed = env.post({ action: 'updateSettings', adminSessionProof: proof, rows: failingRows, expectedRevision: after.revision });
  assert.equal(failed.success, false);
  assert.equal(settings.data[1][1], originalValue);
  assert.equal(settings.data[1][4], formulaBefore);
});

