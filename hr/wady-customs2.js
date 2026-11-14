'use strict';
/* ===== Customs clearance — containers & demurrage, required documents, compliance (SABER / HS duty), landed cost, delay reasons, broker scorecard ===== */
const CTR_ST = ['بالميناء', 'مفرج عنها', 'محمّلة على الشاحنة', 'وصلت المصنع', 'أُعيدت فارغة'];
const DELAY_REASONS = ['تأخر المستندات الأصلية', 'نقص شهادة مطابقة (سابر)', 'فحص أو معاينة إضافية', 'تأخر سداد الرسوم', 'ازدحام الميناء أو الخط الملاحي', 'تأخر المخلص', 'ملاحظات على البيان الجمركي', 'أخرى'];
/* documents that must be attached before the shipment can move into a stage (by stage key) */
const DOC_REQ = { declared: ['invoice', 'packing', 'bl', 'origin'], released: ['invoice', 'packing', 'bl', 'origin', 'declaration', 'feesReceipt'], transport: ['release'] };
/* shipping-line tracking pages: {no} = container number. Only Maersk is prefilled; the rest are added in «مراحل التخليص» */
const LINE_PREFIX = { MAEU: 'Maersk', MSKU: 'Maersk', MRKU: 'Maersk', MRSU: 'Maersk', MSCU: 'MSC', MEDU: 'MSC', CMAU: 'CMA CGM', CGMU: 'CMA CGM', HLCU: 'Hapag-Lloyd', HLXU: 'Hapag-Lloyd', COSU: 'COSCO', CBHU: 'COSCO', ONEU: 'ONE', EGHU: 'Evergreen', EISU: 'Evergreen', ZIMU: 'ZIM', OOLU: 'OOCL', YMLU: 'Yang Ming' };
const trackTpl = () => ({ Maersk: 'https://www.maersk.com/tracking/{no}', ...(SET().trackUrls || {}) });
const ctrLine = (no, s) => s.line || LINE_PREFIX[String(no || '').toUpperCase().slice(0, 4)] || '';
const ctrUrl = (no, s) => { const t = trackTpl()[ctrLine(no, s)]; return t ? t.replace('{no}', encodeURIComponent(String(no).trim())) : ''; };
const nz = v => v === '' || v == null ? null : Number(v);
const fx = s => Number(s.fxRate) || (s.currency === 'SAR' || s.currency === 'ر.س' ? 1 : null);

