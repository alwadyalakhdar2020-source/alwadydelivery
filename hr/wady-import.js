/* ===== Al-Wady: HR imports — update without duplicates, column setup, more data types (loaded last) ===== */
(function () {
  const T = s => String(s ?? '').trim();
  const nk = s => normH(s);                              // loose key: spaces, hamza, taa marbuta…
  const canCfg = () => { try { return (window.WADY_PERM && WADY_PERM.admin) || wadyLvl('hr', 'settings') >= 3 || can('settings.manage'); } catch (e) { return false; } };

  /* ---------- 1. column setup per import: required / in template / column title ---------- */
  const CFG = kind => ((SET().importCols || {})[kind]) || {};
  function applyCfg(kind, base) {
    const c = CFG(kind); const req = c.req || {}, tpl = c.tpl || {}, lbl = c.label || {};
    return base.filter(x => x[2] || req[x[0]] || tpl[x[0]] !== false).map(x => { const n = [...x]; if (lbl[x[0]]) n[1] = lbl[x[0]]; if (!x[2] && req[x[0]]) n[2] = 1; return n; });
  }
  function withCfg(kind, def) {
    if (!def || def.__wcfg) return def;
    const base = def.cols; Object.defineProperty(def, 'baseCols', { value: base, writable: true, configurable: true });
    Object.defineProperty(def, 'cols', { get() { return applyCfg(kind, this.baseCols); }, set(v) { this.baseCols = v; }, configurable: true });
    def.__wcfg = true; return def;
  }
  const _sid = screenImportDef; screenImportDef = function (s) { return withCfg('cs_' + s.id, _sid(s)); };

  // template: required columns marked with *, plus an instructions sheet
  templateFor = function (kind) {
    const def = IMPORTS[kind]; const sp = specRows(kind);
    exportRows('قالب-' + (def.screen ? def.screen.name : def.title.replace(/^استيراد (إلى: )?/, '')), [def.cols.map(c => c[1] + (c[2] ? ' *' : ''))], 'البيانات', [['التعليمات', [['عنوان العمود', 'إلزامي', 'التنسيق', 'القيم المسموحة / مثال'], ...sp.map(r => [r.label + (r.req ? ' *' : ''), r.req ? 'نعم' : 'لا', r.fmt, r.ex]), [],
      ['ملاحظات'], ['• عبّئ ورقة «البيانات» فقط. الصف الأول عناوين، والأعمدة المعلّمة بـ * إلزامية. ترتيب الأعمدة غير مهم.'], ['• ' + (def.keyNote || 'إعادة رفع الملف لا تكرر السجلات الموجودة.')]]]]);
  };

  ACT['imp-cols'] = el => {
    const kind = el.dataset.k; if (kind.startsWith('cs_')) IMPORTS[kind] = screenImportDef(scr(kind.slice(3)));
    const def = IMPORTS[kind]; if (!def) return; const c = CFG(kind); const base = def.baseCols || def.cols;
    openModal('أعمدة ملف: ' + def.title.replace(/^استيراد /, ''), `<div class="note">حدّد الأعمدة الإلزامية واللي تطلع في القالب، وغيّر عنوان أي عمود ليطابق ملفاتكم. العمود الإلزامي أساسًا لا يمكن إلغاؤه.</div>
      <form id="impcolsf"><div class="tablewrap"><table><thead><tr><th>الحقل</th><th>إلزامي</th><th>في القالب</th><th>عنوان العمود في الملف</th></tr></thead><tbody>${base.map(([k, l, req]) => `<tr><td><b>${esc(l)}</b></td>
        <td>${req ? '<span class="badge b-bad">دائمًا</span>' : `<input type="checkbox" name="req_${k}" ${(c.req || {})[k] ? 'checked' : ''} aria-label="إلزامي">`}</td>
        <td>${req ? '<span class="small muted">دائمًا</span>' : `<input type="checkbox" name="tpl_${k}" ${(c.tpl || {})[k] === false ? '' : 'checked'} aria-label="في القالب">`}</td>
        <td><input name="lbl_${k}" value="${esc((c.label || {})[k] || '')}" placeholder="${esc(l)}" style="width:100%;min-width:140px"></td></tr>`).join('')}</tbody></table></div></form>`,
      `<button class="btn pri" data-act="imp-cols-save" data-k="${esc(kind)}">حفظ</button><button class="btn" data-act="imp-cols-reset" data-k="${esc(kind)}">استعادة الافتراضي</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
  };
  ACT['imp-cols-save'] = async el => {
    if (!canCfg()) return toast('تعديل إعداد الأعمدة يحتاج صلاحية محرر على الإعدادات', true);
    const kind = el.dataset.k, def = IMPORTS[kind], f = $('#impcolsf'); const req = {}, tpl = {}, label = {};
    (def.baseCols || def.cols).forEach(([k, , r]) => { if (!r) { if (f.elements['req_' + k]?.checked) req[k] = true; if (!f.elements['tpl_' + k]?.checked) tpl[k] = false; } const v = T(f.elements['lbl_' + k]?.value); if (v) label[k] = v; });
    await patch('settings', 'main', { importCols: { ...(SET().importCols || {}), [kind]: { req, tpl, label } } }); await audit('إعداد أعمدة الاستيراد', 'import', null, def.title); closeModal(); toast('تم حفظ إعداد الأعمدة');
  };
  ACT['imp-cols-reset'] = async el => {
    if (!canCfg()) return toast('تعديل إعداد الأعمدة يحتاج صلاحية محرر على الإعدادات', true);
    const m = { ...(SET().importCols || {}) }; delete m[el.dataset.k]; await patch('settings', 'main', { importCols: m }); closeModal(); toast('رجع الإعداد الافتراضي');
  };

  /* ---------- 2. preview shows new vs. update ---------- */
  const _rp = runPreview;
  runPreview = function () {
    _rp(); const rows = S.imp?.rows || []; if (!rows.length) return;
    const trs = document.querySelectorAll('#imp-preview tbody tr');
    rows.slice(0, 300).forEach((r, i) => { if (!r._err && r._upd) { const td = trs[i]?.lastElementChild; if (td) td.innerHTML = '<span style="color:var(--info,#1d4ed8)">تحديث سجل موجود</span>'; } });
    const nu = rows.filter(r => !r._err && r._upd).length, nn = rows.filter(r => !r._err && !r._upd).length;
    const bar = document.querySelector('#imp-preview .row'); if (bar && (nu || nn)) bar.insertAdjacentHTML('beforeend', `<span class="badge">${nn} جديد</span><span class="badge b-info">${nu} تحديث</span>`);
  };
  // column setup button inside the import dialog
  const _oi = openImport;
  openImport = function (kind) {
    const r = _oi(kind);
    setTimeout(() => { const b = document.querySelector('[data-act="imp-template"]'); if (b && canCfg() && !document.querySelector('[data-act="imp-cols"]')) b.insertAdjacentHTML('afterend', `<button class="btn" data-act="imp-cols" data-k="${esc(kind)}">${ic('cog')} أعمدة الملف</button>`); }, 0);
    return r;
  };

  /* ---------- 3. employees: existing employee number = update, never a second copy ---------- */
  const E = IMPORTS.employees;
  E.title = 'استيراد الموظفين وتحديثهم';
  E.note = 'الموظف الموجود برقمه الوظيفي تتحدّث بياناته من الملف (الخانات الفارغة لا تمسح شيئًا)، والجديد يُضاف. الإدارة والموقع بالرمز أو الاسم كما في الهيكل. اسم المستخدم وكلمة المرور اختياريان، ولا يُعاد تعيين كلمة مرور موظف له حساب.';
  E.keyNote = 'الموظف الموجود بنفس الرقم الوظيفي تتحدّث بياناته ولا يتكرر.';
  if (!E.cols.some(c => c[0] === 'section')) { const i = E.cols.findIndex(c => c[0] === 'dept'); E.cols.splice(i + 1, 0, ['section', 'القسم'], ['grade', 'المستوى الوظيفي']); }
  E.check = function (r, seen) {
    if (seen.has(r.empNo)) return 'الرقم الوظيفي مكرر في الملف';
    for (const [k, l] of [['dept', 'الإدارة'], ['section', 'القسم'], ['loc', 'الموقع']]) if (r[k] && !unitByCode(r[k])) return `${l} غير موجود في الهيكل: ${r[k]}`;
    const ex = empByNo(r.empNo); r._upd = !!ex;
    const ce = credRowCheck(r, seen); if (ce) return ce;
    seen.add(r.empNo);
  };
  const FIELD = { nameAr: 'nameAr', nameEn: 'nameEn', nationality: 'nationality', idNumber: 'idNumber', idExpiry: 'idExpiry', phone: 'phone', email: 'email', title: 'title', grade: 'grade', contractType: 'contractType', contractStart: 'contractStart', contractEnd: 'contractEnd', hireDate: 'hireDate' };
  E.commit = async function (rows, file) {
    const at = nowISO(); const ids = {};
    for (const r of rows) {
      const ex = empByNo(r.empNo); const o = {};
      for (const [k, f] of Object.entries(FIELD)) if (T(r[k]) !== '') o[f] = r[k];
      if (r.dept) o.deptId = unitByCode(r.dept); if (r.section) o.sectionId = unitByCode(r.section); if (r.loc) o.locationId = unitByCode(r.loc);
      if (ex) { ids[r.empNo] = ex.id; const ch = Object.entries(o).filter(([k, v]) => !sameJ(ex[k], v)); if (ch.length) { await patch('employees', ex.id, { ...o, updatedAt: at, importedById: S.meId }); await put('emphistory', newId(), { empId: ex.id, kind: 'data', field: 'استيراد', label: 'تحديث من Excel', old: null, new: ch.map(([k]) => k).join('، '), reason: 'استيراد ' + file, byId: S.meId, at }); } if (credOf(ex.id)) { r.username = ''; r.password = ''; } }
      else { const id = newId(); ids[r.empNo] = id; await put('employees', id, { empNo: r.empNo, ...o, joinDate: o.hireDate || null, status: 'active', roles: [], docs: [], createdAt: at, importedById: S.meId }); }
    }
    await sleep(300);
    for (const r of rows) { if (!r.mgrNo) continue; const m = empByNo(r.mgrNo)?.id || ids[r.mgrNo]; const cur = D.employees.map[ids[r.empNo]]; if (m && cur && cur.managerId !== m) await patch('employees', cur.id, { managerId: m }); }
    await sleep(300); await issueFromRows(rows, file);
  };

  /* ---------- 4. shipments: same bill of lading = update ---------- */
  const SH = IMPORTS.shipments;
  SH.keyNote = 'الشحنة الموجودة بنفس رقم البوليصة تتحدّث ولا تتكرر.';
  SH.note += ' الشحنة الموجودة بنفس رقم البوليصة تتحدّث بياناتها بدل ما تتكرر.';
  const _shCheck = SH.check, _shCommit = SH.commit;
  SH.check = function (r, seen) {
    const ex = r.blNo ? D.shipments.list.find(s => s.blNo === r.blNo) : null;
    if (r.blNo) { if (seen.has('bl:' + r.blNo)) return 'رقم البوليصة مكرر في الملف'; seen.add('bl:' + r.blNo); }
    if (ex) { r._upd = true; r._ex = ex.id; if (r.broker && !D.brokers.list.find(b => b.name === r.broker)) return 'المخلص غير موجود: ' + r.broker; if (Number.isNaN(r.invoiceValue) || Number.isNaN(r.containers)) return 'قيمة غير رقمية'; return; }
    return _shCheck.call(this, r, seen);
  };
  SH.commit = async function (rows, file) {
    const nw = rows.filter(r => !r._upd); if (nw.length) await _shCommit.call(this, nw, file);
    for (const r of rows.filter(r => r._upd)) { const cur = D.shipments.map[r._ex]; if (!cur) continue; const o = {};
      ['supplier', 'origin', 'poNo', 'goods', 'mode', 'port', 'currency', 'etd', 'eta'].forEach(k => { if (T(r[k]) !== '') o[k] = r[k]; });
      if (r.containers !== '') o.containers = r.containers; if (r.invoiceValue !== '') o.invoiceValue = r.invoiceValue; if (r.broker) o.brokerId = D.brokers.list.find(b => b.name === r.broker)?.id || cur.brokerId;
      await patch('shipments', cur.id, { ...o, updatedAt: nowISO() }); }
  };

  /* ---------- 5. custom screens: an identical record is not added again ---------- */
  const _sid2 = screenImportDef;
  screenImportDef = function (s) {
    const d = _sid2(s); const ck = d.check, cm = d.commit;
    d.note = 'كل صف يصبح سجلًا جديدًا، والصف المطابق تمامًا لسجل موجود يُتجاهل (لا تكرار). الحقول من نوع «موظف» تُكتب بالرقم الوظيفي.';
    const sig = data => recFields(s).filter(f => f.type !== 'section').map(f => { let v = data[f.key]; if (f.type === 'employee' && v && !emp(v)) v = empByNo(v)?.id || v; return T(Array.isArray(v) ? v.join(',') : v); }).join('|');
    d.check = function (r, seen) {
      const e = ck.call(this, r, seen); if (e) return e;
      const k = sig(r); if (seen.has('sig:' + k)) return 'صف مكرر في الملف'; seen.add('sig:' + k);
      if ((D.records?.list || []).some(x => x.screenId === s.id && sig(x.data || {}) === k)) return 'موجود مسبقًا بنفس البيانات';
    };
    return d;
  };

  /* ---------- 6. new imports: departments, job titles, leave balances, assets, lists ---------- */
  const UT = Object.entries(UNIT_TYPES);
  const unitType = v => { const n = nk(v); return (UT.find(([k, l]) => nk(k) === n || nk(l) === n) || [])[0] || (/اداره|قطاع/.test(n) ? 'dept' : /قسم/.test(n) ? 'section' : /موقع|فرع/.test(n) ? 'location' : /تكلفه/.test(n) ? 'costcenter' : null); };
  const unitKey = (type, name) => type + '|' + nk(name);
  IMPORTS.orgunits = {
    title: 'استيراد الإدارات والأقسام والمواقع', perm: 'settings.manage',
    note: 'الهيكل التنظيمي: كل صف وحدة (إدارة، قسم، موقع عمل، مركز تكلفة). الوحدة الموجودة بنفس الرمز (أو بنفس النوع والاسم) تتحدّث ولا تتكرر. «تتبع» تُكتب برمز أو اسم الوحدة الأم، ويمكن أن تكون في نفس الملف.',
    keyNote: 'الوحدة الموجودة بنفس الرمز أو بنفس النوع والاسم تتحدّث ولا تتكرر.',
    cols: [['type', 'النوع', 1], ['name', 'الاسم', 1], ['code', 'الرمز'], ['parent', 'تتبع'], ['mgrNo', 'الرقم الوظيفي للمدير']],
    find(r) { const t = unitType(r.type); return D.orgunits.list.find(u => r.code && u.code === r.code) || D.orgunits.list.find(u => u.type === t && nk(u.name) === nk(r.name)); },
    check(r, seen) {
      if (!unitType(r.type)) return 'نوع غير معروف — المسموح: ' + Object.values(UNIT_TYPES).join('، ');
      const k = r.code ? 'c:' + r.code : unitKey(unitType(r.type), r.name); if (seen.has(k)) return 'مكرر في الملف'; seen.add(k);
      if (r.mgrNo && !empByNo(r.mgrNo)) return 'المدير غير موجود: ' + r.mgrNo;
      const ex = this.find(r); r._upd = !!ex;
      if (r.code && ex && ex.code !== r.code && D.orgunits.list.some(u => u.code === r.code && u.id !== ex.id)) return 'الرمز مستخدم لوحدة أخرى';
    },
    async commit(rows) {
      const ids = {}; const at = nowISO();
      for (const r of rows) { const ex = this.find(r); const id = ex?.id || newId(); ids[r.code || r.name] = id; ids[r.name] = id;
        const o = { type: unitType(r.type), name: r.name }; if (r.code) o.code = r.code; if (r.mgrNo) o.managerId = empByNo(r.mgrNo).id;
        await put('orgunits', id, { ...(ex ? strip(ex) : {}), ...o, updatedAt: at }); }
      await sleep(300);
      for (const r of rows) { if (!r.parent) continue; const id = ids[r.code || r.name]; const p = ids[r.parent] || unitByCode(r.parent); const cur = D.orgunits.map[id]; if (cur && p && p !== id && cur.parentId !== p) await put('orgunits', id, { ...strip(cur), parentId: p }); }
    }
  };
  DEFAULT_LISTS.jobTitles = []; LIST_LABELS.jobTitles = 'المهن والمسميات الوظيفية';
  const jobs = () => SET().jobTitles || [];
  IMPORTS.jobTitles = {
    title: 'استيراد المهن والمسميات الوظيفية', perm: 'settings.manage',
    note: 'قائمة المهن تظهر كاختيارات في خانة «المسمى الوظيفي» بملف الموظف. المهنة الموجودة بنفس الرمز أو نفس الاسم تتحدّث ولا تتكرر.',
    keyNote: 'المهنة الموجودة بنفس الرمز أو نفس الاسم تتحدّث ولا تتكرر.',
    cols: [['name', 'المسمى الوظيفي / المهنة', 1], ['nameEn', 'المسمى بالإنجليزية'], ['code', 'الرمز'], ['iqama', 'المهنة في الإقامة'], ['grade', 'المستوى الوظيفي'], ['dept', 'الإدارة']],
    find(r) { return jobs().find(j => r.code && j.code === r.code) || jobs().find(j => nk(j.name) === nk(r.name)); },
    check(r, seen) { const k = r.code ? 'c:' + r.code : 'n:' + nk(r.name); if (seen.has(k)) return 'مكرر في الملف'; seen.add(k); if (r.dept && !unitByCode(r.dept)) return 'الإدارة غير موجودة في الهيكل: ' + r.dept; r._upd = !!this.find(r); },
    async commit(rows) {
      const list = jobs().map(j => ({ ...j }));
      for (const r of rows) { const o = { name: r.name }; ['nameEn', 'code', 'iqama', 'grade'].forEach(k => { if (T(r[k])) o[k] = r[k]; }); if (r.dept) o.deptId = unitByCode(r.dept);
        const i = list.findIndex(j => (r.code && j.code === r.code) || nk(j.name) === nk(r.name)); if (i >= 0) list[i] = { ...list[i], ...o }; else list.push({ id: newId(), ...o }); }
      const names = [...new Set(list.map(j => j.name))];
      await patch('settings', 'main', { jobTitles: list, lists: { ...(SET().lists || {}), jobTitles: names } });
    }
  };
  IMPORTS.leaveBalances = {
    title: 'استيراد أرصدة الإجازات', perm: 'leave.manage',
    note: 'لكل موظف ونوع إجازة: المستحق السنوي والمرحّل والتسوية. الرصيد الموجود لنفس الموظف ونفس النوع يُستبدل بقيم الملف (يُسجَّل التغيير في سجل الموظف).',
    keyNote: 'رصيد نفس الموظف ونفس نوع الإجازة يتحدّث ولا يتكرر.',
    cols: [['empNo', 'الرقم الوظيفي', 1], ['type', 'نوع الإجازة', 1], ['entitled', 'المستحق السنوي', 1, 'num'], ['carried', 'المرحّل', 0, 'num'], ['adjust', 'تسوية (+/−)', 0, 'num']],
    lt(v) { return D.leaveTypes.list.find(l => nk(l.name) === nk(v) || l.id === v); },
    check(r, seen) { const e = empByNo(r.empNo); if (!e) return 'رقم وظيفي غير موجود'; const l = this.lt(r.type); if (!l) return 'نوع إجازة غير معروف — المسموح: ' + D.leaveTypes.list.map(x => x.name).join('، ');
      for (const k of ['entitled', 'carried', 'adjust']) if (Number.isNaN(r[k])) return 'قيمة غير رقمية'; const k = e.id + '_' + l.id; if (seen.has(k)) return 'مكرر في الملف'; seen.add(k); r._upd = !!D.leaveBalances.map[k]; },
    async commit(rows, file) { const at = nowISO();
      for (const r of rows) { const e = empByNo(r.empNo), l = this.lt(r.type), id = e.id + '_' + l.id, cur = D.leaveBalances.map[id] || {};
        const n = { empId: e.id, typeId: l.id, entitled: +r.entitled || 0, carried: r.carried === '' ? (cur.carried || 0) : +r.carried, adjust: r.adjust === '' ? (cur.adjust || 0) : +r.adjust, year: new Date().getFullYear(), updatedAt: at };
        if (cur.entitled === n.entitled && (cur.carried || 0) === n.carried && (cur.adjust || 0) === n.adjust) continue;
        await put('leaveBalances', id, n); await put('emphistory', newId(), { empId: e.id, kind: 'data', field: 'رصيد ' + l.name, label: 'رصيد ' + l.name, old: `${cur.entitled ?? l.annualDays}/${cur.carried || 0}/${cur.adjust || 0}`, new: `${n.entitled}/${n.carried}/${n.adjust}`, reason: 'استيراد ' + file, byId: S.meId, at }); } }
  };
  IMPORTS.assets = {
    title: 'استيراد الأصول والعهد', perm: 'assets.manage',
    note: 'سجل الأصول (جوالات، حاسبات، سيارات، أدوات…). الأصل الموجود بنفس الرمز أو نفس الرقم التسلسلي يتحدّث ولا يتكرر. تسليم العهدة للموظف يتم من شاشة الشؤون الإدارية.',
    keyNote: 'الأصل الموجود بنفس الرمز أو الرقم التسلسلي يتحدّث ولا يتكرر.',
    cols: [['name', 'اسم الأصل', 1], ['category', 'الفئة', 1], ['code', 'رمز الأصل'], ['serial', 'الرقم التسلسلي / اللوحة'], ['value', 'القيمة التقديرية', 0, 'num'], ['notes', 'ملاحظات']],
    find(r) { return D.assets.list.find(a => r.code && a.code === r.code) || D.assets.list.find(a => r.serial && a.serial && nk(a.serial) === nk(r.serial)); },
    check(r, seen) { if (!LIST('assetCategories').some(c => nk(c) === nk(r.category))) return 'فئة غير موجودة — المسموح: ' + LIST('assetCategories').join('، '); if (Number.isNaN(r.value)) return 'قيمة غير رقمية';
      const k = r.code || r.serial; if (k) { if (seen.has(k)) return 'مكرر في الملف'; seen.add(k); } r._upd = !!this.find(r); },
    async commit(rows) { const at = nowISO();
      for (const r of rows) { const ex = this.find(r); const o = { name: r.name, category: LIST('assetCategories').find(c => nk(c) === nk(r.category)) }; if (r.serial) o.serial = r.serial; if (r.value !== '') o.value = +r.value; if (r.notes) o.notes = r.notes;
        if (ex) await put('assets', ex.id, { ...strip(ex), ...o, updatedAt: at });
        else await put('assets', newId(), { status: 'available', holderId: null, ...o, code: r.code || await nextRef('AST'), updatedAt: at }); } }
  };
  IMPORTS.lists = {
    title: 'استيراد القوائم (الجنسيات، أنواع العقود، فئات العهد…)', perm: 'settings.manage',
    note: 'كل صف قيمة داخل قائمة من قوائم النظام. القيمة الموجودة في نفس القائمة لا تتكرر.',
    keyNote: 'القيمة الموجودة في نفس القائمة لا تتكرر.',
    cols: [['list', 'اسم القائمة', 1], ['value', 'القيمة', 1]],
    key(v) { const n = nk(v); return Object.keys(LIST_LABELS).find(k => nk(k) === n || nk(LIST_LABELS[k]) === n); },
    check(r, seen) { const k = this.key(r.list); if (!k) return 'قائمة غير معروفة — المسموح: ' + Object.values(LIST_LABELS).join('، '); const s = k + '|' + nk(r.value); if (seen.has(s)) return 'مكرر في الملف'; seen.add(s); if (LIST(k).some(x => nk(x) === nk(r.value))) return 'موجودة مسبقًا في القائمة'; },
    async commit(rows) { const L2 = { ...(SET().lists || {}) }; for (const r of rows) { const k = this.key(r.list); L2[k] = [...(L2[k]?.length ? L2[k] : LIST(k))]; L2[k].push(r.value); } await patch('settings', 'main', { lists: L2 }); }
  };
  IMPORTS.attendance.keyNote = 'حركة نفس الموظف في نفس اليوم تُستبدل ولا تتكرر.';
  IMPORTS.salaries.keyNote = 'الموظف اللي له أجر مسجل يُتخطى، وتعديله بطلب تغيير مالي معتمد.';
  if (IMPORTS.accounts) IMPORTS.accounts.keyNote = 'الموظف اللي له حساب دخول يُتخطى.';
  const _colSpec2 = colSpec;
  colSpec = function (kind, c) {
    const s = _colSpec2(kind, c);
    if (kind === 'orgunits' && c[0] === 'type') { s.fmt = 'قيمة من قائمة'; s.ex = Object.values(UNIT_TYPES).join('، '); }
    if (kind === 'orgunits' && c[0] === 'parent') { s.fmt = 'رمز أو اسم الوحدة الأم'; s.ex = 'مثل: الموارد البشرية'; }
    if ((kind === 'jobTitles' && c[0] === 'dept') || (kind === 'employees' && c[0] === 'section')) { s.fmt = 'رمز أو اسم من الهيكل'; s.ex = D.orgunits.list.filter(u => u.type === (c[0] === 'section' ? 'section' : 'dept')).map(u => u.code || u.name).slice(0, 8).join('، ') || 'أضف الهيكل أولًا'; }
    if (kind === 'employees' && c[0] === 'title' && jobs().length) { s.fmt = 'مسمى من قائمة المهن (أو نص)'; s.ex = jobs().map(j => j.name).slice(0, 8).join('، '); }
    if (kind === 'leaveBalances' && c[0] === 'type') { s.fmt = 'اسم نوع الإجازة'; s.ex = D.leaveTypes.list.map(x => x.name).join('، '); }
    if (kind === 'assets' && c[0] === 'category') { s.fmt = 'قيمة من قائمة'; s.ex = LIST('assetCategories').join('، '); }
    if (kind === 'lists' && c[0] === 'list') { s.fmt = 'اسم القائمة'; s.ex = Object.values(LIST_LABELS).join('، '); }
    return s;
  };
  Object.assign(IMPORT_ROLES, { orgunits: 'مدير الموارد البشرية أو مدير النظام (محرر على الإعدادات)', jobTitles: 'مدير الموارد البشرية أو مدير النظام (محرر على الإعدادات)', leaveBalances: 'مسؤول شؤون العاملين (إدارة الحضور والإجازات)', assets: 'مسؤول الشؤون الإدارية', lists: 'مدير النظام (محرر على الإعدادات)' });
  Object.keys(IMPORTS).forEach(k => withCfg(k, IMPORTS[k]));

  /* hub: order + "file columns" button on every card */
  const ORDER = ['orgunits', 'jobTitles', 'employees', 'accounts', 'attendance', 'leaveBalances', 'salaries', 'assets', 'shipments', 'lists'];
  VIEWS.imports = () => pageHead('الاستيراد من Excel', 'نزّل القالب، عبّئه، ثم ارفعه. تظهر لك معاينة لكل صف قبل الحفظ (جديد أو تحديث)، ولا يُحفظ أي صف فيه خطأ، وإعادة رفع الملف تحدّث البيانات بدون تكرار.') +
    `<div class="grid g2">${importKinds().sort((a, b) => (ORDER.indexOf(a.k) + 1 || 99) - (ORDER.indexOf(b.k) + 1 || 99)).map(x => `<section class="card"><h2>${esc(x.def.title.replace(/^استيراد /, ''))} ${x.ok ? badge('approved', 'متاح لك') : badge('cancelled', 'غير متاح لدورك')}</h2><p class="small" style="margin:0 0 6px">${esc(x.def.note || '')}</p>${IMPORTS[x.k]?.keyNote ? `<p class="small muted" style="margin:0 0 10px">${esc(IMPORTS[x.k].keyNote)}</p>` : ''}
      <div class="row" style="gap:6px">${x.ok ? `<button class="btn pri" data-act="import" data-k="${x.k}">${ic('up')} بدء الاستيراد</button><button class="btn" data-act="impfmt-tpl" data-k="${x.k}">${ic('down')} القالب</button>${canCfg() ? `<button class="btn" data-act="imp-cols" data-k="${x.k}">${ic('cog')} أعمدة الملف</button>` : ''}` : `<div class="small muted">يتطلب دور: ${esc(x.who)}. اطلب من مدير النظام إضافته لك.</div>`}</div></section>`).join('')}</div>
    <p class="small muted" style="margin-top:14px">الصيغ المقبولة: ‎.xlsx و‎.xls و‎.csv. الأعمدة المعلّمة بـ * في القالب إلزامية، وترتيبها غير مهم، ويمكنك تحديد صف العناوين والورقة عند الرفع.</p>`;
  ACT['impfmt-tpl'] = el => { const k = el.dataset.k; if (k.startsWith('cs_')) IMPORTS[k] = screenImportDef(scr(k.slice(3))); templateFor(k); };
  // settings → import formats: also list the new types
  const _fmt = impFmtHtml;
  impFmtHtml = function () { const h = _fmt(); return canCfg() ? h.replace(/(<button class="btn sm" data-act="impfmt-tpl" data-k="([^"]+)">[\s\S]*?<\/button>)/g, (m, b, k) => b + `<button class="btn sm" data-act="imp-cols" data-k="${k}">أعمدة الملف</button>`) : h; };

  /* employee form: job title suggestions from the jobs list */
  new MutationObserver(() => {
    const inp = document.querySelector('input#f-title:not([list])'); if (!inp || !jobs().length) return;
    let dl = document.getElementById('wady-jobs'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'wady-jobs'; document.body.appendChild(dl); }
    dl.innerHTML = jobs().map(j => `<option value="${esc(j.name)}">`).join(''); inp.setAttribute('list', 'wady-jobs');
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
