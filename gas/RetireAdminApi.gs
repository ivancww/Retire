/**
 * Retire-owned Official API.
 *
 * Add these helpers to the existing Retire bootstrap handler. Route POST
 * bodies to retireAdminAction_(body) before the legacy read-only fallback and
 * return its object through the existing JSON response helper. The browser
 * never receives Script Properties. Set AVA_PLATFORM_ADMIN_AUTH_URL to the
 * deployed Mother verification endpoint. This source uses the bound Retire
 * spreadsheet and fixed schema routes; browser input cannot select a file,
 * sheet, range, cell, formula, or Apps Script function.
 */
const RETIRE_ADMIN_APP_ID = 'retire';
const RETIRE_ADMIN_SHEETS = Object.freeze({
  settings: '設定', pages: '頁面設定', options: '選項設定', stages: '退休階段', assets: '資產類別',
  calculations: '計算設定', returnRegistry: '回報表設定'
});
const RETIRE_ADMIN_SCHEMAS = Object.freeze({
  updateSettings: { domain: 'settings', fields: ['key', 'value', 'type', 'description'], id: 'key' },
  updatePageSettings: { domain: 'pages', fields: ['page_id', 'sort_order', 'page_type', 'title', 'subtitle', 'hero_label', 'visible', 'protected'], id: 'page_id' },
  updateOptions: { domain: 'options', fields: ['group_id', 'option_id', 'sort_order', 'label', 'value', 'active'], id: 'option_id' },
  updateRetirementStages: { domain: 'stages', fields: ['stage_id', 'sort_order', 'name', 'start_age', 'end_age', 'spending_percent', 'active', 'description'], id: 'stage_id' },
  updateAssetCategories: { domain: 'assets', fields: ['asset_id', 'sort_order', 'name', 'default_growth_rate', 'active', 'description'], id: 'asset_id' },
  updateCalculationSettings: { domain: 'calculations', fields: ['calculation_id', 'name', 'enabled', 'detail_default_open', 'description'], id: 'calculation_id' },
  updateReturnPlanRegistry: { domain: 'returnRegistry', fields: ['plan_id', '分頁名稱', '前台顯示名稱', '排序', '啟用'], id: 'plan_id' }
});

function retireAdminAction_(body) {
  try {
    if (body.action === 'exchangeAdminSession') return retireExchangeAdminSession_(body.launchTicket, body.appId, body.browserProof, body.launchNonce);
    if (body.action === 'readOfficialConfig') { retireVerifyAdminSession_(body.adminSessionProof, 'official-read'); return retireAdminRead_(); }
    const schema = RETIRE_ADMIN_SCHEMAS[body.action];
    if (schema) { retireVerifyAdminSession_(body.adminSessionProof, body.action); return retireAdminWrite_(body.action, body, schema); }
    if (body.action === 'updateReturnPlanRows') throw new Error('Return-plan data is read-only');
    throw new Error('Unsupported Retire Admin action');
  } catch (error) { return retireAdminFailure_(null, error, null); }
}

function retireExchangeAdminSession_(launchTicket, appId, browserProof, launchNonce) {
  if (String(appId || '') !== RETIRE_ADMIN_APP_ID || !String(launchTicket || '')) throw new Error('Invalid Retire Admin launch');
  const endpoint = PropertiesService.getScriptProperties().getProperty('AVA_PLATFORM_ADMIN_AUTH_URL');
  if (!endpoint) throw new Error('Retire Admin authorization is not configured');
  const response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'exchangeAdminSession', launchTicket: String(launchTicket), browserProof: String(browserProof || ''), launchNonce: String(launchNonce || ''), appId: RETIRE_ADMIN_APP_ID }), muteHttpExceptions: true });
  const payload = retireParseResponse_(response);
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || payload.success !== true || payload.appId !== RETIRE_ADMIN_APP_ID || !payload.adminSessionProof || payload.contract !== 'ava-admin-session-v1') throw new Error('Invalid or expired AVA Admin launch');
  return { success: true, appId: RETIRE_ADMIN_APP_ID, adminSessionProof: String(payload.adminSessionProof), expiresAt: payload.expiresAt, contract: 'ava-admin-session-v1' };
}

