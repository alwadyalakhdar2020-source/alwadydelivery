'use strict';
/* ============ Approval flow track (خط سير الموافقات) ============ */
// steps: [{title, who, state: done|active|waiting|rejected|returned|skipped, date, note}]
function flowTrack(steps, o = {}) {
  const icon = s => s === 'done' ? '✓' : s === 'rejected' ? '✕' : s === 'returned' ? '↺' : '';
  return `<ol class="flow ${o.compact ? 'compact' : ''}" aria-label="خط سير الموافقات">${steps.map((s, i) => `<li class="fstep ${s.state}"><span class="fdot">${icon(s.state) || (i + 1)}</span><div class="fbody"><b>${esc(s.title)}</b>${s.who ? `<span class="fwho">${esc(s.who)}</span>` : ''}${s.date ? `<span class="fdate num">${esc(s.date)}</span>` : ''}${s.note ? `<span class="fnote">${esc(s.note)}</span>` : ''}</div></li>`).join('')}</ol>`;
}
function namesFor(spec, req) { const ids = eligibleFor(spec, req); return ids.length > 3 ? ids.slice(0, 2).map(empName).join('، ') + ` و${ids.length - 2} آخرين` : ids.map(empName).join('، '); }
function stageWho(st, req) {
  const parts = (st.assignees || []).map(a => { const n = req ? namesFor(a, req) : ''; return specLabel(a) + (n && a.kind !== 'employee' ? ` (${n})` : ''); });
  return parts.join(st.mode === 'all' ? ' + ' : ' أو ');
}
function requestSteps(r) {
  const steps = [{ title: 'تقديم الطلب', who: empName(r.empId), state: 'done', date: fmtD(r.createdAt) }];
  (r.stages || []).forEach((st, i) => {
    const last = st.decisions.at(-1); let state = 'waiting', who = stageWho(st, r), date = '', note = '';
    if (st.status === 'done') { state = st.decisions.some(d => d.action === 'reject') ? 'rejected' : 'done'; who = uniq(st.decisions.map(d => empName(d.byId))).join('، '); date = fmtD(st.doneAt || last?.at); }
    else if (i === r.current && r.status === 'returned') { state = 'returned'; who = empName(last?.byId); date = fmtD(last?.at); note = 'أُعيد للاستكمال'; }
    else if (i === r.current && r.status === 'pending') { state = 'active'; who = currentApprovers(r).map(empName).join('، ') || who; note = isOverdue(r) ? 'متجاوز المدة' : 'بانتظار الإجراء'; if (st.mode === 'all') note += ` · ${st.decisions.filter(d => d.action === 'approve').length}/${st.assignees.length}`; }
    else if (['cancelled', 'rejected'].includes(r.status) && i > r.current) state = 'skipped';
    steps.push({ title: st.name, who, state, date, note });
  });
  const endState = r.status === 'approved' ? 'done' : r.status === 'rejected' ? 'rejected' : r.status === 'cancelled' ? 'skipped' : 'waiting';
  steps.push({ title: r.status === 'rejected' ? 'مرفوض' : r.status === 'cancelled' ? 'ملغى' : 'اكتمال الطلب', who: '', state: endState, date: r.closedAt ? fmtD(r.closedAt) : '' });
  return steps;
}
function typeSteps(t, forEmpId) {
  const fake = { empId: forEmpId || S.meId };
  return [{ title: 'تقديم الطلب', who: forEmpId ? empName(forEmpId) : 'مقدم الطلب', state: 'done' }, ...(t.stages || []).map(st => ({ title: st.name || 'مرحلة', who: forEmpId ? stageWho(st, fake) : stageWho(st), state: 'waiting', note: st.slaHours ? `خلال ${st.slaHours} ساعة` : '' })), { title: 'اكتمال الطلب', state: 'waiting' }];
}
function miniFlow(r) {
  const n = (r.stages || []).length; if (!n) return '—';
  const dots = r.stages.map((st, i) => { const c = st.status === 'done' ? (st.decisions.some(d => d.action === 'reject') ? 'r' : 'd') : i === r.current && r.status === 'pending' ? (isOverdue(r) ? 'l' : 'a') : i === r.current && r.status === 'returned' ? 'w' : ''; return `<i class="${c}" title="${esc(st.name)}"></i>`; }).join('');
  const label = r.status === 'pending' ? r.stages[r.current]?.name : r.status === 'returned' ? 'معاد للاستكمال' : STATUS[r.status]?.[0];
  return `<span class="mflow">${dots}</span><span class="small">${esc(label || '')}${isOverdue(r) ? ' · <b style="color:var(--bad)">متأخر</b>' : ''}</span>`;
}

