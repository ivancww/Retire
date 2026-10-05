const DOMAIN_OPERATIONS = Object.freeze({
  settings: 'updateSettings', pages: 'updatePageSettings', options: 'updateOptions', stages: 'updateRetirementStages',
  assets: 'updateAssetCategories', calculations: 'updateCalculationSettings', returnRegistry: 'updateReturnPlanRegistry', returnRows: 'updateReturnPlanRows'
});
const DOMAIN_LABELS = Object.freeze({ settings: '設定', pages: '頁面設定', options: '選項設定', stages: '退休階段', assets: '資產類別', calculations: '計算設定', returnRegistry: '回報表設定', returnRows: '回報表資料' });
const RETURN_ROW_FIELDS = Object.freeze(['policyYear', 'withdrawalRate', 'multiplier']);
function operationFor(domain) { const operation = DOMAIN_OPERATIONS[domain]; if (!operation) throw new Error('Unsupported Official domain'); return operation; }
function validateRows(domain, rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Official rows are required');
  if (domain === 'returnRows') return rows.map((row) => { if (!row || !Number.isInteger(Number(row.policyYear)) || Number(row.policyYear) <= 0 || !Number.isFinite(Number(row.withdrawalRate)) || !Number.isFinite(Number(row.multiplier))) throw new Error('Invalid return-plan row'); return { policyYear: Number(row.policyYear), withdrawalRate: Number(row.withdrawalRate), multiplier: Number(row.multiplier) }; });
  return rows;
}
export { DOMAIN_LABELS, DOMAIN_OPERATIONS, RETURN_ROW_FIELDS, operationFor, validateRows };
