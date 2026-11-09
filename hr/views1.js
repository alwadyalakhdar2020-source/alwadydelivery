'use strict';
/* ============ shell ============ */
function navItems() {
  const inboxCount = D.requests.list.filter(r => canAct(r)).length;
  const unread = D.notifications.list.filter(n => n.to === S.meId && !n.read).length;
  const it = [
    ['', 'home', 'home', 'الرئيسية', true],
    ['', 'new', 'plus', 'طلب جديد', true],
    ['', 'mine', 'list', 'طلباتي', true],
    ['', 'inbox', 'inbox', 'صندوق الاعتمادات', true, inboxCount],
    ['', 'tasks', 'check', 'المهام', true, D.tasks.list.filter(t => myTask(t)).length],
    ['الموارد البشرية', 'employees', 'users', 'الموظفون', can('emp.view.all') || can('team.view')],
    ['الموارد البشرية', 'directory', 'users', 'دليل الموظفين', true],
    ['الموارد البشرية', 'orgchart', 'chart', 'الهيكل التنظيمي', true],
    ['الموارد البشرية', 'attendance', 'clock', 'الحضور والإجازات', true],
    ['الموارد البشرية', 'calendar', 'calendar', 'تقويم الفريق', true],
    ['الموارد البشرية', 'docs', 'shield', 'مركز الوثائق', can('emp.view.sensitive')],
    ['الموارد البشرية', 'talent', 'grad', 'التوظيف والتدريب والأداء', true],
    ['الخدمات', 'adminaffairs', 'building', 'الشؤون الإدارية', can('admin.services') || can('assets.manage') || hasRole('personnel') || hasRole('hrManager') || hasRole('payroll')],
    ['الخدمات', 'forms', 'file', 'مركز النماذج والسياسات', true],
    ['المشتريات والإمداد', 'customs', 'box', 'التخليص الجمركي', can('customs.view')],
    ['المالية', 'payroll', 'money', 'الرواتب والمزايا', can('pay.view') || can('pay.manage')],
    ['المتابعة', 'reports', 'chart', 'التقارير والمؤشرات', can('reports.exec') || can('reports.hr') || can('team.view') || can('admin.services')],
    ['المتابعة', 'notifications', 'bell', 'الإشعارات', true, unread],
    ...screens().filter(canViewScreen).map(s => [s.group || 'سجلات مخصصة', 'cs', s.icon || 'list', s.name, true, 0, s.id]),
    ['النظام', 'imports', 'up', 'الاستيراد من Excel', canAnyImport()],
    ['النظام', 'settings', 'cog', 'الإعدادات', can('settings.manage') || can('settings.workflow') || can('audit.view') || can('backup')]
  ].filter(x => x[4] && portalNavOk(x[1]));
  let g = null, h = '';
  const order = []; it.forEach(x => { if (!order.includes(x[0])) order.push(x[0]); }); const sys = order.filter(x => x === 'النظام'); const sorted = [...order.filter(x => x !== 'النظام'), ...sys].flatMap(gp => it.filter(x => x[0] === gp));
  for (const [grp, v, i, l, , n, id] of sorted) {
    if (grp !== g) { g = grp; if (grp) h += `<div class="grp">${esc(grp)}</div>`; }
    const cur = id ? (S.view === 'cs' && S.params.id === id) : (S.view === v || (v === 'employees' && S.view === 'employee') || (v === 'settings' && S.view === 'designer'));
    h += `<button data-act="go" data-v="${v}" ${id ? `data-id="${id}"` : ''} ${cur ? 'aria-current="page"' : ''}>${ic(i)}<span>${esc(l)}</span>${n ? `<span class="cnt">${n}</span>` : ''}</button>`;
  }
  return h;
}
function renderShell() {
  const e = ME(); const unread = D.notifications.list.filter(n => n.to === S.meId && !n.read).length + computedAlerts().length;
  $('#root').innerHTML = `
  <div class="app">
    <div class="drawer-bg" id="drawer-bg" data-act="drawer"></div>
    <aside class="side" id="side" aria-label="القائمة الرئيسية">
      <div class="brand">${brandMark()}<div><b>${esc(SET().company || 'منصة الموارد البشرية')}</b><span>الموارد البشرية والشؤون الإدارية</span></div></div>
      <nav class="nav" id="nav">${navItems()}</nav>
      <div class="side-foot">${IS_STAGING ? 'بيئة الاختبار — بيانات مصطنعة' : 'بيئة التشغيل'}<br>الإصدار 1.1</div>
    </aside>
    <div class="main">
      ${IS_STAGING ? `<div class="demo-band stg">بيئة الاختبار المنفصلة: بيانات مصطنعة وقاعدة بيانات مستقلة. أي تعديل هنا لا يؤثر على المنصة الفعلية.</div>` : SET().demoMode !== false ? `<div class="demo-band">بيئة عرض وتجربة: البيانات الحالية تجريبية ولا تمثل موظفين حقيقيين. لا تُدخل بيانات موظفين حقيقية قبل اعتماد بيئة الإنتاج.</div>` : ''}
      <header class="top">
        <button class="icon-btn menu-btn" data-act="drawer" aria-label="القائمة">${ic('menu')}</button>
        ${portalOk('feat', 'search') ? `<form class="gsearch" data-form="gsearch" role="search">${ic('search')}<input id="gq" name="q" placeholder="ابحث عن موظف أو طلب أو نموذج أو شحنة…" value="${esc(S.params.gq || '')}" aria-label="بحث عام"></form>` : ''}
        <span class="sp"></span>${langBtn()}
        <button class="icon-btn bell" data-act="go" data-v="notifications" aria-label="الإشعارات">${ic('bell')}${unread ? `<span class="dot">${unread > 99 ? '99+' : unread}</span>` : ''}</button>
        <button class="uchip" data-act="${IS_STAGING ? 'switch-user' : 'my-profile'}" title="${IS_STAGING ? 'تبديل المستخدم' : 'ملفي الوظيفي'}">${avatar(e)}<span class="nm"><b>${esc(e?.nameAr)}</b><small>${esc([...rolesOf(e)].filter(r => r !== 'employee').map(r => ROLES[r]).slice(0, 2).join('، ') || ROLES.employee)}</small></span></button>
      </header>
      <main id="view"></main>
    </div>
  </div>`;
}
function renderView() {
  const V = VIEWS[S.view] || VIEWS.home;
  const el = $('#view'); if (!el) return;
  const act = document.activeElement; const fid = act && act.id && el.contains(act) ? act.id : null; const sel = fid && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null;
  el.innerHTML = V();
  if (fid) { const n = document.getElementById(fid); if (n) { n.focus(); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { } } }
  const nav = $('#nav'); if (nav) nav.innerHTML = navItems();
}
function go(v, params = {}) { S.view = v; S.params = params; closeDrawer(); renderAll(true); window.scrollTo(0, 0); try { history.replaceState(null, '', '#v-' + v); } catch (e) { } }
function closeDrawer() { $('#side')?.classList.remove('open'); $('#drawer-bg')?.classList.remove('open'); }

