'use strict';
/* ============ Features inspired by Jisr / Bayzat / Malachite ============ */
const activeEmps = () => D.employees.list.filter(e => e.status !== 'terminated');
const holidays = () => SET().holidays || [];
function isHoliday(d) { return holidays().some(h => h.from <= d && (h.to || h.from) >= d); }
const isSaudi = e => /^سعودي|^saudi/i.test(String(e.nationality || '').trim());

/* ---------- 1. Org chart (جسر) ---------- */
VIEWS.orgchart = () => {
  const all = activeEmps(); const q = (S.q.org || '').trim().toLowerCase();
  const kids = id => all.filter(e => e.managerId === id).sort(by('nameAr'));
  const roots = all.filter(e => !e.managerId || !emp(e.managerId) || emp(e.managerId).status === 'terminated').sort((a, b) => kids(b.id).length - kids(a.id).length);
  const match = e => q && [e.nameAr, e.nameEn, e.title, unitName(e.deptId)].join(' ').toLowerCase().includes(q);
  const hasMatch = e => match(e) || kids(e.id).some(hasMatch);
  const seen = new Set();
  const node = (e, depth) => {
    if (seen.has(e.id)) return ''; seen.add(e.id);
    const ch = kids(e.id); const open = !q ? depth < 2 : hasMatch(e);
    const card = `<a href="#" class="oc-card ${match(e) ? 'hit' : ''}" data-act="go" data-v="employee" data-id="${e.id}">${avatar(e)}<span><b>${esc(e.nameAr)}</b><small>${esc(e.title || '')}</small><small class="muted">${esc(unitName(e.deptId))}</small></span>${ch.length ? `<span class="oc-n" title="${LX('عدد التابعين المباشرين', 'Direct reports')}">${ch.length}</span>` : ''}</a>`;
    return ch.length ? `<li><details ${open ? 'open' : ''}><summary>${card}</summary><ul>${ch.map(c => node(c, depth + 1)).join('')}</ul></details></li>` : `<li>${card}</li>`;
  };
  const noMgr = all.filter(e => !e.managerId).length;
  return pageHead(LX('الهيكل التنظيمي', 'Org chart'), LX('من يتبع من، كما هو مسجل في «المدير المباشر» لكل موظف', 'Who reports to whom, as recorded in each employee\'s direct manager'), `<input class="q" id="q-org" data-q="org" placeholder="${LX('ابحث عن اسم أو مسمى…', 'Search name or title…')}" value="${esc(S.q.org || '')}" aria-label="${LX('بحث', 'Search')}">`) +
    (all.length ? `${noMgr > 1 ? `<div class="note warn" style="margin-bottom:12px">${LX(`${noMgr} موظفين بدون مدير مباشر، ويظهرون كقمم مستقلة. حدّد مديرهم من الإعدادات ← الموظفون وأدوارهم.`, `${noMgr} employees have no direct manager and appear as separate tops. Set their manager from Settings ← Employees & roles.`)}</div>` : ''}<section class="card oc"><ul class="oc-tree">${roots.map(r => node(r, 0)).join('')}</ul></section>` : empty(LX('لا يوجد موظفون بعد', 'No employees yet')));
};

