export function futureValue(value, annualRate, years) {
  const amount = Number(value); const rate = Number(annualRate); const period = Number(years);
  if (![amount, rate, period].every(Number.isFinite) || period < 0) return 0;
  return amount * (1 + rate) ** period;
}

export function validateAges(currentAge, retirementAge, planningAge) {
  const current = Number(currentAge); const retirement = Number(retirementAge); const planning = Number(planningAge);
  if (![current, retirement, planning].every(Number.isFinite)) return { valid: false, reason: '年齡必須是數字。' };
  if (current < 18 || current > 100) return { valid: false, reason: '現時年齡應介乎 18 至 100 歲。' };
  if (retirement < 40 || retirement > 100) return { valid: false, reason: '退休年齡應介乎 40 至 100 歲。' };
  if (retirement < current) return { valid: false, reason: '退休年齡不可早過現時年齡。' };
  if (planning <= retirement || planning > 120) return { valid: false, reason: '規劃年齡必須大過退休年齡，且不超過 120 歲。' };
  return { valid: true, currentAge: current, retirementAge: retirement, planningAge: planning };
}

export function yearsUntilRetirement(currentAge, retirementAge) {
  const current = Number(currentAge); const retirement = Number(retirementAge);
  if (!Number.isFinite(current) || !Number.isFinite(retirement) || current < 18 || retirement < current) return null;
  return retirement - current;
}

export function retirementMonthlyNeed(currentMonthly, inflationRate, years) { return futureValue(currentMonthly, inflationRate, years); }

export function stageSpending({ monthlyNeed, retirementAge, planningAge, inflationRate, stages }) {
  return (stages || []).map((stage) => {
    const start = Math.max(Number(stage.startAge), Number(retirementAge)); const end = Math.min(Number(stage.endAge), Number(planningAge)); const ratio = Number(stage.ratio);
    if (![start, end, ratio].every(Number.isFinite) || end < start || ratio < 0) return { ...stage, start, end, years: 0, total: 0, monthlyStart: 0, monthlyEnd: 0 };
    const years = end - start + 1;
    const monthlyStart = monthlyNeed * (1 + inflationRate) ** (start - retirementAge) * (ratio / 100);
    const monthlyEnd = monthlyNeed * (1 + inflationRate) ** (end - retirementAge) * (ratio / 100);
    const total = Array.from({ length: years }, (_, i) => monthlyNeed * (1 + inflationRate) ** (start - retirementAge + i) * 12 * (ratio / 100)).reduce((a, b) => a + b, 0);
    return { ...stage, start, end, years, total, monthlyStart, monthlyEnd, ratio };
  });
}

export function projectResources(resources, yearsToRetirement) { return (resources || []).reduce((sum, item) => sum + futureValue(item.amount, Number(item.growthRate) / 100, yearsToRetirement), 0); }
export function retirementGap(retirementDateNeed, retirementDateResources) { return Number(retirementDateNeed) - Number(retirementDateResources); }
export function retirementTarget(lifestyleNeed, legacyAmount = 0) { return Number(lifestyleNeed) + Math.max(0, Number(legacyAmount) || 0); }

export function purchasingPowerToday(value, inflationRate, years) {
  const amount = Number(value); const rate = Number(inflationRate); const period = Number(years);
  if (![amount, rate, period].every(Number.isFinite) || period < 0) return 0;
  return amount / (1 + rate) ** period;
}

export function planProjection({ principal, contributionYears = 1, policyYear, plan }) {
  const row = (plan?.rows || []).find((entry) => Number(entry.policyYear) === Number(policyYear));
  if (!row) return { available: false, message: `官方資料未提供第 ${policyYear} 年，沒有估算或補值。` };
  const base = Number(principal) * Number(contributionYears);
  return { available: true, policyYear: Number(policyYear), multiplier: Number(row.multiplier), withdrawalRate: Number(row.withdrawalRate), futureValue: base * Number(row.multiplier) };
}
