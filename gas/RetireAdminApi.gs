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
    if (body.action === 'exchangeAdminSession') return retireExchangeAdminSession_(body.launchTicket, body.appId, body.launchNonce);
    if (body.action === 'readOfficialConfig') { retireVerifyAdminSession_(body.adminSessionProof, 'official-read'); return retireAdminRead_(); }
    const schema = RETIRE_ADMIN_SCHEMAS[body.action];
    if (schema) { retireVerifyAdminSession_(body.adminSessionProof, body.action); return retireAdminWrite_(body.action, body, schema); }
    if (body.action === 'updateReturnPlanRows') { retireVerifyAdminSession_(body.adminSessionProof, body.action); return retireReturnRowsWrite_(body); }
    throw new Error('Unsupported Retire Admin action');
  } catch (error) { return { success: false, error: String(error.message || 'Retire Admin request failed') }; }
}

function retireExchangeAdminSession_(launchTicket, appId, launchNonce) {
  if (String(appId || '') !== RETIRE_ADMIN_APP_ID || !String(launchTicket || '')) throw new Error('Invalid Retire Admin launch');
  const endpoint = PropertiesService.getScriptProperties().getProperty('AVA_PLATFORM_ADMIN_AUTH_URL');
  if (!endpoint) throw new Error('Retire Admin authorization is not configured');
  const response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ action: 'exchangeAdminSession', launchTicket: String(launchTicket), launchNonce: String(launchNonce || ''), appId: RETIRE_ADMIN_APP_ID }), muteHttpExceptions: true });
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

function retireAdminRead_() { const official = retireOfficialPayload_(); return { success: true, appId: RETIRE_ADMIN_APP_ID, official: retireAdminConfig_(official) }; }
function retireAdminWrite_(operation, body, schema) { return retireReplaceDomain_(schema, body.rows); }

function retireReturnRowsWrite_(body) {
  const planId = String(body.planId || ''), registry = retireRows_(retireSheet_(RETIRE_ADMIN_SHEETS.returnRegistry));
  const plan = registry.find(row => String(row.plan_id) === planId && retireBool_(row['啟用']));
  if (!plan) throw new Error('Return plan is not registered or enabled');
  const sheetName = String(plan['分頁名稱'] || ''), sheet = retireAllowedPlanSheet_(sheetName), rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throw new Error('Return-plan rows are required');
  const normalized = rows.map(row => { if (!row || !Number.isInteger(Number(row.policyYear)) || Number(row.policyYear) <= 0 || !Number.isFinite(Number(row.withdrawalRate)) || !Number.isFinite(Number(row.multiplier))) throw new Error('Invalid return-plan row'); return [Number(row.policyYear), Number(row.withdrawalRate), Number(row.multiplier)]; });
  const existing = retireRows_(sheet); if (existing.length !== normalized.length) throw new Error('Return-plan row count cannot change');
  const lock = LockService.getScriptLock(); lock.waitLock(10000); try { sheet.getRange(2, 1, sheet.getMaxRows() - 1, 3).clearContent(); sheet.getRange(2, 1, normalized.length, 3).setValues(normalized); } finally { lock.releaseLock(); }
  return { success: true, appId: RETIRE_ADMIN_APP_ID, acknowledged: true, operation: 'updateReturnPlanRows', planId: planId, official: retireAdminConfig_(retireOfficialPayload_()) };
}

