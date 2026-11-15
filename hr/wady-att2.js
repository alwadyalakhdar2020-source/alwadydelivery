'use strict';
/* ===== Attendance & leave additions (Zoho People parity, phase 1):
   - On-duty request (work outside the office) → approved days recorded as present at shift times
   - Hourly permission: monthly cap + approved window excuses lateness / early leave
   - Compensatory leave: approved extra-hours requests credit a comp-off balance; those hours are no longer paid as overtime
   - Monthly accrual for selected leave types
   - Shift roster per day (rest days, different shifts), rotation patterns, shift-swap requests ===== */
Object.assign(EFFECTS, { onDuty: 'مهمة عمل خارجية (تسجيل حضور)', compCredit: 'رصيد إجازة تعويضية عن عمل إضافي', shiftSwap: 'تبديل وردية في الجدول' });
const RST_OFF = 'off';
const rosterDoc = (empId, month) => D.roster.map[empId + '_' + month];
const rosterDay = (empId, date) => rosterDoc(empId, date.slice(0, 7))?.days?.[date.slice(8)];
const isWeekend = date => (SET().weekend || [5, 6]).includes(new Date(date + 'T00:00:00').getDay());
/* is this a scheduled work day for the employee? roster wins, then weekend + holidays */
function workDay(empId, date) { const r = rosterDay(empId, date); if (r === RST_OFF) return false; if (r) return !isHoliday(date); return !isWeekend(date) && !isHoliday(date); }
function shiftFor(empId, date) { const r = rosterDay(empId, date); if (r === RST_OFF) return null; return D.shifts.map[r] || D.shifts.map[emp(empId)?.shiftId] || null; }
const apprReqs = (empId, eff) => D.requests.list.filter(r => r.empId === empId && r.effect === eff && r.status === 'approved');
const hrsBetween = (a, b) => { const x = toMin(a), y = toMin(b); return x == null || y == null ? 0 : Math.max(0, (y - x) / 60); };
const days = (from, to) => { const out = []; for (let d = from; d && to && d <= to && out.length < 400; d = addDays(d, 1)) out.push(d); return out; };

/* ---- shift resolution, lateness excused by permission, OT taken as comp-off not paid ---- */
{ const _so = shiftOf; shiftOf = function (rec) { if (rec && rec.empId && rec.date) { const r = rosterDay(rec.empId, rec.date); if (r === RST_OFF) return null; if (r && D.shifts.map[r]) return D.shifts.map[r]; } return _so(rec); }; }
{ const _ac = attCalc; attCalc = function (rec) {
    const out = _ac(rec); if (!rec || !rec.empId || !rec.date) return out;
    const sh = out.sh; const perms = apprReqs(rec.empId, 'permission').filter(r => r.data?.date === rec.date);
    if (sh && perms.length) { const st = toMin(sh.start), en = toMin(sh.end);
      perms.forEach(p => { const a = toMin(p.data.fromTime), b = toMin(p.data.toTime); if (a == null || b == null) return;
        if (out.late && a <= st + 1) { const cover = Math.max(0, b - st); out.late = Math.max(0, out.late - cover); out.permitted = true; }
        if (out.early && b >= en - 1) { const cover = Math.max(0, en - a); out.early = Math.max(0, out.early - cover); out.permitted = true; } }); }
    if (apprReqs(rec.empId, 'compCredit').some(r => r.data?.date === rec.date)) { out.compOff = out.ot; out.ot = 0; }
    return out; }; }
