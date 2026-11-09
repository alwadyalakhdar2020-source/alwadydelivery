'use strict';
/* ============ KPI performance system ============
   kpiTemplates : reusable KPI sets (library). Doc "__config" holds the scale: cap %, rating bands, acknowledgement rule.
   kpiPlans     : one scorecard per employee per period (id = <empId>_<period>, so a plan can never be duplicated).
   Life cycle   : draft (set KPIs, weights, targets) → locked "مثبت" (targets frozen, actuals entered)
                  → submitted (by the manager) → final (approved by HR, a different person) → employee acknowledges.
   Score        : achievement per KPI = actual ÷ target (or target ÷ actual when lower is better), capped;
                  overall = Σ(weight × achievement) ÷ Σ weight. The rating comes from the configurable bands. */
const KPI_DIR = { higher: ['كلما زاد كان أفضل', 'Higher is better'], lower: ['كلما قل كان أفضل', 'Lower is better'], yesno: ['تحقق / لم يتحقق', 'Achieved / not'] };
const KPI_ST = { draft: ['مسودة — قيد الإعداد', 'Draft', ''], locked: ['مثبت — قيد التنفيذ', 'Locked — in progress', 'b-info'], submitted: ['بانتظار اعتماد الموارد البشرية', 'Awaiting HR approval', 'b-warn'], final: ['معتمد', 'Approved', 'b-ok'] };
const kpiBadge = s => { const x = KPI_ST[s] || [s, s, '']; return `<span class="badge ${x[2]}">${esc(LX(x[0], x[1]))}</span>`; };
const KPI_BANDS0 = [{ min: 110, rating: 5, label: 'استثنائي' }, { min: 95, rating: 4, label: 'يتجاوز المتوقع' }, { min: 80, rating: 3, label: 'يحقق المتوقع' }, { min: 60, rating: 2, label: 'دون المتوقع' }, { min: 0, rating: 1, label: 'دون المتوقع بكثير' }];
const KPI_RECS = ['لا يوجد', 'ترقية', 'زيادة / مكافأة', 'تدريب إضافي', 'خطة تحسين أداء'];
function kpiCfg() { const c = RAW.kpiTemplates?.map?.__config || {}; return { cap: Number(c.cap) || 120, bands: (c.bands?.length ? c.bands : KPI_BANDS0).slice().sort((a, b) => b.min - a.min), ackPlan: c.ackPlan !== false }; }
const kpiTemplates = () => (RAW.kpiTemplates?.list || []).filter(t => t.id !== '__config' && !t.archived);
const kpiPlan = id => RAW.kpiPlans?.map?.[id];
const kpiNum = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace('٫', '.').replace(/[,\s%]/g, '')); return isNaN(n) ? NaN : n; };
const kpiYes = a => a === true || a === 1 || a === '1' || a === 'yes';
function kpiAch(it) {
  const cap = kpiCfg().cap; const a = it.actual; if (a == null || a === '') return null;
  let p;
  if (it.dir === 'yesno') p = kpiYes(a) ? 100 : 0;
  else {
    const x = Number(a), t = Number(it.target); if (isNaN(x)) return null;
    if (it.dir === 'lower') p = x <= 0 ? (t <= 0 ? 100 : cap) : (t <= 0 ? 0 : t / x * 100);
    else p = t === 0 ? (x >= 0 ? 100 : 0) : x / t * 100;
  }
  return Math.max(0, Math.min(cap, Math.round(p * 10) / 10));
}
function kpiScore(p) {
  const its = p?.items || []; const w = its.reduce((s, i) => s + Number(i.weight || 0), 0); let sum = 0, done = 0;
  for (const i of its) { const a = kpiAch(i); if (a != null) { sum += a * Number(i.weight || 0); done++; } }
  return { score: w ? Math.round(sum / w * 10) / 10 : null, complete: its.length > 0 && done === its.length, done, total: its.length, wsum: Math.round(w * 100) / 100 };
}
const kpiBand = s => s == null ? null : (kpiCfg().bands.find(b => s >= b.min) || kpiCfg().bands.at(-1));
const kpiCanManage = empId => !!empId && empId !== S.meId && ((can('perf.manage') && inScope(empId)) || teamIds(S.meId).has(empId));
const kpiCanView = p => !!p && (p.empId === S.meId || kpiCanManage(p.empId) || can('perf.manage'));
const kpiCanApprove = p => can('perf.manage') && p.empId !== S.meId && p.submittedById !== S.meId;
function kpiPeriods() { const y = new Date().getFullYear(); const out = []; for (const yy of [y - 1, y, y + 1]) out.push(String(yy), yy + '-H1', yy + '-H2', yy + '-Q1', yy + '-Q2', yy + '-Q3', yy + '-Q4'); return out; }
function kpiPerLabel(p) { const m = String(p || '').match(/^(\d{4})(?:-(H|Q)(\d))?$/); if (!m) return p || '—'; if (!m[2]) return LX('سنة ', 'Year ') + m[1]; return (m[2] === 'H' ? LX(m[3] === '1' ? 'النصف الأول' : 'النصف الثاني', 'H' + m[3]) : LX('الربع ' + m[3], 'Q' + m[3])) + ' ' + m[1]; }
const kpiPerSelect = (id, cur, attrs = '') => `<select id="${id}" ${attrs}>${kpiPeriods().map(p => `<option value="${p}" ${p === cur ? 'selected' : ''}>${esc(kpiPerLabel(p))}</option>`).join('')}</select>`;
const kpiFmt = (it, v) => it.dir === 'yesno' ? (v == null || v === '' ? '—' : kpiYes(v) ? LX('تحقق', 'Yes') : LX('لم يتحقق', 'No')) : (v == null || v === '' ? '—' : fmtN(v, Number(v) % 1 ? 2 : 0) + (it.unit ? ' ' + it.unit : ''));
const kpiPct = v => v == null ? '—' : `<span class="num">${fmtN(v, v % 1 ? 1 : 0)}%</span>`;
function kpiLog(p, action, note) { return [...(p.history || []), { at: nowISO(), byId: S.meId, action, note: note || '' }].slice(-60); }
async function kpiPut(id, doc) { await put('kpiPlans', id, doc); RAW.kpiPlans.map[id] = { ...doc, id }; if (!RAW.kpiPlans.list.some(x => x.id === id)) RAW.kpiPlans.list.push(RAW.kpiPlans.map[id]); }
const hrPerfIds = (except) => D.employees.list.filter(e => e.status !== 'terminated' && canE(e, 'perf.manage') && !except.includes(e.id)).map(e => e.id);

