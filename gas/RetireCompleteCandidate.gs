/**
 * AVA Retire complete GAS candidate.
 *
 * CANDIDATE — NOT DEPLOYED.
 * Reconciled against deployed Retire version 8, verified Sheet headers, and
 * the repository Admin contract. Preserve the legacy GET envelope exactly;
 * compare this candidate with the deployment owner's source before release.
 *
 * This file is intentionally self-contained: exactly one doGet and one
 * doPost are defined. Return-plan rows are read-only. The bound spreadsheet
 * is never selected by browser input.
 */
const RETIRE_API_VERSION = '2.0.0';
const RETIRE_APP_ID = 'retire';
const RETIRE_SHEETS = Object.freeze({
  settings: '設定', pages: '頁面設定', options: '選項設定', stages: '退休階段',
  assets: '資產類別', calculations: '計算設定', returnRegistry: '回報表設定'
});
const RETIRE_SCHEMAS = Object.freeze({
  updateSettings: { domain: 'settings', fields: ['key', 'value', 'type', 'description'], id: 'key' },
  updatePageSettings: { domain: 'pages', fields: ['page_id', 'sort_order', 'page_type', 'title', 'subtitle', 'hero_label', 'visible', 'protected'], id: 'page_id' },
  updateOptions: { domain: 'options', fields: ['group_id', 'option_id', 'sort_order', 'label', 'value', 'active'], id: 'option_id' },
  updateRetirementStages: { domain: 'stages', fields: ['stage_id', 'sort_order', 'name', 'start_age', 'end_age', 'spending_percent', 'active', 'description'], id: 'stage_id' },
  updateAssetCategories: { domain: 'assets', fields: ['asset_id', 'sort_order', 'name', 'default_growth_rate', 'active', 'description'], id: 'asset_id' },
  updateCalculationSettings: { domain: 'calculations', fields: ['calculation_id', 'name', 'enabled', 'detail_default_open', 'description'], id: 'calculation_id' },
  updateReturnPlanRegistry: { domain: 'returnRegistry', fields: ['plan_id', '分頁名稱', '前台顯示名稱', '排序', '啟用'], id: 'plan_id' }
});
const RETIRE_READ_ONLY_FIELDS = Object.freeze({
  settings: ['key', 'type'], pages: ['page_id', 'page_type', 'protected'],
  options: ['group_id', 'option_id', 'value'], stages: ['stage_id'], assets: ['asset_id'],
  calculations: ['calculation_id'], returnRegistry: ['plan_id', '分頁名稱']
});

function retireEditableFields_(schema) {
  return schema.fields.filter(field => !(RETIRE_READ_ONLY_FIELDS[schema.domain] || []).includes(field));
}

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'bootstrap').trim();
    if (action === 'health') return retireJson_({ ok: true, app: 'Retire', apiVersion: RETIRE_API_VERSION, timestamp: new Date().toISOString() });
    if (action === 'bootstrap') return retireLegacyBootstrap_();
    if (action === 'returnPlans') {
      return retireJson_({ ok: true, app: 'Retire', apiVersion: RETIRE_API_VERSION, generatedAt: new Date().toISOString(), returnPlans: retireLegacyLoadReturnPlans_() });
    }
    if (action === 'sheet') {
      const parameter = (e && e.parameter) || {};
      const requested = String(parameter.name || '').trim();
      if (!requested) throw new Error('Missing sheet name');
      if (!retireLegacyIsAllowedSheet_(requested)) throw new Error('Sheet not allowed: ' + requested);
      return retireJson_({ ok: true, app: 'Retire', apiVersion: RETIRE_API_VERSION, sheet: requested, rows: retireLegacyReadSheetObjects_(requested) });
    }
    throw new Error('Unsupported Retire GET action');
  } catch (error) {
    return retireJson_({ ok: false, app: 'Retire', apiVersion: RETIRE_API_VERSION, error: String(error.message || 'Retire GET failed') });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    const body = raw ? JSON.parse(raw) : {};
    return retireJson_(retireAdminAction_(body));
  } catch (error) {
    return retireJson_({ success: false, error: String(error.message || 'Retire Admin request failed') });
  }
}

function retireJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function retireLegacyBootstrap_() {
  const data = {};
  ['設定', '頁面設定', '選項設定', '退休階段', '資產類別', '計算設定', '回報表設定'].forEach(sheetName => { data[sheetName] = retireLegacyReadSheetObjects_(sheetName); });
  return retireJson_({ ok: true, app: 'Retire', apiVersion: RETIRE_API_VERSION, generatedAt: new Date().toISOString(), data: data, returnPlans: retireLegacyLoadReturnPlans_() });
}

function retireLegacyLoadReturnPlans_() {
  const plans = retireLegacyReadSheetObjects_('回報表設定').filter(row => retireLegacyIsEnabled_(row['啟用'])).map(row => ({
    planId: String(row['plan_id'] || '').trim(), sheetName: String(row['分頁名稱'] || '').trim(),
    displayName: String(row['前台顯示名稱'] || row['分頁名稱'] || '').trim(), sortOrder: retireLegacyToNumber_(row['排序'], 9999)
  })).filter(plan => plan.planId && plan.sheetName);
  const ids = {}, sheets = {};
  plans.forEach(plan => { if (ids[plan.planId]) throw new Error('Duplicate return plan ID: ' + plan.planId); if (sheets[plan.sheetName]) throw new Error('Duplicate return-plan sheet: ' + plan.sheetName); ids[plan.planId] = true; sheets[plan.sheetName] = true; });
  plans.sort((a, b) => a.sortOrder - b.sortOrder);
  return plans.map(plan => ({ planId: plan.planId, sheetName: plan.sheetName, displayName: plan.displayName, sortOrder: plan.sortOrder, rows: retireLegacyReadReturnTable_(plan.sheetName) }));
}

function retireLegacyReadReturnTable_(sheetName) {
  const values = retireSheet_(sheetName).getDataRange().getValues();
  if (!values || values.length < 2) return [];
  const headers = values[0].map(value => String(value).trim());
  const yearIndex = headers.indexOf('保單年度'), rateIndex = headers.indexOf('領取百分比'), multiplierIndex = headers.indexOf('倍數');
  if (yearIndex < 0 || rateIndex < 0 || multiplierIndex < 0) throw new Error('回報分頁「' + sheetName + '」必須包含：保單年度、領取百分比、倍數');
  const rows = [];
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i], year = retireLegacyToNumber_(row[yearIndex], null), withdrawalRate = retireLegacyNormalizePercentage_(row[rateIndex]), multiplier = retireLegacyToNumber_(row[multiplierIndex], null);
    if (year === null && withdrawalRate === null && multiplier === null) continue;
    if (year === null || withdrawalRate === null || multiplier === null) throw new Error('回報分頁「' + sheetName + '」第 ' + (i + 1) + ' 行資料無效');
    rows.push({ policyYear: year, withdrawalRate: withdrawalRate, withdrawalPercent: withdrawalRate * 100, multiplier: multiplier });
  }
  return rows.sort((a, b) => a.policyYear - b.policyYear);
}

function retireLegacyReadSheetObjects_(sheetName) {
  const values = retireSheet_(sheetName).getDataRange().getValues();
  if (!values || !values.length) return [];
  const headers = values[0].map(value => String(value).trim()), rows = [];
  for (let r = 1; r < values.length; r += 1) {
    if (values[r].every(value => value === '' || value === null)) continue;
    const object = {};
    headers.forEach((header, c) => { if (header) object[header] = values[r][c] instanceof Date ? values[r][c].toISOString() : values[r][c]; });
    rows.push(object);
  }
  return rows;
}

