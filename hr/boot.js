'use strict';
/* ============ boot, login, events ============ */
let shellFor = null;
function renderAll(force) {
  if (S.ready) syncRoles();
  if (!S.ready) return;
  if (!D.employees.list.length) return renderSetup();
  if (!IS_STAGING) resolveIdentity();
  maybeMigrateAccess();
  if (!S.meId || !emp(S.meId) || emp(S.meId).status === 'terminated') return IS_STAGING ? renderLogin() : renderUnlinked();
  if (!IS_STAGING && authGate()) { shellFor = null; return; }
  if (force || shellFor !== S.meId || !$('#view')) { renderShell(); shellFor = S.meId; }
  else { const b = $('.bell'); const n = D.notifications.list.filter(x => x.to === S.meId && !x.read).length + computedAlerts().length; if (b) b.innerHTML = ic('bell') + (n ? `<span class="dot">${n > 99 ? '99+' : n}</span>` : ''); }
  renderView();
  runEscalations();
}
function renderSetup() {
  shellFor = null;
  $('#root').innerHTML = `<div class="login"><div class="card"><div class="row" style="justify-content:flex-end;margin-bottom:-8px">${langBtn()}</div><div class="brand" style="border:0;padding:0;margin:0"><div class="mark">و</div><div><b>تهيئة المنصة</b><span class="muted">قاعدة البيانات فارغة</span></div></div>
  <h1>إنشاء أول مدير للنظام</h1><p class="small muted">أنشئ حساب مدير النظام ثم أكمل الهيكل التنظيمي وأنواع الطلبات من الإعدادات.</p>
  ${S.canWrite ? `<form class="form" data-form="setup">${fld('company', 'اسم المنشأة', { required: true })}${fld('empNo', 'الرقم الوظيفي', { required: true })}${fld('nameAr', 'اسمك', { required: true, full: true })}<div class="fld full"><button class="btn pri">إنشاء</button></div></form>` : `<div class="note warn">لا تملك صلاحية الكتابة على قاعدة البيانات. اطلب من مالك الصفحة منحك صلاحية «مساهم».</div>`}</div></div>`;
}
function renderLogin() {
  shellFor = null; closeModal(); S.dz = null;
  const list = D.employees.list.filter(e => e.status !== 'terminated').sort(by('empNo'));
  $('#root').innerHTML = `<div class="login"><div class="card"><div class="row" style="justify-content:flex-end;margin-bottom:-8px">${langBtn()}</div><div class="brand" style="border:0;padding:0;margin:0">${brandMark()}<div><b>${esc(SET().company || 'منصة الموارد البشرية')}</b><span class="muted">الموارد البشرية والشؤون الإدارية</span></div></div>
  <h1>تسجيل الدخول</h1>
  <div class="note warn small" style="margin-bottom:12px">بيئة الاختبار: اختر الموظف الذي تريد الدخول بهويته لتجربة صلاحياته. في بيئة التشغيل يدخل كل شخص تلقائيًا بملفه المربوط بحسابه، ولا يمكن اختيار هوية شخص آخر.</div>
  <form class="form" data-form="login"><div class="fld full"><label for="f-who">الموظف</label><select id="f-who" name="who" required>${list.map(e => `<option value="${e.id}" ${e.id === S.meId ? 'selected' : ''}>${esc(e.nameAr)} — ${esc(e.empNo)} — ${esc([...rolesOf(e)].filter(r => r !== 'employee').map(r => ROLES[r]).join('، ') || ROLES.employee)}</option>`).join('')}</select></div><div class="fld full"><button class="btn pri">دخول</button></div></form></div></div>`;
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'modal-bg' && e.target !== el) return;
  if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
  const fn = ACT[el.dataset.act]; if (fn) guard(() => fn(el, e));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal();
  if (e.key === 'Enter' && e.target.matches('tr.click')) e.target.click();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.q) { S.q[t.dataset.q] = t.value; clearTimeout(S.qt); S.qt = setTimeout(renderView, 160); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.f) { S.f[t.dataset.f] = t.value; renderView(); }
  else if (t.dataset.ff) { S.f[t.dataset.ff] = { ...(S.f[t.dataset.ff] || {}), [t.dataset.k]: t.value }; renderView(); }
  else if (t.dataset.fv) { S.f[t.dataset.fv] = t.value; renderView(); }
  else if (t.dataset.fc) { S.f[t.dataset.fc] = t.checked; renderView(); }
  else if (t.dataset.actChange && t.value) { const fn = ACT[t.dataset.actChange]; if (fn) guard(() => fn(t)); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
  const fn = FORM[f.dataset.form]; if (!fn) return;
  const btn = f.querySelector('button:not([type=button])') || (f.id && $(`[form="${f.id}"]`));
  if (btn?.disabled) return; if (btn) btn.disabled = true;
  guard(() => fn(f)).finally(() => { if (btn && document.body.contains(btn)) btn.disabled = false; });
});

/* ---- navigation & common ---- */
ACT.go = el => go(el.dataset.v, el.dataset.id ? { id: el.dataset.id } : {});
ACT['open-emp'] = el => go('employee', { id: el.dataset.id });
ACT.drawer = () => { $('#side').classList.toggle('open'); $('#drawer-bg').classList.toggle('open'); };
ACT.tab = el => { S.tabs[el.dataset.g] = el.dataset.k; renderView(); };
ACT.sort = el => { const c = S.sort[el.dataset.t]; S.sort[el.dataset.t] = { k: el.dataset.k, d: c?.k === el.dataset.k ? -c.d : 1 }; renderView(); };
ACT['close-modal'] = closeModal; ACT['modal-bg'] = closeModal;
ACT['confirm-yes'] = async () => { const f = S.confirmFn; S.confirmFn = null; closeModal(); if (f) await f(); };
ACT['switch-user'] = async () => { await audit('تسجيل خروج', 'session', S.meId, empName(S.meId)); S.meId = null; S.escalated = false; try { localStorage.removeItem('hr.me'); } catch (e) { } renderAll(true); };
ACT['open-req'] = el => openRequest(el.dataset.id);
ACT['new-req'] = el => openRequestForm(el.dataset.id);
ACT['new-req-effect'] = el => { const t = D.requestTypes.list.find(x => x.effect === el.dataset.e && x.active !== false); if (!t) return toast('لا يوجد نوع طلب مفعّل لهذه الخدمة', true); openRequestForm(t.id); };
ACT['open-note'] = async el => { const n = D.notifications.map[el.dataset.id]; if (!n) return; if (!n.read) patch('notifications', n.id, { read: true }); if (n.link?.view === 'request') openRequest(n.link.id); else if (n.link) go(n.link.view, { id: n.link.id }); };
ACT['notes-read'] = async () => { for (const n of D.notifications.list.filter(n => n.to === S.meId && !n.read)) await patch('notifications', n.id, { read: true }); };
ACT['open-form'] = el => openFormDoc(el.dataset.id);