/* ---------- 2. People directory (بيزات) ---------- */
VIEWS.directory = () => {
  const q = (S.q.dir || '').trim().toLowerCase(); const dep = S.f.dirDept || '';
  let rows = activeEmps(); if (dep) rows = rows.filter(e => e.deptId === dep);
  if (q) rows = rows.filter(e => [e.nameAr, e.nameEn, e.title, e.empNo, unitName(e.deptId), unitName(e.locationId)].join(' ').toLowerCase().includes(q));
  return pageHead(LX('دليل الموظفين', 'People directory'), LX('ابحث عن زميل بالاسم أو المسمى أو الإدارة', 'Find a colleague by name, title or department')) +
    `<div class="toolbar"><input class="q" id="q-dir" data-q="dir" placeholder="${LX('بحث…', 'Search…')}" value="${esc(S.q.dir || '')}" aria-label="${LX('بحث', 'Search')}"><select data-fv="dirDept" aria-label="${LX('الإدارة', 'Department')}"><option value="">${LX('كل الإدارات', 'All departments')}</option>${D.orgunits.list.filter(u => u.type === 'dept').map(u => `<option value="${u.id}" ${dep === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select><span class="count">${rows.length}</span></div>
    <div class="dir-grid">${rows.sort(by('nameAr')).map(e => `<div class="card dir-card">${avatar(e, true)}<b>${esc(e.nameAr)}</b><span class="small">${esc(e.title || '')}</span><span class="small muted">${esc(unitName(e.deptId))} · ${esc(unitName(e.locationId))}</span>${e.email ? `<span class="small sel" dir="ltr">${esc(e.email)}</span>` : ''}${e.managerId ? `<span class="small muted">${LX('يتبع', 'Reports to')} ${esc(empName(e.managerId))}</span>` : ''}${canViewEmp(e.id) ? `<button class="btn sm" data-act="go" data-v="employee" data-id="${e.id}">${LX('الملف', 'Profile')}</button>` : ''}</div>`).join('') || empty(LX('لا نتائج', 'No results'))}</div>`;
};

/* ---------- 3. Team calendar & holidays (بيزات) ---------- */
function leavesIn(from, to, ids) { return D.requests.list.filter(r => r.effect === 'leave' && ['approved', 'pending'].includes(r.status) && (!ids || ids.has(r.empId)) && r.data?.from <= to && r.data?.to >= from); }
function calScope() { if (can('emp.view.all') && myScope().all && !myScope().excl.size) return null; if (can('emp.view.all')) { const s = new Set(activeEmps().filter(e => inScope(e.id)).map(e => e.id)); s.add(S.meId); return s; } const me = ME(); const s = new Set(teamIds(S.meId)); s.add(S.meId); activeEmps().filter(e => e.deptId && e.deptId === me?.deptId).forEach(e => s.add(e.id)); return s; }
VIEWS.calendar = () => {
  const m = S.f.calMonth || monthISO(); const [y, mo] = m.split('-').map(Number); const first = new Date(y, mo - 1, 1); const days = new Date(y, mo, 0).getDate();
  const scope = calScope(); const from = `${m}-01`, to = `${m}-${String(days).padStart(2, '0')}`; const lv = leavesIn(from, to, scope);
  const wk = SET().weekend || [5, 6]; const T0 = todayISO();
  const dnames = LANG === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const cells = []; for (let i = 0; i < first.getDay(); i++) cells.push('<div class="cal-c blank"></div>');
  for (let d = 1; d <= days; d++) {
    const iso = `${m}-${String(d).padStart(2, '0')}`; const wd = new Date(iso + 'T00:00:00').getDay(); const hol = holidays().find(h => h.from <= iso && (h.to || h.from) >= iso);
    const who = lv.filter(r => r.data.from <= iso && r.data.to >= iso);
    cells.push(`<div class="cal-c ${wk.includes(wd) ? 'wkend' : ''} ${hol ? 'hol' : ''} ${iso === T0 ? 'today' : ''}"><span class="cal-d num">${d}</span>${hol ? `<span class="cal-h">${esc(hol.name)}</span>` : ''}${who.slice(0, 4).map(r => `<span class="cal-p ${r.status}" title="${esc(empName(r.empId))} — ${esc(D.leaveTypes.map[r.data.leaveTypeId]?.name || '')}${r.status === 'pending' ? ' (' + LX('بانتظار الاعتماد', 'pending') + ')' : ''}">${esc(empName(r.empId).split(' ')[0])}</span>`).join('')}${who.length > 4 ? `<span class="small muted">+${who.length - 4}</span>` : ''}</div>`);
  }
  const todayOut = leavesIn(T0, T0, scope).filter(r => r.status === 'approved');
  return pageHead(LX('تقويم الفريق', 'Team calendar'), LX('من في إجازة، والإجازات الرسمية', "Who's out, and public holidays"), `<input type="month" data-fv="calMonth" value="${m}" aria-label="${LX('الشهر', 'Month')}">`) +
    `<div class="grid g2" style="margin-bottom:14px"><section class="card"><h2>${LX('في إجازة اليوم', 'Out today')} <small>${todayOut.length}</small></h2><div class="list">${todayOut.map(r => `<div><div class="grow"><b>${esc(empName(r.empId))}</b><div class="small muted">${LX('حتى', 'until')} <span class="num">${fmtD(r.data.to)}</span></div></div></div>`).join('') || empty(LX('لا أحد في إجازة اليوم', 'Nobody is out today'))}</div></section>
    <section class="card"><h2>${LX('الإجازات الرسمية القادمة', 'Upcoming holidays')}</h2><div class="list">${holidays().filter(h => (h.to || h.from) >= T0).sort(by('from')).slice(0, 5).map(h => `<div><div class="grow"><b>${esc(h.name)}</b></div><span class="num small">${fmtD(h.from)}${h.to && h.to !== h.from ? ' ← ' + fmtD(h.to) : ''}</span></div>`).join('') || empty(LX('لم تُسجل إجازات رسمية. يضيفها مدير النظام من الإعدادات ← الإجازات الرسمية.', 'No holidays recorded. The system admin adds them from Settings ← Public holidays.'))}</div></section></div>
    <section class="card"><div class="cal"><div class="cal-hd">${dnames.map(n => `<div>${n}</div>`).join('')}</div><div class="cal-grid">${cells.join('')}</div></div><div class="row small muted" style="margin-top:8px"><span class="cal-p approved">${LX('معتمدة', 'Approved')}</span><span class="cal-p pending">${LX('بانتظار الاعتماد', 'Pending')}</span><span>${scope ? LX('يظهر لك فريقك وإدارتك', 'Showing your team and department') : LX('كل الموظفين', 'All employees')}</span></div></section>`;
};
function holidaysHtml() {
  return `<div class="note" style="margin-bottom:10px">${LX('الإجازات الرسمية تُستبعد من أيام العمل في تقرير الحضور، ومن احتساب الإجازة عند اختيار «أيام عمل فقط». أدخل تواريخها المعتمدة كل سنة.', 'Public holidays are excluded from working days in the attendance report, and from leave counting when «working days only» is selected. Enter the approved dates each year.')}</div>` +
    dataTable('hol', [{ k: 'name', l: LX('المناسبة', 'Holiday') }, { k: 'from', l: LX('من', 'From'), v: h => `<span class="num">${fmtD(h.from)}</span>` }, { k: 'to', l: LX('إلى', 'To'), v: h => `<span class="num">${fmtD(h.to || h.from)}</span>` }, { k: 'x', l: '', nosort: true, v: h => `<button class="btn sm ghost danger" data-act="hol-del" data-id="${h.id}">${LX('حذف', 'Delete')}</button>` }], holidays().slice().sort(by('from', -1)), { search: false, tools: `<button class="btn sm pri" data-act="hol-new">${ic('plus')} ${LX('إجازة رسمية', 'Holiday')}</button>` });
}
ACT['hol-new'] = () => openModal(LX('إجازة رسمية', 'Public holiday'), `<form class="form" id="holf" data-form="hol">${fld('name', LX('المناسبة', 'Holiday'), { required: true })}${fld('from', LX('من تاريخ', 'From'), { type: 'date', required: true })}${fld('to', LX('إلى تاريخ', 'To'), { type: 'date' })}</form>`, `<button class="btn pri" form="holf">${LX('حفظ', 'Save')}</button><button class="btn" data-act="close-modal">${LX('إلغاء', 'Cancel')}</button>`);
FORM.hol = async f => { const v = readForm(f); if (v.to && v.to < v.from) return toast(LX('تاريخ النهاية قبل البداية', 'End date is before start date'), true); await patch('settings', 'main', { holidays: [...holidays(), { id: newId(), name: v.name, from: v.from, to: v.to || v.from }] }); await audit('إضافة إجازة رسمية', 'settings', 'holidays', `${v.name} ${v.from}`); closeModal(); toast(LX('تم الحفظ', 'Saved')); };
ACT['hol-del'] = el => confirmBox(LX('حذف هذه الإجازة الرسمية؟', 'Delete this holiday?'), async () => { await patch('settings', 'main', { holidays: holidays().filter(h => h.id !== el.dataset.id) }); toast(LX('حُذفت', 'Deleted')); }, LX('حذف', 'Delete'));

/* ---------- 4. Announcements & occasions (مالاكايت / بيزات) ---------- */
function celebrations() {
  const T0 = todayISO(); const mmdd = T0.slice(5); const in7 = []; for (let i = 0; i < 7; i++) in7.push(addDays(T0, i).slice(5));
  const out = [];
  activeEmps().forEach(e => {
    if (e.birthDate && in7.includes(e.birthDate.slice(5))) out.push({ e, kind: 'bd', when: e.birthDate.slice(5) === mmdd ? LX('اليوم', 'today') : fmtD(T0.slice(0, 5) + e.birthDate.slice(5)).slice(5) });
    const j = e.joinDate || e.hireDate; if (j && j.slice(0, 4) < T0.slice(0, 4) && in7.includes(j.slice(5))) out.push({ e, kind: 'ann', years: +T0.slice(0, 4) - +j.slice(0, 4) });
    if (j && j <= T0 && j >= addDays(T0, -30)) out.push({ e, kind: 'new' });
  });
  return out;
}
function annCard() {
  const anns = D.announcements.list.filter(a => !a.expires || a.expires >= todayISO()).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.at > a.at ? 1 : -1)).slice(0, 5);
  const cel = celebrations(); const outToday = leavesIn(todayISO(), todayISO(), calScope()).filter(r => r.status === 'approved');
  const mg = can('announce.manage');
  return `<div class="grid g3" style="margin-top:16px">
    <section class="card"><h2>${LX('إعلانات الشركة', 'Company announcements')} ${mg ? `<button class="btn sm" data-act="ann-new">${ic('plus')} ${LX('إعلان', 'Post')}</button>` : ''}</h2><div class="list">${anns.map(a => `<div><div class="grow">${a.pinned ? `<span class="badge b-info">${LX('مثبّت', 'Pinned')}</span> ` : ''}<b>${esc(a.title)}</b><div class="small" style="white-space:pre-wrap">${esc(a.body || '')}</div><div class="small muted"><span class="num">${fmtD(a.at)}</span> · ${esc(empName(a.byId))}</div></div>${mg ? `<button class="btn sm ghost" data-act="ann-del" data-id="${a.id}" aria-label="${LX('حذف', 'Delete')}">${ic('x')}</button>` : ''}</div>`).join('') || empty(LX('لا توجد إعلانات', 'No announcements'))}</div></section>
    <section class="card"><h2>${LX('مناسبات هذا الأسبوع', 'This week')}</h2><div class="list">${cel.map(c => `<div>${avatar(c.e)}<div class="grow"><b>${esc(c.e.nameAr)}</b><div class="small">${c.kind === 'bd' ? LX('عيد ميلاد', 'Birthday') + ' · ' + c.when : c.kind === 'ann' ? LX(`ذكرى انضمام: ${c.years} سنة`, `Work anniversary: ${c.years} yr`) : LX('انضم حديثًا — أهلًا وسهلًا', 'New joiner — welcome')}</div></div></div>`).join('') || empty(LX('لا توجد مناسبات هذا الأسبوع', 'Nothing this week'))}</div></section>
    <section class="card"><h2>${LX('في إجازة اليوم', 'Out today')} <small><a href="#" data-act="go" data-v="calendar">${LX('التقويم', 'Calendar')}</a></small></h2><div class="list">${outToday.map(r => `<div>${avatar(emp(r.empId))}<div class="grow"><b>${esc(empName(r.empId))}</b><div class="small muted">${LX('حتى', 'until')} <span class="num">${fmtD(r.data.to)}</span></div></div></div>`).join('') || empty(LX('الجميع على رأس العمل', 'Everyone is in'))}</div></section></div>`;
}
const _home = VIEWS.home;
VIEWS.home = () => { const h = _home(); const i = h.indexOf('<section style="margin-top:20px">'); return i > 0 ? h.slice(0, i) + annCard() + h.slice(i) : h + annCard(); };
ACT['ann-new'] = () => openModal(LX('إعلان جديد', 'New announcement'), `<form class="form" id="annf" data-form="ann">${fld('title', LX('العنوان', 'Title'), { required: true, full: true })}${fld('body', LX('النص', 'Text'), { type: 'textarea', full: true })}${fld('expires', LX('يختفي بعد تاريخ', 'Hide after'), { type: 'date' })}${fld('pinned', LX('التثبيت', 'Pin'), { type: 'checkbox', cbLabel: LX('تثبيت أعلى القائمة', 'Pin to top') })}${fld('notifyAll', LX('الإشعار', 'Notify'), { type: 'checkbox', value: true, cbLabel: LX('إرسال إشعار لكل الموظفين', 'Notify all employees') })}</form>`, `<button class="btn pri" form="annf">${LX('نشر', 'Publish')}</button><button class="btn" data-act="close-modal">${LX('إلغاء', 'Cancel')}</button>`);
FORM.ann = async f => { const v = readForm(f); const id = newId(); await put('announcements', id, { title: v.title, body: v.body, expires: v.expires || null, pinned: !!v.pinned, at: nowISO(), byId: S.meId }); if (v.notifyAll) await notify(activeEmps().map(e => e.id).filter(x => x !== S.meId), LX('إعلان جديد', 'New announcement'), v.title, { view: 'home' }); await audit('نشر إعلان', 'announcement', id, v.title); closeModal(); toast(LX('نُشر الإعلان', 'Published')); };
ACT['ann-del'] = el => confirmBox(LX('حذف هذا الإعلان؟', 'Delete this announcement?'), async () => { await remove('announcements', el.dataset.id); await audit('حذف إعلان', 'announcement', el.dataset.id, ''); }, LX('حذف', 'Delete'));

/* ---------- 5. Tasks & onboarding checklists (جسر / مالاكايت) ---------- */
const DEFAULT_CHECKLIST = () => [
  { title: LX('تجهيز العقد وتوقيعه', 'Prepare and sign the contract'), role: 'personnel', days: 1 },
  { title: LX('التسجيل في التأمينات الاجتماعية', 'Register with GOSI'), role: 'personnel', days: 3 },
  { title: LX('تسليم العهد (جوال، حاسب، زي العمل)', 'Hand over custody (phone, laptop, uniform)'), role: 'adminOfficer', days: 2 },
  { title: LX('ترتيب السكن والنقل إن وُجد', 'Arrange housing and transport if any'), role: 'adminOfficer', days: 3 },
  { title: LX('إضافة الموظف في مسير الرواتب', 'Add the employee to payroll'), role: 'payroll', days: 5 },
  { title: LX('التعريف بالسياسات وطلب الإقرارات', 'Introduce policies and request acknowledgements'), role: 'personnel', days: 5 },
  { title: LX('وضع أهداف فترة التجربة', 'Set probation goals'), role: 'manager', days: 7 }];
const checklist = () => (SET().checklists?.onboarding?.length ? SET().checklists.onboarding : DEFAULT_CHECKLIST());
function taskOwners(t) { if (t.assigneeId) return [t.assigneeId]; if (t.role === 'manager') { const e = emp(t.empId); return e?.managerId ? [e.managerId] : []; } return activeEmps().filter(e => rolesOf(e).has(t.role)).map(e => e.id); }
const myTask = t => !t.done && taskOwners(t).includes(S.meId);
VIEWS.tasks = () => {
  const items = [['mine', LX('مهامي', 'My tasks')], ['created', LX('أنشأتها', 'Created by me')], ...(can('emp.edit') ? [['all', LX('كل المهام', 'All tasks')]] : [])];
  const t = tabs('tsk', items); const showDone = S.f.tskDone;
  let rows = t.cur === 'mine' ? D.tasks.list.filter(x => taskOwners(x).includes(S.meId)) : t.cur === 'created' ? D.tasks.list.filter(x => x.byId === S.meId) : D.tasks.list;
  if (!showDone) rows = rows.filter(x => !x.done);
  const T0 = todayISO();
  return pageHead(LX('المهام', 'Tasks'), LX('مهام التهيئة والمهام الإدارية المسندة لك أو لدورك', 'Onboarding and admin tasks assigned to you or your role'), `<button class="btn pri" data-act="task-new">${ic('plus')} ${LX('مهمة جديدة', 'New task')}</button>`) + t.html +
    dataTable('tasks-' + t.cur, [{ k: 'title', l: LX('المهمة', 'Task'), v: x => `<b>${esc(x.title)}</b>${x.notes ? `<div class="small muted">${esc(x.notes)}</div>` : ''}` }, { k: 'emp', l: LX('الموظف المعني', 'Employee'), s: x => empName(x.empId), v: x => x.empId ? esc(empName(x.empId)) : '—' }, { k: 'owner', l: LX('المسؤول', 'Owner'), s: x => x.assigneeId ? empName(x.assigneeId) : ROLES[x.role] || '', v: x => esc(x.assigneeId ? empName(x.assigneeId) : (ROLES[x.role] || '')) }, { k: 'due', l: LX('الاستحقاق', 'Due'), v: x => `<span class="num">${fmtD(x.due)}</span>${!x.done && x.due && x.due < T0 ? ' ' + badge('rejected', LX('متأخرة', 'Overdue')) : ''}` }, { k: 'kind', l: LX('النوع', 'Type'), v: x => x.kind === 'onboarding' ? LX('تهيئة موظف جديد', 'Onboarding') : x.kind === 'admin' ? LX('شؤون إدارية', 'Admin affairs') + (x.remindAt ? `<div class="small muted">${LX('تذكير', 'Reminder')} <span class="num">${fmtDT(x.remindAt)}</span></div>` : '') : LX('عامة', 'General') }, { k: 'st', l: LX('الحالة', 'Status'), s: x => x.done ? 1 : 0, v: x => x.done ? `${badge('approved', LX('منجزة', 'Done'))}<div class="small muted">${esc(empName(x.doneBy))} · <span class="num">${fmtD(x.doneAt)}</span></div>` : myTask(x) || can('emp.edit') ? `<button class="btn sm ok" data-act="task-done" data-id="${x.id}">${ic('check')} ${LX('تمت', 'Done')}</button>` : badge('pending', LX('مفتوحة', 'Open')) }], rows.sort(by(x => x.due || '9999')), { tools: `<label class="small"><input type="checkbox" data-fc="tskDone" ${showDone ? 'checked' : ''}> ${LX('إظهار المنجزة', 'Show done')}</label>`, empty: LX('لا توجد مهام مفتوحة', 'No open tasks') });
};
ACT['task-new'] = el => openModal(LX('مهمة جديدة', 'New task'), `<form class="form" id="tskf" data-form="task">${fld('title', LX('المهمة', 'Task'), { required: true, full: true })}${fld('empId', LX('الموظف المعني (اختياري)', 'Related employee (optional)'), { type: 'select', value: el.dataset.emp, options: activeEmps().sort(by('nameAr')).map(e => [e.id, e.nameAr]) })}${fld('assigneeId', LX('إسناد إلى موظف', 'Assign to employee'), { type: 'select', options: activeEmps().sort(by('nameAr')).map(e => [e.id, e.nameAr]) })}${fld('role', LX('أو إلى دور', 'or to a role'), { type: 'select', options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]) })}${fld('due', LX('تاريخ الاستحقاق', 'Due date'), { type: 'date' })}${fld('notes', LX('ملاحظات', 'Notes'), { type: 'textarea', full: true })}</form>`, `<button class="btn pri" form="tskf">${LX('حفظ', 'Save')}</button><button class="btn" data-act="close-modal">${LX('إلغاء', 'Cancel')}</button>`);
FORM.task = async f => { const v = readForm(f); if (!v.assigneeId && !v.role) return toast(LX('حدد موظفًا أو دورًا للمهمة', 'Choose an employee or a role'), true); const t = { title: v.title, empId: v.empId || null, assigneeId: v.assigneeId || null, role: v.assigneeId ? null : v.role, due: v.due || null, notes: v.notes, kind: 'general', done: false, byId: S.meId, at: nowISO() }; const id = newId(); await put('tasks', id, t); await notify(taskOwners(t).filter(x => x !== S.meId), LX('مهمة جديدة لك', 'New task for you'), t.title, { view: 'tasks' }); await audit('إنشاء مهمة', 'task', id, t.title); closeModal(); toast(LX('أُنشئت المهمة', 'Task created')); };
ACT['task-done'] = async el => { const x = D.tasks.map[el.dataset.id]; await put('tasks', x.id, { ...strip(x), done: true, doneBy: S.meId, doneAt: nowISO() }); await audit('إنجاز مهمة', 'task', x.id, x.title); toast(LX('أُنجزت المهمة', 'Task completed')); };
ACT['onboard'] = el => { const e = emp(el.dataset.id); if (D.tasks.list.some(t => t.empId === e.id && t.kind === 'onboarding')) return toast(LX('قائمة التهيئة موجودة لهذا الموظف', 'This employee already has an onboarding list'), true); confirmBox(LX(`إنشاء ${checklist().length} مهام تهيئة لـ ${esc(e.nameAr)} وإسنادها للجهات المسؤولة؟`, `Create ${checklist().length} onboarding tasks for ${esc(e.nameAr)} and assign them?`), async () => { const base = e.joinDate && e.joinDate > todayISO() ? e.joinDate : todayISO(); for (const c of checklist()) { const t = { title: c.title, empId: e.id, role: c.role, assigneeId: null, due: addDays(base, Number(c.days) || 0), kind: 'onboarding', done: false, byId: S.meId, at: nowISO() }; await put('tasks', newId(), t); await notify(taskOwners(t).filter(x => x !== S.meId), LX('مهمة تهيئة موظف جديد', 'Onboarding task'), `${t.title} — ${e.nameAr}`, { view: 'tasks' }); } await audit('بدء تهيئة موظف', 'employee', e.id, e.nameAr); toast(LX('أُنشئت قائمة التهيئة', 'Onboarding list created')); }, LX('إنشاء', 'Create')); };
function checklistHtml() {
  return `<div class="note" style="margin-bottom:10px">${LX('المهام التي تُنشأ تلقائيًا عند الضغط على «بدء التهيئة» في ملف موظف جديد. كل سطر: المهمة | الدور | خلال كم يوم. الأدوار المتاحة:', 'Tasks created when pressing «Start onboarding» in a new employee\'s file. Each line: task | role | within days. Roles:')} ${Object.keys(ROLES).filter(r => r !== 'employee' && r !== 'deptManager').map(r => `<span class="tag" data-noi18n>${r}</span>`).join('')}</div><form data-form="checklist" class="card"><textarea name="lines" rows="10" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)" data-noi18n>${esc(checklist().map(c => `${c.title} | ${c.role} | ${c.days}`).join('\n'))}</textarea><div class="row" style="margin-top:8px"><button class="btn pri">${LX('حفظ القائمة', 'Save checklist')}</button></div></form>`;
}
FORM.checklist = async f => { const lines = f.elements.lines.value.split('\n').map(l => l.trim()).filter(Boolean); const items = []; for (const l of lines) { const [title, role, days] = l.split('|').map(s => (s || '').trim()); if (!title) continue; if (!ROLES[role]) return toast(LX('دور غير معروف: ', 'Unknown role: ') + role, true); items.push({ title, role, days: Number(days) || 0 }); } await patch('settings', 'main', { checklists: { ...(SET().checklists || {}), onboarding: items } }); await audit('تعديل قائمة التهيئة', 'settings', 'checklists', items.length + ''); toast(LX('حُفظت القائمة', 'Saved')); };

