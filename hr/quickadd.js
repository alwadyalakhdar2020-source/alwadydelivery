'use strict';
/* ============ Unified "add" on every screen + administrative tasks with reminders ============ */

/* ---------- 1. registry: what can be added from each screen (and tab) ---------- */
const PERM_LABEL = p => PERMS[p] || p;
const A = (l, act, ok, need, data = {}) => ({ l, act, ok: !!ok, need, data });
const ADD_REG = {
  customs: () => [A('شحنة جديدة', 'ship-edit', can('customs.manage'), 'customs.manage'), ...(S.tabs.cus === 'brokers' ? [A('مخلص جديد', 'broker-edit', can('customs.manage'), 'customs.manage')] : [])],
  adminaffairs: () => [A('مهمة إدارية جديدة', 'atask-new', canAdminTasks(), 'tasks.admin'), A('طلب خدمة جديد', 'new-svc', true),
    ...(S.tabs.adm === 'assets' ? [A('أصل جديد', 'asset-edit', can('assets.manage'), 'assets.manage')] : [])],
  employees: () => [A('موظف جديد', 'emp-edit', can('emp.edit'), 'emp.edit')],
  directory: () => [A('موظف جديد', 'emp-edit', can('emp.edit'), 'emp.edit')],
  attendance: () => { const t = S.tabs.att; const m = can('att.manage');
    if (t === 'shifts') return [A('وردية جديدة', 'shift-edit', m, 'att.manage')];
    if (t === 'records' || t === 'monthly') return [A('سجل حضور يدوي', 'att-edit', m, 'att.manage')];
    return [A('طلب تصحيح حضور', 'new-req-effect', true, null, { e: 'attendanceFix' }), A('طلب إجازة', 'new-req-effect', true, null, { e: 'leave' })]; },
  forms: () => [A('نموذج أو سياسة جديدة', 'form-edit', can('forms.manage'), 'forms.manage')],
  talent: () => { const t = S.tabs.tal;
    if (t === 'reqs') return [A('طلب احتياج وظيفي', 'reqn-new', can('rec.manage') || can('team.view'), 'rec.manage')];
    if (t === 'cands') return [A('مرشح جديد', 'cand-new', can('rec.manage'), 'rec.manage')];
    if (t === 'train') return [A('دورة جديدة', 'course-edit', can('train.manage'), 'train.manage')];
    if (t === 'perf') return [A('تقييم جديد', 'review-edit', can('perf.manage'), 'perf.manage')];
    return [A('طلب تدريب', 'new-req-effect', true, null, { e: 'training' })]; },
  payroll: () => { const t = S.tabs.pay;
    if (t === 'adj') return [A('مكافأة أو خصم', 'adj-new', can('pay.manage'), 'pay.manage')];
    if (t === 'loans') return [A('طلب سلفة', 'new-req-effect', true, null, { e: 'loan' })];
    return [A('طلب تغيير مالي', 'new-req-effect', can('pay.manage') || can('emp.edit'), 'pay.manage', { e: 'finChange' })]; },
  tasks: () => [A('مهمة جديدة', 'task-new', true), A('مهمة إدارية بتذكير', 'atask-new', canAdminTasks(), 'tasks.admin')],
  mine: () => [A('طلب جديد', 'go', true, null, { v: 'new' })],
  inbox: () => [A('طلب جديد', 'go', true, null, { v: 'new' })],
  calendar: () => [A('طلب إجازة', 'new-req-effect', true, null, { e: 'leave' })],
  docs: () => [A('موظف جديد', 'emp-edit', can('emp.edit'), 'emp.edit')]
};
function matchesExisting(a) {
  return $$(`#view [data-act="${a.act}"]`).some(b => !b.dataset.id && Object.entries(a.data).every(([k, v]) => b.dataset[k] === v));
}
function injectAdds() {
  const view = $('#view'); if (!view || !S.meId) return;
  $$('.fab', document).forEach(x => x.remove());
  const reg = ADD_REG[S.view]; if (!reg) return;
  let list; try { list = reg(); } catch (e) { console.warn('add-reg', e); return; }
  if (!list.length) return;
  let bar = view.querySelector('.ph .row');
  if (!bar) { const ph = view.querySelector('.ph'); if (ph) { bar = document.createElement('div'); bar.className = 'row'; ph.appendChild(bar); } }
  if (!bar) { const tb = document.createElement('div'); tb.className = 'toolbar add-bar'; view.prepend(tb); bar = tb; }
  const attrs = a => Object.entries(a.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  let firstOk = null;
  for (const a of list) {
    if (matchesExisting(a)) { if (a.ok && !firstOk) firstOk = a; continue; }
    const b = document.createElement('span'); b.style.display = 'contents';
    b.innerHTML = a.ok ? `<button class="btn ${firstOk ? '' : 'pri'}" data-act="${a.act}"${attrs(a)}>${ic('plus')} ${esc(a.l)}</button>`
      : `<button class="btn add-locked" disabled title="${esc('يتطلب صلاحية: ' + PERM_LABEL(a.need))}" aria-label="${esc(a.l + ' — يتطلب صلاحية: ' + PERM_LABEL(a.need))}">${ic('plus')} ${esc(a.l)} <span class="lock-tag">${esc('يتطلب صلاحية')}</span></button>`;
    bar.appendChild(b.firstElementChild); if (a.ok && !firstOk) firstOk = a;
  }
  if (firstOk) document.body.insertAdjacentHTML('beforeend', `<button class="fab" data-act="${firstOk.act}"${attrs(firstOk)} aria-label="${esc(firstOk.l)}" title="${esc(firstOk.l)}">${ic('plus')}</button>`);
}
{ const _rv = renderView; renderView = function () { _rv(); try { injectAdds(); } catch (e) { console.warn(e); } }; }
ACT['new-svc'] = () => {
  const types = D.requestTypes.list.filter(t => t.active !== false && t.category === 'admin').sort(by('order'));
  if (!types.length) return toast('لا توجد أنواع طلبات خدمات مفعّلة. أضفها من الإعدادات ← النماذج الإلكترونية', true);
  openModal('طلب خدمة جديد', `<div class="set-grid">${types.map(t => `<button class="set-card" data-act="new-req" data-id="${t.id}"><span class="sic">${ic('box')}</span><span><b>${esc(t.name)}</b><small>${esc(t.description || '')}</small></span></button>`).join('')}</div>`, `<button class="btn" data-act="close-modal">إغلاق</button>`, true);
};

/* ---------- 2. administrative tasks with a reminder date/time ---------- */
DEFAULT_LISTS.adminTaskCats = ['صيانة', 'سكن', 'نقل ومواصلات', 'مشتريات واحتياج', 'نظافة وخدمات', 'تجديد عقود وتراخيص', 'سلامة', 'أخرى'];
LIST_LABELS.adminTaskCats = 'تصنيفات المهام الإدارية';
const REPEAT = { none: 'بدون تكرار', daily: 'يوميًا', weekly: 'أسبوعيًا', monthly: 'شهريًا', yearly: 'سنويًا' };
const canAdminTasks = () => can('tasks.admin') || can('admin.services');
const isAdminTask = t => t.kind === 'admin';
const fmtRem = v => v ? fmtDT(v) : '—';
const localDT = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
function shiftDate(iso, rep, isDateOnly) {
  if (!iso || rep === 'none' || !rep) return iso;
  const d = new Date(isDateOnly ? iso + 'T00:00:00' : iso);
  if (rep === 'daily') d.setDate(d.getDate() + 1); else if (rep === 'weekly') d.setDate(d.getDate() + 7); else if (rep === 'monthly') d.setMonth(d.getMonth() + 1); else if (rep === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return isDateOnly ? localISO(d) : d.toISOString();
}
function adminTasksHtml() {
  const f = S.f.atSt || 'open'; const T0 = todayISO(); const now = nowISO();
  const all = D.tasks.list.filter(isAdminTask);
  let rows = all; if (f === 'open') rows = rows.filter(x => !x.done); else if (f === 'overdue') rows = rows.filter(x => !x.done && x.due && x.due < T0); else if (f === 'today') rows = rows.filter(x => !x.done && x.remindAt && x.remindAt.slice(0, 10) <= T0); else if (f === 'done') rows = rows.filter(x => x.done);
  if (S.f.atCat) rows = rows.filter(x => x.category === S.f.atCat);
  const open = all.filter(x => !x.done);
  return `<div class="grid g4" style="margin-bottom:14px">${kpi('مهام مفتوحة', open.length)}${kpi('متأخرة عن الاستحقاق', open.filter(x => x.due && x.due < T0).length, '', open.some(x => x.due && x.due < T0))}${kpi('تذكيرات مستحقة الآن', open.filter(x => x.remindAt && x.remindAt <= now).length)}${kpi('منجزة هذا الشهر', all.filter(x => x.done && (x.doneAt || '').slice(0, 7) === monthISO()).length)}</div>` +
    dataTable('atasks', [
      { k: 'title', l: 'المهمة', v: x => `<b>${esc(x.title)}</b>${x.notes ? `<div class="small muted">${esc(x.notes)}</div>` : ''}${x.repeat && x.repeat !== 'none' ? `<div class="small"><span class="tag">${esc(REPEAT[x.repeat])}</span></div>` : ''}` },
      { k: 'category', l: 'التصنيف', v: x => esc(x.category || '—') },
      { k: 'priority', l: 'الأولوية', s: x => ['low', 'normal', 'high', 'urgent'].indexOf(x.priority), v: x => x.priority === 'urgent' ? badge('rejected', PRIORITY.urgent) : x.priority === 'high' ? badge('returned', PRIORITY.high) : esc(PRIORITY[x.priority] || PRIORITY.normal) },
      { k: 'owner', l: 'المسؤول', s: x => x.assigneeId ? empName(x.assigneeId) : ROLES[x.role] || '', v: x => esc(x.assigneeId ? empName(x.assigneeId) : (ROLES[x.role] || '—')) },
      { k: 'due', l: 'الاستحقاق', s: x => x.due || '9999', v: x => `<span class="num">${fmtD(x.due)}</span>${!x.done && x.due && x.due < T0 ? ' ' + badge('rejected', 'متأخرة') : ''}` },
      { k: 'remindAt', l: 'التذكير', s: x => x.remindAt || '9999', v: x => x.remindAt ? `<span class="num">${fmtRem(x.remindAt)}</span>${!x.done && x.remindAt <= now ? ' ' + badge('returned', 'مستحق') : ''}` : '<span class="muted small">بدون</span>' },
      { k: 'st', l: 'الحالة', s: x => x.done ? 1 : 0, v: x => x.done ? `${badge('approved', 'منجزة')}<div class="small muted">${esc(empName(x.doneBy))} · <span class="num">${fmtD(x.doneAt)}</span></div>` : badge('pending', 'مفتوحة') },
      { k: 'x', l: '', nosort: true, v: x => `<div class="row" style="gap:4px;flex-wrap:nowrap">${!x.done && (myTask(x) || canAdminTasks()) ? `<button class="btn sm ok" data-act="task-done" data-id="${x.id}">${ic('check')} تمت</button>` : ''}${canAdminTasks() || x.byId === S.meId ? `<button class="btn sm" data-act="atask-edit" data-id="${x.id}">تعديل</button>` : ''}${x.remindAt || x.due ? `<button class="btn sm ghost" data-act="task-ics" data-id="${x.id}" title="إضافة التذكير إلى تقويم الجوال أو Outlook">${ic('calendar')} للتقويم</button>` : ''}</div>` }],
      rows.sort(by(x => (x.done ? '1' : '0') + (x.remindAt || x.due || '9999'))),
      { tools: `<select data-fv="atSt" aria-label="الحالة">${[['open', 'المفتوحة'], ['today', 'تذكيرها اليوم أو قبله'], ['overdue', 'المتأخرة'], ['done', 'المنجزة'], ['all', 'الكل']].map(([k, l]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${l}</option>`).join('')}</select><select data-fv="atCat" aria-label="التصنيف"><option value="">كل التصنيفات</option>${LIST('adminTaskCats').map(c => `<option ${S.f.atCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`, empty: 'لا توجد مهام إدارية. أضف مهمة وحدد موعد التذكير.' }) +
    `<div class="note small" style="margin-top:10px">التذكير يظهر داخل المنصة (الجرس وإشعار للمسؤول) عند حلول موعده أثناء فتح المنصة أو عند أول دخول بعده. لتصلك تنبيهات على الجوال حتى والمنصة مغلقة، استخدم زر «للتقويم» لإضافة الموعد إلى تقويمك. لا توجد رسائل بريد أو SMS تلقائية.</div>`;
}
// add the tab to administrative affairs
{ const _adm = VIEWS.adminaffairs; VIEWS.adminaffairs = () => {
  const want = S.tabs.adm;
  if (want === 'atasks' && canAdminTasks()) { const h = _adm(); S.tabs.adm = 'atasks'; const tabsHtml = h.match(/<div class="tabs" role="tablist">[\s\S]*?<\/div>/)?.[0] || ''; return h.slice(0, h.indexOf(tabsHtml)) + markTab(tabsHtml) + adminTasksHtml(); }
  const h = _adm(); return canAdminTasks() ? h.replace('<div class="tabs" role="tablist">', `<div class="tabs" role="tablist"><button role="tab" aria-selected="false" data-act="tab" data-g="adm" data-k="atasks">المهام والتذكيرات</button>`) : h;
}; }
function markTab(tabsHtml) { return tabsHtml.replace(/aria-selected="true"/g, 'aria-selected="false"').replace('<div class="tabs" role="tablist">', `<div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-act="tab" data-g="adm" data-k="atasks">المهام والتذكيرات</button>`); }

function ataskForm(x = {}) {
  const def = x.id ? x : { priority: 'normal', role: 'adminOfficer', repeat: 'none', category: LIST('adminTaskCats')[0] };
  return `<form class="form" id="atf" data-form="atask" ${x.id ? `data-id="${x.id}"` : ''}>${fld('title', 'المهمة', { value: def.title, required: true, full: true })}
    ${fld('category', 'التصنيف', { type: 'select', options: LIST('adminTaskCats'), value: def.category, blank: false })}${fld('priority', 'الأولوية', { type: 'select', options: Object.entries(PRIORITY), value: def.priority, blank: false })}
    ${fld('assigneeId', 'إسناد إلى موظف', { type: 'select', value: def.assigneeId, options: activeEmps().sort(by('nameAr')).map(e => [e.id, e.nameAr]) })}${fld('role', 'أو إلى دور', { type: 'select', value: def.assigneeId ? '' : def.role, options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]) })}
    ${fld('due', 'تاريخ الاستحقاق', { type: 'date', value: def.due })}
    <div class="fld"><label for="f-remindAt">موعد التذكير (التاريخ والوقت)</label><input id="f-remindAt" name="remindAt" type="datetime-local" value="${esc(localDT(def.remindAt))}"><div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">${[['1h', 'بعد ساعة'], ['tom9', 'غدًا 9 ص'], ['due-1', 'قبل الاستحقاق بيوم'], ['due-7', 'قبل الاستحقاق بأسبوع']].map(([k, l]) => `<button type="button" class="btn sm ghost" data-act="rem-preset" data-k="${k}">${l}</button>`).join('')}</div></div>
    ${fld('repeat', 'التكرار', { type: 'select', options: Object.entries(REPEAT), value: def.repeat || 'none', blank: false })}
    ${fld('locationId', 'الموقع (اختياري)', { type: 'select', value: def.locationId, options: D.orgunits.list.filter(u => u.type === 'location').map(u => [u.id, u.name]) })}
    ${fld('assetId', 'أصل مرتبط (اختياري)', { type: 'select', value: def.assetId, options: D.assets.list.map(a => [a.id, a.name + (a.code ? ' — ' + a.code : '')]) })}
    ${fld('notes', 'ملاحظات', { type: 'textarea', value: def.notes, full: true })}</form>`;
}
ACT['atask-new'] = () => { if (!canAdminTasks()) return toast('يتطلب صلاحية: ' + PERM_LABEL('tasks.admin'), true); openModal('مهمة إدارية جديدة', ataskForm(), `<button class="btn pri" form="atf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true); };
ACT['atask-edit'] = el => { const x = D.tasks.map[el.dataset.id]; if (!x) return; openModal('تعديل مهمة: ' + x.title, ataskForm(x), `<button class="btn pri" form="atf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true); };
ACT['rem-preset'] = el => {
  const inp = $('#f-remindAt'); const due = $('#atf [name=due]')?.value; const d = new Date(); const k = el.dataset.k;
  if (k === '1h') d.setHours(d.getHours() + 1, d.getMinutes(), 0, 0);
  else if (k === 'tom9') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  else { if (!due) return toast('حدد تاريخ الاستحقاق أولًا', true); const x = new Date(due + 'T09:00:00'); x.setDate(x.getDate() - (k === 'due-1' ? 1 : 7)); d.setTime(x.getTime()); }
  inp.value = localDT(d.toISOString());
};
FORM.atask = async f => {
  const v = readForm(f); if (!v.assigneeId && !v.role) return toast('حدد موظفًا أو دورًا للمهمة', true);
  const remindAt = v.remindAt ? new Date(v.remindAt).toISOString() : null;
  if (remindAt && !f.dataset.id && remindAt < nowISO()) return toast('موعد التذكير في الماضي', true);
  const id = f.dataset.id || newId(); const cur = D.tasks.map[id];
  const t = { ...(cur ? strip(cur) : { kind: 'admin', done: false, byId: S.meId, at: nowISO() }), title: v.title, category: v.category, priority: v.priority, assigneeId: v.assigneeId || null, role: v.assigneeId ? null : v.role, due: v.due || null, remindAt, repeat: v.repeat || 'none', locationId: v.locationId || null, assetId: v.assetId || null, notes: v.notes || '', updatedAt: nowISO() };
  if (!cur || cur.remindAt !== remindAt) t.reminded = false;
  await put('tasks', id, t);
  if (!cur) await notify(taskOwners(t).filter(x => x !== S.meId), 'مهمة إدارية جديدة لك', `${t.title}${remindAt ? ' — تذكير ' + fmtDT(remindAt) : ''}`, { view: 'tasks' });
  await audit(cur ? 'تعديل مهمة إدارية' : 'إنشاء مهمة إدارية', 'task', id, `${t.title}${remindAt ? ' — تذكير ' + fmtDT(remindAt) : ''}`); closeModal(); toast(cur ? 'حُفظت المهمة' : 'أُنشئت المهمة');
};
// completing a repeating task creates the next occurrence
{ const _done = ACT['task-done']; ACT['task-done'] = async el => {
  const x = D.tasks.map[el.dataset.id]; await _done(el);
  if (x && isAdminTask(x) && x.repeat && x.repeat !== 'none') {
    const n = { ...strip(x), done: false, doneBy: null, doneAt: null, reminded: false, due: shiftDate(x.due, x.repeat, true), remindAt: shiftDate(x.remindAt, x.repeat, false), prevId: x.id, at: nowISO() };
    const nid = newId(); await put('tasks', nid, n); await audit('إنشاء تكرار مهمة', 'task', nid, `${n.title} — ${fmtD(n.due)}`); toast('أُنشئ الموعد التالي للمهمة المتكررة');
  }
}; }
// calendar file so the reminder also reaches the phone / Outlook
ACT['task-ics'] = el => {
  const x = D.tasks.map[el.dataset.id]; if (!x) return;
  const p = n => String(n).padStart(2, '0'); const loc = d => `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  const start = x.remindAt ? new Date(x.remindAt) : new Date(x.due + 'T09:00:00'); const end = new Date(start.getTime() + 30 * 60e3);
  const escI = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const rr = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[x.repeat];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HR Platform//AR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${x.id}@hr-platform`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${loc(start)}`, `DTEND:${loc(end)}`, ...(rr ? [`RRULE:FREQ=${rr}`] : []),
    `SUMMARY:${escI(x.title)}`, `DESCRIPTION:${escI([x.category, x.due ? 'الاستحقاق ' + fmtD(x.due) : '', x.notes].filter(Boolean).join(' — '))}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escI(x.title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  saveFile(`task-${(x.title || 'reminder').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.ics`, ics, 'text/calendar;charset=utf-8');
};
// reminders: shown live in the bell for the owner, and written once as a notification when due
const dueReminders = () => { const now = nowISO(); return D.tasks.list.filter(t => !t.done && t.remindAt && t.remindAt <= now && (taskOwners(t).includes(S.meId) || t.byId === S.meId)); };
{ const _ca = computedAlerts; computedAlerts = function () { const out = _ca(); for (const t of dueReminders()) if (!t.reminded) out.push({ title: 'تذكير: ' + t.title, body: `${t.category || ''}${t.due ? ' — الاستحقاق ' + fmtD(t.due) : ''}`, link: { view: 'tasks' }, bad: t.due && t.due < todayISO() }); return out; }; }
async function runReminders() {
  if (!S.ready || !S.meId || S.remBusy || !S.canWrite) return; S.remBusy = true;
  try {
    for (const t of dueReminders().filter(t => !t.reminded)) {
      await put('tasks', t.id, { ...strip(D.tasks.map[t.id]), reminded: true, remindedAt: nowISO() });
      await notify(uniq([...taskOwners(t), t.byId].filter(Boolean)), 'تذكير بمهمة: ' + t.title, `${t.category || ''}${t.due ? ' — الاستحقاق ' + fmtD(t.due) : ''}`, { view: 'tasks' });
      if (taskOwners(t).includes(S.meId)) toast('تذكير: ' + t.title);
    }
  } catch (e) { console.warn('reminders', e); } finally { S.remBusy = false; }
}
setInterval(runReminders, 60000); setTimeout(runReminders, 4000);
