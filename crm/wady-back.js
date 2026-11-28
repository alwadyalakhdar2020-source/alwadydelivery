// Back to the platform's app picker + sign out (shared by HR, CRM and delivery)
(function () {
  const css = document.createElement('style');
  css.textContent = `.wady-back{position:fixed;inset-inline-start:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;display:flex;gap:8px}
  .wady-back .wb{display:inline-flex;align-items:center;gap:6px;background:#051D48;color:#fff;border:0;cursor:pointer;border-radius:999px;padding:8px 14px;font:600 13px Tajawal,system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(5,29,72,.3)}
  .wady-back .wb:hover{background:#0a2c66}.wady-back .wb.out{background:#fff;color:#9b1c1c;box-shadow:0 2px 10px rgba(5,29,72,.18);border:1px solid #f0d0d0}.wady-back .wb.out:hover{background:#fdf2f2}
  @media print{.wady-back{display:none}}
  html.wb-end .wady-back{inset-inline-start:auto;inset-inline-end:12px}
  #side,#side nav,aside nav{padding-bottom:64px!important}
  /* 28/11: on a screen with a side menu the two buttons sit at the bottom of the menu instead of floating over it */
  .wady-back.in-side{position:static;inset:auto;flex-wrap:wrap;padding:12px 12px 56px;margin-top:auto;border-top:1px solid rgba(255,255,255,.12)}
  .wady-back.in-side .wb{flex:1;justify-content:center;min-height:40px}
  .wady-back.in-side .wb:not(.out){background:rgba(255,255,255,.1)}
  #side.has-wb,#side.has-wb nav,aside.has-wb nav{padding-bottom:0!important}`;
  document.head.appendChild(css);
  if (/\/fleet\//.test(location.pathname)) document.documentElement.classList.add('wb-end'); // keep clear of the hosting badge at the right corner
  const box = document.createElement('div'); box.className = 'wady-back';
  box.innerHTML = '<a class="wb" href="../index.html#apps" title="الرجوع لاختيار التطبيق"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> كل التطبيقات</a>'
    + '<button type="button" class="wb out" data-wady-logout title="تسجيل الخروج من كل التطبيقات"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/></svg> تسجيل الخروج</button>';
  // the side menu when it is shown (desktop), otherwise floating at the bottom corner (phone)
  const side = () => { const el = document.querySelector('#side, aside.side, aside#sidebar'); return el && el.offsetParent !== null && el.getBoundingClientRect().width > 120 ? el : null; };
  const place = () => { const sd = side();
    if (sd) { if (box.parentNode !== sd) { sd.classList.add('has-wb'); box.classList.add('in-side'); sd.appendChild(box); } }
    else if (box.parentNode !== document.body || box.classList.contains('in-side')) { document.querySelectorAll('.has-wb').forEach(x => x.classList.remove('has-wb')); box.classList.remove('in-side'); document.body && document.body.appendChild(box); } };
  const add = () => { place(); let pend = false; new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; if (!box.isConnected || (box.classList.contains('in-side') !== !!side())) place(); }); }).observe(document.body, { childList: true, subtree: true }); window.addEventListener('resize', place); };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
// one sign-out for every app: the apps share one session on this device, so this signs out of all of them
window.wadyLogout = async function () {
  if (!confirm('تسجيل الخروج من كل التطبيقات على هذا الجهاز؟')) return;
  try { if (window.wadyPush) await window.wadyPush.forget(); } catch (e) { }  // this device stops getting this user's alerts
  try { indexedDB.deleteDatabase('wady-cache'); } catch (e) { }  // local copies of data leave with the user
  let c = window.__sb; try { if (!c && typeof SB !== 'undefined') c = SB; } catch (e) { }
  try { if (c) await c.auth.signOut({ scope: 'local' }); } catch (e) { }
  try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { }
  location.replace('../index.html');
};
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-wady-logout]'); if (b) { e.preventDefault(); window.wadyLogout(); } }, true);