/* ============ HOME (ESS) ============ */
function myRequests() { return D.requests.list.filter(r => r.empId === S.meId || r.createdById === S.meId).sort(by('createdAt', -1)); }
function visibleForms() {
  const rs = rolesOf(ME());
  return D.forms.list.filter(f => f.status === 'published' && (!f.roles?.length || f.roles.some(r => rs.has(r))) && (!f.restricted || can('forms.view.restricted')));
}
function pendingAcks() { return visibleForms().filter(f => f.requiresAck && !D.acks.map[f.id + '_' + S.meId + '_' + f.version]); }
VIEWS.home = () => {
  const e = ME(); const mine = myRequests();
  const open = mine.filter(r => r.status === 'pending').length, done = mine.filter(r => r.status === 'approved').length, rej = mine.filter(r => r.status === 'rejected').length, ret = mine.filter(r => r.status === 'returned');
  const inbox = D.requests.list.filter(r => canAct(r));
  const acks = pendingAcks();
  const notes = D.notifications.list.filter(n => n.to === S.meId).slice(0, 6);
  const lts = D.leaveTypes.list.filter(l => l.tracked !== false && l.showBalance !== false).sort(by('order'));
  const feat = D.requestTypes.list.filter(t => t.active !== false && t.featured && (!t.roles?.length || t.roles.some(r => hasRole(r))) && typeAllowed(t)).sort(by('order')).slice(0, 6);
  const circ = visibleForms().filter(f => f.category === 'circular').sort(by('effectiveDate', -1)).slice(0, 4);
  const H = k => portalOk('home', k);
  return `
  ${pageHead('مرحبًا، ' + (e.nameAr || '').split(' ')[0], 'هنا ملخص طلباتك ومهامك اليوم')}
  <div class="grid g2">
    <section class="card">
      <div class="hello">${avatar(e, true)}<div style="min-width:0"><h2 style="margin:0;font-size:18px">${esc(e.nameAr)}</h2><div class="muted small">${esc(e.title || 'المسمى غير محدد')} · ${esc(unitName(e.deptId))}</div><div class="small">الرقم الوظيفي <b class="num">${esc(e.empNo || '—')}</b> · المدير المباشر: ${esc(e.managerId ? empName(e.managerId) : '—')} · ${esc(unitName(e.locationId))}</div></div></div>
      ${H('balances') ? `<div style="margin-top:14px"><div class="muted small" style="margin-bottom:6px">رصيد الإجازات المتاح (${new Date().getFullYear()})</div>
      <div class="chips">${lts.map(l => { const b = balanceOf(e.id, l.id); return `<div class="chip"><b>${fmtN(b.available)}</b><span>${esc(l.name)}${b.pending ? ` · ${b.pending} معلّق` : ''}</span></div>`; }).join('') || '<span class="muted small">لم تُعرّف أنواع إجازات بعد</span>'}</div></div>` : ''}
      <div class="row" style="margin-top:14px">${portalNavOk('profile') ? `<button class="btn sm" data-act="go" data-v="employee" data-id="${e.id}">ملفي الوظيفي</button>` : ''}${portalNavOk('attendance') ? `<button class="btn sm" data-act="go" data-v="attendance">حضوري</button>` : ''}</div>
    </section>
    ${H('requests') ? `<section class="card">
      <h2>طلباتي <small><a href="#" data-act="go" data-v="mine">عرض الكل</a></small></h2>
      <div class="grid g4">${kpi('مفتوحة', fmtN(open))}${kpi('مكتملة', fmtN(done))}${kpi('مرفوضة', fmtN(rej))}${kpi('تحتاج استكمال', fmtN(ret.length), '', ret.length)}</div>
      ${ret.length ? `<div class="list" style="margin-top:10px">${ret.map(r => `<div><div class="grow"><b>${esc(r.typeName)}</b> <span class="muted small num">${esc(r.ref)}</span><div class="small muted">${esc(r.history.at(-1)?.comment || '')}</div></div><button class="btn sm pri" data-act="open-req" data-id="${r.id}">استكمال</button></div>`).join('')}</div>` : ''}
    </section>` : ''}
  </div>
  <div class="grid g3" style="margin-top:16px">
    ${H('tasks') || inbox.length ? `<section class="card"><h2>مهام بانتظارك</h2><div class="list">
      ${inbox.length ? `<div><div class="grow"><b>${inbox.length} طلب بانتظار اعتمادك</b><div class="small muted">${inbox.filter(isOverdue).length} منها متجاوزة للمدة</div></div><button class="btn sm pri" data-act="go" data-v="inbox">فتح</button></div>` : ''}
      ${acks.map(f => `<div><div class="grow"><b>إقرار بالاطلاع</b><div class="small muted">${esc(f.title)} — إصدار ${esc(f.version)}</div></div><button class="btn sm" data-act="open-form" data-id="${f.id}">اطلاع</button></div>`).join('')}
      ${!inbox.length && !acks.length ? empty('لا توجد مهام مطلوبة منك الآن') : ''}
    </div></section>` : ''}
    ${H('notes') ? `<section class="card"><h2>الإشعارات <small><a href="#" data-act="go" data-v="notifications">الكل</a></small></h2><div class="list">
      ${notes.map(n => `<div><div class="grow"><b class="small">${esc(n.title)}</b>${n.read ? '' : ' <span class="badge b-info">جديد</span>'}<div class="small muted">${esc(n.body)}</div><div class="small muted num">${fmtDT(n.at)}</div></div>${n.link ? `<button class="btn sm ghost" data-act="open-note" data-id="${n.id}">فتح</button>` : ''}</div>`).join('') || empty('لا توجد إشعارات')}
    </div></section>` : ''}
    ${H('circulars') ? `<section class="card"><h2>التعاميم الأحدث</h2><div class="list">
      ${circ.map(f => `<div><div class="grow"><b class="small">${esc(f.title)}</b><div class="small muted">${esc(f.code)} · ساري من ${fmtD(f.effectiveDate)}</div></div><button class="btn sm ghost" data-act="open-form" data-id="${f.id}">عرض</button></div>`).join('') || empty('لا توجد تعاميم منشورة')}
    </div></section>` : ''}
  </div>
  ${H('services') ? `<section style="margin-top:20px"><h2 style="font-size:17px;margin-bottom:10px">الخدمات الأكثر استخدامًا</h2>
    <div class="grid g3">${feat.map(svcCard).join('') || empty('لم تُحدد خدمات مميزة بعد')}</div>
    ${portalNavOk('new') ? `<div style="margin-top:10px"><button class="btn" data-act="go" data-v="new">كل الخدمات</button></div>` : ''}
  </section>` : ''}`;
};
const CATS = { hr: 'شؤون الموظفين', attendance: 'الحضور والإجازات', admin: 'الشؤون الإدارية والخدمات', finance: 'المالية والمزايا', talent: 'التدريب والتطوير', general: 'شكاوى ومقترحات واستفسارات', exit: 'إنهاء الخدمة' };
const svcCard = t => `<button class="svc" data-act="new-req" data-id="${t.id}"><span class="sic">${ic(t.icon || 'file')}</span><span><b>${esc(t.name)}</b><span>${esc(t.description || CATS[t.category] || '')}</span></span></button>`;

