const DOMAIN_OPERATIONS = Object.freeze({
  settings: 'updateSettings', pages: 'updatePageSettings', options: 'updateOptions', stages: 'updateRetirementStages',
  assets: 'updateAssetCategories', calculations: 'updateCalculationSettings', returnRegistry: 'updateReturnPlanRegistry'
});
const DOMAIN_LABELS = Object.freeze({ settings: '設定', pages: '頁面設定', options: '選項設定', stages: '退休階段', assets: '資產類別', calculations: '計算設定', returnRegistry: '回報表設定', returnRows: '回報表資料' });
const RETURN_ROW_FIELDS = Object.freeze(['policyYear', 'withdrawalRate', 'multiplier']);
const DOMAIN_FIELDS = Object.freeze({
  settings: ['key', 'value', 'type', 'description'],
  pages: ['page_id', 'sort_order', 'page_type', 'title', 'subtitle', 'hero_label', 'visible', 'protected'],
  options: ['group_id', 'option_id', 'sort_order', 'label', 'value', 'active'],
  stages: ['stage_id', 'sort_order', 'name', 'start_age', 'end_age', 'spending_percent', 'active', 'description'],
  assets: ['asset_id', 'sort_order', 'name', 'default_growth_rate', 'active', 'description'],
  calculations: ['calculation_id', 'name', 'enabled', 'detail_default_open', 'description'],
  returnRegistry: ['plan_id', '分頁名稱', '前台顯示名稱', '排序', '啟用'],
  returnRows: RETURN_ROW_FIELDS
});
const FIELD_LABELS = Object.freeze({ key: '設定鍵', value: '設定值', type: '類型', description: '說明', page_id: '頁面 ID', sort_order: '排序', page_type: '頁面類型', title: '標題', subtitle: '副標題', hero_label: '主視覺標籤', visible: '顯示', protected: '受保護', group_id: '群組 ID', option_id: '選項 ID', label: '標籤', active: '啟用', stage_id: '階段 ID', name: '名稱', start_age: '開始年齡', end_age: '結束年齡', spending_percent: '支出百分比', asset_id: '資產 ID', default_growth_rate: '預設增長率', calculation_id: '計算設定 ID', enabled: '啟用', detail_default_open: '預設展開詳細資料', plan_id: '計劃 ID', '分頁名稱': '分頁名稱', '前台顯示名稱': '前台顯示名稱', '排序': '排序', '啟用': '啟用', policyYear: '保單年度', withdrawalRate: '領取百分比', multiplier: '倍數' });
const READ_ONLY_FIELDS = Object.freeze({
  settings: ['key', 'type'],
  pages: ['page_id', 'page_type', 'protected'],
  options: ['group_id', 'option_id', 'value'],
  stages: ['stage_id'],
  assets: ['asset_id'],
  calculations: ['calculation_id'],
  returnRegistry: ['plan_id', '分頁名稱'],
  returnRows: RETURN_ROW_FIELDS
});
function fieldLabel(field) { return FIELD_LABELS[field] || field; }
function fieldsFor(domain, row = {}) { return [...new Set([...(DOMAIN_FIELDS[domain] || []), ...Object.keys(row)])]; }
function editableFieldsFor(domain, row = {}) { return fieldsFor(domain, row).filter((field) => !READ_ONLY_FIELDS[domain]?.includes(field)); }
function operationFor(domain) { const operation = DOMAIN_OPERATIONS[domain]; if (!operation) throw new Error('Unsupported Official domain'); return operation; }
function validateRows(domain, rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Official rows are required');
  if (domain === 'returnRows') return rows.map((row) => { if (!row || !Number.isInteger(Number(row.policyYear)) || Number(row.policyYear) <= 0 || !Number.isFinite(Number(row.withdrawalRate)) || !Number.isFinite(Number(row.multiplier))) throw new Error('Invalid return-plan row'); return { policyYear: Number(row.policyYear), withdrawalRate: Number(row.withdrawalRate), multiplier: Number(row.multiplier) }; });
  return rows;
}
export { DOMAIN_FIELDS, DOMAIN_LABELS, DOMAIN_OPERATIONS, READ_ONLY_FIELDS, RETURN_ROW_FIELDS, editableFieldsFor, fieldLabel, fieldsFor, operationFor, validateRows };