/* ============ Field types shared by forms, custom fields and screens ============ */
const FIELD_TYPES2 = {
  section: ['عنوان قسم', 'list'], text: ['نص قصير', 'file'], textarea: ['نص طويل', 'file'], number: ['رقم', 'chart'], date: ['تاريخ', 'calendar'], time: ['وقت', 'clock'], month: ['شهر', 'calendar'],
  select: ['قائمة منسدلة', 'list'], radio: ['اختيار واحد', 'check'], checks: ['اختيارات متعددة', 'check'], checkbox: ['إقرار / نعم-لا', 'shield'], email: ['بريد إلكتروني', 'mail'], tel: ['رقم جوال', 'key'],
  employee: ['موظف من النظام', 'users'], leaveType: ['نوع إجازة', 'calendar'], course: ['دورة تدريبية', 'grad'], asset: ['أصل / عهدة', 'box'], payElement: ['عنصر أجر', 'money'], personalField: ['حقل بيانات شخصية', 'users'], form: ['نموذج من المركز', 'file']
};
const BASIC_TYPES = ['section', 'text', 'textarea', 'number', 'date', 'time', 'month', 'select', 'radio', 'checks', 'checkbox', 'email', 'tel', 'employee'];
const optList = f => String(f.options || '').split(/[،,\n]/).map(s => s.trim()).filter(Boolean);
function fieldDisplay(f, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
  switch (f.type) {
    case 'leaveType': return D.leaveTypes.map[v]?.name || v; case 'employee': return empName(v); case 'payElement': return PAY_ELEMENTS[v] || v; case 'personalField': return PERSONAL_FIELDS[v] || v;
    case 'course': return D.courses.map[v]?.title || v; case 'asset': return D.assets.map[v]?.name || v; case 'form': return D.forms.map[v]?.title || v;
    case 'checkbox': return v ? 'نعم' : 'لا'; case 'checks': return [].concat(v).join('، '); case 'date': return fmtD(v);
    default: return String(v);
  }
}
function validateFields(fields, data) {
  const errs = [];
  for (const f of fields || []) {
    if (f.type === 'section') continue; const v = data[f.key];
    if (f.required && (v == null || v === '' || v === false || (Array.isArray(v) && !v.length))) errs.push(`الحقل «${f.label}» إلزامي`);
    if (f.type === 'number' && v !== '' && v != null) { if (isNaN(+v)) errs.push(`«${f.label}» يجب أن يكون رقمًا`); else { if (f.min !== '' && f.min != null && +v < +f.min) errs.push(`«${f.label}» أقل من ${f.min}`); if (f.max !== '' && f.max != null && +v > +f.max) errs.push(`«${f.label}» أعلى من ${f.max}`); } }
    if (f.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errs.push(`«${f.label}» بريد غير صحيح`);
  }
  return errs;
}

/* ============ Filled form document ============ */
function formSheetHtml(r) {
  const t = D.requestTypes.map[r.typeId]; const e = emp(r.empId) || {}; const fields = t?.fields || [];
  const rows = fields.map(f => f.type === 'section' ? `<tr><th colspan="2" class="sec">${esc(f.label)}</th></tr>` : `<tr><th>${esc(f.label)}</th><td>${esc(fieldDisplay(f, r.data?.[f.key]))}</td></tr>`).join('');
  const appr = (r.stages || []).map(st => { const d = st.decisions.at(-1); return `<tr><td>${esc(st.name)}</td><td>${esc(d ? uniq(st.decisions.map(x => empName(x.byId))).join('، ') : '—')}</td><td>${esc(d ? ({ approve: st.actionLabel || 'اعتماد', reject: 'رفض', return: 'إرجاع' }[d.action]) : 'لم يُتخذ')}</td><td>${esc(d ? fmtDT(d.at) : '')}</td><td>${esc(d?.comment || '')}</td></tr>`; }).join('');
  return `<div class="sheet" dir="${LANG === 'en' ? 'ltr' : 'rtl'}"><header><div class="smark">${esc((SET().company || 'و').trim()[0])}</div><div><b>${esc(SET().company || '')}</b><span>${esc(CATS[r.category] || '')}</span></div><div class="sref"><span class="num">${esc(r.ref)}</span><span class="num">${fmtD(r.createdAt)}</span></div></header>
  <h2>${esc(r.typeName)}</h2>
  <table class="kv"><tr><th>اسم الموظف</th><td>${esc(e.nameAr || '')}</td><th>الرقم الوظيفي</th><td class="num">${esc(e.empNo || '')}</td></tr><tr><th>الإدارة</th><td>${esc(unitName(e.deptId))}</td><th>المسمى الوظيفي</th><td>${esc(e.title || '')}</td></tr></table>
  <table class="kv">${rows || '<tr><td>لا توجد حقول</td></tr>'}</table>
  <h3>الاعتمادات</h3><table class="grid2"><thead><tr><th>المرحلة</th><th>المعتمد</th><th>القرار</th><th>التاريخ</th><th>الملاحظة</th></tr></thead><tbody>${appr || '<tr><td colspan="5">بدون مراحل اعتماد</td></tr>'}</tbody></table>
  <footer>حالة الطلب: ${esc(STATUS[r.status]?.[0] || r.status)} — مستند إلكتروني صادر من منصة الموارد البشرية بتاريخ ${fmtDT(nowISO())}</footer></div>`;
}
const SHEET_CSS = `.sheet{font-family:Tajawal,Arial,sans-serif;max-width:780px;margin:0 auto;background:#fff;color:#0B1A33;border:1px solid #E0E6EF;border-radius:10px;padding:28px}.sheet header{display:flex;gap:12px;align-items:center;border-bottom:3px solid #051D48;padding-bottom:12px}.sheet .smark{width:42px;height:42px;border-radius:9px;background:#2F9A4C;color:#fff;display:grid;place-items:center;font-weight:800;font-size:20px}.sheet header b{display:block;font-size:16px}.sheet header span{font-size:12px;color:#5A6A82}.sheet .sref{margin-inline-start:auto;display:flex;flex-direction:column;align-items:flex-end;font-size:13px}.sheet h2{text-align:center;margin:18px 0 12px;font-size:20px}.sheet h3{font-size:15px;margin:18px 0 6px}.sheet table{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:10px}.sheet th,.sheet td{border:1px solid #DCE3EE;padding:8px 10px;text-align:start;vertical-align:top}.sheet .kv th{background:#F4F7FB;width:28%;font-weight:600}.sheet .kv th.sec{background:#051D48;color:#fff;width:auto}.sheet .grid2 th{background:#F4F7FB}.sheet footer{margin-top:16px;font-size:12px;color:#5A6A82;border-top:1px solid #E0E6EF;padding-top:8px}`;
ACT['form-sheet'] = el => { const r = D.requests.map[el.dataset.id]; if (!r || !canViewReq(r)) return; openModal('النموذج المعبأ — ' + r.ref, `<style>${SHEET_CSS}</style>${formSheetHtml(r)}`, `<button class="btn pri" data-act="form-sheet-dl" data-id="${r.id}">${ic('down')} تنزيل النموذج</button><button class="btn" data-act="open-req" data-id="${r.id}">رجوع للطلب</button>`, true); };
ACT['form-sheet-dl'] = el => { const r = D.requests.map[el.dataset.id]; saveFile(`${r.ref}.html`, `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${esc(r.typeName)} ${esc(r.ref)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap"><style>body{background:#f3f5f9;padding:24px}${SHEET_CSS}</style><body>${formSheetHtml(r)}</body></html>`, 'text/html;charset=utf-8'); };

/* ============ Visual designer: request forms, custom fields, custom screens ============ */
// modes: 'type' (request/e-form: fields+flow+settings) · 'fields' (custom fields of an entity) · 'screen' (custom screen)
const CF_ENTITIES = { employee: 'ملف الموظف', shipment: 'الشحنات الواردة', asset: 'العهد والأصول', broker: 'المخلصون', course: 'الدورات التدريبية', candidate: 'المرشحون' };
function openDesigner(mode, id) {
  let t;
  if (mode === 'type') { const src = id ? D.requestTypes.map[id] : null; t = src ? clone(strip(src)) : { name: '', code: 'F' + Date.now().toString(36).slice(-4).toUpperCase(), category: S.dzCat || 'general', active: true, featured: false, icon: 'file', order: 60, fields: [], stages: [{ name: 'المدير المباشر', mode: 'any', assignees: [{ kind: 'manager' }], slaHours: 24, actionLabel: 'اعتماد' }], escalateRole: 'hrManager' }; S.dzCat = null; }
  else if (mode === 'fields') t = { fields: clone((SET().customFields || {})[id] || []) };
  else { const sc = (SET().customScreens || []).find(x => x.id === id); t = sc ? clone(sc) : { id: 'cs' + Date.now().toString(36), name: '', icon: 'list', group: 'سجلات مخصصة', description: '', prefix: 'REC', viewRoles: [], editRoles: [], fields: [] }; }
  t.fields = (t.fields || []).map(f => ({ ...f, _id: newId() }));
  S.dz = { mode, id: id || null, t, sel: t.fields.length ? 0 : -1, tab: 'fields', dirty: false, isNew: !id || (mode === 'screen' && !(SET().customScreens || []).some(x => x.id === id)) };
  go('designer');
}
function dzTitle() { const z = S.dz; if (z.mode === 'type') return z.isNew ? 'تصميم نموذج إلكتروني جديد' : 'تصميم: ' + z.t.name; if (z.mode === 'fields') return 'الحقول الإضافية — ' + CF_ENTITIES[z.id]; return z.isNew ? 'شاشة جديدة' : 'تصميم شاشة: ' + z.t.name; }
VIEWS.designer = () => {
  const z = S.dz; if (!z) return empty('لا يوجد تصميم مفتوح');
  const tabsList = [['fields', 'حقول النموذج'], ...(z.mode === 'type' ? [['flow', 'خط سير الموافقات']] : []), ...(z.mode !== 'fields' ? [['settings', 'الإعدادات']] : []), ['preview', 'معاينة']];
  const tb = `<div class="tabs" role="tablist">${tabsList.map(([k, l]) => `<button role="tab" aria-selected="${z.tab === k}" data-act="dz-tab" data-k="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (z.tab === 'fields') body = `<div class="dz"><aside class="dz-pal card"><h2>إضافة حقل</h2><div class="dz-types">${(z.mode === 'type' ? Object.keys(FIELD_TYPES2) : BASIC_TYPES).map(k => `<button class="dz-type" data-act="dz-add" data-k="${k}">${ic(FIELD_TYPES2[k][1])}<span>${FIELD_TYPES2[k][0]}</span></button>`).join('')}</div></aside><section class="dz-canvas card" id="dz-canvas">${dzCanvas()}</section><aside class="dz-props card" id="dz-props">${dzProps()}</aside></div>`;
  else if (z.tab === 'flow') body = dzFlow();
  else if (z.tab === 'settings') body = dzSettings();
  else body = dzPreview();
  return `<div class="row small" style="margin-bottom:8px"><a href="#" data-act="dz-back">→ رجوع</a></div>${pageHead(dzTitle(), z.mode === 'type' ? 'صمّم الحقول وخط سير الموافقات، ثم احفظ لينشر النموذج للموظفين.' : z.mode === 'fields' ? 'الحقول المضافة هنا تظهر في شاشة الإدخال والعرض لهذا القسم، وتُحفظ مع كل سجل.' : 'شاشة جديدة تظهر في القائمة الجانبية، بحقولها وجدولها وإدخالها واستيرادها من Excel.', `<span class="small muted" id="dz-dirty">${z.dirty ? 'تعديلات غير محفوظة' : ''}</span><button class="btn pri" data-act="dz-save">${ic('check')} حفظ ونشر</button>`)}${tb}${body}`;
};
function dzCanvas() {
  const z = S.dz; const fs = z.t.fields;
  if (!fs.length) return `<div class="empty">النموذج فارغ. اختر نوع حقل من القائمة لإضافته.</div>`;
  return `<div class="dz-form">${fs.map((f, i) => `<div class="dz-item ${i === z.sel ? 'sel' : ''} ${f.type === 'section' ? 'is-sec' : ''} ${f.width === 'half' ? 'half' : ''}" data-act="dz-sel" data-i="${i}" tabindex="0">
    ${f.type === 'section' ? `<div class="dz-sec">${esc(f.label || 'عنوان قسم')}</div>` : `<div class="dz-lab">${esc(f.label || 'حقل بدون عنوان')}${f.required ? ' <span class="req">*</span>' : ''} <span class="tag">${FIELD_TYPES2[f.type]?.[0] || f.type}</span></div><div class="dz-ghost">${dzGhost(f)}</div>`}
    <div class="dz-tools"><button class="icon-btn" data-act="dz-move" data-i="${i}" data-d="-1" aria-label="أعلى" ${i ? '' : 'disabled'}>${ic('au')}</button><button class="icon-btn" data-act="dz-move" data-i="${i}" data-d="1" aria-label="أسفل" ${i < fs.length - 1 ? '' : 'disabled'}>${ic('ad')}</button><button class="icon-btn" data-act="dz-dup" data-i="${i}" aria-label="تكرار" title="تكرار">${ic('plus')}</button><button class="icon-btn" data-act="dz-del" data-i="${i}" aria-label="حذف">${ic('x')}</button></div></div>`).join('')}</div>`;
}
function dzGhost(f) {
  if (['select', 'employee', 'leaveType', 'course', 'asset', 'payElement', 'personalField', 'form'].includes(f.type)) return `<span class="gbox">— اختر — ▾</span>`;
  if (f.type === 'radio' || f.type === 'checks') return optList(f).slice(0, 4).map(o => `<span class="gopt">${f.type === 'radio' ? '◯' : '☐'} ${esc(o)}</span>`).join('') || '<span class="muted">أضف الخيارات</span>';
  if (f.type === 'checkbox') return `<span class="gopt">☐ ${esc(f.hint || 'أقر بصحة البيانات')}</span>`;
  if (f.type === 'textarea') return `<span class="gbox tall"></span>`;
  return `<span class="gbox">${f.type === 'date' ? 'يوم/شهر/سنة' : f.type === 'time' ? '--:--' : ''}</span>`;
}
function dzProps() {
  const z = S.dz; const f = z.t.fields[z.sel]; if (!f) return `<h2>خصائص الحقل</h2><div class="empty">اختر حقلًا لتعديل خصائصه</div>`;
  const P = (k, l, inp) => `<div class="fld"><label for="dzp-${k}">${l}</label>${inp}</div>`;
  const I = (k, type = 'text', ph = '') => `<input id="dzp-${k}" data-dzp="${k}" type="${type}" value="${esc(f[k] ?? '')}" ${ph ? `placeholder="${esc(ph)}"` : ''}>`;
  const hasOpts = ['select', 'radio', 'checks'].includes(f.type);
  return `<h2>خصائص الحقل <small>${FIELD_TYPES2[f.type]?.[0]}</small></h2><div class="dz-pform">
    ${P('label', f.type === 'section' ? 'عنوان القسم' : 'عنوان الحقل', I('label'))}
    ${f.type !== 'section' ? `
    ${P('type', 'نوع الحقل', `<select id="dzp-type" data-dzp="type">${(z.mode === 'type' ? Object.keys(FIELD_TYPES2) : BASIC_TYPES).filter(k => k !== 'section').map(k => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${FIELD_TYPES2[k][0]}</option>`).join('')}</select>`)}
    ${hasOpts ? P('options', 'الخيارات (كل خيار في سطر)', `<textarea id="dzp-options" data-dzp="options" rows="4">${esc(optList(f).join('\n'))}</textarea>`) : ''}
    ${P('hint', f.type === 'checkbox' ? 'نص الإقرار' : 'تلميح يظهر تحت الحقل', I('hint'))}
    ${f.type === 'number' ? `<div class="row" style="flex-wrap:nowrap">${P('min', 'الحد الأدنى', I('min', 'number'))}${P('max', 'الحد الأعلى', I('max', 'number'))}</div>` : ''}
    ${P('width', 'العرض', `<select id="dzp-width" data-dzp="width"><option value="">تلقائي</option><option value="full" ${f.width === 'full' ? 'selected' : ''}>عرض كامل</option><option value="half" ${f.width === 'half' ? 'selected' : ''}>نصف السطر</option></select>`)}
    <label class="checks"><input type="checkbox" data-dzp="required" ${f.required ? 'checked' : ''}> حقل إلزامي</label>
    ${z.mode !== 'type' ? `<label class="checks"><input type="checkbox" data-dzp="inTable" ${f.inTable !== false ? 'checked' : ''}> يظهر كعمود في الجدول</label>` : ''}
    <details><summary class="small muted" style="cursor:pointer">متقدم</summary>${P('key', 'المفتاح البرمجي (يُستخدم في Excel والتقارير)', I('key'))}</details>` : ''}
  </div>`;
}
function dzStageEditor(st, i, n) {
  const kinds = [['manager', 'المدير المباشر'], ['deptManager', 'مدير الإدارة'], ['role', 'دور وظيفي'], ['employee', 'موظف محدد']];
  return `<div class="card dz-stage"><div class="row" style="justify-content:space-between"><b>المرحلة ${i + 1}</b><div class="row" style="gap:2px"><button class="icon-btn" data-act="dzs-move" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="قبل">${ic('au')}</button><button class="icon-btn" data-act="dzs-move" data-i="${i}" data-d="1" ${i < n - 1 ? '' : 'disabled'} aria-label="بعد">${ic('ad')}</button><button class="icon-btn" data-act="dzs-del" data-i="${i}" aria-label="حذف">${ic('x')}</button></div></div>
    <div class="form"><div class="fld"><label>اسم المرحلة</label><input data-dzs="${i}|name" value="${esc(st.name)}"></div><div class="fld"><label>المدة المستهدفة (ساعات)</label><input type="number" min="1" data-dzs="${i}|slaHours" value="${esc(st.slaHours)}"></div><div class="fld"><label>اسم زر الاعتماد</label><input data-dzs="${i}|actionLabel" value="${esc(st.actionLabel || 'اعتماد')}"></div></div>
    <div class="small muted" style="margin:8px 0 4px">من يعتمد هذه المرحلة؟</div>
    ${st.assignees.map((a, j) => `<div class="row dz-appr"><select data-dza="${i}|${j}|kind" aria-label="نوع المعتمد">${kinds.map(([k, l]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${a.kind === 'role' ? `<select data-dza="${i}|${j}|role" aria-label="الدور"><option value="">— الدور —</option>${ASSIGNABLE_ROLES.map(r => `<option value="${r}" ${a.role === r ? 'selected' : ''}>${ROLES[r]}</option>`).join('')}</select>` : a.kind === 'employee' ? `<select data-dza="${i}|${j}|empId" aria-label="الموظف"><option value="">— الموظف —</option>${D.employees.list.filter(e => e.status !== 'terminated').sort(by('nameAr')).map(e => `<option value="${e.id}" ${a.empId === e.id ? 'selected' : ''}>${esc(e.nameAr)}</option>`).join('')}</select>` : ''}${st.assignees.length > 1 ? `<button class="btn sm ghost" data-act="dza-del" data-i="${i}" data-j="${j}">إزالة</button>` : ''}</div>`).join('')}
    <div class="row" style="margin-top:6px"><button class="btn sm" data-act="dza-add" data-i="${i}">${ic('plus')} معتمد آخر</button>${st.assignees.length > 1 ? `<select data-dzs="${i}|mode" aria-label="طريقة الاعتماد"><option value="any" ${st.mode !== 'all' ? 'selected' : ''}>يكفي اعتماد أحدهم</option><option value="all" ${st.mode === 'all' ? 'selected' : ''}>يلزم اعتماد الجميع (مسار متوازٍ)</option></select>` : ''}</div></div>`;
}
function dzFlow() {
  const z = S.dz; const st = z.t.stages || (z.t.stages = []);
  return `<section class="card" style="margin-bottom:14px"><h2>خط سير الموافقات <small>معاينة بأسماء المعتمدين لو قدّمت أنت الطلب</small></h2><div id="dz-flowprev">${flowTrack(typeSteps(z.t, S.meId))}</div></section>
  <div class="note small" style="margin-bottom:12px">صاحب الطلب لا يعتمد طلبه أبدًا. إذا لم يوجد معتمد لمرحلة (مثل موظف بلا مدير) يُحوَّل الطلب تلقائيًا إلى مدير الموارد البشرية. الطلبات المفتوحة تكمل بمسارها القديم.</div>
  <div class="grid g2" id="dz-stages">${st.map((s, i) => dzStageEditor(s, i, st.length)).join('')}</div>
  <div class="row" style="margin-top:12px"><button class="btn" data-act="dzs-add">${ic('plus')} إضافة مرحلة</button><span class="small muted">بدون مراحل = يُعتمد الطلب تلقائيًا عند الإرسال</span></div>`;
}
function dzSettings() {
  const z = S.dz; const t = z.t; const F = (k, l, o = {}) => fld('dzt_' + k, l, { ...o, value: t[k] });
  if (z.mode === 'screen') return `<form class="form card" data-dzform="1">${F('name', 'اسم الشاشة', { required: true })}${F('group', 'مجموعة القائمة الجانبية', { hint: 'مثل: الخدمات، المشتريات والإمداد، سجلات مخصصة' })}${F('icon', 'الأيقونة', { type: 'select', blank: false, options: Object.keys(ICONS).map(k => [k, k]) })}${F('prefix', 'بادئة الرقم المرجعي', { hint: 'مثال: VIO لتصبح VIO-2026-00001' })}${F('description', 'وصف يظهر أعلى الشاشة', { full: true })}
    ${fld('dzt_viewRoles', 'من يرى الشاشة (فارغ = كل الموظفين)', { type: 'checks', options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]).concat([['manager', ROLES.manager]]), value: t.viewRoles || [], full: true })}
    ${fld('dzt_editRoles', 'من يضيف ويعدّل (فارغ = نفس من يرى)', { type: 'checks', options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]).concat([['manager', ROLES.manager]]), value: t.editRoles || [], full: true })}</form>`;
  return `<form class="form card" data-dzform="1">${F('name', 'اسم النموذج / الخدمة', { required: true })}${F('code', 'الرمز', { required: true })}${F('category', 'التصنيف', { type: 'select', blank: false, options: Object.entries(CATS) })}${F('icon', 'الأيقونة', { type: 'select', blank: false, options: Object.keys(ICONS).map(k => [k, k]) })}
    ${F('effect', 'الأثر عند الاكتمال', { type: 'select', blank: false, options: Object.entries(EFFECTS), hint: 'النماذج الجديدة عادةً بدون أثر تلقائي' })}${F('templateId', 'قالب الخطاب (للخطابات)', { type: 'select', options: D.templates.list.map(x => [x.id, x.name]) })}${F('escalateRole', 'التصعيد عند التأخير إلى', { type: 'select', blank: false, options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]) })}${F('order', 'الترتيب', { type: 'number' })}
    ${F('description', 'وصف مختصر', { full: true })}${F('instructions', 'تعليمات تظهر أعلى النموذج', { type: 'textarea', full: true })}
    ${fld('dzt_roles', 'متاح فقط لـ (فارغ = كل الموظفين)', { type: 'checks', options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]), value: t.roles || [], full: true })}
    ${F('active', 'الحالة', { type: 'checkbox', cbLabel: 'منشور ومتاح للموظفين' })}${F('featured', 'العرض', { type: 'checkbox', cbLabel: 'ضمن الخدمات الأكثر استخدامًا' })}${F('needsAttachment', 'المرفقات', { type: 'checkbox', cbLabel: 'المرفق إلزامي' })}${F('sensitive', 'السرية', { type: 'checkbox', cbLabel: 'سري (لصاحبه والمعتمدين فقط)' })}</form>`;
}
function dzPreview() {
  const z = S.dz; const t = z.t;
  return `<div class="grid g2"><section class="card"><h2>كما يراه المستخدم</h2>${t.instructions ? `<div class="note" style="margin-bottom:10px">${esc(t.instructions)}</div>` : ''}<form class="form" id="dz-preview-form">${t.fields.map(f => reqFieldHtml(f, undefined, 'pv_')).join('') || empty('لا توجد حقول')}</form></section>
  ${z.mode === 'type' ? `<section class="card"><h2>خط سير الموافقات</h2>${flowTrack(typeSteps(t, S.meId))}</section>` : ''}</div>`;
}
function dzMark() { S.dz.dirty = true; const d = $('#dz-dirty'); if (d) d.textContent = 'تعديلات غير محفوظة'; }
function dzRedraw(part) { if (part === 'canvas' || !part) { const c = $('#dz-canvas'); if (c) c.innerHTML = dzCanvas(); } if (part === 'props' || !part) { const p = $('#dz-props'); if (p) p.innerHTML = dzProps(); } if (part === 'flow') { const p = $('#dz-flowprev'); if (p) p.innerHTML = flowTrack(typeSteps(S.dz.t, S.meId)); } }
ACT['dz-tab'] = el => { S.dz.tab = el.dataset.k; renderView(); };
ACT['dz-add'] = el => { const z = S.dz; const k = el.dataset.k; const f = { _id: newId(), key: 'f' + Math.random().toString(36).slice(2, 7), label: k === 'section' ? 'قسم جديد' : FIELD_TYPES2[k][0], type: k, required: false }; if (['select', 'radio', 'checks'].includes(k)) f.options = 'الخيار الأول، الخيار الثاني'; const at = z.sel >= 0 ? z.sel + 1 : z.t.fields.length; z.t.fields.splice(at, 0, f); z.sel = at; dzMark(); dzRedraw(); };
ACT['dz-sel'] = (el, e) => { if (e.target.closest('.dz-tools')) return; S.dz.sel = +el.dataset.i; dzRedraw(); const i = $('#dzp-label'); if (i) i.focus(); };
ACT['dz-move'] = el => { const z = S.dz; const i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= z.t.fields.length) return; [z.t.fields[i], z.t.fields[j]] = [z.t.fields[j], z.t.fields[i]]; z.sel = j; dzMark(); dzRedraw(); };
ACT['dz-dup'] = el => { const z = S.dz; const i = +el.dataset.i; const c = { ...clone(z.t.fields[i]), _id: newId(), key: 'f' + Math.random().toString(36).slice(2, 7), label: z.t.fields[i].label + ' (نسخة)' }; z.t.fields.splice(i + 1, 0, c); z.sel = i + 1; dzMark(); dzRedraw(); };
ACT['dz-del'] = el => { const z = S.dz; z.t.fields.splice(+el.dataset.i, 1); z.sel = Math.min(z.sel, z.t.fields.length - 1); dzMark(); dzRedraw(); };
ACT['dzs-add'] = () => { S.dz.t.stages.push({ name: 'مرحلة جديدة', mode: 'any', assignees: [{ kind: 'role', role: 'hrManager' }], slaHours: 24, actionLabel: 'اعتماد' }); dzMark(); renderView(); };
ACT['dzs-del'] = el => { S.dz.t.stages.splice(+el.dataset.i, 1); dzMark(); renderView(); };
ACT['dzs-move'] = el => { const s = S.dz.t.stages; const i = +el.dataset.i, j = i + +el.dataset.d; [s[i], s[j]] = [s[j], s[i]]; dzMark(); renderView(); };
ACT['dza-add'] = el => { S.dz.t.stages[+el.dataset.i].assignees.push({ kind: 'role', role: '' }); dzMark(); renderView(); };
ACT['dza-del'] = el => { S.dz.t.stages[+el.dataset.i].assignees.splice(+el.dataset.j, 1); dzMark(); renderView(); };
ACT['dz-back'] = () => { if (S.dz?.dirty) return confirmBox('توجد تعديلات غير محفوظة. الخروج بدون حفظ؟', () => { const m = S.dz.mode; S.dz = null; dzExit(m); }, 'خروج بدون حفظ'); const m = S.dz?.mode; S.dz = null; dzExit(m); };
function dzExit(m) { if (m === 'type') { S.tabs.set = 'types'; go('settings'); } else { S.tabs.set = m === 'fields' ? 'cfields' : 'screens'; go('settings'); } }
document.addEventListener('input', e => {
  const t = e.target; if (!S.dz) return;
  if (t.dataset.dzp) { const f = S.dz.t.fields[S.dz.sel]; if (!f) return; const k = t.dataset.dzp; f[k] = t.type === 'checkbox' ? t.checked : k === 'options' ? t.value.split('\n').map(s => s.trim()).filter(Boolean).join('، ') : t.value; dzMark(); dzRedraw('canvas'); if (k === 'type') dzRedraw('props'); }
  else if (t.dataset.dzs) { const [i, k] = t.dataset.dzs.split('|'); const st = S.dz.t.stages[+i]; st[k] = k === 'slaHours' ? Number(t.value) || 0 : t.value; dzMark(); dzRedraw('flow'); }
  else if (t.closest('[data-dzform]') && t.name?.startsWith('dzt_')) { const k = t.name.replace(/^dzt_/, '').replace(/\[\]$/, ''); if (t.name.endsWith('[]')) S.dz.t[k] = $$(`[name="${t.name}"]:checked`).map(x => x.value); else S.dz.t[k] = t.type === 'checkbox' ? t.checked : t.value; dzMark(); }
});
document.addEventListener('change', e => {
  const t = e.target; if (!S.dz) return;
  if (t.dataset.dza) { const [i, j, k] = t.dataset.dza.split('|'); const a = S.dz.t.stages[+i].assignees[+j]; if (k === 'kind') { S.dz.t.stages[+i].assignees[+j] = { kind: t.value }; } else a[k] = t.value; dzMark(); renderView(); }
  else if (t.dataset.dzs && t.tagName === 'SELECT') { const [i, k] = t.dataset.dzs.split('|'); S.dz.t.stages[+i][k] = t.value; dzMark(); dzRedraw('flow'); }
  else if (t.dataset.dzp && (t.tagName === 'SELECT' || t.type === 'checkbox')) { const f = S.dz.t.fields[S.dz.sel]; f[t.dataset.dzp] = t.type === 'checkbox' ? t.checked : t.value; dzMark(); dzRedraw(); }
  else if (t.closest('[data-dzform]') && t.name?.startsWith('dzt_') && (t.type === 'checkbox' || t.tagName === 'SELECT')) { const k = t.name.replace(/^dzt_/, '').replace(/\[\]$/, ''); if (t.name.endsWith('[]')) S.dz.t[k] = $$(`[name="${t.name}"]:checked`).map(x => x.value); else S.dz.t[k] = t.type === 'checkbox' ? t.checked : t.value; dzMark(); }
});
ACT['dz-save'] = async el => {
  const z = S.dz; const t = clone(z.t);
  const fields = t.fields.map(f => { const o = { ...f }; delete o._id; ['min', 'max'].forEach(k => { if (o[k] === '' || o[k] == null) delete o[k]; else o[k] = Number(o[k]); }); return o; });
  const errs = [];
  fields.forEach((f, i) => { if (!f.label?.trim()) errs.push(`الحقل رقم ${i + 1} بدون عنوان`); if (f.type !== 'section' && !/^[A-Za-z][A-Za-z0-9_]*$/.test(f.key || '')) errs.push(`مفتاح الحقل «${f.label}» يجب أن يبدأ بحرف إنجليزي`); if (['select', 'radio', 'checks'].includes(f.type) && !optList(f).length) errs.push(`أضف خيارات للحقل «${f.label}»`); });
  const keys = fields.filter(f => f.type !== 'section').map(f => f.key); if (new Set(keys).size !== keys.length) errs.push('مفاتيح الحقول مكررة');
  if (z.mode === 'type') {
    if (!t.name?.trim()) errs.push('اكتب اسم النموذج في تبويب الإعدادات'); if (!t.code?.trim()) errs.push('اكتب رمز النموذج');
    if (D.requestTypes.list.some(x => x.code === t.code && x.id !== z.id)) errs.push('الرمز مستخدم لنموذج آخر');
    (t.stages || []).forEach((s, i) => { if (!s.name?.trim()) errs.push(`المرحلة ${i + 1} بدون اسم`); s.assignees.forEach(a => { if (a.kind === 'role' && !a.role) errs.push(`حدد الدور في المرحلة ${i + 1}`); if (a.kind === 'employee' && !a.empId) errs.push(`حدد الموظف في المرحلة ${i + 1}`); }); });
  }
  if (z.mode === 'screen' && !t.name?.trim()) errs.push('اكتب اسم الشاشة في تبويب الإعدادات');
  if (errs.length) return toast(errs.slice(0, 4).join(' — '), true);
  el.disabled = true;
  try {
    if (z.mode === 'type') {
      const doc = { ...t, fields, order: Number(t.order || 60), active: t.active !== false, effect: t.effect || null, templateId: t.templateId || null, updatedAt: nowISO(), updatedById: S.meId };
      const id = z.id || newId(); await put('requestTypes', id, doc); z.id = id; z.isNew = false;
      await audit('حفظ تصميم نموذج', 'requestType', id, `${t.code} ${t.name} — ${fields.length} حقل، ${(t.stages || []).length} مرحلة`);
    } else if (z.mode === 'fields') {
      await patch('settings', 'main', { customFields: { ...(SET().customFields || {}), [z.id]: fields } }); await audit('تعديل الحقول الإضافية', 'settings', z.id, CF_ENTITIES[z.id] + ': ' + fields.map(f => f.label).join('، '));
    } else {
      const list = (SET().customScreens || []).filter(x => x.id !== t.id); list.push({ ...t, fields, prefix: (t.prefix || 'REC').replace(/[^A-Za-z]/g, '').toUpperCase() || 'REC' });
      await patch('settings', 'main', { customScreens: list }); z.isNew = false; await audit('حفظ شاشة مخصصة', 'settings', t.id, t.name);
    }
    z.dirty = false; toast('تم الحفظ والنشر'); renderView();
  } finally { el.disabled = false; }
};
ACT['dz-open'] = el => { if (!can('settings.workflow')) return toast('تصميم النماذج متاح لمدير النظام ومدير الموارد البشرية', true); if (el.dataset.cat) S.dzCat = el.dataset.cat; openDesigner('type', el.dataset.id); };
document.addEventListener('submit', e => { if (e.target.closest('[data-dzform]') || e.target.closest('.dz-form') || e.target.closest('#dz-preview-form')) e.preventDefault(); });
function eformsHtml() {
  const ts = D.requestTypes.list.filter(t => t.active !== false && (!t.roles?.length || t.roles.some(r => hasRole(r))) && typeAllowed(t)).sort(by('order'));
  const wf = can('settings.workflow');
  const groups = Object.keys(CATS).filter(c => ts.some(t => t.category === c));
  return `<p class="small muted" style="margin:0 0 12px">اختر النموذج، عبّئه، ويمر تلقائيًا على خط سير الموافقات المحدد له. بعد الاعتماد يمكن تنزيله كمستند.</p>` + (groups.map(c => `<section style="margin-bottom:18px"><h2 style="font-size:15.5px;margin-bottom:8px">${esc(CATS[c])}</h2><div class="grid g3">${ts.filter(t => t.category === c).map(t => `<div class="card ef"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="sic">${ic(t.icon || 'file')}</span><div style="min-width:0"><b>${esc(t.name)}</b><div class="small muted">${(t.fields || []).filter(f => f.type !== 'section').length} حقل · ${(t.stages || []).length ? (t.stages || []).length + ' مرحلة اعتماد' : 'بدون اعتماد'}</div></div></div><div class="ef-flow small">${['أنت', ...(t.stages || []).map(s => s.name)].map(esc).join(' <span class="muted">←</span> ')}</div><div class="row"><button class="btn sm pri" data-act="new-req" data-id="${t.id}">تعبئة النموذج</button>${wf ? `<button class="btn sm ghost" data-act="dz-open" data-id="${t.id}">تصميم</button>` : ''}</div></div>`).join('')}</div></section>`).join('') || empty('لا توجد نماذج إلكترونية منشورة'));
}