function ctrList(s) {
  if (s.ctrs && s.ctrs.length) return s.ctrs;
  return String(s.containerNos || '').split(/[\s,،;]+/).map(x => x.trim()).filter(Boolean).map(no => ({ no, status: 'بالميناء' }));
}
/* demurrage: port storage after the free days counted from arrival until gate-out; detention: after gate-out until the empty box is returned */
function ctrCharges(s, c) {
  const arr = arrivalDate(s); const T = todayISO(); if (!arr) return { dem: 0, det: 0, demD: 0, detD: 0 };
  const out = c.outGate || null; const fd = Number(s.freeDays) || 0, dfd = Number(s.detFreeDays) || 0;
  const demD = Math.max(0, daysBetween(addDays(arr, fd), out || T)); const detD = out ? Math.max(0, daysBetween(addDays(out, dfd), c.returned || T)) : 0;
  return { demD, detD, dem: demD * (Number(s.demRate) || 0), det: detD * (Number(s.detRate) || 0) };
}
function shipCharges(s) { return ctrList(s).reduce((a, c) => { const x = ctrCharges(s, c); a.dem += x.dem; a.det += x.det; a.days += x.demD + x.detD; return a; }, { dem: 0, det: 0, days: 0 }); }
function docMissing(s, key) { const need = DOC_REQ[key] || []; return need.filter(t => !(s.docs || []).some(d => d.type === t)); }
function docsDone(s) { const need = [...new Set(Object.values(DOC_REQ).flat())]; const has = need.filter(t => (s.docs || []).some(d => d.type === t)); return { n: has.length, of: need.length }; }
const docName = k => SHIP_DOCS.find(d => d[0] === k)?.[1] || k;
function itemsOf(s) { return s.items || []; }
function landed(s) {
  const r = fx(s); const inv = Number(s.invoiceValue) || 0; const costs = shipCostSAR(s); const base = r ? inv * r : null;
  const items = itemsOf(s); const tv = items.reduce((a, i) => a + (Number(i.value) || 0), 0);
  const per = items.map(i => { const share = tv > 0 ? (Number(i.value) || 0) / tv : 0; const tot = base == null ? null : (Number(i.value) || 0) * r + costs * share; return { ...i, share, tot, uc: tot != null && Number(i.qty) > 0 ? tot / Number(i.qty) : null }; });
  const duty = r ? items.reduce((a, i) => a + (Number(i.value) || 0) * r * (Number(i.dutyPct) || 0) / 100, 0) : null;
  return { r, base, costs, total: base == null ? null : base + costs, per, duty, vat: base == null ? null : (base + (duty || 0)) * 0.15 };
}
function saberAlerts(s) { const T = todayISO(); return itemsOf(s).filter(i => i.saberExp).map(i => { const d = daysBetween(T, i.saberExp); return d < 0 ? ['bad', `شهادة سابر للصنف «${i.desc || i.code}» منتهية`] : d <= 30 ? ['warn', `شهادة سابر للصنف «${i.desc || i.code}» تنتهي خلال ${d} يوم`] : null; }).filter(Boolean); }

/* alerts: add demurrage running, missing documents for the next stage, SABER expiry */
{
  const _a = shipAlerts;
  shipAlerts = function (s) {
    const out = _a(s); if (shipIsClosed(s)) return out;
    const ch = shipCharges(s); if (ch.dem + ch.det > 0) out.push(['bad', `غرامات أرضيات/تأخير متوقعة ${fmtSAR(ch.dem + ch.det)} حتى اليوم`]);
    else if (ch.days > 0) out.push(['bad', `حاويات تجاوزت أيام السماح (${ch.days} يوم حاوية) — سجّل سعر الغرامة اليومي لحساب التكلفة`]);
    const nxt = customsStages()[s.stageIdx + 1]; if (nxt && DOC_REQ[nxt.key]) { const m = docMissing(s, nxt.key); if (m.length) out.push(['warn', `ناقص قبل «${nxt.name}»: ${m.map(docName).join('، ')}`]); }
    return out.concat(saberAlerts(s));
  };
}