/* ============ NEW REQUEST ============ */
VIEWS.new = () => {
  const ts = D.requestTypes.list.filter(t => t.active !== false && (!t.roles?.length || t.roles.some(r => hasRole(r))) && typeAllowed(t)).sort(by('order'));
  const groups = Object.keys(CATS).filter(c => ts.some(t => t.category === c));
  return pageHead('طلب جديد', 'اختر الخدمة المطلوبة. كل طلب يأخذ رقمًا مرجعيًا ويمر بمسار الاعتماد المحدد له.') +
    (groups.map(c => `<section style="margin-bottom:20px"><h2 style="font-size:16px;margin-bottom:10px">${esc(CATS[c])}</h2><div class="grid g3">${ts.filter(t => t.category === c).map(svcCard).join('')}</div></section>`).join('') || empty('لا توجد أنواع طلبات مفعلة. يضيفها مدير النظام من الإعدادات ← أنواع الطلبات.'));
};
const PAY_ELEMENTS = { basic: 'الراتب الأساسي', housing: 'بدل السكن', transport: 'بدل النقل', other: 'بدلات أخرى' };
const PERSONAL_FIELDS = { phone: 'رقم الجوال', email: 'البريد الإلكتروني', address: 'العنوان', emergencyName: 'اسم جهة الطوارئ', emergencyPhone: 'هاتف الطوارئ', maritalStatus: 'الحالة الاجتماعية', iban: 'رقم الآيبان' };
function reqFieldHtml(f, v, p = 'd_') {
  const n = p + f.key; const o = { required: f.required, value: v ?? f.default ?? (f.type === 'checks' ? [] : ''), full: ['textarea', 'checks', 'radio', 'checkbox'].includes(f.type) || f.width === 'full' || f.full, hint: f.type === 'checkbox' ? '' : (f.hint ? esc(f.hint) : '') };
  const wrap = h => f.width === 'half' ? h.replace('class="fld', 'class="fld half') : h;
  switch (f.type) {
    case 'section': return `<div class="full fsec">${esc(f.label)}</div>`;
    case 'textarea': return wrap(fld(n, f.label, { ...o, type: 'textarea' }));
    case 'number': return wrap(fld(n, f.label, { ...o, type: 'number', min: f.min, max: f.max, step: 'any' }));
    case 'date': case 'time': case 'month': case 'email': case 'tel': return wrap(fld(n, f.label, { ...o, type: f.type }));
    case 'select': return wrap(fld(n, f.label, { ...o, type: 'select', options: optList(f) }));
    case 'radio': return wrap(fld(n, f.label, { ...o, type: 'radio', options: optList(f) }));
    case 'checks': return wrap(fld(n, f.label, { ...o, type: 'checks', options: optList(f) }));
    case 'checkbox': return wrap(fld(n, f.label, { ...o, type: 'checkbox', cbLabel: f.hint || 'أقر بصحة البيانات أعلاه' }));
    case 'leaveType': return wrap(fld(n, f.label, { ...o, type: 'select', options: D.leaveTypes.list.sort(by('order')).map(l => [l.id, l.name + (l.tracked !== false ? ` (المتاح ${balanceOf(S.meId, l.id).available})` : '')]) }));
    case 'course': return wrap(fld(n, f.label, { ...o, type: 'select', options: D.courses.list.filter(c => c.status !== 'closed').map(c => [c.id, c.title + ' — ' + fmtD(c.start)]) }));
    case 'employee': return wrap(fld(n, f.label, { ...o, type: 'select', options: D.employees.list.filter(e => e.status !== 'terminated').sort(by('nameAr')).map(e => [e.id, e.nameAr + ' — ' + (e.empNo || '')]) }));
    case 'payElement': return wrap(fld(n, f.label, { ...o, type: 'select', options: Object.entries(PAY_ELEMENTS) }));
    case 'personalField': return wrap(fld(n, f.label, { ...o, type: 'select', options: Object.entries(PERSONAL_FIELDS) }));
    case 'asset': return wrap(fld(n, f.label, { ...o, type: 'select', options: D.assets.list.filter(a => a.holderId === S.meId || a.status === 'available').map(a => [a.id, a.name + ' — ' + (a.code || '')]) }));
    case 'form': return wrap(fld(n, f.label, { ...o, type: 'select', options: visibleForms().map(x => [x.id, x.title]) }));
    default: return wrap(fld(n, f.label, { ...o, type: 'text' }));
  }
}
function openRequestForm(typeId, reqId) {
  const t = D.requestTypes.map[typeId]; if (!t) return toast('نوع الطلب غير موجود', true);
  if (!reqId && !typeAllowed(t)) return toast(LX('هذه الخدمة غير مفعلة لك. يفعّلها مدير النظام من الإعدادات ← بوابة الموظف.', 'This service is not enabled for you. The system administrator can enable it in Settings → Employee portal.'), true);
  const req = reqId ? D.requests.map[reqId] : null; const d = req?.data || {};
  const stagesTxt = (t.stages || []).map(s => s.name).join(' ← ') || 'بدون اعتماد';
  openModal(req ? `استكمال طلب ${req.ref}` : t.name, `
    ${t.instructions ? `<div class="note">${esc(t.instructions)}</div>` : ''}
    ${req ? `<div class="note warn"><b>المطلوب استكماله:</b> ${esc(req.history.filter(h => h.action === 'return').at(-1)?.comment || '')}</div>` : ''}
    <form class="form" id="reqform" data-form="request" data-type="${t.id}" ${req ? `data-req="${req.id}"` : ''}>
      ${(t.fields || []).map(f => reqFieldHtml(f, d[f.key])).join('')}
      ${t.category === 'admin' ? fld('priority', 'الأولوية', { type: 'select', options: Object.entries(PRIORITY), value: req?.priority || 'normal', blank: false }) : ''}
      ${fld('files', 'المرفقات' + (t.needsAttachment ? ' (إلزامي)' : ''), { type: 'file', multiple: true, full: true, hint: (d._files || []).length ? 'مرفقات سابقة: ' + d._files.map(x => esc(x.name)).join('، ') : 'PDF أو Word أو Excel أو صورة — حتى 20 ميجابايت للملف' })}
    </form>
    <div><div class="small muted" style="margin-bottom:6px">خط سير الموافقات لهذا الطلب</div>${flowTrack(typeSteps(t, req ? req.empId : S.meId), { compact: true })}</div>`,
    `<button class="btn pri" type="submit" form="reqform" id="reqsubmit">${req ? 'إعادة الإرسال' : 'إرسال الطلب'}</button><button class="btn" data-act="close-modal">إلغاء</button>`);
}
async function submitRequestForm(form) {
  const t = D.requestTypes.map[form.dataset.type]; const reqId = form.dataset.req; const btn = $('#reqsubmit');
  const raw = readForm(form); const data = {};
  for (const [k, v] of Object.entries(raw)) if (k.startsWith('d_')) data[k.slice(2)] = v;
  const prev = reqId ? (D.requests.map[reqId].data._files || []) : [];
  const nfiles = form.elements.files?.files?.length || 0;
  data._files = prev;
  if (t.needsAttachment && !prev.length && nfiles) data._files = [{ pending: true }];
  const errs = validateRequest(t, data, reqId ? D.requests.map[reqId].empId : S.meId, reqId);
  if (errs.length) return toast(errs.join(' — '), true);
  btn.disabled = true; btn.textContent = 'جارٍ الإرسال…';
  try {
    data._files = [...prev, ...(await uploadFiles(form.elements.files))];
    if (t.effect === 'leave') data.days = leaveDays(data.from, data.to);
    if (reqId) { await resubmitRequest(reqId, data); toast('أُعيد إرسال الطلب'); }
    else { const r = await createRequest(t, data, { priority: raw.priority }); toast('تم إرسال الطلب برقم ' + r.ref); }
    closeModal(); if (!reqId) go('mine');
  } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = reqId ? 'إعادة الإرسال' : 'إرسال الطلب'; }
}

