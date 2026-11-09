'use strict';
/* ============ Roles: built-in + custom, editable labels ============ */
const BASE_ROLES = { ...ROLES }; const BASE_ASSIGNABLE = [...ASSIGNABLE_ROLES];
const ROLE_DESC = { employee: 'كل موظف تلقائيًا: خدمات ذاتية وطلباته', manager: 'يُمنح تلقائيًا لمن يتبعه موظفون في الهيكل', deptManager: 'يُمنح تلقائيًا لمدير الإدارة المسجل في الهيكل التنظيمي', personnel: 'ملفات الموظفين والحضور والخطابات', hrManager: 'إشراف كامل على الموارد البشرية والاعتمادات', adminOfficer: 'طلبات الخدمات والعهد والأصول', payroll: 'الرواتب والسلف والتسويات', recruitment: 'التوظيف والتدريب والتقييم', logistics: 'الشحنات الواردة والتخليص الجمركي', executive: 'لوحات المؤشرات والاطلاع', sysadmin: 'الإعدادات والصلاحيات والنسخ الاحتياطي' };
const AUTO_ROLES = ['employee', 'manager', 'deptManager'];
function syncRoles() {
  const st = SET(); for (const k of Object.keys(ROLES)) delete ROLES[k];
  Object.assign(ROLES, BASE_ROLES, st.roleLabels || {}); (st.customRoles || []).forEach(r => { ROLES[r.key] = r.name; });
  ASSIGNABLE_ROLES.length = 0; ASSIGNABLE_ROLES.push(...BASE_ASSIGNABLE, ...(st.customRoles || []).map(r => r.key));
}
function brandMark() { const l = SET().logo; return l?.id ? `<div class="mark logo"><img src="/_blob/${esc(l.id)}" alt=""></div>` : `<div class="mark">${esc((SET().company || 'و').trim()[0])}</div>`; }

