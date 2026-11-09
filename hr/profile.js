'use strict';
/* ============ Employee profile (ملف الموظف) ============ */
function tenure(from) {
  if (!from) return null; const a = new Date(from + 'T00:00:00'), b = new Date(todayISO() + 'T00:00:00'); if (b < a) return 'لم يباشر بعد';
  let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); if (b.getDate() < a.getDate()) m--;
  const y = Math.floor(m / 12), mm = m % 12; const Y = y === 1 ? 'سنة' : y === 2 ? 'سنتان' : y <= 10 ? y + ' سنوات' : y + ' سنة'; const M = mm === 1 ? 'شهر' : mm === 2 ? 'شهران' : mm + ' أشهر';
  return y && mm ? `${Y} و${M}` : y ? Y : mm ? M : 'أقل من شهر';
}
function ring(p, size = 64) { const r = size / 2 - 5, c = 2 * Math.PI * r; const col = p >= 90 ? 'var(--ok)' : p >= 60 ? 'var(--warn)' : 'var(--bad)'; return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${p}%"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="6"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="var(--ink)" font-size="${size / 4.2}" font-weight="700">${p}%</text></svg>`; }
const kvGrid = items => `<div class="kvg">${items.map(([l, v]) => `<div><span>${esc(l)}</span><b>${v}</b></div>`).join('')}</div>`;
const kvOf = (e, keys) => kvGrid(keys.map(k => [FIELD_LABELS[k] || k, fv(e, k)]));
function personRow(e, note) { if (!e) return ''; return `<a href="#" class="prow" data-act="go" data-v="employee" data-id="${e.id}">${avatar(e)}<span><b>${esc(e.nameAr)}</b><small>${esc(note || e.title || '')}</small></span></a>`; }

VIEWS.employee = () => {
  const e = emp(S.params.id); if (!e) return empty('الموظف غير موجود');
  if (!canViewEmp(e.id)) return empty('لا تملك صلاحية عرض هذا الملف');
  const self = e.id === S.meId; const edit = can('emp.edit'); const T = todayISO();
  const comp = completeness(e); const missing = REQUIRED_FIELDS.filter(k => e[k] == null || e[k] === '');
  const annual = D.leaveTypes.list.find(l => l.id === 'lt_annual') || D.leaveTypes.list.filter(l => l.tracked !== false).sort(by('order'))[0];
  const bal = annual ? balanceOf(e.id, annual.id) : null;
  const openReq = D.requests.list.filter(r => r.empId === e.id && ['pending', 'returned'].includes(r.status) && canViewReq(r)).length;
  const cDays = e.contractEnd ? daysBetween(T, e.contractEnd) : null;
  const mgr = emp(e.managerId); const reports = D.employees.list.filter(x => x.managerId === e.id && x.status !== 'terminated');
  const ten = tenure(e.joinDate || e.hireDate);
  const t = tabs('emp', [['basic', 'البيانات الشخصية'], ['job', 'الوظيفة والعقد'], ...(can('emp.view.salary') || self ? [['pay', 'الراتب والمستحقات']] : []), ['docs', 'المستندات'], ['leave', 'الإجازات والحضور'], ['reqs', 'الطلبات'], ['dev', 'التدريب والأداء'], ['actions', 'الإجراءات الوظيفية'], ...(edit || can('audit.view') || self ? [['hist', 'سجل التغييرات']] : [])]);
  let body = '';
  if (t.cur === 'basic') {
    const extra = cfView('employee', e);
    body = `<section class="card pf-sec"><h2>البيانات الأساسية</h2>${kvOf(e, ['empNo', 'nameAr', 'nameEn', 'gender', 'birthDate', 'nationality', 'maritalStatus'])}</section>
    <section class="card pf-sec"><h2>البيانات النظامية ${can('emp.view.sensitive') || self ? '' : '<small>محمية</small>'}</h2>${kvOf(e, ['idType', 'idNumber', 'idExpiry', 'passportNo', 'passportExpiry', 'iban'])}</section>
    <section class="card pf-sec"><h2>المؤهلات والخبرات</h2>${kvOf(e, ['education', 'experience'])}</section>
    ${extra ? `<section class="card pf-sec"><h2>بيانات إضافية</h2><div class="kvg">${cfDefs('employee').filter(f => f.type !== 'section').map(f => `<div><span>${esc(f.label)}</span><b>${esc(fieldDisplay(f, e.custom?.[f.key]))}</b></div>`).join('')}</div></section>` : ''}`;
  } else if (t.cur === 'job') {
    const cs = e.contractStart, ce = e.contractEnd; const pct = cs && ce ? Math.max(0, Math.min(100, daysBetween(cs, T) / Math.max(1, daysBetween(cs, ce)) * 100)) : null;
    body = `<section class="card pf-sec"><h2>بيانات الوظيفة</h2>${kvOf(e, ['title', 'grade', 'deptId', 'sectionId', 'locationId', 'costCenterId', 'managerId', 'shiftId', 'status'])}<div class="small muted" style="margin-top:10px">الأدوار في النظام: ${[...rolesOf(e)].map(r => `<span class="tag">${esc(ROLES[r])}</span>`).join('')}</div></section>
    <section class="card pf-sec"><h2>العقد ${ce ? (ce < T ? badge('rejected', 'منتهٍ') : cDays <= Number(SET().contractAlertDays || 60) ? badge('returned', `ينتهي خلال ${cDays} يوم`) : badge('active', 'ساري')) : e.contractType ? badge('active', e.contractType) : ''} ${edit ? `<button class="btn sm" data-act="emp-renew" data-id="${e.id}">تجديد العقد</button>` : ''}${edit && e.status !== 'terminated' ? `<button class="btn sm" data-act="onboard" data-id="${e.id}">${LX('بدء التهيئة', 'Start onboarding')}</button>` : ''}</h2>
      ${pct != null ? `<div class="pf-bar" title="انقضى ${Math.round(pct)}% من مدة العقد"><i style="width:${pct.toFixed(1)}%"></i></div><div class="row small muted" style="justify-content:space-between;margin-bottom:10px"><span class="num">${fmtD(cs)}</span><span>انقضى ${Math.round(pct)}% من المدة</span><span class="num">${fmtD(ce)}</span></div>` : ''}
      ${kvOf(e, ['contractType', 'contractStart', 'contractEnd', 'hireDate', 'joinDate', 'probationEnd', 'lastDay'])}</section>
    ${e.status === 'terminating' || e.status === 'terminated' ? `<section class="card pf-sec"><h2>إخلاء الطرف</h2>${clearanceHtml(e)}</section>` : ''}`;
  } else if (t.cur === 'pay') {
    const s = D.salaries.map[e.id]; const tot = s ? elTotal(s) : null; const loans = D.loans.list.filter(l => l.empId === e.id);
    body = (!S.adminLvl ? `<div class="note warn small" style="margin-bottom:10px">${FIN_LOCK_MSG}</div>` : '') + `<section class="card pf-sec"><h2>عناصر الأجر <small>${s?.effectiveDate ? 'سارية من ' + fmtD(s.effectiveDate) : ''}</small></h2>${s ? `<div class="pf-pay">${Object.entries(PAY_ELEMENTS).map(([k, l]) => `<div><span>${l}</span><b class="num">${fmtN(s[k], 2)}</b></div>`).join('')}<div class="tot"><span>الإجمالي الشهري</span><b class="num">${fmtSAR(tot)}</b></div></div>` : empty('لم تُسجل عناصر الأجر لهذا الموظف')}<p class="small muted">أي تغيير مالي يتم عبر طلب «تغيير مالي» يمر بالاعتماد ويُسجل في سجل التدقيق.</p></section>
    ${can('pay.view') || hasRole('hrManager') ? eosbBox(e) : ''}<section class="card pf-sec"><h2>السلف</h2>${loans.length ? `<div class="list">${loans.map(l => `<div><div class="grow"><b class="num">${fmtSAR(l.amount)}</b> <span class="small muted">${esc(l.ref || '')}</span><div class="pf-bar sm"><i style="width:${((l.paid || []).length / l.installments * 100).toFixed(0)}%"></i></div><div class="small">مسدد ${(l.paid || []).length} من ${l.installments} قسط · القسط ${fmtSAR(l.monthly)}</div></div>${badge(l.status)}</div>`).join('')}</div>` : empty('لا توجد سلف')}</section>`;
  } else if (t.cur === 'docs') {
    const docs = (e.docs || []).filter(d => !d.restricted || can('emp.view.disciplinary') || self);
    body = `<section class="card pf-sec"><h2>المستندات والعقود ${edit ? `<button class="btn sm" data-act="emp-doc" data-id="${e.id}">${ic('up')} رفع مستند</button>` : ''}</h2>${docs.length ? `<div class="pf-docs">${docs.map(d => `<div class="pf-doc">${ic('file')}<div class="grow"><a href="/_blob/${esc(d.id)}" target="_blank" rel="noopener"><b>${esc(d.name)}</b></a><div class="small muted">${esc(d.kind || '')} · رُفع ${fmtD(d.at)} · ${esc(empName(d.byId))}</div></div>${d.expiry ? (d.expiry < T ? badge('rejected', 'منتهٍ ' + fmtD(d.expiry)) : badge(daysBetween(T, d.expiry) <= 60 ? 'returned' : 'approved', 'ينتهي ' + fmtD(d.expiry))) : ''}</div>`).join('')}</div>` : empty('لا توجد مستندات مرفوعة')}</section>
    <section class="card pf-sec"><h2>الإقرارات على السياسات</h2>${(() => { const a = D.acks.list.filter(x => x.empId === e.id); return a.length ? `<div class="list">${a.map(x => `<div><div class="grow">${esc(D.forms.map[x.formId]?.title || '—')} <span class="small muted">إصدار ${esc(x.version)}</span></div><span class="small num">${fmtDT(x.at)}</span></div>`).join('')}</div>` : empty('لا توجد إقرارات'); })()}</section>`;
  } else if (t.cur === 'leave') {
    const lr = D.requests.list.filter(r => r.empId === e.id && r.effect === 'leave').sort(by('createdAt', -1)); const att = D.attendance.list.filter(a => a.empId === e.id).slice(0, 20);
    const lts = D.leaveTypes.list.filter(l => l.tracked !== false).sort(by('order'));
    body = `<section class="card pf-sec"><h2>أرصدة الإجازات ${new Date().getFullYear()}</h2><div class="pf-bal">${lts.map(l => { const b = balanceOf(e.id, l.id); const tot = Math.max(1, b.entitled + b.carried + b.adj); return `<div><div class="row" style="justify-content:space-between"><b>${esc(l.name)}</b><span class="num"><b>${b.available}</b> <span class="muted small">متاح من ${b.entitled + b.carried + b.adj}</span></span></div><div class="pf-bar"><i style="width:${(b.used / tot * 100).toFixed(1)}%"></i><i class="p" style="width:${(b.pending / tot * 100).toFixed(1)}%"></i></div><div class="small muted">مستخدم ${b.used} · معلّق ${b.pending}${b.carried ? ' · مرحّل ' + b.carried : ''}</div></div>`; }).join('')}</div></section>
    <section class="card pf-sec"><h2>سجل الإجازات</h2>${lr.length ? `<div class="list">${lr.map(r => `<div><div class="grow"><b>${esc(D.leaveTypes.map[r.data?.leaveTypeId]?.name || r.typeName)}</b> <span class="num small">${fmtD(r.data?.from)} ← ${fmtD(r.data?.to)} (${r.data?.days} يوم)</span></div>${badge(r.status)}</div>`).join('')}</div>` : empty('لا توجد إجازات')}</section>
    <section class="card pf-sec"><h2>آخر سجلات الحضور</h2>${attTable(att, false)}</section>`;
  } else if (t.cur === 'reqs') {
    const rs = D.requests.list.filter(r => r.empId === e.id && canViewReq(r)).sort(by('createdAt', -1));
    body = `<section class="card pf-sec"><h2>طلبات الموظف</h2>${rs.length ? `<div class="list">${rs.map(r => `<div><div class="grow"><b>${esc(r.typeName)}</b> <span class="num small muted">${esc(r.ref)} · ${fmtD(r.createdAt)}</span><div style="margin-top:4px">${miniFlow(r)}</div></div><button class="btn sm ghost" data-act="open-req" data-id="${r.id}">فتح</button></div>`).join('')}</div>` : empty('لا توجد طلبات')}</section>`;
  } else if (t.cur === 'dev') {
    const en = D.enrollments.list.filter(x => x.empId === e.id); const rv = D.reviews.list.filter(x => x.empId === e.id).sort(by('period', -1));
    body = `${kpiProfileHtml(e)}<section class="card pf-sec"><h2>التدريب والشهادات</h2>${en.length ? `<div class="list">${en.map(x => `<div><div class="grow"><b>${esc(D.courses.map[x.courseId]?.title || '—')}</b><div class="small muted">${esc(D.courses.map[x.courseId]?.provider || '')} · ${esc(D.courses.map[x.courseId]?.hours || '—')} ساعة</div></div>${badge(x.status === 'completed' ? 'approved' : 'pending', x.status === 'completed' ? 'مكتمل' : 'مسجل')}</div>`).join('')}</div>` : empty('لا توجد دورات')}</section>
    <section class="card pf-sec"><h2>تقييمات الأداء</h2>${rv.length ? `<div class="list">${rv.map(x => `<div><div class="grow"><b>${esc(x.period)}</b><div class="small">${esc(x.goals || '')}</div>${x.comments ? `<div class="small muted">${esc(x.comments)}</div>` : ''}</div><div class="pf-stars" aria-label="${x.rating || 0} من 5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= (x.rating || 0) ? 'on' : ''}"></i>`).join('')}</div>${badge(x.status === 'final' ? 'approved' : 'pending', x.status === 'final' ? 'معتمد' : 'قيد التقييم')}</div>`).join('')}</div>` : empty('لا توجد تقييمات')}</section>`;
  } else if (t.cur === 'actions') {
    const acts = D.emphistory.list.filter(h => h.empId === e.id && (h.kind === 'action' || h.kind === 'letter')).filter(h => !h.disciplinary || can('emp.view.disciplinary') || self);
    body = `<section class="card pf-sec"><h2>المسيرة الوظيفية ${edit ? `<button class="btn sm" data-act="emp-action" data-id="${e.id}">${ic('plus')} إجراء وظيفي</button>` : ''}</h2>${acts.length ? `<div class="timeline">${acts.map(h => `<div class="tl ${h.disciplinary ? 'bad' : 'done'}"><b>${esc(h.label || h.field)}</b>${h.disciplinary ? ' <span class="badge b-warn">تأديبي</span>' : ''}<div class="small">${esc(h.reason || '')}</div><div class="small muted">${esc(empName(h.byId))} · <span class="num">${fmtDT(h.at)}</span>${h.effective ? ' · ساري من ' + fmtD(h.effective) : ''}</div></div>`).join('')}<div class="tl done"><b>التعيين</b><div class="small muted num">${fmtD(e.hireDate)}</div></div></div>` : `<div class="timeline"><div class="tl done"><b>التعيين</b><div class="small muted num">${fmtD(e.hireDate)}</div></div></div>`}</section>`;
  } else if (t.cur === 'hist') {
    const hs = D.emphistory.list.filter(h => h.empId === e.id && (!h.sensitive || can('emp.view.salary')) && (!h.disciplinary || can('emp.view.disciplinary') || self));
    body = `<section class="card pf-sec"><h2>سجل التغييرات</h2>${hs.length ? `<div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>الحقل</th><th>القيمة السابقة</th><th>القيمة الجديدة</th><th>السبب</th><th>بواسطة</th></tr></thead><tbody>${hs.map(h => `<tr><td class="num">${fmtDT(h.at)}</td><td>${esc(FIELD_LABELS[h.field] || PAY_ELEMENTS[h.field] || h.label || h.field)}</td><td>${esc(histVal(h.field, h.old))}</td><td>${esc(histVal(h.field, h.new))}</td><td>${esc(h.reason || '')}</td><td>${esc(empName(h.byId))}</td></tr>`).join('')}</tbody></table></div>` : empty('لا توجد تغييرات مسجلة')}</section>`;
  }
  const actions = edit ? `<button class="btn pri" data-act="emp-edit" data-id="${e.id}">${ic('file')} تعديل البيانات</button>${can('letters.issue') ? `<button class="btn" data-act="emp-letter" data-id="${e.id}">${ic('mail')} إصدار خطاب</button>` : ''}${e.status !== 'terminated' && e.status !== 'terminating' ? `<button class="btn danger" data-act="emp-terminate" data-id="${e.id}">إنهاء خدمة</button>` : ''}` : self ? `<button class="btn pri" data-act="new-req-effect" data-e="personalUpdate">طلب تحديث بياناتي</button>` : '';
  const chip = (i, txt, title) => `<span class="pf-chip" title="${esc(title || '')}">${ic(i)}${txt}</span>`;
  return `<div class="row small" style="margin-bottom:10px"><a href="#" data-act="go" data-v="${self && !can('emp.view.all') && !can('team.view') ? 'home' : 'employees'}">→ ${self && !can('emp.view.all') ? 'الرئيسية' : 'قائمة الموظفين'}</a></div>
  <section class="pf-hero"><div class="pf-cover"></div><div class="pf-main">
    <div class="pf-av">${esc(initials(e.nameAr))}</div>
    <div class="pf-id"><h1>${esc(e.nameAr)} ${badge(e.status || 'active')}</h1>${e.nameEn ? `<div class="pf-en" dir="ltr">${esc(e.nameEn)}</div>` : ''}<div class="pf-sub">${esc(e.title || 'المسمى غير محدد')} · ${esc(unitName(e.deptId))}${e.sectionId ? ' · ' + esc(unitName(e.sectionId)) : ''}</div>
      <div class="pf-chips">${chip('key', `<span class="num">${esc(e.empNo || '—')}</span>`, 'الرقم الوظيفي')}${chip('building', esc(unitName(e.locationId)), 'موقع العمل')}${ten ? chip('calendar', 'في الشركة منذ ' + ten, 'منذ ' + fmtD(e.joinDate || e.hireDate)) : ''}${mgr ? chip('users', 'يتبع ' + esc(mgr.nameAr), 'المدير المباشر') : ''}</div></div>
    <div class="pf-actions">${actions}${self ? authSelfButtons() : ''}</div></div></section>
  <div class="pf-stats">
    <div class="pf-stat">${bal ? `<span>${esc(annual.name)} — المتاح</span><b class="num">${bal.available} <small>يوم</small></b><i>من ${bal.entitled + bal.carried + bal.adj} · مستخدم ${bal.used}</i>` : '<span>رصيد الإجازات</span><b>—</b>'}</div>
    <div class="pf-stat"><span>طلبات مفتوحة</span><b class="num">${openReq}</b><i>${openReq ? 'بانتظار اعتماد أو استكمال' : 'لا يوجد طلب مفتوح'}</i></div>
    <div class="pf-stat ${cDays != null && cDays <= Number(SET().contractAlertDays || 60) ? 'warn' : ''}"><span>العقد</span><b>${e.contractEnd ? (cDays < 0 ? 'منتهٍ' : `<span class="num">${cDays}</span> <small>يوم متبقٍ</small>`) : esc(e.contractType || 'غير مسجل')}</b><i>${e.contractEnd ? 'ينتهي ' + fmtD(e.contractEnd) : ''}</i></div>
    <div class="pf-stat ring-stat">${ring(comp)}<div><span>اكتمال الملف</span><i>${missing.length ? `ينقصه ${missing.length} من ${REQUIRED_FIELDS.length} حقول` : 'جميع الحقول الأساسية مكتملة'}</i></div></div>
  </div>
  <div class="pf-layout">
    <aside class="pf-side">
      <section class="card"><h2>التواصل</h2><div class="pf-contact">${[['key', 'الجوال', e.phone], ['mail', 'البريد', e.email], ['home', 'العنوان', e.address], ['alert', 'الطوارئ', [e.emergencyName, e.emergencyPhone].filter(Boolean).join(' — ')]].map(([i, l, v]) => `<div>${ic(i)}<span><small>${l}</small>${v ? `<b class="sel">${esc(v)}</b>` : '<b class="muted">غير مسجل</b>'}</span></div>`).join('')}</div></section>
      <section class="card"><h2>موقعه في الهيكل</h2><div class="pf-org">${mgr ? personRow(mgr, 'المدير المباشر') + '<div class="pf-link"></div>' : ''}<div class="prow me">${avatar(e)}<span><b>${esc(e.nameAr)}</b><small>${esc(e.title || '')}</small></span></div>${reports.length ? `<div class="pf-link"></div><div class="small muted">يتبعه مباشرة (${reports.length})</div>${reports.slice(0, 6).map(r => personRow(r)).join('')}${reports.length > 6 ? `<div class="small muted">و${reports.length - 6} آخرين</div>` : ''}` : ''}</div></section>
      ${(edit || self) && missing.length ? `<section class="card"><h2>بيانات ناقصة</h2><div class="pf-missing">${missing.map(k => `<span class="tag">${esc(FIELD_LABELS[k])}</span>`).join('')}</div>${edit ? `<button class="btn sm" style="margin-top:10px" data-act="emp-edit" data-id="${e.id}">استكمال البيانات</button>` : ''}</section>` : ''}
    </aside>
    <div class="pf-content">${t.html}<div class="pf-body">${body}</div></div>
  </div>`;
};
