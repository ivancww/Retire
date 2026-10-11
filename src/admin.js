import { APP_VERSION } from './version.js';
import { clear, exchangeAdminSession, hasSession, request } from './admin-auth.js';
import { DOMAIN_LABELS, editableFieldsFor, fieldLabel, fieldsFor, operationFor, validateRows } from './admin-contract.js';

const AVA_PLATFORM_URL = 'https://ivancww.github.io/avaplatform/';
const AVA_RETURN_URL = `${AVA_PLATFORM_URL}?avaSurface=admin`;
export const DOMAIN_ORDER = ['settings', 'pages', 'options', 'stages', 'assets', 'calculations', 'returnRegistry', 'returnRows'];
const TEXTAREA_FIELDS = new Set(['description', 'subtitle']);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function inputValue(value) { return String(value ?? ''); }
function fieldValue(row, field) { return row[field] === undefined || row[field] === null ? '' : row[field]; }

export function rowDomainRows(official, domain, selectedPlan) {
  if (domain === 'returnRows') return Array.isArray(official?.returnTables?.[selectedPlan]) ? official.returnTables[selectedPlan] : [];
  return Array.isArray(official?.domains?.[domain]) ? official.domains[domain] : [];
}

export function selectedPlanId(official) {
  return official?.returnRegistry?.find((plan) => plan.enabled !== false)?.planId || official?.returnRegistry?.[0]?.planId || '';
}

export function identityKey(domain, row, index = 0) {
  const value = domain === 'settings' ? row.key
    : domain === 'pages' ? row.page_id
      : domain === 'options' ? [row.group_id, row.option_id].filter(Boolean).join(' / ')
        : domain === 'stages' ? row.stage_id
          : domain === 'assets' ? row.asset_id
            : domain === 'calculations' ? row.calculation_id
              : domain === 'returnRegistry' ? row.plan_id
                : domain === 'returnRows' && row.policyYear !== undefined ? `保單年度 ${row.policyYear}` : '';
  return value === undefined || value === null || value === '' ? `未提供識別碼 · 第 ${index + 1} 筆` : String(value);
}

function recordIndex(state, domain, rows) {
  const requested = Number(state.selectedRecords?.[domain] || 0);
  return rows.length ? Math.min(Math.max(requested, 0), rows.length - 1) : 0;
}

function displayValue(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return inputValue(value) || '—';
}

function fieldType(row, field) {
  const value = row[field];
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  if (TEXTAREA_FIELDS.has(field)) return 'textarea';
  return 'text';
}

function renderField(row, field, rowIndex, editable) {
  const value = fieldValue(row, field);
  const label = fieldLabel(field);
  const type = fieldType(row, field);
  const id = `admin-${rowIndex}-${field}`;
  if (!editable) {
    return `<div class="admin-field admin-field--readonly"><span>${esc(label)} <small class="admin-field-note">（唯讀）</small></span><span class="admin-readonly" data-field="${esc(field)}" aria-label="${esc(label)}">${esc(displayValue(value))}</span></div>`;
  }
  const common = `id="${esc(id)}" class="ava-input admin-cell" data-admin-field="${esc(field)}" data-admin-type="${type}" data-original-type="${esc(typeof value)}" aria-label="${esc(label)}"`;
  if (type === 'checkbox') return `<label class="admin-field admin-field--checkbox" for="${esc(id)}"><span>${esc(label)}</span><input ${common} type="checkbox" ${value === true ? 'checked' : ''}></label>`;
  if (type === 'textarea') return `<label class="admin-field" for="${esc(id)}"><span>${esc(label)}</span><textarea ${common}>${esc(value)}</textarea></label>`;
  return `<label class="admin-field" for="${esc(id)}"><span>${esc(label)}</span><input ${common} type="${type === 'number' ? 'number' : 'text'}" value="${esc(value)}"></label>`;
}

function renderRecord(domain, row, index, activeIndex, readOnlyDomain) {
  const knownFields = fieldsFor(domain, {});
  const editable = new Set(readOnlyDomain ? [] : editableFieldsFor(domain, {}));
  const unknown = Object.keys(row).filter((field) => !knownFields.includes(field));
  const unknownSummary = unknown.length
    ? `<details class="admin-extra"><summary>其他欄位已保留（${unknown.length} 項）</summary><p class="quiet-note">${esc(unknown.join('、'))} 不在此編輯器修改；儲存時會原樣保留。</p></details>`
    : '';
  return `<article class="admin-record" data-admin-row data-admin-domain="${esc(domain)}" data-admin-record-index="${index}" ${index === activeIndex ? '' : 'hidden'} data-row-json="${esc(JSON.stringify(row))}"><div class="admin-record-heading"><div class="admin-record-identity"><span class="eyebrow">${esc(identityKey(domain, row, index))}</span><h3>${esc(DOMAIN_LABELS[domain])} · 第 ${index + 1} 筆</h3></div><span class="admin-record-index">${readOnlyDomain ? '只讀資料' : '已選記錄'}</span></div><div class="admin-field-grid">${knownFields.map((field) => renderField(row, field, index, editable.has(field))).join('')}</div>${unknownSummary}</article>`;
}