/* monthly report: work days follow the roster (rest days and extra working days) */
monthly = function (month, empIds) {
  const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const t = todayISO();
  const all = []; for (let d = 1; d <= last; d++) { const iso = `${month}-${String(d).padStart(2, '0')}`; if (iso > t) break; all.push(iso); }
  return empIds.map(id => {
    const e = emp(id); const recs = D.attendance.list.filter(a => a.empId === id && a.date?.startsWith(month));
    let late = 0, lateMin = 0, ot = 0, early = 0; recs.forEach(r => { const c = attCalc(r); if (c.late) { late++; lateMin += c.late; } ot += c.ot; early += c.early; });
    const present = new Set(recs.filter(r => r.in).map(r => r.date));
    const valid = all.filter(d => workDay(id, d) && (!e.joinDate || d >= e.joinDate) && (!e.lastDay || d <= e.lastDay));
    const leave = valid.filter(d => onLeave(id, d)).length; const absent = valid.filter(d => !present.has(d) && !onLeave(id, d)).length;
    return { id, name: e.nameAr, dept: unitName(e.deptId), loc: unitName(e.locationId), shift: D.shifts.map[e.shiftId]?.name || '—', work: valid.length, present: present.size, leave, absent, late, lateMin, early, ot: Math.round(ot / 6) / 10 };
  });
};
/* ---- balances: monthly accrual + comp-off ---- */
{ const _b = balanceOf; balanceOf = function (empId, typeId) {
    const r = _b(empId, typeId); const lt = D.leaveTypes.map[typeId]; if (!lt) return r;
    const yr = String(new Date().getFullYear());
    if (lt.compOff) { const hrs = apprReqs(empId, 'compCredit').filter(q => String(q.data?.date || '').startsWith(yr)).reduce((s, q) => s + Number(q.data?.hours || 0), 0);
      const ent = Math.round(hrs / Number(SET().compOffHours || 8) * 100) / 100; return { ...r, entitled: ent, earnedHours: hrs, available: Math.round((ent + r.carried + r.adj - r.used - r.pending) * 100) / 100 }; }
    if (lt.accrual === 'monthly') { const e = emp(empId); const now = new Date(); const cm = now.getMonth() + 1;
      let sm = 1; const jd = e?.joinDate || e?.hireDate; if (jd && String(jd).slice(0, 4) === yr) sm = Number(String(jd).slice(5, 7)); else if (jd && String(jd).slice(0, 4) > yr) sm = 13;
      const months = Math.max(0, cm - sm + 1); const ent = Math.round(r.entitled * months / 12 * 100) / 100;
      return { ...r, annual: r.entitled, accruedMonths: months, entitled: ent, available: Math.round((ent + r.carried + r.adj - r.used - r.pending) * 100) / 100 }; }
    return r; }; }
/* ---- validation of the new request kinds + permission monthly cap ---- */
{ const _v = validateRequest; validateRequest = function (type, data, empId, ignoreReqId) {
    const errs = _v(type, data, empId, ignoreReqId); const T = todayISO();
    if (type.effect === 'onDuty') {
      if (data.from && data.to && data.to < data.from) errs.push('تاريخ نهاية المهمة قبل بدايتها');
      if (data.from && data.to && days(data.from, data.to).length > 60) errs.push('المهمة الواحدة ما تزيد عن 60 يوم');
      const ov = D.requests.list.find(r => r.id !== ignoreReqId && r.empId === empId && ['leave', 'onDuty'].includes(r.effect) && ['pending', 'approved', 'returned'].includes(r.status) && r.data?.from <= data.to && r.data?.to >= data.from);
      if (ov) errs.push('يوجد طلب آخر (إجازة أو مهمة) متداخل مع نفس الفترة: ' + ov.ref);
    }
    if (type.effect === 'permission' && data.date && data.fromTime && data.toTime) {
      const cap = Number(SET().permMaxHours || 0); const h = hrsBetween(data.fromTime, data.toTime);
      if (cap > 0) { const used = D.requests.list.filter(r => r.id !== ignoreReqId && r.empId === empId && r.effect === 'permission' && ['pending', 'approved', 'returned'].includes(r.status) && String(r.data?.date || '').slice(0, 7) === data.date.slice(0, 7)).reduce((s, r) => s + hrsBetween(r.data.fromTime, r.data.toTime), 0);
        if (used + h > cap + 1e-9) errs.push(`تجاوز حد الاستئذان الشهري (${cap} ساعات): المستخدم ${Math.round(used * 10) / 10} ساعة وهذا الطلب ${Math.round(h * 10) / 10} ساعة`); }
    }
    if (type.effect === 'compCredit') {
      const h = Number(data.hours); if (!(h > 0)) errs.push('عدد الساعات لازم يكون أكبر من صفر');
      if (data.date && data.date > T) errs.push('ما يصير تطلب رصيد عن يوم ما جا للحين');
      if (D.requests.list.some(r => r.id !== ignoreReqId && r.empId === empId && r.effect === 'compCredit' && ['pending', 'approved', 'returned'].includes(r.status) && r.data?.date === data.date)) errs.push('يوجد طلب رصيد تعويضي لنفس اليوم');
      const rec = D.attendance.map[empId + '_' + data.date] || D.attendance.list.find(a => a.empId === empId && a.date === data.date);
      if (!rec || !rec.in || !rec.out) errs.push('ما فيه حضور وانصراف مسجل لهذا اليوم، صحّح الحضور أولاً');
      else { const off = !workDay(empId, data.date); const c = attCalc({ ...rec, empId, date: data.date }); const avail = off ? hrsBetween(rec.in, rec.out) : (c.ot || c.compOff || 0) / 60;
        if (h > avail + 1e-9) errs.push(`الساعات المطلوبة أكثر من المسجل: المتاح ${Math.round(avail * 10) / 10} ساعة ${off ? '(يوم راحة: كل ساعات العمل)' : '(إضافي بعد نهاية الوردية)'}`); }
    }
    if (type.effect === 'shiftSwap') {
      if (data.date && data.date < T) errs.push('التبديل لازم يكون ليوم قادم');
      if (data.withEmpId === empId) errs.push('اختر زميل غيرك');
      else if (data.date && data.withEmpId) { const a = shiftFor(empId, data.date), b = shiftFor(data.withEmpId, data.date);
        if ((a?.id || RST_OFF) === (b?.id || RST_OFF)) errs.push('نفس الوردية عند الاثنين في هذا اليوم، ما فيه شي يتبدل'); }
    }
    return errs; }; }