/* extra sections inside the shipment window */
{
  const _open = openShipment;
  openShipment = function (id) {
    _open(id); const s = D.shipments.map[id]; const mb = $('#modal-root .mb'); if (!s || !mb) return;
    const m = can('customs.manage'); const C = ctrList(s); const L = landed(s); const dd = docsDone(s); const ch = shipCharges(s);
    const ctrRows = C.map((c, i) => { const x = ctrCharges(s, c); const u = ctrUrl(c.no, s); return `<tr><td class="num"><b>${esc(c.no)}</b>${ctrLine(c.no, s) ? `<div class="small muted">${esc(ctrLine(c.no, s))}</div>` : ''}</td><td>${esc(c.size || '—')}</td><td class="num">${esc(c.seal || '—')}</td><td>${esc(c.status || 'بالميناء')}</td><td class="num">${fmtD(c.outGate)}</td><td class="num">${fmtD(c.returned)}</td>
      <td class="num">${x.demD ? `<b style="color:var(--bad)">${x.demD}</b>` : '0'} / ${x.detD ? `<b style="color:var(--bad)">${x.detD}</b>` : '0'}</td><td class="num">${x.dem + x.det ? fmtN(x.dem + x.det) : '—'}</td>
      <td>${u ? `<a class="btn sm ghost" href="${esc(u)}" target="_blank" rel="noopener">تتبع</a>` : ''}${m ? ` <button class="btn sm ghost" data-act="ctr-edit" data-id="${s.id}" data-i="${i}">تحديث</button>` : ''}</td></tr>`; }).join('');
    const itemRows = L.per.map((i, k) => `<tr><td class="num">${esc(i.code || '')}</td><td>${esc(i.desc || '')}</td><td class="num">${esc(i.hs || s.hsCode || '—')}</td><td class="num">${fmtN(Number(i.qty) || 0)} ${esc(i.unit || '')}</td><td class="num">${fmtN(Number(i.value) || 0, 2)}</td><td class="num">${i.dutyPct != null && i.dutyPct !== '' ? i.dutyPct + '%' : '—'}</td>
      <td>${i.saber ? `<span class="num">${esc(i.saber)}</span>${i.saberExp ? `<div class="small ${daysBetween(todayISO(), i.saberExp) < 30 ? '' : 'muted'}" ${daysBetween(todayISO(), i.saberExp) < 30 ? 'style="color:var(--bad)"' : ''}>حتى ${fmtD(i.saberExp)}</div>` : ''}` : '<span class="small" style="color:var(--warn)">غير مسجلة</span>'}</td>
      <td class="num">${i.uc != null ? fmtN(i.uc, 2) : '—'}</td><td class="num">${i.recvQty != null && i.recvQty !== '' ? fmtN(Number(i.recvQty)) : '—'}</td><td>${m ? `<button class="btn sm ghost" data-act="item-edit" data-id="${s.id}" data-i="${k}">تعديل</button>` : ''}</td></tr>`).join('');
    const html = `
    <section><h3 style="font-size:15px;margin-bottom:6px">الحاويات وأيام السماح <small class="muted">${C.length} حاوية · سماح الميناء ${s.freeDays ?? '—'} يوم · سماح الإرجاع ${s.detFreeDays ?? '—'} يوم${ch.dem + ch.det ? ` · غرامات متوقعة <b style="color:var(--bad)">${fmtSAR(ch.dem + ch.det)}</b>` : ''}</small></h3>
      ${C.length ? `<div class="tablewrap"><table><thead><tr><th>رقم الحاوية</th><th>المقاس</th><th>الختم</th><th>الحالة</th><th>خروج الميناء</th><th>إرجاع الفارغ</th><th>أيام أرضيات / تأخير</th><th>الغرامة (ر.س)</th><th></th></tr></thead><tbody>${ctrRows}</tbody></table></div>` : empty('ما فيه أرقام حاويات — أضفها من «تعديل البيانات» أو هنا')}
      ${m ? `<button class="btn sm" data-act="ctr-edit" data-id="${s.id}" data-i="-1">+ حاوية</button>` : ''}
      ${!s.demRate && C.length ? `<div class="small muted" style="margin-top:4px">سجّل سعر الأرضيات والتأخير اليومي من «تعديل البيانات» عشان تنحسب الغرامة بالريال.</div>` : ''}</section>
    <section><h3 style="font-size:15px;margin-bottom:6px">الأصناف والامتثال والتكلفة الواصلة <small class="muted">المستندات الأساسية ${dd.n}/${dd.of}</small></h3>
      ${L.per.length ? `<div class="tablewrap"><table><thead><tr><th>الكود</th><th>الصنف</th><th>البند الجمركي</th><th>الكمية</th><th>القيمة (${esc(s.currency || '')})</th><th>الرسوم الجمركية</th><th>شهادة سابر</th><th>التكلفة الواصلة للوحدة (ر.س)</th><th>المستلم</th><th></th></tr></thead><tbody>${itemRows}</tbody></table></div>` : empty('أضف أصناف الشحنة عشان تنحسب التكلفة الواصلة لكل صنف وتتابع شهادات سابر')}
      ${m ? `<button class="btn sm" data-act="item-edit" data-id="${s.id}" data-i="-1">+ صنف</button>` : ''}
      <div class="grid g4" style="margin-top:8px">${kpi('قيمة البضاعة بالريال', L.base == null ? '—' : fmtSAR(L.base), L.r ? `سعر الصرف ${L.r}` : 'سجّل سعر الصرف في «تعديل البيانات»')}${kpi('تكاليف الشحن والتخليص', fmtSAR(L.costs))}${kpi('التكلفة الواصلة', L.total == null ? '—' : fmtSAR(L.total))}${kpi('الرسوم والضريبة (تقدير)', L.duty == null ? '—' : fmtSAR(L.duty + L.vat), L.duty == null ? '' : `رسوم ${fmtSAR(L.duty)} + ضريبة 15% ${fmtSAR(L.vat)} — تقدير، المعتمد ما في البيان`)}</div>
      ${L.per.length && L.total != null ? `<button class="btn sm" data-act="landed-xlsx" data-id="${s.id}">${ic('down')} تصدير التكلفة الواصلة (للمحاسبة)</button>` : ''}</section>`;
    const sec = mb.querySelectorAll('section'); (sec[0] || mb.lastElementChild).insertAdjacentHTML('beforebegin', html);
  };
}

