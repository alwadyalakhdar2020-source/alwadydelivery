'use strict';
/* ===== Task management & performance follow-up (HR): department, priority, status, % done, start/due dates; dashboard, department and employee performance, monthly completion, calendar.
   Builds on the existing tasks collection: old tasks keep working (no priority = medium, status derived from done/due). ===== */
const TK_PRIO = { high: ['عالية', '#B42318'], medium: ['متوسطة', '#C27C00'], low: ['منخفضة', '#1E7B3C'] };
const TK_ST = { notstarted: ['لم تبدأ', '#667085'], inprogress: ['قيد التنفيذ', '#1F6FB2'], done: ['مكتملة', '#1E7B3C'], late: ['متأخرة', '#B42318'] };
const tkToday = () => todayISO();
const tkStatus = t => t.done ? 'done' : (t.due && t.due < tkToday()) ? 'late' : (t.status === 'inprogress' || (Number(t.progress) || 0) > 0) ? 'inprogress' : 'notstarted';
const tkProg = t => t.done ? 100 : Math.max(0, Math.min(100, Number(t.progress) || 0));
const tkPrio = t => TK_PRIO[t.priority] ? t.priority : 'medium';
const tkDept = t => t.deptId || emp(t.assigneeId)?.deptId || emp(t.empId)?.deptId || '';
const tkOwnerName = t => t.assigneeId ? empName(t.assigneeId) : (ROLES[t.role] || '—');
const tkAll = () => can('emp.edit') || can('tasks.admin') || can('settings.manage');
const tkMine = t => taskOwners(t).includes(S.meId);
const tkVisible = t => tkAll() || tkMine(t) || t.byId === S.meId || (t.assigneeId && t.assigneeId !== S.meId && inScope(t.assigneeId)) || D.orgunits.list.some(u => u.managerId === S.meId && u.id === tkDept(t));
const tkCanEdit = t => tkAll() || t.byId === S.meId;
const tkCanUpdate = t => tkCanEdit(t) || tkMine(t);
const tkPill = (lab, col) => `<span style="display:inline-block;white-space:nowrap;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:700;color:#fff;background:${col}">${esc(lab)}</span>`;
const tkStPill = t => { const s = tkStatus(t); return tkPill(TK_ST[s][0], TK_ST[s][1]); };
const tkPrPill = t => { const p = tkPrio(t); return tkPill(TK_PRIO[p][0], TK_PRIO[p][1]); };
const tkBar = p => `<div style="display:flex;align-items:center;gap:6px;min-width:110px"><div style="flex:1;height:7px;background:#EDECED;border-radius:9px;overflow:hidden"><i style="display:block;height:100%;width:${p}%;background:${p >= 100 ? '#38AC57' : p >= 50 ? '#34BEF0' : '#F39235'}"></i></div><b class="num" style="font-size:12px">${p}%</b></div>`;
const tkLate = t => tkStatus(t) === 'late' ? daysBetween(t.due, tkToday()) : 0;
const tkUnits = () => D.orgunits.list.filter(u => u.active !== false).sort(by('name'));
const tkCss = `<style>.tk-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0 12px}.tk-k .kpi b{font-size:26px}
.tk-g{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:900px){.tk-g{grid-template-columns:1fr}}
.tk-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.tk-cal .h{font-weight:700;text-align:center;padding:6px 0;background:#051D48;color:#fff;border-radius:6px;font-size:13px}
.tk-cal .d{min-height:96px;border:1px solid var(--line,#e3e6ea);border-radius:8px;padding:4px;background:var(--surface,#fff);overflow:hidden}.tk-cal .d.we{background:#FFF4F2}.tk-cal .d.out{opacity:.35}.tk-cal .d.today{outline:2px solid #38AC57}
.tk-cal .n{font-size:12px;font-weight:700;opacity:.7}.tk-cal .t{display:block;font-size:11.5px;line-height:1.35;margin-top:3px;padding:2px 5px;border-radius:5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border:0;width:100%;text-align:start}
.tk-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:6px 0 10px}.tk-filters label{display:flex;flex-direction:column;font-size:12px;gap:3px}.tk-filters select,.tk-filters input{min-height:38px}</style>`;

