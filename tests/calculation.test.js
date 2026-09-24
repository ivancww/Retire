import test from 'node:test';
import assert from 'node:assert/strict';
import { retirementMonthlyNeed, stageSpending, planProjection, purchasingPowerToday, retirementGap } from '../src/calculation.js';

test('inflation produces the retirement-date monthly need', () => assert.equal(Math.round(retirementMonthlyNeed(30000, .025, 20)), 49158));
test('stage ratios do not stop inflation between stages', () => { const rows = stageSpending({ monthlyNeed: 49158, retirementAge: 60, planningAge: 90, inflationRate: .025, stages: [{ startAge: 60, endAge: 69, ratio: 100 }, { startAge: 70, endAge: 79, ratio: 80 }, { startAge: 80, endAge: 90, ratio: 60 }] }); assert.ok(rows[1].monthlyStart > rows[0].monthlyStart * .8); });
test('all gap values are on retirement-date basis', () => assert.equal(retirementGap(100, 60), 40));
test('purchasing power is discounted, not confused with nominal value', () => assert.equal(Math.round(purchasingPowerToday(2000000, .025, 20)), 1220853));
test('return rows are read independently for irregular patterns', () => { const plan = { rows: [5, 6, 7, 8].map((rate, i) => ({ policyYear: i + 1, withdrawalRate: rate, multiplier: 1 + i })) }; assert.equal(planProjection({ principal: 100, policyYear: 3, plan }).withdrawalRate, 7); assert.equal(planProjection({ principal: 100, policyYear: 3, plan }).multiplier, 3); });