/* shipment form: shipping line, exchange rate, detention free days and daily rates */
{
  const _e = ACT['ship-edit'];
  ACT['ship-edit'] = el => {
    _e(el); const f = $('#shf2'); if (!f) return; const s = el.dataset.id ? D.shipments.map[el.dataset.id] : {};
    const anchor = f.querySelector('[name="brokerId"]')?.closest('.fld'); const h = `${fld('line', 'الخط الملاحي', { type: 'select', options: [...new Set([...Object.values(LINE_PREFIX), ...Object.keys(trackTpl())])].map(x => [x, x]), value: s.line, hint: 'يتحدد تلقائياً من أول 4 حروف في رقم الحاوية' })}${fld('fxRate', 'سعر الصرف إلى الريال', { type: 'number', step: '0.0001', min: 0, value: s.fxRate ?? (s.currency === 'USD' || !s.currency ? 3.75 : ''), hint: 'لحساب التكلفة الواصلة' })}
      ${fld('detFreeDays', 'أيام السماح لإرجاع الحاوية', { type: 'number', min: 0, value: s.detFreeDays, hint: 'من خروجها من الميناء حتى إرجاعها فارغة' })}${fld('demRate', 'غرامة الأرضيات لكل حاوية/يوم (ر.س)', { type: 'number', min: 0, value: s.demRate })}${fld('detRate', 'غرامة تأخير الإرجاع لكل حاوية/يوم (ر.س)', { type: 'number', min: 0, value: s.detRate })}`;
    if (anchor) anchor.insertAdjacentHTML('beforebegin', h); else f.insertAdjacentHTML('beforeend', h);
  };
  const _f = FORM.ship;
  FORM.ship = async f => { ['fxRate', 'detFreeDays', 'demRate', 'detRate'].forEach(k => { const i = f.elements[k]; if (i && i.value !== '' && !(Number(i.value) >= 0)) i.value = ''; }); return _f(f); };
  const _s = saveShip; saveShip = async function (id, upd, ...r) { ['fxRate', 'detFreeDays', 'demRate', 'detRate'].forEach(k => { if (k in upd) upd[k] = nz(upd[k]); }); return _s(id, upd, ...r); };
  const _c = createShipment; createShipment = async function (v, ...r) { ['fxRate', 'detFreeDays', 'demRate', 'detRate'].forEach(k => { if (k in v) v[k] = nz(v[k]); }); return _c(v, ...r); };
}