/* ---------- filters shared by board and lists ---------- */
function tkFilters(withPeriod) {
  const per = S.f.tkPer || 'month', dep = S.f.tkDep || '', pr = S.f.tkPri || '';
  const sel = (k, val, opts) => `<select data-act="tk-f" data-k="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="tk-filters">${withPeriod ? `<label>الفترة (حسب تاريخ الاستحقاق)${sel('tkPer', per, [['today', 'اليوم'], ['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['year', 'هذه السنة'], ['all', 'الكل']])}</label>` : ''}
    <label>القسم${sel('tkDep', dep, [['', 'كل الأقسام'], ...tkUnits().map(u => [u.id, u.name])])}</label>
    <label>الأولوية${sel('tkPri', pr, [['', 'الكل'], ...Object.entries(TK_PRIO).map(([k, v]) => [k, v[0]])])}</label></div>`;
}
function tkInPeriod(t, per) {
  if (per === 'all') return true; if (!t.due) return false; const T = tkToday();
  if (per === 'today') return t.due === T;
  if (per === 'week') { const d = new Date(T + 'T00:00:00'); const s = addDays(T, -d.getDay()); return t.due >= s && t.due <= addDays(s, 6); }
  if (per === 'month') return t.due.slice(0, 7) === T.slice(0, 7);
  return t.due.slice(0, 4) === T.slice(0, 4);
}
const tkBase = () => D.tasks.list.filter(t => tkVisible(t) && (!S.f.tkDep || tkDept(t) === S.f.tkDep) && (!S.f.tkPri || tkPrio(t) === S.f.tkPri));

/* ---------- dashboard ---------- */
function tkBoard() {
  const per = S.f.tkPer || 'month'; const B = tkBase(); const R = B.filter(t => tkInPeriod(t, per)); const T = tkToday();
  const c = s => R.filter(t => tkStatus(t) === s).length; const done = c('done');
  const today = B.filter(t => !t.done && t.due === T); const late = B.filter(t => tkStatus(t) === 'late').sort(by('due'));
  let h = `<div class="tk-k">${kpi('إجمالي المهام', fmtN(R.length))}${kpi('لم تبدأ', fmtN(c('notstarted')))}${kpi('قيد التنفيذ', fmtN(c('inprogress')))}${kpi('مكتملة', fmtN(done), R.length ? Math.round(done / R.length * 100) + '% من مهام الفترة' : '')}${kpi('متأخرة', fmtN(c('late')), '', c('late') > 0)}</div>`;
  const mini = (rows, extra) => rows.length ? `<div class="tablewrap"><table><thead><tr><th>المهمة</th><th>القسم</th><th>المسؤول</th><th>الاستحقاق</th>${extra ? `<th>${extra[0]}</th>` : '<th>الأولوية</th><th>الحالة</th>'}</tr></thead><tbody>${rows.map(t => `<tr class="click" data-act="tk-open" data-id="${esc(t.id)}" tabindex="0"><td><b>${esc(t.title)}</b></td><td>${esc(unitName(tkDept(t)))}</td><td>${esc(tkOwnerName(t))}</td><td class="num">${fmtD(t.due)}</td>${extra ? `<td>${extra[1](t)}</td>` : `<td>${tkPrPill(t)}</td><td>${tkStPill(t)}</td>`}</tr>`).join('')}</tbody></table></div>` : empty('لا توجد مهام');
  h += `<div class="tk-g"><section class="card"><h2>مهام اليوم — مطلوب إنجازها (${today.length})</h2>${mini(today)}</section>
    <section class="card"><h2>المهام المتجاوزة لموعد الاستحقاق (${late.length})</h2>${mini(late.slice(0, 30), ['أيام التأخير', t => `<b style="color:#B42318">${fmtN(tkLate(t))}</b>`])}</section></div>`;
  // priority distribution & department performance
  const depMap = new Map(); R.forEach(t => { const k = tkDept(t) || '-'; const o = depMap.get(k) || { k, n: 0, done: 0, late: 0, prog: 0 }; o.n++; if (t.done) o.done++; if (tkStatus(t) === 'late') o.late++; o.prog += tkProg(t); depMap.set(k, o); });
  const D0 = [...depMap.values()].sort((a, b) => b.n - a.n);
  h += `<div class="tk-g"><section class="card"><h2>توزيع المهام حسب الأولوية</h2>${(() => { const P = Object.entries(TK_PRIO).map(([k, v]) => [v[0], R.filter(t => tkPrio(t) === k).length, v[1]]); const mx = Math.max(1, ...P.map(p => p[1])); return `<div class="bars">${P.map(([l, n, c]) => `<div class="bar"><span>${l}</span><div class="t"><i style="width:${(n / mx * 100).toFixed(1)}%;background:${c}"></i></div><b class="num">${fmtN(n)}</b></div>`).join('')}</div>`; })()}</section>
    <section class="card"><h2>متابعة أداء الأقسام</h2>${D0.length ? `<div class="tablewrap"><table><thead><tr><th>القسم</th><th>المهام</th><th>المكتملة</th><th>المتأخرة</th><th>نسبة الإنجاز</th></tr></thead><tbody>${D0.map(o => `<tr><td>${o.k === '-' ? '<span class="muted">بدون قسم</span>' : esc(unitName(o.k))}</td><td class="num">${fmtN(o.n)}</td><td class="num">${fmtN(o.done)}</td><td class="num">${o.late ? `<b style="color:#B42318">${fmtN(o.late)}</b>` : '0'}</td><td>${tkBar(Math.round(o.prog / o.n))}</td></tr>`).join('')}</tbody></table></div>` : empty('لا توجد مهام في الفترة')}</section></div>`;
  // monthly completion (current year, by due month) & employee performance
  const y = T.slice(0, 4); const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const mrows = months.map((m, i) => { const key = `${y}-${String(i + 1).padStart(2, '0')}`; const M = B.filter(t => (t.due || '').slice(0, 7) === key); return [m, M.length, M.filter(t => t.done).length]; });
  const em = new Map(); R.filter(t => t.assigneeId).forEach(t => { const o = em.get(t.assigneeId) || { id: t.assigneeId, n: 0, done: 0, ontime: 0, late: 0 }; o.n++; if (t.done) { o.done++; if (!t.due || (t.doneAt || '').slice(0, 10) <= t.due) o.ontime++; } if (tkStatus(t) === 'late') o.late++; em.set(t.assigneeId, o); });
  const E0 = [...em.values()].sort((a, b) => (b.done / b.n) - (a.done / a.n) || b.n - a.n);
  h += `<div class="tk-g"><section class="card"><h2>معدل الإنجاز الشهري — ${y}</h2><div class="bars">${mrows.map(([m, n, d]) => { const r = n ? Math.round(d / n * 100) : 0; return `<div class="bar"><span>${m}</span><div class="t"><i style="width:${r}%;background:${r >= 80 ? '#38AC57' : r >= 50 ? '#34BEF0' : '#F39235'}"></i></div><b class="num">${n ? r + '%' : '—'}</b></div>`; }).join('')}</div><p class="small muted">النسبة = المهام المكتملة ÷ المهام المستحقة في نفس الشهر.</p></section>
    <section class="card"><h2>أداء الموظفين في الفترة</h2>${E0.length ? `<div class="tablewrap"><table><thead><tr><th>الموظف</th><th>المهام</th><th>المكتملة</th><th>في موعدها</th><th>المتأخرة</th></tr></thead><tbody>${E0.map(o => `<tr><td>${esc(empName(o.id))}</td><td class="num">${fmtN(o.n)}</td><td class="num">${fmtN(o.done)} <span class="small muted">${Math.round(o.done / o.n * 100)}%</span></td><td class="num">${o.done ? Math.round(o.ontime / o.done * 100) + '%' : '—'}</td><td class="num">${o.late ? `<b style="color:#B42318">${fmtN(o.late)}</b>` : '0'}</td></tr>`).join('')}</tbody></table></div>` : empty('لا توجد مهام مسندة لموظفين في الفترة')}</section></div>`;
  return tkFilters(true) + h;
}

/* ---------- lists ---------- */
function tkList(which) {
  let rows = tkBase(); if (which === 'mine') rows = rows.filter(tkMine); else if (which === 'created') rows = rows.filter(t => t.byId === S.meId);
  const st = S.f.tkSt || 'open'; if (st === 'open') rows = rows.filter(t => !t.done); else if (st !== 'all') rows = rows.filter(t => tkStatus(t) === st);
  const stSel = `<select data-act="tk-f" data-k="tkSt" aria-label="الحالة">${[['open', 'المفتوحة'], ['notstarted', 'لم تبدأ'], ['inprogress', 'قيد التنفيذ'], ['late', 'متأخرة'], ['done', 'مكتملة'], ['all', 'الكل']].map(([k, l]) => `<option value="${k}" ${k === st ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return tkFilters(false) + dataTable('tk-' + which, [
    { k: 'no', l: '#', s: x => x.no || 0, v: x => x.no ? `<span class="num">${x.no}</span>` : '—' },
    { k: 'title', l: 'المهمة', v: x => `<b>${esc(x.title)}</b>${x.notes ? `<div class="small muted">${esc(String(x.notes).slice(0, 140))}</div>` : ''}${x.empId ? `<div class="small muted">الموظف المعني: ${esc(empName(x.empId))}</div>` : ''}` },
    { k: 'dept', l: 'القسم', s: x => unitName(tkDept(x)), v: x => tkDept(x) ? esc(unitName(tkDept(x))) : '—' },
    { k: 'owner', l: 'المسؤول', s: tkOwnerName, v: x => esc(tkOwnerName(x)) },
    { k: 'start', l: 'تاريخ الإسناد', s: x => x.startDate || (x.at || '').slice(0, 10), v: x => `<span class="num">${fmtD(x.startDate || (x.at || '').slice(0, 10))}</span>` },
    { k: 'due', l: 'الاستحقاق', s: x => x.due || '9999', v: x => x.due ? `<span class="num">${fmtD(x.due)}</span>${tkLate(x) ? `<div class="small" style="color:#B42318">متأخرة ${tkLate(x)} يوم</div>` : ''}` : '—' },
    { k: 'prio', l: 'الأولوية', s: x => ({ high: 0, medium: 1, low: 2 })[tkPrio(x)], v: tkPrPill },
    { k: 'st', l: 'الحالة', s: tkStatus, v: tkStPill },
    { k: 'prog', l: 'نسبة الإنجاز', s: tkProg, v: x => tkBar(tkProg(x)) },
    { k: 'act', l: '', nosort: true, v: x => `${!x.done && tkCanUpdate(x) ? `<button class="btn sm" data-act="tk-prog" data-id="${esc(x.id)}">تحديث الإنجاز</button> ` : ''}${tkCanEdit(x) ? `<button class="btn sm" data-act="${x.kind === 'admin' ? 'atask-edit' : 'tk-edit'}" data-id="${esc(x.id)}">تعديل</button>` : ''}` }
  ], rows.sort(by(x => x.due || '9999')), { rowAct: null, tools: stSel + ` <button class="btn sm" data-act="tk-xlsx" data-w="${which}">تصدير Excel</button>`, empty: 'لا توجد مهام' });
}

/* ---------- calendar ---------- */
function tkCal() {
  const m = S.f.tkMon || tkToday().slice(0, 7); const [y, mo] = m.split('-').map(Number); const first = new Date(y, mo - 1, 1); const start = new Date(first); start.setDate(1 - first.getDay());
  const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const B = tkBase(); const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const prev = iso(new Date(y, mo - 2, 1)).slice(0, 7), next = iso(new Date(y, mo, 1)).slice(0, 7);
  let cells = ''; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const k = iso(d); const out = d.getMonth() !== mo - 1; const we = d.getDay() === 5 || d.getDay() === 6;
    const L = B.filter(t => t.due === k);
    cells += `<div class="d ${out ? 'out' : ''} ${we ? 'we' : ''} ${k === tkToday() ? 'today' : ''}"><div class="n">${d.getDate()}</div>${L.slice(0, 4).map(t => `<button class="t" data-act="tk-open" data-id="${esc(t.id)}" title="${esc(t.title + ' — ' + tkOwnerName(t))}" style="background:${t.done ? '#38AC57' : tkStatus(t) === 'late' ? '#B42318' : TK_PRIO[tkPrio(t)][1]}">${t.done ? '✓ ' : ''}${esc(t.title)}</button>`).join('')}${L.length > 4 ? `<div class="small muted">+${L.length - 4}</div>` : ''}</div>`; }
  return tkFilters(false) + `<div class="row" style="align-items:center;gap:8px;margin-bottom:8px"><button class="btn sm" data-act="tk-mon" data-v="${prev}" aria-label="الشهر السابق">→</button><h2 style="margin:0">تقويم المهام لشهر ${names[mo - 1]} ${y}</h2><button class="btn sm" data-act="tk-mon" data-v="${next}" aria-label="الشهر التالي">←</button><button class="btn sm" data-act="tk-mon" data-v="${tkToday().slice(0, 7)}">هذا الشهر</button></div>
   <div class="tk-cal">${['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(n => `<div class="h">${n}</div>`).join('')}${cells}</div>
   <p class="small muted">الأحمر متأخرة، والأخضر مكتملة، والباقي بلون الأولوية. الجمعة والسبت مظللة.</p>`;
}

VIEWS.tasks = () => {
  const items = [...(tkAll() || D.orgunits.list.some(u => u.managerId === S.meId) || D.tasks.list.some(t => t.byId === S.meId) ? [['board', 'لوحة المتابعة']] : []), ['mine', 'مهامي'], ['created', 'أنشأتها'], ...(tkAll() ? [['all', 'كل المهام']] : []), ['cal', 'التقويم']];
  const t = tabs('tsk', items);
  const body = t.cur === 'board' ? tkBoard() : t.cur === 'cal' ? tkCal() : tkList(t.cur);
  return tkCss + pageHead('إدارة المهام ومتابعة الأداء', 'سجّل المهمة مع القسم والمسؤول والأولوية وتاريخ الاستحقاق، والمسؤول يحدّث نسبة الإنجاز، والمتأخر يطلع تلقائياً.') + t.html + body;
};

/* ---------- forms ---------- */
function tkForm(x = {}) {
  const E = activeEmps().sort(by('nameAr')).map(e => [e.id, e.nameAr]);
  return `<form class="form" id="tkf" data-form="tk" data-id="${esc(x.id || '')}">${fld('title', 'عنوان المهمة', { required: true, full: true, value: x.title })}
   ${fld('notes', 'وصف المهمة', { type: 'textarea', full: true, value: x.notes })}
   ${fld('deptId', 'القسم', { type: 'select', value: x.deptId || '', options: tkUnits().map(u => [u.id, u.name]), hint: 'لو تركته فاضي ينحسب من قسم الموظف المسؤول' })}
   ${fld('assigneeId', 'الموظف المسؤول', { type: 'select', value: x.assigneeId || '', options: E })}
   ${fld('role', 'أو إسناد إلى دور', { type: 'select', value: x.role || '', options: ASSIGNABLE_ROLES.map(r => [r, ROLES[r]]) })}
   ${fld('empId', 'الموظف المعني (اختياري)', { type: 'select', value: x.empId || '', options: E })}
   ${fld('startDate', 'تاريخ الإسناد', { type: 'date', value: x.startDate || tkToday() })}
   ${fld('due', 'تاريخ الاستحقاق', { type: 'date', value: x.due || '', required: true })}
   ${fld('priority', 'الأولوية', { type: 'select', blank: false, value: tkPrio(x), options: Object.entries(TK_PRIO).map(([k, v]) => [k, v[0]]) })}
   ${x.id ? fld('status', 'الحالة', { type: 'select', blank: false, value: x.done ? 'done' : (x.status === 'inprogress' || tkProg(x) > 0 ? 'inprogress' : 'notstarted'), options: [['notstarted', 'لم تبدأ'], ['inprogress', 'قيد التنفيذ'], ['done', 'مكتملة']] }) + fld('progress', 'نسبة الإنجاز %', { type: 'number', min: 0, max: 100, step: 5, value: tkProg(x) }) : ''}
   </form>`;
}
ACT['tk-edit'] = el => { const x = el.dataset.id ? D.tasks.map[el.dataset.id] : {}; if (el.dataset.id && (!x || !tkCanEdit(x))) return toast('ما تقدر تعدل هالمهمة', true);
  openModal(x.id ? 'تعديل مهمة: ' + x.title : 'مهمة جديدة', tkForm(x), `<button class="btn pri" form="tkf">حفظ</button>${x.id ? `<button class="btn" data-act="tk-del" data-id="${esc(x.id)}">حذف</button>` : ''}<button class="btn" data-act="close-modal">إلغاء</button>`, true); };
ACT['task-new'] = el => ACT['tk-edit']({ dataset: {} });
FORM.tk = async f => {
  const v = readForm(f); const id = f.dataset.id || ''; const cur = id ? D.tasks.map[id] : null;
  if (!v.assigneeId && !v.role) return toast('حدد الموظف المسؤول أو الدور', true);
  if (v.due && v.startDate && v.due < v.startDate) return toast('تاريخ الاستحقاق قبل تاريخ الإسناد', true);
  const st = v.status || (cur ? (cur.done ? 'done' : cur.status) : 'notstarted'); const prog = st === 'done' ? 100 : Math.max(0, Math.min(100, Number(v.progress) || 0));
  const no = cur?.no || (D.tasks.list.reduce((m, t) => Math.max(m, Number(t.no) || 0), 0) + 1);
  const t = { ...(cur ? strip(cur) : { kind: 'general', byId: S.meId, at: nowISO() }), no, title: v.title, notes: v.notes, deptId: v.deptId || emp(v.assigneeId)?.deptId || null,
    assigneeId: v.assigneeId || null, role: v.assigneeId ? null : v.role, empId: v.empId || null, startDate: v.startDate || tkToday(), due: v.due || null, priority: v.priority || 'medium',
    status: st === 'done' ? 'done' : st, progress: prog, done: st === 'done' };
  if (t.done && !cur?.done) { t.doneBy = S.meId; t.doneAt = nowISO(); } if (!t.done) { delete t.doneBy; delete t.doneAt; }
  const nid = id || newId(); await put('tasks', nid, t);
  if (!cur || cur.assigneeId !== t.assigneeId || cur.role !== t.role) await notify(taskOwners(t).filter(x => x !== S.meId), 'مهمة جديدة لك', `${t.title}${t.due ? ' — الاستحقاق ' + fmtD(t.due) : ''}`, { view: 'tasks' });
  await audit(cur ? 'تعديل مهمة' : 'إنشاء مهمة', 'task', nid, t.title); closeModal(); toast(cur ? 'انحفظت المهمة' : 'انضافت المهمة');
};
ACT['tk-del'] = el => { const x = D.tasks.map[el.dataset.id]; if (!x || !tkCanEdit(x)) return;
  confirmBox(`حذف المهمة «${esc(x.title)}»؟`, async () => { await remove('tasks', x.id); await audit('حذف مهمة', 'task', x.id, x.title); closeModal(); toast('انحذفت المهمة'); }); };
ACT['tk-prog'] = el => { const x = D.tasks.map[el.dataset.id]; if (!x || !tkCanUpdate(x)) return;
  openModal('تحديث الإنجاز: ' + x.title, `<form class="form" id="tkpf" data-form="tk-prog" data-id="${esc(x.id)}">
   ${fld('status', 'الحالة', { type: 'select', blank: false, value: x.done ? 'done' : (x.status === 'inprogress' || tkProg(x) > 0 ? 'inprogress' : 'notstarted'), options: [['notstarted', 'لم تبدأ'], ['inprogress', 'قيد التنفيذ'], ['done', 'مكتملة']] })}
   ${fld('progress', 'نسبة الإنجاز %', { type: 'number', min: 0, max: 100, step: 5, value: tkProg(x) })}
   ${fld('note', 'ملاحظة على التحديث', { type: 'textarea', full: true, hint: 'وش انعمل، أو سبب التأخير لو فيه' })}
   ${(x.updates || []).length ? `<div class="fld full"><label>آخر التحديثات</label>${x.updates.slice(-5).reverse().map(u => `<div class="small"><span class="muted">${fmtDT(u.at)} — ${esc(empName(u.byId))}:</span> ${u.progress}% ${esc(u.note || '')}</div>`).join('')}</div>` : ''}
  </form>`, `<button class="btn pri" form="tkpf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`); };
FORM['tk-prog'] = async f => {
  const v = readForm(f); const x = D.tasks.map[f.dataset.id]; if (!x) return;
  const st = v.status; const prog = st === 'done' ? 100 : Math.max(0, Math.min(100, Number(v.progress) || 0));
  if (tkLate(x) && st !== 'done' && !v.note) return toast('المهمة متأخرة — اكتب ملاحظة بسبب التأخير', true);
  if (st === 'done' && x.kind === 'admin') { closeModal(); return ACT['task-done']({ dataset: { id: x.id } }); }
  const t = { ...strip(x), status: st, progress: prog, done: st === 'done', updates: [...(x.updates || []), { at: nowISO(), byId: S.meId, progress: prog, status: st, note: v.note || '' }].slice(-40) };
  if (t.done && !x.done) { t.doneBy = S.meId; t.doneAt = nowISO(); }
  await put('tasks', x.id, t);
  if (t.done && x.byId && x.byId !== S.meId) await notify([x.byId], 'انتهت مهمة أسندتها', x.title, { view: 'tasks' });
  await audit('تحديث إنجاز مهمة', 'task', x.id, `${x.title} — ${prog}%`); closeModal(); toast('انحفظ التحديث');
};
ACT['tk-open'] = el => { const x = D.tasks.map[el.dataset.id]; if (!x) return; if (tkCanUpdate(x) && !x.done) return ACT['tk-prog'](el);
  openModal(x.title, `<div class="small">${tkPrPill(x)} ${tkStPill(x)}</div><p>${esc(x.notes || '')}</p><div class="small muted">القسم: ${esc(unitName(tkDept(x)))} · المسؤول: ${esc(tkOwnerName(x))} · الاستحقاق: ${fmtD(x.due)}</div>${tkBar(tkProg(x))}`, `<button class="btn" data-act="close-modal">إغلاق</button>`); };
ACT['tk-mon'] = el => { S.f.tkMon = el.dataset.v; scheduleRender(); };
ACT['tk-xlsx'] = el => {
  if (!window.XLSX) return toast('مكتبة Excel غير محمّلة', true);
  const rows = tkBase().filter(t => el.dataset.w === 'mine' ? tkMine(t) : el.dataset.w === 'created' ? t.byId === S.meId : true).sort(by(x => x.due || '9999')).map(t => ({
    'رقم المهمة': t.no || '', 'عنوان المهمة': t.title, 'الوصف': t.notes || '', 'القسم': tkDept(t) ? unitName(tkDept(t)) : '', 'المسؤول': tkOwnerName(t), 'تاريخ الإسناد': t.startDate || (t.at || '').slice(0, 10),
    'تاريخ الاستحقاق': t.due || '', 'الأولوية': TK_PRIO[tkPrio(t)][0], 'الحالة': TK_ST[tkStatus(t)][0], 'نسبة الإنجاز': tkProg(t) / 100, 'أيام التأخير': tkLate(t) || '' }));
  const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [8, 40, 40, 18, 20, 12, 12, 10, 12, 10, 10].map(w => ({ wch: w })); rows.forEach((_, i) => { const c = ws['J' + (i + 2)]; if (c) c.z = '0%'; });
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, 'المهام'); XLSX.writeFile(wb, `المهام_${tkToday()}.xlsx`);
};
document.addEventListener('change', e => { const a = e.target.closest?.('[data-act="tk-f"]'); if (!a) return; S.f[a.dataset.k] = a.value; scheduleRender(); });
