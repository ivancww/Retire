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
    return { success: false, error: String(error.message || 'Retire Admin request failed') };
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
    snapshot = retireSnapshot_(sheet, schema, normalized.length);
    retireWrite_(sheet, schema, normalized);
    const after = retireOfficialPayload_();
    return { success: true, appId: RETIRE_APP_ID, acknowledged: true, persisted: true, readAfterWrite: true, revision: retireRevision_(after), operation: operation, official: retireAdminConfig_(after), evidence: { serverReadAfterWrite: true, persistedDomains: [schema.domain], protectedReturnTables: true } };
  } catch (error) {
    if (snapshot) retireRestore_(sheet, snapshot);
    throw error;
  } finally {
    lock.releaseLock();
  }
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
  schema.fields.forEach(field => {
    const index = headers.indexOf(field);
    if (index < 0) throw new Error('Configured Official header is unavailable: ' + field);
    sheet.getRange(2, index + 1, rows.length, 1).setValues(rows.map(row => [row[field]]));
  });
}

function retireSnapshot_(sheet, schema, rowCount) {
  const headers = retireHeaders_(sheet);
  return schema.fields.map(field => {
    const index = headers.indexOf(field);
    if (index < 0) throw new Error('Configured Official header is unavailable: ' + field);
    return { column: index + 1, values: sheet.getRange(2, index + 1, rowCount, 1).getValues() };
  });
}

function retireRestore_(sheet, snapshot) { snapshot.forEach(entry => sheet.getRange(2, entry.column, entry.values.length, 1).setValues(entry.values)); }
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