/* containers */
ACT['ctr-edit'] = el => {
  const s = D.shipments.map[el.dataset.id]; const i = Number(el.dataset.i); const c = i >= 0 ? ctrList(s)[i] : { status: 'بالميناء' };
  openModal(i >= 0 ? 'الحاوية ' + c.no : 'حاوية جديدة — ' + s.ref, `<form class="form" id="ctrf" data-form="ctr" data-id="${s.id}" data-i="${i}">${fld('no', 'رقم الحاوية', { value: c.no, required: true, ph: 'MSKU1234567' })}${fld('size', 'المقاس', { type: 'select', options: ["20'", "40'", "40' HC", "45'", 'أخرى'], value: c.size })}${fld('seal', 'رقم الختم', { value: c.seal })}
    ${fld('status', 'الحالة', { type: 'select', blank: false, options: CTR_ST, value: c.status })}${fld('outGate', 'تاريخ الخروج من الميناء', { type: 'date', value: c.outGate })}${fld('returned', 'تاريخ إرجاعها فارغة', { type: 'date', value: c.returned })}</form>`,
    `<button class="btn pri" form="ctrf">حفظ</button>${i >= 0 ? `<button class="btn danger" data-act="ctr-del" data-id="${s.id}" data-i="${i}">حذف</button>` : ''}<button class="btn" data-act="open-ship" data-id="${s.id}">رجوع</button>`, true);
};
FORM.ctr = async f => {
  const s = D.shipments.map[f.dataset.id]; const i = Number(f.dataset.i); const v = readForm(f); v.no = String(v.no || '').toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{4}\d{6,7}$/.test(v.no)) return toast('رقم الحاوية: 4 حروف ثم 7 أرقام (مثال MSKU1234567)', true);
  if (v.returned && v.outGate && v.returned < v.outGate) return toast('تاريخ الإرجاع قبل الخروج من الميناء', true);
  if (v.returned && !v.outGate) return toast('سجّل تاريخ الخروج من الميناء أول', true);
  const L = [...ctrList(s)]; if (L.some((c, k) => c.no === v.no && k !== i)) return toast('الحاوية مسجلة في الشحنة', true);
  if (i >= 0) L[i] = { ...L[i], ...v }; else L.push(v);
  await saveShip(s.id, { ctrs: L, containers: L.length, containerNos: L.map(c => c.no).join(' ') }, 'تحديث حاوية', `${v.no} — ${v.status}`); toast('تم الحفظ'); openShipment(s.id);
};
ACT['ctr-del'] = async el => { const s = D.shipments.map[el.dataset.id]; const L = ctrList(s).filter((_, k) => k !== Number(el.dataset.i)); await saveShip(s.id, { ctrs: L, containers: L.length, containerNos: L.map(c => c.no).join(' ') }, 'حذف حاوية', ''); openShipment(s.id); };