function retireLegacyIsAllowedSheet_(sheetName) {
  if (['設定', '頁面設定', '選項設定', '退休階段', '資產類別', '計算設定', '回報表設定'].includes(sheetName)) return true;
  return retireLegacyReadSheetObjects_('回報表設定').some(row => retireLegacyIsEnabled_(row['啟用']) && String(row['分頁名稱'] || '').trim() === sheetName);
}
function retireLegacyIsEnabled_(value) { return value === true || String(value).toLowerCase() === 'true' || value === 1; }
function retireLegacyNormalizePercentage_(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (!text) return null;
  if (text.endsWith('%')) { const number = Number(text.slice(0, -1)); return Number.isFinite(number) ? number / 100 : null; }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
function retireLegacyToNumber_(value, fallback) { if (value === '' || value === null || value === undefined) return fallback; const number = Number(value); return Number.isFinite(number) ? number : fallback; }

function retireAdminAction_(body) {
  try {
    if (body.action === 'exchangeAdminSession') return retireExchange_(body);
    if (body.action === 'readOfficialConfig') { retireVerify_(body.adminSessionProof, 'official-read'); return retireAdminRead_(); }
    const schema = RETIRE_SCHEMAS[body.action];
    if (schema) { retireVerify_(body.adminSessionProof, body.action); return retireAdminWrite_(body.action, body, schema); }
    if (body.action === 'updateReturnPlanRows') throw new Error('Return-plan data is read-only');
    throw new Error('Unsupported Retire Admin action');
  } catch (error) {
    return retireFailure_(null, error, null);
  }
}

function retireExchange_(body) {
  if (String(body.appId || '') !== RETIRE_APP_ID || !String(body.launchTicket || '')) throw new Error('Invalid Retire Admin launch');
  const endpoint = PropertiesService.getScriptProperties().getProperty('AVA_PLATFORM_ADMIN_AUTH_URL');
  if (!endpoint) throw new Error('Retire Admin authorization is not configured');
  const response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'exchangeAdminSession', launchTicket: String(body.launchTicket), browserProof: String(body.browserProof || ''), launchNonce: String(body.launchNonce || ''), appId: RETIRE_APP_ID }), muteHttpExceptions: true });
  const payload = retireResponse_(response);
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || payload.success !== true || payload.appId !== RETIRE_APP_ID || !payload.adminSessionProof || payload.contract !== 'ava-admin-session-v1') throw new Error('Invalid or expired AVA Admin launch');
  return { success: true, appId: RETIRE_APP_ID, adminSessionProof: String(payload.adminSessionProof), expiresAt: payload.expiresAt, contract: 'ava-admin-session-v1' };
}

function retireVerify_(proof, operation) {
  const endpoint = PropertiesService.getScriptProperties().getProperty('AVA_PLATFORM_ADMIN_AUTH_URL');
  if (!endpoint || !String(proof || '')) throw new Error('Retire Admin authorization is required');
  const response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'verifyAdminSession', adminSessionProof: String(proof), appId: RETIRE_APP_ID, operation: String(operation || 'official-write') }), muteHttpExceptions: true });
  const payload = retireResponse_(response);
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || payload.success !== true || payload.appId !== RETIRE_APP_ID || payload.contract !== 'ava-admin-session-v1' || (payload.expiresAt && new Date(payload.expiresAt).getTime() <= Date.now())) throw new Error('Invalid or expired Retire Admin authorization');
  return payload;
}

function retireAdminRead_() {
  const official = retireOfficialPayload_();
  return { success: true, appId: RETIRE_APP_ID, official: retireAdminConfig_(official), revision: retireRevision_(official) };
}

function retireAdminWrite_(operation, body, schema) {
  return retireReplaceDomain_(operation, schema, body.rows, body.expectedRevision);
}

function retireReplaceDomain_(operation, schema, rows, expectedRevision) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Official rows are required');
  const before = retireOfficialPayload_();
  if (!expectedRevision || String(expectedRevision) !== retireRevision_(before)) throw new Error('Official revision conflict; reload before saving');
  const sheet = retireSheet_(RETIRE_SHEETS[schema.domain]);
  const existing = retireRows_(sheet), allowedIds = existing.map(row => String(row[schema.id]));
  if (rows.length !== existing.length) throw new Error('Official row count cannot change');
  const normalized = rows.map((row, index) => retireNormalizeRow_(schema, row, existing[index]));
  const ids = normalized.map(row => String(row[schema.id]));
  if (new Set(ids).size !== ids.length || ids.some(id => !allowedIds.includes(id))) throw new Error('Official identifiers cannot change');
  if (schema.domain === 'returnRegistry') {
    const known = existing.map(row => String(row['分頁名稱']));
    if (new Set(normalized.map(row => String(row['分頁名稱']))).size !== normalized.length || normalized.some(row => !known.includes(String(row['分頁名稱'])))) throw new Error('Return-plan registry may only reference existing registered sheets');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let snapshot = null;
  try {
    const lockedBefore = retireOfficialPayload_();
    if (String(expectedRevision) !== retireRevision_(lockedBefore)) throw new Error('Official revision conflict; reload before saving');
    snapshot = retireSnapshot_(sheet, schema);
    retireWrite_(sheet, schema, normalized);
    SpreadsheetApp.flush();
    const after = retireOfficialPayload_();
    retireVerifyPersistence_(sheet, schema, snapshot, lockedBefore, normalized, after);
    const revision = retireRevision_(after);
    return { success: true, appId: RETIRE_APP_ID, acknowledged: true, persisted: true, readAfterWrite: true, revision: revision, operation: operation, official: retireAdminConfig_(after), evidence: { serverReadAfterWrite: true, persistedDomains: [schema.domain], verifiedFields: schema.fields, protectedReturnTables: true, revision: revision } };
  } catch (error) {
    if (!snapshot) throw error;
    try {
      retireRestore_(sheet, snapshot);
      SpreadsheetApp.flush();
      const rollback = retireVerifyRollback_(sheet, snapshot, before, retireRevision_(before));
      return retireFailure_(operation, error, rollback);
    } catch (rollbackError) {
      return retireFailure_(operation, retireError_('ROLLBACK_FAILED', 'Official write failed and rollback could not be verified'), { attempted: true, verified: false, error: String(rollbackError.message || rollbackError), sourceError: String(error.message || error) });
    }
  } finally {
    lock.releaseLock();
  }
}

