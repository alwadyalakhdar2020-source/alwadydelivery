'use strict';
/* ============ Employee portal: which screens, home blocks and services an employee sees and uses ============
   settings.main.portal      = { nav: {key: bool}, home: {key: bool}, feat: {key: bool}, types: {typeId: bool} }  (missing key = enabled)
   settings.main.portalEmp   = { <empId>: { mode: 'custom', nav, home, feat, types } }                          (per-employee profile)
   Applies to employees without administrative roles. Holders of assigned roles keep what their permissions give them. */
const PORTAL_NAV = [
  ['new', 'plus', 'طلب جديد', 'New request', 'تقديم الطلبات والخدمات', 'Submit requests and services'],
  ['mine', 'list', 'طلباتي', 'My requests', 'متابعة الطلبات وحالتها', 'Track requests and status'],
  ['tasks', 'check', 'المهام', 'Tasks', 'المهام المسندة للموظف', 'Tasks assigned to the employee'],
  ['profile', 'key', 'ملفي الوظيفي', 'My profile', 'عرض ملفه وبياناته', 'View own file and data'],
  ['attendance', 'clock', 'الحضور والإجازات', 'Attendance & leave', 'سجل حضوره وأرصدته', 'Own attendance and balances'],
  ['calendar', 'calendar', 'تقويم الفريق', 'Team calendar', 'إجازات زملائه', 'Colleagues\' leave'],
  ['directory', 'users', 'دليل الموظفين', 'Employee directory', 'بيانات التواصل مع الزملاء', 'Colleague contact details'],
  ['orgchart', 'chart', 'الهيكل التنظيمي', 'Org chart', 'شجرة الإدارات والمديرين', 'Departments and managers tree'],
  ['forms', 'file', 'مركز النماذج والسياسات', 'Forms & policies', 'النماذج والتعاميم والإقرارات', 'Forms, circulars, acknowledgements'],
  ['talent', 'grad', 'التوظيف والتدريب والأداء', 'Training & performance', 'دوراته وتقييماته', 'Own courses and reviews'],
  ['notifications', 'bell', 'الإشعارات', 'Notifications', 'صفحة الإشعارات', 'Notifications page']
];
const PORTAL_HOME = [
  ['balances', 'رصيد الإجازات', 'Leave balances'], ['requests', 'ملخص طلباتي', 'My requests summary'], ['tasks', 'مهام بانتظاري والإقرارات', 'Pending tasks & acknowledgements'],
  ['notes', 'آخر الإشعارات', 'Latest notifications'], ['circulars', 'التعاميم الأحدث', 'Latest circulars'], ['services', 'الخدمات الأكثر استخدامًا', 'Most used services']
];
const PORTAL_FEAT = [
  ['search', 'البحث العام أعلى الصفحة', 'Global search bar', 'البحث عن الموظفين والطلبات والنماذج', 'Search employees, requests and forms']
];
const PORTAL_DEFAULT_OFF = {}; // {group: {key: false}} for options that start disabled
const adminRolesOf = e => (e?.roles || []).filter(r => r !== 'employee');
const portalApplies = (e = ME()) => !!e && ((S.weakAuth && e.id === S.meId) || !adminRolesOf(e).length);
function portalSrc(e) { const o = SET().portalEmp?.[e?.id]; return o?.mode === 'custom' ? o : (SET().portal || {}); }
function portalVal(src, g, k) { const v = src?.[g]?.[k]; return v === undefined ? PORTAL_DEFAULT_OFF[g]?.[k] !== false : v !== false; }
function portalOk(g, k, e = ME()) { if (!portalApplies(e)) return true; return portalVal(portalSrc(e), g, k); }
const typeAllowed = t => !t || portalOk('types', t.id);
function portalNavOk(v) {
  if (v === 'inbox') return true;
  const key = v === 'employee' ? 'profile' : v;
  return !PORTAL_NAV.some(x => x[0] === key) || portalOk('nav', key);
}
/* guard the screens themselves, not only the menu */
const portalBlocked = () => pageHead(LX('غير متاح', 'Not available'), '') + empty(LX('هذه الشاشة غير مفعلة لك. يفعّلها مدير النظام من الإعدادات ← بوابة الموظف.', 'This screen is not enabled for you. The system administrator can enable it in Settings → Employee portal.'));
for (const [k] of PORTAL_NAV) {
  const v = k === 'profile' ? 'employee' : k; const orig = VIEWS[v]; if (!orig) continue;
  VIEWS[v] = (...a) => (k === 'profile' ? (S.params.id === S.meId && !portalOk('nav', 'profile')) : !portalOk('nav', k)) ? portalBlocked() : orig(...a);
}