/* items: HS code, duty %, SABER certificate, value, received quantity */
ACT['item-edit'] = el => {
  const s = D.shipments.map[el.dataset.id]; const i = Number(el.dataset.i); const it = i >= 0 ? itemsOf(s)[i] : { hs: s.hsCode };
  openModal(i >= 0 ? 'تعديل صنف' : 'صنف جديد — ' + s.ref, `<form class="form" id="itf" data-form="sitem" data-id="${s.id}" data-i="${i}">${fld('code', 'كود الصنف', { value: it.code })}${fld('desc', 'الوصف', { value: it.desc, required: true })}${fld('hs', 'البند الجمركي (HS)', { value: it.hs })}
    ${fld('qty', 'الكمية', { type: 'number', min: 0, step: 'any', value: it.qty, required: true })}${fld('unit', 'الوحدة', { value: it.unit, ph: 'طن، قطعة، كرتون' })}${fld('value', `القيمة بالفاتورة (${s.currency || ''})`, { type: 'number', min: 0, step: '0.01', value: it.value, required: true })}
    ${fld('dutyPct', 'نسبة الرسوم الجمركية %', { type: 'number', min: 0, step: '0.1', value: it.dutyPct, hint: 'من التعرفة الجمركية للبند — للتقدير فقط' })}${fld('saber', 'رقم شهادة المطابقة (سابر)', { value: it.saber })}${fld('saberExp', 'انتهاء الشهادة', { type: 'date', value: it.saberExp })}
    ${fld('recvQty', 'الكمية المستلمة بالمستودع', { type: 'number', min: 0, step: 'any', value: it.recvQty, hint: 'عند الاستلام — الفرق يظهر كعجز' })}</form>`,
    `<button class="btn pri" form="itf">حفظ</button>${i >= 0 ? `<button class="btn danger" data-act="item-del" data-id="${s.id}" data-i="${i}">حذف</button>` : ''}<button class="btn" data-act="open-ship" data-id="${s.id}">رجوع</button>`, true);
};
FORM.sitem = async f => {
  const s = D.shipments.map[f.dataset.id]; const i = Number(f.dataset.i); const v = readForm(f);
  ['qty', 'value', 'dutyPct', 'recvQty'].forEach(k => v[k] = nz(v[k])); if (!(v.qty > 0)) return toast('الكمية لازم تكون أكبر من صفر', true);
  const L = [...itemsOf(s)]; if (i >= 0) L[i] = { ...L[i], ...v }; else L.push(v);
  const short = L.filter(x => x.recvQty != null && x.recvQty < x.qty);
  await saveShip(s.id, { items: L }, 'تحديث صنف شحنة', v.desc); toast(short.length ? `تم — فيه عجز استلام في ${short.length} صنف` : 'تم الحفظ'); openShipment(s.id);
};
ACT['item-del'] = async el => { const s = D.shipments.map[el.dataset.id]; await saveShip(s.id, { items: itemsOf(s).filter((_, k) => k !== Number(el.dataset.i)) }, 'حذف صنف شحنة', ''); openShipment(s.id); };
ACT['landed-xlsx'] = el => {
  const s = D.shipments.map[el.dataset.id]; const L = landed(s);
  exportRows(`landed-cost-${s.ref}`, [['رقم الشحنة', 'المورد', 'كود الصنف', 'الوصف', 'البند الجمركي', 'الكمية', 'الوحدة', `القيمة (${s.currency || ''})`, 'سعر الصرف', 'القيمة بالريال', 'نصيبه من التكاليف (ر.س)', 'التكلفة الواصلة (ر.س)', 'تكلفة الوحدة (ر.س)', 'الكمية المستلمة'],
    ...L.per.map(i => [s.ref, s.supplier, i.code || '', i.desc || '', i.hs || s.hsCode || '', Number(i.qty) || 0, i.unit || '', Number(i.value) || 0, L.r, Math.round((Number(i.value) || 0) * L.r * 100) / 100, Math.round(L.costs * i.share * 100) / 100, Math.round(i.tot * 100) / 100, i.uc != null ? Math.round(i.uc * 100) / 100 : '', i.recvQty ?? ''])], 'التكلفة الواصلة');
};

