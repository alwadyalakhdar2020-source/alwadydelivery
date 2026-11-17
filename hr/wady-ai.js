'use strict';
/* ===== HR AI assistant: nine drafting/analysis tools (interviews, onboarding, performance reviews, pay bands, offers,
   org planning, people reports, policy questions, recruiting pipeline).
   Drafts only — nothing is written back. Context is built from data the user can already see (inScope + page rights);
   pay figures leave only as anonymous group statistics (groups of 3 or more); IDs, IBAN, phones, e-mails, birth dates
   are never included and are stripped again on the server. ===== */
const HAI = { tool: null, out: '', busy: false, err: '', title: '' };
const haiOn = () => { try { return !!(WADY_PERM.admin || wadyLvl('hr', 'ai') >= 1); } catch (e) { return false; } };
const haiTalent = () => can('rec.manage') || wadyLvl('hr', 'talent') >= 1;
const haiStaff = () => can('emp.view.all') || can('reports.hr') || can('reports.exec');
const haiE = () => D.employees.list.filter(e => e.status !== 'terminated' && inScope(e.id));
const haiLite = e => e ? { name: e.nameAr, title: e.title || '', grade: e.grade || '', dept: unitName(e.deptId), location: unitName(e.locationId), manager: e.managerId ? empName(e.managerId) : '', hireDate: e.hireDate || e.joinDate || '', contractType: e.contractType || '', status: e.status || 'active' } : null;
const haiDays = d => d ? Math.round((Date.now() - new Date(d).getTime()) / 864e5) : null;
const haiPick = (o, drop = []) => { const r = {}; for (const [k, v] of Object.entries(o || {})) { if (k === 'id' || /Id$|^id|At$|cv|file|docs|by/i.test(k) && !['deptId'].includes(k) || drop.includes(k)) continue; if (v == null || v === '' || typeof v === 'object' && !Array.isArray(v)) continue; r[k] = v; } if (o && o.deptId) r.dept = unitName(o.deptId); return r; };
const haiCount = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x) || 'غير محدد'; m[k] = (m[k] || 0) + 1; }); return m; };
const haiQ = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
const haiStats = a => ({ n: a.length, min: Math.min(...a), p25: haiQ(a, .25), median: haiQ(a, .5), p75: haiQ(a, .75), max: Math.max(...a) });
const haiPay = e => { const s = D.salaries.map[e.id]; if (!s) return null; const t = ['basic', 'housing', 'transport', 'other'].reduce((x, k) => x + Number(s[k] || 0), 0); return t > 0 ? t : null; };
const haiEmpOpts = list => list.sort((a, b) => (a.nameAr || '').localeCompare(b.nameAr || '', 'ar')).map(e => [e.id, `${e.nameAr}${e.title ? ' — ' + e.title : ''}`]);
const haiReqs = () => D.requisitions.list.filter(r => !['rejected', 'cancelled', 'closed', 'filled'].includes(r.status));