function retireError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function retireFailure_(operation, error, rollback) {
  const failureCode = rollback && rollback.verified === false ? 'ROLLBACK_FAILED' : (rollback && rollback.verified === true ? 'WRITE_ROLLED_BACK' : (error && error.code) || 'ADMIN_REQUEST_FAILED');
  return { success: false, appId: RETIRE_APP_ID, acknowledged: false, persisted: false, readAfterWrite: false, operation: operation || undefined, failureCode: failureCode, error: String(error && error.message || 'Retire Admin request failed'), rollback: rollback || { attempted: false, verified: false }, evidence: { serverReadAfterWrite: false, persisted: false, rollbackVerified: Boolean(rollback && rollback.verified === true) } };
}

function retireNormalizeRow_(schema, input, existing) {
  if (!input || typeof input !== 'object') throw new Error('Invalid Official row');
  const extra = Object.keys(input).filter(key => !schema.fields.includes(key));
  if (extra.length) throw new Error('Unsupported Official field');
  const row = {};
  schema.fields.forEach(field => {
    if (input[field] === undefined || input[field] === null) throw new Error('Missing Official field: ' + field);
    row[field] = retireCoerce_(field, input[field]);
  });
  if (!String(row[schema.id]).trim()) throw new Error('Official identifier is required');
  (RETIRE_READ_ONLY_FIELDS[schema.domain] || []).forEach(field => {
    if (existing && String(row[field]) !== String(existing[field])) throw new Error('Protected Official field cannot change: ' + field);
  });
  if (schema.domain === 'settings') {
    if (!['text', 'number', 'boolean'].includes(row.type)) throw new Error('Unsupported setting type');
    if (row.type === 'number') { if (!Number.isFinite(Number(input.value))) throw new Error('Invalid setting number'); row.value = Number(input.value); }
    if (row.type === 'boolean') { const value = String(input.value).toLowerCase(); if (!['true', 'false', '1', '0'].includes(value)) throw new Error('Invalid setting boolean'); row.value = ['true', '1'].includes(value); }
  }
  if (schema.domain === 'stages' && (row.start_age < 0 || row.end_age < row.start_age || row.spending_percent < 0)) throw new Error('Invalid retirement stage values');
  if (schema.domain === 'assets' && !Number.isFinite(row.default_growth_rate)) throw new Error('Invalid asset growth rate');
  return row;
}

function retireCoerce_(field, value) {
  if (['sort_order', '排序', 'start_age', 'end_age', 'spending_percent', 'default_growth_rate'].includes(field)) { const n = Number(value); if (!Number.isFinite(n)) throw new Error('Invalid number: ' + field); return n; }
  if (['visible', 'protected', 'active', 'enabled', 'detail_default_open', '啟用'].includes(field)) { const s = String(value).toLowerCase(); if (!['true', 'false', '1', '0'].includes(s)) throw new Error('Invalid boolean: ' + field); return ['true', '1'].includes(s); }
  return String(value);
}