/* stage update: required documents (or a written override) and a reason when the stage ran over its target */
{
  const _st = FORM['ship-stage'];
  FORM['ship-stage'] = async f => {
    const s = D.shipments.map[f.dataset.id]; const idx = Number(f.elements.stageIdx.value); const st = customsStages()[idx]; const cur = shipStage(s);
    if (idx > s.stageIdx) {
      const miss = []; customsStages().slice(s.stageIdx + 1, idx + 1).forEach(x => docMissing(s, x.key).forEach(d => { if (!miss.includes(d)) miss.push(d); }));
      if (miss.length && !f.elements.ovr?.checked) {
        if (!f.querySelector('[name=ovr]')) f.insertAdjacentHTML('beforeend', `<div class="full note warn">مستندات ناقصة قبل «${esc(st.name)}»: ${miss.map(docName).map(esc).join('، ')}<label class="row" style="margin-top:6px"><input type="checkbox" name="ovr"> أكمل بدونها — واكتب السبب في الملاحظة</label></div>`);
        return toast('ارفع المستندات الناقصة أو أكّد التجاوز', true);
      }
      if (miss.length && !(f.elements.note?.value || '').trim()) return toast('اكتب سبب التجاوز في الملاحظة', true);
      const late = cur.slaDays && daysInStage(s) > cur.slaDays;
      if (late && !f.elements.delay) { f.insertAdjacentHTML('beforeend', `<div class="full">${fld('delay', `سبب التأخير في «${cur.name}» (${daysInStage(s)} يوم، المستهدف ${cur.slaDays})`, { type: 'select', options: DELAY_REASONS })}</div>`); return toast('اختر سبب التأخير', true); }
      if (late && !f.elements.delay.value) return toast('اختر سبب التأخير', true);
      const dr = late ? f.elements.delay.value : null; const ov = miss.length ? miss : null;
      await _st(f);
      const n = D.shipments.map[s.id]; const log = [...(n.stageLog || [])]; const last = log[log.length - 1];
      if (last && (dr || ov)) { log[log.length - 1] = { ...last, ...(dr ? { delayReason: dr, delayStage: s.stageIdx, delayDays: daysInStage(s) } : {}), ...(ov ? { docsOverride: ov } : {}) }; await saveShip(s.id, { stageLog: log }, null); }
      return;
    }
    return _st(f);
  };
}