const HAI_TOOLS = [
  { id: 'interview_prep', ic: 'users', t: 'خطة مقابلة وبطاقة تقييم', d: 'أسئلة مبنية على الجدارات وبطاقة تقييم موحدة، عشان كل المرشحين يتقيّمون بنفس المعيار.', ok: haiTalent,
    form: () => fld('reqId', 'الاحتياج الوظيفي', { type: 'select', options: haiReqs().map(r => [r.id, `${r.title || '—'} — ${unitName(r.deptId)}`]) }) + fld('job', 'أو اكتب المسمى الوظيفي', { ph: 'مثال: مشرف إنتاج' }) + fld('notes', 'متطلبات أو ملاحظات إضافية', { type: 'textarea', full: true }),
    ctx: v => { const r = D.requisitions.map[v.reqId]; if (!r && !v.job) throw new Error('اختر الاحتياج الوظيفي أو اكتب المسمى'); const title = r?.title || v.job;
      return { context: { job: r ? haiPick(r) : { title }, same_title_in_company: haiE().filter(e => e.title && e.title === title).length }, question: v.notes, label: title }; } },
  { id: 'onboarding', ic: 'check', t: 'تهيئة الموظف الجديد', d: 'قائمة تجهيز قبل أول يوم، وخطة أول أسبوع، وأهداف 30/60/90 يوم.', ok: () => can('emp.view.all') || can('team.view'),
    form: () => { const recent = haiE().filter(e => haiDays(e.hireDate || e.joinDate) == null || haiDays(e.hireDate || e.joinDate) <= 120); return fld('empId', 'الموظف', { type: 'select', required: true, options: haiEmpOpts(recent.length ? recent : haiE()), hint: 'تظهر المعيّنين خلال آخر 120 يوم' }) + fld('notes', 'ملاحظات (مثلاً: يحتاج سيارة، يعمل بنظام ورديات)', { type: 'textarea', full: true }); },
    ctx: v => { const e = emp(v.empId); if (!e) throw new Error('اختر الموظف'); const peers = haiE().filter(x => x.deptId === e.deptId && x.id !== e.id).length;
      return { context: { new_hire: haiLite(e), department_size: peers + 1, asset_categories: LIST('assetCategories'), hr_forms: D.forms.list.filter(f => f.status === 'published' && ['hr', 'policy'].includes(f.category)).slice(0, 40).map(f => f.title), request_types: D.requestTypes.list.map(t => t.name).filter(Boolean).slice(0, 40) }, question: v.notes, label: e.nameAr }; } },
  { id: 'performance_review', ic: 'star', t: 'تجهيز تقييم الأداء', d: 'نموذج تقييم ذاتي ونموذج المدير وأمثلة سلوك لكل مستوى، ونقاط جلسة المعايرة.', ok: () => can('perf.manage') || D.employees.list.some(e => e.managerId === S.meId),
    form: () => { const list = can('perf.manage') ? haiE() : D.employees.list.filter(e => e.managerId === S.meId && e.status !== 'terminated'); return fld('empId', 'الموظف', { type: 'select', required: true, options: haiEmpOpts(list.filter(e => e.id !== S.meId)) }) + fld('period', 'فترة التقييم', { required: true, ph: 'مثال: 2026' }) + fld('notes', 'ملاحظات', { type: 'textarea', full: true }); },
    ctx: v => { const e = emp(v.empId); if (!e) throw new Error('اختر الموظف'); if (!v.period) throw new Error('اكتب فترة التقييم');
      return { context: { employee: haiLite(e), period: v.period, kpi_plans: (D.kpiPlans?.list || []).filter(p => p.empId === e.id).map(p => haiPick(p)), previous_goals: D.reviews.list.filter(r => r.empId === e.id).map(r => ({ period: r.period, goals: r.goals })) }, question: v.notes, label: `${e.nameAr} — ${v.period}` }; } },
  { id: 'comp_analysis', ic: 'money', t: 'تحليل الرواتب والنطاقات', d: 'موقع راتب أو عرض مقترح داخل نطاق الوظيفة في الشركة. يرسل إحصاءات مجمعة فقط بدون أسماء.', ok: () => can('pay.view') || can('pay.manage'),
    form: () => { const titles = [...new Set(haiE().map(e => e.title).filter(Boolean))].sort(); const grades = [...new Set(haiE().map(e => e.grade).filter(Boolean))].sort();
      return fld('by', 'التجميع حسب', { type: 'select', blank: false, options: [['title', 'المسمى الوظيفي'], ['grade', 'المستوى الوظيفي']] }) + fld('title', 'المسمى', { type: 'select', options: titles }) + fld('grade', 'أو المستوى', { type: 'select', options: grades }) + fld('offer', 'إجمالي شهري مقترح للمقارنة (اختياري)', { type: 'number' }) + fld('notes', 'السؤال', { type: 'textarea', full: true, ph: 'مثال: هل العرض منافس داخلياً؟ وش مخاطره؟' }); },
    ctx: v => { const key = v.by === 'grade' ? 'grade' : 'title'; const val = v[key]; if (!val) throw new Error('اختر ' + (key === 'grade' ? 'المستوى' : 'المسمى'));
      const vals = haiE().filter(e => e[key] === val).map(haiPay).filter(x => x != null); if (vals.length < 3) throw new Error(`عدد الموظفين برواتب مسجلة في هذي المجموعة ${vals.length}. لازم 3 على الأقل عشان ما تنكشف رواتب أفراد.`);
      const groups = {}; haiE().forEach(e => { const g = e[key]; const p = haiPay(e); if (g && p != null) (groups[g] = groups[g] || []).push(p); });
      const other = Object.entries(groups).filter(([, a]) => a.length >= 3).map(([g, a]) => ({ group: g, ...haiStats(a) }));
      return { context: { group_by: key, group: val, pay_stats_monthly_total_sar: haiStats(vals), other_groups: other, proposed_monthly_total_sar: v.offer ? Number(v.offer) : null, note: 'إجمالي شهري = الأساسي + السكن + النقل + بدلات أخرى' }, question: v.notes, label: val }; } },
  { id: 'draft_offer', ic: 'file', t: 'مسودة خطاب عرض وظيفي', d: 'خطاب عرض رسمي ببيانات المرشح والوظيفة والراتب اللي تكتبه أنت.', ok: haiTalent,
    form: () => fld('candId', 'المرشح', { type: 'select', required: true, options: D.candidates.list.filter(c => ['interview', 'offer'].includes(c.stage)).map(c => [c.id, `${c.name || '—'} — ${D.requisitions.map[c.reqId]?.title || ''}`]) }) +
      fld('title', 'المسمى الوظيفي') + fld('start', 'تاريخ المباشرة المتوقع', { type: 'date' }) + fld('contract', 'نوع العقد', { type: 'select', options: LIST('contractTypes') }) + fld('probation', 'فترة التجربة', { ph: 'مثال: 90 يوم' }) +
      fld('pay', 'الراتب والبدلات', { type: 'textarea', full: true, ph: 'مثال: أساسي 6000، سكن 1500، نقل 500' }) + fld('notes', 'مزايا أو شروط أخرى', { type: 'textarea', full: true }),
    ctx: v => { const c = D.candidates.map[v.candId]; if (!c) throw new Error('اختر المرشح'); const r = D.requisitions.map[c.reqId];
      return { context: { candidate_name: c.name, job: r ? haiPick(r) : null, offer: { title: v.title || r?.title || '', start_date: v.start, contract_type: v.contract, probation: v.probation }, company: SET().company || 'مصنع الوادي الأخضر المميز' }, question: `الراتب والبدلات كما يكتبها المستخدم: ${v.pay || '[يُستكمل]'}\n${v.notes || ''}`, label: c.name }; } },
  { id: 'org_planning', ic: 'chart', t: 'تخطيط الهيكل والقوى العاملة', d: 'العدد لكل إدارة وموقع، ونطاق إشراف المديرين، والاحتياجات المفتوحة، وتوصيات للهيكل.', ok: haiStaff,
    form: () => fld('notes', 'السؤال أو التركيز', { type: 'textarea', full: true, ph: 'مثال: هل نحتاج مشرف إضافي في مصنع عسفان؟' }),
    ctx: v => { const E = haiE(); const span = {}; E.forEach(e => { if (e.managerId) span[e.managerId] = (span[e.managerId] || 0) + 1; });
      return { context: { headcount: E.length, by_department: haiCount(E, e => unitName(e.deptId)), by_location: haiCount(E, e => unitName(e.locationId)), by_title: haiCount(E, e => e.title),
        managers_span: Object.entries(span).map(([m, n]) => ({ manager: empName(m), title: emp(m)?.title || '', direct_reports: n })).sort((a, b) => b.direct_reports - a.direct_reports),
        no_manager: E.filter(e => !e.managerId).length, open_requisitions: haiReqs().map(r => ({ ...haiPick(r), age_days: haiDays(r.createdAt) })) }, question: v.notes, label: 'الهيكل' }; } },
  { id: 'people_report', ic: 'chart', t: 'تقرير الموارد البشرية', d: 'العدد والتعيينات والخروج والدوران والسعودة والتوزيع، مع ملاحظات وتوصيات.', ok: haiStaff,
    form: () => { const t = todayISO(); const y = String(Number(t.slice(0, 4)) - 1) + t.slice(4); return fld('from', 'من', { type: 'date', value: y }) + fld('to', 'إلى', { type: 'date', value: t }) + fld('notes', 'تركيز التقرير', { type: 'textarea', full: true }); },
    ctx: v => { const from = v.from || '0000', to = v.to || '9999'; const all = D.employees.list.filter(e => inScope(e.id)); const E = all.filter(e => e.status !== 'terminated');
      const hires = all.filter(e => { const d = (e.hireDate || e.joinDate || '').slice(0, 10); return d && d >= from && d <= to; });
      const exits = all.filter(e => e.status === 'terminated' && (e.terminatedAt || '').slice(0, 10) >= from && (e.terminatedAt || '').slice(0, 10) <= to);
      const ksa = E.filter(e => /سعود|saudi/i.test(e.nationality || '')).length;
      return { context: { period: { from, to }, headcount_now: E.length, hires: hires.length, exits: exits.length, exits_by_type: haiCount(exits, e => e.exitType), exits_by_reason: haiCount(exits, e => e.exitReason),
        turnover_note: 'الدوران = الخروج ÷ متوسط العدد خلال الفترة (المتوسط تقريبي من العدد الحالي إذا ما توفر غيره)', saudi_count: ksa, nationality_known: E.filter(e => e.nationality).length,
        by_nationality: haiCount(E, e => e.nationality), by_department: haiCount(E, e => unitName(e.deptId)), by_location: haiCount(E, e => unitName(e.locationId)), by_contract: haiCount(E, e => e.contractType),
        on_probation: E.filter(e => e.status === 'probation').length, contracts_ending_90d: E.filter(e => e.contractEnd && haiDays(e.contractEnd) >= -90 && haiDays(e.contractEnd) <= 0).length }, question: v.notes, label: `${from} — ${to}` }; } },
  { id: 'policy_lookup', ic: 'shield', t: 'سؤال عن سياسات الشركة', d: 'إجابة بلغة بسيطة من السياسات المنشورة في مركز النماذج والسياسات، أو من نص تلصقه.', ok: () => true,
    form: () => fld('q', 'سؤالك', { type: 'textarea', required: true, full: true, ph: 'مثال: كم يوم إجازة الزواج؟' }) + fld('text', 'نص السياسة (اختياري، الصق الجزء المتعلق)', { type: 'textarea', full: true, hint: 'المساعد يقرأ عناوين السياسات المنشورة وملخصاتها. لو الإجابة داخل ملف PDF الصق النص هنا.' }),
    ctx: v => { if (!v.q) throw new Error('اكتب سؤالك'); return { context: { policies: D.forms.list.filter(f => f.status === 'published' && f.category === 'policy').map(f => ({ code: f.code, title: f.title, version: f.version, effective: f.effectiveDate, summary: f.summary, keywords: f.keywords })), pasted_policy_text: v.text || null }, question: v.q, label: v.q.slice(0, 40) }; } },
  { id: 'recruiting_pipeline', ic: 'grad', t: 'متابعة مسار التوظيف', d: 'المرشحين في كل مرحلة لكل احتياج، والاختناقات، والطلبات المتأخرة، والإجراء التالي.', ok: haiTalent,
    form: () => fld('notes', 'تركيز (اختياري)', { type: 'textarea', full: true }),
    ctx: v => { const st = typeof CAND_STAGES !== 'undefined' ? CAND_STAGES : {};
      return { context: { stages: st, requisitions: haiReqs().map(r => { const cs = D.candidates.list.filter(c => c.reqId === r.id); return { ...haiPick(r), status: r.status, age_days: haiDays(r.createdAt), candidates_by_stage: haiCount(cs, c => st[c.stage] || c.stage), oldest_in_stage_days: cs.filter(c => !['hired', 'rejected'].includes(c.stage)).map(c => haiDays(c[c.stage + 'At'] || c.createdAt)).sort((a, b) => b - a)[0] ?? null }; }),
        unlinked_candidates: D.candidates.list.filter(c => !c.reqId).length }, question: v.notes, label: 'التوظيف' }; } }
];

