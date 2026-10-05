const APP_ID = 'retire';
const OFFICIAL_API = 'https://script.google.com/macros/s/AKfycbyaup9srjMJkdvzgixi4Kjs9lT6RRI2L-CMqJB-QLuQ2u0grArDxq3vI_4hZyr6PiPOAw/exec';
let appGrant = '';

function launchTicket(location = globalThis.location) { return new URLSearchParams(location?.search || '').get('avaAdminLaunch') || ''; }
function clearLaunchFromUrl(location = globalThis.location, history = globalThis.history) { if (!location || !history?.replaceState) return; const url = new URL(location.href); url.searchParams.delete('avaAdminLaunch'); history.replaceState({}, globalThis.document?.title || 'AVA Retire', `${url.pathname}${url.search}${url.hash}`); }
async function exchangeAppLaunch(fetchImpl = globalThis.fetch, location = globalThis.location) {
  const ticket = launchTicket(location); if (!ticket) throw new Error('此管理入口需要由 AVA Studio 驗證後開啟。');
  const response = await fetchImpl(OFFICIAL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'exchangeAppLaunch', launchTicket: ticket, appId: APP_ID }) });
  let payload; try { payload = await response.json(); } catch { throw new Error('此管理入口需要由 AVA Studio 驗證後開啟。'); }
  if (!response.ok || payload.success !== true || payload.appId !== APP_ID || !payload.appGrant) throw new Error('此管理入口需要由 AVA Studio 驗證後開啟。');
  appGrant = String(payload.appGrant); clearLaunchFromUrl(location); return { expiresAt: payload.expiresAt };
}
async function request(action, body = {}, fetchImpl = globalThis.fetch) {
  if (!appGrant) throw new Error('AVA Admin authorization is required');
  const response = await fetchImpl(OFFICIAL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, action, appGrant }) });
  let payload; try { payload = await response.json(); } catch { throw new Error('Invalid Retire Admin response'); }
  if (!response.ok || payload.success !== true || payload.appId !== APP_ID) throw new Error(payload.error || 'Retire Admin request failed');
  return payload;
}
function clear() { appGrant = ''; }
function hasGrant() { return Boolean(appGrant); }
export { APP_ID, OFFICIAL_API, launchTicket, exchangeAppLaunch, request, clear, hasGrant };