/* ---------- Settings → employee portal ---------- */
function portalLoad(scope) {
  const st = SET(); const src = scope === 'all' ? (st.portal || {}) : (st.portalEmp?.[scope]?.mode === 'custom' ? st.portalEmp[scope] : (st.portal || {}));
  const cfg = { nav: {}, home: {}, feat: {}, types: {} };
  PORTAL_NAV.forEach(([k]) => cfg.nav[k] = portalVal(src, 'nav', k)); PORTAL_HOME.forEach(([k]) => cfg.home[k] = portalVal(src, 'home', k));
  PORTAL_FEAT.forEach(([k]) => cfg.feat[k] = portalVal(src, 'feat', k)); D.requestTypes.list.forEach(t => cfg.types[t.id] = portalVal(src, 'types', t.id));
  return { scope, custom: scope !== 'all' && st.portalEmp?.[scope]?.mode === 'custom', cfg, dirty: false };
}
const ptToggle = (g, k, on, title, sub, icon) => `<label class="pt"><input type="checkbox" data-pt="${g}" data-k="${esc(k)}" ${on ? 'checked' : ''}>${icon ? ic(icon) : ''}<span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`;
function portalPreview(cfg) {
  const on = k => cfg.nav[k] !== false;
  return `<div class="pt-phone" aria-label="${LX('معاينة القائمة', 'Menu preview')}"><div>${ic('home')}<span>${LX('الرئيسية', 'Home')}</span></div>${PORTAL_NAV.map(([k, i, ar, en]) => `<div class="${on(k) ? '' : 'off'}">${ic(i)}<span>${LX(ar, en)}</span></div>`).join('')}</div>
  <div class="small muted" style="margin-top:8px">${LX(`${PORTAL_NAV.filter(x => on(x[0])).length + 1} شاشة ظاهرة · ${Object.values(cfg.types).filter(Boolean).length} خدمة مفعلة من ${D.requestTypes.list.filter(t => t.active !== false).length}`, `${PORTAL_NAV.filter(x => on(x[0])).length + 1} screens · ${Object.values(cfg.types).filter(Boolean).length} services enabled`)}</div>
  <div class="small muted" style="margin-top:4px">${LX('«صندوق الاعتمادات» يظهر دائمًا لمن عليه اعتمادات.', 'The approvals inbox always shows for anyone with approvals.')}</div>`;
}
function portalHtml() {
  if (!S.pd || (S.pd.scope !== 'all' && !emp(S.pd.scope))) S.pd = portalLoad('all');
  const P = S.pd, cfg = P.cfg; const isAll = P.scope === 'all'; const e = isAll ? null : emp(P.scope);
  const exempt = activeEmpList().filter(x => adminRolesOf(x).length).length; const customs = Object.entries(SET().portalEmp || {}).filter(([id, o]) => o?.mode === 'custom' && emp(id));
  const types = D.requestTypes.list.filter(t => t.active !== false).sort(by('order'));
  const cats = Object.keys(CATS).filter(c => types.some(t => t.category === c)); const other = types.filter(t => !CATS[t.category]);
  const editable = isAll || P.custom;
  const grp = (title, sub, g, body, allKeys) => `<section class="card" style="margin-bottom:14px"><div class="pt-sec"><div><h2 style="margin:0">${esc(title)}</h2>${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}</div>${allKeys ? `<div class="row" style="gap:4px"><button type="button" class="btn sm ghost" data-act="pt-all" data-g="${g}" data-on="1" ${editable ? '' : 'disabled'}>${LX('تفعيل الكل', 'All on')}</button><button type="button" class="btn sm ghost" data-act="pt-all" data-g="${g}" data-on="0" ${editable ? '' : 'disabled'}>${LX('إيقاف الكل', 'All off')}</button></div>` : ''}</div>${body}</section>`;
  const body = `<fieldset id="pt-form" ${editable ? '' : 'disabled'} style="border:0;padding:0;margin:0;min-width:0">
    ${grp(LX('الشاشات في القائمة', 'Screens in the menu'), LX('ما يظهر للموظف في القائمة الجانبية ويستطيع فتحه', 'What appears in the side menu and can be opened'), 'nav', `<div class="pt-grid">${PORTAL_NAV.map(([k, i, ar, en, d1, d2]) => ptToggle('nav', k, cfg.nav[k], LX(ar, en), LX(d1, d2), i)).join('')}</div>`, true)}
    ${grp(LX('الخدمات والطلبات التي يقدّمها', 'Services and requests they can submit'), LX('الخدمة الموقوفة لا تظهر في «طلب جديد» ولا يمكن تقديمها', 'A disabled service is hidden and cannot be submitted'), 'types', types.length ? [...cats.map(c => [CATS[c], types.filter(t => t.category === c)]), ...(other.length ? [[LX('أخرى', 'Other'), other]] : [])].map(([cn, ts]) => `<div class="small" style="font-weight:700;margin:10px 0 6px">${esc(cn)}</div><div class="pt-grid">${ts.map(t => ptToggle('types', t.id, cfg.types[t.id], t.name, t.roles?.length ? LX('مقيد بأدوار في إعداد النموذج', 'Restricted to roles in the form setup') : '', t.icon || 'file')).join('')}</div>`).join('') : empty(LX('لا توجد أنواع طلبات مفعلة', 'No active request types')), true)}
    ${grp(LX('عناصر الصفحة الرئيسية', 'Home page blocks'), '', 'home', `<div class="pt-grid">${PORTAL_HOME.map(([k, ar, en]) => ptToggle('home', k, cfg.home[k], LX(ar, en))).join('')}</div>`, true)}
    ${grp(LX('خيارات إضافية', 'More options'), '', 'feat', `<div class="pt-grid">${PORTAL_FEAT.map(([k, ar, en, d1, d2]) => ptToggle('feat', k, cfg.feat[k], LX(ar, en), LX(d1, d2))).join('')}</div>`)}
  </fieldset>`;
  const empOpts = activeEmpList().sort(by('empNo')).map(x => `<option value="${x.id}" ${x.id === P.scope ? 'selected' : ''}>${esc(x.nameAr)} — ${esc(x.empNo)}${SET().portalEmp?.[x.id]?.mode === 'custom' ? ' ★' : ''}</option>`).join('');
  return `<div class="note" style="margin-bottom:12px">${LX(`حدد ما يظهر للموظف وما يستطيع العمل عليه. يُطبّق على الموظفين الذين ليس لهم أدوار إدارية، وعلى كل من يدخل باسم المستخدم وكلمة المرور فقط. أصحاب الأدوار (${exempt} موظف) يرون ما تمنحه صلاحياتهم. الإخفاء يشمل الشاشة نفسها وليس القائمة فقط.`, `Choose what employees see and can use. Applies to employees without administrative roles and to password-only sign-ins. Role holders (${exempt}) see what their permissions give.`)}</div>
  <section class="card" style="margin-bottom:14px"><div class="row" style="align-items:flex-end">
    <div class="fld" style="flex:1;min-width:240px"><label for="pt-scope">${LX('تطبيق الإعداد على', 'Apply to')}</label><select id="pt-scope" data-act-change="pt-scope"><option value="all" ${isAll ? 'selected' : ''}>${LX('كل الموظفين (الإعداد العام)', 'All employees (general)')}</option><optgroup label="${LX('موظف محدد', 'One employee')}">${empOpts}</optgroup></select></div>
    ${!isAll ? `<div class="checks" role="radiogroup" style="padding-bottom:8px"><label><input type="radio" name="pt-mode" value="inherit" data-act-change="pt-mode" ${P.custom ? '' : 'checked'}> ${LX('يتبع الإعداد العام', 'Follows the general setting')}</label><label><input type="radio" name="pt-mode" value="custom" data-act-change="pt-mode" ${P.custom ? 'checked' : ''}> ${LX('إعداد خاص به', 'Own setting')}</label></div>` : ''}
  </div>${e && adminRolesOf(e).length ? `<div class="note warn small" style="margin-top:10px">${LX(`لدى «${esc(e.nameAr)}» أدوار إدارية (${adminRolesOf(e).map(r => esc(ROLES[r] || r)).join('، ')})، فلا يؤثر عليه هذا الإعداد إلا إذا دخل بكلمة المرور فقط.`, `${esc(e.nameAr)} holds administrative roles, so this applies only to password-only sign-ins.`)}</div>` : ''}${!isAll && !P.custom ? `<div class="small muted" style="margin-top:8px">${LX('يعرض الإعداد العام. اختر «إعداد خاص به» لتعديله لهذا الموظف فقط.', 'Showing the general setting. Choose "Own setting" to change it for this employee only.')}</div>` : ''}</section>
  <div class="pt-layout"><div>${body}<div class="row" style="position:sticky;bottom:0;background:var(--bg);padding:10px 0;border-top:1px solid var(--line)"><button class="btn pri" data-act="pt-save" ${P.dirty ? '' : 'disabled'}>${LX('حفظ الخيارات', 'Save options')}</button>${P.dirty ? `<button class="btn" data-act="pt-reset">${LX('تراجع عن التغييرات', 'Discard changes')}</button><span class="small" style="color:var(--warn)">${LX('توجد تغييرات غير محفوظة', 'Unsaved changes')}</span>` : ''}</div></div>
  <aside class="pt-prev"><section class="card"><h2>${LX('معاينة ما يراه الموظف', 'What the employee sees')}</h2><div id="pt-prev">${portalPreview(cfg)}</div></section>
  ${customs.length ? `<section class="card" style="margin-top:14px"><h2>${LX('موظفون بإعداد خاص', 'Employees with their own setting')} <small>${customs.length}</small></h2><div class="list">${customs.map(([id]) => `<div><div class="grow"><b class="small">${esc(empName(id))}</b><div class="small muted num">${esc(emp(id).empNo)}</div></div><button class="btn sm ghost" data-act="pt-pick" data-id="${id}">${LX('فتح', 'Open')}</button></div>`).join('')}</div></section>` : ''}</aside></div>`;
}
document.addEventListener('change', e => { const t = e.target; if (!t.dataset?.pt || !S.pd) return; S.pd.cfg[t.dataset.pt][t.dataset.k] = t.checked; S.pd.dirty = true; const p = $('#pt-prev'); if (p) p.innerHTML = portalPreview(S.pd.cfg); const b = $('[data-act="pt-save"]'); if (b && b.disabled) { b.disabled = false; b.insertAdjacentHTML('afterend', `<span class="small" style="color:var(--warn)">${LX('توجد تغييرات غير محفوظة', 'Unsaved changes')}</span>`); } });
const ptLeave = fn => S.pd?.dirty ? confirmBox(LX('توجد تغييرات غير محفوظة. تجاهلها؟', 'Discard unsaved changes?'), fn, LX('تجاهل', 'Discard')) : fn();
ACT['pt-scope'] = el => { const v = el.value; ptLeave(() => { S.pd = portalLoad(v); renderView(); }); if (S.pd?.dirty) el.value = S.pd.scope; };
ACT['pt-pick'] = el => ptLeave(() => { S.pd = portalLoad(el.dataset.id); renderView(); window.scrollTo(0, 0); });
ACT['pt-mode'] = el => { if (!S.pd || S.pd.scope === 'all') return; const custom = el.value === 'custom'; if (custom === S.pd.custom) return; S.pd.custom = custom; if (!custom) { const keep = S.pd.scope; S.pd = portalLoad('all'); S.pd.scope = keep; S.pd.custom = false; } S.pd.dirty = true; renderView(); };
ACT['pt-all'] = el => { if (!S.pd) return; const g = el.dataset.g, on = el.dataset.on === '1'; for (const k of Object.keys(S.pd.cfg[g])) S.pd.cfg[g][k] = on; S.pd.dirty = true; renderView(); };
ACT['pt-reset'] = () => { if (!S.pd) return; S.pd = portalLoad(S.pd.scope); renderView(); };
ACT['pt-save'] = async el => {
  const P = S.pd; if (!P) return; if (!S.adminLvl) return toast(LEVEL_MSG, true);
  const cfg = JSON.parse(JSON.stringify(P.cfg)); el.disabled = true;
  try {
    if (P.scope === 'all') { await patch('settings', 'main', { portal: cfg }); await audit('تعديل خيارات بوابة الموظف (عام)', 'settings', 'portal', `${Object.values(cfg.nav).filter(Boolean).length} شاشة، ${Object.values(cfg.types).filter(Boolean).length} خدمة`); }
    else {
      const all = { ...(SET().portalEmp || {}) }; if (P.custom) all[P.scope] = { mode: 'custom', ...cfg, at: nowISO(), byId: S.meId }; else delete all[P.scope];
      await patch('settings', 'main', { portalEmp: all }); await audit(P.custom ? 'إعداد خاص لبوابة موظف' : 'إلغاء الإعداد الخاص لبوابة موظف', 'employee', P.scope, empName(P.scope));
    }
    S.pd = portalLoad(P.scope); toast(LX('حُفظت الخيارات', 'Options saved')); renderView();
  } finally { if (document.body.contains(el)) el.disabled = false; }
};