/* ============ Settings hub ============ */
const SETTINGS_SECTIONS = () => [
  ['المنشأة والنظام', [
    ['general', 'building', 'بيانات المنشأة', 'الاسم والشعار ووضع العرض ومدد التنبيه', 'settings.manage'],
    ['integ', 'swap', 'التكاملات', 'SAP والبصمة والبريد وحالتها الفعلية', 'settings.manage'],
    ['audit', 'shield', 'سجل التدقيق', 'كل دخول وتعديل واعتماد وتصدير', 'audit.view'],
    ['backup', 'down', 'النسخ الاحتياطي', 'تنزيل نسخة كاملة واستعادتها بمعاينة الفروقات', 'backup'],
    ['selftest', 'check', 'الفحص الذاتي وسلامة البيانات', 'فحص المراجع والصلاحيات والحماية وإصلاح آمن غير مدمر', 'settings.manage']]],
  ['الهيكل والمستخدمون', [
    ['org', 'users', 'الهيكل التنظيمي', 'الإدارات والأقسام والمواقع ومراكز التكلفة', 'settings.manage'],
    ['users', 'key', 'الموظفون وأدوارهم', 'تعديل أدوار كل موظف ومديره المباشر ونطاقه', 'settings.manage'],
    ['accounts', 'key', LX('أسماء المستخدمين وكلمات المرور', 'Usernames & passwords'), LX('إنشاء حسابات الدخول وإعادة التعيين وفرض تغيير كلمة المرور عند أول دخول', 'Create sign-in accounts, reset them and force a change at first sign-in'), 'settings.manage'],
    ['portal', 'home', LX('بوابة الموظف: الخيارات المفعلة', 'Employee portal: enabled options'), LX('الشاشات والخدمات التي تظهر للموظف ويعمل عليها، للجميع أو لموظف محدد', 'Screens and services employees see and use, for everyone or one employee'), 'settings.manage'],
    ['links', 'users', 'ربط الحسابات بالموظفين', 'من يدخل بأي ملف، وطلبات الربط الجديدة', 'settings.manage'],
    ['scopes', 'shield', 'نطاق البيانات لكل دور', 'الشركة كاملة أو إدارات ومواقع محددة', 'settings.manage'],
    ['roles', 'shield', 'إدارة الأدوار', 'إضافة أدوار جديدة وإعادة تسمية الأدوار', 'settings.manage'],
    ['matrix', 'list', 'مصفوفة الصلاحيات', 'ماذا يستطيع كل دور أن يرى ويفعل', 'settings.manage'],
    ['deleg', 'swap', 'تفويض الاعتمادات', 'تحويل اعتمادات موظف لآخر خلال إجازته', 'settings.workflow']]],
  ['الطلبات والاعتمادات', [
    ['flows', 'chart', 'دورات الاعتماد', 'خط سير الموافقات لكل نوع طلب وتجربته على موظف', 'settings.workflow'],
    ['types', 'file', 'النماذج الإلكترونية', 'تصميم الحقول والمسارات للطلبات والنماذج', 'settings.workflow'],
    ['tpl', 'mail', 'قوالب الخطابات', 'تعريف الراتب وشهادة الخبرة والخطابات', 'settings.workflow'],
    ['leaves', 'calendar', 'أنواع الإجازات', 'الاستحقاقات وطريقة الخصم', 'settings.workflow'],
    ['holidays', 'calendar', LX('الإجازات الرسمية', 'Public holidays'), LX('تُستبعد من أيام العمل في الحضور والإجازات', 'Excluded from working days in attendance and leave'), 'settings.workflow'],
    ['checklist', 'check', LX('قائمة تهيئة الموظف الجديد', 'Onboarding checklist'), LX('المهام التي تُسند تلقائيًا عند تعيين موظف', 'Tasks assigned automatically when hiring'), 'settings.workflow']]],
  ['تخصيص الشاشات والبيانات', [
    ['screens', 'plus', 'إنشاء شاشات إضافية', 'شاشة كاملة جديدة بحقولها، من الصفر أو من قالب جاهز', 'settings.manage'],
    ['cfields', 'list', 'إضافة بنود للشاشات', 'حقول جديدة لملف الموظف والشحنات والأصول وغيرها', 'settings.manage'],
    ['lists', 'list', 'القوائم المنسدلة', 'أنواع العقود وفئات الأصول وبنود التكاليف…', 'settings.manage'],
    ['impfmt', 'up', 'تنسيق ملفات الاستيراد', 'الأعمدة والتنسيق المطلوب لكل ملف Excel ومطابقات الأعمدة المحفوظة', 'settings.manage']]]
];
const secTitle = k => SETTINGS_SECTIONS().flatMap(g => g[1]).find(x => x[0] === k)?.[2] || '';
VIEWS.settings = () => {
  const cur = S.tabs.set; const ok = it => can(it[4]);
  if (!cur || !SETTINGS_SECTIONS().flatMap(g => g[1]).some(it => it[0] === cur && ok(it))) {
    S.tabs.set = null;
    return pageHead('الإعدادات', 'تهيئة المنصة بدون برمجة: الهيكل والأدوار ودورات الاعتماد والشاشات والاستيراد') + SETTINGS_SECTIONS().map(([g, items]) => { const vis = items.filter(ok); return vis.length ? `<section style="margin-bottom:20px"><h2 class="set-grp">${esc(g)}</h2><div class="set-grid">${vis.map(([k, i, t, d]) => `<button class="set-card" data-act="set-open" data-k="${k}"><span class="sic">${ic(i)}</span><span><b>${esc(t)}</b><small>${esc(d)}</small></span></button>`).join('')}</div></section>` : ''; }).join('');
  }
  let body;
  if (cur === 'roles') body = rolesHtml(); else if (cur === 'users') body = usersHtml(); else if (cur === 'deleg') body = delegHtml(); else if (cur === 'flows') body = flowsHtml(); else if (cur === 'general') body = generalHtml(); else if (cur === 'impfmt') body = impFmtHtml(); else if (cur === 'holidays') body = holidaysHtml(); else if (cur === 'checklist') body = checklistHtml(); else if (cur === 'selftest') body = selftestHtml(); else if (cur === 'links') body = linksHtml(); else if (cur === 'accounts') body = accountsHtml(); else if (cur === 'portal') body = portalHtml(); else if (cur === 'scopes') body = scopesHtml(); else if (cur === 'backup') body = backupHtml(); else body = legacySettings(cur);
  if (needsAdminSection(cur) && !S.adminLvl) body = `<div class="note warn" style="margin-bottom:10px">${LEVEL_MSG} يمكنك الاطلاع فقط.</div>` + body;
  return `<div class="row small" style="margin-bottom:8px"><a href="#" data-act="set-open" data-k="">→ كل الإعدادات</a></div>` + pageHead(secTitle(cur), '') + body;
};
ACT['set-open'] = el => { S.tabs.set = el.dataset.k || null; renderView(); window.scrollTo(0, 0); };

