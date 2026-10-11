import { APP_VERSION } from './version.js';
import { clear, exchangeAdminSession, hasSession, request } from './admin-auth.js';
import { DOMAIN_LABELS, editableFieldsFor, fieldLabel, fieldsFor, operationFor, validateRows } from './admin-contract.js';

const AVA_PLATFORM_URL = 'https://ivancww.github.io/avaplatform/';
const AVA_RETURN_URL = `${AVA_PLATFORM_URL}?avaSurface=admin`;
const DOMAIN_ORDER = ['settings', 'pages', 'options', 'stages', 'assets', 'calculations', 'returnRegistry', 'returnRows'];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const inputValue = (value) => String(value ?? '');

function rowDomainRows(official, domain, selectedPlan) {
  if (domain === 'returnRows') return official.returnTables?.[selectedPlan] || [];
  return official.domains?.[domain] || [];
}

function renderTable(official, domain, selectedPlan) {
  const rows = rowDomainRows(official, domain, selectedPlan);
  if (!rows.length) return '<p class="ava-management__status">目前沒有可管理的 Official 資料。</p>';
  const fields = fieldsFor(domain, rows[0]);
  const editable = new Set(editableFieldsFor(domain, rows[0]));
  const control = (row, field, rowIndex) => {
    const value = row[field]; const type = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text';
    if (!editable.has(field)) return `<span class="admin-readonly" data-field="${esc(field)}">${esc(inputValue(value) || '—')}</span>`;
    if (type === 'checkbox') return `<input class="ava-input admin-cell" data-row="${rowIndex}" data-field="${esc(field)}" data-original-type="boolean" type="checkbox" ${value === true ? 'checked' : ''} aria-label="${esc(fieldLabel(field))} ${rowIndex + 1}">`;
    return `<input class="ava-input admin-cell" data-row="${rowIndex}" data-field="${esc(field)}" data-original-type="${typeof value}" type="${type}" value="${esc(inputValue(value))}" aria-label="${esc(fieldLabel(field))} ${rowIndex + 1}">`;
  };
  return `<div class="retire-admin-table-wrap"><table class="retire-admin-table"><thead><tr>${fields.map((field) => `<th scope="col">${esc(fieldLabel(field))}</th>`).join('')}</tr></thead><tbody>${rows.map((row, rowIndex) => `<tr>${fields.map((field) => `<td>${control(row, field, rowIndex)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function selectedPlanId(official) { return official.returnRegistry?.find((plan) => plan.enabled !== false)?.planId || official.returnRegistry?.[0]?.planId || ''; }

function mountAdmin(app) {
  const state = { official: null, domain: 'settings', selectedPlan: '', status: '正在由 AVA Studio 驗證管理入口…', busy: false, dirty: false };
  const render = () => {
    if (!state.official) { app.innerHTML = `<div class="ava-management"><header class="ava-management__header"><div class="retire-admin-identity"><span>AVA RETIRE</span><small>Admin / 官方設定 · V${APP_VERSION}</small></div><a class="ava-button ava-button--secondary" href="${AVA_RETURN_URL}">← 返回 AVA</a></header><main class="ava-management__workspace"><section class="ava-management__content"><p class="ava-management__status">${esc(state.status)}</p></section></main></div>`; return; }
    const planOptions = (state.official.returnRegistry || []).map((plan) => `<option value="${esc(plan.planId)}" ${plan.planId === state.selectedPlan ? 'selected' : ''}>${esc(plan.label || plan.planId)}</option>`).join('');
    const isRows = state.domain === 'returnRows';
    app.innerHTML = `<div class="ava-management"><header class="ava-management__header"><div class="retire-admin-identity"><span>AVA RETIRE</span><small>Admin / 官方設定 · V${APP_VERSION}</small></div><a class="ava-button ava-button--secondary" href="${AVA_RETURN_URL}">← 返回 AVA</a></header><div class="ava-management__workspace"><nav class="ava-management__sidebar" role="tablist" aria-label="Retire 官方資料分頁">${DOMAIN_ORDER.map((domain, index) => `<button class="ava-management__sidebar-button" type="button" role="tab" data-domain="${domain}" aria-selected="${domain === state.domain}" aria-controls="admin-panel-${domain}" tabindex="${domain === state.domain ? 0 : -1}">${DOMAIN_LABELS[domain]}</button>`).join('')}</nav><main class="ava-management__content"><section class="ava-management__card" id="admin-panel-${state.domain}" role="tabpanel" tabindex="-1"><p class="eyebrow">官方資料層</p><h1>${DOMAIN_LABELS[state.domain]}</h1><p class="help">只管理 Retire 官方設定；不會寫入 User Overrides 或客戶工作資料。穩定 ID 與未支援欄位維持唯讀。</p>${isRows ? `<label class="ava-field"><span class="ava-label">回報表</span><select class="ava-select" id="admin-plan">${planOptions}</select></label>` : ''}<div id="admin-table">${renderTable(state.official, state.domain, state.selectedPlan)}</div><div class="ava-management__actions"><span class="ava-management__status" id="admin-status">${esc(state.status)}</span><button class="ava-button ava-button--primary" id="admin-save" type="button">驗證並儲存官方資料</button></div></section><details class="retire-system-info"><summary>系統資訊</summary><p>Retire 官方資料管理 · V${APP_VERSION}。寫入仍受 AVA Studio browser-bound authorization 保護。</p></details></main></div></div>`;
    app.querySelectorAll('[data-domain]').forEach((button, index, buttons) => button.addEventListener('click', () => { if (state.dirty && !globalThis.confirm?.('目前有未保存的編輯。要放棄草稿並切換嗎？')) return; state.dirty = false; state.domain = button.dataset.domain; state.status = '已載入已保存 Official 值。'; render(); }));
    app.querySelectorAll('.admin-cell').forEach((input) => input.addEventListener('input', () => { state.dirty = true; }));
    app.querySelector('#admin-plan')?.addEventListener('change', (event) => { if (state.dirty && !globalThis.confirm?.('目前有未保存的編輯。要放棄草稿並切換回報表嗎？')) { event.target.value = state.selectedPlan; return; } state.dirty = false; state.selectedPlan = event.target.value; render(); });
    app.querySelectorAll('[data-domain]').forEach((button, index, buttons) => button.addEventListener('keydown', (event) => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length; buttons[next].focus(); }));
    app.querySelector('#admin-save')?.addEventListener('click', () => saveCurrent());
  };
  const load = async () => { try { await exchangeAdminSession(); if (!hasSession()) throw new Error('Admin authorization is required'); const payload = await request('readOfficialConfig'); state.official = payload.official; state.selectedPlan = selectedPlanId(state.official); state.status = 'Official 已讀取；未保存草稿。'; render(); } catch (error) { clear(); state.status = error.message || '此管理入口需要由 AVA Studio 驗證後開啟。'; render(); } };
  const saveCurrent = async () => {
    if (state.busy) return; state.busy = true; const button = app.querySelector('#admin-save'); if (button) button.disabled = true; const status = app.querySelector('#admin-status'); if (status) status.textContent = '正在驗證、保存並重新讀取…';
    try {
      const rows = [...app.querySelectorAll('.admin-cell')]; const source = rowDomainRows(state.official, state.domain, state.selectedPlan).map((row) => ({ ...row })); rows.forEach((input) => { source[Number(input.dataset.row)][input.dataset.field] = input.type === 'checkbox' ? input.checked : input.dataset.originalType === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value; }); validateRows(state.domain, source);
      const body = state.domain === 'returnRows' ? { planId: state.selectedPlan, rows: source } : { rows: source };
      const payload = await request(operationFor(state.domain), body); if (payload.acknowledged !== true) throw new Error('伺服器未確認 Official 保存');
      const reread = await request('readOfficialConfig'); if (!reread.official) throw new Error('Official 重新讀取失敗'); const confirmed = rowDomainRows(reread.official, state.domain, state.selectedPlan); if (JSON.stringify(confirmed) !== JSON.stringify(source)) throw new Error('伺服器重新讀取的 Official 資料與提交內容不一致'); state.official = reread.official; state.dirty = false; state.status = 'Official 已保存並由伺服器確認；已重新讀取。'; render();
    } catch (error) { state.status = `保存失敗：${error.message || '未能保存 Official'}`; const status = app.querySelector('#admin-status'); if (status) status.textContent = state.status; } finally { state.busy = false; }
  };
  render(); load();
}

export { mountAdmin };