/* ---------- KPI rows editor (library templates and draft plans) ---------- */
function kpiRowHtml(it = {}) {
  const dir = it.dir || 'higher';
  return `<div class="kpi-row" data-id="${esc(it.id || newId())}">
  <label class="kf k1"><span>${LX('المؤشر', 'KPI')}</span><input class="k-name" value="${esc(it.name || '')}" placeholder="${LX('مثال: نسبة الإنتاج المطابق للمواصفات', 'e.g. On-spec production rate')}"></label>
  <label class="kf"><span>${LX('الوحدة', 'Unit')}</span><input class="k-unit" value="${esc(it.unit || '')}" placeholder="% / ${LX('طن', 't')} / ${LX('ساعة', 'h')}"></label>
  <label class="kf"><span>${LX('الاتجاه', 'Direction')}</span><select class="k-dir">${Object.entries(KPI_DIR).map(([k, [a, e]]) => `<option value="${k}" ${dir === k ? 'selected' : ''}>${LX(a, e)}</option>`).join('')}</select></label>
  <label class="kf"><span>${LX('المستهدف', 'Target')}</span><input class="k-target" inputmode="decimal" value="${esc(it.target ?? '')}" ${dir === 'yesno' ? 'disabled placeholder="—"' : ''}></label>
  <label class="kf"><span>${LX('الوزن %', 'Weight %')}</span><input class="k-weight" inputmode="decimal" value="${esc(it.weight ?? '')}"></label>
  <button type="button" class="icon-btn k-del" data-act="kpi-row-del" aria-label="${LX('حذف المؤشر', 'Remove KPI')}" title="${LX('حذف', 'Remove')}">${ic('x')}</button>
  <label class="kf kfull"><span>${LX('طريقة القياس ومصدر البيانات', 'How it is measured / data source')}</span><input class="k-desc" value="${esc(it.desc || '')}" placeholder="${LX('مثال: تقرير الجودة الشهري — عدد القطع المطابقة ÷ الإجمالي', 'e.g. monthly QC report')}"></label>
</div>`;
}
const kpiEditor = items => `<div class="kpi-ed"><div id="kpi-rows">${(items?.length ? items : [{}]).map(kpiRowHtml).join('')}</div><div class="row" style="justify-content:space-between;margin-top:8px"><button type="button" class="btn sm" data-act="kpi-row-add">${ic('plus')} ${LX('إضافة مؤشر', 'Add KPI')}</button><span id="kpi-wsum" class="badge">${kpiWsumTxt(items || [])}</span></div></div>`;
function kpiWsumTxt(items) { const w = items.reduce((s, i) => s + (Number(i.weight) || 0), 0); return LX(`مجموع الأوزان ${fmtN(w, w % 1 ? 1 : 0)}% من 100%`, `Weights total ${fmtN(w)}% of 100%`); }
function kpiRead() {
  const items = [], errs = [];
  document.querySelectorAll('#kpi-rows .kpi-row').forEach((r, i) => {
    const q = c => r.querySelector(c); const name = q('.k-name').value.trim(); const dir = q('.k-dir').value; const t = kpiNum(q('.k-target').value); const w = kpiNum(q('.k-weight').value);
    if (!name && t == null && w == null && !q('.k-desc').value.trim()) return; // empty row
    const n = i + 1;
    if (!name) errs.push(LX(`المؤشر ${n}: الاسم مطلوب`, `KPI ${n}: name required`));
    if (w == null || isNaN(w) || w <= 0) errs.push(LX(`«${name || n}»: الوزن رقم أكبر من صفر`, `${name || n}: weight must be > 0`));
    if (dir !== 'yesno' && (t == null || isNaN(t))) errs.push(LX(`«${name || n}»: المستهدف رقم مطلوب`, `${name || n}: numeric target required`));
    items.push({ id: r.dataset.id, name, unit: q('.k-unit').value.trim(), dir, target: dir === 'yesno' ? null : t, weight: w, desc: q('.k-desc').value.trim() });
  });
  return { items, errs };
}
ACT['kpi-row-add'] = () => { const box = $('#kpi-rows'); if (!box) return; box.insertAdjacentHTML('beforeend', kpiRowHtml()); box.lastElementChild.querySelector('.k-name')?.focus(); };
ACT['kpi-row-del'] = el => { const r = el.closest('.kpi-row'); const box = $('#kpi-rows'); if (r && box?.children.length > 1) r.remove(); else if (r) r.querySelectorAll('input').forEach(i => i.value = ''); kpiWsumUpd(); };
function kpiWsumUpd() { const s = $('#kpi-wsum'); if (!s) return; const items = [...document.querySelectorAll('#kpi-rows .k-weight')].map(i => ({ weight: kpiNum(i.value) || 0 })); const w = items.reduce((a, i) => a + i.weight, 0); s.textContent = kpiWsumTxt(items); s.className = 'badge ' + (Math.abs(w - 100) < 0.01 ? 'b-ok' : 'b-warn'); }
document.addEventListener('input', e => { if (e.target.closest?.('#kpi-rows') && e.target.classList.contains('k-weight')) kpiWsumUpd(); });
document.addEventListener('change', e => { const t = e.target; if (t.classList?.contains('k-dir')) { const tg = t.closest('.kpi-row').querySelector('.k-target'); tg.disabled = t.value === 'yesno'; if (tg.disabled) { tg.value = ''; tg.placeholder = '—'; } else tg.placeholder = ''; } });