/* ---- general ---- */
function generalHtml() {
  const s = SET();
  return `<form class="form card" data-form="general2">${fld('company', 'اسم المنشأة', { value: s.company, required: true })}${fld('contractAlertDays', 'التنبيه قبل انتهاء العقود والوثائق (أيام)', { type: 'number', value: s.contractAlertDays ?? 60, min: 1 })}${fld('defaultSla', 'المدة المستهدفة الافتراضية لكل مرحلة اعتماد (ساعات)', { type: 'number', value: s.defaultSla ?? 48, min: 1 })}
    <div class="fld"><label for="f-logo">شعار المنشأة (PNG أو JPG)</label>${s.logo?.id ? `<div class="row"><img src="/_blob/${esc(s.logo.id)}" alt="الشعار الحالي" style="height:40px;border-radius:6px;background:#fff;padding:2px"><label class="checks small"><input type="checkbox" name="removeLogo"> إزالة الشعار</label></div>` : ''}<input type="file" id="f-logo" name="logo" accept=".png,.jpg,.jpeg,.svg"></div>
    ${fld('demoMode', 'شريط التنبيه أعلى الصفحات', { type: 'checkbox', value: s.demoMode !== false, cbLabel: 'إظهار أن المنصة في مرحلة التجربة' })}<div class="fld full"><button class="btn pri" style="align-self:flex-start">حفظ</button></div></form>`;
}
FORM.general2 = async f => {
  const v = readForm(f); const up = { company: v.company, contractAlertDays: Number(v.contractAlertDays || 60), defaultSla: Number(v.defaultSla || 48), demoMode: !!v.demoMode };
  const files = await uploadFiles(f.elements.logo); if (files.length) up.logo = files[0]; else if (v.removeLogo) up.logo = null;
  await patch('settings', 'main', up); await audit('تعديل بيانات المنشأة', 'settings', 'main', v.company); toast('تم الحفظ'); renderAll(true);
};

