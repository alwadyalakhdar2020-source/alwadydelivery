'use strict';
/* ===== Rule-based recommendations for HR & customs clearance (no AI). Each card = rule + evidence + suggested action + owner.
   Only the people the user can already see (inScope) and only the sections the user has rights to are evaluated. ===== */
const HREC_SEV = { 1: ['عاجل', '#B42318'], 2: ['مهم', '#C27C00'], 3: ['تحسين', '#1F6FB2'] };
const hrecCss = `<style>.rc{background:var(--surface,#fff);border:1px solid var(--line,#e3e6ea);border-radius:10px;padding:10px 12px;margin:8px 0}.rc-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rc-sev{color:#fff;border-radius:6px;padding:1px 8px;font-size:12px;font-weight:700}.rc-own{margin-inline-start:auto;font-size:12px;opacity:.7}.rc-ev{margin:6px 0 2px}.rc details{margin-top:6px}.rc summary{cursor:pointer;font-size:13px;opacity:.85}.rc table{width:100%;font-size:13px;margin-top:4px}.rc td{padding:3px 6px;border-bottom:1px solid var(--line,#e3e6ea)}.rc-rule{margin-top:4px;font-size:12px;opacity:.65}.rc-sum{display:flex;gap:14px;flex-wrap:wrap;margin:4px 0 10px}</style>`;
const hrecCard = r => { const [lab, col] = HREC_SEV[r.sev]; return `<div class="rc" style="border-inline-start:4px solid ${col}"><div class="rc-h"><span class="rc-sev" style="background:${col}">${lab}</span><b>${esc(r.title)}</b><span class="rc-own">${esc(r.owner || '')}</span></div>
 <div class="rc-ev">${r.ev}</div><div><b>المقترح:</b> ${r.act}</div>${r.list && r.list.length ? `<details><summary>التفاصيل (${r.list.length})</summary><table><tbody>${r.list.map(x => `<tr>${x.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></details>` : ''}<div class="rc-rule">القاعدة: ${esc(r.rule)}</div></div>`; };
const hrecEmp = e => `<a href="#" data-act="go" data-v="employee" data-id="${esc(e.id)}">${esc(e.nameAr || '—')}</a>`;
const hrecShip = s => `<a href="#" data-act="open-ship" data-id="${esc(s.id)}">${esc(s.ref || s.blNo || s.id)}</a>`;
const hrecHR = () => can('emp.view.all') && (hasRole('personnel') || hasRole('hrManager'));
const hrecSAR = n => fmtN(Math.round(n)) + ' ريال';
function computeHrRecs() {
  const out = []; const t = todayISO();
  if (hrecHR()) {
    const E = D.employees.list.filter(e => e.status !== 'terminated' && inScope(e.id));
    const docs = []; E.forEach(e => {
      [['contractEnd', 'العقد'], ['idExpiry', 'الهوية / الإقامة'], ['passportExpiry', 'الجواز']].forEach(([k, l]) => { if (e[k]) docs.push({ e, what: l, d: String(e[k]).slice(0, 10) }); });
      (e.docs || []).forEach(d => { if (d.expiry) docs.push({ e, what: d.name || 'مستند', d: String(d.expiry).slice(0, 10) }); });
    });
    const ex = docs.filter(x => x.d < t).sort((a, b) => a.d < b.d ? -1 : 1), soon = docs.filter(x => x.d >= t && x.d <= addDays(t, 30)).sort((a, b) => a.d < b.d ? -1 : 1);
    if (ex.length) out.push({ sev: 1, owner: 'شؤون الموظفين', title: `${ex.length} وثيقة موظف منتهية`, ev: 'الإقامة أو العقد المنتهي يعرّض الشركة لغرامات من الجهات الرسمية، ويوقف خدمات الموظف.', act: 'ابدأ التجديد فوراً حسب الأقدم. ولو العقد انتهى والموظف مستمر، وثّق التجديد في ملفه عشان ما يعتبر غير نظامي.', rule: 'تاريخ الانتهاء قبل اليوم', list: ex.map(x => [hrecEmp(x.e), esc(x.what), fmtD(x.d), `منذ ${daysBetween(x.d, t)} يوم`]) });
    if (soon.length) out.push({ sev: 2, owner: 'شؤون الموظفين', title: `${soon.length} وثيقة تنتهي خلال 30 يوم`, ev: 'التجديد يحتاج وقت (رسوم، مواعيد، موافقات).', act: 'رتّب التجديد الحين، وحدّث التاريخ في ملف الموظف بعده.', rule: 'تنتهي خلال 30 يوم', list: soon.map(x => [hrecEmp(x.e), esc(x.what), fmtD(x.d), `باقي ${daysBetween(t, x.d)} يوم`]) });
    const prob = E.filter(e => e.probationEnd && e.probationEnd >= t && e.probationEnd <= addDays(t, 21));
    if (prob.length) out.push({ sev: 2, owner: 'المدير المباشر + شؤون الموظفين', title: `${prob.length} موظف تنتهي فترة تجربتهم خلال 3 أسابيع`, ev: 'بعد نهاية التجربة يصير إنهاء العقد أصعب وأعلى تكلفة.', act: 'اطلب تقييم المدير المباشر واتخذ القرار (تثبيت أو تمديد حسب النظام أو إنهاء) قبل التاريخ.', rule: 'نهاية فترة التجربة خلال 21 يوم', list: prob.map(e => [hrecEmp(e), fmtD(e.probationEnd), esc(unitName(e.deptId))]) });
    const miss = E.map(e => ({ e, m: [!e.deptId && 'الإدارة', !e.idExpiry && 'انتهاء الهوية', !e.contractEnd && e.contractType === 'محدد المدة' && 'نهاية العقد', !e.mobile && !e.phone && 'الجوال'].filter(Boolean) })).filter(x => x.m.length);
    if (miss.length >= 3) out.push({ sev: 3, owner: 'شؤون الموظفين', title: `${miss.length} ملف موظف ناقص بيانات أساسية`, ev: 'التنبيهات الآلية (انتهاء الهوية والعقد) ما تشتغل لهم.', act: 'كمّل الحقول الناقصة من ملف الموظف أو بالاستيراد من Excel.', rule: 'غياب الإدارة أو تاريخ انتهاء الهوية أو نهاية العقد المحدد المدة أو الجوال', list: miss.slice(0, 40).map(x => [hrecEmp(x.e), x.m.join('، ')]) });
    // leave liability
    const lts = D.leaveTypes.list.filter(l => l.tracked !== false && /سنوي|اعتيادي/.test(l.name || ''));
    if (lts.length) { const hi = []; E.forEach(e => { lts.forEach(l => { try { const b = balanceOf(e.id, l.id); if (b && b.available >= 45) hi.push([hrecEmp(e), esc(l.name), `${fmtN(b.available)} يوم`]); } catch (x) { } }); });
      if (hi.length) out.push({ sev: 3, owner: 'شؤون الموظفين + المدير المباشر', title: `${hi.length} موظف رصيد إجازاتهم السنوية 45 يوم أو أكثر`, ev: 'الأرصدة الكبيرة التزام مالي على الشركة عند نهاية الخدمة، وتسبب غياب طويل مفاجئ.', act: 'جدول إجازات متدرجة لهم بالاتفاق مع مدرائهم.', rule: 'الرصيد المتاح 45 يوم أو أكثر', list: hi }); }
  }
  // requests stuck in approval (everyone with approver rights sees his own; HR sees all in scope)
  const R = D.requests.list.filter(r => r.status === 'pending' && isOverdue(r) && (hrecHR() ? inScope(r.empId) : canAct(r)));
  if (R.length) out.push({ sev: R.length >= 10 ? 1 : 2, owner: hrecHR() ? 'المعتمدين + شؤون الموظفين' : 'أنت', title: `${R.length} طلب متجاوز مدة الاعتماد`, ev: 'تأخر الاعتماد يأخر الموظف (إجازة، سلفة، خطاب) ويضعف الثقة في النظام.', act: hrecHR() ? 'ذكّر المعتمد المتأخر، ولو التأخر يتكرر في نفس المرحلة راجع مدة الاعتماد أو أضف معتمد بديل في الإعدادات.' : 'افتح «صندوق الاعتمادات» واعتمد أو ارفض أو أرجع الطلب مع ملاحظة.', rule: 'طلب قيد الاعتماد تجاوز الموعد المحدد لمرحلته الحالية',
    list: R.slice(0, 40).map(r => [`<a href="#" data-act="open-req" data-id="${esc(r.id)}">${esc(r.ref || '')}</a>`, esc(r.typeName || ''), esc(empName(r.empId)), `منذ ${fmtD(String(r.createdAt || '').slice(0, 10))}`]) });
  // custody with leavers
  if (can('assets.manage') || hasRole('personnel') || hasRole('hrManager')) {
    const lv = D.assets.list.filter(a => a.status === 'assigned' && a.holderId && emp(a.holderId)?.status === 'terminated');
    if (lv.length) out.push({ sev: 1, owner: 'الشؤون الإدارية', title: `${lv.length} عهدة لا تزال مسجلة على موظفين منتهية خدمتهم`, ev: 'العهدة غير المستلمة خسارة مباشرة، ويصعب استرجاعها بعد صرف المستحقات.', act: 'استلم العهد أو اخصم قيمتها من المخالصة قبل صرفها، واربط إخلاء الطرف باستلام العهد.', rule: 'أصل حالته «مسلّم» وحامله منتهية خدمته', list: lv.map(a => [esc(a.name || ''), esc(a.code || ''), esc(empName(a.holderId))]) });
  }
  // ---- customs clearance ----
  if (typeof can === 'function' && can('customs.view') && typeof shipCharges === 'function') {
    const act = D.shipments.list.filter(s => !shipIsClosed(s));
    const ch = act.map(s => ({ s, x: shipCharges(s) })).filter(o => o.x.dem + o.x.det > 0).sort((a, b) => (b.x.dem + b.x.det) - (a.x.dem + a.x.det));
    if (ch.length) out.push({ sev: 1, owner: 'التخليص الجمركي', title: `${ch.length} شحنة عليها أرضيات أو غرامات تأخير الحين`, ev: `المتراكم حتى اليوم ${hrecSAR(ch.reduce((a, o) => a + o.x.dem + o.x.det, 0))}، ويزيد كل يوم.`, act: 'أولوية الإفراج والتحميل لهذه الشحنات، ورجّع الحاويات الفاضية للخط بأسرع وقت. لو السبب مستند ناقص من المورد، اطلبه بشكل عاجل وسجّل التكلفة عليه.', rule: 'تجاوزت أيام السماح في الميناء (أرضيات) أو بعد الخروج (تأخير إعادة الحاوية)', list: ch.map(o => [hrecShip(o.s), `أرضيات ${hrecSAR(o.x.dem)}`, `تأخير إعادة ${hrecSAR(o.x.det)}`, `${o.x.days} يوم`]) });
    const near = act.map(s => ({ s, ft: freeTimeLeft(s) })).filter(o => o.ft != null && o.ft >= 0 && o.ft <= 3);
    if (near.length) out.push({ sev: 2, owner: 'التخليص الجمركي', title: `${near.length} شحنة باقي لها 3 أيام أو أقل من أيام السماح`, ev: 'بعدها تبدأ الأرضيات تنحسب يومياً.', act: 'تابع مع المخلص اليوم: سداد الرسوم وإنهاء الفسح وحجز الشاحنات مسبقاً.', rule: 'أيام السماح المتبقية من 0 إلى 3', list: near.map(o => [hrecShip(o.s), `باقي ${o.ft} يوم`]) });
    const md = act.map(s => { const st = shipStage(s); const next = customsStages()[s.stageIdx + 1]; const m = next && typeof docMissing === 'function' ? docMissing(s, next.key) : []; return { s, m, next }; }).filter(o => o.m.length);
    if (md.length) out.push({ sev: 2, owner: 'التخليص الجمركي + المشتريات', title: `${md.length} شحنة ناقصها مستندات للمرحلة الجاية`, ev: 'الشحنة ما تقدر تنتقل للمرحلة التالية بدون هذه المستندات.', act: 'اطلب المستندات الناقصة من المورد أو المخلص الحين قبل وصول الشحنة للمرحلة.', rule: 'مستند مطلوب للمرحلة التالية وغير مرفوع', list: md.map(o => [hrecShip(o.s), esc(o.next.name || ''), esc(o.m.join('، '))]) });
    const sab = []; act.forEach(s => (typeof saberAlerts === 'function' ? saberAlerts(s) : []).forEach(a => sab.push([hrecShip(s), a[0] === 'bad' ? '<b style="color:#B42318">منتهية</b>' : 'قريبة', esc(a[1])])));
    if (sab.length) out.push({ sev: sab.some(x => x[1].includes('منتهية')) ? 1 : 2, owner: 'المشتريات', title: `${sab.length} شهادة مطابقة (سابر) منتهية أو قريبة الانتهاء`, ev: 'الشهادة المنتهية توقف الفسح وتسبب أرضيات.', act: 'جدد الشهادة عن طريق المورد أو جهة المطابقة قبل وصول الشحنة.', rule: 'تاريخ انتهاء شهادة سابر للصنف قبل اليوم أو خلال 30 يوم', list: sab });
    const rs = {}; D.shipments.list.forEach(s => (s.stageLog || []).forEach(l => { if (l.delayReason && (l.date || '') >= addDays(t, -180)) rs[l.delayReason] = (rs[l.delayReason] || 0) + 1; }));
    const totR = Object.values(rs).reduce((a, x) => a + x, 0); const top = Object.entries(rs).sort((a, b) => b[1] - a[1])[0];
    if (top && totR >= 4 && top[1] / totR >= 0.4) { const tips = /المستندات|سابر/.test(top[0]) ? 'اشترط على الموردين إرسال نسخ المستندات وشهادات المطابقة قبل الشحن، وضعها شرط في أمر الشراء.' : /سداد/.test(top[0]) ? 'جهّز رصيد أو اعتماد سداد مسبق للرسوم الجمركية عشان ما تنتظر الشحنة الموافقات.' : /المخلص/.test(top[0]) ? 'راجع أداء المخلص في «تقييم المخلصين»، واتفق على مدة التزام واضحة أو جرّب مخلص بديل.' : /فحص|معاينة|البيان/.test(top[0]) ? 'راجع دقة البيان الجمركي ورموز HS مع المخلص قبل التقديم لتقليل الفحص الإضافي.' : 'عالج هذا السبب أولاً لأنه الأكثر تكراراً.';
      out.push({ sev: 2, owner: 'التخليص الجمركي', title: `«${top[0]}» سبب ${Math.round(top[1] / totR * 100)}% من تأخيرات التخليص`, ev: `${top[1]} من ${totR} تأخير مسجل خلال 6 أشهر.`, act: tips, rule: 'سبب تأخير واحد يمثل 40% أو أكثر (4 تأخيرات على الأقل)' }); }
    if (typeof brokerScore === 'function') { const bs = brokerScore().filter(x => x.done >= 3 && x.avg != null); if (bs.length >= 2) { const avg = bs.reduce((a, x) => a + x.avg, 0) / bs.length; const slow = bs.filter(x => x.avg > avg * 1.3);
      if (slow.length) out.push({ sev: 3, owner: 'المشتريات', title: `${slow.length} مخلص متوسط مدة التخليص عنده أعلى بكثير من الباقين`, ev: `متوسط كل المخلصين ${fmtN(Math.round(avg))} يوم من الوصول إلى الإفراج.`, act: 'ناقشهم بالأرقام، ووزّع الشحنات الجديدة على الأسرع لين يتحسن أداؤهم.', rule: 'متوسط مدة المخلص أعلى من المتوسط العام بـ 30% أو أكثر (3 شحنات مفسوحة على الأقل)', list: slow.map(x => [esc(x.b.name || ''), `${fmtN(Math.round(x.avg))} يوم`, `${x.done} شحنة`, x.ch ? `أرضيات ${hrecSAR(x.ch)}` : '']) }); } }
  }
  return out.sort((a, b) => a.sev - b.sev);
}
const hrecVisible = () => hrecHR() || can('customs.view') || D.requests.list.some(r => canAct(r)) || can('assets.manage');
VIEWS.recs = () => {
  let L0; try { L0 = computeHrRecs(); } catch (e) { console.error(e); return pageHead('التوصيات', '') + empty('تعذّر حساب التوصيات: ' + esc(e.message)); }
  const n = s => L0.filter(x => x.sev === s).length;
  return hrecCss + pageHead('توصيات للتصحيح والتطوير', 'محسوبة تلقائياً من بيانات الموظفين والطلبات والعهد والتخليص الجمركي اللي تظهر لك. كل توصية مكتوب تحتها القاعدة اللي طلّعتها.') +
    `<div class="rc-sum"><span>🔴 عاجل: <b>${n(1)}</b></span><span>🟠 مهم: <b>${n(2)}</b></span><span>🔵 تحسين: <b>${n(3)}</b></span></div>` +
    (L0.length ? L0.map(hrecCard).join('') : empty('ما فيه توصيات حالياً: كل المؤشرات ضمن الحدود.'));
};
{ const _ni = navItems; navItems = function () { let h = _ni(); if (!hrecVisible() || (typeof portalNavOk === 'function' && !portalNavOk('recs'))) return h;
    const cur = S.view === 'recs'; const btn = `<button data-act="go" data-v="recs" ${cur ? 'aria-current="page"' : ''}>${ic('star')}<span>التوصيات</span></button>`;
    const i = h.indexOf('data-v="notifications"'); if (i < 0) return h + btn; const j = h.lastIndexOf('<button', i); return h.slice(0, j) + btn + h.slice(j); }; }
