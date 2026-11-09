// Back to the platform's app picker
(function () {
  const css = document.createElement('style');
  css.textContent = `.wady-back{position:fixed;inset-inline-start:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9999;display:inline-flex;align-items:center;gap:6px;background:#051D48;color:#fff;border-radius:999px;padding:8px 14px;font:600 13px Tajawal,system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 14px rgba(5,29,72,.3)}
  .wady-back:hover{background:#0a2c66}@media print{.wady-back{display:none}}
  #side,#side nav,aside nav{padding-bottom:64px!important}`;
  document.head.appendChild(css);
  const a = document.createElement('a'); a.className = 'wady-back'; a.href = '../index.html#apps'; a.title = 'الرجوع لاختيار التطبيق';
  a.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> كل التطبيقات';
  const add = () => document.body && document.body.appendChild(a);
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