/* ---- roles ---- */
function rolesHtml() {
  const holders = r => D.employees.list.filter(e => e.status !== 'terminated' && rolesOf(e).has(r)).length;
  const custom = (SET().customRoles || []).map(r => r.key); const m = MATRIX();
  return `<div class="note" style="margin-bottom:10px">الدور يحدد ما يراه الموظف وما يعتمده. أضف دورًا جديدًا (مثل: مشرف السلامة، مسؤول الحركة) ثم حدد صلاحياته من مصفوفة الصلاحيات، واستخدمه في دورات الاعتماد والشاشات الإضافية.</div>` +
    dataTable('roles', [{ k: 'name', l: 'الدور', v: x => `<b>${esc(x.name)}</b>${x.base && x.name !== BASE_ROLES[x.key] ? `<div class="small muted">الاسم الأصلي: ${esc(BASE_ROLES[x.key])}</div>` : ''}` }, { k: 'desc', l: 'الوصف', v: x => esc(x.desc) }, { k: 'kind', l: 'النوع', v: x => AUTO_ROLES.includes(x.key) ? badge('pending', 'تلقائي من الهيكل') : x.base ? badge('', 'أساسي') : badge('approved', 'مضاف') }, { k: 'n', l: 'عدد الموظفين', v: x => `<span class="num">${x.n}</span>` }, { k: 'p', l: 'الصلاحيات', v: x => `<span class="num">${(m[x.key] || []).length}</span>` }, { k: 'x', l: '', nosort: true, v: x => `<div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm" data-act="role-edit" data-k="${x.key}">تعديل</button>${!x.base ? `<button class="btn sm ghost danger" data-act="role-del" data-k="${x.key}">حذف</button>` : ''}</div>` }],
      Object.keys(ROLES).map(k => ({ id: k, key: k, name: ROLES[k], desc: (SET().customRoles || []).find(r => r.key === k)?.desc || ROLE_DESC[k] || '', base: !custom.includes(k), n: holders(k) })), { search: false, tools: `<button class="btn sm pri" data-act="role-edit">${ic('plus')} دور جديد</button><button class="btn sm" data-act="set-open" data-k="matrix">مصفوفة الصلاحيات</button>` });
}
ACT['role-edit'] = el => {
  const k = el.dataset.k; const isNew = !k; const cr = (SET().customRoles || []).find(r => r.key === k);
  const perms = isNew ? [] : (MATRIX()[k] || []);
  openModal(isNew ? 'دور جديد' : 'تعديل دور: ' + ROLES[k], `<form class="form" id="rolef" data-form="role" ${k ? `data-k="${k}"` : ''}>${fld('name', 'اسم الدور', { value: isNew ? '' : ROLES[k], required: true })}${fld('desc', 'وصف مختصر', { value: cr?.desc || ROLE_DESC[k] || '', full: true })}
    ${fld('perms', 'الصلاحيات', { type: 'checks', options: Object.entries(PERMS), value: perms, full: true })}</form>${AUTO_ROLES.includes(k) ? '<div class="note small">هذا الدور يُمنح تلقائيًا من الهيكل التنظيمي، ويمكن تغيير اسمه وصلاحياته فقط.</div>' : ''}`, `<button class="btn pri" form="rolef">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
};
FORM.role = async f => {
  const v = readForm(f); let k = f.dataset.k; const st = SET(); const custom = [...(st.customRoles || [])]; const labels = { ...(st.roleLabels || {}) };
  if (Object.entries(ROLES).some(([kk, n]) => n === v.name && kk !== k)) return toast('يوجد دور بنفس الاسم', true);
  if (!k) { k = 'r' + Date.now().toString(36); custom.push({ key: k, name: v.name, desc: v.desc }); }
  else if (custom.some(r => r.key === k)) { const r = custom.find(r => r.key === k); r.name = v.name; r.desc = v.desc; }
  else { if (v.name === BASE_ROLES[k]) delete labels[k]; else labels[k] = v.name; }
  const matrix = { ...MATRIX(), [k]: v.perms || [] };
  if (k === 'sysadmin' && !matrix.sysadmin.includes('settings.manage')) return toast('يجب أن يحتفظ مدير النظام بصلاحية الإعدادات', true);
  await patch('settings', 'main', { customRoles: custom, roleLabels: labels, matrix, matrixPerms: Object.keys(PERMS) }); await audit('تعديل دور وصلاحياته', 'settings', k, `${v.name}: ${(v.perms || []).length} صلاحية`); closeModal(); toast('حُفظ الدور');
};
ACT['role-del'] = el => { const k = el.dataset.k; const n = D.employees.list.filter(e => (e.roles || []).includes(k)).length; if (n) return toast(`الدور مسند إلى ${n} موظف. أزله منهم أولًا`, true); confirmBox(`حذف الدور «${esc(ROLES[k])}»؟`, async () => { const m = { ...MATRIX() }; delete m[k]; await patch('settings', 'main', { customRoles: (SET().customRoles || []).filter(r => r.key !== k), matrix: m }); await audit('حذف دور', 'settings', k, ROLES[k]); toast('حُذف الدور'); }, 'حذف'); };

/* ---- employees & their roles ---- */
function usersHtml() {
  const f = S.f.usrRole || '';
  let rows = D.employees.list.filter(e => e.status !== 'terminated'); if (f) rows = rows.filter(e => rolesOf(e).has(f));
  return `<div class="note" style="margin-bottom:10px">المدير المباشر يحدد من يعتمد طلبات الموظف في مرحلة «المدير المباشر». دورا «المدير المباشر» و«مدير الإدارة» يُمنحان تلقائيًا من الهيكل. كل تغيير يُسجل في سجل التغييرات وسجل التدقيق.</div>` +
    dataTable('users', [{ k: 'empNo', l: 'الرقم', v: e => `<span class="num">${esc(e.empNo)}</span>` }, { k: 'nameAr', l: 'الموظف', v: e => `<b>${esc(e.nameAr)}</b><div class="small muted">${esc(e.title || '')}</div>` }, { k: 'dept', l: 'الإدارة', s: e => unitName(e.deptId), v: e => esc(unitName(e.deptId)) }, { k: 'mgr', l: 'المدير المباشر', s: e => empName(e.managerId), v: e => e.managerId ? esc(empName(e.managerId)) : '<span class="badge b-warn">بدون مدير</span>' }, { k: 'roles', l: 'الأدوار', s: e => [...rolesOf(e)].join(), v: e => [...rolesOf(e)].filter(r => r !== 'employee').map(r => `<span class="tag">${esc(ROLES[r])}</span>`).join('') || '<span class="muted small">موظف فقط</span>' }, { k: 'x', l: '', nosort: true, v: e => `<button class="btn sm" data-act="user-access" data-id="${e.id}">تعديل الأدوار والمدير</button>` }], rows.sort(by('empNo')),
      { tools: `<select data-fv="usrRole" aria-label="تصفية بالدور"><option value="">كل الأدوار</option>${Object.keys(ROLES).filter(r => r !== 'employee').map(r => `<option value="${r}" ${f === r ? 'selected' : ''}>${esc(ROLES[r])}</option>`).join('')}</select>` });
}
ACT['user-access'] = el => {
  const e = emp(el.dataset.id); const sub = teamIds(e.id);
  openModal('أدوار ومدير: ' + e.nameAr, `<form class="form" id="uaf" data-form="useraccess" data-id="${e.id}">${fld('managerId', 'المدير المباشر', { type: 'select', value: e.managerId, options: D.employees.list.filter(x => x.id !== e.id && !sub.has(x.id) && x.status !== 'terminated').sort(by('nameAr')).map(x => [x.id, x.nameAr + ' — ' + (x.title || '')]) })}
    ${fld('roles', 'الأدوار المسندة', { type: 'checks', options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]), value: e.roles || [], full: true })}
    <div class="full small muted">أدوار تلقائية حاليًا: ${[...rolesOf(e)].filter(r => AUTO_ROLES.includes(r)).map(r => ROLES[r]).join('، ')}</div>
    <div class="full"><h3 style="margin:6px 0 2px">استثناءات النطاق لهذا الموظف <span class="small muted">(اختياري)</span></h3><div class="small muted">تُطبق على صلاحيات العرض الشاملة لديه. إذا حددت وحدات هنا تحل محل نطاق أدواره.</div></div>
    ${fld('scopeUnits', 'يقتصر نطاقه على الوحدات', { type: 'checks', options: D.orgunits.list.filter(u => u.type !== 'costcenter').sort(by('name')).map(u => [u.id, u.name]), value: e.scopeUnits || [], full: true })}
    ${fld('scopeEmpIds', 'موظفون إضافيون يراهم', { type: 'checks', options: D.employees.list.filter(x => x.id !== e.id && x.status !== 'terminated').sort(by('nameAr')).map(x => [x.id, x.nameAr]), value: e.scopeEmpIds || [], full: true })}
    ${fld('excludeEmpIds', 'موظفون يُحجبون عنه', { type: 'checks', options: D.employees.list.filter(x => x.id !== e.id && x.status !== 'terminated').sort(by('nameAr')).map(x => [x.id, x.nameAr]), value: e.excludeEmpIds || [], full: true })}
    ${fld('reason', 'سبب التغيير', { required: true, full: true })}</form>`, `<button class="btn pri" form="uaf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
};
FORM.useraccess = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); const roles = v.roles || []; const at = nowISO();
  if (e.id === S.meId && (e.roles || []).includes('sysadmin') && !roles.includes('sysadmin') && !D.employees.list.some(x => x.id !== e.id && (x.roles || []).includes('sysadmin') && x.status !== 'terminated')) return toast('لا يمكن إزالة آخر مدير نظام', true);
  if (v.managerId && teamIds(e.id).has(v.managerId)) return toast('لا يمكن أن يكون المدير من ضمن فريق الموظف نفسه', true);
  const changes = []; if (JSON.stringify((e.roles || []).slice().sort()) !== JSON.stringify(roles.slice().sort())) changes.push(['roles', e.roles || [], roles]); if ((e.managerId || '') !== (v.managerId || '')) changes.push(['managerId', e.managerId || '', v.managerId || null]);
  for (const k of ['scopeUnits', 'scopeEmpIds', 'excludeEmpIds']) if (!sameJ((e[k] || []).slice().sort(), (v[k] || []).slice().sort())) changes.push([k, e[k] || [], v[k] || []]);
  if (!changes.length) { closeModal(); return toast('لا توجد تغييرات'); }
  await put('employees', e.id, { ...strip(e), roles, managerId: v.managerId || null, scopeUnits: v.scopeUnits || [], scopeEmpIds: v.scopeEmpIds || [], excludeEmpIds: v.excludeEmpIds || [], updatedAt: at });
  for (const [k, o, n] of changes) await put('emphistory', newId(), { empId: e.id, kind: 'data', field: k, old: o, new: n, reason: v.reason, byId: S.meId, at });
  await audit('تغيير صلاحيات/مدير', 'employee', e.id, `${e.nameAr}: ${changes.map(c => c[0] === 'roles' ? 'الأدوار: ' + roles.map(r => ROLES[r]).join('، ') : c[0] === 'managerId' ? 'المدير: ' + empName(v.managerId) : 'النطاق (' + c[0] + '): ' + (c[2].length ? c[2].map(x => unitName(x) !== '—' ? unitName(x) : empName(x)).join('، ') : 'بدون')).join(' — ')} — ${v.reason}`);
  closeModal(); toast('تم الحفظ');
};