/* ============ MY REQUESTS & INBOX ============ */
const stageCell = r => { const st = r.stages?.[r.current]; if (r.status !== 'pending' || !st) return '—'; return `${esc(st.name)}${isOverdue(r) ? ' <span class="badge b-bad">متأخر</span>' : ''}`; };
const reqCols = (withEmp) => [
  { k: 'ref', l: 'الرقم المرجعي', v: r => `<b class="num">${esc(r.ref)}</b>` },
  { k: 'typeName', l: 'نوع الطلب' },
  ...(withEmp ? [{ k: 'emp', l: 'الموظف', s: r => empName(r.empId), v: r => esc(empName(r.empId)) }] : []),
  { k: 'createdAt', l: 'تاريخ الإنشاء', v: r => `<span class="num">${fmtD(r.createdAt)}</span>` },
  { k: 'status', l: 'الحالة', s: r => STATUS[r.status]?.[0], v: r => badge(r.status) },
  { k: 'stage', l: 'خط سير الموافقات', s: r => r.stages?.[r.current]?.name || '', v: miniFlow },
  { k: 'due', l: 'الموعد المستهدف', s: r => r.stages?.[r.current]?.dueAt || '', v: r => r.status === 'pending' ? `<span class="num">${fmtDT(r.stages?.[r.current]?.dueAt)}</span>` : '—' }
];
VIEWS.mine = () => {
  const f = S.f.mine || 'all'; let rows = myRequests(); if (f !== 'all') rows = rows.filter(r => r.status === f);
  return pageHead('طلباتي', 'كل طلباتك وحالتها الحالية', `<button class="btn pri" data-act="go" data-v="new">${ic('plus')} طلب جديد</button>`) +
    dataTable('mine', reqCols(false), rows, { rowAct: 'open-req', tools: `<select data-f="mine" aria-label="تصفية حسب الحالة"><option value="all">كل الحالات</option>${['pending', 'returned', 'approved', 'rejected', 'cancelled'].map(s => `<option value="${s}" ${f === s ? 'selected' : ''}>${STATUS[s][0]}</option>`).join('')}</select>`, empty: 'لم تقدم أي طلب بعد' });
};
VIEWS.inbox = () => {
  const t = tabs('inbox', [['act', 'بانتظار إجرائي'], ['done', 'سبق أن اتخذت إجراء'], ...(can('team.view') ? [['team', 'طلبات فريقي']] : []), ...(can('req.view.all') ? [['all', 'كل الطلبات'], ['late', 'المتأخرة']] : [])]);
  let rows;
  if (t.cur === 'act') rows = D.requests.list.filter(r => canAct(r));
  else if (t.cur === 'done') rows = D.requests.list.filter(r => (r.history || []).some(h => h.byId === S.meId && ['approve', 'reject', 'return'].includes(h.action)));
  else if (t.cur === 'team') { const tm = teamIds(S.meId); rows = D.requests.list.filter(r => tm.has(r.empId) && canViewReq(r)); }
  else if (t.cur === 'late') rows = D.requests.list.filter(r => isOverdue(r) && canViewReq(r));
  else rows = D.requests.list.filter(canViewReq);
  rows = rows.sort(by('createdAt', -1));
  return pageHead('صندوق الاعتمادات', 'الطلبات التي تحتاج قرارك وفق الهيكل التنظيمي ومسارات الاعتماد') + t.html + dataTable('inbox-' + t.cur, reqCols(true), rows, { rowAct: 'open-req', empty: t.cur === 'act' ? 'لا توجد طلبات بانتظار إجرائك' : 'لا توجد طلبات' });
};

/* ============ REQUEST DETAIL ============ */
function dataRows(req) {
  const t = D.requestTypes.map[req.typeId]; const d = req.data || {};
  const rows = (t?.fields || Object.keys(d).filter(k => !k.startsWith('_')).map(k => ({ key: k, label: k }))).map(f => {
    if (f.type === 'section') return `<dt class="dsec">${esc(f.label)}</dt>`;
    let v = fieldDisplay(f, d[f.key]);
    if (f.type === 'number' && f.key === 'newValue' && !can('emp.view.salary') && req.empId !== S.meId) v = '••••';
    return `<dt>${esc(f.label)}</dt><dd>${esc(v || '—')}</dd>`;
  });
  if (req.effect === 'leave') rows.push(`<dt>عدد الأيام المحتسبة</dt><dd class="num">${fmtN(d.days)} (${SET().leaveCountMode === 'working' ? 'أيام عمل' : 'أيام تقويمية'})</dd>`);
  return rows.join('');
}
function openRequest(id) {
  const r = D.requests.map[id]; if (!r) return toast('الطلب غير موجود أو حُذف', true);
  if (!canViewReq(r)) { audit('محاولة وصول مرفوضة', 'request', id, r.ref); return toast('لا تملك صلاحية عرض هذا الطلب', true); }
  const mine = r.empId === S.meId || r.createdById === S.meId; const actable = canAct(r);
  const isAdminCat = r.category === 'admin' && can('admin.services');
  const stagesHtml = (r.stages || []).map((st, i) => {
    const cls = st.status === 'done' ? (st.decisions.some(d => d.action === 'reject') ? 'bad' : 'done') : (i === r.current && r.status === 'pending' ? 'active' : '');
    const who = st.assignees.map((a, j) => `${esc(specLabel(a))}${approvedIdx(st, j) ? ' ✓' : ''}`).join(st.mode === 'all' ? ' + ' : ' أو ');
    const cand = i === r.current && r.status === 'pending' ? `<div class="small">المسؤول الآن: ${esc(currentApprovers(r).map(empName).join('، ') || '—')}</div>` : '';
    return `<div class="tl ${cls}"><b>${esc(st.name)}</b> <span class="small muted">(${who}${st.mode === 'all' ? ' — متوازي، يلزم الجميع' : ''})</span>${cand}${st.dueAt && i === r.current && r.status === 'pending' ? `<div class="small ${isOverdue(r) ? '' : 'muted'}">المدة المستهدفة حتى ${fmtDT(st.dueAt)}${isOverdue(r) ? ' — <b style="color:var(--bad)">متجاوزة</b>' : ''}${st.escalated ? ' — صُعّدت' : ''}</div>` : ''}
      ${st.decisions.map(d => `<div class="small">${esc(empName(d.byId))}: ${esc({ approve: st.actionLabel || 'اعتماد', reject: 'رفض', return: 'إرجاع' }[d.action])} — <span class="num">${fmtDT(d.at)}</span>${d.comment ? ` — «${esc(d.comment)}»` : ''}</div>`).join('')}</div>`;
  }).join('');
  const files = (r.data?._files || []).filter(f => f.id);
  const hist = (r.history || []).map(h => `<tr><td class="num">${fmtDT(h.at)}</td><td>${esc(empName(h.byId))}</td><td>${esc(h.label || { submit: 'إنشاء', resubmit: 'إعادة إرسال', cancel: 'إلغاء', approve: 'اعتماد', reject: 'رفض', return: 'إرجاع', assign: 'تحديث متابعة' }[h.action] || h.action)}</td><td>${esc(h.stage || '')}</td><td>${esc(h.comment || '')}</td></tr>`).join('');
  const body = `
    <div class="row">${badge(r.status)} <b class="num">${esc(r.ref)}</b> <span class="muted small">أُنشئ ${fmtDT(r.createdAt)}</span>${r.category === 'admin' ? ` <span class="tag">الأولوية: ${esc(PRIORITY[r.priority] || r.priority)}</span>` : ''}${r.sensitive ? ' <span class="tag">سري</span>' : ''}</div>
    <section><div class="small muted" style="margin-bottom:6px">خط سير الموافقات</div>${flowTrack(requestSteps(r))}</section>
    <div class="grid g2">
      <div><h3 class="small muted" style="margin-bottom:6px">بيانات الطلب</h3><dl class="dl"><dt>مقدم الطلب</dt><dd>${esc(empName(r.empId))} — ${esc(emp(r.empId)?.empNo || '')}</dd><dt>الإدارة</dt><dd>${esc(unitName(emp(r.empId)?.deptId))}</dd>${dataRows(r)}
      ${r.category === 'admin' ? `<dt>المسؤول عن التنفيذ</dt><dd>${esc(r.assignedTo ? empName(r.assignedTo) : 'غير محدد')}</dd><dt>الموعد المستهدف</dt><dd class="num">${fmtD(r.targetDate)}</dd>` : ''}</dl>
      ${files.length ? `<h3 class="small muted" style="margin:12px 0 6px">المرفقات</h3><div class="list">${files.map(f => `<div>${fileLink(f)}</div>`).join('')}</div>` : ''}</div>
      <div><h3 class="small muted" style="margin-bottom:10px">تفاصيل القرارات</h3><div class="timeline">${stagesHtml || '<div class="muted small">بدون مراحل</div>'}</div></div>
    </div>
    ${r.output ? `<div><h3 class="small muted" style="margin-bottom:6px">${esc(r.output.title)}</h3><div class="pre">${esc(r.output.body)}</div><div class="row" style="margin-top:8px"><button class="btn sm" data-act="dl-letter" data-id="${r.id}">${ic('down')} تنزيل الخطاب</button></div></div>` : ''}
    ${r.effectError ? `<div class="note bad">تعذر تطبيق أثر الطلب تلقائيًا: ${esc(r.effectError)}</div>` : ''}
    ${isAdminCat && ['pending', 'approved'].includes(r.status) ? `<form class="form card" data-form="req-assign" data-id="${r.id}" style="padding:12px">${fld('assignedTo', 'المسؤول عن التنفيذ', { type: 'select', value: r.assignedTo, options: D.employees.list.filter(e => rolesOf(e).has('adminOfficer') || e.deptId === emp(S.meId)?.deptId).map(e => [e.id, e.nameAr]) })}${fld('targetDate', 'الموعد المستهدف', { type: 'date', value: r.targetDate })}${fld('priority', 'الأولوية', { type: 'select', options: Object.entries(PRIORITY), value: r.priority, blank: false })}<div class="fld" style="justify-content:flex-end"><button class="btn sm">حفظ المتابعة</button></div></form>` : ''}
    ${actable ? `<div class="fld"><label for="act-comment">ملاحظة القرار (إلزامية عند الرفض أو الإرجاع)</label><textarea id="act-comment"></textarea></div>` : ''}
    <details><summary class="small muted" style="cursor:pointer">سجل الإجراءات (${(r.history || []).length})</summary><div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>التاريخ والوقت</th><th>الفاعل</th><th>الإجراء</th><th>المرحلة</th><th>التعليق</th></tr></thead><tbody>${hist}</tbody></table></div></details>`;
  const st = r.stages?.[r.current];
  const foot = [
    actable ? `<button class="btn ok" data-act="req-do" data-a="approve" data-id="${r.id}">${ic('check')} ${esc(st?.actionLabel || 'اعتماد')}</button><button class="btn" data-act="req-do" data-a="return" data-id="${r.id}">إرجاع للاستكمال</button><button class="btn danger" data-act="req-do" data-a="reject" data-id="${r.id}">رفض</button>` : '',
    mine && r.status === 'returned' ? `<button class="btn pri" data-act="req-edit" data-id="${r.id}">استكمال وإعادة الإرسال</button>` : '',
    mine && ['pending', 'returned'].includes(r.status) ? `<button class="btn danger" data-act="req-cancel" data-id="${r.id}">إلغاء الطلب</button>` : '',
    `<button class="btn" data-act="form-sheet" data-id="${r.id}">${ic('file')} عرض النموذج المعبأ</button>`,
    `<button class="btn" data-act="close-modal">إغلاق</button>`
  ].join('');
  openModal(r.typeName, body, foot, true);
  S.openReq = id;
}