function retireWrite_(sheet, schema, rows) {
  const headers = retireHeaders_(sheet);
  retireEditableFields_(schema).forEach(field => {
    const index = headers.indexOf(field);
    if (index < 0) throw new Error('Configured Official header is unavailable: ' + field);
    sheet.getRange(2, index + 1, rows.length, 1).setValues(rows.map(row => [row[field]]));
  });
}

function retireCapture_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  return { headers: values[0].map(String), values: values, formulas: range.getFormulas(), numberFormats: range.getNumberFormats() };
}

function retireSnapshot_(sheet, schema) {
  const snapshot = retireCapture_(sheet);
  schema.fields.forEach(field => { if (snapshot.headers.indexOf(field) < 0) throw new Error('Configured Official header is unavailable: ' + field); });
  return snapshot;
}

function retireCaptureRecords_(capture, schema) {
  const records = {};
  for (let rowIndex = 1; rowIndex < capture.values.length; rowIndex += 1) {
    const values = capture.values[rowIndex];
    if (values.every(value => value === '' || value === null)) continue;
    const row = Object.fromEntries(capture.headers.map((header, column) => [header, values[column]]));
    const identity = retireStableIdentity_(row[schema.id]);
    if (records[identity]) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Duplicate Official stable identity: ' + identity);
    records[identity] = { row: row, rowIndex: rowIndex };
  }
  return records;
}

function retireStableIdentity_(value) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Official stable identity is required');
  return String(value).trim();
}

function retireNumberEquivalent_(expected, actual) {
  const expectedNumber = typeof expected === 'number' ? expected : Number(String(expected).trim());
  const actualNumber = typeof actual === 'number' ? actual : Number(String(actual).trim());
  return Number.isFinite(expectedNumber) && Number.isFinite(actualNumber) && Object.is(expectedNumber, actualNumber);
}

function retireBooleanEquivalent_(expected, actual) {
  const parse = value => {
    if (value === true || value === 1 || (typeof value === 'string' && ['true', '1'].includes(value.toLowerCase()))) return true;
    if (value === false || value === 0 || (typeof value === 'string' && ['false', '0'].includes(value.toLowerCase()))) return false;
    return null;
  };
  const expectedValue = parse(expected), actualValue = parse(actual);
  return expectedValue !== null && actualValue !== null && expectedValue === actualValue;
}

function retireTechnicalEquivalent_(expected, actual) {
  if ((expected === '' || expected === null || expected === undefined) && (actual === '' || actual === null || actual === undefined)) return true;
  if (expected instanceof Date || actual instanceof Date) return expected instanceof Date && actual instanceof Date && expected.getTime() === actual.getTime();
  if (typeof expected === 'number' || typeof actual === 'number') return typeof expected === 'number' && typeof actual === 'number' && Object.is(expected, actual);
  if (typeof expected === 'boolean' || typeof actual === 'boolean') return typeof expected === 'boolean' && typeof actual === 'boolean' && expected === actual;
  return expected === actual;
}

function retireFieldEquivalent_(schema, field, expected, actual, expectedRow) {
  if (field === schema.id) return retireStableIdentity_(expected) === retireStableIdentity_(actual);
  if (['sort_order', '排序', 'start_age', 'end_age', 'spending_percent', 'default_growth_rate'].includes(field)) return retireNumberEquivalent_(expected, actual);
  if (['visible', 'protected', 'active', 'enabled', 'detail_default_open', '啟用'].includes(field)) return retireBooleanEquivalent_(expected, actual);
  if (schema.domain === 'settings' && field === 'value' && expectedRow.type === 'number') return retireNumberEquivalent_(expected, actual);
  if (schema.domain === 'settings' && field === 'value' && expectedRow.type === 'boolean') return retireBooleanEquivalent_(expected, actual);
  return retireTechnicalEquivalent_(expected, actual);
}

function retireAssertCaptureShape_(before, after) {
  if (JSON.stringify(before.headers) !== JSON.stringify(after.headers) || before.values.length !== after.values.length || before.headers.length !== after.headers.length) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Official Sheet structure changed during write');
}

