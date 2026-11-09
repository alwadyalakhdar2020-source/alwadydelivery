'use strict';
/* ============ Custom fields on existing screens ============ */
const cfDefs = entity => ((SET().customFields || {})[entity] || []);
function cfForm(entity, obj) {
  const defs = cfDefs(entity); if (!defs.length) return '';
  const vals = obj?.custom || {};
  return `<div class="full small muted" style="border-top:1px dashed var(--line);padding-top:8px">بيانات إضافية</div>${defs.map(f => f.type === 'section' ? `<div class="full small muted"><b>${esc(f.label)}</b></div>` : reqFieldHtml(f, vals[f.key], 'cf_')).join('')}`;
}
function cfView(entity, obj) {
  const defs = cfDefs(entity).filter(f => f.type !== 'section'); if (!defs.length) return '';
  return defs.map(f => `<dt>${esc(f.label)}</dt><dd>${esc(fieldDisplay(f, obj?.custom?.[f.key]))}</dd>`).join('');
}
const cfCols = entity => cfDefs(entity).filter(f => f.type !== 'section' && f.inTable !== false).slice(0, 4).map(f => ({ k: 'cf_' + f.key, l: f.label, s: x => x.custom?.[f.key] ?? '', v: x => esc(fieldDisplay(f, x.custom?.[f.key])) }));

/* ============ Lookup lists (القوائم) ============ */
const LIST_LABELS = { contractTypes: 'أنواع العقود', idTypes: 'أنواع الهوية', maritalStatus: 'الحالة الاجتماعية', empDocKinds: 'أنواع مستندات الموظف', exitTypes: 'أسباب إنهاء الخدمة', assetCategories: 'فئات الأصول والعهد', shipModes: 'طرق الشحن', currencies: 'العملات', shipCostTypes: 'بنود تكاليف التخليص', commChannels: 'وسائل التواصل مع المخلص', candSources: 'مصادر المرشحين' };