function retireVerifyAdminSession_(adminSessionProof, operation) {
  const endpoint = PropertiesService.getScriptProperties().getProperty('AVA_PLATFORM_ADMIN_AUTH_URL');
  if (!endpoint || !String(adminSessionProof || '')) throw new Error('Retire Admin authorization is required');
  const response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'verifyAdminSession', adminSessionProof: String(adminSessionProof), appId: RETIRE_ADMIN_APP_ID, operation: String(operation || 'official-write') }), muteHttpExceptions: true });
  const payload = retireParseResponse_(response);
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || payload.success !== true || payload.appId !== RETIRE_ADMIN_APP_ID || payload.contract !== 'ava-admin-session-v1' || (payload.expiresAt && new Date(payload.expiresAt).getTime() <= Date.now())) throw new Error('Invalid or expired Retire Admin authorization');
  return payload;
}

function retireAdminRead_() { const official = retireOfficialPayload_(); return { success: true, appId: RETIRE_ADMIN_APP_ID, official: retireAdminConfig_(official), revision: retireRevision_(official) }; }
function retireAdminWrite_(operation, body, schema) { return retireAdminReplaceDomain_(operation, schema, body.rows, body.expectedRevision); }

function retireReturnRowsWrite_(body) {
  throw new Error('Return-plan data is read-only');
}

function retireAdminReplaceDomain_(operation, schema, rows, expectedRevision) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Official rows are required');
  const before = retireOfficialPayload_();
  if (!expectedRevision || String(expectedRevision) !== retireRevision_(before)) throw new Error('Official revision conflict; reload before saving');
  const sheet = retireSheet_(RETIRE_ADMIN_SHEETS[schema.domain]), existing = retireRows_(sheet), allowedIds = existing.map(row => String(row[schema.id]));
  if (rows.length !== existing.length) throw new Error('Official row count cannot change');
  const normalized = rows.map((row, index) => retireNormalizeRow_(schema, row, existing[index]));
  const ids = normalized.map(row => String(row[schema.id]));
  if (new Set(ids).size !== ids.length || ids.some(id => !allowedIds.includes(id))) throw new Error('Official identifiers cannot change');
  if (schema.domain === 'returnRegistry') {
    const existingSheets = existing.map(row => String(row['分頁名稱']));
    const requestedSheets = normalized.map(row => String(row['分頁名稱']));
    if (new Set(requestedSheets).size !== requestedSheets.length || requestedSheets.some(name => !existingSheets.includes(name))) throw new Error('Return-plan registry may only reference existing registered sheets');
  }
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  let snapshot = null;
  try {
    const lockedBefore = retireOfficialPayload_();
    if (String(expectedRevision) !== retireRevision_(lockedBefore)) throw new Error('Official revision conflict; reload before saving');
    snapshot = retireAdminSnapshot_(sheet, schema);
    retireWriteSchemaRows_(sheet, schema, normalized);
    SpreadsheetApp.flush();
    const after = retireOfficialPayload_();
    retireAdminVerifyPersistence_(sheet, schema, snapshot, normalized, after);
    const afterRevision = retireRevision_(after);
    return { success: true, appId: RETIRE_ADMIN_APP_ID, acknowledged: true, persisted: true, readAfterWrite: true, revision: afterRevision, operation: operation, official: retireAdminConfig_(after), evidence: { serverReadAfterWrite: true, persistedDomains: [schema.domain], verifiedFields: schema.fields, protectedReturnTables: true, revision: afterRevision } };
  } catch (error) {
    if (!snapshot) throw error;
    try {
      retireAdminRestore_(sheet, snapshot);
      SpreadsheetApp.flush();
      const rollback = retireAdminVerifyRollback_(sheet, snapshot, retireRevision_(before));
      return retireAdminFailure_(operation, error, rollback);
    } catch (rollbackError) {
      return retireAdminFailure_(operation, retireAdminError_('ROLLBACK_FAILED', 'Official write failed and rollback could not be verified'), { attempted: true, verified: false, error: String(rollbackError.message || rollbackError), sourceError: String(error.message || error) });
    }
  } finally { lock.releaseLock(); }
}

