export function futureValue(value, annualRate, years) {
  return Number(value) * (1 + Number(annualRate)) ** Number(years);
}

export function retirementMonthlyNeed(currentMonthly, inflationRate, years) {
  return futureValue(currentMonthly, inflationRate, years);
}

export function stageSpending({ monthlyNeed, retirementAge, planningAge, inflationRate, stages }) {
  return stages.map((stage) => {
    const start = Math.max(Number(stage.startAge), Number(retirementAge));
    const end = Math.min(Number(stage.endAge), Number(planningAge));
    if (end < start) return { ...stage, start, end, years: 0, total: 0, monthlyStart: 0, monthlyEnd: 0 };
    const years = end - start + 1;
    const monthlyStart = monthlyNeed * (1 + inflationRate) ** (start - retirementAge) * (Number(stage.ratio) / 100);
    const monthlyEnd = monthlyNeed * (1 + inflationRate) ** (end - retirementAge) * (Number(stage.ratio) / 100);
    const total = Array.from({ length: years }, (_, i) => monthlyNeed * (1 + inflationRate) ** (start - retirementAge + i) * 12 * (Number(stage.ratio) / 100)).reduce((a, b) => a + b, 0);
    return { ...stage, start, end, years, total, monthlyStart, monthlyEnd };
  });
}

export function projectResources(resources, yearsToRetirement) {
  return resources.reduce((sum, item) => sum + futureValue(item.amount, Number(item.growthRate) / 100, yearsToRetirement), 0);
}

export function retirementGap(totalNeed, projectedResources) {
  return Number(totalNeed) - Number(projectedResources);
}

export function purchasingPowerToday(value, inflationRate, years) {
  return Number(value) / (1 + Number(inflationRate)) ** Number(years);
}

export function planProjection({ principal, contributionYears = 1, policyYear, plan }) {
  const row = (plan?.rows || []).find((entry) => Number(entry.policyYear) === Number(policyYear));
  if (!row) return { available: false, message: `官方資料未提供第 ${policyYear} 年，沒有估算或補值。` };
  const base = Number(principal) * Number(contributionYears);
  return { available: true, policyYear: Number(policyYear), multiplier: Number(row.multiplier), withdrawalRate: Number(row.withdrawalRate), futureValue: base * Number(row.multiplier) };
}