/* ---- effects after final approval ---- */
async function rosterSet(empId, date, val) { const m = date.slice(0, 7), id = empId + '_' + m; const cur = D.roster.map[id]; const dd = { ...(cur?.days || {}) };
  if (val == null || val === '') delete dd[date.slice(8)]; else dd[date.slice(8)] = val; await put('roster', id, { empId, month: m, days: dd, updatedAt: nowISO() }); }
{ const _ae = applyEffects; applyEffects = async function (req, inline) {
    const out = await _ae(req, inline); const d = req.data || {};
    try {
      if (req.effect === 'onDuty' && d.from && d.to) { const recs = [];
        for (const day of days(d.from, d.to)) { if (!workDay(req.empId, day)) continue; const cur = D.attendance.list.find(a => a.empId === req.empId && a.date === day); if (cur && cur.in) continue;
          const sh = shiftFor(req.empId, day); recs.push({ empId: req.empId, date: day, in: sh?.start || '', out: sh?.end || '', shiftId: sh?.id || null, source: 'مهمة خارجية ' + req.ref + (d.place ? ' — ' + d.place : ''), onDuty: true, updatedAt: nowISO() }); }
        if (recs.length) await attPutMany(recs); }
      if (req.effect === 'shiftSwap' && d.date && d.withEmpId) { const a = shiftFor(req.empId, d.date), b = shiftFor(d.withEmpId, d.date);
        await rosterSet(req.empId, d.date, b ? b.id : RST_OFF); await rosterSet(d.withEmpId, d.date, a ? a.id : RST_OFF);
        await notify([d.withEmpId], 'تم تبديل الوردية', `يوم ${fmtD(d.date)} مع ${empName(req.empId)} (${req.ref})`, { view: 'attendance' }); }
    } catch (err) { console.warn('effects2', err); toast('اكتمل الطلب لكن تعذر تطبيق أثره تلقائيًا: ' + err.message, true); }
    return out; }; }