/* ---------- library ---------- */
function kpiLibHtml() {
  const c = kpiCfg(); const ts = kpiTemplates().sort(by('name')); const used = id => (RAW.kpiPlans?.list || []).filter(p => p.templateId === id).length;
  return `<div class="note small" style="margin-bottom:12px">${LX('مكتبة المؤشرات قوالب جاهزة لكل وظيفة أو إدارة. عند إنشاء خطة لموظف تُنسخ المؤشرات من القالب ويمكن تعديلها له قبل تثبيتها. تعديل القالب لاحقًا لا يغيّر الخطط القائمة.', 'The KPI library holds templates per job or department. Plans copy them and can be adjusted per employee before locking. Editing a template later does not change existing plans.')}</div>` +
    dataTable('kpilib', [
      { k: 'name', l: LX('القالب', 'Template'), v: t => `<b>${esc(t.name)}</b>${t.description ? `<div class="small muted">${esc(t.description)}</div>` : ''}` },
      { k: 'for', l: LX('مخصص لـ', 'For'), s: t => (t.deptId ? unitName(t.deptId) : '') + (t.jobTitle || ''), v: t => [t.deptId ? esc(unitName(t.deptId)) : '', t.jobTitle ? esc(t.jobTitle) : ''].filter(Boolean).join(' · ') || `<span class="muted small">${LX('عام', 'General')}</span>` },
      { k: 'n', l: LX('المؤشرات', 'KPIs'), s: t => (t.items || []).length, v: t => `<span class="num">${(t.items || []).length}</span>` },
      { k: 'w', l: LX('الأوزان', 'Weights'), s: t => kpiScore(t).wsum, v: t => { const w = kpiScore(t).wsum; return `<span class="badge ${Math.abs(w - 100) < .01 ? 'b-ok' : 'b-warn'}">${fmtN(w)}%</span>`; } },
      { k: 'u', l: LX('مستخدم في', 'Used in'), s: t => used(t.id), v: t => `<span class="num">${used(t.id)}</span> ${LX('خطة', 'plans')}` },
      { k: 'x', l: '', nosort: true, v: t => `<div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm" data-act="kpi-tpl" data-id="${t.id}">${LX('تعديل', 'Edit')}</button><button class="btn sm ghost" data-act="kpi-tpl" data-id="${t.id}" data-copy="1">${LX('نسخ', 'Duplicate')}</button><button class="btn sm ghost danger" data-act="kpi-tpl-arch" data-id="${t.id}">${LX('أرشفة', 'Archive')}</button></div>` }
    ], ts, { tools: `<button class="btn sm pri" data-act="kpi-tpl">${ic('plus')} ${LX('قالب جديد', 'New template')}</button>`, empty: LX('لا توجد قوالب بعد. أنشئ أول قالب لوظيفة أو إدارة.', 'No templates yet.') }) +
    `<form class="card" data-form="kpi-cfg" style="margin-top:14px"><h2>${LX('سلم التقدير وقواعد الاحتساب', 'Rating scale and rules')}</h2>
    <p class="small muted" style="margin:0 0 10px">${LX('الإنجاز لكل مؤشر = الفعلي ÷ المستهدف (أو المستهدف ÷ الفعلي إذا كان الأقل أفضل). النتيجة الكلية = مجموع (الوزن × الإنجاز) ÷ مجموع الأوزان. التقدير يُحدد من الحد الأدنى لكل مستوى.', 'Achievement = actual ÷ target (target ÷ actual when lower is better). Overall = Σ(weight × achievement) ÷ Σ weights. The rating comes from each level\'s minimum.')}</p>
    <div class="form">${fld('cap', LX('الحد الأعلى لإنجاز المؤشر الواحد (%)', 'Max achievement per KPI (%)'), { type: 'number', value: c.cap, min: 100, max: 200 })}${fld('ackPlan', LX('إقرار الموظف', 'Employee acknowledgement'), { type: 'checkbox', value: c.ackPlan, cbLabel: LX('يُطلب من الموظف الإقرار بالمؤشرات بعد تثبيتها', 'Ask the employee to acknowledge locked KPIs') })}</div>
    <div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>${LX('التقدير', 'Rating')}</th><th>${LX('الوصف', 'Label')}</th><th>${LX('من نسبة (%)', 'From (%)')}</th></tr></thead><tbody>${c.bands.map((b, i) => `<tr><td class="num"><b>${b.rating}</b></td><td><input name="bl${i}" value="${esc(b.label)}" aria-label="${LX('الوصف', 'Label')}" style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:7px;background:var(--surface)"></td><td><input name="bm${i}" type="number" value="${b.min}" min="0" max="200" ${b.rating === 1 ? 'readonly' : ''} aria-label="${LX('من نسبة', 'From')}" style="width:100px;padding:6px 8px;border:1px solid var(--line);border-radius:7px;background:var(--surface)"></td></tr>`).join('')}</tbody></table></div>
    <div style="margin-top:10px"><button class="btn pri">${LX('حفظ السلم', 'Save scale')}</button></div></form>`;
}
FORM['kpi-cfg'] = async f => {
  if (!can('perf.manage')) return toast(LX('يتطلب صلاحية إدارة تقييم الأداء', 'Needs performance management permission'), true);
  const v = readForm(f); const old = kpiCfg().bands; const bands = old.map((b, i) => ({ rating: b.rating, label: v['bl' + i] || b.label, min: b.rating === 1 ? 0 : Number(v['bm' + i]) }));
  for (let i = 0; i < bands.length - 1; i++) if (!(bands[i].min > bands[i + 1].min)) return toast(LX('حدود المستويات يجب أن تتناقص من الأعلى للأدنى', 'Level thresholds must decrease from top to bottom'), true);
  const cap = Math.min(200, Math.max(100, Number(v.cap) || 120)); const cur = RAW.kpiTemplates.map.__config;
  await put('kpiTemplates', '__config', { ...(cur ? strip(cur) : {}), cap, bands, ackPlan: !!v.ackPlan, updatedAt: nowISO(), updatedById: S.meId });
  await audit('تعديل سلم تقدير المؤشرات', 'kpi', '__config', bands.map(b => `${b.rating}≥${b.min}%`).join('، ')); toast(LX('حُفظ السلم', 'Saved'));
};
ACT['kpi-tpl'] = el => {
  if (!can('perf.manage')) return; const src = el.dataset.id ? RAW.kpiTemplates.map[el.dataset.id] : null; const copy = !!el.dataset.copy;
  const t = src ? { ...src, name: copy ? src.name + LX(' (نسخة)', ' (copy)') : src.name, items: (src.items || []).map(i => ({ ...i, id: copy ? newId() : i.id })) } : { items: [] };
  const depts = D.orgunits.list.filter(u => u.type === 'dept').sort(by('name')).map(u => [u.id, u.name]);
  openModal(src && !copy ? LX('تعديل قالب مؤشرات', 'Edit KPI template') : LX('قالب مؤشرات جديد', 'New KPI template'), `<form class="form" id="kptf" data-form="kpi-tpl" ${src && !copy ? `data-id="${src.id}"` : ''}>${fld('name', LX('اسم القالب', 'Template name'), { value: t.name, required: true, ph: LX('مثال: مشرف إنتاج — مصنع الطوب', 'e.g. Production supervisor') })}${fld('deptId', LX('الإدارة (اختياري)', 'Department (optional)'), { type: 'select', options: depts, value: t.deptId })}${fld('jobTitle', LX('المسمى الوظيفي (اختياري)', 'Job title (optional)'), { value: t.jobTitle })}${fld('description', LX('وصف مختصر', 'Short description'), { value: t.description })}<div class="full">${kpiEditor(t.items)}</div></form>`,
    `<button class="btn pri" form="kptf">${LX('حفظ القالب', 'Save template')}</button><button class="btn" data-act="close-modal">${LX('إلغاء', 'Cancel')}</button>`, true);
};
FORM['kpi-tpl'] = async f => {
  const v = readForm(f); const { items, errs } = kpiRead(); if (!items.length) errs.unshift(LX('أضف مؤشرًا واحدًا على الأقل', 'Add at least one KPI'));
  if (errs.length) return toast(errs.slice(0, 3).join(' — '), true);
  const id = f.dataset.id || newId(); const cur = RAW.kpiTemplates.map[id];
  await put('kpiTemplates', id, { ...(cur ? strip(cur) : { createdAt: nowISO(), createdById: S.meId }), name: v.name, deptId: v.deptId || null, jobTitle: v.jobTitle || '', description: v.description || '', items, updatedAt: nowISO(), updatedById: S.meId });
  await audit(cur ? 'تعديل قالب مؤشرات' : 'إنشاء قالب مؤشرات', 'kpi', id, `${v.name} — ${items.length} مؤشر`);
  closeModal(); const w = kpiScore({ items }).wsum; toast(Math.abs(w - 100) < .01 ? LX('حُفظ القالب', 'Saved') : LX(`حُفظ القالب. تنبيه: مجموع الأوزان ${w}% ويجب أن يكون 100% قبل تثبيت أي خطة`, `Saved. Weights total ${w}%; must be 100% to lock a plan`), Math.abs(w - 100) >= .01);
};
ACT['kpi-tpl-arch'] = el => { const t = RAW.kpiTemplates.map[el.dataset.id]; if (!t) return; confirmBox(LX(`أرشفة قالب «${esc(t.name)}»؟ لن يظهر عند إنشاء خطط جديدة، والخطط القائمة لا تتأثر.`, `Archive ${esc(t.name)}?`), async () => { await put('kpiTemplates', t.id, { ...strip(t), archived: true, archivedAt: nowISO() }); await audit('أرشفة قالب مؤشرات', 'kpi', t.id, t.name); toast(LX('أُرشف القالب', 'Archived')); }, LX('أرشفة', 'Archive')); };

/* ---------- team / company scorecards ---------- */
function kpiScopeEmps() { return activeEmpList().filter(e => e.id !== S.meId && kpiCanManage(e.id)); }
function kpiTeamHtml() {
  const per = S.f.kpiPer || String(new Date().getFullYear()); const dep = S.f.kpiDept || '';
  const emps = kpiScopeEmps().filter(e => !dep || e.deptId === dep);
  const rows = emps.map(e => { const p = kpiPlan(e.id + '_' + per); const sc = p ? kpiScore(p) : null; return { ...e, _p: p, _s: sc }; });
  const cnt = s => rows.filter(r => (r._p?.status || 'none') === s).length; const fin = rows.filter(r => r._p?.status === 'final' && r._p.score != null);
  const depts = uniq(kpiScopeEmps().map(e => e.deptId).filter(Boolean)).map(id => [id, unitName(id)]).sort((a, b) => a[1].localeCompare(b[1]));
  return `<div class="toolbar"><label class="small">${LX('الفترة', 'Period')} ${kpiPerSelect('kpi-per', per, 'data-fv="kpiPer"')}</label>${depts.length > 1 ? `<label class="small">${LX('الإدارة', 'Department')} <select data-fv="kpiDept"><option value="">${LX('الكل', 'All')}</option>${depts.map(([k, l]) => `<option value="${k}" ${k === dep ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}</div>
  <div class="grid g4" style="margin-bottom:14px">${kpi(LX('بدون خطة', 'No plan'), fmtN(cnt('none')), '', cnt('none'))}${kpi(LX('مسودة', 'Draft'), fmtN(cnt('draft')))}${kpi(LX('مثبتة — قيد التنفيذ', 'Locked'), fmtN(cnt('locked')))}${kpi(LX('بانتظار الاعتماد', 'Awaiting approval'), fmtN(cnt('submitted')))}${kpi(LX('معتمدة', 'Approved'), fmtN(cnt('final')))}${kpi(LX('متوسط النتيجة المعتمدة', 'Average approved score'), fin.length ? fmtN(fin.reduce((a, r) => a + r._p.score, 0) / fin.length, 1) + '%' : '—', LX('للخطط المعتمدة فقط', 'Approved plans only'))}</div>` +
    dataTable('kpiteam', [
      { k: 'nameAr', l: LX('الموظف', 'Employee'), v: e => `<b>${esc(e.nameAr)}</b><div class="small muted"><span class="num">${esc(e.empNo)}</span> · ${esc(e.title || '')}</div>`, txt: e => e.nameAr + ' ' + e.empNo },
      { k: 'dept', l: LX('الإدارة', 'Department'), s: e => unitName(e.deptId), v: e => esc(unitName(e.deptId)) },
      { k: 'mgr', l: LX('المقيّم', 'Evaluator'), s: e => empName(e.managerId), v: e => esc(e.managerId ? empName(e.managerId) : '—') },
      { k: 'tpl', l: LX('القالب', 'Template'), s: e => e._p?.templateName || '', v: e => esc(e._p?.templateName || (e._p ? LX('مخصص', 'Custom') : '—')) },
      { k: 'st', l: LX('الحالة', 'Status'), s: e => ['none', 'draft', 'locked', 'submitted', 'final'].indexOf(e._p?.status || 'none'), v: e => e._p ? kpiBadge(e._p.status) + (e._p.status === 'locked' && e._p.ackPlanAt ? ` <span class="small muted">${LX('أقر الموظف', 'Acknowledged')}</span>` : '') : badge('returned', LX('بدون خطة', 'No plan')) },
      { k: 'pr', l: LX('الإدخال', 'Entered'), s: e => e._s ? e._s.done / Math.max(1, e._s.total) : -1, v: e => e._s ? `<span class="num small">${e._s.done} / ${e._s.total}</span>` : '—' },
      { k: 'sc', l: LX('النتيجة', 'Score'), s: e => e._p?.status === 'final' ? e._p.score : e._s?.score ?? -1, v: e => e._p?.status === 'final' ? `<b>${kpiPct(e._p.score)}</b>` : e._s?.done ? `<span class="muted">${kpiPct(e._s.score)}</span>` : '—' },
      { k: 'rt', l: LX('التقدير', 'Rating'), s: e => e._p?.rating || 0, v: e => e._p?.status === 'final' ? `<span class="num">${e._p.rating}</span> — ${esc(e._p.ratingLabel || '')}` : '—' },
      { k: 'x', l: '', nosort: true, v: e => e._p ? `<button class="btn sm" data-act="kpi-open" data-id="${e._p.id}">${LX('فتح', 'Open')}</button>` : `<button class="btn sm pri" data-act="kpi-new" data-e="${e.id}" data-p="${esc(per)}">${ic('plus')} ${LX('إنشاء خطة', 'Create plan')}</button>` }
    ], rows, { tools: `<button class="btn sm pri" data-act="kpi-bulk">${ic('users')} ${LX('تطبيق قالب على عدة موظفين', 'Apply a template to several employees')}</button><button class="btn sm" data-act="kpi-export">${ic('down')} ${LX('تصدير Excel', 'Export Excel')}</button>`, empty: LX('لا يوجد موظفون ضمن نطاقك', 'No employees in your scope') });
}
ACT['kpi-new'] = el => {
  const e = emp(el.dataset.e); const per = el.dataset.p; if (!kpiCanManage(e?.id)) return toast(LX('لا تملك صلاحية إعداد مؤشرات هذا الموظف', 'Not allowed'), true);
  if (kpiPlan(e.id + '_' + per)) return ACT['kpi-open']({ dataset: { id: e.id + '_' + per } });
  const ts = kpiTemplates(); const best = ts.find(t => t.deptId === e.deptId && t.jobTitle && t.jobTitle === e.title) || ts.find(t => t.jobTitle && t.jobTitle === e.title) || ts.find(t => t.deptId === e.deptId);
  openModal(LX('خطة مؤشرات أداء', 'KPI plan') + ' — ' + e.nameAr, `<form class="form" id="kpnf" data-form="kpi-new" data-e="${e.id}">${fld('period', LX('الفترة', 'Period'), { type: 'select', blank: false, options: kpiPeriods().map(p => [p, kpiPerLabel(p)]), value: per, required: true })}${fld('tpl', LX('ابدأ من قالب', 'Start from template'), { type: 'select', options: [['', LX('بدون قالب — أضيف المؤشرات بنفسي', 'No template — add KPIs myself')], ...ts.map(t => [t.id, `${t.name} (${(t.items || []).length})`])], blank: false, value: best?.id || (ts.length === 1 ? ts[0].id : ''), full: true })}<div class="note small full">${LX('تُنشأ الخطة كمسودة يمكنك تعديل مؤشراتها وأوزانها ومستهدفاتها لهذا الموظف، ثم تثبيتها.', 'The plan starts as a draft you can adjust, then lock.')}</div></form>`,
    `<button class="btn pri" form="kpnf">${LX('إنشاء', 'Create')}</button><button class="btn" data-act="close-modal">${LX('إلغاء', 'Cancel')}</button>`);
};
function kpiNewDoc(e, per, t) {
  return { empId: e.id, period: per, templateId: t?.id || null, templateName: t?.name || '', items: (t?.items || []).map(i => ({ ...i, id: newId(), actual: null })), status: 'draft', evaluatorId: e.managerId || null, createdAt: nowISO(), createdById: S.meId, history: [{ at: nowISO(), byId: S.meId, action: 'إنشاء الخطة', note: t ? 'من قالب: ' + t.name : '' }] };
}
FORM['kpi-new'] = async f => {
  const e = emp(f.dataset.e); const v = readForm(f); const id = e.id + '_' + v.period;
  if (kpiPlan(id)) { closeModal(); return ACT['kpi-open']({ dataset: { id } }); }
  const t = v.tpl ? RAW.kpiTemplates.map[v.tpl] : null; await kpiPut(id, kpiNewDoc(e, v.period, t));
  await audit('إنشاء خطة مؤشرات أداء', 'kpi', id, `${e.nameAr} — ${v.period}`); ACT['kpi-open']({ dataset: { id } });
};
ACT['kpi-bulk'] = () => {
  const ts = kpiTemplates(); if (!ts.length) return toast(LX('أنشئ قالبًا أولًا من تبويب «مكتبة المؤشرات»', 'Create a template first'), true);
  const per = S.f.kpiPer || String(new Date().getFullYear()); const depts = uniq(kpiScopeEmps().map(e => e.deptId).filter(Boolean)).map(id => [id, unitName(id)]);
  openModal(LX('تطبيق قالب على عدة موظفين', 'Apply template to several employees'), `<form class="form" id="kpbf" data-form="kpi-bulk">${fld('tpl', LX('القالب', 'Template'), { type: 'select', options: ts.map(t => [t.id, t.name]), required: true, full: true })}${fld('period', LX('الفترة', 'Period'), { type: 'select', blank: false, options: kpiPeriods().map(p => [p, kpiPerLabel(p)]), value: per })}${fld('dept', LX('الموظفون', 'Employees'), { type: 'select', blank: false, options: [['', LX('كل الموظفين ضمن نطاقي', 'Everyone in my scope')], ...depts.map(([k, l]) => [k, LX('إدارة: ', 'Dept: ') + l])] })}${fld('title', LX('بمسمى وظيفي (اختياري)', 'With job title (optional)'), { full: true })}${fld('lock', LX('التثبيت', 'Locking'), { type: 'checkbox', cbLabel: LX('تثبيت الخطط مباشرة (إن كان مجموع الأوزان 100%)', 'Lock the plans right away (when weights total 100%)'), full: true })}<div class="note small full">${LX('تُنشأ الخطط لمن ليس لديه خطة لهذه الفترة فقط، ولا يُستبدل أي خطة قائمة.', 'Plans are created only for employees without one for that period; existing plans are kept.')}</div></form>`,
    `<button class="btn pri" form="kpbf">${LX('تطبيق', 'Apply')}</button><button class="btn" data-act="close-modal">${LX('إلغاء', 'Cancel')}</button>`);
};
FORM['kpi-bulk'] = async f => {
  const v = readForm(f); const t = RAW.kpiTemplates.map[v.tpl]; if (!t) return;
  const okW = Math.abs(kpiScore(t).wsum - 100) < .01; const lock = v.lock && okW;
  const list = kpiScopeEmps().filter(e => (!v.dept || e.deptId === v.dept) && (!v.title || (e.title || '').includes(v.title)) && !kpiPlan(e.id + '_' + v.period));
  if (!list.length) return toast(LX('لا يوجد موظفون مطابقون بدون خطة لهذه الفترة', 'No matching employees without a plan'), true);
  let n = 0;
  for (const e of list) { const d = kpiNewDoc(e, v.period, t); if (lock) Object.assign(d, { status: 'locked', lockedAt: nowISO(), lockedById: S.meId, history: kpiLog(d, 'تثبيت المؤشرات') }); await kpiPut(e.id + '_' + v.period, d); n++; }
  if (lock) await notify(list.map(e => e.id), LX('ثُبّتت مؤشرات أدائك', 'Your KPIs were locked'), kpiPerLabel(v.period), { view: 'talent' });
  await audit('تطبيق قالب مؤشرات على موظفين', 'kpi', t.id, `${t.name} — ${v.period} — ${n} موظف${lock ? ' (مثبتة)' : ''}`);
  closeModal(); toast(LX(`أُنشئت ${n} خطة${lock ? ' مثبتة' : ' كمسودات'}`, `${n} plans created`) + (v.lock && !okW ? LX(' — لم تُثبت لأن مجموع أوزان القالب ليس 100%', ' — not locked: weights ≠ 100%') : ''), v.lock && !okW);
};
ACT['kpi-export'] = () => {
  const per = S.f.kpiPer || String(new Date().getFullYear()); const emps = kpiScopeEmps(); const plans = emps.map(e => [e, kpiPlan(e.id + '_' + per)]);
  const sum = [[LX('الرقم الوظيفي', 'No.'), LX('الموظف', 'Employee'), LX('الإدارة', 'Department'), LX('المقيّم', 'Evaluator'), LX('القالب', 'Template'), LX('الحالة', 'Status'), LX('النتيجة %', 'Score %'), LX('التقدير', 'Rating'), LX('الوصف', 'Label'), LX('التوصية', 'Recommendation')], ...plans.map(([e, p]) => { const sc = p ? kpiScore(p) : null; return [e.empNo, e.nameAr, unitName(e.deptId), empName(e.managerId), p?.templateName || '', p ? LX(KPI_ST[p.status][0], KPI_ST[p.status][1]) : LX('بدون خطة', 'No plan'), p?.status === 'final' ? p.score : sc?.score ?? '', p?.rating || '', p?.ratingLabel || '', p?.recommendation || '']; })];
  const det = [[LX('الرقم الوظيفي', 'No.'), LX('الموظف', 'Employee'), LX('المؤشر', 'KPI'), LX('الوحدة', 'Unit'), LX('الاتجاه', 'Direction'), LX('المستهدف', 'Target'), LX('الوزن %', 'Weight %'), LX('الفعلي', 'Actual'), LX('الإنجاز %', 'Achievement %')], ...plans.filter(([, p]) => p).flatMap(([e, p]) => p.items.map(i => [e.empNo, e.nameAr, i.name, i.unit || '', LX(KPI_DIR[i.dir]?.[0], KPI_DIR[i.dir]?.[1]), i.dir === 'yesno' ? '' : i.target, i.weight, i.dir === 'yesno' ? kpiFmt(i, i.actual) : (i.actual ?? ''), kpiAch(i) ?? '']))];
  exportRows(`kpi-${per}`, sum, LX('ملخص', 'Summary'), [[LX('تفاصيل المؤشرات', 'KPI details'), det]]);
};

/* ---------- the scorecard ---------- */
function kpiFlow(p) {
  const steps = [['draft', LX('الإعداد', 'Setup'), p.createdAt, p.createdById], ['locked', LX('التثبيت', 'Locked'), p.lockedAt, p.lockedById], ['submitted', LX('رفع التقييم', 'Submitted'), p.submittedAt, p.submittedById], ['final', LX('الاعتماد', 'Approved'), p.approvedAt, p.approvedById]];
  const idx = steps.findIndex(s => s[0] === p.status);
  return `<ol class="flow compact">${steps.map((s, i) => `<li class="fstep ${i < idx || p.status === 'final' ? 'done' : i === idx ? 'active' : ''}"><span class="fdot">${i + 1}</span><span class="fbody"><b>${s[1]}</b>${s[2] && i <= idx ? `<span class="fwho">${esc(empName(s[3]))}</span><span class="fdate num">${fmtD(s[2])}</span>` : ''}</span></li>`).join('')}</ol>`;
}
ACT['kpi-open'] = el => {
  const p = kpiPlan(el.dataset.id); if (!p) return toast(LX('الخطة غير موجودة', 'Plan not found'), true); if (!kpiCanView(p)) return toast(LX('لا تملك صلاحية عرض هذه الخطة', 'Not allowed'), true);
  const e = emp(p.empId) || {}; const man = kpiCanManage(p.empId); const self = p.empId === S.meId; const sc = kpiScore(p); const band = kpiBand(p.status === 'final' ? p.score : sc.score); const c = kpiCfg();
  const editDraft = p.status === 'draft' && man; const editAct = p.status === 'locked' && man;
  let body = `<div class="row" style="justify-content:space-between;align-items:flex-start"><div class="row">${avatar(e)}<div><b>${esc(e.nameAr || '—')}</b><div class="small muted">${esc(e.title || '')} · ${esc(unitName(e.deptId))} · <span class="num">${esc(e.empNo || '')}</span></div><div class="small">${esc(kpiPerLabel(p.period))}${p.templateName ? ' · ' + LX('القالب: ', 'Template: ') + esc(p.templateName) : ''}</div></div></div>${kpiBadge(p.status)}</div>${kpiFlow(p)}`;
  if (editDraft) {
    const ts = kpiTemplates();
    body += `<div class="note small">${LX('عدّل المؤشرات والمستهدفات والأوزان لهذا الموظف. بعد «تثبيت المؤشرات» لا يمكن تعديلها إلا بفك التثبيت من الموارد البشرية مع ذكر السبب.', 'Adjust KPIs, targets and weights, then lock. After locking only HR can unlock, with a reason.')}</div>${ts.length ? `<div class="row small"><label>${LX('استبدال المؤشرات من قالب', 'Replace KPIs from a template')} <select id="kpi-repl"><option value="">—</option>${ts.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><button class="btn sm" data-act="kpi-repl" data-id="${p.id}">${LX('استبدال', 'Replace')}</button></div>` : ''}${kpiEditor(p.items)}`;
  } else {
    body += `<div class="tablewrap"><table class="kpi-tbl"><thead><tr><th>${LX('المؤشر', 'KPI')}</th><th>${LX('المستهدف', 'Target')}</th><th>${LX('الوزن', 'Weight')}</th><th>${LX('الفعلي', 'Actual')}</th><th>${LX('الإنجاز', 'Achievement')}</th><th>${LX('المرجّح', 'Weighted')}</th></tr></thead><tbody>${(p.items || []).map(i => { const a = kpiAch(i); return `<tr><td><b>${esc(i.name)}</b><div class="small muted">${esc(LX(KPI_DIR[i.dir]?.[0], KPI_DIR[i.dir]?.[1]) || '')}${i.desc ? ' · ' + esc(i.desc) : ''}</div></td><td class="num">${i.dir === 'yesno' ? LX('تحقق', 'Yes') : kpiFmt(i, i.target)}</td><td class="num">${fmtN(i.weight, i.weight % 1 ? 1 : 0)}%</td><td>${editAct ? (i.dir === 'yesno' ? `<select class="k-act" data-id="${esc(i.id)}" aria-label="${LX('الفعلي', 'Actual')}"><option value="">—</option><option value="1" ${i.actual != null && kpiYes(i.actual) ? 'selected' : ''}>${LX('تحقق', 'Yes')}</option><option value="0" ${i.actual != null && i.actual !== '' && !kpiYes(i.actual) ? 'selected' : ''}>${LX('لم يتحقق', 'No')}</option></select>` : `<input class="k-act" data-id="${esc(i.id)}" inputmode="decimal" value="${esc(i.actual ?? '')}" aria-label="${LX('الفعلي', 'Actual')}" style="width:110px">`) : `<span class="num">${kpiFmt(i, i.actual)}</span>`}</td><td>${kpiPct(a)}${a != null ? `<div class="pf-bar sm"><i style="width:${Math.min(100, a / c.cap * 100).toFixed(1)}%"></i></div>` : ''}</td><td>${a == null ? '—' : `<span class="num">${fmtN(a * i.weight / 100, 1)}</span>`}</td></tr>`; }).join('')}</tbody><tfoot><tr><th colspan="2">${LX('الإجمالي', 'Total')}</th><th class="num">${fmtN(sc.wsum)}%</th><th class="small">${LX(`مُدخل ${sc.done} من ${sc.total}`, `${sc.done} of ${sc.total} entered`)}</th><th colspan="2"><b>${kpiPct(p.status === 'final' ? p.score : sc.score)}</b>${band ? ` — <span>${band.rating}: ${esc(band.label)}</span>` : ''}</th></tr></tfoot></table></div>`;
    if (p.status !== 'final' && sc.done && !sc.complete) body += `<div class="small muted">${LX('النتيجة الحالية تحتسب المؤشرات غير المُدخلة صفرًا.', 'Entries not filled count as zero for now.')}</div>`;
  }
  if (editAct) body += `<div class="form">${fld('kpi-comment', LX('ملاحظات المقيّم وخطة التطوير', 'Evaluator notes & development plan'), { type: 'textarea', value: p.evaluatorComment, full: true })}${fld('kpi-rec', LX('التوصية', 'Recommendation'), { type: 'select', options: KPI_RECS.map(x => [x, x]), value: p.recommendation || 'لا يوجد' })}</div>`;
  else if (p.evaluatorComment || p.recommendation) body += `<dl class="dl">${p.evaluatorComment ? `<dt>${LX('ملاحظات المقيّم', 'Evaluator notes')}</dt><dd>${esc(p.evaluatorComment)}</dd>` : ''}${p.recommendation ? `<dt>${LX('التوصية', 'Recommendation')}</dt><dd>${esc(p.recommendation)}</dd>` : ''}</dl>`;
  if (self && ['locked', 'submitted'].includes(p.status)) body += `<div class="form">${fld('kpi-self', LX('تعليقك على مؤشراتك (اختياري)', 'Your comment (optional)'), { type: 'textarea', value: p.selfComment, full: true })}</div>`;
  else if (p.selfComment) body += `<dl class="dl"><dt>${LX('تعليق الموظف', 'Employee comment')}</dt><dd>${esc(p.selfComment)}</dd></dl>`;
  body += `<div class="row small muted">${p.ackPlanAt ? `<span>${LX('أقر الموظف بالمؤشرات', 'Employee acknowledged KPIs')} <span class="num">${fmtD(p.ackPlanAt)}</span></span>` : p.status !== 'draft' && c.ackPlan ? `<span>${LX('لم يقر الموظف بالمؤشرات بعد', 'Not yet acknowledged by the employee')}</span>` : ''}${p.ackResultAt ? `<span>· ${LX('أقر بالنتيجة', 'Acknowledged result')} <span class="num">${fmtD(p.ackResultAt)}</span></span>` : ''}</div>`;
  if ((p.history || []).length) body += `<details class="small"><summary style="cursor:pointer">${LX('سجل الإجراءات', 'Action log')} (${p.history.length})</summary><div class="list">${p.history.slice().reverse().map(h => `<div><div class="grow"><b>${esc(h.action)}</b>${h.note ? ` — ${esc(h.note)}` : ''}<div class="muted">${esc(empName(h.byId))} · <span class="num">${fmtDT(h.at)}</span></div></div></div>`).join('')}</div></details>`;
  const B = (act, label, cls = '') => `<button class="btn ${cls}" data-act="${act}" data-id="${p.id}">${label}</button>`;
  let foot = '';
  if (editDraft) foot += B('kpi-save-draft', LX('حفظ المسودة', 'Save draft')) + B('kpi-lock', ic('check') + ' ' + LX('تثبيت المؤشرات', 'Lock KPIs'), 'pri') + B('kpi-del', LX('حذف المسودة', 'Delete draft'), 'ghost danger');
  if (editAct) foot += B('kpi-save-act', LX('حفظ الفعلي', 'Save actuals'), 'pri') + B('kpi-submit', LX('رفع التقييم للاعتماد', 'Submit for approval'), 'ok');
  if (p.status === 'locked' && can('perf.manage') && !self) foot += B('kpi-unlock', LX('فك التثبيت للتعديل', 'Unlock to edit'), 'ghost');
  if (p.status === 'submitted' && kpiCanApprove(p)) foot += B('kpi-approve', ic('check') + ' ' + LX('اعتماد التقييم', 'Approve'), 'ok') + B('kpi-return', LX('إعادة للمقيّم', 'Return to evaluator'), 'danger');
  if (p.status === 'submitted' && can('perf.manage') && p.submittedById === S.meId) body += `<div class="note warn small">${LX('رفعت هذا التقييم بنفسك، فيعتمده مسؤول آخر في الموارد البشرية (فصل الصلاحيات).', 'You submitted it, so another HR officer approves it (segregation of duties).')}</div>`;
  if (p.status === 'final' && can('perf.manage') && !self) foot += B('kpi-reopen', LX('إعادة فتح', 'Reopen'), 'ghost');
  if (self && ['locked', 'submitted'].includes(p.status)) foot += B('kpi-self-save', LX('حفظ تعليقي', 'Save my comment'));
  if (self && p.status === 'locked' && c.ackPlan && !p.ackPlanAt) foot += B('kpi-ack-plan', LX('أقر باطلاعي على المؤشرات والمستهدفات', 'I acknowledge my KPIs'), 'pri');
  if (self && p.status === 'final' && !p.ackResultAt) foot += B('kpi-ack-result', LX('أقر باطلاعي على النتيجة', 'I acknowledge the result'), 'pri');
  foot += `<button class="btn" data-act="close-modal">${LX('إغلاق', 'Close')}</button>`;
  openModal(LX('مؤشرات الأداء', 'KPI scorecard') + ' — ' + kpiPerLabel(p.period), body, foot, true); kpiWsumUpd();
};
const kpiReopen = id => setTimeout(() => ACT['kpi-open']({ dataset: { id } }), 60);
function kpiGuard(p, ok, msg) { if (!p || !ok) { toast(msg || LX('غير مسموح', 'Not allowed'), true); return false; } return true; }
ACT['kpi-repl'] = el => { const t = RAW.kpiTemplates.map[$('#kpi-repl')?.value]; if (!t) return; $('#kpi-rows').innerHTML = (t.items || []).map(i => kpiRowHtml({ ...i, id: newId() })).join(''); kpiWsumUpd(); S.kpiReplTpl = t; toast(LX('استُبدلت المؤشرات. احفظ المسودة لتطبيقها.', 'Replaced. Save the draft to keep it.')); };
async function kpiSaveDraft(p) {
  const { items, errs } = kpiRead(); if (errs.length) { toast(errs.slice(0, 3).join(' — '), true); return null; }
  const t = S.kpiReplTpl; S.kpiReplTpl = null;
  const doc = { ...strip(p), items: items.map(i => ({ ...i, actual: null })), ...(t ? { templateId: t.id, templateName: t.name } : {}), updatedAt: nowISO(), updatedById: S.meId };
  await kpiPut(p.id, doc); return doc;
}
ACT['kpi-save-draft'] = async el => { const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.status === 'draft' && kpiCanManage(p.empId))) return; if (await kpiSaveDraft(p)) { await audit('حفظ مسودة مؤشرات', 'kpi', p.id, empName(p.empId)); toast(LX('حُفظت المسودة', 'Draft saved')); kpiReopen(p.id); } };
ACT['kpi-lock'] = async el => {
  const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.status === 'draft' && kpiCanManage(p.empId))) return;
  const d = await kpiSaveDraft(p); if (!d) return; const sc = kpiScore(d);
  if (!d.items.length) return toast(LX('أضف مؤشرًا واحدًا على الأقل', 'Add at least one KPI'), true);
  if (Math.abs(sc.wsum - 100) >= .01) return toast(LX(`مجموع الأوزان ${fmtN(sc.wsum, 1)}% — يجب أن يساوي 100% قبل التثبيت`, `Weights total ${sc.wsum}% — must be 100%`), true);
  await kpiPut(p.id, { ...d, status: 'locked', lockedAt: nowISO(), lockedById: S.meId, history: kpiLog(d, 'تثبيت المؤشرات', `${d.items.length} مؤشر`) });
  await notify([p.empId], LX('ثُبّتت مؤشرات أدائك', 'Your KPIs were locked'), kpiPerLabel(p.period), { view: 'talent' });
  await audit('تثبيت مؤشرات أداء', 'kpi', p.id, `${empName(p.empId)} — ${p.period}`); toast(LX('ثُبّتت المؤشرات', 'KPIs locked')); kpiReopen(p.id);
};
ACT['kpi-del'] = el => { const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.status === 'draft' && kpiCanManage(p.empId))) return; confirmBox(LX('حذف مسودة الخطة؟ يمكنك إنشاؤها من جديد.', 'Delete this draft plan?'), async () => { await remove('kpiPlans', p.id); delete RAW.kpiPlans.map[p.id]; await audit('حذف مسودة مؤشرات', 'kpi', p.id, `${empName(p.empId)} — ${p.period}`); toast(LX('حُذفت المسودة', 'Deleted')); }, LX('حذف', 'Delete')); };
function kpiReadActuals(p) {
  const vals = {}; let bad = '';
  document.querySelectorAll('.k-act').forEach(i => { const it = p.items.find(x => x.id === i.dataset.id); if (!it) return; if (it.dir === 'yesno') vals[it.id] = i.value === '' ? null : i.value === '1'; else { const n = kpiNum(i.value); if (Number.isNaN(n)) bad = it.name; vals[it.id] = n; } });
  if (bad) { toast(LX(`قيمة غير رقمية في «${bad}»`, `Not a number: ${bad}`), true); return null; }
  return { ...strip(p), items: p.items.map(i => i.id in vals ? { ...i, actual: vals[i.id] } : i), evaluatorComment: $('#f-kpi-comment')?.value.trim() ?? p.evaluatorComment ?? '', recommendation: $('#f-kpi-rec')?.value || p.recommendation || '', updatedAt: nowISO(), updatedById: S.meId };
}
ACT['kpi-save-act'] = async el => { const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.status === 'locked' && kpiCanManage(p.empId))) return; const d = kpiReadActuals(p); if (!d) return; await kpiPut(p.id, d); await audit('إدخال قيم فعلية للمؤشرات', 'kpi', p.id, empName(p.empId)); toast(LX('حُفظت القيم', 'Saved')); kpiReopen(p.id); };
ACT['kpi-submit'] = async el => {
  const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.status === 'locked' && kpiCanManage(p.empId))) return; const d = kpiReadActuals(p); if (!d) return;
  const sc = kpiScore(d); if (!sc.complete) { await kpiPut(p.id, d); return toast(LX(`أدخل القيمة الفعلية لكل المؤشرات أولًا (${sc.done} من ${sc.total})`, `Enter all actuals first (${sc.done}/${sc.total})`), true); }
  const b = kpiBand(sc.score);
  await kpiPut(p.id, { ...d, status: 'submitted', score: sc.score, rating: b.rating, ratingLabel: b.label, submittedAt: nowISO(), submittedById: S.meId, history: kpiLog(d, 'رفع التقييم للاعتماد', `${sc.score}% — ${b.label}`) });
  await notify(hrPerfIds([S.meId, p.empId]), LX('تقييم أداء بانتظار الاعتماد', 'Performance review awaiting approval'), `${empName(p.empId)} — ${kpiPerLabel(p.period)}`, { view: 'talent' });
  await audit('رفع تقييم مؤشرات للاعتماد', 'kpi', p.id, `${empName(p.empId)} — ${sc.score}%`); toast(LX('رُفع التقييم للاعتماد', 'Submitted')); kpiReopen(p.id);
};
function kpiReason(title, act, id) { openModal(title, `<form class="form" id="kprf" data-form="kpi-reason" data-act2="${act}" data-id="${esc(id)}">${fld('reason', LX('السبب', 'Reason'), { type: 'textarea', required: true, full: true })}</form>`, `<button class="btn pri" form="kprf">${LX('تأكيد', 'Confirm')}</button><button class="btn" data-act="close-modal">${LX('إلغاء', 'Cancel')}</button>`); }
ACT['kpi-unlock'] = el => kpiReason(LX('فك تثبيت المؤشرات', 'Unlock KPIs'), 'unlock', el.dataset.id);
ACT['kpi-return'] = el => kpiReason(LX('إعادة التقييم للمقيّم', 'Return to evaluator'), 'return', el.dataset.id);
ACT['kpi-reopen'] = el => kpiReason(LX('إعادة فتح تقييم معتمد', 'Reopen an approved review'), 'reopen', el.dataset.id);
FORM['kpi-reason'] = async f => {
  const p = kpiPlan(f.dataset.id); const reason = readForm(f).reason; const a = f.dataset.act2; if (!p || !reason) return;
  if (a === 'unlock' && kpiGuard(p, p.status === 'locked' && can('perf.manage') && p.empId !== S.meId)) { await kpiPut(p.id, { ...strip(p), status: 'draft', ackPlanAt: null, history: kpiLog(p, 'فك التثبيت', reason) }); await notify([p.empId], LX('فُك تثبيت مؤشرات أدائك للتعديل', 'Your KPIs were unlocked for editing'), reason, { view: 'talent' }); await audit('فك تثبيت مؤشرات', 'kpi', p.id, `${empName(p.empId)} — ${reason}`); }
  else if (a === 'return' && kpiGuard(p, p.status === 'submitted' && kpiCanApprove(p))) { await kpiPut(p.id, { ...strip(p), status: 'locked', history: kpiLog(p, 'إعادة للمقيّم', reason) }); if (p.submittedById) await notify([p.submittedById], LX('أُعيد تقييم أداء للمراجعة', 'Review returned'), `${empName(p.empId)} — ${reason}`, { view: 'talent' }); await audit('إعادة تقييم مؤشرات للمقيّم', 'kpi', p.id, `${empName(p.empId)} — ${reason}`); }
  else if (a === 'reopen' && kpiGuard(p, p.status === 'final' && can('perf.manage') && p.empId !== S.meId)) { await kpiPut(p.id, { ...strip(p), status: 'locked', ackResultAt: null, history: kpiLog(p, 'إعادة فتح تقييم معتمد', reason) }); const rv = D.reviews.map['kpi_' + p.id]; if (rv) await put('reviews', rv.id, { ...strip(rv), status: 'draft', updatedAt: nowISO() }); await audit('إعادة فتح تقييم مؤشرات', 'kpi', p.id, `${empName(p.empId)} — ${reason}`); }
  else return;
  toast(LX('تم', 'Done')); kpiReopen(p.id);
};
ACT['kpi-approve'] = el => {
  const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.status === 'submitted' && kpiCanApprove(p))) return;
  const sc = kpiScore(p); const b = kpiBand(sc.score);
  confirmBox(LX(`اعتماد تقييم «${esc(empName(p.empId))}» بنتيجة ${fmtN(sc.score, 1)}% (${b.rating} — ${esc(b.label)})؟ تظهر النتيجة للموظف في ملفه.`, `Approve ${esc(empName(p.empId))} at ${sc.score}%?`), async () => {
    const at = nowISO();
    await kpiPut(p.id, { ...strip(p), status: 'final', score: sc.score, rating: b.rating, ratingLabel: b.label, approvedAt: at, approvedById: S.meId, history: kpiLog(p, 'اعتماد التقييم', `${sc.score}% — ${b.label}`) });
    await put('reviews', 'kpi_' + p.id, { empId: p.empId, period: p.period, kpiPlanId: p.id, score: sc.score, rating: b.rating, goals: p.items.map(i => `${i.name}: ${kpiFmt(i, i.actual)} / ${i.dir === 'yesno' ? LX('تحقق', 'Yes') : kpiFmt(i, i.target)} (${fmtN(kpiAch(i), 1)}%)`).join(' — '), comments: p.evaluatorComment || '', promotion: p.recommendation || '', reviewerId: p.submittedById, approvedById: S.meId, status: 'final', updatedAt: at });
    await notify([p.empId], LX('اعتُمد تقييم أدائك', 'Your performance review was approved'), `${kpiPerLabel(p.period)} — ${fmtN(sc.score, 1)}%`, { view: 'talent' });
    await audit('اعتماد تقييم مؤشرات', 'kpi', p.id, `${empName(p.empId)} — ${sc.score}% — ${b.label}`); toast(LX('اعتُمد التقييم', 'Approved')); kpiReopen(p.id);
  }, LX('اعتماد', 'Approve'));
};
ACT['kpi-self-save'] = async el => { const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.empId === S.meId && ['locked', 'submitted'].includes(p.status))) return; const v = $('#f-kpi-self')?.value.trim() || ''; await kpiPut(p.id, { ...strip(p), selfComment: v, history: kpiLog(p, 'تعليق الموظف') }); await audit('تعليق موظف على مؤشراته', 'kpi', p.id, ''); toast(LX('حُفظ تعليقك', 'Saved')); kpiReopen(p.id); };
ACT['kpi-ack-plan'] = async el => { const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.empId === S.meId && p.status === 'locked')) return; await kpiPut(p.id, { ...strip(p), ackPlanAt: nowISO(), history: kpiLog(p, 'إقرار الموظف بالمؤشرات') }); await audit('إقرار موظف بمؤشرات الأداء', 'kpi', p.id, p.period); toast(LX('تم تسجيل إقرارك', 'Acknowledged')); kpiReopen(p.id); };
ACT['kpi-ack-result'] = async el => { const p = kpiPlan(el.dataset.id); if (!kpiGuard(p, p?.empId === S.meId && p.status === 'final')) return; await kpiPut(p.id, { ...strip(p), ackResultAt: nowISO(), history: kpiLog(p, 'إقرار الموظف بالنتيجة') }); await audit('إقرار موظف بنتيجة التقييم', 'kpi', p.id, p.period); toast(LX('تم تسجيل إقرارك', 'Acknowledged')); kpiReopen(p.id); };

/* ---------- employee views ---------- */
function kpiPlansOf(empId) { return (RAW.kpiPlans?.list || []).filter(p => p.empId === empId && (empId !== S.meId || p.status !== 'draft')).sort(by('period', -1)); }
function kpiMiniList(ps) {
  return `<div class="list">${ps.map(p => { const sc = kpiScore(p); const s = p.status === 'final' ? p.score : sc.score; return `<div><div class="grow"><b>${esc(kpiPerLabel(p.period))}</b> ${kpiBadge(p.status)}<div class="small muted">${LX(`${sc.total} مؤشر`, `${sc.total} KPIs`)}${p.status === 'final' ? ` · ${LX('النتيجة', 'Score')} ${fmtN(p.score, 1)}% — ${esc(p.ratingLabel || '')}` : sc.done ? ` · ${LX('حتى الآن', 'So far')} ${fmtN(s, 1)}%` : ''}</div>${p.empId === S.meId && p.status === 'locked' && kpiCfg().ackPlan && !p.ackPlanAt ? `<div class="small" style="color:var(--warn)">${LX('مطلوب إقرارك بالمؤشرات', 'Your acknowledgement is needed')}</div>` : ''}${p.empId === S.meId && p.status === 'final' && !p.ackResultAt ? `<div class="small" style="color:var(--warn)">${LX('مطلوب إقرارك بالنتيجة', 'Please acknowledge the result')}</div>` : ''}</div><button class="btn sm" data-act="kpi-open" data-id="${p.id}">${LX('فتح', 'Open')}</button></div>`; }).join('')}</div>`;
}
function kpiMyHtml() { const ps = kpiPlansOf(S.meId); return `<section class="card"><h2>${LX('مؤشرات أدائي (KPI)', 'My KPIs')}</h2>${ps.length ? kpiMiniList(ps) : empty(LX('لم تُثبت لك مؤشرات أداء بعد', 'No KPIs locked for you yet'))}</section>`; }
function kpiProfileHtml(e) { const ps = kpiPlansOf(e.id).filter(kpiCanView); if (!ps.length && !kpiCanManage(e.id)) return ''; const per = String(new Date().getFullYear()); return `<section class="card pf-sec"><h2>${LX('مؤشرات الأداء (KPI)', 'KPIs')} ${kpiCanManage(e.id) && !kpiPlan(e.id + '_' + per) ? `<button class="btn sm" data-act="kpi-new" data-e="${e.id}" data-p="${per}">${ic('plus')} ${LX('إنشاء خطة', 'Create plan')} ${per}</button>` : ''}</h2>${ps.length ? kpiMiniList(ps) : empty(LX('لا توجد خطط مؤشرات', 'No KPI plans'))}</section>`; }