function retireAdminError_(code, message) { const error = new Error(message); error.code = code; return error; }
function retireAdminFailure_(operation, error, rollback) {
  const failureCode = rollback && rollback.verified === false ? 'ROLLBACK_FAILED' : (rollback && rollback.verified === true ? 'WRITE_ROLLED_BACK' : (error && error.code) || 'ADMIN_REQUEST_FAILED');
  return { success: false, appId: RETIRE_ADMIN_APP_ID, acknowledged: false, persisted: false, readAfterWrite: false, operation: operation || undefined, failureCode: failureCode, error: String(error && error.message || 'Retire Admin request failed'), rollback: rollback || { attempted: false, verified: false }, evidence: { serverReadAfterWrite: false, persisted: false, rollbackVerified: Boolean(rollback && rollback.verified === true) } };
}

function retireNormalizeRow_(schema, input, existing) {
  if (!input || typeof input !== 'object') throw new Error('Invalid Official row');
  const extra = Object.keys(input).filter(key => !schema.fields.includes(key)); if (extra.length) throw new Error('Unsupported Official field');
  const row = {}; schema.fields.forEach(field => { if (input[field] === undefined || input[field] === null) throw new Error(`Missing Official field: ${field}`); row[field] = retireCoerce_(field, input[field]); });
  if (!String(row[schema.id]).trim()) throw new Error('Official identifier is required');
  retireAssertProtectedFields_(schema.domain, row, existing);
  if (schema.domain === 'settings') {
    if (!['text', 'number', 'boolean'].includes(row.type)) throw new Error('Unsupported setting type');
    if (row.type === 'number') { if (!Number.isFinite(Number(input.value))) throw new Error('Invalid setting number'); row.value = Number(input.value); }
    if (row.type === 'boolean') { const value = String(input.value).toLowerCase(); if (!['true', 'false', '1', '0'].includes(value)) throw new Error('Invalid setting boolean'); row.value = ['true', '1'].includes(value); }
  }
  if (schema.domain === 'stages' && (row.start_age < 0 || row.end_age < row.start_age || row.spending_percent < 0)) throw new Error('Invalid retirement stage values');
  if (schema.domain === 'assets' && !Number.isFinite(row.default_growth_rate)) throw new Error('Invalid asset growth rate');
  return row;
}

const RETIRE_ADMIN_READ_ONLY_FIELDS = Object.freeze({
  settings: ['key', 'type'],
  pages: ['page_id', 'page_type', 'protected'],
  options: ['group_id', 'option_id', 'value'],
  stages: ['stage_id'], assets: ['asset_id'], calculations: ['calculation_id'],
  returnRegistry: ['plan_id', '分頁名稱']
});

function retireAssertProtectedFields_(domain, row, existing) {
  (RETIRE_ADMIN_READ_ONLY_FIELDS[domain] || []).forEach(field => {
    if (existing && String(row[field]) !== String(existing[field])) throw new Error(`Protected Official field cannot change: ${field}`);
  });
}

function retireWriteSchemaRows_(sheet, schema, rows) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const readOnly = RETIRE_ADMIN_READ_ONLY_FIELDS[schema.domain] || [];
  const columns = schema.fields.filter(field => !readOnly.includes(field)).map(field => { const index = headers.indexOf(field); if (index < 0) throw new Error(`Configured Official header is unavailable: ${field}`); return { column: index + 1, field: field }; });
  if (sheet.getLastRow() - 1 !== rows.length) throw new Error('Official row count cannot change');
  columns.forEach(entry => sheet.getRange(2, entry.column, rows.length, 1).setValues(rows.map(row => [row[entry.field]])));
}

function retireAdminCapture_(sheet) {
  const range = sheet.getDataRange(), values = range.getValues();
  return { headers: values[0].map(String), values: values, formulas: range.getFormulas(), numberFormats: range.getNumberFormats() };
}