/* ---------- 6. Document expiry center (مقيم-style tracking, manual data) ---------- */
function docRows() {
  const out = []; const T0 = todayISO(); const sens = can('emp.view.sensitive');
  activeEmps().forEach(e => {
    const add = (type, no, exp) => { if (exp) out.push({ id: e.id + type, e, type, no: sens ? no : (no ? '••••' : ''), exp, left: daysBetween(T0, exp) }); };
    add(e.idType || LX('هوية/إقامة', 'ID/Iqama'), e.idNumber, e.idExpiry); add(LX('جواز السفر', 'Passport'), e.passportNo, e.passportExpiry); add(LX('عقد العمل', 'Employment contract'), '', e.contractEnd);
    (e.docs || []).forEach(d => add(d.kind || d.name, d.name, d.expiry));
  });
  return out;
}
VIEWS.docs = () => {
  const f = S.f.docWin ?? '90'; let rows = docRows(); if (f !== 'all') rows = rows.filter(r => r.left <= Number(f));
  const all = docRows(); const exp = all.filter(r => r.left < 0).length, d30 = all.filter(r => r.left >= 0 && r.left <= 30).length, d90 = all.filter(r => r.left > 30 && r.left <= 90).length;
  const st = r => r.left < 0 ? badge('rejected', LX(`منتهٍ منذ ${-r.left} يوم`, `Expired ${-r.left} d ago`)) : r.left <= 30 ? badge('returned', LX(`باقي ${r.left} يوم`, `${r.left} d left`)) : badge('pending', LX(`باقي ${r.left} يوم`, `${r.left} d left`));
  return pageHead(LX('مركز الوثائق', 'Documents center'), LX('الهويات والإقامات والجوازات والعقود ومستندات الموظفين حسب تاريخ الانتهاء', 'IDs, iqamas, passports, contracts and employee documents by expiry')) +
    `<div class="grid g4" style="margin-bottom:14px">${kpi(LX('منتهية', 'Expired'), fmtN(exp), '', exp)}${kpi(LX('خلال 30 يومًا', 'Within 30 days'), fmtN(d30), '', d30)}${kpi(LX('خلال 31–90 يومًا', 'Within 31–90 days'), fmtN(d90))}${kpi(LX('إجمالي الوثائق المتابعة', 'Tracked documents'), fmtN(all.length))}</div>
    <div class="note small" style="margin-bottom:10px">${LX('التواريخ من ملفات الموظفين كما أُدخلت. لا يوجد ربط آلي مع منصة مقيم؛ حدّث التاريخ في ملف الموظف بعد التجديد.', 'Dates come from employee files as entered. There is no automatic link with Muqeem; update the date in the employee file after renewal.')}</div>` +
    dataTable('docs', [{ k: 'name', l: LX('الموظف', 'Employee'), s: r => r.e.nameAr, v: r => `<a href="#" data-act="go" data-v="employee" data-id="${r.e.id}">${esc(r.e.nameAr)}</a><div class="small muted">${esc(r.e.empNo || '')}</div>`, txt: r => r.e.nameAr + ' ' + r.e.empNo + ' ' + r.type }, { k: 'nat', l: LX('الجنسية', 'Nationality'), s: r => r.e.nationality || '', v: r => esc(r.e.nationality || '—') }, { k: 'type', l: LX('الوثيقة', 'Document') }, { k: 'no', l: LX('الرقم', 'Number'), v: r => `<span class="num">${esc(r.no || '—')}</span>` }, { k: 'exp', l: LX('تاريخ الانتهاء', 'Expiry'), v: r => `<span class="num">${fmtD(r.exp)}</span>` }, { k: 'left', l: LX('الحالة', 'Status'), v: st }], rows.sort(by('left')),
      { tools: `<select data-fv="docWin" aria-label="${LX('الفترة', 'Window')}">${[['0', LX('المنتهية فقط', 'Expired only')], ['30', LX('خلال 30 يومًا', 'Within 30 days')], ['60', LX('خلال 60 يومًا', 'Within 60 days')], ['90', LX('خلال 90 يومًا', 'Within 90 days')], ['all', LX('الكل', 'All')]].map(([k, l]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${can('export.data') ? `<button class="btn sm" data-act="docs-export">${ic('down')} ${LX('تصدير Excel', 'Export Excel')}</button>` : ''}`, empty: LX('لا توجد وثائق ضمن هذه الفترة', 'No documents in this window') });
};
ACT['docs-export'] = () => exportRows(`documents-${todayISO()}`, [[LX('الموظف', 'Employee'), LX('الرقم الوظيفي', 'Employee no.'), LX('الجنسية', 'Nationality'), LX('الوثيقة', 'Document'), LX('الرقم', 'Number'), LX('تاريخ الانتهاء', 'Expiry'), LX('الأيام المتبقية', 'Days left')], ...docRows().sort(by('left')).map(r => [r.e.nameAr, r.e.empNo, r.e.nationality, r.type, r.no, r.exp, r.left])], LX('الوثائق', 'Documents'));

