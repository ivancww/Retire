import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../gas/RetireCompleteCandidate.gs', import.meta.url), 'utf8');

class Range {
  constructor(sheet, row, column, numRows, numColumns) { this.sheet = sheet; this.row = row; this.column = column; this.numRows = numRows; this.numColumns = numColumns; }
  getValues() {
    if (this.sheet.failReadsAfterFailure && this.sheet.afterFailure) throw new Error('fixture rollback verification read failure');
    if (this.sheet.failReadsAfterWriteOnce && this.sheet.setCount > 0) { this.sheet.failReadsAfterWriteOnce = false; throw new Error('fixture read-after-write failure'); }
    const values = this.sheet.data.slice(this.row - 1, this.row - 1 + this.numRows).map(values => values.slice(this.column - 1, this.column - 1 + this.numColumns));
    if (this.sheet.readHook) this.sheet.readHook(this.sheet, values);
    return values;
  }
  getFormulas() { return this.sheet.formulas.slice(this.row - 1, this.row - 1 + this.numRows).map(values => values.slice(this.column - 1, this.column - 1 + this.numColumns)); }
  getNumberFormats() { return this.sheet.numberFormats.slice(this.row - 1, this.row - 1 + this.numRows).map(values => values.slice(this.column - 1, this.column - 1 + this.numColumns)); }
  setValues(values) {
    for (let r = 0; r < values.length; r += 1) for (let c = 0; c < values[r].length; c += 1) this.sheet.data[this.row - 1 + r][this.column - 1 + c] = values[r][c];
    for (let r = 0; r < values.length; r += 1) for (let c = 0; c < values[r].length; c += 1) this.sheet.formulas[this.row - 1 + r][this.column - 1 + c] = '';
    this.sheet.setCount += 1;
    if (this.sheet.postSetHook) this.sheet.postSetHook(this.sheet);
    if (this.sheet.failOnSetCall === this.sheet.setCount) { this.sheet.failOnSetCall = null; this.sheet.afterFailure = true; throw new Error('fixture mutation failure'); }
    if (this.sheet.afterFailure && this.sheet.corruptRollbackWrites) this.sheet.data[1][1] = 999;
  }
  setFormula(formula) {
    this.sheet.formulas[this.row - 1][this.column - 1] = formula;
    this.sheet.data[this.row - 1][this.column - 1] = formula;
  }
  setNumberFormats(formats) {
    if (this.sheet.failOnNumberFormatSet && this.sheet.afterFailure) throw new Error('fixture metadata restore failure');
    for (let r = 0; r < formats.length; r += 1) for (let c = 0; c < formats[r].length; c += 1) this.sheet.numberFormats[this.row - 1 + r][this.column - 1 + c] = formats[r][c];
  }
  clearContent() {
    if (this.sheet.failOnClear) throw new Error('fixture clear failure');
    for (let r = 0; r < this.numRows; r += 1) for (let c = 0; c < this.numColumns; c += 1) {
      const row = this.row - 1 + r, column = this.column - 1 + c;
      if (this.sheet.data[row]) this.sheet.data[row][column] = '';
      if (this.sheet.formulas[row]) this.sheet.formulas[row][column] = '';
    }
  }
}

class Sheet {
  constructor(name, data) {
    this.name = name;
    this.data = data.map(row => [...row]);
    this.formulas = this.data.map(row => row.map(value => typeof value === 'string' && value.startsWith('=') ? value : ''));
    this.numberFormats = this.data.map(row => row.map(() => 'General'));
    this.failOnSetCall = null;
    this.failReadsAfterWriteOnce = false;
    this.failReadsAfterFailure = false;
    this.failOnNumberFormatSet = false;
    this.failOnClear = false;
    this.postSetHook = null;
    this.readHook = null;
    this.setCount = 0;
    this.afterFailure = false;
    this.corruptRollbackWrites = false;
  }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(row, column, numRows = 1, numColumns = 1) { return new Range(this, row, column, numRows, numColumns); }
  getLastColumn() {
    let last = 1;
    this.data.forEach((row, rowIndex) => row.forEach((value, column) => { if (value !== '' && value !== null && value !== undefined || this.formulas[rowIndex][column]) last = Math.max(last, column + 1); }));
    return last;
  }
  getLastRow() {
    let last = 1;
    this.data.forEach((row, rowIndex) => { if (row.some((value, column) => value !== '' && value !== null && value !== undefined || this.formulas[rowIndex][column])) last = Math.max(last, rowIndex + 1); });
    return last;
  }
}