const haiCss = `<style>.hai-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.hai-c{background:var(--surface,#fff);border:1px solid var(--line,#e3e6ea);border-radius:12px;padding:14px;cursor:pointer;text-align:start;font:inherit;color:inherit}
.hai-c svg{width:26px;height:26px;color:var(--brand,#051D48)}.hai-c:hover{border-color:var(--brand,#051D48)}.hai-c b{display:block;margin:6px 0 4px}.hai-c p{margin:0;font-size:13px;opacity:.75;line-height:1.6}.hai-out{white-space:pre-wrap;line-height:1.9;background:var(--surface,#fff);border:1px solid var(--line,#e3e6ea);border-radius:10px;padding:14px;max-height:60vh;overflow:auto}
.hai-warn{background:#FFF7E6;border:1px solid #F2C46D;border-radius:10px;padding:8px 12px;font-size:13px;margin-bottom:10px}</style>`;
VIEWS.hrai = () => {
  if (!haiOn()) return pageHead('مساعد الموارد البشرية', '') + empty('ما عندك صلاحية على المساعد الذكي. اطلبها من مدير النظام.');
  const list = HAI_TOOLS.filter(x => { try { return x.ok(); } catch (e) { return false; } });
  return haiCss + pageHead('مساعد الموارد البشرية الذكي', 'يجهز مسودات وتحاليل من بيانات المنصة اللي تظهر لك. ما يعدّل أي بيانات، وكل ناتج مسودة تراجعها قبل الاعتماد.') +
    `<div class="hai-warn">⚠️ النواتج مسودات وتحتاج مراجعة مختص الموارد البشرية، وأي بند يمس حقوق نظامية يُراجع مع نظام العمل السعودي وعقد الموظف. البيانات الحساسة (الهوية، الآيبان، الجوال، البريد، تاريخ الميلاد) ما تنرسل، والرواتب تنرسل كإحصاءات مجمعة بدون أسماء فقط.</div>` +
    (list.length ? `<div class="hai-g">${list.map(x => `<button class="hai-c" data-act="hai-open" data-id="${x.id}">${ic(x.ic)}<b>${esc(x.t)}</b><p>${esc(x.d)}</p></button>`).join('')}</div>` : empty('ما فيه أدوات متاحة لصلاحيتك.'));
};
ACT['hai-open'] = el => { const x = HAI_TOOLS.find(t => t.id === el.dataset.id); if (!x) return;
  openModal(x.t, `<p class="muted small">${esc(x.d)}</p><form class="form" id="haif" data-form="hai-run" data-id="${x.id}">${x.form()}</form>`,
    `<button class="btn pri" form="haif">${ic('star')} تجهيز المسودة</button><button class="btn" data-act="close-modal">إلغاء</button>`, true); };
