const APP_ID = 'retire';
const PLATFORM_ORIGIN = 'https://ivancww.github.io';
const OFFICIAL_API = 'https://script.google.com/macros/s/AKfycbyaup9srjMJkdvzgixi4Kjs9lT6RRI2L-CMqJB-QLuQ2u0grArDxq3vI_4hZyr6PiPOAw/exec';
let adminSessionProof = '';

function launchTicket(location = globalThis.location) { return new URLSearchParams(location?.search || '').get('avaAdminLaunch') || ''; }
function launchNonce(location = globalThis.location) { return new URLSearchParams(location?.search || '').get('avaAdminLaunchNonce') || ''; }
function clearLaunchFromUrl(location = globalThis.location, history = globalThis.history) { if (!location || !history?.replaceState) return; const url = new URL(location.href); url.searchParams.delete('avaAdminLaunch'); url.searchParams.delete('avaAdminLaunchNonce'); history.replaceState({}, globalThis.document?.title || 'AVA Retire', `${url.pathname}${url.search}${url.hash}`); }
async function exchangeAdminSession(fetchImpl = globalThis.fetch, location = globalThis.location) {
  const ticket = launchTicket(location), nonce = launchNonce(location), opener = globalThis.opener; if (!ticket || !nonce || !opener) throw new Error('此管理入口必須由 AVA Studio 的安全視窗開啟。');
  const browser = await new Promise((resolve, reject) => { let settled = false; const finish = (error, value) => { if (settled) return; settled = true; globalThis.removeEventListener?.('message', onMessage); globalThis.clearTimeout?.(timer); if (error) reject(error); else resolve(value); }; const timer = globalThis.setTimeout(() => finish(new Error('AVA browser binding expired')), 120000); const onMessage = event => { const data = event?.data || {}; if (event.source !== opener || event.origin !== PLATFORM_ORIGIN || data.type !== 'ava-admin-session-response') return; if (data.appId !== APP_ID || data.launchTicket !== ticket || data.launchNonce !== nonce || !data.browserProof || data.contract !== 'ava-admin-session-v1') return; finish(null, data); }; globalThis.addEventListener?.('message', onMessage); opener.postMessage({ type: 'ava-admin-session-request', appId: APP_ID, launchTicket: ticket, launchNonce: nonce }, PLATFORM_ORIGIN); });
  const response = await fetchImpl(OFFICIAL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'exchangeAdminSession', launchTicket: ticket, launchNonce: nonce, browserProof: browser.browserProof, appId: APP_ID }) });
  let payload; try { payload = await response.json(); } catch { throw new Error('此管理入口需要由 AVA Studio 驗證後開啟。'); }
  if (!response.ok || payload.success !== true || payload.appId !== APP_ID || !payload.adminSessionProof || payload.contract !== 'ava-admin-session-v1') throw new Error('此管理入口需要由 AVA Studio 驗證後開啟。');
  adminSessionProof = String(payload.adminSessionProof); clearLaunchFromUrl(location); return { expiresAt: payload.expiresAt };
}
async function request(action, body = {}, fetchImpl = globalThis.fetch) {
  if (!adminSessionProof) throw new Error('AVA Admin authorization is required');
  const response = await fetchImpl(OFFICIAL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, action, adminSessionProof }) });
  let payload; try { payload = await response.json(); } catch { throw new Error('Invalid Retire Admin response'); }
  if (!response.ok || payload.success !== true || payload.appId !== APP_ID) throw new Error(payload.error || 'Retire Admin request failed');
  return payload;
}
function clear() { adminSessionProof = ''; }
function hasSession() { return Boolean(adminSessionProof); }
export { APP_ID, PLATFORM_ORIGIN, OFFICIAL_API, launchTicket, launchNonce, exchangeAdminSession, request, clear, hasSession };
