'use strict';
/* ============ CUSTOMS CLEARANCE: incoming shipments ============ */
const DEFAULT_CUSTOMS_STAGES = [
  { key: 'ordered', name: 'أمر شراء — بانتظار الشحن', slaDays: 30 },
  { key: 'shipped', name: 'تم الشحن من المورد', slaDays: 30 },
  { key: 'docs', name: 'وصول المستندات الأصلية', slaDays: 7 },
  { key: 'arrived', name: 'الوصول إلى المنفذ', slaDays: 2 },
  { key: 'toBroker', name: 'تسليم المستندات للمخلص', slaDays: 1 },
  { key: 'declared', name: 'تقديم البيان الجمركي', slaDays: 2 },
  { key: 'inspection', name: 'الفحص والمعاينة', slaDays: 3 },
  { key: 'fees', name: 'سداد الرسوم الجمركية', slaDays: 2 },
  { key: 'released', name: 'الإفراج الجمركي', slaDays: 2 },
  { key: 'transport', name: 'النقل إلى المصنع', slaDays: 2 },
  { key: 'received', name: 'الاستلام بالمستودع', slaDays: 0 }
];
const customsStages = () => (SET().customsStages && SET().customsStages.length ? SET().customsStages : DEFAULT_CUSTOMS_STAGES);
const stageIdxByKey = k => customsStages().findIndex(s => s.key === k);
const SHIP_DOCS = [['invoice', 'الفاتورة التجارية'], ['packing', 'قائمة التعبئة'], ['bl', 'بوليصة الشحن / الشحن الجوي'], ['origin', 'شهادة المنشأ'], ['conformity', 'شهادة المطابقة (سابر)'], ['declaration', 'البيان الجمركي'], ['feesReceipt', 'إيصال سداد الرسوم'], ['release', 'إذن الإفراج / التسليم'], ['other', 'مستند آخر']];


function shipStage(s) { return customsStages()[s.stageIdx] || customsStages()[0]; }
function shipIsClosed(s) { return s.status === 'closed' || s.status === 'cancelled'; }
function stageEnteredAt(s) { const l = (s.stageLog || []).filter(x => x.idx === s.stageIdx).at(-1); return l?.date || (s.createdAt || '').slice(0, 10); }
function daysInStage(s) { return daysBetween(stageEnteredAt(s), todayISO()); }
function arrivalDate(s) { const i = stageIdxByKey('arrived'); const l = (s.stageLog || []).find(x => x.idx === i); return l?.date || null; }
function releaseDate(s) { const i = stageIdxByKey('released'); const l = (s.stageLog || []).find(x => x.idx === i); return l?.date || null; }
function freeTimeLeft(s) { const a = arrivalDate(s); if (!a || s.freeDays == null || s.freeDays === '' || releaseDate(s)) return null; return daysBetween(todayISO(), addDays(a, Number(s.freeDays))); }
function shipAlerts(s) {
  if (shipIsClosed(s)) return [];
  const out = []; const t = todayISO(); const st = shipStage(s); const arrI = stageIdxByKey('arrived');
  if (s.eta && s.stageIdx < arrI) { const d = daysBetween(t, s.eta); if (d < 0) out.push(['bad', `تجاوزت تاريخ الوصول المتوقع بـ ${-d} يوم`]); else if (d <= 3) out.push(['warn', `تصل خلال ${d} يوم`]); }
  const ft = freeTimeLeft(s); if (ft != null) { if (ft < 0) out.push(['bad', `انتهت أيام السماح منذ ${-ft} يوم — احتمال أرضيات`]); else if (ft <= 2) out.push(['warn', `باقي ${ft} يوم على نهاية أيام السماح`]); }
  if (st.slaDays && daysInStage(s) > st.slaDays) out.push(['warn', `متوقفة في «${st.name}» منذ ${daysInStage(s)} يوم (المستهدف ${st.slaDays})`]);
  const fu = (s.comms || []).filter(c => c.nextFollowUp).at(-1); if (fu && fu.nextFollowUp <= t) out.push(['info', `متابعة مستحقة مع المخلص (${fmtD(fu.nextFollowUp)})`]);
  return out;
}
const shipCostSAR = s => (s.costs || []).reduce((a, c) => a + Number(c.amount || 0), 0);
function stageBadge(s) { if (s.status === 'cancelled') return badge('cancelled', 'ملغاة'); if (s.status === 'closed') return badge('approved', 'مستلمة'); const a = shipAlerts(s); const cls = a.some(x => x[0] === 'bad') ? 'rejected' : a.some(x => x[0] === 'warn') ? 'returned' : 'pending'; return badge(cls, shipStage(s).name); }
function progressBar(s) { const n = customsStages().length - 1; const p = shipIsClosed(s) ? 100 : Math.round(s.stageIdx / n * 100); return `<div title="${p}%" style="height:6px;background:var(--surface-2);border-radius:4px;overflow:hidden;min-width:70px"><i style="display:block;height:100%;width:${p}%;background:var(--green)"></i></div>`; }