/* ---- delegation of approvals ---- */
const delegations = () => SET().delegations || [];
function delegHtml() {
  const T = todayISO(); const st = d => d.to < T ? badge('cancelled', 'منتهٍ') : d.from > T ? badge('pending', 'قادم') : badge('approved', 'ساري الآن');
  return `<div class="note" style="margin-bottom:10px">خلال فترة التفويض تصل الطلبات التي بانتظار الموظف المفوِّض إلى المفوَّض إليه أيضًا، ويستطيع أيهما اعتمادها. يُسجل اسم من اعتمد فعليًا.</div>` +
    dataTable('deleg', [{ k: 'from', l: 'المفوِّض', s: d => empName(d.fromId), v: d => esc(empName(d.fromId)) }, { k: 'to', l: 'المفوَّض إليه', s: d => empName(d.toId), v: d => esc(empName(d.toId)) }, { k: 'p', l: 'الفترة', s: d => d.from, v: d => `<span class="num">${fmtD(d.from)} ← ${fmtD(d.to)}</span>` }, { k: 'note', l: 'السبب' }, { k: 's', l: 'الحالة', nosort: true, v: st }, { k: 'x', l: '', nosort: true, v: d => `<button class="btn sm ghost danger" data-act="deleg-del" data-id="${d.id}">إلغاء</button>` }], delegations().slice().reverse(), { search: false, tools: `<button class="btn sm pri" data-act="deleg-new">${ic('plus')} تفويض جديد</button>` });
}
ACT['deleg-new'] = () => { const opts = D.employees.list.filter(e => e.status !== 'terminated').sort(by('nameAr')).map(e => [e.id, e.nameAr + ' — ' + (e.title || '')]); openModal('تفويض اعتمادات', `<form class="form" id="dgf" data-form="deleg">${fld('fromId', 'المفوِّض (صاحب الصلاحية)', { type: 'select', required: true, options: opts })}${fld('toId', 'المفوَّض إليه', { type: 'select', required: true, options: opts })}${fld('from', 'من تاريخ', { type: 'date', value: todayISO(), required: true })}${fld('to', 'إلى تاريخ', { type: 'date', required: true })}${fld('note', 'السبب', { full: true, ph: 'إجازة سنوية، انتداب…' })}</form>`, `<button class="btn pri" form="dgf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.deleg = async f => { const v = readForm(f); if (v.fromId === v.toId) return toast('لا يمكن التفويض لنفس الشخص', true); if (v.to < v.from) return toast('تاريخ النهاية قبل البداية', true); const d = { id: newId(), ...v, byId: S.meId, at: nowISO() }; await patch('settings', 'main', { delegations: [...delegations(), d] }); await notify([v.toId], 'فُوّضت إليك اعتمادات', `نيابة عن ${empName(v.fromId)} من ${fmtD(v.from)} إلى ${fmtD(v.to)}`, { view: 'inbox' }); await audit('تفويض اعتمادات', 'settings', d.id, `${empName(v.fromId)} ← ${empName(v.toId)} (${v.from} - ${v.to})`); closeModal(); toast('تم التفويض'); };
ACT['deleg-del'] = el => confirmBox('إلغاء هذا التفويض؟', async () => { const d = delegations().find(x => x.id === el.dataset.id); await patch('settings', 'main', { delegations: delegations().filter(x => x.id !== d.id) }); await audit('إلغاء تفويض', 'settings', d.id, `${empName(d.fromId)} ← ${empName(d.toId)}`); toast('أُلغي التفويض'); }, 'إلغاء التفويض');

/* ---- approval cycles ---- */
function flowsHtml() {
  const who = S.f.flowEmp || ''; const ts = D.requestTypes.list.slice().sort(by('order'));
  return `<div class="toolbar"><label class="small">جرّب الدورة على موظف: <select data-fv="flowEmp" aria-label="الموظف"><option value="">— بدون —</option>${D.employees.list.filter(e => e.status !== 'terminated').sort(by('nameAr')).map(e => `<option value="${e.id}" ${who === e.id ? 'selected' : ''}>${esc(e.nameAr)}</option>`).join('')}</select></label><span class="small muted">اختيار موظف يعرض الأسماء الفعلية التي سيمر عليها طلبه</span><button class="btn sm pri" data-act="dz-open">${ic('plus')} نموذج جديد بدورة اعتماد</button></div>
  <div class="flows-list">${ts.map(t => `<section class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><div><b>${esc(t.name)}</b> <span class="small muted">${esc(CATS[t.category] || '')}</span> ${t.active === false ? badge('cancelled', 'معطل') : ''}</div><div class="row" style="gap:4px"><button class="btn sm" data-act="flow-edit" data-id="${t.id}">${ic('chart')} تعديل الدورة</button><button class="btn sm ghost" data-act="dz-open" data-id="${t.id}">الحقول</button></div></div>${flowTrack(typeSteps(t, who || null), { compact: true })}</section>`).join('') || empty('لا توجد أنواع طلبات')}</div>`;
}
ACT['flow-edit'] = el => { openDesigner('type', el.dataset.id); S.dz.tab = 'flow'; renderView(); };

/* ---- import formats ---- */
function impFmtHtml() {
  const maps = SET().importMaps || {}; const kinds = [...Object.keys(IMPORT_ROLES), ...screens().map(s => 'cs_' + s.id)];
  return `<div class="note" style="margin-bottom:10px">هذا هو التنسيق الذي يقبله النظام لكل ملف. يمكنك استخدام القالب الجاهز، أو رفع ملفك الحالي ومطابقة أعمدته مرة واحدة. تُحفظ المطابقة وتُطبق تلقائيًا في المرات القادمة. الصيغ المقبولة: ‎.xlsx و‎.xls و‎.csv.</div>` + kinds.map(k => {
    if (k.startsWith('cs_')) { const s = scr(k.slice(3)); IMPORTS[k] = screenImportDef(s); }
    const def = IMPORTS[k]; const m = maps[k];
    return `<section class="card" style="margin-bottom:14px"><h2>${esc(def.title)} <span class="row" style="gap:4px"><button class="btn sm" data-act="impfmt-tpl" data-k="${k}">${ic('down')} تنزيل القالب</button>${m ? `<button class="btn sm ghost" data-act="impmap-clear" data-k="${k}">مسح المطابقة المحفوظة</button>` : ''}</span></h2>${specTable(k)}${m ? `<div class="small" style="margin-top:8px"><b>مطابقة محفوظة:</b> ${Object.entries(m).filter(([, h]) => h).map(([kk, h]) => `${esc(def.cols.find(c => c[0] === kk)?.[1] || kk)} ← «${esc(h)}»`).join(' · ')}</div>` : ''}</section>`;
  }).join('');
}
ACT['impfmt-tpl'] = el => templateFor(el.dataset.k);
ACT['impmap-clear'] = async el => { const m = { ...(SET().importMaps || {}) }; delete m[el.dataset.k]; await patch('settings', 'main', { importMaps: m }); toast('مُسحت المطابقة'); };

/* ---- custom screen templates ---- */
const F2 = (label, type, extra = {}) => ({ key: 'f' + Math.random().toString(36).slice(2, 7), label, type, required: false, ...extra });
const SCREEN_TEMPLATES = [
  { name: 'سجل المخالفات المرورية', icon: 'alert', group: 'الخدمات', prefix: 'VIO', description: 'مخالفات سيارات الشركة والسائقين وسدادها', fields: () => [F2('السائق', 'employee', { required: true }), F2('رقم اللوحة', 'text', { required: true }), F2('تاريخ المخالفة', 'date', { required: true }), F2('نوع المخالفة', 'text'), F2('المبلغ (ر.س)', 'number', { min: 0 }), F2('الحالة', 'select', { options: 'غير مسددة، مسددة من الشركة، مخصومة من الموظف، معترض عليها' })] },
  { name: 'متابعة الإقامات والتأشيرات', icon: 'calendar', group: 'الموارد البشرية', prefix: 'IQM', description: 'تجديد الإقامات وتأشيرات الخروج والعودة', fields: () => [F2('الموظف', 'employee', { required: true }), F2('نوع المعاملة', 'select', { required: true, options: 'تجديد إقامة، خروج وعودة، خروج نهائي، نقل كفالة، تعديل مهنة' }), F2('تاريخ الطلب', 'date'), F2('تاريخ الانتهاء', 'date'), F2('الرسوم (ر.س)', 'number', { min: 0 }), F2('الحالة', 'select', { options: 'جديد، قيد الإجراء، منجز، ملغى' }), F2('ملاحظات', 'textarea')] },
  { name: 'سجل إصابات وحوادث العمل', icon: 'shield', group: 'الخدمات', prefix: 'INC', description: 'تسجيل الحوادث وإصابات العمل وإجراءاتها', fields: () => [F2('بيانات الحادث', 'section'), F2('التاريخ', 'date', { required: true }), F2('الوقت', 'time'), F2('الموقع', 'select', { options: 'فرع مكة، فرع عسفان، الإدارة العامة، خارج الموقع' }), F2('الموظف المصاب', 'employee'), F2('وصف الحادث', 'textarea', { required: true }), F2('الإجراءات', 'section'), F2('درجة الخطورة', 'radio', { options: 'بسيطة، متوسطة، جسيمة' }), F2('الإجراء التصحيحي', 'textarea'), F2('تم إبلاغ التأمينات الاجتماعية', 'checkbox', { hint: 'نعم' })] },
  { name: 'سجل الزوار', icon: 'users', group: 'الخدمات', prefix: 'VIS', description: 'زوار المصنع والمكاتب', fields: () => [F2('اسم الزائر', 'text', { required: true }), F2('الجهة', 'text'), F2('الجوال', 'tel'), F2('المضيف', 'employee', { required: true }), F2('التاريخ', 'date', { required: true }), F2('وقت الدخول', 'time'), F2('وقت الخروج', 'time'), F2('الغرض', 'text')] },
  { name: 'سجل سيارات الشركة', icon: 'box', group: 'الخدمات', prefix: 'CAR', description: 'بيانات السيارات والاستمارات والتأمين', fields: () => [F2('رقم اللوحة', 'text', { required: true }), F2('النوع والموديل', 'text'), F2('السائق المسؤول', 'employee'), F2('انتهاء الاستمارة', 'date'), F2('انتهاء التأمين', 'date'), F2('انتهاء الفحص الدوري', 'date'), F2('الحالة', 'select', { options: 'في الخدمة، في الصيانة، خارج الخدمة' })] }
];
ACT['cs-tpl'] = el => { const tp = SCREEN_TEMPLATES[+el.dataset.i]; openDesigner('screen'); Object.assign(S.dz.t, { name: tp.name, icon: tp.icon, group: tp.group, prefix: tp.prefix, description: tp.description, fields: tp.fields().map(f => ({ ...f, _id: newId() })) }); S.dz.sel = 0; S.dz.dirty = true; renderView(); toast('عدّل القالب كما تريد ثم اضغط «حفظ ونشر»'); };