function retireVerifyPersistence_(sheet, schema, beforeSnapshot, beforePayload, expectedRows, afterPayload) {
  const afterSnapshot = retireCapture_(sheet);
  retireAssertCaptureShape_(beforeSnapshot, afterSnapshot);
  const beforeRecords = retireCaptureRecords_(beforeSnapshot, schema), afterRecords = retireCaptureRecords_(afterSnapshot, schema);
  const expectedKeys = expectedRows.map(row => retireStableIdentity_(row[schema.id]));
  const actualKeys = Object.keys(afterRecords);
  if (expectedKeys.length !== actualKeys.length || new Set(expectedKeys).size !== expectedKeys.length || expectedKeys.some(key => !afterRecords[key])) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Official persisted record set does not match the submitted record set');
  expectedRows.forEach(expected => {
    const identity = retireStableIdentity_(expected[schema.id]), actual = afterRecords[identity].row;
    schema.fields.forEach(field => { if (!retireFieldEquivalent_(schema, field, expected[field], actual[field], expected)) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Official persisted field mismatch: ' + field); });
  });
  const payloadRecords = {};
  (afterPayload.data[schema.domain] || []).forEach(row => {
    const identity = retireStableIdentity_(row[schema.id]);
    if (payloadRecords[identity]) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Duplicate persisted payload identity: ' + identity);
    payloadRecords[identity] = row;
  });
  if (Object.keys(payloadRecords).length !== expectedKeys.length || expectedKeys.some(key => !payloadRecords[key])) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Persisted payload record set does not match the Sheet read-back');
  expectedRows.forEach(expected => {
    const identity = retireStableIdentity_(expected[schema.id]), payloadRow = payloadRecords[identity];
    schema.fields.forEach(field => { if (!retireFieldEquivalent_(schema, field, expected[field], payloadRow[field], expected)) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Persisted payload mismatch: ' + field); });
  });
  (RETIRE_READ_ONLY_FIELDS[schema.domain] || []).forEach(field => {
    Object.keys(beforeRecords).forEach(identity => { if (!retireFieldEquivalent_(schema, field, beforeRecords[identity].row[field], afterRecords[identity].row[field], beforeRecords[identity].row)) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Protected Official field changed: ' + field); });
  });
  (RETIRE_READ_ONLY_FIELDS[schema.domain] || []).forEach(field => {
    const column = beforeSnapshot.headers.indexOf(field);
    if (column < 0) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Protected Official header is unavailable: ' + field);
    Object.keys(beforeRecords).forEach(identity => {
      const beforeRow = beforeRecords[identity].rowIndex, afterRow = afterRecords[identity].rowIndex;
      if (beforeSnapshot.formulas[beforeRow][column] !== afterSnapshot.formulas[afterRow][column] || !retireTechnicalEquivalent_(beforeSnapshot.numberFormats[beforeRow][column], afterSnapshot.numberFormats[afterRow][column])) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Protected Official metadata changed: ' + field);
    });
  });
  const schemaFields = new Set(schema.fields);
  Object.keys(beforeRecords).forEach(identity => {
    const beforeRecord = beforeRecords[identity], afterRecord = afterRecords[identity];
    beforeSnapshot.headers.forEach((header, column) => {
      if (schemaFields.has(header)) return;
      const beforeFormula = beforeSnapshot.formulas[beforeRecord.rowIndex][column], afterFormula = afterSnapshot.formulas[afterRecord.rowIndex][column];
      if (beforeFormula !== afterFormula || !retireTechnicalEquivalent_(beforeSnapshot.numberFormats[beforeRecord.rowIndex][column], afterSnapshot.numberFormats[afterRecord.rowIndex][column])) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Unknown Official column changed: ' + header);
      if (!beforeFormula && !afterFormula && !retireTechnicalEquivalent_(beforeSnapshot.values[beforeRecord.rowIndex][column], afterSnapshot.values[afterRecord.rowIndex][column])) throw retireError_('PERSISTENCE_VERIFICATION_FAILED', 'Unknown Official value changed: ' + header);
    });
  });
  return afterPayload;
}

function retireAssertCaptureEqual_(before, after) {
  retireAssertCaptureShape_(before, after);
  for (let row = 0; row < before.values.length; row += 1) for (let column = 0; column < before.headers.length; column += 1) {
    if (!retireTechnicalEquivalent_(before.values[row][column], after.values[row][column]) || before.formulas[row][column] !== after.formulas[row][column] || !retireTechnicalEquivalent_(before.numberFormats[row][column], after.numberFormats[row][column])) throw retireError_('ROLLBACK_FAILED', 'Rollback read-back differs from the original snapshot');
  }
}

function retireVerifyRollback_(sheet, snapshot, beforePayload, beforeRevision) {
  const restored = retireCapture_(sheet);
  retireAssertCaptureEqual_(snapshot, restored);
  const restoredPayload = retireOfficialPayload_();
  const restoredRevision = retireRevision_(restoredPayload);
  if (restoredRevision !== beforeRevision) throw retireError_('ROLLBACK_FAILED', 'Rollback revision does not match the original revision');
  return { attempted: true, verified: true, revision: restoredRevision };
}

function retireRestore_(sheet, snapshot) {
  const current = sheet.getDataRange();
  const currentValues = current.getValues();
  if (currentValues.length > snapshot.values.length) sheet.getRange(snapshot.values.length + 1, 1, currentValues.length - snapshot.values.length, currentValues[0].length).clearContent();
  if (currentValues[0].length > snapshot.headers.length) sheet.getRange(1, snapshot.headers.length + 1, snapshot.values.length, currentValues[0].length - snapshot.headers.length).clearContent();
  const range = sheet.getRange(1, 1, snapshot.values.length, snapshot.headers.length);
  range.setValues(snapshot.values);
  snapshot.formulas.forEach((row, rowIndex) => row.forEach((formula, column) => { if (formula) sheet.getRange(rowIndex + 1, column + 1).setFormula(formula); }));
  range.setNumberFormats(snapshot.numberFormats);
}
function retireHeaders_(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String); }
function retireSheet_(name) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw new Error('Configured Official sheet is unavailable'); return sheet; }
function retireRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = (values.shift() || []).map(String);
  return values.filter(row => row.some(value => value !== '' && value !== null)).map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]])));
}
function retirePlanSheet_(name) {
  const registry = retireRows_(retireSheet_(RETIRE_SHEETS.returnRegistry));
  if (!registry.some(row => String(row['分頁名稱']) === String(name))) throw new Error('Return-plan sheet is not registered');
  return retireSheet_(String(name));
}
function retireBool_(value) { return value === true || String(value).toLowerCase() === 'true' || value === 1; }
function retireResponse_(response) { try { return JSON.parse(response.getContentText() || '{}'); } catch (_) { throw new Error('Invalid AVA Admin response'); } }