/* dashboard extras + broker scorecard tab */
function brokerScore() {
  const arrI = stageIdxByKey('arrived'), relI = stageIdxByKey('released'); const sla = customsStages().slice(arrI + 1, relI + 1).reduce((a, x) => a + (Number(x.slaDays) || 0), 0);
  return D.brokers.list.map(b => {
    const L = D.shipments.list.filter(s => s.brokerId === b.id && s.status !== 'cancelled'); const done = L.filter(s => arrivalDate(s) && releaseDate(s));
    const days = done.map(s => daysBetween(arrivalDate(s), releaseDate(s))); const onT = sla ? days.filter(d => d <= sla).length : null;
    const reasons = {}; L.forEach(s => (s.stageLog || []).forEach(l => { if (l.delayReason) reasons[l.delayReason] = (reasons[l.delayReason] || 0) + 1; }));
    const ch = L.reduce((a, s) => { const x = shipCharges(s); return a + x.dem + x.det; }, 0);
    return { b, n: L.length, done: done.length, avg: days.length ? days.reduce((a, x) => a + x, 0) / days.length : null, onT, sla, cost: L.length ? L.reduce((a, s) => a + shipCostSAR(s), 0) / L.length : null, ch, top: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 2) };
  }).filter(x => x.n);
}
{
  const _v = VIEWS.customs;
  VIEWS.customs = () => {
    let h = _v();
    if ((S.tabs.cus || 'board') === 'board') {
      const act = D.shipments.list.filter(s => !shipIsClosed(s)); const ch = act.reduce((a, s) => { const x = shipCharges(s); a.v += x.dem + x.det; a.d += x.days; return a; }, { v: 0, d: 0 });
      const miss = act.filter(s => { const n = customsStages()[s.stageIdx + 1]; return n && docMissing(s, n.key).length; }).length;
      const sab = D.shipments.list.reduce((a, s) => a + saberAlerts(s).length, 0);
      const reasons = {}; D.shipments.list.forEach(s => (s.stageLog || []).forEach(l => { if (l.delayReason && (l.date || '') >= addDays(todayISO(), -180)) reasons[l.delayReason] = (reasons[l.delayReason] || 0) + 1; }));
      const extra = `<div class="grid g4" style="margin-top:12px">${kpi('غرامات أرضيات/تأخير متوقعة', ch.v ? fmtSAR(ch.v) : ch.d ? ch.d + ' يوم حاوية' : '0', 'محسوبة من أيام السماح وسعر الغرامة اليومي المسجل', ch.v || ch.d)}${kpi('شحنات ناقصها مستندات', fmtN(miss), 'مستندات مطلوبة قبل المرحلة القادمة', miss)}${kpi('شهادات سابر تنتهي/منتهية', fmtN(sab), 'خلال 30 يوم', sab)}${kpi('حاويات بالميناء', fmtN(act.reduce((a, s) => a + ctrList(s).filter(c => !c.outGate).length, 0)))}</div>
        ${Object.keys(reasons).length ? `<section class="card" style="margin-top:16px"><h2>أسباب التأخير <small>آخر 6 أشهر</small></h2>${bars(Object.entries(reasons).sort((a, b) => b[1] - a[1]))}</section>` : ''}`;
      const i = h.indexOf('<div class="grid g2" style="margin-top:16px">'); h = i > 0 ? h.slice(0, i) + extra + h.slice(i) : h + extra;
    }
    if ((S.tabs.cus || '') === 'brokers') {
      const R = brokerScore();
      if (R.length) h += `<section class="card" style="margin-top:16px"><h2>تقييم المخلصين</h2><div class="tablewrap"><table><thead><tr><th>المخلص</th><th>الشحنات</th><th>مُفرج عنها</th><th>متوسط مدة التخليص</th><th>ضمن المدة المستهدفة${R[0].sla ? ` (${R[0].sla} يوم)` : ''}</th><th>متوسط التكلفة للشحنة</th><th>غرامات متوقعة</th><th>أكثر أسباب التأخير</th></tr></thead><tbody>
        ${R.map(x => `<tr><td><b>${esc(x.b.name)}</b></td><td class="num">${x.n}</td><td class="num">${x.done}</td><td class="num">${x.avg == null ? '—' : fmtN(x.avg, 1) + ' يوم'}</td><td class="num">${x.onT == null || !x.done ? '—' : Math.round(x.onT / x.done * 100) + '%'}</td><td class="num">${x.cost == null ? '—' : fmtSAR(x.cost)}</td><td class="num">${x.ch ? fmtSAR(x.ch) : '—'}</td><td class="small">${x.top.map(([r, n]) => `${esc(r)} (${n})`).join('، ') || '—'}</td></tr>`).join('')}</tbody></table></div>
        <div class="small muted">المدة من الوصول للمنفذ حتى الإفراج. المستهدف = مجموع المدد المستهدفة للمراحل بينهما.</div></section>`;
    }
    if ((S.tabs.cus || '') === 'stages' && can('customs.manage')) {
      const t = trackTpl(); const lines = [...new Set(Object.values(LINE_PREFIX))];
      h += `<form class="card" data-form="trackurls" style="margin-top:16px"><h2>روابط تتبع الحاويات</h2><p class="small muted">الصق رابط صفحة التتبع لكل خط ملاحي وضع <b class="num">{no}</b> مكان رقم الحاوية. رابط Maersk مضاف؛ البقية تحتاج تتأكد منها من موقع الخط.</p>
        <div class="form">${lines.map(l => fld('u_' + l.replace(/\W/g, '_'), l, { value: t[l] || '', ph: 'https://…{no}' })).join('')}</div><div class="row"><button class="btn pri">حفظ الروابط</button></div></form>`;
    }
    return h;
  };
}
FORM.trackurls = async f => {
  const v = readForm(f); const out = {}; Object.values(LINE_PREFIX).forEach(l => { const u = (v['u_' + l.replace(/\W/g, '_')] || '').trim(); if (u) { if (!/^https:\/\//.test(u) || !u.includes('{no}')) return; out[l] = u; } });
  await patch('settings', 'main', { trackUrls: out }); await audit('تعديل روابط تتبع الحاويات', 'settings', 'trackUrls', Object.keys(out).join('، ')); toast('حُفظت الروابط');
};