class Spreadsheet {
  constructor(sheets) { this.sheets = new Map(sheets.map(sheet => [sheet.name, sheet])); this.failFlushOnce = false; }
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
  context.SpreadsheetApp.flush = () => { if (spreadsheet.failFlushOnce) { spreadsheet.failFlushOnce = false; throw new Error('fixture flush failure'); } };
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
  assert.match(source, /retireVerifyPersistence_/);
  assert.match(source, /retireVerifyRollback_/);
  assert.match(source, /ROLLBACK_FAILED/);
  assert.match(source, /WRITE_ROLLED_BACK/);
});

test('fixture GET contract and dynamic registry preserve six read-only plans', () => {
  const env = setup();
  const health = env.get({ action: 'health' });
  assert.equal(health.ok, true);
  assert.equal(health.app, 'Retire');
  assert.equal(health.apiVersion, '2.0.0');
  assert.match(health.timestamp, /^\d{4}-\d\d-\d\dT/);
  const bootstrap = env.get({ action: 'bootstrap' });
  assert.equal(bootstrap.ok, true);
  assert.deepEqual(Object.keys(bootstrap.data), ['設定', '頁面設定', '選項設定', '退休階段', '資產類別', '計算設定', '回報表設定']);
  assert.equal(bootstrap.returnPlans.length, 6);
  assert.equal(bootstrap.returnPlans[0].displayName, 'Plan 1');
  assert.equal(bootstrap.returnPlans[0].rows[0].withdrawalPercent, 4);
  assert.equal(bootstrap.returnTables, undefined);
  const returnPlans = env.get({ action: 'returnPlans' });
  assert.equal(returnPlans.returnPlans.length, 6);
  assert.equal(returnPlans.generatedAt.startsWith('20'), true);
  const sheet = env.get({ action: 'sheet', name: '設定' });
  assert.equal(sheet.sheet, '設定');
  assert.equal(sheet.headers, undefined);
  assert.equal(sheet.rows[0].key, 'retire_age');
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
    assert.equal(saved.success, true, `${domain} write failed: ${JSON.stringify(saved)}`);
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
  settings.failOnSetCall = settings.setCount + 2;
  const failed = env.post({ action: 'updateSettings', adminSessionProof: proof, rows: failingRows, expectedRevision: after.revision });
  assert.equal(failed.success, false);
  assert.equal(settings.data[1][1], originalValue);
  assert.equal(settings.data[1][4], formulaBefore);
});

function prepareSettingsFault(config = {}) {
  const env = setup();
  const proof = auth(env);
  const read = env.post({ action: 'readOfficialConfig', adminSessionProof: proof });
  const settings = env.spreadsheet.getSheetByName('設定');
  const { failFlushOnce, ...sheetConfig } = config;
  Object.assign(settings, sheetConfig);
  if (failFlushOnce) env.spreadsheet.failFlushOnce = true;
  const rowsToWrite = structuredClone(read.official.domains.settings);
  rowsToWrite[0].value = 70;
  const result = env.post({ action: 'updateSettings', adminSessionProof: proof, rows: rowsToWrite, expectedRevision: read.revision });
  return { env, settings, result };
}