/* ============ Custom screens ============ */
const screens = () => SET().customScreens || [];
const scr = id => screens().find(s => s.id === id);
function canViewScreen(s) { if (!s) return false; if (hasRole('sysadmin')) return true; return !s.viewRoles?.length || s.viewRoles.some(r => hasRole(r)); }
function canEditScreen(s) { if (!s) return false; if (hasRole('sysadmin')) return true; const r = s.editRoles?.length ? s.editRoles : s.viewRoles; return !r?.length || r.some(x => hasRole(x)); }
const recFields = s => (s.fields || []).filter(f => f.type !== 'section');
VIEWS.cs = () => {
  const s = scr(S.params.id); if (!s) return empty('الشاشة غير موجودة أو حُذفت');
  if (!canViewScreen(s)) return empty('لا تملك صلاحية عرض هذه الشاشة');
  const ed = canEditScreen(s); const rows = D.records.list.filter(r => r.screenId === s.id).sort(by('createdAt', -1));
  const cols = [{ k: 'ref', l: 'الرقم', v: r => `<b class="num">${esc(r.ref)}</b>` }, ...recFields(s).filter(f => f.inTable !== false).slice(0, 7).map(f => ({ k: 'd_' + f.key, l: f.label, s: r => r.data?.[f.key] ?? '', v: r => esc(fieldDisplay(f, r.data?.[f.key])), txt: r => String(fieldDisplay(f, r.data?.[f.key])) })), { k: 'createdAt', l: 'تاريخ الإدخال', v: r => `<span class="num">${fmtD(r.createdAt)}</span>` }, { k: 'by', l: 'أدخله', s: r => empName(r.createdById), v: r => esc(empName(r.createdById)) }];
  return pageHead(s.name, esc(s.description || ''), `${ed ? `<button class="btn" data-act="import" data-k="cs_${s.id}">${ic('up')} استيراد Excel</button>` : ''}<button class="btn" data-act="cs-export" data-id="${s.id}">${ic('down')} تصدير Excel</button>${ed ? `<button class="btn pri" data-act="rec-edit" data-s="${s.id}">${ic('plus')} إضافة</button>` : ''}${hasRole('sysadmin') ? `<button class="btn ghost" data-act="cs-design" data-id="${s.id}">${ic('cog')} تصميم الشاشة</button>` : ''}`) +
    dataTable('cs-' + s.id, cols, rows, { rowAct: 'open-rec', empty: ed ? 'لا توجد سجلات بعد. اضغط «إضافة» لإدخال أول سجل.' : 'لا توجد سجلات' });
};
ACT['cs-design'] = el => openDesigner('screen', el.dataset.id);
ACT['open-rec'] = el => {
  const r = D.records.map[el.dataset.id]; const s = scr(r?.screenId); if (!r || !canViewScreen(s)) return;
  const ed = canEditScreen(s);
  openModal(`${s.name} — ${r.ref}`, `<dl class="dl">${(s.fields || []).map(f => f.type === 'section' ? `<dt style="grid-column:1/-1;color:var(--ink);font-weight:700;border-top:1px solid var(--line);padding-top:6px">${esc(f.label)}</dt>` : `<dt>${esc(f.label)}</dt><dd>${esc(fieldDisplay(f, r.data?.[f.key]))}</dd>`).join('')}<dt>تاريخ الإدخال</dt><dd class="num">${fmtDT(r.createdAt)} — ${esc(empName(r.createdById))}</dd>${r.updatedAt ? `<dt>آخر تعديل</dt><dd class="num">${fmtDT(r.updatedAt)} — ${esc(empName(r.updatedById))}</dd>` : ''}</dl>${(r.files || []).length ? `<div class="list">${r.files.map(f => `<div>${fileLink(f)}</div>`).join('')}</div>` : ''}`,
    `${ed ? `<button class="btn pri" data-act="rec-edit" data-s="${s.id}" data-id="${r.id}">تعديل</button><button class="btn danger" data-act="rec-del" data-id="${r.id}">حذف</button>` : ''}<button class="btn" data-act="close-modal">إغلاق</button>`);
};
ACT['rec-edit'] = el => {
  const s = scr(el.dataset.s); const r = el.dataset.id ? D.records.map[el.dataset.id] : null; if (!canEditScreen(s)) return toast('لا تملك صلاحية الإدخال في هذه الشاشة', true);
  openModal(r ? `تعديل ${r.ref}` : `إضافة — ${s.name}`, `<form class="form" id="recf" data-form="rec" data-s="${s.id}" ${r ? `data-id="${r.id}"` : ''}>${(s.fields || []).map(f => f.type === 'section' ? `<div class="full" style="font-weight:700;border-bottom:1px solid var(--line);padding-bottom:4px">${esc(f.label)}</div>` : reqFieldHtml(f, r?.data?.[f.key], 'r_')).join('') || empty('لا توجد حقول. صمّم الشاشة أولًا.')}${fld('files', 'مرفقات', { type: 'file', multiple: true, full: true })}</form>`, `<button class="btn pri" form="recf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
};
FORM.rec = async f => {
  const s = scr(f.dataset.s); const id = f.dataset.id; const raw = readForm(f); const data = {};
  for (const [k, v] of Object.entries(raw)) if (k.startsWith('r_')) data[k.slice(2)] = v;
  const errs = validateFields(s.fields, data); if (errs.length) return toast(errs.join(' — '), true);
  const files = await uploadFiles(f.elements.files); const at = nowISO();
  if (id) { const cur = D.records.map[id]; await put('records', id, { ...strip(cur), data, files: [...(cur.files || []), ...files], updatedAt: at, updatedById: S.meId }); await audit('تعديل سجل: ' + s.name, 'record', id, cur.ref); }
  else { const rid = newId(); const ref = await nextRef(s.prefix || 'REC'); await put('records', rid, { screenId: s.id, ref, data, files, createdAt: at, createdById: S.meId }); await audit('إضافة سجل: ' + s.name, 'record', rid, ref); }
  closeModal(); toast('تم الحفظ');
};
ACT['rec-del'] = el => confirmBox('حذف هذا السجل نهائيًا؟ يبقى أثر الحذف في سجل التدقيق.', async () => { const r = D.records.map[el.dataset.id]; await remove('records', r.id); await audit('حذف سجل', 'record', r.id, `${r.ref} ${JSON.stringify(r.data).slice(0, 200)}`); toast('حُذف السجل'); }, 'حذف');
ACT['cs-export'] = el => { const s = scr(el.dataset.id); const fs = recFields(s); exportRows(`${s.name}-${todayISO()}`, [['الرقم', ...fs.map(f => f.label), 'تاريخ الإدخال', 'أدخله'], ...D.records.list.filter(r => r.screenId === s.id).map(r => [r.ref, ...fs.map(f => fieldDisplay(f, r.data?.[f.key])), fmtD(r.createdAt), empName(r.createdById)])], s.name); };
ACT['cs-del'] = el => { const s = scr(el.dataset.id); const n = D.records.list.filter(r => r.screenId === s.id).length; confirmBox(`حذف شاشة «${esc(s.name)}» من القائمة؟ ${n ? `سجلاتها (${n}) تبقى محفوظة ويمكن استعادتها بإنشاء شاشة بنفس الرمز.` : ''}`, async () => { await patch('settings', 'main', { customScreens: screens().filter(x => x.id !== s.id) }); await audit('حذف شاشة مخصصة', 'settings', s.id, s.name); toast('حُذفت الشاشة'); }, 'حذف الشاشة'); };
// dynamic Excel import for custom screens
function screenImportDef(s) {
  const typeOf = f => f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : f.type === 'number' ? 'num' : '';
  return { title: 'استيراد إلى: ' + s.name, perm: null, screen: s, note: 'كل صف يصبح سجلًا جديدًا. الحقول من نوع «موظف» تُكتب بالرقم الوظيفي.', cols: recFields(s).map(f => [f.key, f.label, f.required ? 1 : 0, typeOf(f)]),
    check(r) { for (const f of recFields(s)) { if (f.type === 'employee' && r[f.key]) { const e = empByNo(r[f.key]); if (!e) return 'رقم وظيفي غير موجود: ' + r[f.key]; } if (['select', 'radio'].includes(f.type) && r[f.key] && !optList(f).includes(r[f.key])) return `قيمة غير موجودة في خيارات «${f.label}»: ${r[f.key]}`; if (Number.isNaN(r[f.key])) return `«${f.label}» قيمة غير رقمية`; } },
    async commit(rows, file) { const at = nowISO(); for (const r of rows) { const data = {}; recFields(s).forEach(f => { let v = r[f.key]; if (f.type === 'employee' && v) v = empByNo(v).id; if (f.type === 'checks') v = String(v || '').split(/[،,]/).map(x => x.trim()).filter(Boolean); if (f.type === 'checkbox') v = ['نعم', '1', 'true', 'yes'].includes(String(v).trim().toLowerCase()); data[f.key] = v; }); await put('records', newId(), { screenId: s.id, ref: await nextRef(s.prefix || 'REC'), data, files: [], createdAt: at, createdById: S.meId, source: 'استيراد ' + file }); } } };
}
const _openImport = openImport;
openImport = function (kind) {
  if (kind.startsWith('cs_')) { const s = scr(kind.slice(3)); if (!s || !canEditScreen(s)) return toast('لا تملك صلاحية الاستيراد لهذه الشاشة', true); IMPORTS[kind] = screenImportDef(s); IMPORTS[kind].perm = null; }
  return _openImport(kind);
};

/* ============ Import hub (مركز الاستيراد) ============ */
const IMPORT_ROLES = { employees: 'مسؤول شؤون العاملين أو مدير الموارد البشرية', attendance: 'مسؤول شؤون العاملين أو مدير الموارد البشرية', salaries: 'مسؤول الرواتب والمالية', shipments: 'مسؤول المشتريات والتخليص أو مدير النظام' };
function importKinds() { return [...Object.keys(IMPORT_ROLES).map(k => ({ k, def: IMPORTS[k], ok: can(IMPORTS[k].perm), who: IMPORT_ROLES[k] })), ...screens().filter(canViewScreen).map(s => ({ k: 'cs_' + s.id, def: { title: 'شاشة: ' + s.name, note: s.description || 'سجلات الشاشة المخصصة' }, ok: canEditScreen(s), who: 'من له صلاحية الإدخال في الشاشة' }))]; }
const canAnyImport = () => importKinds().some(x => x.ok);
VIEWS.imports = () => pageHead('الاستيراد من Excel', 'نزّل القالب، عبّئه، ثم ارفعه. تظهر لك معاينة لكل صف قبل الحفظ، ولا يُحفظ أي صف فيه خطأ.') +
  `<div class="grid g2">${importKinds().map(x => `<section class="card"><h2>${esc(x.def.title.replace(/^استيراد /, ''))} ${x.ok ? badge('approved', 'متاح لك') : badge('cancelled', 'غير متاح لدورك')}</h2><p class="small" style="margin:0 0 10px">${esc(x.def.note || '')}</p>${x.ok ? `<button class="btn pri" data-act="import" data-k="${x.k}">${ic('up')} بدء الاستيراد</button>` : `<div class="small muted">يتطلب دور: ${esc(x.who)}. اطلب من مدير النظام إضافته لك من الإعدادات ← المستخدمون والأدوار.</div>`}</section>`).join('')}</div>
  <p class="small muted" style="margin-top:14px">الصيغ المقبولة: ‎.xlsx و‎.xls و‎.csv. الصف الأول في الملف عناوين الأعمدة كما في القالب، وترتيبها غير مهم.</p>`;

/* ============ Settings tabs: custom fields, screens, lists ============ */
function cfSettingsHtml() {
  return `<div class="note" style="margin-bottom:10px">أضف بنودًا جديدة لشاشات النظام الحالية بدون برمجة. الحقل المضاف يظهر في نموذج الإدخال وصفحة العرض، ويُحفظ مع السجل.</div>` +
    `<div class="tablewrap"><table><thead><tr><th>الشاشة</th><th>الحقول الإضافية</th><th></th></tr></thead><tbody>${Object.entries(CF_ENTITIES).map(([k, l]) => `<tr><td><b>${esc(l)}</b></td><td>${cfDefs(k).filter(f => f.type !== 'section').map(f => `<span class="tag">${esc(f.label)}</span>`).join('') || '<span class="muted small">لا يوجد</span>'}</td><td><button class="btn sm" data-act="cf-design" data-k="${k}">${ic('plus')} إضافة / تعديل البنود</button></td></tr>`).join('')}</tbody></table></div>` +
    `<p class="small muted" style="margin-top:10px">لإضافة حقول لطلب أو نموذج إلكتروني استخدم «تصميم النموذج» من تبويب أنواع الطلبات. ولإضافة شاشة كاملة جديدة استخدم تبويب «شاشات جديدة».</p>`;
}
ACT['cf-design'] = el => openDesigner('fields', el.dataset.k);
function screensSettingsHtml() {
  return `<div class="note" style="margin-bottom:10px">أنشئ شاشة جديدة كاملة بحقولها، وتظهر في القائمة الجانبية لمن تحددهم، مع الإضافة والتعديل والتصدير والاستيراد من Excel.</div>
  <section class="card" style="margin-bottom:14px"><h2>ابدأ من الصفر أو من قالب جاهز</h2><div class="set-grid"><button class="set-card" data-act="cs-new"><span class="sic">${ic('plus')}</span><span><b>شاشة فارغة</b><small>صمّم الحقول بنفسك</small></span></button>${SCREEN_TEMPLATES.map((t, i) => `<button class="set-card" data-act="cs-tpl" data-i="${i}"><span class="sic">${ic(t.icon)}</span><span><b>${esc(t.name)}</b><small>${esc(t.description)}</small></span></button>`).join('')}</div></section>
  <h2 style="font-size:16px;margin-bottom:8px">الشاشات الحالية</h2>` +
    dataTable('screens', [{ k: 'name', l: 'الشاشة', v: s => `<b>${esc(s.name)}</b><div class="small muted">${esc(s.group || '')}</div>` }, { k: 'fields', l: 'الحقول', s: s => recFields(s).length, v: s => `<span class="num">${recFields(s).length}</span>` }, { k: 'recs', l: 'السجلات', s: s => D.records.list.filter(r => r.screenId === s.id).length, v: s => `<span class="num">${D.records.list.filter(r => r.screenId === s.id).length}</span>` }, { k: 'who', l: 'يراها', nosort: true, v: s => s.viewRoles?.length ? s.viewRoles.map(r => `<span class="tag">${esc(ROLES[r])}</span>`).join('') : 'كل الموظفين' }, { k: 'x', l: '', nosort: true, v: s => `<div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm" data-act="go" data-v="cs" data-id="${s.id}">فتح</button><button class="btn sm" data-act="cs-design" data-id="${s.id}">تصميم</button><button class="btn sm ghost danger" data-act="cs-del" data-id="${s.id}">حذف</button></div>` }], screens(), { search: false, tools: `<button class="btn sm pri" data-act="cs-new">${ic('plus')} شاشة جديدة</button>` });
}
ACT['cs-new'] = () => openDesigner('screen');
function listsSettingsHtml() {
  return `<div class="note" style="margin-bottom:10px">القوائم المنسدلة المستخدمة في الشاشات. أضف بندًا جديدًا في سطر مستقل. حذف بند لا يغيّر السجلات القديمة التي استخدمته.</div><form data-form="lists" class="grid g3">${Object.entries(LIST_LABELS).map(([k, l]) => `<div class="card fld"><label for="lst-${k}"><b>${esc(l)}</b></label><textarea id="lst-${k}" name="${k}" rows="6">${esc(LIST(k).join('\n'))}</textarea></div>`).join('')}<div><button class="btn pri">حفظ القوائم</button></div></form>`;
}
FORM.lists = async f => {
  const v = readForm(f); const lists = {}; for (const k of Object.keys(LIST_LABELS)) { const arr = uniq(String(v[k] || '').split('\n').map(s => s.trim()).filter(Boolean)); if (!arr.length) return toast(`قائمة «${LIST_LABELS[k]}» لا تكون فارغة`, true); lists[k] = arr; }
  await patch('settings', 'main', { lists }); await audit('تعديل القوائم', 'settings', 'lists', ''); toast('حُفظت القوائم');
};