/* ---- roster screen ---- */
const shCode = s => s ? (s.code || String(s.name || '').slice(0, 6)) : '';
function rosterView(month, scope) {
  const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const dl = []; for (let d = 1; d <= last; d++) dl.push(`${month}-${String(d).padStart(2, '0')}`);
  const dept = S.f.rstDept || ''; const ids = scope.filter(id => !dept || emp(id)?.deptId === dept).sort((a, b) => empName(a).localeCompare(empName(b), 'ar'));
  const shifts = D.shifts.list; const rots = SET().rotations || []; const ed = can('att.manage');
  const opts = (v, def) => `<option value="">${def ? '(' + esc(shCode(def)) + ')' : '—'}</option>${shifts.map(s => `<option value="${s.id}" ${v === s.id ? 'selected' : ''}>${esc(shCode(s))}</option>`).join('')}<option value="off" ${v === RST_OFF ? 'selected' : ''}>راحة</option>`;
  const depts = [...new Set(scope.map(id => emp(id)?.deptId).filter(Boolean))];
  const css = `<style>.rst{border-collapse:collapse;font-size:12px}.rst th,.rst td{border:1px solid var(--line,#e3e6ea);padding:2px;text-align:center}.rst td.nm{text-align:start;white-space:nowrap;padding:2px 6px;position:sticky;inset-inline-start:0;background:var(--surface,#fff)}.rst select{font-size:11px;padding:1px;min-width:52px;border:0;background:transparent}.rst .we{background:#f3f4f6}.rst .off select{color:#B42318;font-weight:700}</style>`;
  return css + `<div class="toolbar"><input type="month" data-fv="attMonth" value="${month}"><select data-fv="rstDept"><option value="">كل الإدارات</option>${depts.map(d => `<option value="${d}" ${dept === d ? 'selected' : ''}>${esc(unitName(d))}</option>`).join('')}</select>
    ${ed ? `<select id="rst-rot"><option value="">— نمط تناوب —</option>${rots.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label class="small">يبدأ النمط من <input type="date" id="rst-anchor" value="${month}-01"></label>
    <button class="btn sm" data-act="rst-apply">طبّق على المحددين</button><button class="btn sm" data-act="rst-copy">نسخ الشهر السابق للمحددين</button><button class="btn sm ghost" data-act="rst-clear">مسح جدول المحددين</button>` : ''}
    <button class="btn sm" data-act="rst-csv">${ic('down')} CSV</button></div>
   <p class="small muted">الخانة الفاضية = الوردية الافتراضية للموظف (بين القوسين) مع عطلة نهاية الأسبوع المعتادة. «راحة» = يوم راحة ما يُحسب غياب. الوردية في يوم عطلة = يوم عمل إضافي في الجدول.</p>
   <div class="tablewrap"><table class="rst"><thead><tr><th>${ed ? '<input type="checkbox" data-act="rst-all">' : ''}</th><th>الموظف</th>${dl.map(d => `<th class="${isWeekend(d) || isHoliday(d) ? 'we' : ''}">${+d.slice(8)}<br><small>${['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'][new Date(d + 'T00:00:00').getDay()]}</small></th>`).join('')}</tr></thead><tbody>
   ${ids.map(id => { const e = emp(id); const def = D.shifts.map[e?.shiftId]; return `<tr><td>${ed ? `<input type="checkbox" class="rst-sel" value="${id}">` : ''}</td><td class="nm">${esc(empName(id))}</td>${dl.map(d => { const v = rosterDay(id, d) || ''; return `<td class="${isWeekend(d) || isHoliday(d) ? 'we' : ''} ${v === RST_OFF ? 'off' : ''}">${ed ? `<select data-rst="${id}|${d}">${opts(v, (isWeekend(d) || isHoliday(d)) && !v ? null : def)}</select>` : esc(v === RST_OFF ? 'راحة' : shCode(D.shifts.map[v]) || (isWeekend(d) ? '' : shCode(def)))}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`;
}
function rosterMine(month) {
  const id = S.meId; const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const t = todayISO(); const it = [];
  for (let d = 1; d <= last; d++) { const iso = `${month}-${String(d).padStart(2, '0')}`; if (iso < t) continue; const sh = shiftFor(id, iso); const wd = workDay(id, iso); it.push(`<div class="chip" style="${wd ? '' : 'opacity:.6'}"><b>${fmtD(iso)}</b><span>${wd && sh ? esc(sh.name) + ' ' + esc(sh.start || '') + '–' + esc(sh.end || '') : 'راحة'}</span></div>`); if (it.length >= 14) break; }
  if (!it.length) return '';
  return `<section class="card" style="margin-top:14px"><h2>ورديتي في الأيام الجاية <small><a href="#" data-act="new-req-effect" data-e="shiftSwap">طلب تبديل وردية</a> · <a href="#" data-act="new-req-effect" data-e="onDuty">مهمة خارجية</a> · <a href="#" data-act="new-req-effect" data-e="compCredit">رصيد تعويضي عن إضافي</a></small></h2><div class="chips">${it.join('')}</div></section>`;
}
document.addEventListener('change', async ev => { const el = ev.target; if (!el.dataset || !el.dataset.rst) return; const [id, d] = el.dataset.rst.split('|');
  await guard(async () => { await rosterSet(id, d, el.value); await audit('تعديل جدول الورديات', 'roster', id + '_' + d.slice(0, 7), `${empName(id)} ${d}: ${el.value || 'افتراضي'}`); el.closest('td').classList.toggle('off', el.value === RST_OFF); }); });
const rstSel = () => [...document.querySelectorAll('.rst-sel:checked')].map(x => x.value);
ACT['rst-all'] = el => document.querySelectorAll('.rst-sel').forEach(x => x.checked = el.checked);
ACT['rst-apply'] = () => guard(async () => { const ids = rstSel(); const rot = (SET().rotations || []).find(r => r.id === $('#rst-rot').value); const anchor = $('#rst-anchor').value;
  if (!ids.length) throw new Error('حدد الموظفين أولاً'); if (!rot || !rot.seq?.length) throw new Error('اختر نمط تناوب (تُعرّف الأنماط من «سياسات الاستئذان والتعويض والتناوب»)'); if (!anchor) throw new Error('حدد تاريخ بداية النمط');
  const month = S.f.attMonth || monthISO(); const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const a0 = new Date(anchor + 'T12:00:00');
  for (const id of ids) { const dd = { ...(rosterDoc(id, month)?.days || {}) }; for (let d = 1; d <= last; d++) { const iso = `${month}-${String(d).padStart(2, '0')}`; const k = Math.round((new Date(iso + 'T12:00:00') - a0) / 864e5); if (k < 0) continue; dd[iso.slice(8)] = rot.seq[k % rot.seq.length]; }
    await put('roster', id + '_' + month, { empId: id, month, days: dd, rotation: rot.id, updatedAt: nowISO() }); }
  await audit('تطبيق نمط تناوب', 'roster', month, `${rot.name} على ${ids.length} موظف`); toast(`تم تطبيق «${rot.name}» على ${ids.length} موظف`); renderAll(); });
ACT['rst-copy'] = () => guard(async () => { const ids = rstSel(); if (!ids.length) throw new Error('حدد الموظفين أولاً'); const month = S.f.attMonth || monthISO(); const pm = addDays(month + '-01', -1).slice(0, 7); let n = 0;
  for (const id of ids) { const p = rosterDoc(id, pm); if (!p) continue; const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const dd = {}; Object.entries(p.days || {}).forEach(([k, v]) => { if (+k <= last) dd[k] = v; }); await put('roster', id + '_' + month, { empId: id, month, days: dd, updatedAt: nowISO() }); n++; }
  toast(n ? `تم النسخ لـ ${n} موظف` : 'ما فيه جدول في الشهر السابق للمحددين'); renderAll(); });
ACT['rst-clear'] = () => guard(async () => { const ids = rstSel(); if (!ids.length) throw new Error('حدد الموظفين أولاً'); if (!confirm('مسح جدول الشهر للمحددين والرجوع للوردية الافتراضية؟')) return; const month = S.f.attMonth || monthISO();
  for (const id of ids) if (rosterDoc(id, month)) await put('roster', id + '_' + month, { empId: id, month, days: {}, updatedAt: nowISO() }); renderAll(); });
ACT['rst-csv'] = () => { const month = S.f.attMonth || monthISO(); const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const dl = []; for (let d = 1; d <= last; d++) dl.push(`${month}-${String(d).padStart(2, '0')}`);
  const ids = D.employees.list.filter(e => e.status !== 'terminated' && inScope(e.id)).map(e => e.id);
  const rows = [['الموظف', ...dl.map(d => d.slice(8))], ...ids.map(id => [empName(id), ...dl.map(d => { if (!workDay(id, d)) return 'راحة'; return shCode(shiftFor(id, d)) || ''; })])];
  const csv = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'roster-' + month + '.csv'; a.click(); };
/* ---- extra policies: permission cap, comp-off hours, accrual per leave type, rotation patterns ---- */
function policy2View() { const st = SET(); const rots = st.rotations || []; const shifts = D.shifts.list;
  const lts = D.leaveTypes.list.filter(l => l.tracked !== false && !l.compOff).sort(by('order'));
  return `<form class="form card" data-form="policy2"><h2 style="grid-column:1/-1">الاستئذان والإجازة التعويضية</h2>
    ${fld('permMaxHours', 'حد الاستئذان الشهري (ساعات)', { type: 'number', value: st.permMaxHours ?? '', min: 0, step: '0.5', hint: 'فاضي = بدون حد. النظام يمنع تقديم استئذان يتجاوز الحد في نفس الشهر.' })}
    ${fld('compOffHours', 'كم ساعة إضافي = يوم إجازة تعويضية', { type: 'number', value: st.compOffHours ?? 8, min: 1, step: '0.5' })}
    <h2 style="grid-column:1/-1;margin-top:8px">طريقة استحقاق الإجازات</h2>
    ${lts.map(l => fld('acc_' + l.id, l.name + ` (${l.annualDays || 0} يوم سنوياً)`, { type: 'select', blank: false, value: l.accrual || 'annual', options: [['annual', 'كامل الرصيد من بداية السنة'], ['monthly', 'استحقاق شهري (1/12 كل شهر من بداية السنة أو من تاريخ المباشرة)']] })).join('')}
    <div class="fld full"><button class="btn pri" style="align-self:flex-start">حفظ</button></div></form>
   <section class="card" style="margin-top:14px"><h2>أنماط التناوب <small>تُطبّق من «جدول الورديات»</small></h2>
    <p class="small muted">اكتب تسلسل الأيام مفصول بفاصلة، كل خانة اسم وردية أو كلمة «راحة». مثال: ${esc(shifts.slice(0, 2).map(shCode).join('، ') || 'صباحي، مسائي')}، راحة. النمط يتكرر بعد آخر خانة.</p>
    <div class="list">${rots.map(r => `<div><div class="grow"><b>${esc(r.name)}</b><div class="small muted">${r.seq.map(x => x === RST_OFF ? 'راحة' : shCode(D.shifts.map[x]) || '؟').join(' ← ')} (${r.seq.length} يوم)</div></div><button class="btn sm ghost" data-act="rot-del" data-id="${r.id}">حذف</button></div>`).join('') || empty('ما فيه أنماط بعد')}</div>
    <form class="form" data-form="rot-add" style="margin-top:10px">${fld('name', 'اسم النمط', { required: true, placeholder: 'مثال: 4 أيام عمل ويومين راحة' })}${fld('seq', 'التسلسل', { required: true, placeholder: 'صباحي، صباحي، صباحي، صباحي، راحة، راحة' })}<div class="fld full"><button class="btn sm pri" style="align-self:flex-start">إضافة النمط</button></div></form></section>
   <div class="note" style="margin-top:12px">أنواع الطلبات الجديدة (مهمة عمل خارجية، رصيد تعويضي عن إضافي، تبديل وردية) موجودة في «الإعدادات ← أنواع الطلبات» وتقدر تعدّل مسار اعتمادها ومددها. نوع الإجازة «تعويضية عن عمل إضافي» رصيده = الساعات المعتمدة ÷ ${st.compOffHours || 8}، والساعات المعتمدة كتعويض ما تُحسب إضافي مدفوع في التقرير الشهري.</div>`;
}
FORM.policy2 = async f => { const v = readForm(f); await patch('settings', 'main', { permMaxHours: v.permMaxHours === '' ? null : Number(v.permMaxHours), compOffHours: Number(v.compOffHours || 8) });
  for (const l of D.leaveTypes.list) { const k = 'acc_' + l.id; if (k in v && (l.accrual || 'annual') !== v[k]) await patch('leaveTypes', l.id, { accrual: v[k] }); }
  await audit('تعديل سياسات الاستئذان والتعويض والاستحقاق', 'settings', 'main', JSON.stringify(v)); toast('تم الحفظ'); };
FORM['rot-add'] = async f => { const v = readForm(f); const parts = String(v.seq || '').split(/[,،\n]+/).map(x => x.trim()).filter(Boolean); const seq = [];
  for (const p of parts) { if (/^راحة|^off$/i.test(p)) { seq.push(RST_OFF); continue; } const s = D.shifts.list.find(x => x.name === p || shCode(x) === p || x.code === p); if (!s) throw new Error('ما لقيت وردية باسم «' + p + '». الأسماء المتاحة: ' + D.shifts.list.map(x => x.name).join('، ')); seq.push(s.id); }
  if (!seq.length) throw new Error('التسلسل فاضي'); if (seq.length > 60) throw new Error('التسلسل طويل جداً');
  await patch('settings', 'main', { rotations: [...(SET().rotations || []), { id: newId(), name: v.name, seq }] }); await audit('إضافة نمط تناوب', 'settings', 'main', v.name); toast('تمت إضافة النمط'); };
ACT['rot-del'] = el => guard(async () => { if (!confirm('حذف النمط؟ الجداول المطبقة سابقاً ما تتأثر.')) return; await patch('settings', 'main', { rotations: (SET().rotations || []).filter(r => r.id !== el.dataset.id) }); renderAll(); });