/* ---- requests ---- */
ACT['req-do'] = async el => {
  const a = el.dataset.a; const c = $('#act-comment')?.value || '';
  $$('[data-act="req-do"]').forEach(b => b.disabled = true);
  try { await actOnRequest(el.dataset.id, a, c); toast({ approve: 'تم الاعتماد', reject: 'تم الرفض', return: 'أُعيد الطلب لمقدمه' }[a]); closeModal(); }
  catch (e) { $$('[data-act="req-do"]').forEach(b => b.disabled = false); throw e; }
};
ACT['req-edit'] = el => { const r = D.requests.map[el.dataset.id]; openRequestForm(r.typeId, r.id); };
ACT['req-cancel'] = el => confirmBox('هل تريد إلغاء هذا الطلب؟ لا يمكن التراجع.', async () => { await cancelRequest(el.dataset.id); toast('أُلغي الطلب'); }, 'إلغاء الطلب');
ACT['dl-letter'] = el => { const r = D.requests.map[el.dataset.id]; saveFile(`${r.ref}.html`, letterHtml(r.output.title, r.output.body, r.ref), 'text/html;charset=utf-8'); };
function letterHtml(title, body, ref) { return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${esc(title)}</title><body style="font-family:Tajawal,Arial,sans-serif;max-width:720px;margin:40px auto;line-height:2;font-size:16px"><p style="text-align:left;color:#555">${esc(ref || '')}<br>${fmtD(todayISO())}</p><h2 style="text-align:center">${esc(title)}</h2><div style="white-space:pre-wrap">${esc(body)}</div></body></html>`; }
FORM.gsearch = f => { const q = f.elements.q.value.trim(); if (q) go('search', { gq: q }); };
FORM.request = f => submitRequestForm(f);
FORM['req-assign'] = async f => {
  const id = f.dataset.id; const v = readForm(f); const r = clone(D.requests.map[id]);
  r.assignedTo = v.assignedTo || null; r.targetDate = v.targetDate || null; r.priority = v.priority; r.history.push({ byId: S.meId, action: 'assign', at: nowISO(), comment: `المسؤول: ${empName(v.assignedTo)} — الموعد: ${fmtD(v.targetDate)}` });
  await put('requests', id, strip(r)); await audit('تحديث متابعة طلب إداري', 'request', id, r.ref);
  if (v.assignedTo && v.assignedTo !== S.meId) await notify([v.assignedTo], 'أُسند إليك طلب', `${r.typeName} (${r.ref})`, { view: 'request', id });
  toast('تم حفظ المتابعة'); openRequest(id);
};

/* ---- setup & login ---- */
FORM.setup = async f => {
  const v = readForm(f); const id = newId(); const at = nowISO();
  await put('settings', 'main', { ...strip(D.settings.map.main || {}), company: v.company, contractAlertDays: 60, defaultSla: 48, leaveCountMode: 'calendar', weekend: [5, 6], graceMin: 15, otThresholdMin: 30, demoMode: false, accessMigrated: true, createdAt: at });
  await put('employees', id, { empNo: v.empNo, nameAr: v.nameAr, status: 'active', roles: ['sysadmin', 'hrManager'], userId: IS_STAGING ? null : S.uid, docs: [], createdAt: at });
  S.meId = id; try { localStorage.setItem('hr.me', id); } catch (e) { }
  await audit('تهيئة النظام', 'system', null, v.company);
};
FORM.login = async f => {
  const id = f.elements.who.value; if (!emp(id)) return;
  S.meId = id; S.escalated = false; try { localStorage.setItem('hr.me', id); } catch (e) { }
  await audit('تسجيل دخول', 'session', id, empName(id)); renderAll(true);
};

/* ---- employees ---- */
ACT['emp-edit'] = el => openEmpEdit(el.dataset.id);
FORM.emp = saveEmp;
ACT['export-emps'] = () => {
  const rows = D.employees.list.filter(e => canViewEmp(e.id));
  const keys = ['empNo', 'nameAr', 'nameEn', 'nationality', 'phone', 'email', 'title', 'grade', 'deptId', 'locationId', 'managerId', 'contractType', 'contractStart', 'contractEnd', 'hireDate', 'status', ...(can('emp.view.sensitive') ? ['idNumber', 'idExpiry'] : [])];
  exportRows(`employees-${todayISO()}`, [keys.map(k => FIELD_LABELS[k] || k), ...rows.map(e => keys.map(k => ['deptId', 'locationId'].includes(k) ? unitName(e[k]) : k === 'managerId' ? empName(e[k]) : e[k]))]);
};
ACT['import-emps'] = () => openModal('استيراد موظفين من CSV', `<p class="small">الأعمدة بالترتيب: الرقم الوظيفي، الاسم بالعربية، الاسم بالإنجليزية، الجنسية، الجوال، البريد، المسمى، رمز الإدارة، رمز الموقع، الرقم الوظيفي للمدير، نوع العقد، بداية العقد، نهاية العقد، تاريخ التعيين (YYYY-MM-DD). الصف الأول عناوين. الموظف الموجود برقمه الوظيفي لا يُكرر.</p><form data-form="empimport" id="empimp">${fld('file', 'الملف', { type: 'file' })}</form>`, `<button class="btn pri" form="empimp">استيراد</button><button class="btn" data-act="close-modal">إلغاء</button>`);
FORM.empimport = async f => {
  const file = f.elements.file.files[0]; if (!file) return toast('اختر ملفًا', true);
  const rows = parseCSV(await file.text()).slice(1); let added = 0, skipped = 0; const at = nowISO(); const byNo = {};
  const unitByCode = c => D.orgunits.list.find(u => u.code === c || u.name === c)?.id || null;
  for (const r of rows) {
    const [empNo, nameAr, nameEn, nationality, phone, email, title, dept, loc, mgrNo, contractType, cs, ce, hire] = r;
    if (!empNo || !nameAr || D.employees.list.some(e => e.empNo === empNo) || byNo[empNo]) { skipped++; continue; }
    const id = newId(); byNo[empNo] = { id, mgrNo };
    await put('employees', id, { empNo, nameAr, nameEn, nationality, phone, email, title, deptId: unitByCode(dept), locationId: unitByCode(loc), contractType, contractStart: cs, contractEnd: ce, hireDate: hire, status: 'active', roles: [], docs: [], createdAt: at, importedById: S.meId });
    added++;
  }
  for (const [no, { id, mgrNo }] of Object.entries(byNo)) { const m = D.employees.list.find(e => e.empNo === mgrNo)?.id || byNo[mgrNo]?.id; if (m) { await sleep(50); const cur = D.employees.map[id]; if (cur) await put('employees', id, { ...strip(cur), managerId: m }); } }
  await audit('استيراد موظفين', 'employee', null, `أضيف ${added}، تُخطي ${skipped}`); closeModal(); toast(`أضيف ${added} موظف، وتُخطي ${skipped} (مكرر أو ناقص)`);
};
ACT['emp-renew'] = el => { const e = emp(el.dataset.id); openModal('تجديد عقد ' + e.nameAr, `<form class="form" id="renewf" data-form="renew" data-id="${e.id}">${fld('contractStart', 'بداية العقد الجديد', { type: 'date', value: e.contractEnd ? addDays(e.contractEnd, 1) : todayISO(), required: true })}${fld('contractEnd', 'نهاية العقد الجديد', { type: 'date', required: true })}${fld('contractType', 'نوع العقد', { type: 'select', options: LIST('contractTypes'), value: e.contractType })}${fld('reason', 'ملاحظات', { full: true })}</form>`, `<button class="btn pri" form="renewf">حفظ التجديد</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.renew = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); if (v.contractEnd && v.contractEnd < v.contractStart) return toast('نهاية العقد قبل بدايته', true); const at = nowISO();
  await put('employees', e.id, { ...strip(e), contractStart: v.contractStart, contractEnd: v.contractEnd, contractType: v.contractType, updatedAt: at });
  await put('emphistory', newId(), { empId: e.id, kind: 'action', label: 'تجديد عقد', field: 'contractEnd', old: e.contractEnd || '', new: v.contractEnd, reason: v.reason || 'تجديد عقد', byId: S.meId, at });
  await audit('تجديد عقد', 'employee', e.id, `${e.nameAr} حتى ${v.contractEnd}`); closeModal(); toast('تم تجديد العقد');
};
ACT['emp-doc'] = el => openModal('رفع مستند للموظف', `<form class="form" id="docf" data-form="empdoc" data-id="${el.dataset.id}">${fld('kind', 'نوع المستند', { type: 'select', options: LIST('empDocKinds'), required: true })}${fld('expiry', 'تاريخ الانتهاء (إن وجد)', { type: 'date' })}${fld('restricted', 'مقيد', { type: 'checkbox', cbLabel: 'يظهر فقط لمن يملك صلاحية المستندات الحساسة' })}${fld('file', 'الملف', { type: 'file', full: true })}</form>`, `<button class="btn pri" form="docf">رفع</button><button class="btn" data-act="close-modal">إلغاء</button>`);
FORM.empdoc = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); const files = await uploadFiles(f.elements.file); if (!files.length) return toast('اختر ملفًا', true);
  const docs = [...(e.docs || []), ...files.map(x => ({ ...x, kind: v.kind, expiry: v.expiry || null, restricted: !!v.restricted }))];
  await put('employees', e.id, { ...strip(e), docs }); await audit('رفع مستند موظف', 'employee', e.id, `${e.nameAr}: ${v.kind}`); closeModal(); toast('تم رفع المستند');
};
const ACTION_KINDS = { promotion: 'ترقية', transfer: 'نقل', assignment: 'تكليف', titleChange: 'تغيير مسمى', managerChange: 'تغيير المدير المباشر', warning: 'إنذار', penalty: 'جزاء', commendation: 'شكر وتقدير' };
ACT['emp-action'] = el => {
  const e = emp(el.dataset.id); const u = t => D.orgunits.list.filter(x => x.type === t).map(x => [x.id, x.name]);
  openModal('إجراء وظيفي — ' + e.nameAr, `<form class="form" id="actf" data-form="empaction" data-id="${e.id}">${fld('kind', 'نوع الإجراء', { type: 'select', options: Object.entries(ACTION_KINDS), required: true })}${fld('effective', 'تاريخ السريان', { type: 'date', value: todayISO(), required: true })}
  <div class="full small muted">تطبيق على بيانات الوظيفة (اترك الحقل فارغًا إن لم يتغير)</div>${fld('title', 'المسمى الجديد', { value: '' })}${fld('grade', 'المستوى الجديد')}${fld('deptId', 'الإدارة الجديدة', { type: 'select', options: u('dept') })}${fld('locationId', 'الموقع الجديد', { type: 'select', options: u('location') })}${fld('managerId', 'المدير الجديد', { type: 'select', options: D.employees.list.filter(x => x.id !== e.id && x.status !== 'terminated').map(x => [x.id, x.nameAr]) })}
  ${fld('reason', 'التفاصيل والمبرر', { type: 'textarea', required: true, full: true })}</form><div class="small muted">الإنذارات والجزاءات تظهر فقط لمن يملك صلاحية عرضها وللموظف نفسه.</div>`, `<button class="btn pri" form="actf">تسجيل الإجراء</button><button class="btn" data-act="close-modal">إلغاء</button>`);
};
FORM.empaction = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); const at = nowISO(); const upd = {};
  ['title', 'grade', 'deptId', 'locationId', 'managerId'].forEach(k => { if (v[k] && v[k] !== e[k]) upd[k] = v[k]; });
  const disc = ['warning', 'penalty'].includes(v.kind);
  await put('emphistory', newId(), { empId: e.id, kind: 'action', label: ACTION_KINDS[v.kind], field: v.kind, reason: v.reason, effective: v.effective, disciplinary: disc, byId: S.meId, at });
  if (Object.keys(upd).length) {
    await put('employees', e.id, { ...strip(e), ...upd, updatedAt: at });
    for (const k of Object.keys(upd)) await put('emphistory', newId(), { empId: e.id, kind: 'data', field: k, old: e[k] ?? '', new: upd[k], reason: ACTION_KINDS[v.kind] + ' — ' + v.reason, byId: S.meId, at });
  }
  await audit('إجراء وظيفي: ' + ACTION_KINDS[v.kind], 'employee', e.id, e.nameAr); closeModal(); toast('تم تسجيل الإجراء');
};
ACT['emp-letter'] = el => { const e = emp(el.dataset.id); openModal('إصدار خطاب — ' + e.nameAr, `<form class="form" id="letf" data-form="empletter" data-id="${e.id}">${fld('tpl', 'القالب', { type: 'select', options: D.templates.list.map(t => [t.id, t.name]), required: true })}${fld('addressee', 'موجه إلى', { value: 'من يهمه الأمر' })}${fld('purpose', 'الغرض', { full: true })}</form>`, `<button class="btn pri" form="letf">إصدار</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.empletter = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); const t = D.templates.map[v.tpl]; if (!t) return;
  const ref = await nextRef('LTR'); const body = fillTemplate(t.body, e, { ref, addressee: v.addressee, purpose: v.purpose });
  await put('emphistory', newId(), { empId: e.id, kind: 'letter', label: 'خطاب: ' + t.name, field: 'letter', reason: `${ref} — ${v.addressee || ''}`, byId: S.meId, at: nowISO(), sensitive: /\{\{(basic|total)\}\}/.test(t.body) });
  await audit('إصدار خطاب', 'employee', e.id, `${ref} ${t.name}`);
  openModal(t.name, `<div class="pre">${esc(body)}</div>${body.includes('غير متوفر') ? '<div class="note warn">بعض البيانات غير متوفرة في ملف الموظف وتظهر بين أقواس. أكملها قبل التسليم.</div>' : ''}`, `<button class="btn pri" data-act="dl-text" data-ref="${ref}">${ic('down')} تنزيل</button><button class="btn" data-act="close-modal">إغلاق</button>`);
  S.lastLetter = { title: t.name, body, ref };
};
ACT['dl-text'] = () => { const l = S.lastLetter; if (l) saveFile(`${l.ref}.html`, letterHtml(l.title, l.body, l.ref), 'text/html;charset=utf-8'); };
ACT['emp-terminate'] = el => { const e = emp(el.dataset.id); openModal('بدء إنهاء خدمة — ' + e.nameAr, `<form class="form" id="termf" data-form="terminate" data-id="${e.id}">${fld('lastDay', 'آخر يوم عمل', { type: 'date', required: true })}${fld('exitType', 'السبب', { type: 'select', required: true, options: LIST('exitTypes') })}${fld('reason', 'التفاصيل', { type: 'textarea', full: true, required: true })}</form><div class="note">ستبدأ إجراءات إخلاء الطرف متعددة الجهات، ولا يُغلق الملف نهائيًا إلا بعد اكتمالها.</div>`, `<button class="btn danger" form="termf">بدء الإجراء</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.terminate = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); const at = nowISO();
  await put('employees', e.id, { ...strip(e), status: 'terminating', lastDay: v.lastDay, exitReason: v.exitType + ' — ' + v.reason, clearance: {}, updatedAt: at });
  await put('emphistory', newId(), { empId: e.id, kind: 'action', label: 'بدء إنهاء خدمة', field: 'status', old: e.status, new: 'terminating', reason: v.exitType + ' — ' + v.reason, byId: S.meId, at });
  const signers = clearanceDepts().flatMap(([k, , role]) => role === 'manager' ? [e.managerId] : D.employees.list.filter(x => rolesOf(x).has(role)).map(x => x.id));
  await notify(signers, 'إخلاء طرف مطلوب', `${e.nameAr} — آخر يوم ${fmtD(v.lastDay)}`, { view: 'employee', id: e.id });
  await audit('بدء إنهاء خدمة', 'employee', e.id, e.nameAr); closeModal(); toast('بدأت إجراءات إنهاء الخدمة');
};
ACT['clear-sign'] = el => openModal('توقيع إخلاء الطرف', `<form class="form" id="clrf" data-form="clearsign" data-id="${el.dataset.id}" data-k="${el.dataset.k}">${fld('note', 'ملاحظات (مستحقات، عهد، ...)', { type: 'textarea', full: true })}</form>`, `<button class="btn ok" form="clrf">تأكيد الإخلاء</button><button class="btn" data-act="close-modal">إلغاء</button>`);
FORM.clearsign = async f => {
  const e = emp(f.dataset.id); const k = f.dataset.k; const v = readForm(f);
  if (k === 'admin' && D.assets.list.some(a => a.holderId === e.id)) return toast('توجد عهد لم تُستلم من الموظف بعد', true);
  const c = { ...(e.clearance || {}), [k]: { done: true, byId: S.meId, at: nowISO(), note: v.note } };
  await put('employees', e.id, { ...strip(e), clearance: c }); await audit('توقيع إخلاء طرف', 'employee', e.id, `${e.nameAr} — ${k}`); closeModal(); toast('تم توقيع الإخلاء');
};
ACT['emp-finalize'] = el => confirmBox('سيُغلق ملف الموظف كمنتهية خدمته ولن يتمكن من الدخول. متابعة؟', async () => {
  const e = emp(el.dataset.id); const at = nowISO();
  await put('employees', e.id, { ...strip(e), status: 'terminated', terminatedAt: at });
  await put('emphistory', newId(), { empId: e.id, kind: 'action', label: 'إنهاء الخدمة', field: 'status', old: 'terminating', new: 'terminated', reason: e.exitReason || '', byId: S.meId, at });
  await audit('إغلاق ملف موظف', 'employee', e.id, e.nameAr); toast('أُنهيت الخدمة');
}, 'إنهاء الخدمة');