async function createShipment(v, stageName, source) {
  const at = nowISO(); const ref = await nextRef('SHP'); let idx = 0;
  if (stageName) { const i = customsStages().findIndex(s => s.name === stageName); if (i >= 0) idx = i; }
  const id = newId();
  const log = [{ idx: 0, date: todayISO(), at, byId: S.meId, note: source || 'تسجيل الشحنة' }];
  if (idx > 0) log.push({ idx, date: todayISO(), at, byId: S.meId, note: 'المرحلة عند الاستيراد' });
  await put('shipments', id, { ref, ...v, ownerId: v.ownerId || S.meId, stageIdx: idx, stageLog: log, docs: [], costs: [], comms: [], status: idx === customsStages().length - 1 ? 'closed' : 'active', createdAt: at, createdById: S.meId });
  await audit('تسجيل شحنة واردة', 'shipment', id, `${ref} — ${v.supplier}`);
  return { id, ref };
}
function customsTeam() { return D.employees.list.filter(e => e.status !== 'terminated' && canE(e, 'customs.manage')).map(e => e.id); }

VIEWS.customs = () => {
  const m = can('customs.manage');
  const t = tabs('cus', [['board', 'لوحة المتابعة'], ['list', 'كل الشحنات'], ['brokers', 'المخلصون'], ...(m ? [['stages', 'مراحل التخليص']] : [])]);
  const all = D.shipments.list; const active = all.filter(s => !shipIsClosed(s)); let body = '';
  if (t.cur === 'board') {
    const T = todayISO(); const arrI = stageIdxByKey('arrived'), relI = stageIdxByKey('released');
    const week = active.filter(s => s.stageIdx < arrI && s.eta && s.eta >= T && s.eta <= addDays(T, 7)).length;
    const inClear = active.filter(s => s.stageIdx >= arrI && s.stageIdx < relI).length;
    const demur = active.filter(s => { const f = freeTimeLeft(s); return f != null && f <= 2; }).length;
    const done = all.filter(s => arrivalDate(s) && releaseDate(s) && releaseDate(s) >= addDays(T, -180));
    const avg = done.length ? done.reduce((a, s) => a + daysBetween(arrivalDate(s), releaseDate(s)), 0) / done.length : null;
    const monthCost = all.reduce((a, s) => a + (s.costs || []).filter(c => (c.date || '').startsWith(monthISO())).reduce((x, c) => x + Number(c.amount || 0), 0), 0);
    const alerts = active.flatMap(s => shipAlerts(s).map(a => ({ s, a }))).sort((x, y) => ['bad', 'warn', 'info'].indexOf(x.a[0]) - ['bad', 'warn', 'info'].indexOf(y.a[0]));
    body = `<div class="grid g4">${kpi('شحنات مفتوحة', fmtN(active.length))}${kpi('تصل خلال 7 أيام', fmtN(week), 'لم تصل المنفذ وتاريخ وصولها المتوقع خلال أسبوع')}${kpi('قيد التخليص الآن', fmtN(inClear), 'وصلت المنفذ ولم يُفرج عنها بعد')}${kpi('خطر أرضيات', fmtN(demur), 'باقي يومان أو أقل على نهاية أيام السماح، أو انتهت', demur)}${kpi('متوسط مدة التخليص', avg == null ? '—' : fmtN(avg, 1) + ' يوم', 'من تاريخ الوصول للمنفذ إلى الإفراج، للشحنات المفرج عنها خلال 180 يومًا')}${kpi('تكاليف التخليص هذا الشهر', fmtSAR(monthCost), 'مجموع التكاليف المسجلة بتاريخ هذا الشهر')}</div>
    <div class="grid g2" style="margin-top:16px">
      <section class="card"><h2>الشحنات المفتوحة حسب المرحلة</h2>${bars(customsStages().slice(0, -1).map((st, i) => [st.name, active.filter(s => s.stageIdx === i).length]).filter(r => r[1]))}</section>
      <section class="card"><h2>تنبيهات تحتاج إجراء <small>${alerts.length}</small></h2><div class="list">${alerts.slice(0, 12).map(({ s, a }) => `<div><div class="grow"><b class="num">${esc(s.ref)}</b> <span class="small">${esc(s.supplier)}</span><div class="small" style="color:var(--${a[0] === 'bad' ? 'bad' : a[0] === 'warn' ? 'warn' : 'info'})">${esc(a[1])}</div></div><button class="btn sm ghost" data-act="open-ship" data-id="${s.id}">فتح</button></div>`).join('') || empty('لا توجد تنبيهات')}</div></section>
    </div>`;
  } else if (t.cur === 'list') {
    const f = S.f.shipSt || 'active'; let rows = all;
    if (f === 'active') rows = active; else if (f !== 'all') rows = all.filter(s => s.status === f);
    if (S.f.shipBroker) rows = rows.filter(s => s.brokerId === S.f.shipBroker);
    body = dataTable('ships', [
      { k: 'ref', l: 'رقم الشحنة', v: s => `<b class="num">${esc(s.ref)}</b>` },
      { k: 'supplier', l: 'المورد', v: s => `${esc(s.supplier)}<div class="small muted">${esc(s.origin || '')}</div>`, txt: s => [s.supplier, s.origin, s.goods, s.blNo, s.poNo, s.ref].join(' ') },
      { k: 'goods', l: 'البضاعة' },
      { k: 'mode', l: 'الشحن', v: s => `${esc(s.mode || '')}<div class="small muted">${esc(s.port || '')}</div>` },
      { k: 'blNo', l: 'رقم البوليصة', v: s => `<span class="num">${esc(s.blNo || '—')}</span>` },
      { k: 'broker', l: 'المخلص', s: s => D.brokers.map[s.brokerId]?.name || '', v: s => esc(D.brokers.map[s.brokerId]?.name || 'غير محدد') },
      { k: 'eta', l: 'الوصول المتوقع', v: s => `<span class="num">${fmtD(s.eta)}</span>` },
      { k: 'stage', l: 'المرحلة', s: s => s.stageIdx, v: s => `${stageBadge(s)}<div style="margin-top:4px">${progressBar(s)}</div>` },
      ...cfCols('shipment'), { k: 'days', l: 'أيام في المرحلة', s: s => shipIsClosed(s) ? -1 : daysInStage(s), v: s => shipIsClosed(s) ? '—' : `<span class="num">${daysInStage(s)}</span>` }
    ], rows.sort(by('createdAt', -1)), { rowAct: 'open-ship', tools: `<select data-fv="shipSt" aria-label="الحالة"><option value="active">المفتوحة</option><option value="closed" ${f === 'closed' ? 'selected' : ''}>المستلمة</option><option value="cancelled" ${f === 'cancelled' ? 'selected' : ''}>الملغاة</option><option value="all" ${f === 'all' ? 'selected' : ''}>الكل</option></select><select data-fv="shipBroker" aria-label="المخلص"><option value="">كل المخلصين</option>${D.brokers.list.map(b => `<option value="${b.id}" ${S.f.shipBroker === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>${can('export.data') || m ? `<button class="btn sm" data-act="export-ships">${ic('down')} تصدير Excel</button>` : ''}`, empty: 'لا توجد شحنات' });
  } else if (t.cur === 'brokers') {
    body = dataTable('brokers', [{ k: 'name', l: 'المخلص / المكتب' }, { k: 'license', l: 'رقم الترخيص', v: b => `<span class="num">${esc(b.license || '—')}</span>` }, { k: 'contact', l: 'المسؤول' }, { k: 'phone', l: 'الجوال', v: b => `<span class="num">${esc(b.phone || '—')}</span>` }, { k: 'email', l: 'البريد' }, { k: 'ports', l: 'المنافذ' }, ...cfCols('broker'), { k: 'open', l: 'شحنات مفتوحة', s: b => active.filter(s => s.brokerId === b.id).length, v: b => `<span class="num">${active.filter(s => s.brokerId === b.id).length}</span>` }, { k: 'avg', l: 'متوسط التخليص (يوم)', nosort: true, v: b => { const d = all.filter(s => s.brokerId === b.id && arrivalDate(s) && releaseDate(s)); return d.length ? `<span class="num">${fmtN(d.reduce((a, s) => a + daysBetween(arrivalDate(s), releaseDate(s)), 0) / d.length, 1)}</span> <span class="small muted">(${d.length})</span>` : '—'; } }, ...(m ? [{ k: 'x', l: '', nosort: true, v: b => `<button class="btn sm ghost" data-act="broker-edit" data-id="${b.id}">تعديل</button>` }] : [])], D.brokers.list.sort(by('name')), { tools: m ? `<button class="btn sm pri" data-act="broker-edit">${ic('plus')} مخلص جديد</button>` : '' });
  } else if (t.cur === 'stages') {
    body = `<div class="note warn" style="margin-bottom:10px">المراحل والمدد المستهدفة قيم مبدئية تحتاج مراجعة مع المخلص وواقع منافذكم. يمكن إعادة تسميتها أو إضافة مراحل، لكن احتفظ بالمرحلة الأخيرة كمرحلة الاستلام النهائي. المراحل ذات الرموز arrived و released تُستخدم في حساب أيام السماح ومدة التخليص.</div>
    <form data-form="cstages" class="card"><div id="cst-rows">${customsStages().map((s, i) => `<div class="ed-row" data-row="cst"><div><label class="small muted">الرمز</label><input data-k="key" value="${esc(s.key)}"></div><div style="grid-column:span 2"><label class="small muted">اسم المرحلة</label><input data-k="name" value="${esc(s.name)}"></div><div><label class="small muted">المدة المستهدفة (أيام)</label><input data-k="slaDays" type="number" min="0" value="${esc(s.slaDays)}"></div><button type="button" class="btn sm ghost" data-act="row-del" aria-label="حذف">${ic('x')}</button></div>`).join('')}</div>
    <div class="row"><button type="button" class="btn sm" data-act="cst-add">${ic('plus')} مرحلة</button><button class="btn pri">حفظ المراحل</button></div></form>`;
  }
  return pageHead('التخليص الجمركي', 'متابعة الشحنات الواردة من الخارج مع المخلص ومرورها بمراحل التخليص حتى الاستلام', m ? `<button class="btn" data-act="import" data-k="shipments">${ic('up')} استيراد Excel</button><button class="btn pri" data-act="ship-edit">${ic('plus')} شحنة جديدة</button>` : '') + t.html + body;
};

function openShipment(id) {
  const s = D.shipments.map[id]; if (!s) return toast('الشحنة غير موجودة', true);
  if (!can('customs.view')) return toast('لا تملك صلاحية عرض الشحنات', true);
  const m = can('customs.manage'); const stages = customsStages(); const b = D.brokers.map[s.brokerId];
  const steps = stages.map((st, i) => { const l = (s.stageLog || []).filter(x => x.idx === i).at(-1); const cls = shipIsClosed(s) && s.status === 'closed' || i < s.stageIdx ? 'done' : i === s.stageIdx && !shipIsClosed(s) ? 'active' : ''; return `<div class="tl ${cls}"><b>${esc(st.name)}</b>${l ? `<div class="small"><span class="num">${fmtD(l.date)}</span> — ${esc(empName(l.byId))}${l.note ? ' — ' + esc(l.note) : ''}</div>` : ''}${i === s.stageIdx && !shipIsClosed(s) ? `<div class="small muted">منذ ${daysInStage(s)} يوم${st.slaDays ? ' · المستهدف ' + st.slaDays : ''}</div>` : ''}</div>`; }).join('');
  const docs = SHIP_DOCS.map(([k, l]) => { const f = (s.docs || []).filter(d => d.type === k); return `<div><div class="grow"><b class="small">${esc(l)}</b>${f.map(d => `<div class="small">${fileLink(d)} <span class="muted num">${fmtD(d.at)}</span></div>`).join('')}</div>${f.length ? badge('approved', 'مرفق') : k === 'other' ? '' : badge('cancelled', 'غير مرفق')}</div>`; }).join('');
  const costs = (s.costs || []);
  const comms = (s.comms || []).slice().reverse();
  const al = shipAlerts(s);
  openModal(`${s.ref} — ${s.supplier}`, `
    <div class="row">${stageBadge(s)} ${b ? `<span class="tag">المخلص: ${esc(b.name)}${b.phone ? ' · ' + esc(b.phone) : ''}</span>` : '<span class="tag">لم يُحدد مخلص</span>'}<span class="tag">المسؤول: ${esc(empName(s.ownerId))}</span></div>
    ${al.map(a => `<div class="note ${a[0] === 'bad' ? 'bad' : a[0] === 'warn' ? 'warn' : ''}">${esc(a[1])}</div>`).join('')}
    <div class="grid g2">
      <div><h3 class="small muted" style="margin-bottom:6px">بيانات الشحنة</h3><dl class="dl">
        <dt>المورد</dt><dd>${esc(s.supplier)}</dd><dt>بلد المنشأ</dt><dd>${esc(s.origin || '—')}</dd><dt>أمر الشراء</dt><dd class="num">${esc(s.poNo || '—')}</dd><dt>البضاعة</dt><dd>${esc(s.goods)}</dd><dt>البند الجمركي (HS)</dt><dd class="num">${esc(s.hsCode || '—')}</dd>
        <dt>طريقة الشحن</dt><dd>${esc(s.mode || '—')} · ${esc(s.incoterm || '')}</dd><dt>منفذ الوصول</dt><dd>${esc(s.port || '—')}</dd><dt>رقم البوليصة</dt><dd class="num">${esc(s.blNo || '—')}</dd><dt>الحاويات</dt><dd><span class="num">${s.containers ?? '—'}</span> ${s.containerNos ? `<div class="small num">${esc(s.containerNos)}</div>` : ''}</dd>
        <dt>قيمة الفاتورة</dt><dd class="num">${s.invoiceValue != null ? fmtN(s.invoiceValue, 2) + ' ' + esc(s.currency || '') : '—'}</dd><dt>الشحن المتوقع</dt><dd class="num">${fmtD(s.etd)}</dd><dt>الوصول المتوقع</dt><dd class="num">${fmtD(s.eta)}</dd><dt>الوصول الفعلي</dt><dd class="num">${fmtD(arrivalDate(s))}</dd><dt>أيام السماح</dt><dd class="num">${s.freeDays ?? 'غير مسجلة'}</dd><dt>الإفراج</dt><dd class="num">${fmtD(releaseDate(s))}</dd>
        ${s.notes ? `<dt>ملاحظات</dt><dd>${esc(s.notes)}</dd>` : ''}${cfView('shipment', s)}</dl></div>
      <div><h3 class="small muted" style="margin-bottom:10px">مراحل التخليص</h3><div class="timeline">${steps}</div></div>
    </div>
    ${m && !shipIsClosed(s) ? `<form class="form card" data-form="ship-stage" data-id="${s.id}" style="padding:12px"><div class="full small muted">تحديث المرحلة</div>${fld('stageIdx', 'المرحلة الجديدة', { type: 'select', blank: false, value: String(Math.min(s.stageIdx + 1, stages.length - 1)), options: stages.map((st, i) => [String(i), (i <= s.stageIdx ? '↩ ' : '') + st.name]) })}${fld('date', 'التاريخ الفعلي', { type: 'date', value: todayISO(), required: true })}${fld('note', 'ملاحظة (رقم البيان، نتيجة الفحص…)', {})}<div class="fld" style="justify-content:flex-end"><button class="btn pri sm">حفظ المرحلة</button></div></form>` : ''}
    <section><h3 style="font-size:15px;margin-bottom:6px">المستندات</h3><div class="list">${docs}</div>${m ? `<form class="form" data-form="ship-doc" data-id="${s.id}" style="margin-top:8px">${fld('type', 'نوع المستند', { type: 'select', blank: false, options: SHIP_DOCS })}${fld('file', 'الملف', { type: 'file', multiple: true })}<div class="fld" style="justify-content:flex-end"><button class="btn sm">رفع</button></div></form>` : ''}</section>
    <section><h3 style="font-size:15px;margin-bottom:6px">التكاليف <small class="muted">الإجمالي ${fmtSAR(shipCostSAR(s))}</small></h3>${costs.length ? `<div class="tablewrap"><table><thead><tr><th>البند</th><th>المبلغ (ر.س)</th><th>التاريخ</th><th>ملاحظة</th><th>سجّله</th></tr></thead><tbody>${costs.map(c => `<tr><td>${esc(c.type)}</td><td class="num">${fmtN(c.amount, 2)}</td><td class="num">${fmtD(c.date)}</td><td>${esc(c.note || '')}</td><td>${esc(empName(c.byId))}</td></tr>`).join('')}</tbody></table></div>` : empty('لم تُسجل تكاليف')}${m ? `<form class="form" data-form="ship-cost" data-id="${s.id}" style="margin-top:8px">${fld('type', 'البند', { type: 'select', blank: false, options: LIST('shipCostTypes') })}${fld('amount', 'المبلغ (ر.س)', { type: 'number', min: 0, step: '0.01', required: true })}${fld('date', 'التاريخ', { type: 'date', value: todayISO(), required: true })}${fld('note', 'ملاحظة / رقم الفاتورة')}<div class="fld" style="justify-content:flex-end"><button class="btn sm">إضافة</button></div></form>` : ''}</section>
    <section><h3 style="font-size:15px;margin-bottom:6px">سجل المتابعة مع المخلص</h3>${m ? `<form class="form" data-form="ship-comm" data-id="${s.id}" style="margin-bottom:8px">${fld('channel', 'الوسيلة', { type: 'select', blank: false, options: LIST('commChannels') })}${fld('summary', 'ملخص التواصل', { required: true })}${fld('nextFollowUp', 'موعد المتابعة القادمة', { type: 'date' })}<div class="fld" style="justify-content:flex-end"><button class="btn sm">تسجيل</button></div></form>` : ''}<div class="list">${comms.map(c => `<div><div class="grow"><b class="small">${esc(c.channel)}</b> — ${esc(c.summary)}<div class="small muted"><span class="num">${fmtDT(c.at)}</span> · ${esc(empName(c.byId))}${c.nextFollowUp ? ' · المتابعة القادمة ' + fmtD(c.nextFollowUp) : ''}</div></div></div>`).join('') || empty('لا يوجد تواصل مسجل')}</div></section>`,
    `${m ? `<button class="btn" data-act="ship-edit" data-id="${s.id}">تعديل البيانات</button>${!shipIsClosed(s) ? `<button class="btn danger" data-act="ship-cancel" data-id="${s.id}">إلغاء الشحنة</button>` : ''}` : ''}<button class="btn" data-act="close-modal">إغلاق</button>`, true);
}
async function saveShip(id, upd, action, detail) {
  const cur = D.shipments.map[id]; await put('shipments', id, { ...strip(cur), ...upd, updatedAt: nowISO() });
  if (action) await audit(action, 'shipment', id, `${cur.ref} — ${detail || ''}`);
}

ACT['open-ship'] = el => openShipment(el.dataset.id);
ACT['ship-edit'] = el => {
  const s = el.dataset.id ? D.shipments.map[el.dataset.id] : { mode: 'بحري', currency: 'USD' };
  openModal(s.id ? 'تعديل ' + s.ref : 'شحنة واردة جديدة', `<form class="form" id="shf2" data-form="ship" ${s.id ? `data-id="${s.id}"` : ''}>
    ${fld('supplier', 'المورد', { value: s.supplier, required: true })}${fld('origin', 'بلد المنشأ', { value: s.origin })}${fld('poNo', 'رقم أمر الشراء', { value: s.poNo })}
    ${fld('goods', 'وصف البضاعة', { value: s.goods, required: true, full: true })}${fld('hsCode', 'البند الجمركي (HS Code)', { value: s.hsCode })}
    ${fld('mode', 'طريقة الشحن', { type: 'select', blank: false, options: LIST('shipModes'), value: s.mode })}${fld('incoterm', 'شرط التسليم (Incoterm)', { type: 'select', options: ['EXW', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP', 'أخرى'], value: s.incoterm })}${fld('port', 'منفذ الوصول', { value: s.port, ph: 'ميناء جدة الإسلامي' })}
    ${fld('blNo', 'رقم البوليصة', { value: s.blNo })}${fld('containers', 'عدد الحاويات', { type: 'number', min: 0, value: s.containers })}${fld('containerNos', 'أرقام الحاويات', { value: s.containerNos })}
    ${fld('invoiceValue', 'قيمة الفاتورة', { type: 'number', min: 0, step: '0.01', value: s.invoiceValue })}${fld('currency', 'العملة', { type: 'select', blank: false, options: LIST('currencies'), value: s.currency })}
    ${fld('etd', 'تاريخ الشحن المتوقع', { type: 'date', value: s.etd })}${fld('eta', 'تاريخ الوصول المتوقع', { type: 'date', value: s.eta })}${fld('freeDays', 'أيام السماح للحاويات', { type: 'number', min: 0, value: s.freeDays, hint: 'من الخط الملاحي — تُحسب من تاريخ الوصول الفعلي' })}
    ${fld('brokerId', 'المخلص', { type: 'select', options: D.brokers.list.map(b => [b.id, b.name]), value: s.brokerId })}${fld('ownerId', 'المسؤول عن المتابعة', { type: 'select', blank: false, options: customsTeam().map(i => [i, empName(i)]), value: s.ownerId || S.meId })}
    ${fld('notes', 'ملاحظات', { type: 'textarea', value: s.notes, full: true })}${cfForm('shipment', s)}</form>`, `<button class="btn pri" form="shf2">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
};
FORM.ship = async f => {
  const v = readForm(f); const id = f.dataset.id;
  ['containers', 'invoiceValue', 'freeDays'].forEach(k => v[k] = v[k] === '' ? null : Number(v[k]));
  if (v.etd && v.eta && v.eta < v.etd) return toast('تاريخ الوصول قبل تاريخ الشحن', true);
  if (v.blNo && D.shipments.list.some(s => s.blNo === v.blNo && s.id !== id)) return toast('رقم البوليصة مسجل لشحنة أخرى', true);
  if (id) { await saveShip(id, v, 'تعديل بيانات شحنة', v.supplier); closeModal(); openShipment(id); }
  else { const r = await createShipment(v); closeModal(); toast('سُجلت الشحنة ' + r.ref); if (v.ownerId && v.ownerId !== S.meId) await notify([v.ownerId], 'أُسندت إليك متابعة شحنة', `${r.ref} — ${v.supplier}`, { view: 'customs' }); }
};
FORM['ship-stage'] = async f => {
  const s = D.shipments.map[f.dataset.id]; const v = readForm(f); const idx = Number(v.stageIdx); const stages = customsStages();
  if (v.date > todayISO()) return toast('التاريخ الفعلي لا يكون في المستقبل', true);
  if (idx === s.stageIdx) return toast('الشحنة في هذه المرحلة بالفعل', true);
  const log = [...(s.stageLog || []), { idx, date: v.date, at: nowISO(), byId: S.meId, note: (idx < s.stageIdx ? 'رجوع: ' : '') + (v.note || '') }];
  const closed = idx === stages.length - 1;
  await saveShip(s.id, { stageIdx: idx, stageLog: log, status: closed ? 'closed' : 'active' }, 'تحديث مرحلة شحنة', `${stages[idx].name}${v.note ? ' — ' + v.note : ''}`);
  await notify([s.ownerId, ...customsTeam()].filter(x => x !== S.meId), closed ? 'تم استلام شحنة' : 'تحديث مرحلة شحنة', `${s.ref} — ${s.supplier}: ${stages[idx].name}`, { view: 'customs' });
  toast('حُدّثت المرحلة'); openShipment(s.id);
};
FORM['ship-doc'] = async f => {
  const s = D.shipments.map[f.dataset.id]; const v = readForm(f); const files = await uploadFiles(f.elements.file); if (!files.length) return toast('اختر ملفًا', true);
  await saveShip(s.id, { docs: [...(s.docs || []), ...files.map(x => ({ ...x, type: v.type }))] }, 'رفع مستند شحنة', SHIP_DOCS.find(d => d[0] === v.type)?.[1]); toast('رُفع المستند'); openShipment(s.id);
};
FORM['ship-cost'] = async f => {
  const s = D.shipments.map[f.dataset.id]; const v = readForm(f); const amount = Number(v.amount); if (!(amount >= 0)) return toast('مبلغ غير صحيح', true);
  await saveShip(s.id, { costs: [...(s.costs || []), { type: v.type, amount, date: v.date, note: v.note, byId: S.meId, at: nowISO() }] }, 'تسجيل تكلفة شحنة', `${v.type}: ${amount}`); toast('سُجلت التكلفة'); openShipment(s.id);
};
FORM['ship-comm'] = async f => {
  const s = D.shipments.map[f.dataset.id]; const v = readForm(f);
  await saveShip(s.id, { comms: [...(s.comms || []), { channel: v.channel, summary: v.summary, nextFollowUp: v.nextFollowUp || null, byId: S.meId, at: nowISO() }] }, 'تسجيل متابعة مع المخلص', v.summary); toast('سُجلت المتابعة'); openShipment(s.id);
};
ACT['ship-cancel'] = el => confirmBox('إلغاء هذه الشحنة؟ تبقى في السجل بحالة «ملغاة».', async () => { const s = D.shipments.map[el.dataset.id]; await saveShip(s.id, { status: 'cancelled', cancelledAt: nowISO() }, 'إلغاء شحنة', s.supplier); toast('أُلغيت الشحنة'); }, 'إلغاء الشحنة');
ACT['broker-edit'] = el => {
  const b = el.dataset.id ? D.brokers.map[el.dataset.id] : {};
  openModal(b.id ? 'تعديل مخلص' : 'مخلص جمركي جديد', `<form class="form" id="brf" data-form="broker" ${b.id ? `data-id="${b.id}"` : ''}>${fld('name', 'اسم المخلص / المكتب', { value: b.name, required: true })}${fld('license', 'رقم الترخيص', { value: b.license })}${fld('contact', 'الشخص المسؤول', { value: b.contact })}${fld('phone', 'الجوال', { type: 'tel', value: b.phone })}${fld('email', 'البريد الإلكتروني', { type: 'email', value: b.email })}${fld('ports', 'المنافذ التي يغطيها', { value: b.ports })}${fld('notes', 'ملاحظات واتفاقية الأتعاب', { type: 'textarea', value: b.notes, full: true })}${cfForm('broker', b)}</form>`, `<button class="btn pri" form="brf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`);
};
FORM.broker = async f => { const v = readForm(f); const id = f.dataset.id || newId(); if (D.brokers.list.some(b => b.name === v.name && b.id !== id)) return toast('يوجد مخلص بنفس الاسم', true); await put('brokers', id, { ...(D.brokers.map[id] ? strip(D.brokers.map[id]) : {}), ...v }); await audit('حفظ مخلص جمركي', 'broker', id, v.name); closeModal(); toast('تم الحفظ'); };
ACT['cst-add'] = () => $('#cst-rows').insertAdjacentHTML('beforeend', `<div class="ed-row" data-row="cst"><div><label class="small muted">الرمز</label><input data-k="key" value="s${Date.now().toString(36)}"></div><div style="grid-column:span 2"><label class="small muted">اسم المرحلة</label><input data-k="name"></div><div><label class="small muted">المدة المستهدفة (أيام)</label><input data-k="slaDays" type="number" min="0" value="2"></div><button type="button" class="btn sm ghost" data-act="row-del" aria-label="حذف">${ic('x')}</button></div>`);
FORM.cstages = async f => {
  const rows = $$('[data-row="cst"]', f).map(r => { const o = {}; $$('[data-k]', r).forEach(i => o[i.dataset.k] = i.value.trim()); return { key: o.key, name: o.name, slaDays: Number(o.slaDays) || 0 }; }).filter(r => r.name && r.key);
  if (rows.length < 2) return toast('يلزم مرحلتان على الأقل', true);
  if (new Set(rows.map(r => r.key)).size !== rows.length) return toast('رموز المراحل يجب أن تكون فريدة', true);
  const maxIdx = Math.max(-1, ...D.shipments.list.filter(s => !shipIsClosed(s)).map(s => s.stageIdx));
  if (maxIdx >= rows.length) return toast('توجد شحنات مفتوحة في مراحل ستُحذف. انقلها أولًا', true);
  await patch('settings', 'main', { customsStages: rows }); await audit('تعديل مراحل التخليص', 'settings', 'customsStages', rows.map(r => r.name).join(' ← ')); toast('حُفظت المراحل');
};
ACT['export-ships'] = () => exportRows(`shipments-${todayISO()}`, [['رقم الشحنة', 'المورد', 'بلد المنشأ', 'أمر الشراء', 'البضاعة', 'طريقة الشحن', 'المنفذ', 'رقم البوليصة', 'الحاويات', 'قيمة الفاتورة', 'العملة', 'الشحن المتوقع', 'الوصول المتوقع', 'الوصول الفعلي', 'الإفراج', 'المخلص', 'المرحلة', 'أيام في المرحلة', 'إجمالي التكاليف (ر.س)', 'الحالة'], ...D.shipments.list.map(s => [s.ref, s.supplier, s.origin, s.poNo, s.goods, s.mode, s.port, s.blNo, s.containers, s.invoiceValue, s.currency, s.etd, s.eta, arrivalDate(s), releaseDate(s), D.brokers.map[s.brokerId]?.name || '', shipStage(s).name, shipIsClosed(s) ? '' : daysInStage(s), shipCostSAR(s), s.status === 'closed' ? 'مستلمة' : s.status === 'cancelled' ? 'ملغاة' : 'مفتوحة'])], 'الشحنات');
/* customs alerts in the notification center for the customs team */
const _hrAlerts = computedAlerts;
computedAlerts = function () {
  const out = _hrAlerts();
  if (!can('customs.manage')) return out;
  D.shipments.list.forEach(s => shipAlerts(s).filter(a => a[0] !== 'info').forEach(a => out.push({ title: 'شحنة ' + s.ref, body: `${s.supplier} — ${a[1]}`, link: { view: 'customs' }, bad: a[0] === 'bad' })));
  return out;
};
