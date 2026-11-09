'use strict';
/* ============ Excel import / export ============ */
const hasXLSX = () => typeof window.XLSX !== 'undefined';
const serialISO = n => new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10);
const cellDate = v => { if (typeof v === 'number' && v > 1000) return serialISO(Math.floor(v)); if (v instanceof Date && !isNaN(v)) return localISO(v); const s = String(v ?? '').trim(); let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return s; };
const cellTime = v => { if (typeof v === 'string' && /[AaPp][Mm]|[صم]$/.test(v.trim())) { const m = v.match(/(\d{1,2}):(\d{2})/); if (m) { let h = +m[1] % 12; if (/[Pp][Mm]|م$/.test(v.trim())) h += 12; return String(h).padStart(2, '0') + ':' + m[2]; } } if (v instanceof Date && !isNaN(v)) return String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0'); if (typeof v === 'number') { const m = Math.round((v % 1) * 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); } const s = String(v ?? '').trim(); const m = s.match(/^(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : s; };
const cellNum = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/[,\s]/g, '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))); return isNaN(n) ? NaN : n; };
async function readWorkbook(file) {
  const name = file.name.toLowerCase();
  const clean = rows => rows.map(r => r.map(c => typeof c === 'string' ? c.trim() : c));
  if (name.endsWith('.csv') || name.endsWith('.txt')) return { CSV: clean(parseCSV(await file.text())) };
  if (!hasXLSX()) throw new Error('مكتبة قراءة ملفات Excel لم تُحمّل. احفظ الملف بصيغة CSV من Excel (حفظ باسم ← CSV UTF-8) أو أعد تحميل الصفحة.');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const out = {}; wb.SheetNames.forEach(n => { out[n] = clean(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })); });
  return out;
}
async function readSheetFile(file) { const wb = await readWorkbook(file); return Object.values(wb)[0].filter(r => r.some(c => String(c).trim() !== '')); }
async function exportRows(base, rows, sheetName, extraSheets) {
  if (hasXLSX()) {
    const mk = rs => { const ws = XLSX.utils.aoa_to_sheet(rs); ws['!cols'] = rs[0].map((h, i) => ({ wch: Math.min(48, Math.max(10, ...rs.slice(0, 200).map(r => String(r[i] ?? '').length + 2))) })); return ws; };
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, mk(rows), (sheetName || 'بيانات').replace(/[:\\/?*\[\]]/g, ' ').slice(0, 30));
    (extraSheets || []).forEach(([n, rs]) => XLSX.utils.book_append_sheet(wb, mk(rs), n.slice(0, 30)));
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return saveFile(base + '.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  return saveFile(base + '.csv', toCSV(rows), 'text/csv;charset=utf-8');
}

/* import definitions: columns matched by header text (order does not matter) */
const unitByCode = c => { c = String(c || '').trim(); return D.orgunits.list.find(u => u.code === c || u.name === c)?.id || null; };
const empByNo = n => D.employees.list.find(e => e.empNo === String(n || '').trim());
const IMPORTS = {
  employees: {
    title: 'استيراد الموظفين', perm: 'emp.edit',
    note: 'الإدارة والموقع تُكتب بالرمز أو الاسم كما في الهيكل التنظيمي. الموظف الموجود برقمه الوظيفي لا يُكرر ولا يُعدّل.',
    cols: [['empNo', 'الرقم الوظيفي', 1], ['nameAr', 'الاسم بالعربية', 1], ['nameEn', 'الاسم بالإنجليزية'], ['nationality', 'الجنسية'], ['idNumber', 'رقم الهوية/الإقامة'], ['idExpiry', 'انتهاء الهوية/الإقامة', 0, 'date'], ['phone', 'الجوال'], ['email', 'البريد الإلكتروني'], ['title', 'المسمى الوظيفي'], ['dept', 'الإدارة'], ['loc', 'موقع العمل'], ['mgrNo', 'الرقم الوظيفي للمدير'], ['contractType', 'نوع العقد'], ['contractStart', 'بداية العقد', 0, 'date'], ['contractEnd', 'نهاية العقد', 0, 'date'], ['hireDate', 'تاريخ التعيين', 0, 'date']],
    check(r, seen) {
      if (empByNo(r.empNo)) return 'الرقم الوظيفي موجود مسبقًا';
      if (seen.has(r.empNo)) return 'الرقم الوظيفي مكرر في الملف';
      if (r.dept && !unitByCode(r.dept)) return 'الإدارة غير موجودة في الهيكل: ' + r.dept;
      if (r.loc && !unitByCode(r.loc)) return 'الموقع غير موجود في الهيكل: ' + r.loc;
      seen.add(r.empNo);
    },
    async commit(rows) {
      const at = nowISO(); const ids = {};
      for (const r of rows) { const id = newId(); ids[r.empNo] = id; await put('employees', id, { empNo: r.empNo, nameAr: r.nameAr, nameEn: r.nameEn, nationality: r.nationality, idNumber: r.idNumber, idExpiry: r.idExpiry || null, phone: r.phone, email: r.email, title: r.title, deptId: unitByCode(r.dept), locationId: unitByCode(r.loc), contractType: r.contractType, contractStart: r.contractStart || null, contractEnd: r.contractEnd || null, hireDate: r.hireDate || null, joinDate: r.hireDate || null, status: 'active', roles: [], docs: [], createdAt: at, importedById: S.meId }); }
      await sleep(300);
      for (const r of rows) { if (!r.mgrNo) continue; const m = empByNo(r.mgrNo)?.id || ids[r.mgrNo]; const cur = D.employees.map[ids[r.empNo]]; if (m && cur) await put('employees', cur.id, { ...strip(cur), managerId: m }); }
    }
  },
  attendance: {
    title: 'استيراد حركات الحضور (البصمة)', perm: 'att.manage',
    note: 'صدّر الحركات من برنامج جهاز البصمة إلى Excel. السجل الموجود لنفس الموظف ونفس اليوم يُستبدل.',
    cols: [['empNo', 'الرقم الوظيفي', 1], ['date', 'التاريخ', 1, 'date'], ['in', 'وقت الحضور', 0, 'time'], ['out', 'وقت الانصراف', 0, 'time']],
    check(r, seen) { if (!empByNo(r.empNo)) return 'رقم وظيفي غير موجود'; if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return 'تاريخ غير صحيح'; if (r.in && !/^\d{2}:\d{2}$/.test(r.in)) return 'وقت حضور غير صحيح'; const k = r.empNo + r.date; if (seen.has(k)) return 'مكرر في الملف'; seen.add(k); },
    async commit(rows, file) { await attPutMany(rows.map(r => { const e = empByNo(r.empNo); return { empId: e.id, date: r.date, in: r.in || '', out: r.out || '', shiftId: e.shiftId || null, source: 'استيراد ' + file, updatedAt: nowISO() }; })); }
  },
  salaries: {
    title: 'ترحيل عناصر الأجر من Excel', perm: 'pay.manage',
    note: 'للترحيل الأولي فقط: يُسجَّل الأجر للموظف الذي ليس له عناصر أجر مسجلة. أي موظف له أجر مسجل يُتخطى، وتعديله يتم عبر طلب «تغيير مالي» المعتمد.',
    cols: [['empNo', 'الرقم الوظيفي', 1], ['basic', 'الراتب الأساسي', 1, 'num'], ['housing', 'بدل السكن', 0, 'num'], ['transport', 'بدل النقل', 0, 'num'], ['other', 'بدلات أخرى', 0, 'num'], ['effectiveDate', 'سارية من', 0, 'date']],
    check(r, seen) { const e = empByNo(r.empNo); if (!e) return 'رقم وظيفي غير موجود'; if (D.salaries.map[e.id]) return 'له أجر مسجل مسبقًا — يُعدّل بطلب تغيير مالي'; for (const k of ['basic', 'housing', 'transport', 'other']) if (Number.isNaN(r[k])) return 'قيمة غير رقمية'; if (seen.has(r.empNo)) return 'مكرر في الملف'; seen.add(r.empNo); },
    async commit(rows, file) { const at = nowISO(); for (const r of rows) { const e = empByNo(r.empNo); await put('salaries', e.id, { basic: +r.basic || 0, housing: +r.housing || 0, transport: +r.transport || 0, other: +r.other || 0, effectiveDate: r.effectiveDate || todayISO(), updatedAt: at, lastRef: 'ترحيل ' + file }); await put('emphistory', newId(), { empId: e.id, kind: 'salary', field: 'basic', old: null, new: +r.basic, reason: 'ترحيل أولي من ' + file, byId: S.meId, at, sensitive: true }); } }
  },
  shipments: {
    title: 'استيراد الشحنات الواردة', perm: 'customs.manage',
    note: 'المخلص يُكتب باسمه كما في قائمة المخلصين. المرحلة تُكتب باسمها كما في إعدادات المراحل، وإن تُركت فارغة تبدأ الشحنة من المرحلة الأولى.',
    cols: [['supplier', 'المورد', 1], ['origin', 'بلد المنشأ'], ['poNo', 'رقم أمر الشراء'], ['goods', 'وصف البضاعة', 1], ['mode', 'طريقة الشحن'], ['port', 'منفذ الوصول'], ['blNo', 'رقم البوليصة'], ['containers', 'عدد الحاويات', 0, 'num'], ['invoiceValue', 'قيمة الفاتورة', 0, 'num'], ['currency', 'العملة'], ['etd', 'تاريخ الشحن المتوقع', 0, 'date'], ['eta', 'تاريخ الوصول المتوقع', 0, 'date'], ['broker', 'المخلص'], ['stage', 'المرحلة الحالية']],
    check(r) { if (r.broker && !D.brokers.list.find(b => b.name === r.broker)) return 'المخلص غير موجود: ' + r.broker; if (r.stage && !customsStages().find(s => s.name === r.stage)) return 'مرحلة غير معروفة: ' + r.stage; if (Number.isNaN(r.invoiceValue) || Number.isNaN(r.containers)) return 'قيمة غير رقمية'; if (r.blNo && D.shipments.list.some(s => s.blNo === r.blNo)) return 'رقم البوليصة مسجل لشحنة أخرى'; },
    async commit(rows, file) { for (const r of rows) await createShipment({ supplier: r.supplier, origin: r.origin, poNo: r.poNo, goods: r.goods, mode: r.mode || 'بحري', port: r.port, blNo: r.blNo, containers: r.containers === '' ? null : r.containers, invoiceValue: r.invoiceValue === '' ? null : r.invoiceValue, currency: r.currency || 'USD', etd: r.etd || null, eta: r.eta || null, brokerId: D.brokers.list.find(b => b.name === r.broker)?.id || null }, r.stage, 'استيراد ' + file); }
  }
};
/* ---- column format spec (تنسيق الملف) ---- */
const TYPE_FMT = { date: ['تاريخ', '2026-10-29 أو 29/10/2026 أو خلية تاريخ في Excel'], time: ['وقت (24 ساعة)', '07:30 أو 7:30 ص'], num: ['رقم', '12500 بدون عملة أو رموز'] };
function colSpec(kind, c) {
  const [k, l, req, t] = c; let fmt = TYPE_FMT[t]?.[0] || 'نص', ex = TYPE_FMT[t]?.[1] || '';
  const units = ty => D.orgunits.list.filter(u => u.type === ty).map(u => u.code || u.name).slice(0, 8).join('، ');
  if (k === 'empNo' || k === 'mgrNo') { fmt = 'رقم وظيفي'; ex = kind === 'employees' && k === 'empNo' ? 'فريد لكل موظف، مثل T1001' : 'رقم وظيفي موجود في النظام'; }
  if (k === 'dept') { fmt = 'رمز أو اسم الإدارة'; ex = units('dept') || 'أضف الإدارات أولًا من الإعدادات'; }
  if (k === 'loc') { fmt = 'رمز أو اسم الموقع'; ex = units('location') || 'أضف المواقع أولًا من الإعدادات'; }
  if (k === 'contractType') { fmt = 'قيمة من قائمة'; ex = LIST('contractTypes').join('، '); }
  if (k === 'broker') { fmt = 'اسم المخلص كما في النظام'; ex = D.brokers.list.map(b => b.name).join('، ') || 'أضف المخلصين أولًا'; }
  if (k === 'stage') { fmt = 'اسم المرحلة'; ex = customsStages().map(x => x.name).join('، '); }
  if (k === 'mode') { fmt = 'قيمة من قائمة'; ex = LIST('shipModes').join('، '); }
  if (k === 'currency') { fmt = 'رمز العملة'; ex = LIST('currencies').join('، '); }
  const sf = IMPORTS[kind]?.screen ? recFields(IMPORTS[kind].screen).find(f => f.key === k) : null;
  if (sf) { if (['select', 'radio'].includes(sf.type)) { fmt = 'قيمة من قائمة'; ex = optList(sf).join('، '); } if (sf.type === 'checks') { fmt = 'قيم مفصولة بفاصلة'; ex = optList(sf).join('، '); } if (sf.type === 'checkbox') { fmt = 'نعم / لا'; ex = 'نعم'; } if (sf.type === 'employee') { fmt = 'رقم وظيفي'; ex = 'رقم موجود في النظام'; } }
  return { label: l, req: !!req, fmt, ex };
}
function specRows(kind) { return IMPORTS[kind].cols.map(c => colSpec(kind, c)); }
function specTable(kind) { return `<div class="tablewrap"><table><thead><tr><th>عنوان العمود في الملف</th><th>إلزامي</th><th>التنسيق</th><th>القيم المسموحة / مثال</th></tr></thead><tbody>${specRows(kind).map(r => `<tr><td><b>${esc(r.label)}</b></td><td>${r.req ? '<span class="badge b-bad">إلزامي</span>' : '<span class="muted small">اختياري</span>'}</td><td>${esc(r.fmt)}</td><td class="small">${esc(r.ex)}</td></tr>`).join('')}</tbody></table></div>`; }
function templateFor(kind) {
  const def = IMPORTS[kind]; const sp = specRows(kind);
  exportRows('قالب-' + (def.screen ? def.screen.name : kind), [def.cols.map(c => c[1])], 'البيانات', [['التعليمات', [['عنوان العمود', 'إلزامي', 'التنسيق', 'القيم المسموحة / مثال'], ...sp.map(r => [r.label, r.req ? 'نعم' : 'لا', r.fmt, r.ex]), [], ['ملاحظات', '', 'عبّئ ورقة «البيانات» فقط. الصف الأول عناوين ولا تغيّرها. ترتيب الأعمدة غير مهم.', '']]]]);
}

/* ---- import dialog: file → sheet → header row → column mapping → preview ---- */
function openImport(kind) {
  const def = IMPORTS[kind]; if (!def || (def.perm && !can(def.perm))) return toast('لا تملك صلاحية هذا الاستيراد', true);
  S.imp = { kind, rows: null, file: null, wb: null, sheet: null, headRow: 1, map: {} };
  openModal(def.title, `<div class="note">${esc(def.note)}</div>
    <details><summary class="small" style="cursor:pointer"><b>تنسيق الملف المطلوب</b> (${def.cols.length} عمود، ${def.cols.filter(c => c[2]).length} إلزامي)</summary><div style="margin-top:8px">${specTable(kind)}</div></details>
    <div class="row"><button class="btn" data-act="imp-template">${ic('down')} تنزيل قالب Excel جاهز</button><span class="small muted">أو استخدم ملفك الحالي، وطابق أعمدته في الخطوة التالية</span></div>
    <div class="fld"><label for="imp-file">اختر ملف Excel أو CSV</label><input type="file" id="imp-file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"></div>
    <div id="imp-map"></div><div id="imp-preview" class="small muted">لم يُختر ملف بعد.</div>`,
    `<button class="btn pri" data-act="imp-commit" id="imp-go" disabled>استيراد</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
  $('#imp-file').addEventListener('change', e => guard(() => loadImportFile(e.target.files[0])));
}
const normH = h => String(h ?? '').replace(/[\s‏‎*:]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
async function loadImportFile(file) {
  if (!file) return; const def = IMPORTS[S.imp.kind];
  S.imp.wb = await readWorkbook(file); S.imp.file = file.name;
  const names = Object.keys(S.imp.wb); const want = def.cols.map(c => normH(c[1]));
  // choose the sheet & header row that match the most expected columns
  let best = { sheet: names[0], row: 1, score: -1 };
  for (const n of names) S.imp.wb[n].slice(0, 15).forEach((r, i) => { const sc = r.filter(c => want.includes(normH(c))).length * 100 + r.filter(c => typeof c === 'string' && c.trim() && isNaN(+c)).length; if (sc > best.score) best = { sheet: n, row: i + 1, score: sc }; });
  S.imp.sheet = best.sheet; S.imp.headRow = best.row; autoMap(); renderImportMap(); runPreview();
}
function importHeaders() { const r = S.imp.wb[S.imp.sheet][S.imp.headRow - 1] || []; return r.map((h, i) => ({ i, h: String(h ?? '').trim() })).filter(x => x.h); }
function autoMap() {
  const def = IMPORTS[S.imp.kind]; const heads = importHeaders(); const saved = (SET().importMaps || {})[S.imp.kind] || {}; S.imp.map = {};
  def.cols.forEach(([k, l]) => { const sv = saved[k] ? heads.find(x => x.h === saved[k]) : null; const ex = heads.find(x => normH(x.h) === normH(l) || normH(x.h) === normH(k)); const m = sv || ex; if (m) S.imp.map[k] = m.i; });
}
function renderImportMap() {
  const def = IMPORTS[S.imp.kind]; const heads = importHeaders(); const names = Object.keys(S.imp.wb);
  $('#imp-map').innerHTML = `<section class="card" style="padding:14px"><h2 style="font-size:15px">مطابقة أعمدة الملف <small>${esc(S.imp.file)}</small></h2>
    <div class="row" style="margin-bottom:10px">${names.length > 1 ? `<label class="small">الورقة <select id="imp-sheet">${names.map(n => `<option ${n === S.imp.sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}<label class="small">صف العناوين رقم <input id="imp-headrow" type="number" min="1" max="50" value="${S.imp.headRow}" style="width:70px"></label><span class="small muted">طابق كل حقل في النظام مع العمود المقابل في ملفك</span></div>
    <div class="imp-grid">${def.cols.map(([k, l, req]) => `<label class="imp-m ${req && S.imp.map[k] == null ? 'miss' : ''}"><span>${esc(l)}${req ? ' <b style="color:var(--bad)">*</b>' : ''}</span><select data-impmap="${k}"><option value="">— غير موجود في الملف —</option>${heads.map(x => `<option value="${x.i}" ${S.imp.map[k] === x.i ? 'selected' : ''}>${esc(x.h)}</option>`).join('')}</select></label>`).join('')}</div>
    <label class="checks small" style="margin-top:8px"><input type="checkbox" id="imp-save" checked> حفظ هذه المطابقة لاستخدامها تلقائيًا في المرات القادمة</label></section>`;
}
document.addEventListener('change', e => {
  if (!S.imp || !e.target.closest('#imp-map')) return; const t = e.target;
  if (t.id === 'imp-sheet') { S.imp.sheet = t.value; S.imp.headRow = 1; autoMap(); renderImportMap(); runPreview(); }
  else if (t.id === 'imp-headrow') { S.imp.headRow = Math.max(1, +t.value || 1); autoMap(); renderImportMap(); runPreview(); }
  else if (t.dataset.impmap) { S.imp.map[t.dataset.impmap] = t.value === '' ? null : +t.value; renderImportMap(); runPreview(); }
});
function runPreview() {
  const def = IMPORTS[S.imp.kind]; const all = S.imp.wb[S.imp.sheet] || []; const idx = S.imp.map;
  const missing = def.cols.filter(c => c[2] && idx[c[0]] == null).map(c => c[1]);
  const b = $('#imp-go');
  if (missing.length) { $('#imp-preview').innerHTML = `<div class="note bad">طابق الأعمدة الإلزامية أولًا: ${missing.map(esc).join('، ')}</div>`; b.disabled = true; b.textContent = 'استيراد'; S.imp.rows = null; return; }
  const seen = new Set();
  const rows = all.slice(S.imp.headRow).map((r, n) => ({ r, line: S.imp.headRow + n + 1 })).filter(x => x.r.some(c => String(c ?? '').trim() !== '')).map(({ r, line }) => {
    const o = { _line: line };
    def.cols.forEach(([k, , req, t]) => { let v = idx[k] != null ? r[idx[k]] : ''; v = t === 'date' ? cellDate(v) : t === 'time' ? cellTime(v) : t === 'num' ? cellNum(v) : String(v ?? '').trim(); o[k] = v; });
    const miss = def.cols.filter(c => c[2] && (o[c[0]] === '' || o[c[0]] == null)).map(c => c[1]);
    const badDate = def.cols.filter(c => c[3] === 'date' && o[c[0]] && !/^\d{4}-\d{2}-\d{2}$/.test(o[c[0]])).map(c => c[1]);
    o._err = miss.length ? 'ناقص: ' + miss.join('، ') : badDate.length ? 'تاريخ غير مفهوم في: ' + badDate.join('، ') : (def.check(o, seen) || '');
    return o;
  });
  S.imp.rows = rows;
  const ok = rows.filter(r => !r._err).length; const show = def.cols.filter(c => idx[c[0]] != null && c[0] !== 'password').slice(0, 6); // never echo passwords
  $('#imp-preview').innerHTML = rows.length ? `<div class="row" style="margin-bottom:8px"><span class="badge b-ok">${ok} صف جاهز</span>${rows.length - ok ? `<span class="badge b-bad">${rows.length - ok} صف به خطأ ولن يُستورد</span>` : ''}</div>
    <div class="tablewrap" style="max-height:320px;overflow:auto"><table><thead><tr><th>السطر</th>${show.map(c => `<th>${esc(c[1])}</th>`).join('')}<th>الحالة</th></tr></thead><tbody>${rows.slice(0, 300).map(r => `<tr><td class="num">${r._line}</td>${show.map(c => `<td>${esc(Number.isNaN(r[c[0]]) ? '؟' : r[c[0]])}</td>`).join('')}<td>${r._err ? `<span style="color:var(--bad)">${esc(r._err)}</span>` : '<span style="color:var(--ok)">جاهز</span>'}</td></tr>`).join('')}</tbody></table></div>${rows.length > 300 ? `<div class="small muted">يُعرض أول 300 صف من ${rows.length}</div>` : ''}` : '<div class="note warn">لا توجد صفوف بيانات تحت صف العناوين</div>';
  b.disabled = !ok; b.textContent = `استيراد ${ok} صف`;
}
ACT['imp-template'] = () => templateFor(S.imp.kind);
ACT['imp-commit'] = async el => {
  const def = IMPORTS[S.imp.kind]; const good = (S.imp.rows || []).filter(r => !r._err); if (!good.length) return;
  el.disabled = true; el.textContent = 'جارٍ الاستيراد…';
  try {
    await def.commit(good, S.imp.file);
    if ($('#imp-save')?.checked) { const heads = importHeaders(); const m = {}; Object.entries(S.imp.map).forEach(([k, i]) => { if (i != null) m[k] = heads.find(x => x.i === i)?.h; }); try { await patch('settings', 'main', { importMaps: { ...(SET().importMaps || {}), [S.imp.kind]: m } }); } catch (e) { console.warn(e); } }
    await audit('استيراد Excel: ' + def.title, 'import', null, `${S.imp.file} / ${S.imp.sheet}: ${good.length} صف، ${S.imp.rows.length - good.length} مرفوض`); closeModal(); toast(`تم استيراد ${good.length} صف`);
  } catch (e) { el.disabled = false; el.textContent = 'إعادة المحاولة'; throw e; }
};
ACT['import'] = el => openImport(el.dataset.k);