/* ---- attendance ---- */
ACT['att-edit'] = el => {
  const r = el.dataset.id ? D.attendance.map[el.dataset.id] : {};
  openModal(r.id ? 'تعديل سجل حضور' : 'سجل حضور يدوي', `<form class="form" id="attf" data-form="att" ${r.id ? `data-id="${r.id}"` : ''}>${fld('empId', 'الموظف', { type: 'select', required: true, value: r.empId, options: D.employees.list.filter(e => e.status !== 'terminated').map(e => [e.id, e.nameAr]) })}${fld('date', 'التاريخ', { type: 'date', value: r.date || todayISO(), required: true })}${fld('in', 'الحضور', { type: 'time', value: r.in })}${fld('out', 'الانصراف', { type: 'time', value: r.out })}${fld('shiftId', 'الوردية', { type: 'select', value: r.shiftId, options: D.shifts.list.map(s => [s.id, s.name]), hint: 'تُترك فارغة لاستخدام وردية الموظف' })}${fld('reason', 'سبب الإدخال اليدوي', { required: true, full: true })}</form>`, `<button class="btn pri" form="attf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`);
};
FORM.att = async f => {
  const v = readForm(f); const id = v.empId + '_' + v.date; const old = D.attendance.map[id];
  if (f.dataset.id && f.dataset.id !== id) await remove('attendance', f.dataset.id);
  await put('attendance', id, { empId: v.empId, date: v.date, in: v.in, out: v.out, shiftId: v.shiftId || null, source: 'يدوي — ' + v.reason, byId: S.meId, updatedAt: nowISO() });
  await audit(old ? 'تعديل سجل حضور' : 'إدخال حضور يدوي', 'attendance', id, `${empName(v.empId)} ${v.date} ${old ? `(${old.in || '-'}/${old.out || '-'} ← ${v.in}/${v.out})` : ''} — ${v.reason}`); closeModal(); toast('تم الحفظ');
};
ACT['att-import'] = () => openModal('استيراد حركات البصمة', `<p class="small">ملف CSV بالأعمدة: الرقم الوظيفي، التاريخ (YYYY-MM-DD)، وقت الحضور (HH:MM)، وقت الانصراف (HH:MM). الصف الأول عناوين. السجل الموجود لنفس الموظف واليوم يُستبدل.</p><form data-form="attimport" id="attimp">${fld('file', 'الملف', { type: 'file' })}</form>`, `<button class="btn pri" form="attimp">استيراد</button><button class="btn" data-act="close-modal">إلغاء</button>`);
FORM.attimport = async f => {
  const file = f.elements.file.files[0]; if (!file) return toast('اختر ملفًا', true);
  const rows = parseCSV(await file.text()).slice(1); let ok = 0, bad = 0; const recs = [];
  for (const [no, date, tin, tout] of rows) {
    const e = D.employees.list.find(x => x.empNo === no); if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { bad++; continue; }
    recs.push({ empId: e.id, date, in: tin || '', out: tout || '', shiftId: e.shiftId || null, source: 'بصمة (استيراد ' + file.name + ')', updatedAt: nowISO() }); ok++;
  }
  await attPutMany(recs);
  await audit('استيراد حضور', 'attendance', null, `${file.name}: ${ok} سجل، ${bad} مرفوض`); closeModal(); toast(`استُورد ${ok} سجل${bad ? `، ورُفض ${bad} (رقم وظيفي أو تاريخ غير صحيح)` : ''}`);
};
ACT['export-monthly'] = () => { const m = S.f.attMonth || monthISO(); const rows = monthly(m, can('att.manage') ? D.employees.list.filter(e => e.status !== 'terminated' && inScope(e.id)).map(e => e.id) : [...teamIds(S.meId)]); exportRows(`attendance-${m}`, [['الموظف', 'الإدارة', 'الموقع', 'الوردية', 'أيام العمل', 'حضور', 'إجازة', 'غياب', 'تأخير (مرات)', 'تأخير (دقائق)', 'إضافي (ساعات)'], ...rows.map(r => [r.name, r.dept, r.loc, r.shift, r.work, r.present, r.leave, r.absent, r.late, r.lateMin, r.ot])]); };
ACT['bal-edit'] = el => {
  const e = emp(el.dataset.id);
  openModal('تسوية أرصدة ' + e.nameAr, `<form class="form" id="balf" data-form="bal" data-id="${e.id}">${D.leaveTypes.list.filter(l => l.tracked !== false).map(l => { const b = D.leaveBalances.map[e.id + '_' + l.id] || {}; return `<div class="full small muted">${esc(l.name)}</div>${fld(`ent_${l.id}`, 'المستحق السنوي', { type: 'number', value: b.entitled ?? l.annualDays, min: 0 })}${fld(`car_${l.id}`, 'المرحل', { type: 'number', value: b.carried ?? 0 })}${fld(`adj_${l.id}`, 'تسوية (+/−)', { type: 'number', value: b.adjust ?? 0 })}`; }).join('')}${fld('reason', 'سبب التسوية', { required: true, full: true })}</form>`, `<button class="btn pri" form="balf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
};
FORM.bal = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); const at = nowISO();
  for (const l of D.leaveTypes.list.filter(l => l.tracked !== false)) {
    const id = e.id + '_' + l.id; const cur = D.leaveBalances.map[id] || {}; const n = { empId: e.id, typeId: l.id, entitled: Number(v['ent_' + l.id] || 0), carried: Number(v['car_' + l.id] || 0), adjust: Number(v['adj_' + l.id] || 0), year: new Date().getFullYear(), updatedAt: at };
    if (cur.entitled !== n.entitled || (cur.carried || 0) !== n.carried || (cur.adjust || 0) !== n.adjust) { await put('leaveBalances', id, n); await put('emphistory', newId(), { empId: e.id, kind: 'data', field: 'رصيد ' + l.name, label: 'رصيد ' + l.name, old: `${cur.entitled ?? l.annualDays}/${cur.carried || 0}/${cur.adjust || 0}`, new: `${n.entitled}/${n.carried}/${n.adjust}`, reason: v.reason, byId: S.meId, at }); }
  }
  await audit('تسوية رصيد إجازات', 'employee', e.id, `${e.nameAr} — ${v.reason}`); closeModal(); toast('تم حفظ الأرصدة');
};
ACT['shift-edit'] = el => { const s = el.dataset.id ? D.shifts.map[el.dataset.id] : {}; openModal(s.id ? 'تعديل وردية' : 'وردية جديدة', `<form class="form" id="shf" data-form="shift" ${s.id ? `data-id="${s.id}"` : ''}>${fld('name', 'اسم الوردية', { value: s.name, required: true })}${fld('start', 'البداية', { type: 'time', value: s.start, required: true })}${fld('end', 'النهاية', { type: 'time', value: s.end, required: true })}${fld('grace', 'سماحية التأخير (دقائق)', { type: 'number', value: s.grace ?? SET().graceMin ?? 15, min: 0 })}</form>`, `<button class="btn pri" form="shf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.shift = async f => { const v = readForm(f); const id = f.dataset.id || newId(); await put('shifts', id, { ...v, grace: Number(v.grace || 0) }); await audit('حفظ وردية', 'shift', id, v.name); closeModal(); toast('تم الحفظ'); };
FORM.policy = async f => { const v = readForm(f); await patch('settings', 'main', { leaveCountMode: v.leaveCountMode, weekend: (v.weekend || []).map(Number), graceMin: Number(v.graceMin || 0), otThresholdMin: Number(v.otThresholdMin || 0), otRate: v.otRate === '' ? null : Number(v.otRate), monthHours: v.monthHours === '' ? null : Number(v.monthHours) }); await audit('تعديل سياسة الحضور', 'settings', 'main', JSON.stringify(v)); toast('تم حفظ السياسة'); };

/* ---- admin affairs ---- */
ACT['asset-edit'] = el => { const a = el.dataset.id ? D.assets.map[el.dataset.id] : {}; openModal(a.id ? 'تعديل أصل' : 'أصل جديد', `<form class="form" id="asf" data-form="asset" ${a.id ? `data-id="${a.id}"` : ''}>${fld('name', 'اسم الأصل', { value: a.name, required: true })}${fld('category', 'الفئة', { type: 'select', options: LIST('assetCategories'), value: a.category, required: true })}${fld('serial', 'الرقم التسلسلي / اللوحة', { value: a.serial })}${fld('value', 'القيمة التقديرية', { type: 'number', value: a.value })}${a.id ? fld('status', 'الحالة', { type: 'select', blank: false, options: [['available', 'متاح'], ['assigned', 'مسلّم لموظف'], ['maintenance', 'صيانة'], ['disposed', 'مستبعد']], value: a.status }) : ''}${fld('notes', 'ملاحظات', { full: true, value: a.notes })}${cfForm('asset', a)}</form>`, `<button class="btn pri" form="asf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.asset = async f => {
  const v = readForm(f); const id = f.dataset.id; const cur = id ? D.assets.map[id] : null;
  if (cur && v.status !== 'assigned' && cur.status === 'assigned') return toast('استلم العهدة من الموظف أولًا عبر زر «استلام»', true);
  const code = cur?.code || await nextRef('AST');
  await put('assets', id || newId(), { ...(cur ? strip(cur) : { status: 'available', holderId: null }), ...v, code, value: v.value ? Number(v.value) : null, updatedAt: nowISO() }); await audit('حفظ أصل', 'asset', id, `${code} ${v.name}`); closeModal(); toast('تم الحفظ');
};
ACT['asset-issue'] = el => { const a = D.assets.map[el.dataset.id]; openModal('تسليم عهدة — ' + a.name, `<form class="form" id="isf" data-form="issue" data-id="${a.id}">${fld('empId', 'الموظف المستلم', { type: 'select', required: true, options: D.employees.list.filter(e => e.status !== 'terminated').map(e => [e.id, e.nameAr + ' — ' + e.empNo]) })}${fld('date', 'تاريخ التسليم', { type: 'date', value: todayISO(), required: true })}${fld('condition', 'حالة الأصل', { type: 'select', options: ['جديد', 'جيد', 'مقبول'], required: true })}${fld('notes', 'ملاحظات', { full: true })}</form>`, `<button class="btn pri" form="isf">تسليم وإنشاء المحضر</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
ACT['asset-return'] = el => { const a = D.assets.map[el.dataset.id]; openModal('استلام عهدة — ' + a.name, `<p>من: <b>${esc(empName(a.holderId))}</b></p><form class="form" id="rtf" data-form="return" data-id="${a.id}">${fld('date', 'تاريخ الاستلام', { type: 'date', value: todayISO(), required: true })}${fld('condition', 'حالة الأصل عند الاستلام', { type: 'select', options: ['جيد', 'يحتاج صيانة', 'تالف', 'مفقود'], required: true })}${fld('notes', 'ملاحظات', { full: true })}</form>`, `<button class="btn pri" form="rtf">استلام وإنشاء المحضر</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
async function handover(f, type) {
  const a = D.assets.map[f.dataset.id]; const v = readForm(f); const at = nowISO(); const empId = type === 'issue' ? v.empId : a.holderId;
  if (type === 'issue' && a.status !== 'available') return toast('الأصل غير متاح للتسليم', true);
  const ref = await nextRef('HND');
  await put('handovers', newId(), { ref, type, assetId: a.id, empId, date: v.date, condition: v.condition, notes: v.notes, byId: S.meId, at });
  await put('assets', a.id, { ...strip(a), status: type === 'issue' ? 'assigned' : (v.condition === 'يحتاج صيانة' ? 'maintenance' : v.condition === 'تالف' || v.condition === 'مفقود' ? 'disposed' : 'available'), holderId: type === 'issue' ? empId : null, assignedAt: type === 'issue' ? v.date : null, updatedAt: at });
  await notify([empId], type === 'issue' ? 'تم تسليمك عهدة' : 'تم استلام العهدة منك', `${a.name} (${a.code}) — محضر ${ref}`, { view: 'employee', id: empId });
  await audit(type === 'issue' ? 'تسليم عهدة' : 'استلام عهدة', 'asset', a.id, `${ref} ${a.code} — ${empName(empId)}`); closeModal(); toast('أُنشئ المحضر ' + ref);
}
FORM.issue = f => handover(f, 'issue'); FORM.return = f => handover(f, 'return');

/* ---- forms center ---- */
ACT['form-edit'] = el => {
  const x = el.dataset.id ? D.forms.map[el.dataset.id] : {}; const newVer = x.status === 'published';
  openModal(x.id ? (newVer ? 'إصدار جديد — ' + x.title : 'تعديل ' + x.title) : 'نموذج أو سياسة جديدة', `${newVer ? '<div class="note">سيُحفظ الإصدار الحالي في الأرشيف، ويحتاج الإصدار الجديد إلى اعتماد قبل نشره. يبقى الإصدار الحالي ساريًا حتى اعتماد الجديد.</div>' : ''}<form class="form" id="frf" data-form="formdoc" ${x.id ? `data-id="${x.id}"` : ''}>${fld('title', 'العنوان', { value: x.title, required: true, full: true })}${fld('category', 'التصنيف', { type: 'select', options: Object.entries(FORM_CATS), value: x.category, required: true })}${fld('deptId', 'الإدارة المالكة', { type: 'select', options: D.orgunits.list.filter(u => u.type === 'dept').map(u => [u.id, u.name]), value: x.deptId })}${fld('ownerId', 'المالك المسؤول', { type: 'select', options: D.employees.list.filter(e => e.status !== 'terminated').map(e => [e.id, e.nameAr]), value: x.ownerId || S.meId })}${fld('version', 'رقم الإصدار', { value: newVer ? String((parseFloat(x.version) || 1) + 1) + '.0' : x.version || '1.0', required: true })}${fld('effectiveDate', 'تاريخ السريان', { type: 'date', value: newVer ? todayISO() : x.effectiveDate || todayISO(), required: true })}${fld('keywords', 'كلمات مفتاحية', { value: x.keywords })}${fld('roles', 'متاح لـ (اتركه فارغًا لكل الموظفين)', { type: 'checks', options: Object.entries(ROLES).filter(([k]) => k !== 'employee'), value: x.roles || [], full: true })}${fld('requiresAck', 'الإقرار', { type: 'checkbox', value: x.requiresAck, cbLabel: 'يتطلب إقرار الموظف بالاطلاع' })}${fld('restricted', 'مقيد', { type: 'checkbox', value: x.restricted, cbLabel: 'نموذج مقيد (تحقيقات، إخلاء طرف…)' })}${fld('summary', 'ملخص أو نص السياسة', { type: 'textarea', value: x.summary, full: true })}${fld('file', 'الملف (PDF / Word / Excel)', { type: 'file', full: true, hint: x.file ? 'الملف الحالي: ' + esc(x.file.name) : '' })}</form>`, `<button class="btn pri" form="frf">حفظ كمسودة</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
};
FORM.formdoc = async f => {
  const v = readForm(f); const id = f.dataset.id; const cur = id ? D.forms.map[id] : null; const files = await uploadFiles(f.elements.file); const at = nowISO();
  if (cur?.status === 'published') {
    const nid = newId(); const code = cur.code;
    await put('forms', nid, { ...v, code, file: files[0] || cur.file || null, status: 'draft', supersedes: id, versions: [...(cur.versions || []), { version: cur.version, effectiveDate: cur.effectiveDate, file: cur.file || null, formId: id }], createdAt: at, updatedById: S.meId, updatedAt: at });
    await audit('إصدار جديد لنموذج', 'form', nid, `${code} v${v.version}`); closeModal(); toast('أُنشئ الإصدار الجديد كمسودة'); return;
  }
  const code = cur?.code || await nextRef('FRM');
  await put('forms', id || newId(), { ...(cur ? strip(cur) : { status: 'draft', versions: [], createdAt: at }), ...v, code, file: files[0] || cur?.file || null, updatedById: S.meId, updatedAt: at });
  await audit('حفظ نموذج', 'form', id, `${code} ${v.title}`); closeModal(); toast('تم الحفظ كمسودة');
};
ACT['form-status'] = async el => {
  const x = D.forms.map[el.dataset.id]; const s = el.dataset.s; const at = nowISO();
  if (s === 'published' && x.updatedById === S.meId) return toast('لا يمكنك اعتماد نموذج أعددته', true);
  const upd = { ...strip(x), status: s, updatedAt: at };
  if (s === 'published') { upd.publishedById = S.meId; upd.publishedAt = at; if (x.supersedes && D.forms.map[x.supersedes]) await put('forms', x.supersedes, { ...strip(D.forms.map[x.supersedes]), status: 'retired', retiredAt: at, supersededBy: x.id }); }
  if (s === 'review') upd.updatedById = S.meId;
  await put('forms', x.id, upd); await audit({ review: 'إرسال نموذج للاعتماد', published: 'اعتماد ونشر نموذج', retired: 'إلغاء نموذج', draft: 'إعادة نموذج للمسودة' }[s], 'form', x.id, `${x.code} v${x.version}`);
  if (s === 'review') await notify(D.employees.list.filter(e => canE(e, 'forms.approve') && e.id !== S.meId).map(e => e.id), 'نموذج بانتظار الاعتماد', `${x.title} (${x.code})`, { view: 'forms' });
  if (s === 'published' && (x.category === 'circular' || x.requiresAck)) await notify(D.employees.list.filter(e => e.status !== 'terminated' && (!x.roles?.length || x.roles.some(r => rolesOf(e).has(r)))).map(e => e.id), x.requiresAck ? 'مطلوب إقرارك بالاطلاع' : 'تعميم جديد', x.title, { view: 'forms' });
  closeModal(); toast('تم');
};
ACT['form-ack'] = async el => { const x = D.forms.map[el.dataset.id]; await put('acks', `${x.id}_${S.meId}_${x.version}`, { formId: x.id, empId: S.meId, version: x.version, at: nowISO() }); await audit('إقرار بالاطلاع', 'form', x.id, `${x.code} v${x.version}`); closeModal(); toast('تم تسجيل إقرارك'); };

/* ---- talent ---- */
ACT['reqn-new'] = () => openModal('طلب احتياج وظيفي', `<form class="form" id="rqf" data-form="reqn">${fld('title', 'المسمى الوظيفي', { required: true })}${fld('deptId', 'الإدارة', { type: 'select', required: true, value: ME().deptId, options: D.orgunits.list.filter(u => u.type === 'dept').map(u => [u.id, u.name]) })}${fld('locationId', 'الموقع', { type: 'select', options: D.orgunits.list.filter(u => u.type === 'location').map(u => [u.id, u.name]) })}${fld('count', 'العدد المطلوب', { type: 'number', value: 1, min: 1, required: true })}${fld('justification', 'المبرر', { type: 'textarea', required: true, full: true })}${fld('requirements', 'المتطلبات والمؤهلات', { type: 'textarea', full: true })}</form>`, `<button class="btn pri" form="rqf">إرسال للاعتماد</button><button class="btn" data-act="close-modal">إلغاء</button>`);
FORM.reqn = async f => { const v = readForm(f); const id = newId(); await put('requisitions', id, { ...v, count: Number(v.count), status: 'pending', requestedById: S.meId, createdAt: nowISO() }); await notify(D.employees.list.filter(e => rolesOf(e).has('hrManager') && e.id !== S.meId).map(e => e.id), 'طلب احتياج وظيفي', `${v.title} — ${unitName(v.deptId)}`, { view: 'talent' }); await audit('طلب احتياج وظيفي', 'requisition', id, v.title); closeModal(); toast('أُرسل الطلب'); };
ACT['reqn-st'] = async el => { const r = D.requisitions.map[el.dataset.id]; if (r.requestedById === S.meId) return toast('لا يمكنك اعتماد طلبك', true); await put('requisitions', r.id, { ...strip(r), status: el.dataset.s, decidedById: S.meId, decidedAt: nowISO() }); await notify([r.requestedById], el.dataset.s === 'approved' ? 'اعتُمد طلب الاحتياج' : 'رُفض طلب الاحتياج', r.title, { view: 'talent' }); await audit('قرار احتياج وظيفي', 'requisition', r.id, `${r.title}: ${el.dataset.s}`); };
ACT['cand-new'] = () => openModal('مرشح جديد', `<form class="form" id="cdf" data-form="cand">${fld('name', 'الاسم', { required: true })}${fld('reqId', 'الوظيفة', { type: 'select', required: true, options: D.requisitions.list.filter(r => r.status === 'approved').map(r => [r.id, r.title + ' — ' + unitName(r.deptId)]) })}${fld('phone', 'الجوال')}${fld('email', 'البريد', { type: 'email' })}${fld('source', 'المصدر', { type: 'select', options: LIST('candSources') })}${fld('nationality', 'الجنسية')}${fld('notes', 'ملاحظات', { type: 'textarea', full: true })}${fld('cv', 'السيرة الذاتية', { type: 'file', full: true })}${cfForm('candidate', {})}</form>`, `<button class="btn pri" form="cdf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`);
FORM.cand = async f => { const v = readForm(f); const files = await uploadFiles(f.elements.cv); const id = newId(); await put('candidates', id, { ...v, cv: files[0] || null, stage: 'received', createdAt: nowISO(), byId: S.meId }); await audit('إضافة مرشح', 'candidate', id, v.name); closeModal(); toast('أُضيف المرشح'); };
ACT['cand-stage'] = async el => {
  const c = D.candidates.map[el.dataset.id]; const s = el.value;
  if (s === 'hired') { const r = D.requisitions.map[c.reqId] || {}; S.pendingCandidate = c.id; openEmpEdit(null, { nameAr: c.name, phone: c.phone, email: c.email, nationality: c.nationality, title: r.title, deptId: r.deptId, locationId: r.locationId, status: 'probation', hireDate: todayISO() }); el.value = ''; return; }
  await put('candidates', c.id, { ...strip(c), stage: s, [s + 'At']: nowISO() }); await audit('تغيير مرحلة مرشح', 'candidate', c.id, `${c.name}: ${CAND_STAGES[s]}`);
};
ACT['course-edit'] = el => { const c = el.dataset.id ? D.courses.map[el.dataset.id] : {}; openModal(c.id ? 'تعديل دورة' : 'دورة جديدة', `<form class="form" id="crf" data-form="course" ${c.id ? `data-id="${c.id}"` : ''}>${fld('title', 'عنوان الدورة', { value: c.title, required: true, full: true })}${fld('provider', 'الجهة المقدمة', { value: c.provider })}${fld('start', 'تاريخ البداية', { type: 'date', value: c.start, required: true })}${fld('hours', 'عدد الساعات', { type: 'number', value: c.hours })}${fld('seats', 'المقاعد', { type: 'number', value: c.seats })}${fld('status', 'الحالة', { type: 'select', blank: false, options: [['open', 'مفتوحة للتسجيل'], ['closed', 'مغلقة']], value: c.status || 'open' })}${cfForm('course', c)}</form>`, `<button class="btn pri" form="crf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.course = async f => { const v = readForm(f); const id = f.dataset.id || newId(); await put('courses', id, { ...v, hours: v.hours ? Number(v.hours) : null, seats: v.seats ? Number(v.seats) : null }); await audit('حفظ دورة', 'course', id, v.title); closeModal(); toast('تم الحفظ'); };
ACT['course-roster'] = el => {
  const c = D.courses.map[el.dataset.id]; const en = D.enrollments.list.filter(x => x.courseId === c.id);
  openModal('المسجلون — ' + c.title, `<div class="list">${en.map(x => `<div><div class="grow">${esc(empName(x.empId))}</div>${x.status === 'completed' ? badge('approved', 'مكتمل') : `<button class="btn sm" data-act="enroll-done" data-id="${x.id}">تسجيل الإكمال</button>`}</div>`).join('') || empty('لا يوجد مسجلون')}</div><form class="form" id="enf" data-form="enroll" data-c="${c.id}">${fld('empId', 'تسجيل موظف', { type: 'select', options: D.employees.list.filter(e => e.status !== 'terminated' && !en.some(x => x.empId === e.id)).map(e => [e.id, e.nameAr]) })}<div class="fld" style="justify-content:flex-end"><button class="btn">تسجيل</button></div></form>`);
};
FORM.enroll = async f => { const v = readForm(f); if (!v.empId) return; const c = f.dataset.c; await put('enrollments', v.empId + '_' + c, { empId: v.empId, courseId: c, status: 'enrolled', at: nowISO(), byId: S.meId }); await audit('تسجيل في دورة', 'course', c, empName(v.empId)); ACT['course-roster']({ dataset: { id: c } }); };
ACT['enroll-done'] = async el => { const x = D.enrollments.map[el.dataset.id]; await put('enrollments', x.id, { ...strip(x), status: 'completed', completedAt: nowISO() }); await audit('إكمال دورة', 'course', x.courseId, empName(x.empId)); ACT['course-roster']({ dataset: { id: x.courseId } }); };
ACT['review-edit'] = el => {
  const e = emp(el.dataset.id); const p = el.dataset.p; const r = D.reviews.list.find(x => x.empId === e.id && x.period === p) || {};
  openModal(`تقييم أداء ${e.nameAr} — ${p}`, `<form class="form" id="rvf" data-form="review" data-e="${e.id}" data-p="${esc(p)}" ${r.id ? `data-id="${r.id}"` : ''}>${fld('goals', 'الأهداف ومؤشرات الأداء', { type: 'textarea', value: r.goals, full: true, required: true })}${fld('rating', 'التقدير العام (1–5)', { type: 'select', options: [['1', '1 — دون المتوقع بكثير'], ['2', '2 — دون المتوقع'], ['3', '3 — يحقق المتوقع'], ['4', '4 — يتجاوز المتوقع'], ['5', '5 — استثنائي']], value: String(r.rating || '') })}${fld('comments', 'الملاحظات وخطة التطوير', { type: 'textarea', value: r.comments, full: true })}${fld('promotion', 'التوصية', { type: 'select', options: ['لا يوجد', 'ترقية', 'تدريب إضافي', 'خطة تحسين أداء'], value: r.promotion })}${fld('final', 'الاعتماد', { type: 'checkbox', cbLabel: 'اعتماد التقييم نهائيًا (يظهر للموظف)' })}</form>`, `<button class="btn pri" form="rvf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`);
};
FORM.review = async f => { const v = readForm(f); const id = f.dataset.id || newId(); const empId = f.dataset.e; if (empId === S.meId) return toast('لا يمكنك تقييم نفسك', true); await put('reviews', id, { empId, period: f.dataset.p, goals: v.goals, rating: v.rating ? Number(v.rating) : null, comments: v.comments, promotion: v.promotion, reviewerId: S.meId, status: v.final ? 'final' : 'draft', updatedAt: nowISO() }); if (v.final) await notify([empId], 'اعتُمد تقييم أدائك', f.dataset.p, { view: 'talent' }); await audit('حفظ تقييم أداء', 'review', id, `${empName(empId)} ${f.dataset.p}`); closeModal(); toast('تم الحفظ'); };

/* ---- payroll ---- */
ACT['export-sheet'] = () => { const m = S.f.payMonth || monthISO(); const rows = payrollSheet(m); exportRows(`payroll-draft-${m}`, [['الرقم الوظيفي', 'الموظف', 'مركز التكلفة', 'الثابت', 'ساعات إضافية', 'أجر الإضافي', 'مكافآت', 'خصومات', 'أقساط سلف', 'الصافي'], ...rows.map(r => [r.empNo, r.name, r.cc, r.gross, r.otH, r.otPay, r.bonus, r.ded, r.loan, r.net])]); };
ACT['loans-post'] = () => { const m = S.f.payMonth || monthISO(); const due = D.loans.list.filter(l => loanDue(l, m)); if (!due.length) return toast('لا توجد أقساط مستحقة لهذا الشهر'); confirmBox(`سيُسجل خصم ${due.length} قسط لشهر ${m}. متابعة؟`, async () => { for (const l of due) { const paid = [...(l.paid || []), m]; await put('loans', l.id, { ...strip(l), paid, status: paid.length >= l.installments ? 'closed' : 'open' }); } await audit('تسجيل خصم أقساط', 'loan', null, `${m}: ${due.length} قسط`); toast('تم التسجيل'); }, 'تسجيل'); };
ACT['adj-new'] = () => openModal('مكافأة أو خصم', `<form class="form" id="adf" data-form="adj">${fld('empId', 'الموظف', { type: 'select', required: true, options: D.employees.list.filter(e => e.status !== 'terminated').map(e => [e.id, e.nameAr]) })}${fld('month', 'الشهر', { type: 'month', value: monthISO(), required: true })}${fld('kind', 'النوع', { type: 'select', blank: false, options: [['bonus', 'مكافأة'], ['deduction', 'خصم']] })}${fld('amount', 'المبلغ', { type: 'number', min: 0, step: '0.01', required: true })}${fld('reason', 'السبب', { required: true, full: true })}</form><div class="small muted">يحتاج اعتماد شخص آخر يملك صلاحية «اعتماد التسويات المالية».</div>`, `<button class="btn pri" form="adf">حفظ للاعتماد</button><button class="btn" data-act="close-modal">إلغاء</button>`);
FORM.adj = async f => { const v = readForm(f); const id = newId(); await put('adjustments', id, { ...v, amount: Number(v.amount), status: 'pending', createdById: S.meId, createdAt: nowISO() }); await notify(D.employees.list.filter(e => canE(e, 'pay.approve') && e.id !== S.meId).map(e => e.id), 'تسوية مالية بانتظار الاعتماد', `${empName(v.empId)} — ${v.amount}`, { view: 'payroll' }); await audit('إدخال تسوية مالية', 'adjustment', id, `${empName(v.empId)} ${v.kind} ${v.amount}`); closeModal(); toast('أُرسلت للاعتماد'); };
ACT['adj-st'] = async el => { const a = D.adjustments.map[el.dataset.id]; if (a.createdById === S.meId) return toast('لا يمكنك اعتماد ما أدخلته', true); await put('adjustments', a.id, { ...strip(a), status: el.dataset.s, decidedById: S.meId, decidedAt: nowISO() }); await audit('قرار تسوية مالية', 'adjustment', a.id, `${empName(a.empId)} ${a.amount}: ${el.dataset.s}`); };

/* ---- settings ---- */
ACT['unit-edit'] = el => { const u = el.dataset.id ? D.orgunits.map[el.dataset.id] : {}; openModal(u.id ? 'تعديل وحدة' : 'وحدة تنظيمية جديدة', `<form class="form" id="unf" data-form="unit" ${u.id ? `data-id="${u.id}"` : ''}>${fld('type', 'النوع', { type: 'select', options: Object.entries(UNIT_TYPES), value: u.type, required: true })}${fld('name', 'الاسم', { value: u.name, required: true })}${fld('code', 'الرمز', { value: u.code, hint: 'مثل رمز مركز التكلفة في SAP' })}${fld('parentId', 'تتبع', { type: 'select', options: D.orgunits.list.filter(x => x.id !== u.id).map(x => [x.id, UNIT_TYPES[x.type] + ': ' + x.name]), value: u.parentId })}${fld('managerId', 'المدير', { type: 'select', options: D.employees.list.filter(e => e.status !== 'terminated').map(e => [e.id, e.nameAr]), value: u.managerId })}</form>`, `<button class="btn pri" form="unf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.unit = async f => { const v = readForm(f); const id = f.dataset.id || newId(); if (v.code && D.orgunits.list.some(u => u.code === v.code && u.id !== id)) return toast('الرمز مستخدم', true); await put('orgunits', id, v); await audit('حفظ وحدة تنظيمية', 'orgunit', id, v.name); closeModal(); toast('تم الحفظ'); };
ACT['roles-edit'] = el => { const e = emp(el.dataset.id); openModal('أدوار ' + e.nameAr, `<form id="rlf" data-form="roles" data-id="${e.id}">${fld('roles', 'الأدوار الوظيفية', { type: 'checks', options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]), value: e.roles || [] })}</form>`, `<button class="btn pri" form="rlf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.roles = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); const roles = v.roles || [];
  if (e.id === S.meId && (e.roles || []).includes('sysadmin') && !roles.includes('sysadmin') && !D.employees.list.some(x => x.id !== e.id && (x.roles || []).includes('sysadmin'))) return toast('لا يمكن إزالة آخر مدير نظام', true);
  await put('employees', e.id, { ...strip(e), roles }); await put('emphistory', newId(), { empId: e.id, kind: 'data', field: 'roles', old: e.roles || [], new: roles, reason: 'تغيير صلاحيات', byId: S.meId, at: nowISO() });
  await audit('تغيير صلاحيات', 'employee', e.id, `${e.nameAr}: ${roles.map(r => ROLES[r]).join('، ') || 'موظف فقط'}`); closeModal(); toast('تم الحفظ');
};
FORM.matrix = async f => { const m = {}; Object.keys(ROLES).forEach(r => m[r] = $$(`input[name="${r}[]"]:checked`, f).map(i => i.value)); if (!m.sysadmin.includes('settings.manage')) return toast('يجب أن يحتفظ مدير النظام بصلاحية إعدادات النظام', true); await patch('settings', 'main', { matrix: m, matrixPerms: Object.keys(PERMS) }); await audit('تعديل مصفوفة الصلاحيات', 'settings', 'matrix', ''); toast('حُفظت المصفوفة'); };
ACT['matrix-reset'] = () => confirmBox('استعادة مصفوفة الصلاحيات الافتراضية؟', async () => { await patch('settings', 'main', { matrix: DEFAULT_MATRIX }); await audit('استعادة المصفوفة الافتراضية', 'settings', 'matrix', ''); toast('تمت الاستعادة'); });
FORM.general = async f => { const v = readForm(f); await patch('settings', 'main', { company: v.company, contractAlertDays: Number(v.contractAlertDays || 60), defaultSla: Number(v.defaultSla || 48), demoMode: !!v.demoMode }); await audit('تعديل الإعدادات العامة', 'settings', 'main', ''); toast('تم الحفظ'); renderAll(true); };
ACT['lt-edit'] = el => { const l = el.dataset.id ? D.leaveTypes.map[el.dataset.id] : {}; openModal(l.id ? 'تعديل نوع إجازة' : 'نوع إجازة جديد', `<form class="form" id="ltf" data-form="lt" ${l.id ? `data-id="${l.id}"` : ''}>${fld('name', 'الاسم', { value: l.name, required: true })}${fld('annualDays', 'الاستحقاق السنوي (أيام)', { type: 'number', value: l.annualDays ?? 0, min: 0 })}${fld('order', 'الترتيب', { type: 'number', value: l.order ?? 10 })}${fld('tracked', 'الرصيد', { type: 'checkbox', value: l.tracked !== false, cbLabel: 'يُخصم من رصيد' })}${fld('paid', 'مدفوعة', { type: 'checkbox', value: l.paid !== false, cbLabel: 'مدفوعة الأجر' })}</form>`, `<button class="btn pri" form="ltf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM.lt = async f => { const v = readForm(f); const id = f.dataset.id || newId(); await put('leaveTypes', id, { ...v, annualDays: Number(v.annualDays || 0), order: Number(v.order || 10) }); await audit('حفظ نوع إجازة', 'leaveType', id, v.name); closeModal(); toast('تم الحفظ'); };
ACT['tpl-edit'] = el => { const t = el.dataset.id ? D.templates.map[el.dataset.id] : {}; openModal(t.id ? 'تعديل قالب' : 'قالب جديد', `<form class="form" id="tpf" data-form="tpl" ${t.id ? `data-id="${t.id}"` : ''}>${fld('name', 'اسم القالب', { value: t.name, required: true })}${fld('kind', 'النوع', { type: 'select', options: [['salary', 'تعريف راتب'], ['experience', 'شهادة خبرة'], ['external', 'خطاب لجهة خارجية'], ['other', 'أخرى']], value: t.kind })}${fld('body', 'نص القالب', { type: 'textarea', value: t.body, full: true, required: true })}</form>`, `<button class="btn pri" form="tpf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true); $('#f-body') && ($('#f-body').style.minHeight = '260px'); };
FORM.tpl = async f => { const v = readForm(f); const id = f.dataset.id || newId(); await put('templates', id, v); await audit('حفظ قالب خطاب', 'template', id, v.name); closeModal(); toast('تم الحفظ'); };

/* request-type designer */
function assigneeText(st) { return (st.assignees || []).map(a => a.kind === 'role' ? 'role:' + a.role : a.kind === 'employee' ? 'emp:' + (emp(a.empId)?.empNo || a.empId) : a.kind).join(st.mode === 'all' ? ' + ' : ' | '); }
function parseAssignees(s) {
  const mode = s.includes('+') ? 'all' : 'any';
  const assignees = s.split(/[+|]/).map(x => x.trim()).filter(Boolean).map(tok => {
    if (tok === 'manager' || tok === 'deptManager') return { kind: tok };
    if (tok.startsWith('role:')) { const r = tok.slice(5); if (!ROLES[r]) throw new Error('دور غير معروف: ' + r); return { kind: 'role', role: r }; }
    if (tok.startsWith('emp:')) { const e = D.employees.list.find(x => x.empNo === tok.slice(4)); if (!e) throw new Error('رقم وظيفي غير موجود: ' + tok.slice(4)); return { kind: 'employee', empId: e.id }; }
    throw new Error('صيغة غير صحيحة: ' + tok);
  });
  if (!assignees.length) throw new Error('حدد المسؤول عن كل مرحلة');
  return { mode, assignees };
}
const fieldRow = (f = {}) => `<div class="ed-row" data-row="field"><div><label class="small muted">المفتاح</label><input data-k="key" value="${esc(f.key)}" placeholder="from"></div><div><label class="small muted">العنوان</label><input data-k="label" value="${esc(f.label)}"></div><div><label class="small muted">النوع</label><select data-k="type">${Object.entries(FIELD_TYPES).map(([k, l]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div><label class="small muted">خيارات (للقائمة)</label><input data-k="options" value="${esc(f.options)}" placeholder="أ، ب، ج"></div><div><label class="small muted">إلزامي</label><select data-k="required"><option value="1" ${f.required ? 'selected' : ''}>نعم</option><option value="" ${f.required ? '' : 'selected'}>لا</option></select></div><button type="button" class="btn sm ghost" data-act="row-del" aria-label="حذف">${ic('x')}</button></div>`;
const stageRow = (s = {}) => `<div class="ed-row" data-row="stage"><div><label class="small muted">اسم المرحلة</label><input data-k="name" value="${esc(s.name)}"></div><div style="grid-column:span 2"><label class="small muted">المسؤول</label><input data-k="who" value="${esc(s.assignees ? assigneeText(s) : 'manager')}" placeholder="manager | role:hrManager"></div><div><label class="small muted">المدة المستهدفة (ساعات)</label><input data-k="sla" type="number" value="${esc(s.slaHours ?? 24)}"></div><div><label class="small muted">اسم زر الاعتماد</label><input data-k="actionLabel" value="${esc(s.actionLabel || 'اعتماد')}"></div><button type="button" class="btn sm ghost" data-act="row-del" aria-label="حذف">${ic('x')}</button></div>`;
ACT['row-del'] = el => el.closest('.ed-row').remove();
ACT['row-add'] = el => $('#' + el.dataset.to).insertAdjacentHTML('beforeend', el.dataset.to === 'tfields' ? fieldRow() : stageRow());
ACT['type-edit-legacy'] = el => {
  const t = el.dataset.id ? D.requestTypes.map[el.dataset.id] : { active: true, category: 'hr', stages: [{ name: 'المدير المباشر', assignees: [{ kind: 'manager' }], slaHours: 24 }] };
  openModal(t.id ? 'تعديل نوع طلب: ' + t.name : 'نوع طلب جديد', `<form class="form" id="tyf" data-form="rtype" ${t.id ? `data-id="${t.id}"` : ''}>
    ${fld('name', 'اسم الخدمة', { value: t.name, required: true })}${fld('code', 'الرمز', { value: t.code, required: true })}${fld('category', 'التصنيف', { type: 'select', blank: false, options: Object.entries(CATS), value: t.category })}${fld('effect', 'الأثر عند الاكتمال', { type: 'select', blank: false, options: Object.entries(EFFECTS), value: t.effect || '' })}
    ${fld('templateId', 'قالب الخطاب (للخطابات)', { type: 'select', options: D.templates.list.map(x => [x.id, x.name]), value: t.templateId })}${fld('icon', 'الأيقونة', { type: 'select', blank: false, options: Object.keys(ICONS).map(k => [k, k]), value: t.icon || 'file' })}${fld('order', 'الترتيب', { type: 'number', value: t.order ?? 50 })}${fld('escalateRole', 'التصعيد عند التأخير إلى', { type: 'select', blank: false, options: Object.entries(ROLES).filter(([k]) => ASSIGNABLE_ROLES.includes(k)), value: t.escalateRole || 'hrManager' })}
    ${fld('description', 'وصف مختصر', { value: t.description, full: true })}${fld('instructions', 'تعليمات تظهر للموظف', { type: 'textarea', value: t.instructions, full: true })}
    ${fld('roles', 'متاح فقط لـ (فارغ = كل الموظفين)', { type: 'checks', options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]), value: t.roles || [], full: true })}
    ${fld('active', 'الحالة', { type: 'checkbox', value: t.active !== false, cbLabel: 'مفعل' })}${fld('featured', 'العرض', { type: 'checkbox', value: t.featured, cbLabel: 'ضمن الخدمات الأكثر استخدامًا' })}${fld('needsAttachment', 'المرفقات', { type: 'checkbox', value: t.needsAttachment, cbLabel: 'المرفق إلزامي' })}${fld('sensitive', 'السرية', { type: 'checkbox', value: t.sensitive, cbLabel: 'طلب حساس (يظهر لصاحبه والمعتمدين فقط)' })}
  </form>
  <div><h3 style="font-size:15px;margin-bottom:6px">حقول النموذج</h3><div id="tfields">${(t.fields || []).map(fieldRow).join('')}</div><button class="btn sm" data-act="row-add" data-to="tfields">${ic('plus')} حقل</button></div>
  <div><h3 style="font-size:15px;margin-bottom:6px">مراحل الاعتماد والتنفيذ</h3><div class="note small" style="margin-bottom:8px">المسؤول: <b>manager</b> المدير المباشر · <b>deptManager</b> مدير الإدارة · <b>role:hrManager</b> دور (${ASSIGNABLE_ROLES.join('، ')}) · <b>emp:الرقم_الوظيفي</b>. افصل بـ <b>|</b> ليكفي أحدهم، وبـ <b>+</b> لمسار متوازٍ يلزم الجميع. لا يعتمد مقدم الطلب طلبه أبدًا، وإن لم يوجد مسؤول يُحوّل لمدير الموارد البشرية.</div><div id="tstages">${(t.stages || []).map(stageRow).join('')}</div><button class="btn sm" data-act="row-add" data-to="tstages">${ic('plus')} مرحلة</button></div>`,
    `<button class="btn pri" form="tyf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
};
FORM.rtype = async f => {
  const v = readForm(f); const id = f.dataset.id;
  const fields = $$('[data-row="field"]').map(r => { const o = {}; $$('[data-k]', r).forEach(i => o[i.dataset.k] = i.value.trim()); o.required = !!o.required; return o; }).filter(x => x.key && x.label);
  if (new Set(fields.map(x => x.key)).size !== fields.length) return toast('مفاتيح الحقول يجب أن تكون فريدة', true);
  const stages = $$('[data-row="stage"]').map(r => { const o = {}; $$('[data-k]', r).forEach(i => o[i.dataset.k] = i.value.trim()); return { name: o.name, ...parseAssignees(o.who), slaHours: Number(o.sla) || 24, actionLabel: o.actionLabel || 'اعتماد' }; }).filter(s => s.name);
  if (D.requestTypes.list.some(x => x.code === v.code && x.id !== id)) return toast('الرمز مستخدم لنوع آخر', true);
  const doc = { ...v, order: Number(v.order || 50), fields, stages, active: !!v.active, featured: !!v.featured, needsAttachment: !!v.needsAttachment, sensitive: !!v.sensitive, effect: v.effect || null, templateId: v.templateId || null, updatedAt: nowISO() };
  await put('requestTypes', id || newId(), doc); await audit('حفظ نوع طلب', 'requestType', id, `${v.code} ${v.name}`); closeModal(); toast('حُفظ نوع الطلب. الطلبات المفتوحة تكمل بمسارها القديم.');
};
ACT['export-audit'] = () => exportRows(`audit-${todayISO()}`, [['التاريخ', 'المستخدم', 'الإجراء', 'الكيان', 'المعرف', 'التفاصيل'], ...D.audit.list.map(a => [a.at, a.byName, a.action, a.entity, a.entityId, a.detail])]);
// backup & restore: see security.js

/* ============ init ============ */
(async function init() {
  S.session = newId();
  if (IS_STAGING) try { S.meId = localStorage.getItem('hr.me'); } catch (e) { }
  if (!window.claude?.use) { $('#root').innerHTML = `<div class="login"><div class="card"><h1>تعذر الاتصال بقاعدة البيانات</h1><p class="muted">افتح المنصة من رابطها على Claude.</p></div></div>`; return; }
  const [db, user, assets, downloads] = await Promise.all(['db', 'user', 'assets', 'downloads'].map(n => window.claude.use(n).catch(() => null)));
  if (!db) { $('#root').innerHTML = `<div class="login"><div class="card"><h1>قاعدة البيانات غير متاحة</h1><p class="muted">سجّل الدخول إلى Claude بحساب لديه صلاحية الوصول لهذه الصفحة ثم أعد التحميل.</p></div></div>`; return; }
  S.db = db; S.user = user; S.assets = assets; S.downloads = downloads;
  if (user) { try { S.uid = await user.id(); S.adminLvl = !!(await user.canEdit()); const cw = await user.can('data.write'); if (cw === false) S.canWrite = false; } catch (e) { } }
  subscribeAll();
  const wait = setInterval(() => { if (Object.keys(COLS).every(k => S.loaded.has(k))) { clearInterval(wait); S.ready = true; const h = location.hash.replace(/^#v-/, ''); if (h && VIEWS[h] && h !== 'employee' && h !== 'search') S.view = h; renderAll(true); } }, 120);
  setTimeout(() => { if (!S.ready) { clearInterval(wait); S.ready = true; renderAll(true); } }, 9000);
})();
