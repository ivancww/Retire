export const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyaup9srjMJkdvzgixi4Kjs9lT6RRI2L-CMqJB-QLuQ2u0grArDxq3vI_4hZyr6PiPOAw/exec';
export const OFFICIAL_CACHE_KEY = 'retire:official-cache:v1';
export const USER_DATA_KEY = 'retire:user-data:v1';

export const fallbackOfficial = {
  version: 'fallback-0.1.0', inflationRate: 0.025,
  stages: [{ id: 'early', label: '60–69 歲', startAge: 60, endAge: 69, ratio: 100 }, { id: 'middle', label: '70–79 歲', startAge: 70, endAge: 79, ratio: 80 }, { id: 'late', label: '80–90 歲', startAge: 80, endAge: 90, ratio: 60 }],
  returnPlans: [{ planId: 'auto', label: '自動滾存', sheetName: '自動滾存', sortOrder: 10, enabled: true, rows: [{ policyYear: 1, withdrawalRate: 0, multiplier: 1 }] }]
};

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => value === true || value === 'TRUE' || value === 'true' || value === 1;

export function normalizeOfficial(payload) {
  const root = payload?.data || payload || {};
  const registry = root.returnPlans || root.return_plans || root['回報表設定'] || [];
  const tables = root.returnTables || root.return_tables || {};
  const rowsFor = (sheetName) => (Array.isArray(tables[sheetName]) ? tables[sheetName] : []).map((row) => ({
    policyYear: number(row.policyYear ?? row.policy_year ?? row['保單年度']),
    withdrawalRate: number(row.withdrawalRate ?? row.withdrawal_rate ?? row.withdrawalPercent ?? row.withdrawal_percent ?? row['領取百分比']),
    multiplier: number(row.multiplier ?? row['倍數'])
  })).filter((row) => row.policyYear > 0 && Number.isFinite(row.multiplier));
  const plans = registry.map((item) => ({
    planId: String(item.planId ?? item.plan_id ?? ''),
    sheetName: String(item.sheetName ?? item.sheet_name ?? item['分頁名稱'] ?? ''),
    label: String(item.label ?? item.displayName ?? item.display_name ?? item['前台顯示名稱'] ?? ''),
    sortOrder: number(item.sortOrder ?? item.sort_order, 9999), enabled: truthy(item.enabled ?? item['啟用'])
  })).filter((plan) => plan.planId && plan.sheetName && plan.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => ({ ...plan, rows: rowsFor(plan.sheetName) }));
  return { ...fallbackOfficial, ...root, version: root.version ?? root.systemVersion ?? fallbackOfficial.version, inflationRate: number(root.inflationRate ?? root.inflation_rate, fallbackOfficial.inflationRate), stages: Array.isArray(root.stages) && root.stages.length ? root.stages : fallbackOfficial.stages, returnPlans: plans.length ? plans : fallbackOfficial.returnPlans };
}

export function readOfficialCache(storage = globalThis.localStorage) { try { return JSON.parse(storage?.getItem(OFFICIAL_CACHE_KEY) || 'null'); } catch { return null; } }
export function writeOfficialCache(value, storage = globalThis.localStorage) { try { storage?.setItem(OFFICIAL_CACHE_KEY, JSON.stringify(value)); } catch { /* private mode is allowed */ } }
export function readUserData(storage = globalThis.localStorage) { try { return JSON.parse(storage?.getItem(USER_DATA_KEY) || '{}'); } catch { return {}; } }
export function writeUserData(value, storage = globalThis.localStorage) { try { storage?.setItem(USER_DATA_KEY, JSON.stringify(value)); } catch { /* local-first best effort */ } }

export async function loadOfficialData({ fetcher = globalThis.fetch, storage = globalThis.localStorage } = {}) {
  const cached = readOfficialCache(storage);
  try {
    if (!fetcher) throw new Error('fetch unavailable');
    const response = await fetcher(`${ENDPOINT}?action=bootstrap`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const official = normalizeOfficial(await response.json());
    writeOfficialCache(official, storage);
    return { official, source: 'cloud', stale: false };
  } catch (error) {
    if (cached) return { official: normalizeOfficial(cached), source: 'local-cache', stale: true, error };
    return { official: fallbackOfficial, source: 'built-in-fallback', stale: true, error };
  }
}
