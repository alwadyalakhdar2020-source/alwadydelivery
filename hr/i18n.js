'use strict';
/* ============ Arabic / English interface ============
   The UI is authored in Arabic. In English mode every rendered text node and
   UI attribute is translated through the dictionary in en.js (exact match first,
   then whole-fragment replacement). Data typed by users stays as entered. */
let LANG = 'ar';
try { LANG = localStorage.getItem('hr.lang') === 'en' ? 'en' : 'ar'; } catch (e) { }
const AR_RE = /[؀-ۿ]/;
const I18N = { map: new Map(), re: null };
(function buildI18n() {
  const d = window.EN_DICT || {};
  for (const [k, v] of Object.entries(d)) if (k && v) I18N.map.set(k.trim(), v);
  const keys = [...I18N.map.keys()].filter(k => k.length > 1 && AR_RE.test(k)).sort((a, b) => b.length - a.length);
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  I18N.re = keys.length ? new RegExp('(?<![\\u0600-\\u06FF])(' + keys.map(escRe).join('|') + ')(?![\\u0600-\\u06FF])', 'g') : null;
})();
const PUNCT = s => s.replace(/^(\s*)→ /, '$1← ').replace(/،/g, ',').replace(/؟/g, '?').replace(/؛/g, ';').replace(/[«»]/g, '"').replace(/ـ/g, '');
function tr(text) {
  if (LANG !== 'en' || text == null) return text;
  const s = String(text); if (!AR_RE.test(s)) return s;
  const t = s.trim(); const ex = I18N.map.get(t);
  if (ex) return s.replace(t, ex);
  let out = I18N.re ? s.replace(I18N.re, m => I18N.map.get(m) || m) : s;
  return PUNCT(out);
}
const LX = (ar, en) => LANG === 'en' ? en : ar; // for new strings written in both languages
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
function translateTree(root) {
  if (LANG !== 'en' || !root) return;
  if (root.nodeType === 3) { const p = root.parentNode; if (p && !SKIP.has(p.nodeName) && !p.closest?.('[data-noi18n]') && AR_RE.test(root.nodeValue)) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName) || root.closest?.('[data-noi18n]')) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n.nodeType === 1 ? (SKIP.has(n.nodeName) || n.hasAttribute('data-noi18n') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) : NodeFilter.FILTER_ACCEPT });
  const doEl = el => { for (const a of ATTRS) { const v = el.getAttribute(a); if (v && AR_RE.test(v)) { const nv = tr(v); if (nv !== v) el.setAttribute(a, nv); } } if (el.nodeName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && AR_RE.test(el.value)) { const nv = tr(el.value); if (nv !== el.value) el.value = nv; } };
  doEl(root);
  let n; while ((n = tw.nextNode())) { if (n.nodeType === 1) doEl(n); else if (AR_RE.test(n.nodeValue)) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } }
}
const i18nObserver = new MutationObserver(muts => {
  if (LANG !== 'en') return;
  for (const m of muts) {
    if (m.type === 'characterData') translateTree(m.target);
    else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName) || ''; if (AR_RE.test(v)) { const nv = tr(v); if (nv !== v) m.target.setAttribute(m.attributeName, nv); } }
    else m.addedNodes.forEach(translateTree);
  }
});
function applyLangToDocument() {
  document.documentElement.lang = LANG; document.documentElement.dir = LANG === 'en' ? 'ltr' : 'rtl';
  document.title = LANG === 'en' ? 'HR & Administrative Affairs Platform' : 'منصة الموارد البشرية والشؤون الإدارية';
}
function setLang(l) {
  LANG = l === 'en' ? 'en' : 'ar'; try { localStorage.setItem('hr.lang', LANG); } catch (e) { }
  applyLangToDocument();
  if (window.renderAll && S.ready) { closeModal(); renderAll(true); } else translateTree(document.body);
}
ACT['lang'] = () => setLang(LANG === 'en' ? 'ar' : 'en');
const langBtn = () => `<button class="icon-btn lang-btn" data-act="lang" data-noi18n aria-label="${LANG === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}" title="${LANG === 'en' ? 'العربية' : 'English'}">${LANG === 'en' ? 'ع' : 'EN'}</button>`;
applyLangToDocument();
i18nObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
document.addEventListener('DOMContentLoaded', () => translateTree(document.body));
// exported spreadsheets follow the interface language for headers and fixed labels
const _exportRows = exportRows;
exportRows = function (base, rows, sheetName, extra) {
  if (LANG !== 'en') return _exportRows(base, rows, sheetName, extra);
  const tx = rs => rs.map(r => r.map(c => typeof c === 'string' ? tr(c) : c));
  return _exportRows(base, tx(rows), tr(sheetName || ''), (extra || []).map(([n, rs]) => [tr(n), tx(rs)]));
};