function retireAdminSnapshot_(sheet, schema) {
  const snapshot = retireAdminCapture_(sheet);
  schema.fields.forEach(field => { if (snapshot.headers.indexOf(field) < 0) throw new Error(`Configured Official header is unavailable: ${field}`); });
  return snapshot;
}

function retireAdminRecords_(capture, schema) {
  const records = Object.create(null);
  for (let rowIndex = 1; rowIndex < capture.values.length; rowIndex += 1) {
    const values = capture.values[rowIndex];
    if (values.every(value => value === '' || value === null)) continue;
    const row = Object.fromEntries(capture.headers.map((header, column) => [header, values[column]]));
    const identity = retireAdminIdentity_(row[schema.id]);
    if (records[identity]) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Duplicate Official stable identity: ' + identity);
    records[identity] = { row: row, rowIndex: rowIndex };
  }
  return records;
}

function retireAdminIdentity_(value) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Official stable identity is required');
  return String(value).trim();
}

function retireAdminNumberEqual_(expected, actual) {
  const a = typeof expected === 'number' ? expected : Number(String(expected).trim()), b = typeof actual === 'number' ? actual : Number(String(actual).trim());
  return Number.isFinite(a) && Number.isFinite(b) && Object.is(a, b);
}

function retireAdminBooleanEqual_(expected, actual) {
  const parse = value => {
    if (value === true || value === 1 || (typeof value === 'string' && ['true', '1'].includes(value.toLowerCase()))) return true;
    if (value === false || value === 0 || (typeof value === 'string' && ['false', '0'].includes(value.toLowerCase()))) return false;
    return null;
  };
  const a = parse(expected), b = parse(actual);
  return a !== null && b !== null && a === b;
}

function retireAdminTechnicalEqual_(expected, actual) {
  if ((expected === '' || expected === null || expected === undefined) && (actual === '' || actual === null || actual === undefined)) return true;
  if (expected instanceof Date || actual instanceof Date) return expected instanceof Date && actual instanceof Date && expected.getTime() === actual.getTime();
  if (typeof expected === 'number' || typeof actual === 'number') return typeof expected === 'number' && typeof actual === 'number' && Object.is(expected, actual);
  if (typeof expected === 'boolean' || typeof actual === 'boolean') return typeof expected === 'boolean' && typeof actual === 'boolean' && expected === actual;
  return expected === actual;
}

function retireAdminFieldEqual_(schema, field, expected, actual, expectedRow) {
  if (field === schema.id) return retireAdminIdentity_(expected) === retireAdminIdentity_(actual);
  if (['sort_order', '排序', 'start_age', 'end_age', 'spending_percent', 'default_growth_rate'].includes(field)) return retireAdminNumberEqual_(expected, actual);
  if (['visible', 'protected', 'active', 'enabled', 'detail_default_open', '啟用'].includes(field)) return retireAdminBooleanEqual_(expected, actual);
  if (schema.domain === 'settings' && field === 'value' && expectedRow.type === 'number') return retireAdminNumberEqual_(expected, actual);
  if (schema.domain === 'settings' && field === 'value' && expectedRow.type === 'boolean') return retireAdminBooleanEqual_(expected, actual);
  return retireAdminTechnicalEqual_(expected, actual);
}

function retireAdminCaptureShape_(before, after) {
  const valid = capture => [capture.values, capture.formulas, capture.numberFormats].every(matrix => matrix.length === capture.values.length && matrix.every(row => row.length === capture.headers.length));
  if (!valid(before) || !valid(after) || JSON.stringify(before.headers) !== JSON.stringify(after.headers) || before.values.length !== after.values.length || before.headers.length !== after.headers.length) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Official Sheet structure changed during write');
}

