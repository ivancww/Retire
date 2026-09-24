import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOfficial } from '../src/data.js';

test('registry dynamically orders enabled plans and maps independent rows', () => { const official = normalizeOfficial({ data: { returnPlans: [{ plan_id: 'b', sheet_name: 'B', display_name: 'Plan B', sort_order: 20, enabled: true }, { plan_id: 'a', sheet_name: 'A', display_name: 'Plan A', sort_order: 10, enabled: true }, { plan_id: 'off', sheet_name: 'Off', display_name: 'Off', sort_order: 1, enabled: false }], returnTables: { A: [{ policy_year: 1, withdrawal_percent: 5, multiplier: 2 }], B: [{ policy_year: 1, withdrawal_percent: 10, multiplier: 3 }] } } }); assert.deepEqual(official.returnPlans.map((p) => p.planId), ['a', 'b']); assert.equal(official.returnPlans[1].rows[0].withdrawalRate, 10); });
test('malformed official payload safely falls back', () => { const official = normalizeOfficial({ data: { returnPlans: [] } }); assert.ok(official.stages.length); assert.ok(official.returnPlans.length); });