function renderRecordSelector(domain, rows, selectedIndex, readOnlyDomain) {
  if (!rows.length) return '';
  const description = readOnlyDomain ? '只供核對官方回報表資料；此分區不會發出寫入請求。' : '只編輯已選記錄；切換記錄前如有草稿會先要求確認。';
  return `<div class="admin-record-tools"><label for="admin-record-select-${esc(domain)}"><span>選擇記錄</span><select class="ava-select" id="admin-record-select-${esc(domain)}" data-admin-record-select="${esc(domain)}" aria-label="選擇記錄">${rows.map((row, index) => `<option value="${index}" ${index === selectedIndex ? 'selected' : ''}>${esc(identityKey(domain, row, index))} · 第 ${index + 1} 筆</option>`).join('')}</select></label><span class="quiet-note">已選：<strong>${esc(identityKey(domain, rows[selectedIndex], selectedIndex))}</strong><br>${esc(description)}</span></div>`;
}

function renderPanel(official, state, domain, activeDomain) {
  const rows = rowDomainRows(official, domain, state.selectedPlan);
  const active = domain === activeDomain;
  const readOnlyDomain = domain === 'returnRows';
  const selectedIndex = recordIndex(state, domain, rows);
  const planOptions = (official?.returnRegistry || []).map((plan) => `<option value="${esc(plan.planId)}" ${plan.planId === state.selectedPlan ? 'selected' : ''}>${esc(plan.label || plan.planId)}</option>`).join('');
  const dataName = domain === 'returnRows' ? `returnTables.${state.selectedPlan || '未選擇回報表'}` : `domains.${domain}`;
  const canSave = !readOnlyDomain && rows.length > 0 && !state.busy;
  return `<section class="ava-card admin-domain" id="admin-panel-${esc(domain)}" data-admin-panel="${esc(domain)}" role="tabpanel" aria-labelledby="admin-tab-${esc(domain)}" tabindex="-1" ${active ? '' : 'hidden'}><div class="admin-domain-heading"><div><span class="eyebrow">Retire · ${esc(dataName)}</span><h2>${esc(DOMAIN_LABELS[domain])}</h2><p class="quiet-note">只管理 Retire 官方設定；不會寫入 User Overrides 或客戶工作資料。穩定 ID、技術欄位及回報表資料按既有合約維持唯讀。</p></div><span class="admin-count">${rows.length} 筆</span></div>${domain === 'returnRows' ? `<label class="admin-plan-tools" for="admin-plan"><span>回報表</span><select class="ava-select" id="admin-plan">${planOptions || '<option value="">目前沒有可用回報表</option>'}</select></label>` : ''}${rows.length ? `${renderRecordSelector(domain, rows, selectedIndex, readOnlyDomain)}${rows.map((row, index) => renderRecord(domain, row, index, selectedIndex, readOnlyDomain)).join('')}` : '<p class="ava-management__status">目前沒有可管理的 Official 資料。</p>'}<div class="actions admin-actions"><button class="ava-button ava-button--primary" data-action="admin-save" type="button" ${canSave ? '' : 'disabled'}>${readOnlyDomain ? '回報表資料為唯讀' : '驗證並儲存官方資料'}</button><button class="ava-button ava-button--secondary" data-action="admin-reset" type="button" ${rows.length && !state.busy ? '' : 'disabled'}>放棄本頁修改</button><span class="quiet-note" id="admin-status-${esc(domain)}" data-admin-status role="status">${esc(active ? state.status : '')}</span></div></section>`;
}