/* ============ EMPLOYEES ============ */
VIEWS.employees = () => {
  const all = can('emp.view.all'); const tm = teamIds(S.meId);
  let rows = D.employees.list.filter(e => (all && inScope(e.id)) || tm.has(e.id));
  const f = S.f.emp || {}; if (f.dept) rows = rows.filter(e => e.deptId === f.dept); if (f.loc) rows = rows.filter(e => e.locationId === f.loc); if (f.status) rows = rows.filter(e => e.status === f.status); else rows = rows.filter(e => e.status !== 'terminated');
  const units = t => D.orgunits.list.filter(u => u.type === t).sort(by('name'));
  const sel = (k, lab, opts) => `<select data-ff="emp" data-k="${k}" aria-label="${lab}"><option value="">${lab}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${f[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return pageHead(all ? 'الموظفون' : 'فريقي', all ? 'الملفات الإلكترونية لجميع الموظفين' : 'الموظفون الذين يتبعونك في الهيكل التنظيمي',
    `${can('export.data') ? `<button class="btn" data-act="export-emps">${ic('down')} تصدير</button>` : ''}${can('emp.edit') ? `<button class="btn" data-act="import" data-k="employees">${ic('up')} استيراد Excel</button><button class="btn pri" data-act="emp-edit">${ic('plus')} موظف جديد</button>` : ''}`) +
    dataTable('emps', [
      { k: 'empNo', l: 'الرقم الوظيفي', v: e => `<span class="num">${esc(e.empNo || '—')}</span>` },
      { k: 'nameAr', l: 'الاسم', v: e => `<div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(e)}<div><b>${esc(e.nameAr)}</b><div class="small muted">${esc(e.nameEn || '')}</div></div></div>` },
      { k: 'title', l: 'المسمى الوظيفي' },
      { k: 'dept', l: 'الإدارة', s: e => unitName(e.deptId), v: e => esc(unitName(e.deptId)) },
      { k: 'loc', l: 'الموقع', s: e => unitName(e.locationId), v: e => esc(unitName(e.locationId)) },
      { k: 'mgr', l: 'المدير المباشر', s: e => empName(e.managerId), v: e => esc(e.managerId ? empName(e.managerId) : '—') },
      { k: 'contractEnd', l: 'نهاية العقد', v: e => `<span class="num">${fmtD(e.contractEnd)}</span>${e.contractEnd && e.contractEnd < addDays(todayISO(), Number(SET().contractAlertDays || 60)) ? ' <span class="badge b-warn">قريب</span>' : ''}` },
      { k: 'status', l: 'الحالة', v: e => badge(e.status || 'active') },
      { k: 'comp', l: 'اكتمال الملف', s: e => completeness(e), v: e => `<span class="num">${completeness(e)}%</span>` }
    ], rows.sort(by('empNo')), {
      rowAct: 'open-emp', tools: sel('dept', 'كل الإدارات', units('dept').map(u => [u.id, u.name])) + sel('loc', 'كل المواقع', units('location').map(u => [u.id, u.name])) + sel('status', 'الحاليون', [['active', 'على رأس العمل'], ['probation', 'فترة تجربة'], ['terminating', 'إجراءات إنهاء'], ['terminated', 'منتهية خدمته']])
    });
};
const REQUIRED_FIELDS = ['nameAr', 'empNo', 'nationality', 'idNumber', 'idExpiry', 'phone', 'deptId', 'locationId', 'title', 'managerId', 'contractType', 'contractStart', 'hireDate', 'emergencyPhone'];
function completeness(e) { const n = REQUIRED_FIELDS.filter(k => e[k] != null && e[k] !== '').length; return Math.round(n / REQUIRED_FIELDS.length * 100); }
const FIELD_LABELS = { empNo: 'الرقم الوظيفي', nameAr: 'الاسم بالعربية', nameEn: 'الاسم بالإنجليزية', gender: 'الجنس', birthDate: 'تاريخ الميلاد', nationality: 'الجنسية', maritalStatus: 'الحالة الاجتماعية', phone: 'الجوال', email: 'البريد الإلكتروني', address: 'العنوان', emergencyName: 'جهة الطوارئ', emergencyPhone: 'هاتف الطوارئ', idType: 'نوع الهوية', idNumber: 'رقم الهوية/الإقامة', idExpiry: 'انتهاء الهوية/الإقامة', passportNo: 'رقم الجواز', passportExpiry: 'انتهاء الجواز', iban: 'الآيبان', deptId: 'الإدارة', sectionId: 'القسم', locationId: 'موقع العمل', costCenterId: 'مركز التكلفة', title: 'المسمى الوظيفي', grade: 'المستوى الوظيفي', managerId: 'المدير المباشر', shiftId: 'الوردية', status: 'الحالة', contractType: 'نوع العقد', contractStart: 'بداية العقد', contractEnd: 'نهاية العقد', hireDate: 'تاريخ التعيين', joinDate: 'تاريخ المباشرة', probationEnd: 'نهاية فترة التجربة', education: 'المؤهلات', experience: 'الخبرات السابقة', lastDay: 'آخر يوم عمل', custom: 'بيانات إضافية' };
const SENSITIVE_FIELDS = ['idNumber', 'idExpiry', 'passportNo', 'passportExpiry', 'iban', 'birthDate'];
function fv(e, k) {
  let v = e[k];
  if (SENSITIVE_FIELDS.includes(k) && e.id !== S.meId && !can('emp.view.sensitive')) return '<span class="muted">محجوب</span>';
  if (SEC_FIELDS.includes(k)) return secVal(e, k);
  if (['deptId', 'sectionId', 'locationId', 'costCenterId'].includes(k)) v = unitName(v);
  else if (k === 'managerId') v = v ? empName(v) : '';
  else if (k === 'shiftId') v = D.shifts.map[v]?.name;
  else if (k === 'status') return badge(v || 'active');
  else if (/Date|Expiry|Start|End|lastDay/.test(k) && v) return `<span class="num">${fmtD(v)}</span>`;
  return v ? esc(v) : '<span class="muted">غير مسجل</span>';
}
const dlOf = (e, keys) => `<dl class="dl">${keys.map(k => `<dt>${esc(FIELD_LABELS[k] || k)}</dt><dd>${fv(e, k)}</dd>`).join('')}</dl>`;
VIEWS.employee = () => {
  const e = emp(S.params.id); if (!e) return empty('الموظف غير موجود');
  if (!canViewEmp(e.id)) { return empty('لا تملك صلاحية عرض هذا الملف'); }
  const self = e.id === S.meId; const edit = can('emp.edit');
  const t = tabs('emp', [['basic', 'البيانات الأساسية'], ['job', 'الوظيفة والعقد'], ...(can('emp.view.salary') || self ? [['pay', 'الراتب والمستحقات']] : []), ['docs', 'المستندات'], ['leave', 'الإجازات والحضور'], ['dev', 'التدريب والأداء'], ['actions', 'الإجراءات الوظيفية'], ...(edit || can('audit.view') || self ? [['hist', 'سجل التغييرات']] : [])]);
  let body = '';
  if (t.cur === 'basic') body = `<div class="grid g2"><section class="card"><h2>البيانات الشخصية والاتصال</h2>${dlOf(e, ['empNo', 'nameAr', 'nameEn', 'gender', 'nationality', 'maritalStatus', 'phone', 'email', 'address', 'emergencyName', 'emergencyPhone'])}</section><section class="card"><h2>البيانات النظامية <small>${can('emp.view.sensitive') || self ? '' : 'محمية'}</small></h2>${dlOf(e, ['idType', 'idNumber', 'idExpiry', 'passportNo', 'passportExpiry', 'birthDate', 'iban'])}</section><section class="card"><h2>المؤهلات والخبرات</h2>${dlOf(e, ['education', 'experience'])}</section></div>`;
  else if (t.cur === 'job') body = `<div class="grid g2"><section class="card"><h2>بيانات الوظيفة</h2>${dlOf(e, ['title', 'grade', 'deptId', 'sectionId', 'locationId', 'costCenterId', 'managerId', 'shiftId', 'status'])}<div class="small muted" style="margin-top:8px">الأدوار في النظام: ${[...rolesOf(e)].map(r => `<span class="tag">${esc(ROLES[r])}</span>`).join('')}</div></section><section class="card"><h2>العقد <small>${e.contractEnd ? (e.contractEnd < todayISO() ? badge('rejected', 'منتهٍ') : badge('active', 'ساري')) : ''}</small></h2>${dlOf(e, ['contractType', 'contractStart', 'contractEnd', 'hireDate', 'joinDate', 'probationEnd', 'lastDay'])}${edit ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="emp-renew" data-id="${e.id}">تجديد العقد</button></div>` : ''}</section>${e.status === 'terminating' || e.status === 'terminated' ? `<section class="card"><h2>إخلاء الطرف</h2>${clearanceHtml(e)}</section>` : ''}</div>`;
  else if (t.cur === 'pay') {
    const s = D.salaries.map[e.id]; const tot = s ? ['basic', 'housing', 'transport', 'other'].reduce((a, k) => a + Number(s[k] || 0), 0) : null;
    const loans = D.loans.list.filter(l => l.empId === e.id);
    body = `<div class="grid g2"><section class="card"><h2>عناصر الأجر <small>${s?.effectiveDate ? 'سارية من ' + fmtD(s.effectiveDate) : ''}</small></h2>${s ? `<dl class="dl">${Object.entries(PAY_ELEMENTS).map(([k, l]) => `<dt>${l}</dt><dd class="num">${fmtSAR(s[k])}</dd>`).join('')}<dt><b>الإجمالي</b></dt><dd class="num"><b>${fmtSAR(tot)}</b></dd></dl>` : empty('لم تُسجل عناصر الأجر لهذا الموظف')}<p class="small muted">أي تغيير مالي يتم عبر طلب «تغيير مالي» يمر بالاعتماد ويُسجل في سجل التدقيق.</p></section>
    <section class="card"><h2>السلف</h2>${loans.length ? `<div class="list">${loans.map(l => `<div><div class="grow"><b class="num">${fmtSAR(l.amount)}</b> <span class="small muted">${esc(l.ref || '')}</span><div class="small">مسدد ${(l.paid || []).length} من ${l.installments} قسط · القسط ${fmtSAR(l.monthly)}</div></div>${badge(l.status)}</div>`).join('')}</div>` : empty('لا توجد سلف')}</section></div>`;
  }
  else if (t.cur === 'docs') body = `<section class="card"><h2>المستندات والعقود والإقرارات ${edit ? `<button class="btn sm" data-act="emp-doc" data-id="${e.id}">${ic('up')} رفع مستند</button>` : ''}</h2>${(e.docs || []).length ? `<div class="tablewrap"><table><thead><tr><th>المستند</th><th>النوع</th><th>تاريخ الانتهاء</th><th>رُفع في</th><th>بواسطة</th></tr></thead><tbody>${e.docs.filter(d => !d.restricted || can('emp.view.disciplinary') || self).map(d => `<tr><td>${fileLink(d)}</td><td>${esc(d.kind || '')}</td><td class="num">${fmtD(d.expiry)}${d.expiry && d.expiry < todayISO() ? ' ' + badge('rejected', 'منتهٍ') : ''}</td><td class="num">${fmtD(d.at)}</td><td>${esc(empName(d.byId))}</td></tr>`).join('')}</tbody></table></div>` : empty('لا توجد مستندات مرفوعة')}
    <h3 class="small muted" style="margin:14px 0 6px">الإقرارات على السياسات</h3>${(() => { const a = D.acks.list.filter(x => x.empId === e.id); return a.length ? `<div class="list">${a.map(x => `<div><div class="grow">${esc(D.forms.map[x.formId]?.title || '—')} <span class="small muted">إصدار ${esc(x.version)}</span></div><span class="small num">${fmtDT(x.at)}</span></div>`).join('')}</div>` : empty('لا توجد إقرارات'); })()}</section>`;
  else if (t.cur === 'leave') {
    const lr = D.requests.list.filter(r => r.empId === e.id && r.effect === 'leave').sort(by('createdAt', -1));
    const att = D.attendance.list.filter(a => a.empId === e.id).slice(0, 30);
    body = `<div class="grid g2"><section class="card"><h2>أرصدة الإجازات</h2><div class="tablewrap"><table><thead><tr><th>النوع</th><th>المستحق</th><th>المرحل</th><th>تسوية</th><th>المستخدم</th><th>معلّق</th><th>المتاح</th></tr></thead><tbody>${D.leaveTypes.list.filter(l => l.tracked !== false).map(l => { const b = balanceOf(e.id, l.id); return `<tr><td>${esc(l.name)}</td><td class="num">${b.entitled}</td><td class="num">${b.carried}</td><td class="num">${b.adj}</td><td class="num">${b.used}</td><td class="num">${b.pending}</td><td class="num"><b>${b.available}</b></td></tr>`; }).join('')}</tbody></table></div></section>
    <section class="card"><h2>سجل الإجازات</h2>${lr.length ? `<div class="list">${lr.map(r => `<div><div class="grow">${esc(D.leaveTypes.map[r.data?.leaveTypeId]?.name || r.typeName)} <span class="num small">${fmtD(r.data?.from)} ← ${fmtD(r.data?.to)} (${r.data?.days} يوم)</span></div>${badge(r.status)}</div>`).join('')}</div>` : empty('لا توجد إجازات')}</section></div>
    <section class="card" style="margin-top:16px"><h2>آخر سجلات الحضور</h2>${attTable(att, false)}</section>`;
  }
  else if (t.cur === 'dev') {
    const en = D.enrollments.list.filter(x => x.empId === e.id); const rv = D.reviews.list.filter(x => x.empId === e.id).sort(by('period', -1));
    body = `<div class="grid g2"><section class="card"><h2>التدريب والشهادات</h2>${en.length ? `<div class="list">${en.map(x => `<div><div class="grow">${esc(D.courses.map[x.courseId]?.title || '—')}<div class="small muted">${esc(D.courses.map[x.courseId]?.provider || '')}</div></div>${badge(x.status === 'completed' ? 'approved' : 'pending', x.status === 'completed' ? 'مكتمل' : 'مسجل')}</div>`).join('')}</div>` : empty('لا توجد دورات')}</section>
    <section class="card"><h2>تقييمات الأداء</h2>${rv.length ? `<div class="list">${rv.map(x => `<div><div class="grow"><b>${esc(x.period)}</b><div class="small muted">${esc(x.goals || '')}</div></div><span class="num">${x.rating ? x.rating + ' / 5' : '—'}</span> ${badge(x.status === 'final' ? 'approved' : 'pending', x.status === 'final' ? 'معتمد' : 'قيد التقييم')}</div>`).join('')}</div>` : empty('لا توجد تقييمات')}</section></div>`;
  }
  else if (t.cur === 'actions') {
    const acts = D.emphistory.list.filter(h => h.empId === e.id && (h.kind === 'action' || h.kind === 'letter')).filter(h => !h.disciplinary || can('emp.view.disciplinary') || self);
    body = `<section class="card"><h2>الترقيات والنقل والتكليفات والإنذارات ${edit ? `<button class="btn sm" data-act="emp-action" data-id="${e.id}">${ic('plus')} إجراء وظيفي</button>` : ''}</h2>${acts.length ? `<div class="list">${acts.map(h => `<div><div class="grow"><b>${esc(h.label || h.field)}</b>${h.disciplinary ? ' <span class="badge b-warn">تأديبي</span>' : ''}<div class="small">${esc(h.reason || '')}</div><div class="small muted">${esc(empName(h.byId))} · <span class="num">${fmtDT(h.at)}</span>${h.effective ? ' · ساري من ' + fmtD(h.effective) : ''}</div></div></div>`).join('')}</div>` : empty('لا توجد إجراءات وظيفية مسجلة')}</section>`;
  }
  else if (t.cur === 'hist') {
    const hs = D.emphistory.list.filter(h => h.empId === e.id && (!h.sensitive || can('emp.view.salary')) && (!h.disciplinary || can('emp.view.disciplinary') || self));
    body = `<section class="card"><h2>سجل التغييرات</h2>${hs.length ? `<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>الحقل</th><th>القيمة السابقة</th><th>القيمة الجديدة</th><th>السبب</th><th>بواسطة</th></tr></thead><tbody>${hs.map(h => `<tr><td class="num">${fmtDT(h.at)}</td><td>${esc(FIELD_LABELS[h.field] || PAY_ELEMENTS[h.field] || h.label || h.field)}</td><td>${esc(histVal(h.field, h.old))}</td><td>${esc(histVal(h.field, h.new))}</td><td>${esc(h.reason || '')}</td><td>${esc(empName(h.byId))}</td></tr>`).join('')}</tbody></table></div>` : empty('لا توجد تغييرات مسجلة')}</section>`;
  }
  const actions = edit ? `<button class="btn" data-act="emp-edit" data-id="${e.id}">تعديل البيانات</button>${can('letters.issue') ? `<button class="btn" data-act="emp-letter" data-id="${e.id}">${ic('mail')} إصدار خطاب</button>` : ''}${e.status !== 'terminated' && e.status !== 'terminating' ? `<button class="btn danger" data-act="emp-terminate" data-id="${e.id}">إنهاء خدمة</button>` : ''}` : '';
  return `<div class="row small" style="margin-bottom:8px"><a href="#" data-act="go" data-v="${self && !can('emp.view.all') ? 'home' : 'employees'}">→ رجوع</a></div>
    <div class="ph"><div class="hello">${avatar(e, true)}<div><h1>${esc(e.nameAr)}</h1><p>${esc(e.title || '')} · ${esc(unitName(e.deptId))} · <span class="num">${esc(e.empNo || '')}</span> · ${badge(e.status || 'active')} · اكتمال الملف <b class="num">${completeness(e)}%</b></p></div></div><div class="row">${actions}</div></div>${t.html}${body}`;
};
function histVal(k, v) { if (v == null || v === '') return '—'; if (k === 'custom' && typeof v === 'object') return Object.entries(v).map(([a, b]) => (cfDefs('employee').find(f => f.key === a)?.label || a) + ': ' + (Array.isArray(b) ? b.join('، ') : b === true ? 'نعم' : b === false ? 'لا' : b)).join(' · '); if (['deptId', 'sectionId', 'locationId', 'costCenterId'].includes(k)) return unitName(v); if (k === 'managerId') return empName(v); if (k === 'status') return STATUS[v]?.[0] || v; if (k === 'roles') return (v || []).map(r => ROLES[r]).join('، '); if (SENSITIVE_FIELDS.includes(k) && !can('emp.view.sensitive')) return 'محجوب'; return String(v); }