test('fault injection rejects every persistence mismatch and never reports success', () => {
  const cases = [
    ['submitted field persisted incorrectly', { postSetHook: sheet => { if (sheet.setCount <= 2) sheet.data[1][1] = 999; } }],
    ['silent Google Sheets value mismatch', { readHook: (sheet, values) => { if (sheet.setCount > 0 && !sheet.readCorrupted) { sheet.readCorrupted = true; values[1][1] = 999; } } }],
    ['missing persisted record', { postSetHook: sheet => { if (sheet.setCount <= 2) sheet.data[1].fill(''); } }],
    ['extra unexpected record', { postSetHook: sheet => { if (sheet.setCount === 1) { sheet.data.push([...sheet.data[1]]); sheet.formulas.push([...sheet.formulas[1]]); sheet.numberFormats.push([...sheet.numberFormats[1]]); } } }],
    ['stable identity mismatch', { postSetHook: sheet => { if (sheet.setCount <= 2) sheet.data[1][0] = 'changed-id'; } }],
    ['protected field changed unexpectedly', { postSetHook: sheet => { if (sheet.setCount <= 2) sheet.data[1][2] = 'text'; } }]
  ];
  for (const [label, config] of cases) {
    const { result } = prepareSettingsFault(config);
    assert.equal(result.success, false, label);
    assert.notEqual(result.persisted, true, label);
    assert.notEqual(result.readAfterWrite, true, label);
    assert.equal(result.failureCode, 'WRITE_ROLLED_BACK', label);
    assert.equal(result.rollback.verified, true, label);
  }
});

test('fault injection covers mutation, flush, metadata, read-after-write, and rollback failures', () => {
  const rolledBack = [
    ['target-cell mutation failure', { failOnSetCall: 2 }],
    ['Spreadsheet flush failure', { failFlushOnce: true }],
    ['read-after-write failure', { failReadsAfterWriteOnce: true }]
  ];
  for (const [label, config] of rolledBack) {
    const { env, result } = prepareSettingsFault(config);
    assert.equal(result.success, false, label);
    assert.equal(result.failureCode, 'WRITE_ROLLED_BACK', label);
    assert.equal(result.rollback.verified, true, label);
    assert.equal(env.spreadsheet.getSheetByName('設定').data[1][1], 65, label);
  }

  const rollbackFailed = [
    ['metadata restore failure', { failOnSetCall: 2, failOnNumberFormatSet: true }],
    ['rollback silently fails', { failOnSetCall: 2, corruptRollbackWrites: true }],
    ['rollback read-back differs', { failOnSetCall: 2, readHook: (sheet, values) => { if (sheet.setCount > 0) values[1][1] = 999; } }],
    ['rollback verification throws', { failOnSetCall: 2, failReadsAfterFailure: true }]
  ];
  for (const [label, config] of rollbackFailed) {
    const { result } = prepareSettingsFault(config);
    assert.equal(result.success, false, label);
    assert.equal(result.persisted, false, label);
    assert.equal(result.failureCode, 'ROLLBACK_FAILED', label);
    assert.equal(result.rollback.verified, false, label);
  }
});

test('successful publish returns only verified persisted evidence and preserves unknown columns', () => {
  const env = setup();
  const proof = auth(env);
  const read = env.post({ action: 'readOfficialConfig', adminSessionProof: proof });
  const settings = env.spreadsheet.getSheetByName('設定');
  const rowsToWrite = structuredClone(read.official.domains.settings);
  rowsToWrite[0].value = 71;
  const result = env.post({ action: 'updateSettings', adminSessionProof: proof, rows: rowsToWrite, expectedRevision: read.revision });
  assert.equal(result.success, true);
  assert.equal(result.persisted, true);
  assert.equal(result.readAfterWrite, true);
  assert.equal(result.evidence.serverReadAfterWrite, true);
  assert.equal(result.evidence.revision, result.revision);
  assert.equal(result.official.domains.settings[0].value, 71);
  assert.equal(settings.data[1][4], '=B2*1');
});