export function renderAdminMarkup(official, state = {}) {
  if (state.error) return `<div class="ava-management"><header class="ava-management__header"><div class="retire-admin-identity"><span>AVA RETIRE</span><small>Admin / 官方設定 · V${esc(APP_VERSION)}</small></div><a class="ava-button ava-button--secondary return-ava" href="${esc(AVA_RETURN_URL)}">← 返回 AVA</a></header><main class="ava-management__workspace"><section class="ava-card ava-management__content" role="alert"><strong>Retire Admin 未能啟動。</strong><p>${esc(state.error)}</p><p>沒有有效 Platform launch 或 App Grant 時，Official data 不會寫入。</p></section></main></div>`;
  const activeDomain = DOMAIN_ORDER.includes(state.domain) ? state.domain : 'settings';
  const selectedPlan = state.selectedPlan || selectedPlanId(official);
  const renderState = { ...state, selectedPlan, domain: activeDomain, selectedRecords: state.selectedRecords || {} };
  return `<div class="ava-management"><header class="ava-management__header"><div class="retire-admin-identity"><span>AVA RETIRE</span><small>Admin / 官方設定 · V${esc(APP_VERSION)}</small></div><a class="ava-button ava-button--secondary return-ava" href="${esc(AVA_RETURN_URL)}">← 返回 AVA</a></header><main class="ava-management__workspace"><div class="front-topline"><span>AVA Studio · Retire Admin</span><span>Official Layer only</span></div><nav class="admin-tabs" aria-label="Retire 官方資料分區" role="tablist">${DOMAIN_ORDER.map((domain) => `<button id="admin-tab-${esc(domain)}" class="admin-tab ${domain === activeDomain ? 'is-active' : ''}" data-action="admin-tab" data-domain="${esc(domain)}" role="tab" aria-selected="${domain === activeDomain}" aria-controls="admin-panel-${esc(domain)}" tabindex="${domain === activeDomain ? '0' : '-1'}" type="button"><span>${esc(DOMAIN_LABELS[domain])}</span><small>${rowDomainRows(official, domain, selectedPlan).length} 筆</small></button>`).join('')}</nav><div class="admin-panels">${DOMAIN_ORDER.map((domain) => renderPanel(official, renderState, domain, activeDomain)).join('')}</div><details class="admin-system-info"><summary>系統資料</summary><div class="admin-system-grid"><p><strong>Retire App 版本</strong><span>V${esc(APP_VERSION)}</span></p><p><strong>Official data version</strong><span>${esc(official?.version?.data_version || official?.data_version || '未提供')}</span></p><p><strong>Dataset revision</strong><span>${esc(state.revision || official?.revision || official?.version?.revision || '未提供')}</span></p><p><strong>同步狀態</strong><span>Official data 已載入；寫入仍受 AVA Studio browser-bound authorization、expected revision、server persistence 及 read-after-write 保護。</span></p></div></details></main></div>`;
}

function readField(field) {
  if (field.dataset.adminType === 'checkbox') return field.checked;
  if (field.dataset.adminType === 'number') return field.value === '' ? '' : Number(field.value);
  return field.value;
}

function readSelectedRows(app, official, state) {
  const rows = rowDomainRows(official, state.domain, state.selectedPlan).map((row) => clone(row));
  const selected = recordIndex(state, state.domain, rows);
  const panel = app.querySelector(`[data-admin-panel="${state.domain}"]`);
  const record = panel?.querySelector(`[data-admin-row][data-admin-record-index="${selected}"]`);
  if (!record) throw new Error(`${DOMAIN_LABELS[state.domain]} 必須有可讀取的官方記錄。`);
  let row;
  try { row = JSON.parse(record.dataset.rowJson || '{}'); } catch (_) { throw new Error(`${DOMAIN_LABELS[state.domain]} 的資料格式無法讀取。`); }
  record.querySelectorAll('[data-admin-field]').forEach((field) => { row[field.dataset.adminField] = readField(field); });
  rows[selected] = row;
  return rows;
}

export function readAdminPayload(app, official, state) {
  return readSelectedRows(app, official, state);
}

function dirty(state) { return state.dirty === true; }