FORM['hai-run'] = async f => {
  const x = HAI_TOOLS.find(t => t.id === f.dataset.id); if (!x || HAI.busy) return; const v = readForm(f); let c;
  try { c = x.ctx(v); } catch (e) { return toast(e.message, true); }
  HAI.busy = true; openModal(x.t + ' — ' + (c.label || ''), `<div class="empty">جاري التجهيز… قد ياخذ دقيقة</div>`, '', true);
  try {
    const { data, error } = await window.__sb.functions.invoke('ai-assist', { body: { app: 'hr', task: x.id, question: c.question || '', context: c.context } });
    let msg = data?.error; if (error && !msg) { try { msg = (await error.context.json()).error; } catch (e) { msg = error.message; } }
    if (msg) throw new Error(msg);
    HAI.out = data.answer || ''; HAI.title = `${x.t} — ${c.label || ''}`;
    try { await audit('استخدام مساعد الموارد البشرية', 'ai', null, `${x.t}: ${c.label || ''}`); } catch (e) { }
    openModal(HAI.title, `<div class="hai-warn">مسودة من المساعد الذكي: راجعها وعدّلها قبل أي اعتماد أو إرسال.</div><div class="hai-out" id="hai-out" contenteditable="true">${esc(HAI.out)}</div>${data.usage ? `<p class="muted small">استهلاكك هذا الشهر: ${fmtN(data.usage.month_tokens)} من ${fmtN(data.usage.cap)}</p>` : ''}`,
      `<button class="btn pri" data-act="hai-copy">نسخ</button><button class="btn" data-act="hai-print">طباعة</button><button class="btn" data-act="hai-dl">تنزيل نص</button><button class="btn" data-act="close-modal">إغلاق</button>`, true);
  } catch (e) { openModal(x.t, `<div class="empty">${esc(e.message || String(e))}</div>`, `<button class="btn" data-act="close-modal">إغلاق</button>`); }
  finally { HAI.busy = false; }
};
const haiText = () => (document.getElementById('hai-out')?.innerText || HAI.out);
ACT['hai-copy'] = async () => { try { await navigator.clipboard.writeText(haiText()); toast('تم النسخ'); } catch (e) { toast('تعذّر النسخ: ظلل النص وانسخه يدوياً', true); } };
ACT['hai-dl'] = () => saveFile((HAI.title || 'مسودة').replace(/[\\/:*?"<>|]/g, '_') + '.txt', haiText(), 'text/plain;charset=utf-8');
ACT['hai-print'] = () => { const w = window.open('', '_blank'); if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة', true); const logo = window.WADY_LOGO_DATA || '';
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(HAI.title)}</title><style>@page{size:A4;margin:14mm}body{font-family:Tajawal,Tahoma,sans-serif;color:#0B1B33;font-size:12.5px}.hd{display:flex;align-items:center;gap:12px;border-bottom:3px solid #051D48;padding-bottom:8px;margin-bottom:12px}.hd img{height:54px}.hd b{font-size:16px;color:#051D48}.b{white-space:pre-wrap;line-height:2}.n{color:#B42318;font-size:11px;margin-bottom:8px}</style></head><body>
  <div class="hd">${logo ? `<img src="${logo}">` : ''}<b>${esc(SET().company || 'مصنع الوادي الأخضر المميز')}</b><span style="flex:1"></span><span>${esc(HAI.title)}</span></div><div class="n">مسودة — تحتاج مراجعة واعتماد</div><div class="b">${esc(haiText())}</div><script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`); w.document.close(); };
{ const _ni = navItems; navItems = function () { let h = _ni(); if (!haiOn() || (typeof portalNavOk === 'function' && !portalNavOk('hrai'))) return h;
    const cur = S.view === 'hrai'; const btn = `<button data-act="go" data-v="hrai" ${cur ? 'aria-current="page"' : ''}>${ic('star')}<span>مساعد الموارد البشرية</span></button>`;
    const i = h.indexOf('data-v="notifications"'); if (i < 0) return h + btn; const j = h.lastIndexOf('<button', i); return h.slice(0, j) + btn + h.slice(j); }; }