/* ---------- 7. End-of-service gratuity — Saudi Labor Law arts. 84–85 (مالاكايت / جسر) ---------- */
const EOSB_BASES = () => ({ total: LX('الأجر الفعلي: الأساسي + كل البدلات الثابتة', 'Actual wage: basic + all fixed allowances'), basic_housing: LX('الأساسي + بدل السكن', 'Basic + housing'), basic: LX('الأساسي فقط', 'Basic only') });
function eosbWage(e) { const s = D.salaries.map[e.id]; if (!s) return null; const b = SET().eosbBase || 'total'; const n = k => Number(s[k] || 0); return b === 'basic' ? n('basic') : b === 'basic_housing' ? n('basic') + n('housing') : n('basic') + n('housing') + n('transport') + n('other'); }
function eosb(e, endDate, reason) {
  const start = e.joinDate || e.hireDate; const wage = eosbWage(e); if (!start || wage == null) return null;
  const days = Math.max(0, daysBetween(start, endDate)); const yrs = days / 365;
  const full = Math.min(yrs, 5) * wage / 2 + Math.max(0, yrs - 5) * wage;
  let factor = 1; if (reason === 'resign') factor = yrs < 2 ? 0 : yrs < 5 ? 1 / 3 : yrs < 10 ? 2 / 3 : 1;
  return { wage, yrs, full, factor, due: Math.round(full * factor * 100) / 100 };
}
function eosbBox(e) {
  const end = S.f.eosbEnd || e.lastDay || todayISO(); const reason = S.f.eosbReason || 'other'; const r = eosb(e, end, reason);
  return `<section class="card pf-sec"><h2>${LX('مكافأة نهاية الخدمة (تقديرية)', 'End-of-service gratuity (estimate)')}</h2>
    <div class="toolbar"><label class="small">${LX('تاريخ انتهاء الخدمة', 'Service end date')} <input type="date" data-fv="eosbEnd" value="${end}"></label><label class="small">${LX('السبب', 'Reason')} <select data-fv="eosbReason"><option value="other" ${reason === 'other' ? 'selected' : ''}>${LX('انتهاء العقد أو إنهاء من صاحب العمل', 'Contract end or employer termination')}</option><option value="resign" ${reason === 'resign' ? 'selected' : ''}>${LX('استقالة', 'Resignation')}</option></select></label></div>
    ${r ? `<div class="pf-pay"><div><span>${LX('مدة الخدمة', 'Service')}</span><b class="num">${fmtN(r.yrs, 2)} ${LX('سنة', 'yrs')}</b></div><div><span>${LX('الأجر المعتمد للحساب', 'Wage used')}</span><b class="num">${fmtN(r.wage, 2)}</b></div><div><span>${LX('المكافأة الكاملة', 'Full award')}</span><b class="num">${fmtN(r.full, 2)}</b></div>${reason === 'resign' ? `<div><span>${LX('نسبة الاستحقاق عند الاستقالة', 'Resignation share')}</span><b class="num">${r.factor === 0 ? '0' : r.factor === 1 ? '100%' : r.factor < 0.5 ? '1/3' : '2/3'}</b></div>` : ''}<div class="tot"><span>${LX('المستحق التقديري', 'Estimated due')}</span><b class="num">${fmtSAR(r.due)}</b></div></div>
    <p class="small muted">${LX('نصف أجر شهر عن كل سنة من الخمس الأولى، وأجر شهر عن كل سنة بعدها، وتُحسب كسور السنة نسبيًا (المادة 84). عند الاستقالة: لا شيء قبل سنتين، الثلث من 2 إلى 5، الثلثان من 5 إلى 10، كاملة بعد 10 (المادة 85)، مع استثناءات نظامية لا يطبقها الحاسب. أساس الأجر حسب الإعدادات:', 'Half a month\'s wage for each of the first five years and a full month for each year after, with partial years counted proportionally (Art. 84). On resignation: nothing before 2 years, one third for 2–5, two thirds for 5–10, full after 10 (Art. 85); legal exceptions are not applied by the calculator. Wage basis per settings:')} ${esc(EOSB_BASES()[SET().eosbBase || 'total'])}. ${LX('نتيجة استرشادية تُراجع قبل الصرف.', 'Indicative result to review before payment.')}</p>` : empty(LX('يلزم تاريخ تعيين وعناصر أجر مسجلة لحساب المكافأة', 'A hire date and recorded pay elements are needed'))}</section>`;
}
function eosbLiabilityHtml() {
  const T0 = todayISO(); const rows = activeEmps().map(e => ({ id: e.id, e, r: eosb(e, T0, 'other') }));
  const tot = rows.reduce((a, x) => a + (x.r?.due || 0), 0); const missing = rows.filter(x => !x.r).length;
  return `<div class="toolbar"><label class="small">${LX('أساس الأجر للحساب', 'Wage basis')} <select data-act-change="eosb-base" ${can('pay.manage') ? '' : 'disabled'}>${Object.entries(EOSB_BASES()).map(([k, l]) => `<option value="${k}" ${(SET().eosbBase || 'total') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><span class="note warn small" style="padding:4px 10px">${LX('تأكد من أساس الأجر مع المستشار النظامي قبل الاعتماد عليه', 'Confirm the wage basis with a legal adviser before relying on it')}</span></div>
  <div class="grid g4" style="margin-bottom:12px">${kpi(LX('الالتزام التقديري لنهاية الخدمة اليوم', 'Estimated EOSB liability today'), fmtSAR(tot), LX('لو انتهت خدمة الجميع اليوم بغير استقالة', 'If all services ended today, not by resignation'))}${kpi(LX('موظفون بلا بيانات كافية', 'Employees missing data'), fmtN(missing), LX('بلا تاريخ تعيين أو عناصر أجر', 'No hire date or pay elements'), missing)}</div>` +
    dataTable('eosb', [{ k: 'n', l: LX('الموظف', 'Employee'), s: x => x.e.nameAr, v: x => esc(x.e.nameAr) }, { k: 'h', l: LX('تاريخ التعيين', 'Hire date'), s: x => x.e.joinDate || x.e.hireDate, v: x => `<span class="num">${fmtD(x.e.joinDate || x.e.hireDate)}</span>` }, { k: 'y', l: LX('سنوات الخدمة', 'Years'), s: x => x.r?.yrs || 0, v: x => x.r ? `<span class="num">${fmtN(x.r.yrs, 2)}</span>` : '—' }, { k: 'w', l: LX('الأجر', 'Wage'), s: x => x.r?.wage || 0, v: x => x.r ? `<span class="num">${fmtN(x.r.wage, 2)}</span>` : '—' }, { k: 'd', l: LX('المكافأة التقديرية', 'Estimated award'), s: x => x.r?.due || 0, v: x => x.r ? `<b class="num">${fmtN(x.r.due, 2)}</b>` : `<span class="badge b-warn">${LX('بيانات ناقصة', 'Missing data')}</span>` }], rows);
}
ACT['eosb-base'] = async el => { await patch('settings', 'main', { eosbBase: el.value }); await audit('تغيير أساس أجر نهاية الخدمة', 'settings', 'eosbBase', el.value); toast(LX('تم الحفظ', 'Saved')); };