function openEmpEdit(id, prefill) {
  const e = id ? emp(id) : (prefill || { status: 'probation' });
  const u = t => D.orgunits.list.filter(x => x.type === t).sort(by('name')).map(x => [x.id, x.name]);
  const emps = D.employees.list.filter(x => x.id !== id && x.status !== 'terminated').sort(by('nameAr')).map(x => [x.id, x.nameAr]);
  openModal(id ? 'تعديل بيانات ' + e.nameAr : 'إضافة موظف', `
  <form class="form" id="empform" data-form="emp" ${id ? `data-id="${id}"` : ''}>
    <div class="full small muted">البيانات الأساسية</div>
    ${fld('empNo', 'الرقم الوظيفي', { value: e.empNo, required: true })}${fld('nameAr', 'الاسم بالعربية', { value: e.nameAr, required: true })}${fld('nameEn', 'الاسم بالإنجليزية', { value: e.nameEn })}
    ${fld('gender', 'الجنس', { type: 'select', options: ['ذكر', 'أنثى'], value: e.gender })}${fld('nationality', 'الجنسية', { value: e.nationality })}${fld('maritalStatus', 'الحالة الاجتماعية', { type: 'select', options: LIST('maritalStatus'), value: e.maritalStatus })}
    ${fld('phone', 'الجوال', { value: e.phone, type: 'tel' })}${fld('email', 'البريد الإلكتروني', { value: e.email, type: 'email' })}${fld('address', 'العنوان', { value: e.address })}
    ${fld('emergencyName', 'جهة الطوارئ', { value: e.emergencyName })}${fld('emergencyPhone', 'هاتف الطوارئ', { value: e.emergencyPhone, type: 'tel' })}
    ${can('emp.view.sensitive') || !id ? `<div class="full small muted">البيانات النظامية (حساسة)</div>
    ${fld('idType', 'نوع الهوية', { type: 'select', options: LIST('idTypes'), value: e.idType })}${fld('idNumber', 'رقم الهوية/الإقامة', { value: e.idNumber })}${fld('idExpiry', 'انتهاء الهوية/الإقامة', { type: 'date', value: e.idExpiry })}
    ${fld('passportNo', 'رقم الجواز', { value: e.passportNo })}${fld('passportExpiry', 'انتهاء الجواز', { type: 'date', value: e.passportExpiry })}${fld('birthDate', 'تاريخ الميلاد', { type: 'date', value: e.birthDate })}${fld('iban', 'الآيبان', { value: e.iban })}` : ''}
    <div class="full small muted">الوظيفة</div>
    ${fld('title', 'المسمى الوظيفي', { value: e.title })}${fld('grade', 'المستوى الوظيفي', { value: e.grade })}
    ${fld('deptId', 'الإدارة', { type: 'select', options: u('dept'), value: e.deptId })}${fld('sectionId', 'القسم', { type: 'select', options: u('section'), value: e.sectionId })}${fld('locationId', 'موقع العمل', { type: 'select', options: u('location'), value: e.locationId })}${fld('costCenterId', 'مركز التكلفة', { type: 'select', options: u('costcenter'), value: e.costCenterId })}
    ${fld('managerId', 'المدير المباشر', { type: 'select', options: emps, value: e.managerId })}${fld('shiftId', 'الوردية', { type: 'select', options: D.shifts.list.map(s => [s.id, s.name]), value: e.shiftId })}${fld('status', 'الحالة', { type: 'select', blank: false, options: [['probation', 'فترة تجربة'], ['active', 'على رأس العمل'], ['terminating', 'إجراءات إنهاء خدمة'], ['terminated', 'منتهية خدمته']], value: e.status || 'active' })}
    <div class="full small muted">العقد</div>
    ${fld('contractType', 'نوع العقد', { type: 'select', options: LIST('contractTypes'), value: e.contractType })}${fld('contractStart', 'بداية العقد', { type: 'date', value: e.contractStart })}${fld('contractEnd', 'نهاية العقد', { type: 'date', value: e.contractEnd })}
    ${fld('hireDate', 'تاريخ التعيين', { type: 'date', value: e.hireDate })}${fld('joinDate', 'تاريخ المباشرة', { type: 'date', value: e.joinDate })}${fld('probationEnd', 'نهاية فترة التجربة', { type: 'date', value: e.probationEnd })}
    ${fld('education', 'المؤهلات والشهادات', { type: 'textarea', value: e.education, full: true })}${fld('experience', 'الخبرات السابقة', { type: 'textarea', value: e.experience, full: true })}
    ${cfForm('employee', e)}
    ${id ? fld('_reason', 'سبب التعديل (يُحفظ في سجل التغييرات)', { required: true, full: true }) : ''}
  </form>`, `<button class="btn pri" type="submit" form="empform">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
}
async function saveEmp(form) {
  const id = form.dataset.id; const v = readForm(form); const reason = v._reason; delete v._reason;
  if (!v.empNo || !v.nameAr) return toast('الرقم الوظيفي والاسم إلزاميان', true);
  if (D.employees.list.some(x => x.empNo === v.empNo && x.id !== id)) return toast('الرقم الوظيفي مستخدم لموظف آخر', true);
  if (v.managerId && v.managerId === id) return toast('لا يمكن أن يكون الموظف مديرًا لنفسه', true);
  if (id && !reason) return toast('اكتب سبب التعديل', true);
  if (v.contractEnd && v.contractStart && v.contractEnd < v.contractStart) return toast('نهاية العقد قبل بدايته', true);
  const at = nowISO();
  if (id) {
    const cur = emp(id); const changes = Object.keys(v).filter(k => JSON.stringify(cur[k] ?? '') !== JSON.stringify(v[k] ?? ''));
    if (!changes.length) { closeModal(); return toast('لا توجد تغييرات'); }
    await put('employees', id, { ...strip(cur), ...v, updatedAt: at });
    for (const k of changes) await put('emphistory', newId(), { empId: id, kind: 'data', field: k, old: cur[k] ?? '', new: v[k], reason, byId: S.meId, at, sensitive: false });
    await audit('تعديل ملف موظف', 'employee', id, `${cur.nameAr}: ${changes.map(k => FIELD_LABELS[k] || k).join('، ')} — ${reason}`);
  } else {
    const nid = newId(); await put('employees', nid, { ...v, roles: [], docs: [], createdAt: at, createdById: S.meId });
    await put('emphistory', newId(), { empId: nid, kind: 'action', field: 'status', label: 'تعيين', old: '', new: v.status, reason: 'إنشاء الملف', byId: S.meId, at });
    for (const lt of D.leaveTypes.list.filter(l => l.tracked !== false)) await put('leaveBalances', nid + '_' + lt.id, { empId: nid, typeId: lt.id, entitled: Number(lt.annualDays || 0), carried: 0, adjust: 0, year: new Date().getFullYear() });
    await audit('تعيين موظف', 'employee', nid, v.nameAr);
    if (S.pendingCandidate) { await patch('candidates', S.pendingCandidate, { stage: 'hired', empId: nid }); S.pendingCandidate = null; }
  }
  closeModal(); toast('تم الحفظ');
}
function clearanceDepts() { return SET().clearanceDepts || [['manager', 'المدير المباشر', 'manager'], ['admin', 'الشؤون الإدارية (العهد والسكن)', 'adminOfficer'], ['finance', 'المالية (السلف والمستحقات)', 'payroll'], ['hr', 'الموارد البشرية', 'personnel']]; }
function canSignClearance(e, role) { if (role === 'manager') return e.managerId === S.meId || hasRole('hrManager'); return hasRole(role) || (role === 'personnel' && hasRole('hrManager')); }
function clearanceHtml(e) {
  const c = e.clearance || {}; const assets = D.assets.list.filter(a => a.holderId === e.id); const loans = D.loans.list.filter(l => l.empId === e.id && l.status === 'open');
  const rows = clearanceDepts().map(([k, l, role]) => { const s = c[k]; const warn = k === 'admin' && assets.length ? `<div class="small" style="color:var(--warn)">عهد غير مسلّمة: ${assets.map(a => esc(a.name)).join('، ')}</div>` : k === 'finance' && loans.length ? `<div class="small" style="color:var(--warn)">سلف مفتوحة: ${loans.length}</div>` : '';
    return `<div><div class="grow"><b>${esc(l)}</b>${warn}${s?.done ? `<div class="small muted">${esc(empName(s.byId))} · <span class="num">${fmtDT(s.at)}</span>${s.note ? ' · ' + esc(s.note) : ''}</div>` : ''}</div>${s?.done ? badge('approved', 'تم') : canSignClearance(e, role) && e.status === 'terminating' ? `<button class="btn sm" data-act="clear-sign" data-id="${e.id}" data-k="${k}">توقيع الإخلاء</button>` : badge('pending', 'بانتظار')}</div>`; }).join('');
  const all = clearanceDepts().every(([k]) => c[k]?.done);
  return `<div class="list">${rows}</div>${e.status === 'terminating' && (hasRole('hrManager') || hasRole('personnel')) ? `<div class="row" style="margin-top:10px"><button class="btn ${all ? 'pri' : ''}" data-act="emp-finalize" data-id="${e.id}" ${all ? '' : 'disabled title="يجب إكمال كل الإخلاءات"'}>إنهاء الخدمة نهائيًا</button></div>` : ''}`;
}