function retireOfficialPayload_() {
  const data = {};
  Object.keys(RETIRE_SHEETS).forEach(key => { data[key] = retireRows_(retireSheet_(RETIRE_SHEETS[key])); });
  const returnTables = {};
  data.returnRegistry.forEach(plan => {
    const rows = retireRows_(retirePlanSheet_(plan['分頁名稱']));
    returnTables[String(plan.plan_id)] = rows.map(row => ({ policyYear: Number(row['保單年度']), withdrawalRate: Number(row['領取百分比']), withdrawalPercent: Number(row['領取百分比']) * 100, multiplier: Number(row['倍數']) }));
  });
  const returnPlans = data.returnRegistry.map(plan => ({ planId: String(plan.plan_id), sheetName: String(plan['分頁名稱']), displayName: String(plan['前台顯示名稱']), sortOrder: Number(plan['排序']), enabled: retireBool_(plan['啟用']), rows: returnTables[String(plan.plan_id)] || [] }));
  return { ok: true, app: 'Retire', apiVersion: RETIRE_API_VERSION, data: data, returnPlans: returnPlans, returnTables: returnTables };
}

function retireGetPayload_() { return retireOfficialPayload_(); }
function retireAdminDomains_(data) {
  const domains = {};
  Object.keys(RETIRE_SHEETS).forEach(domain => {
    const schema = Object.values(RETIRE_SCHEMAS).find(candidate => candidate.domain === domain);
    domains[domain] = schema ? data[domain].map(row => Object.fromEntries(schema.fields.map(field => [field, row[field]]))) : data[domain];
  });
  return domains;
}
function retireAdminConfig_(payload) { return { domains: retireAdminDomains_(payload.data), returnRegistry: payload.returnPlans.map(plan => ({ planId: plan.planId, sheetName: plan.sheetName, label: plan.displayName, sortOrder: plan.sortOrder, enabled: plan.enabled, rows: plan.rows })), returnTables: payload.returnTables, version: payload.apiVersion }; }
function retireRevision_(payload) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(payload), Utilities.Charset.UTF_8);
  return digest.map(byte => ('0' + (byte < 0 ? byte + 256 : byte).toString(16)).slice(-2)).join('');
}
