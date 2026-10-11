import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMAIN_ORDER, identityKey, renderAdminMarkup, rowDomainRows, selectedPlanId } from '../src/admin.js';
import { DOMAIN_LABELS } from '../src/admin-contract.js';
import fs from 'node:fs';

const official = {
  revision: 'fixture-revision',
  version: { data_version: 'V9' },
  domains: {
    settings: [
      { key: 'retire_age', value: 65, type: 'number', description: '退休年齡', formula: '=B2*1' },
      { key: 'inflation_rate', value: 0.025, type: 'number', description: '通脹假設' }
    ],
    pages: [{ page_id: 'home', sort_order: 1, page_type: 'conversation', title: '首頁', subtitle: '開始', hero_label: '退休規劃', visible: true, protected: false }],
    options: [{ group_id: 'income', option_id: 'salary', sort_order: 1, label: '薪金', value: 'salary', active: true }],
    stages: [{ stage_id: 'early', sort_order: 1, name: '早期', start_age: 60, end_age: 69, spending_percent: 100, active: true, description: '早期退休' }],
    assets: [{ asset_id: 'cash', sort_order: 1, name: '現金', default_growth_rate: 0, active: true, description: '現金資源' }],
    calculations: [{ calculation_id: 'sustainability', name: '可持續性', enabled: true, detail_default_open: false, description: '退休計算' }],
    returnRegistry: [{ plan_id: 'plan-a', '分頁名稱': '回報表_A', '前台顯示名稱': '方案 A', '排序': 1, '啟用': true }]
  },
  returnRegistry: [{ planId: 'plan-a', sheetName: '回報表_A', label: '方案 A', enabled: true }],
  returnTables: { 'plan-a': [{ policyYear: 1, withdrawalRate: 5, multiplier: 1.16 }, { policyYear: 2, withdrawalRate: 5, multiplier: 1.22 }] }
};

test('Retire Admin renders Saving-style cards, one active panel, actual counts, and selectors', () => {
  const markup = renderAdminMarkup(official, { domain: 'settings', selectedPlan: 'plan-a', selectedRecords: { settings: 1 }, revision: official.revision, status: 'Official 已讀取；未保存草稿。' });
  assert.equal(DOMAIN_ORDER.length, 8);
  for (const domain of DOMAIN_ORDER) {
    assert.match(markup, new RegExp(`data-domain="${domain}"`));
    assert.match(markup, new RegExp(`data-admin-panel="${domain}"`));
    assert.match(markup, new RegExp(`aria-controls="admin-panel-${domain}"`));
  }
  assert.match(markup, /id="admin-tab-settings"[^>]*aria-selected="true"/);
  assert.match(markup, /id="admin-tab-pages"[^>]*aria-selected="false"/);
  assert.match(markup, /id="admin-panel-pages"[^>]*hidden/);
  assert.match(markup, /data-admin-record-select="settings"/);
  assert.match(markup, /data-row-json=/);
  assert.match(markup, /<small>2 筆<\/small>/);
  assert.match(markup, /系統資料<\/summary>/);
  assert.match(markup, /<details class="admin-system-info"><summary>系統資料<\/summary>/);
  assert.match(markup, /data-admin-field="value"/);
  assert.doesNotMatch(markup, /data-admin-field="key"/);
  assert.match(markup, /其他欄位已保留（1 項）/);
});

test('Retire Admin preserves domain-specific identity and read-only return rows', () => {
  assert.equal(selectedPlanId(official), 'plan-a');
  assert.equal(rowDomainRows(official, 'returnRows', 'plan-a').length, 2);
  assert.equal(identityKey('pages', official.domains.pages[0]), 'home');
  assert.equal(identityKey('returnRows', official.returnTables['plan-a'][0]), '保單年度 1');
  const markup = renderAdminMarkup(official, { domain: 'returnRows', selectedPlan: 'plan-a', selectedRecords: { returnRows: 1 }, revision: official.revision, status: '已讀取' });
  assert.match(markup, /id="admin-tab-returnRows"[^>]*aria-selected="true"/);
  assert.match(markup, /id="admin-plan"/);
  assert.match(markup, /回報表資料為唯讀/);
  assert.doesNotMatch(markup, /data-admin-field="policyYear"/);
  assert.doesNotMatch(markup, /data-admin-field="withdrawalRate"/);
  assert.doesNotMatch(markup, /data-admin-field="multiplier"/);
});

test('Retire Admin CSS uses wrapped cards and hides panels safely at responsive breakpoints', () => {
  const css = fs.readFileSync(new URL('../design-system/management.css', import.meta.url), 'utf8');
  assert.match(css, /\.admin-tabs\s*\{[\s\S]*grid-template-columns: repeat\(4/);
  assert.match(css, /\.ava-management \[hidden\][\s\S]*display: none !important/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.doesNotMatch(css, /retire-admin-table|ava-management__sidebar/);
  for (const label of Object.values(DOMAIN_LABELS)) assert.ok(label);
});