function retireAdminVerifyPersistence_(sheet, schema, snapshot, expectedRows, afterPayload) {
  const after = retireAdminCapture_(sheet);
  retireAdminCaptureShape_(snapshot, after);
  const beforeRecords = retireAdminRecords_(snapshot, schema), afterRecords = retireAdminRecords_(after, schema), expectedKeys = expectedRows.map(row => retireAdminIdentity_(row[schema.id]));
  const actualKeys = Object.keys(afterRecords);
  if (expectedKeys.length !== actualKeys.length || new Set(expectedKeys).size !== expectedKeys.length || expectedKeys.some(key => !afterRecords[key])) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Official persisted record set does not match the submitted record set');
  expectedRows.forEach(expected => {
    const identity = retireAdminIdentity_(expected[schema.id]), actual = afterRecords[identity].row;
    schema.fields.forEach(field => { if (!retireAdminFieldEqual_(schema, field, expected[field], actual[field], expected)) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Official persisted field mismatch: ' + field); });
  });
  const payloadRecords = Object.create(null);
  (afterPayload.data[schema.domain] || []).forEach(row => { const identity = retireAdminIdentity_(row[schema.id]); if (payloadRecords[identity]) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Duplicate persisted payload identity: ' + identity); payloadRecords[identity] = row; });
  if (Object.keys(payloadRecords).length !== expectedKeys.length || expectedKeys.some(key => !payloadRecords[key])) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Persisted payload record set does not match the Sheet read-back');
  expectedRows.forEach(expected => { const payloadRow = payloadRecords[retireAdminIdentity_(expected[schema.id])]; schema.fields.forEach(field => { if (!retireAdminFieldEqual_(schema, field, expected[field], payloadRow[field], expected)) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Persisted payload mismatch: ' + field); }); });
  (RETIRE_ADMIN_READ_ONLY_FIELDS[schema.domain] || []).forEach(field => {
    Object.keys(beforeRecords).forEach(identity => { if (!retireAdminFieldEqual_(schema, field, beforeRecords[identity].row[field], afterRecords[identity].row[field], beforeRecords[identity].row)) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Protected Official field changed: ' + field); });
    const column = snapshot.headers.indexOf(field);
    if (column < 0) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Protected Official header is unavailable: ' + field);
    Object.keys(beforeRecords).forEach(identity => { const a = beforeRecords[identity].rowIndex, b = afterRecords[identity].rowIndex; if (snapshot.formulas[a][column] !== after.formulas[b][column] || !retireAdminTechnicalEqual_(snapshot.numberFormats[a][column], after.numberFormats[b][column])) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Protected Official metadata changed: ' + field); });
  });
  const schemaFields = new Set(schema.fields);
  Object.keys(beforeRecords).forEach(identity => {
    const beforeRecord = beforeRecords[identity], afterRecord = afterRecords[identity];
    snapshot.headers.forEach((header, column) => {
      if (schemaFields.has(header)) return;
      const beforeFormula = snapshot.formulas[beforeRecord.rowIndex][column], afterFormula = after.formulas[afterRecord.rowIndex][column];
      if (beforeFormula !== afterFormula || !retireAdminTechnicalEqual_(snapshot.numberFormats[beforeRecord.rowIndex][column], after.numberFormats[afterRecord.rowIndex][column])) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Unknown Official column changed: ' + header);
      if (!beforeFormula && !afterFormula && !retireAdminTechnicalEqual_(snapshot.values[beforeRecord.rowIndex][column], after.values[afterRecord.rowIndex][column])) throw retireAdminError_('PERSISTENCE_VERIFICATION_FAILED', 'Unknown Official value changed: ' + header);
    });
  });
}

function retireAdminAssertCaptureEqual_(before, after) {
  retireAdminCaptureShape_(before, after);
  for (let row = 0; row < before.values.length; row += 1) for (let column = 0; column < before.headers.length; column += 1) if (!retireAdminTechnicalEqual_(before.values[row][column], after.values[row][column]) || before.formulas[row][column] !== after.formulas[row][column] || !retireAdminTechnicalEqual_(before.numberFormats[row][column], after.numberFormats[row][column])) throw retireAdminError_('ROLLBACK_FAILED', 'Rollback read-back differs from the original snapshot');
}

function retireAdminVerifyRollback_(sheet, snapshot, beforeRevision) {
  const restored = retireAdminCapture_(sheet);
  retireAdminAssertCaptureEqual_(snapshot, restored);
  const restoredPayload = retireOfficialPayload_(), restoredRevision = retireRevision_(restoredPayload);
  if (restoredRevision !== beforeRevision) throw retireAdminError_('ROLLBACK_FAILED', 'Rollback revision does not match the original revision');
  return { attempted: true, verified: true, revision: restoredRevision };
}

function retireAdminRestore_(sheet, snapshot) {
  const current = sheet.getDataRange(), currentValues = current.getValues();
  if (currentValues.length > snapshot.values.length) sheet.getRange(snapshot.values.length + 1, 1, currentValues.length - snapshot.values.length, currentValues[0].length).clearContent();
  if (currentValues[0].length > snapshot.headers.length) sheet.getRange(1, snapshot.headers.length + 1, snapshot.values.length, currentValues[0].length - snapshot.headers.length).clearContent();
  const range = sheet.getRange(1, 1, snapshot.values.length, snapshot.headers.length);
  range.setValues(snapshot.values);
  snapshot.formulas.forEach((row, rowIndex) => row.forEach((formula, column) => { if (formula) sheet.getRange(rowIndex + 1, column + 1).setFormula(formula); }));
  range.setNumberFormats(snapshot.numberFormats);
}

function retireCoerce_(field, value) {
  if (['sort_order', '排序', 'start_age', 'end_age', 'spending_percent', 'default_growth_rate'].includes(field)) { const number = Number(value); if (!Number.isFinite(number)) throw new Error(`Invalid number: ${field}`); return number; }
  if (['visible', 'protected', 'active', 'enabled', 'detail_default_open', '啟用'].includes(field)) { const text = String(value).toLowerCase(); if (!['true', 'false', '1', '0'].includes(text)) throw new Error(`Invalid boolean: ${field}`); return ['true', '1'].includes(text); }
  return String(value);
}

function retireAllowedPlanSheet_(sheetName) { const registry = retireRows_(retireSheet_(RETIRE_ADMIN_SHEETS.returnRegistry)); if (!registry.some(row => String(row['分頁名稱']) === sheetName)) throw new Error('Return-plan sheet is not registered'); const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName); if (!sheet) throw new Error('Return-plan sheet is unavailable'); return sheet; }
function retireSheet_(name) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw new Error('Configured Official sheet is unavailable'); return sheet; }
function retireRows_(sheet) { const values = sheet.getDataRange().getValues(); const headers = values.shift().map(String); return values.filter(row => row.some(value => value !== '' && value !== null)).map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]]))); }
function retireBool_(value) { return value === true || String(value).toLowerCase() === 'true' || value === 1; }
function retireParseResponse_(response) { let payload; try { payload = JSON.parse(response.getContentText() || '{}'); } catch (_) { throw new Error('Invalid AVA Admin response'); } return payload; }
function retireRevision_(payload) { const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(payload), Utilities.Charset.UTF_8); return digest.map(byte => (`0${(byte < 0 ? byte + 256 : byte).toString(16)}`).slice(-2)).join(''); }
function retireOfficialPayload_() {
  const domains = {}; Object.keys(RETIRE_ADMIN_SHEETS).forEach(key => { domains[key] = retireRows_(retireSheet_(RETIRE_ADMIN_SHEETS[key])); });
  const returnTables = {}; domains.returnRegistry.forEach(plan => { const sheet = retireAllowedPlanSheet_(String(plan['分頁名稱'])); returnTables[String(plan.plan_id)] = retireRows_(sheet).map(row => ({ policyYear: Number(row['保單年度']), withdrawalRate: Number(row['領取百分比']), multiplier: Number(row['倍數']) })); });
  const returnPlans = domains.returnRegistry.map(plan => ({ planId: String(plan.plan_id), sheetName: String(plan['分頁名稱']), label: String(plan['前台顯示名稱']), sortOrder: Number(plan['排序']), enabled: retireBool_(plan['啟用']), rows: returnTables[String(plan.plan_id)] || [] }));
  return { ok: true, app: 'Retire', apiVersion: '2.0.0', data: domains, returnPlans, returnTables };
}
function retireAdminConfig_(payload) { return { domains: payload.data, returnRegistry: payload.returnPlans, returnTables: payload.returnTables, version: payload.apiVersion }; }