function mountAdmin(app) {
  const state = { official: null, revision: '', domain: 'settings', selectedPlan: '', selectedRecords: {}, status: '正在由 AVA Studio 驗證管理入口…', busy: false, dirty: false };
  const render = () => {
    app.innerHTML = renderAdminMarkup(state.official, state.official ? state : { error: state.status });
    if (!state.official) return;
    bind();
  };
  const confirmDiscard = (message) => !dirty(state) || globalThis.confirm?.(message) === true;
  const switchDomain = (domain) => {
    if (!DOMAIN_ORDER.includes(domain) || state.domain === domain) return true;
    if (!confirmDiscard('目前有未保存的編輯。要放棄草稿並切換官方資料分區嗎？')) return false;
    state.dirty = false; state.domain = domain; state.status = '已載入已保存 Official 值。'; render();
    app.querySelector(`[data-action="admin-tab"][data-domain="${domain}"]`)?.focus?.({ preventScroll: true });
    return true;
  };
  const switchRecord = (domain, index) => {
    if (state.domain !== domain) return false;
    const rows = rowDomainRows(state.official, domain, state.selectedPlan);
    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= rows.length) return false;
    if (recordIndex(state, domain, rows) === nextIndex) return true;
    if (!confirmDiscard('目前記錄有未保存的編輯。要放棄草稿並切換記錄嗎？')) return false;
    state.dirty = false; state.selectedRecords[domain] = nextIndex; state.status = '已載入已保存 Official 值。'; render();
    return true;
  };
  const resetCurrent = () => { state.dirty = false; state.status = '已放棄本頁修改；載入已確認 Official 值。'; render(); };
  const bind = () => {
    const tabs = [...app.querySelectorAll('[data-action="admin-tab"]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => switchDomain(tab.dataset.domain));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
        switchDomain(tabs[next].dataset.domain);
      });
    });
    app.querySelectorAll('[data-admin-field]').forEach((field) => { field.addEventListener('input', () => { state.dirty = true; }); field.addEventListener('change', () => { state.dirty = true; }); });
    app.querySelectorAll('[data-admin-record-select]').forEach((selector) => selector.addEventListener('change', () => switchRecord(selector.dataset.adminRecordSelect, selector.value)));
    app.querySelector('#admin-plan')?.addEventListener('change', (event) => {
      if (!confirmDiscard('目前有未保存的編輯。要放棄草稿並切換回報表嗎？')) { event.target.value = state.selectedPlan; return; }
      state.dirty = false; state.selectedPlan = event.target.value; state.selectedRecords.returnRows = 0; state.status = '已載入已保存 Official 值。'; render();
    });
    app.querySelectorAll('[data-action="admin-reset"]').forEach((button) => button.addEventListener('click', resetCurrent));
    app.querySelector(`[data-admin-panel="${state.domain}"] [data-action="admin-save"]`)?.addEventListener('click', () => saveCurrent());
  };
  const load = async () => {
    try {
      await exchangeAdminSession();
      if (!hasSession()) throw new Error('Admin authorization is required');
      const payload = await request('readOfficialConfig');
      if (!payload.revision) throw new Error('伺服器未提供 Official revision');
      state.official = payload.official;
      state.revision = String(payload.revision);
      state.selectedPlan = selectedPlanId(state.official);
      state.selectedRecords = Object.fromEntries(DOMAIN_ORDER.map((domain) => [domain, 0]));
      state.status = 'Official 已讀取；未保存草稿。';
      render();
    } catch (error) {
      clear(); state.status = error.message || '此管理入口需要由 AVA Studio 驗證後開啟。'; render();
    }
  };
  const saveCurrent = async () => {
    if (state.domain === 'returnRows') { state.status = '回報表資料為唯讀，未發出寫入請求。'; const status = app.querySelector(`[data-admin-status]`); if (status) status.textContent = state.status; return; }
    if (state.busy) return;
    state.busy = true;
    const button = app.querySelector(`[data-admin-panel="${state.domain}"] [data-action="admin-save"]`);
    if (button) button.disabled = true;
    const status = app.querySelector(`[data-admin-panel="${state.domain}"] [data-admin-status]`);
    if (status) status.textContent = '正在驗證、保存並重新讀取…';
    try {
      const source = readSelectedRows(app, state.official, state);
      validateRows(state.domain, source);
      const payload = await request(operationFor(state.domain), { rows: source, expectedRevision: state.revision });
      if (payload.acknowledged !== true || payload.persisted !== true || payload.readAfterWrite !== true || !payload.revision || !payload.official) throw new Error('伺服器未提供完整 Official 持久化證據');
      const confirmedWrite = rowDomainRows(payload.official, state.domain, state.selectedPlan); if (JSON.stringify(confirmedWrite) !== JSON.stringify(source)) throw new Error('寫入回應中的 Official 資料與提交內容不一致');
      const reread = await request('readOfficialConfig'); if (!reread.official || String(reread.revision) !== String(payload.revision)) throw new Error('Official 重新讀取 revision 不一致'); const confirmed = rowDomainRows(reread.official, state.domain, state.selectedPlan); if (JSON.stringify(confirmed) !== JSON.stringify(source)) throw new Error('伺服器重新讀取的 Official 資料與提交內容不一致'); state.official = reread.official; state.revision = String(reread.revision); state.dirty = false; state.status = 'Official 已保存並由伺服器確認；已重新讀取。'; render();
    } catch (error) {
      state.status = `保存失敗：${error.message || '未能保存 Official'}`;
      const currentStatus = app.querySelector(`[data-admin-panel="${state.domain}"] [data-admin-status]`);
      if (currentStatus) currentStatus.textContent = state.status;
    } finally { state.busy = false; }
  };
  render();
  load();
}

export { mountAdmin };