function retireReplaceDomain_(schema, rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Official rows are required');
  const sheet = retireSheet_(RETIRE_ADMIN_SHEETS[schema.domain]), existing = retireRows_(sheet), allowedIds = existing.map(row => String(row[schema.id]));
  if (rows.length !== existing.length) throw new Error('Official row count cannot change');
  const normalized = rows.map(row => retireNormalizeRow_(schema, row));
  const ids = normalized.map(row => String(row[schema.id]));
  if (new Set(ids).size !== ids.length || ids.some(id => !allowedIds.includes(id))) throw new Error('Official identifiers cannot change');
  if (schema.domain === 'returnRegistry') {
    const existingSheets = existing.map(row => String(row['分頁名稱']));
    const requestedSheets = normalized.map(row => String(row['分頁名稱']));
    if (new Set(requestedSheets).size !== requestedSheets.length || requestedSheets.some(name => !existingSheets.includes(name))) throw new Error('Return-plan registry may only reference existing registered sheets');
  }
  const values = normalized.map(row => schema.fields.map(field => row[field]));
  const lock = LockService.getScriptLock(); lock.waitLock(10000); try { sheet.getRange(2, 1, sheet.getMaxRows() - 1, schema.fields.length).clearContent(); sheet.getRange(2, 1, values.length, schema.fields.length).setValues(values); } finally { lock.releaseLock(); }
  return { success: true, appId: RETIRE_ADMIN_APP_ID, acknowledged: true, operation: Object.keys(RETIRE_ADMIN_SCHEMAS).find(key => RETIRE_ADMIN_SCHEMAS[key] === schema), official: retireAdminConfig_(retireOfficialPayload_()) };
}

function retireNormalizeRow_(schema, input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid Official row');
  const extra = Object.keys(input).filter(key => !schema.fields.includes(key)); if (extra.length) throw new Error('Unsupported Official field');
  const row = {}; schema.fields.forEach(field => { if (input[field] === undefined || input[field] === null) throw new Error(`Missing Official field: ${field}`); row[field] = retireCoerce_(field, input[field]); });
  if (!String(row[schema.id]).trim()) throw new Error('Official identifier is required');
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
  if (['sort_order', '排序', 'start_age', 'end_age', 'spending_percent', 'default_growth_rate'].includes(field)) { const number = Number(value); if (!Number.isFinite(number)) throw new Error(`Invalid number: ${field}`); return number; }
  if (['visible', 'protected', 'active', 'enabled', 'detail_default_open', '啟用'].includes(field)) { const text = String(value).toLowerCase(); if (!['true', 'false', '1', '0'].includes(text)) throw new Error(`Invalid boolean: ${field}`); return ['true', '1'].includes(text); }
  return String(value);
}

function retireAllowedPlanSheet_(sheetName) { const registry = retireRows_(retireSheet_(RETIRE_ADMIN_SHEETS.returnRegistry)); if (!registry.some(row => String(row['分頁名稱']) === sheetName)) throw new Error('Return-plan sheet is not registered'); const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName); if (!sheet) throw new Error('Return-plan sheet is unavailable'); return sheet; }
function retireSheet_(name) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw new Error('Configured Official sheet is unavailable'); return sheet; }
function retireRows_(sheet) { const values = sheet.getDataRange().getValues(); const headers = values.shift().map(String); return values.filter(row => row.some(value => value !== '' && value !== null)).map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]]))); }
function retireBool_(value) { return value === true || String(value).toLowerCase() === 'true' || value === 1; }
function retireParseResponse_(response) { let payload; try { payload = JSON.parse(response.getContentText() || '{}'); } catch (_) { throw new Error('Invalid AVA Admin response'); } return payload; }
function retireOfficialPayload_() {
  const domains = {}; Object.keys(RETIRE_ADMIN_SHEETS).forEach(key => { domains[key] = retireRows_(retireSheet_(RETIRE_ADMIN_SHEETS[key])); });
  const returnTables = {}; domains.returnRegistry.forEach(plan => { const sheet = retireAllowedPlanSheet_(String(plan['分頁名稱'])); returnTables[String(plan.plan_id)] = retireRows_(sheet).map(row => ({ policyYear: Number(row['保單年度']), withdrawalRate: Number(row['領取百分比']), multiplier: Number(row['倍數']) })); });
  const returnPlans = domains.returnRegistry.map(plan => ({ planId: String(plan.plan_id), sheetName: String(plan['分頁名稱']), label: String(plan['前台顯示名稱']), sortOrder: Number(plan['排序']), enabled: retireBool_(plan['啟用']), rows: returnTables[String(plan.plan_id)] || [] }));
  return { ok: true, app: 'Retire', apiVersion: '2.0.0', data: domains, returnPlans, returnTables };
}
function retireAdminConfig_(payload) { return { domains: payload.data, returnRegistry: payload.returnPlans, returnTables: payload.returnTables, version: payload.apiVersion }; }
