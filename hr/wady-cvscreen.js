'use strict';
/* ===== AI CV screening: upload several CVs for one job, the AI reads each CV against the job requirements,
   scores it, and the platform ranks them. Then it can draft a unified interview form for the job.
   - Each CV is sent alone to the ai-assist function (task cv_screen); ranking is done here from the scores.
   - The AI is told to ignore gender, age, nationality, religion, marital status and photos, and not to return
     phone numbers, e-mails or ID numbers.
   - Drafts only: nothing is saved until the user picks candidates and presses "add as candidates". ===== */
const CVS = { job: null, rows: [], busy: false, done: 0, total: 0 };
const CVS_MAX_FILES = 15, CVS_MAX_MB = 4;
const CVS_TYPES = { 'application/pdf': 1, 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'text/plain': 1 };
const CVS_REC = { strong: ['approved', 'مرشح قوي'], consider: ['pending', 'يستحق المقابلة'], weak: ['draft', 'ضعيف'], not_fit: ['rejected', 'غير مناسب'], error: ['rejected', 'تعذّرت القراءة'] };
const CVS_ST = { met: '✓', partial: '◐', not_met: '✗', unclear: '؟' };
const cvsOk = () => { try { return haiOn() && haiTalent(); } catch (e) { return false; } };

const cvsB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error('تعذّر قراءة الملف ' + f.name)); r.readAsDataURL(f); });
const cvsType = f => f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : /\.txt$/i.test(f.name) ? 'text/plain' : /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : /\.png$/i.test(f.name) ? 'image/png' : '');
const cvsJson = t => { const s = String(t || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('رد غير مفهوم'); return JSON.parse(s.slice(a, b + 1)); };
async function cvsCall(body) {
  const { data, error } = await window.__sb.functions.invoke('ai-assist', { body: { app: 'hr', ...body } });
  let msg = data?.error; if (error && !msg) { try { msg = (await error.context.json()).error; } catch (e) { msg = error.message; } }
  if (msg) throw new Error(msg); return data;
}

ACT['cvs-open'] = () => {
  if (!cvsOk()) return toast('فرز السير يحتاج صلاحية المساعد الذكي وصلاحية التوظيف', true);
  const reqs = D.requisitions.list.filter(r => !['rejected', 'cancelled', 'closed', 'filled'].includes(r.status));
  openModal('فرز السير الذاتية بالذكاء الاصطناعي', `<p class="muted small">ارفع سير المتقدمين لوظيفة وحدة (حتى ${CVS_MAX_FILES} ملف، PDF أو صورة، ${CVS_MAX_MB} ميجا للملف). المساعد يقرأ كل سيرة ويقارنها بمتطلبات الوظيفة ويعطيها درجة، والمنصة ترتبهم. النتيجة مسودة لمختص الموارد البشرية، والقرار له.</p>
  <form class="form" id="cvsf" data-form="cvs-run">
  ${fld('reqId', 'الاحتياج الوظيفي', { type: 'select', options: reqs.map(r => [r.id, `${r.title || '—'} — ${unitName(r.deptId)}`]) })}
  ${fld('job', 'أو اكتب المسمى الوظيفي', { ph: 'مثال: مندوب مبيعات ميداني — جدة' })}
  ${fld('reqs', 'المتطلبات والمؤهلات', { type: 'textarea', full: true, hint: 'تنكتب تلقائياً من الاحتياج الوظيفي لو له متطلبات. اكتب الأساسي منها أولاً، وعلّم الإلزامي بكلمة (إلزامي).' })}
  <div class="fld full"><label for="f-cvs">السير الذاتية <span class="req">*</span></label><input type="file" id="f-cvs" name="cvs" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" required><span class="hint">ملفات Word: احفظها PDF أولاً (ملف ← حفظ باسم ← PDF).</span></div>
  </form>`, `<button class="btn pri" form="cvsf">${ic('star')} ابدأ الفرز</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
  const sel = document.getElementById('f-reqId'), ta = document.getElementById('f-reqs');
  if (sel && ta) sel.addEventListener('change', () => { const r = D.requisitions.map[sel.value]; if (r && !ta.value.trim()) ta.value = r.requirements || ''; });
};

FORM['cvs-run'] = async f => {
  if (CVS.busy) return; const v = readForm(f); const r = D.requisitions.map[v.reqId];
  const title = r?.title || v.job; if (!title) return toast('اختر الاحتياج الوظيفي أو اكتب المسمى', true);
  const requirements = (v.reqs || r?.requirements || '').trim(); if (!requirements) return toast('اكتب متطلبات الوظيفة عشان يقارن عليها', true);
  const files = [...(document.getElementById('f-cvs')?.files || [])]; if (!files.length) return toast('اختر ملفات السير', true);
  if (files.length > CVS_MAX_FILES) return toast(`الحد ${CVS_MAX_FILES} ملف في المرة`, true);
  for (const x of files) { if (!CVS_TYPES[cvsType(x)]) return toast(`الملف ${x.name}: النوع غير مدعوم. استخدم PDF أو صورة`, true); if (x.size > CVS_MAX_MB * 1048576) return toast(`الملف ${x.name} أكبر من ${CVS_MAX_MB} ميجا`, true); }
  CVS.job = { reqId: r?.id || null, title, dept: r ? unitName(r.deptId) : '', location: r?.locationId ? unitName(r.locationId) : '', requirements }; CVS.rows = []; CVS.busy = true; CVS.done = 0; CVS.total = files.length;
  const prog = () => openModal('فرز السير — ' + title, `<div class="empty">جاري قراءة السير… ${CVS.done} من ${CVS.total}<br><span class="small muted">لا تقفل الصفحة. كل سيرة تاخذ تقريباً 10–30 ثانية.</span></div>`, '', true);
  prog();
  try {
    for (const file of files) {
      let row = { file, fileName: file.name };
      try {
        const data = await cvsCall({ task: 'cv_screen', context: { job: CVS.job }, files: [{ name: file.name, media_type: cvsType(file), data: await cvsB64(file) }] });
        const j = cvsJson(data.answer); row = { ...row, ...j, score: Math.max(0, Math.min(100, Number(j.score) || 0)) }; CVS.usage = data.usage;
      } catch (e) { row = { ...row, name: file.name, score: -1, recommendation: 'error', summary: e.message || String(e) }; if (/الحد الشهري|صلاحية|موقوف|غير مفعّل/.test(row.summary)) { CVS.rows.push(row); CVS.done++; break; } }
      CVS.rows.push(row); CVS.done++; prog();
    }
    try { await audit('فرز سير ذاتية بالذكاء الاصطناعي', 'ai', CVS.job.reqId, `${title}: ${CVS.rows.length} سيرة`); } catch (e) { }
  } finally { CVS.busy = false; }
  cvsShow();
};

function cvsShow() {
  const rows = [...CVS.rows].sort((a, b) => b.score - a.score); CVS.rows = rows;
  const list = rows.map((c, i) => { const [cls, lab] = CVS_REC[c.recommendation] || CVS_REC.consider; const ok = c.score >= 0;
    return `<details class="cvs-r"><summary><input type="checkbox" class="cvs-pick" data-i="${i}" ${ok && ['strong', 'consider'].includes(c.recommendation) ? 'checked' : ''} ${ok ? '' : 'disabled'} onclick="event.stopPropagation()" aria-label="اختيار ${esc(c.name || '')}">
      <b class="num">${ok ? i + 1 : '—'}</b><span class="grow"><b>${esc(c.name || c.fileName)}</b>${c.current_title ? ` <span class="small muted">— ${esc(c.current_title)}</span>` : ''}${c.years_experience != null ? ` <span class="small muted num">· ${esc(c.years_experience)} سنة خبرة</span>` : ''}</span>
      <span class="num cvs-sc">${ok ? c.score : '—'}</span>${badge(cls, lab)}</summary>
      <div class="cvs-d"><p>${esc(c.summary || '')}</p>
      ${(c.requirements || []).length ? `<table class="cvs-t"><tr><th>المتطلب</th><th></th><th>الدليل من السيرة</th></tr>${c.requirements.map(q => `<tr><td>${esc(q.req)}</td><td class="num">${CVS_ST[q.status] || '؟'}</td><td class="small">${esc(q.evidence || '')}</td></tr>`).join('')}</table>` : ''}
      ${(c.strengths || []).length ? `<p><b>نقاط القوة:</b> ${c.strengths.map(esc).join('، ')}</p>` : ''}${(c.gaps || []).length ? `<p><b>الفجوات:</b> ${c.gaps.map(esc).join('، ')}</p>` : ''}
      ${(c.red_flags || []).length ? `<p><b>يحتاج تأكيد:</b> ${c.red_flags.map(esc).join('، ')}</p>` : ''}${(c.questions || []).length ? `<p><b>أسئلة خاصة بهذا المرشح:</b></p><ol>${c.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol>` : ''}
      <p class="small muted">الملف: ${esc(c.fileName)}</p></div></details>`; }).join('');
  openModal('نتيجة الفرز — ' + CVS.job.title, `<style>.cvs-r{border:1px solid var(--line,#e3e6ea);border-radius:10px;margin-bottom:8px;background:var(--surface,#fff)}.cvs-r summary{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer}.cvs-r .grow{flex:1}.cvs-sc{font-size:20px;font-weight:800;color:var(--brand,#051D48);min-width:36px;text-align:center}.cvs-d{padding:0 14px 12px;line-height:1.8}.cvs-t{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0}.cvs-t td,.cvs-t th{border-bottom:1px solid var(--line,#e3e6ea);padding:5px;text-align:start;vertical-align:top}</style>
    <div class="hai-warn">⚠️ ترتيب مبدئي من المساعد الذكي على السيرة فقط. راجع كل سيرة بنفسك قبل الاستبعاد، والقرار النهائي لمختص الموارد البشرية بعد المقابلة. المساعد ما ياخذ بالاعتبار الجنس أو العمر أو الجنسية أو الحالة الاجتماعية.</div>
    <p class="small muted">الدرجة من 100 حسب مطابقة المتطلبات. ✓ مستوفى · ◐ جزئياً · ✗ غير مستوفى · ؟ غير واضح من السيرة. اضغط على أي مرشح للتفاصيل.</p>${list}
    ${CVS.usage ? `<p class="muted small">استهلاكك هذا الشهر: ${fmtN(CVS.usage.month_tokens)} من ${fmtN(CVS.usage.cap)}</p>` : ''}`,
    `${CVS.job.reqId ? `<button class="btn pri" data-act="cvs-add">${ic('plus')} إضافة المختارين للمرشحين</button>` : ''}<button class="btn pri" data-act="cvs-form">${ic('file')} نموذج أسئلة المقابلة</button><button class="btn" data-act="cvs-csv">تنزيل النتيجة</button><button class="btn" data-act="close-modal">إغلاق</button>`, true);
}
const cvsPicked = () => [...document.querySelectorAll('.cvs-pick:checked')].map(x => CVS.rows[Number(x.dataset.i)]).filter(Boolean);

ACT['cvs-add'] = async () => {
  const sel = cvsPicked(); if (!sel.length) return toast('علّم المرشحين اللي تبغى تضيفهم', true); if (!CVS.job.reqId) return toast('الإضافة تحتاج احتياج وظيفي', true);
  let n = 0;
  for (const c of sel) {
    let cv = null; try { if (S.assets) { const u = await S.assets.upload(c.file); cv = { id: u.id, name: c.file.name, size: c.file.size, type: c.file.type, at: nowISO(), byId: S.meId }; } } catch (e) { }
    const id = newId();
    await put('candidates', id, { name: c.name || c.fileName, reqId: CVS.job.reqId, source: 'فرز ذكي', cv, stage: 'screening', screeningAt: nowISO(), createdAt: nowISO(), byId: S.meId,
      aiScore: c.score, aiRecommendation: c.recommendation, notes: `فرز ذكي (${c.score}/100): ${c.summary || ''}${(c.gaps || []).length ? '\nالفجوات: ' + c.gaps.join('، ') : ''}` });
    n++;
  }
  try { await audit('إضافة مرشحين من الفرز الذكي', 'candidate', CVS.job.reqId, `${CVS.job.title}: ${n}`); } catch (e) { }
  toast(`أُضيف ${n} مرشح لمرحلة الفرز`);
};

ACT['cvs-csv'] = () => {
  const rows = [['الترتيب', 'الاسم', 'المسمى الحالي', 'سنوات الخبرة', 'الدرجة', 'التوصية', 'الملخص', 'نقاط القوة', 'الفجوات', 'يحتاج تأكيد', 'الملف']];
  CVS.rows.forEach((c, i) => rows.push([c.score >= 0 ? i + 1 : '', c.name || '', c.current_title || '', c.years_experience ?? '', c.score >= 0 ? c.score : '', (CVS_REC[c.recommendation] || [])[1] || '', c.summary || '', (c.strengths || []).join('، '), (c.gaps || []).join('، '), (c.red_flags || []).join('، '), c.fileName]));
  saveFile(`فرز السير - ${CVS.job.title}.csv`.replace(/[\\/:*?"<>|]/g, '_'), toCSV(rows), 'text/csv;charset=utf-8');
};

ACT['cvs-form'] = async () => {
  if (CVS.busy) return; const sel = cvsPicked(); const base = sel.length ? sel : CVS.rows.filter(c => c.score >= 0).slice(0, 5);
  CVS.busy = true; openModal('نموذج أسئلة المقابلة — ' + CVS.job.title, `<div class="empty">جاري تجهيز النموذج… قد ياخذ دقيقة</div>`, '', true);
  try {
    const data = await cvsCall({ task: 'interview_form', context: { job: CVS.job, shortlisted: base.map(c => ({ name: c.name, score: c.score, gaps: c.gaps || [], red_flags: c.red_flags || [], unclear: (c.requirements || []).filter(q => q.status !== 'met').map(q => q.req) })) } });
    HAI.out = data.answer || ''; HAI.title = 'نموذج مقابلة — ' + CVS.job.title;
    openModal(HAI.title, `<div class="hai-warn">مسودة نموذج: راجعها وعدّلها قبل الاستخدام. تقدر تعدّل النص هنا مباشرة.</div><div class="hai-out" id="hai-out" contenteditable="true">${esc(HAI.out)}</div>`,
      `<button class="btn pri" data-act="hai-print">طباعة</button><button class="btn" data-act="hai-copy">نسخ</button><button class="btn" data-act="hai-dl">تنزيل نص</button><button class="btn" data-act="cvs-back">رجوع للنتيجة</button>`, true);
  } catch (e) { openModal('نموذج المقابلة', `<div class="empty">${esc(e.message || String(e))}</div>`, `<button class="btn" data-act="cvs-back">رجوع للنتيجة</button>`); }
  finally { CVS.busy = false; }
};
ACT['cvs-back'] = () => cvsShow();

/* entry points: a card on the AI assistant page and a button on the candidates tab */
{ const _v = VIEWS.hrai; VIEWS.hrai = () => { const h = _v(); if (!cvsOk()) return h; const card = `<button class="hai-c" data-act="cvs-open">${ic('users')}<b>فرز السير الذاتية وترتيبها</b><p>ارفع سير المتقدمين لوظيفة، ويقارنها بالمتطلبات ويرتبهم بالأفضلية، ويجهز نموذج أسئلة المقابلة.</p></button>`; return h.replace('<div class="hai-g">', '<div class="hai-g">' + card); }; }
{ const _t = VIEWS.talent; VIEWS.talent = () => { const h = _t(); if (!cvsOk()) return h; return h.replace(`<button class="btn sm pri" data-act="cand-new">`, `<button class="btn sm" data-act="cvs-open">${ic('star')} فرز سير بالذكاء الاصطناعي</button><button class="btn sm pri" data-act="cand-new">`); }; }
