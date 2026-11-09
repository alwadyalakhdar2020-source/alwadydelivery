'use strict';
/* ============ Phase 1 — identity, data scope, server protection, self-test, backup ============ */
const FIN_LOCK_MSG = 'البيانات المالية (الأجور والسلف والتسويات) والبيانات النظامية الحساسة محمية على الخادم، وتظهر فقط لمن صلاحيته في مشاركة المنصة «محرر».';
const needsAdminSection = k => ['general', 'org', 'users', 'roles', 'matrix', 'deleg', 'flows', 'types', 'tpl', 'leaves', 'holidays', 'checklist', 'screens', 'cfields', 'lists', 'impfmt', 'links', 'scopes', 'integ', 'portal'].includes(k);
const stableJ = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v);
const activeEmpList = () => D.employees.list.filter(e => e.status !== 'terminated');

/* ---------- identity: each claude.ai account is bound to exactly one employee file ---------- */
function resolveIdentity() {
  const mine = S.uid ? D.employees.list.find(e => e.userId === S.uid && e.status !== 'terminated') : null;
  const id = mine?.id || null;
  if (id !== S.meId) {
    S.meId = id; S.escalated = false;
    if (id && !S.loginLogged) { S.loginLogged = true; audit('تسجيل دخول', 'session', id, empName(id)); }
  }
}
ACT['my-profile'] = () => go('employee', { id: S.meId });
function pname(uid) { const n = S.pnames?.[uid]; if (n === undefined) ensureNames([uid]); return n || ''; }
function ensureNames(ids) {
  S.pnames = S.pnames || {}; const miss = uniq(ids.filter(x => x && S.pnames[x] === undefined)); if (!miss.length || !S.user?.profiles) return;
  miss.forEach(x => S.pnames[x] = '');
  S.user.profiles(miss).then(ps => { let ch = false; for (const x of miss) { const n = ps?.[x]?.name || ''; if (n) { S.pnames[x] = n; ch = true; } } if (ch) scheduleViewRender(); }).catch(() => { });
}
function scheduleViewRender() { if (S.vq) return; S.vq = true; requestAnimationFrame(() => { S.vq = false; if (S.meId && $('#view')) renderView(); else renderAll(); }); }

function renderUnlinked() {
  shellFor = null; closeModal();
  const anyLinked = D.employees.list.some(e => e.userId); const req = S.uid ? RAW.linkreqs.map[S.uid] : null; const me = S.uid ? pname(S.uid) : '';
  let body;
  if (!S.uid) body = `<div class="note warn">تعذر التعرف على حسابك في Claude. سجّل الدخول بحسابك ثم أعد فتح المنصة.</div>`;
  else if (!anyLinked && S.adminLvl) body = `<p class="small">لا يوجد أي حساب مربوط بملف موظف بعد. بصفتك مالكًا أو محررًا للمنصة، اربط حسابك بملف مدير النظام لتبدأ. بعدها يُربط كل موظف بحسابه من الإعدادات.</p>
    <form class="form" data-form="link-boot">${fld('empId', 'ملف الموظف', { type: 'select', required: true, options: activeEmpList().sort(by('empNo')).map(e => [e.id, `${e.nameAr} — ${e.empNo}${(e.roles || []).includes('sysadmin') ? ' — مدير النظام' : ''}`]), full: true })}<div class="fld full"><button class="btn pri">ربط حسابي بهذا الملف</button></div></form>
    <details class="small" style="margin-top:10px"><summary>ملفي غير موجود — أنشئ ملف مدير نظام جديد لي</summary><form class="form" data-form="link-boot-new" style="margin-top:8px">${fld('empNo', 'الرقم الوظيفي', { required: true })}${fld('nameAr', 'الاسم', { required: true })}<div class="fld full"><button class="btn">إنشاء وربط</button></div></form></details>`;
  else if (req) body = `<div class="note">${req.status === 'rejected' ? `رُفض طلب الربط${req.reason ? ': ' + esc(req.reason) : ''}. تواصل مع الموارد البشرية أو أرسل طلبًا جديدًا.` : `أُرسل طلب ربط حسابك بالرقم الوظيفي <b class="num">${esc(req.empNo)}</b> بتاريخ ${fmtD(req.at)}. سيصلك الدخول تلقائيًا بعد اعتماده من مدير النظام.`}</div>${req.status === 'rejected' ? linkReqForm() : ''}`;
  else body = `<p class="small">حسابك${me ? ` (<b>${esc(me)}</b>)` : ''} غير مربوط بملف موظف بعد. أدخل رقمك الوظيفي ليتحقق منه مدير النظام ويربطه بملفك. لا يمكن الدخول بهوية موظف آخر.</p>${linkReqForm()}`;
  $('#root').innerHTML = `<div class="login"><div class="card"><div class="row" style="justify-content:flex-end;margin-bottom:-8px">${langBtn()}</div><div class="brand" style="border:0;padding:0;margin:0">${brandMark()}<div><b>${esc(SET().company || 'منصة الموارد البشرية')}</b><span class="muted">الموارد البشرية والشؤون الإدارية</span></div></div><h1>الدخول إلى المنصة</h1>${body}</div></div>`;
}
const linkReqForm = () => `<form class="form" data-form="link-req">${fld('empNo', 'الرقم الوظيفي', { required: true })}${fld('note', 'ملاحظة لمدير النظام (اختياري)', { full: true })}<div class="fld full"><button class="btn pri">إرسال طلب الربط</button></div></form>`;
FORM['link-boot'] = async f => {
  const e = emp(f.elements.empId.value); if (!e) return;
  if (D.employees.list.some(x => x.userId)) return toast('تم ربط حساب آخر بالفعل. اطلب الربط من مدير النظام.', true);
  const roles = uniq([...(e.roles || []), 'sysadmin']);
  await put('employees', e.id, { ...strip(e), roles, userId: S.uid, updatedAt: nowISO() });
  await audit('ربط أول حساب بمدير النظام', 'employee', e.id, e.nameAr); toast('تم الربط'); renderAll(true);
};
FORM['link-boot-new'] = async f => {
  const v = readForm(f); if (D.employees.list.some(x => x.empNo === v.empNo)) return toast('الرقم الوظيفي مستخدم', true);
  const id = newId(); await put('employees', id, { empNo: v.empNo, nameAr: v.nameAr, status: 'active', roles: ['sysadmin'], userId: S.uid, docs: [], createdAt: nowISO() });
  await audit('إنشاء ملف مدير نظام وربطه', 'employee', id, v.nameAr); toast('تم الإنشاء والربط'); renderAll(true);
};
FORM['link-req'] = async f => {
  const v = readForm(f); const at = nowISO();
  await rawPut('linkreqs', S.uid, { uid: S.uid, empNo: String(v.empNo).trim(), note: v.note || '', at, status: 'pending' });
  await notify(D.employees.list.filter(e => e.status !== 'terminated' && rolesOf(e).has('sysadmin')).map(e => e.id), 'طلب ربط حساب بملف موظف', `الرقم الوظيفي ${v.empNo}`, { view: 'settings' });
  await audit('طلب ربط حساب', 'linkreq', S.uid, 'الرقم الوظيفي ' + v.empNo); toast('أُرسل الطلب'); renderAll(true);
};

/* ---- settings: account links ---- */
function linksHtml() {
  const reqs = RAW.linkreqs.list.filter(r => r.status !== 'rejected').sort(by('at', -1)); ensureNames([...reqs.map(r => r.uid), ...D.employees.list.map(e => e.userId).filter(Boolean)]);
  const empOpts = (sel) => activeEmpList().sort(by('empNo')).map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.nameAr)} — ${esc(e.empNo)}${e.userId ? ' (مربوط حاليًا)' : ''}</option>`).join('');
  const reqTbl = reqs.length ? dataTable('linkreqs', [
    { k: 'acc', l: 'الحساب', v: r => `<b>${esc(pname(r.uid) || 'حساب بدون اسم ظاهر')}</b><div class="small muted num">${esc(r.uid.slice(0, 10))}…</div>` },
    { k: 'empNo', l: 'الرقم المدخل', v: r => `<span class="num">${esc(r.empNo)}</span>` },
    { k: 'match', l: 'الملف المطابق', v: r => { const e = D.employees.list.find(x => x.empNo === r.empNo); return e ? `${esc(e.nameAr)}${e.userId ? ' <span class="badge b-warn">مربوط بحساب آخر</span>' : ''}` : '<span class="badge b-bad">لا يوجد ملف بهذا الرقم</span>'; } },
    { k: 'note', l: 'ملاحظة', v: r => esc(r.note || '') }, { k: 'at', l: 'التاريخ', v: r => fmtDT(r.at) },
    { k: 'x', l: '', nosort: true, v: r => `<div class="row" style="gap:4px;flex-wrap:nowrap"><select id="lk-${esc(r.uid)}" aria-label="الملف">${empOpts(D.employees.list.find(x => x.empNo === r.empNo)?.id)}</select><button class="btn sm pri" data-act="link-approve" data-uid="${esc(r.uid)}">ربط</button><button class="btn sm ghost danger" data-act="link-reject" data-uid="${esc(r.uid)}">رفض</button></div>` }], reqs, { search: false }) : empty('لا توجد طلبات ربط جديدة');
  const rows = activeEmpList().sort(by('empNo'));
  return `<div class="note" style="margin-bottom:10px">كل شخص يدخل المنصة بحسابه في Claude، ويُربط الحساب بملف موظف واحد فقط. لا توجد قائمة لاختيار الهوية في بيئة التشغيل. تحقق من اسم الحساب والرقم الوظيفي قبل الربط.</div>
    <section class="card" style="margin-bottom:14px"><h2>طلبات الربط</h2>${reqTbl}</section>
    <section class="card"><h2>حالة الربط لكل موظف <small class="muted">${rows.filter(e => e.userId).length} من ${rows.length} مربوط</small></h2>${dataTable('linkemps', [
      { k: 'empNo', l: 'الرقم', v: e => `<span class="num">${esc(e.empNo)}</span>` }, { k: 'nameAr', l: 'الموظف', v: e => `<b>${esc(e.nameAr)}</b>` },
      { k: 'st', l: 'الحالة', s: e => e.userId ? 1 : 0, v: e => e.userId ? badge('approved', 'مربوط') : badge('', 'غير مربوط') },
      { k: 'acc', l: 'الحساب', v: e => e.userId ? esc(pname(e.userId) || 'حساب') + (e.userId === S.uid ? ' <span class="tag">أنت</span>' : '') : '—' },
      { k: 'x', l: '', nosort: true, v: e => e.userId && e.id !== S.meId ? `<button class="btn sm ghost danger" data-act="link-unlink" data-id="${e.id}">فك الربط</button>` : '' }], rows)}</section>`;
}
ACT['link-approve'] = async el => {
  const uid = el.dataset.uid; const r = RAW.linkreqs.map[uid]; const e = emp($('#lk-' + CSS.escape(uid))?.value); if (!r || !e) return;
  if (e.userId && e.userId !== uid) return confirmBox(`الملف «${esc(e.nameAr)}» مربوط بحساب آخر. استبدال الربط بالحساب الجديد؟`, () => doLink(uid, e, r), 'استبدال');
  return doLink(uid, e, r);
};
async function doLink(uid, e, r) {
  const at = nowISO();
  for (const x of D.employees.list.filter(x => x.userId === uid && x.id !== e.id)) await put('employees', x.id, { ...strip(x), userId: null, updatedAt: at });
  await put('employees', e.id, { ...strip(e), userId: uid, updatedAt: at });
  await remove('linkreqs', uid);
  await audit('ربط حساب بملف موظف', 'employee', e.id, `${e.nameAr} ← ${pname(uid) || uid}${r ? ' (رقم مدخل: ' + r.empNo + ')' : ''}`);
  await notify([e.id], 'تم ربط حسابك بملفك الوظيفي', 'يمكنك الآن الدخول إلى المنصة مباشرة', { view: 'home' }); toast('تم الربط');
}
ACT['link-reject'] = el => { const uid = el.dataset.uid; const r = RAW.linkreqs.map[uid]; if (!r) return; confirmBox('رفض طلب الربط؟', async () => { await rawPut('linkreqs', uid, { ...strip(r), status: 'rejected', decidedById: S.meId, decidedAt: nowISO() }); await audit('رفض طلب ربط', 'linkreq', uid, 'الرقم ' + r.empNo); toast('رُفض الطلب'); }, 'رفض'); };
ACT['link-unlink'] = el => { const e = emp(el.dataset.id); if (!e) return; confirmBox(`فك ربط حساب «${esc(e.nameAr)}»؟ لن يستطيع صاحب الحساب الدخول حتى يُربط من جديد.`, async () => { await put('employees', e.id, { ...strip(e), userId: null, updatedAt: nowISO() }); await audit('فك ربط حساب', 'employee', e.id, e.nameAr); toast('تم فك الربط'); }, 'فك الربط'); };

/* ---------- one-time move of roles & sensitive identity fields into protected collections (copy, verify, then clear) ---------- */
function maybeMigrateAccess() {
  if (S.migrating || !S.adminLvl || !S.canWrite || !D.settings.map.main || SET().accessMigrated || !RAW.employees.list.length) return;
  S.migrating = true;
  (async () => {
    let moved = 0;
    for (const e of RAW.employees.list) {
      const a = {}, x = {}; ACCESS_FIELDS.forEach(k => { if (e[k] !== undefined) a[k] = e[k]; }); SEC_FIELDS.forEach(k => { if (e[k] !== undefined) x[k] = e[k]; });
      if (!Object.keys(a).length && !Object.keys(x).length) continue;
      if (Object.keys(a).length) await rawPut('access', e.id, { ...strip(RAW.access.map[e.id] || {}), ...a });
      if (Object.keys(x).length) await rawPut('empsecure', e.id, { ...strip(RAW.empsecure.map[e.id] || {}), ...x });
      const ga = Object.keys(a).length ? (await S.db.collection('access').doc(e.id).get()).data() : {}; const gx = Object.keys(x).length ? (await S.db.collection('empsecure').doc(e.id).get()).data() : {};
      if (!Object.keys(a).every(k => sameJ(ga?.[k], a[k])) || !Object.keys(x).every(k => sameJ(gx?.[k], x[k]))) throw new Error('تعذر التحقق من نسخ بيانات ' + e.nameAr + ' — لم يُحذف شيء');
      const base = strip(e); [...ACCESS_FIELDS, ...SEC_FIELDS].forEach(k => delete base[k]); await rawPut('employees', e.id, base); moved++;
    }
    await rawPut('settings', 'main', { ...strip(RAW.settings.map.main), accessMigrated: true, accessMigratedAt: nowISO() });
    await audit('نقل الأدوار والبيانات الحساسة إلى مجموعات محمية', 'system', null, `${moved} ملف — نسخ ثم تحقق ثم إزالة من الملف العام`);
  })().catch(err => { console.warn(err); toast('تعذر إكمال نقل البيانات المحمية: ' + err.message, true); }).finally(() => { S.migrating = false; });
}

/* ---------- data scope per role (company / own unit / chosen units) + per-employee exceptions ---------- */
let _scope = null, _scopeKey = '';
function unitDesc(ids) { const out = new Set(ids); let grew = true; while (grew) { grew = false; for (const u of D.orgunits.list) if (u.parentId && out.has(u.parentId) && !out.has(u.id)) { out.add(u.id); grew = true; } } return out; }
function myScope() {
  const key = S.meId + '|' + S.stamp; if (_scope && _scopeKey === key) return _scope;
  const me = ME(); const sc = SET().scopes || {}; let all = false; const units = new Set();
  if (me) {
    if (me.scopeUnits?.length) me.scopeUnits.forEach(u => units.add(u));
    else for (const r of rolesOf(me)) { if (AUTO_ROLES.includes(r)) continue; const s = sc[r]; if (!s || (s.mode !== 'units' && s.mode !== 'own')) { all = true; break; } if (s.mode === 'own') [me.deptId, me.sectionId, me.locationId].filter(Boolean).forEach(u => units.add(u)); else (s.units || []).forEach(u => units.add(u)); }
  }
  const ids = new Set(me?.scopeEmpIds || []);
  if (!all && units.size) { const us = unitDesc([...units]); D.employees.list.forEach(e => { if (us.has(e.deptId) || us.has(e.sectionId) || us.has(e.locationId)) ids.add(e.id); }); }
  _scope = { all, ids, excl: new Set(me?.excludeEmpIds || []), units }; _scopeKey = key; return _scope;
}
function inScope(id) { if (!id || id === S.meId) return true; const s = myScope(); if (s.excl.has(id)) return false; return s.all || s.ids.has(id); }
const SCOPE_MODES = { all: 'الشركة كاملة', own: 'إدارته وقسمه وموقعه فقط', units: 'وحدات محددة' };
function scopesHtml() {
  const sc = SET().scopes || {}; const roles = ASSIGNABLE_ROLES.filter(r => r !== 'sysadmin');
  return `<div class="note" style="margin-bottom:10px">النطاق يحدد أي الموظفين تشملهم صلاحيات العرض الشاملة للدور (ملفات الموظفين، كل الطلبات، الحضور، التنبيهات). المدير المباشر يرى فريقه دائمًا. يمكن تخصيص موظف بعينه من «الموظفون وأدوارهم».</div>` +
    dataTable('scopes', [{ k: 'r', l: 'الدور', v: r => `<b>${esc(ROLES[r])}</b>` }, { k: 'm', l: 'النطاق', v: r => esc(SCOPE_MODES[sc[r]?.mode || 'all']) + (sc[r]?.mode === 'units' ? `<div class="small muted">${(sc[r].units || []).map(unitName).join('، ') || 'لم تُحدد وحدات'}</div>` : '') },
      { k: 'n', l: 'عدد الموظفين بالدور', v: r => `<span class="num">${activeEmpList().filter(e => rolesOf(e).has(r)).length}</span>` }, { k: 'x', l: '', nosort: true, v: r => `<button class="btn sm" data-act="scope-edit" data-k="${r}">تعديل</button>` }], roles.map(r => ({ id: r, r })), { search: false }) +
    `<div class="small muted" style="margin-top:8px">مدير النظام يرى الشركة كاملة دائمًا لأغراض الإعداد.</div>`;
}
ACT['scope-edit'] = el => {
  const r = el.dataset.k; const s = (SET().scopes || {})[r] || { mode: 'all' };
  openModal('نطاق الدور: ' + ROLES[r], `<form class="form" id="scf" data-form="scope-role" data-k="${r}">${fld('mode', 'النطاق', { type: 'radio', options: Object.entries(SCOPE_MODES), value: s.mode || 'all', full: true })}${fld('units', 'الوحدات (عند اختيار «وحدات محددة»)', { type: 'checks', options: D.orgunits.list.filter(u => u.type !== 'costcenter').sort(by('name')).map(u => [u.id, u.name + ' — ' + (UNIT_TYPES[u.type] || '')]), value: s.units || [], full: true })}${fld('reason', 'سبب التغيير', { required: true, full: true })}</form>`, `<button class="btn pri" form="scf">حفظ</button><button class="btn" data-act="close-modal">إلغاء</button>`, true);
};
FORM['scope-role'] = async f => {
  const r = f.dataset.k; const v = readForm(f); if (v.mode === 'units' && !(v.units || []).length) return toast('اختر وحدة واحدة على الأقل', true);
  const scopes = { ...(SET().scopes || {}), [r]: { mode: v.mode, units: v.mode === 'units' ? v.units : [] } };
  await patch('settings', 'main', { scopes }); await audit('تغيير نطاق دور', 'settings', r, `${ROLES[r]}: ${SCOPE_MODES[v.mode]}${v.mode === 'units' ? ' (' + v.units.map(unitName).join('، ') + ')' : ''} — ${v.reason}`); closeModal(); toast('حُفظ النطاق');
};

/* ---------- sensitive values: masked by default, reveal is logged ---------- */
function secVal(e, k) {
  const v = e[k];
  if (v == null || v === '') return S.adminLvl ? '<span class="muted">غير مسجل</span>' : '<span class="muted" title="محمي على الخادم">محمي — يظهر لصلاحية «محرر»</span>';
  const key = e.id + ':' + k; if (S.revealed?.has(key)) return `<span class="num">${esc(k === 'birthDate' ? fmtD(v) : v)}</span>`;
  const masked = k === 'birthDate' ? '••••/••/••' : '•••• ' + String(v).slice(-4);
  return `<span class="num">${masked}</span> <button class="btn sm ghost" data-act="reveal" data-id="${e.id}" data-k="${k}" style="padding:1px 8px">إظهار</button>`;
}
ACT.reveal = async el => { (S.revealed = S.revealed || new Set()).add(el.dataset.id + ':' + el.dataset.k); renderView(); await audit('اطلاع على بيانات حساسة', 'employee', el.dataset.id, `${empName(el.dataset.id)} — ${FIELD_LABELS[el.dataset.k] || el.dataset.k}`); };
{ const _pay = VIEWS.payroll; VIEWS.payroll = () => { const h = _pay(); return S.adminLvl ? h : h.replace(/(<div class="ph">[\s\S]*?<\/div><\/div>)/, `$1<div class="note warn" style="margin-bottom:12px">${FIN_LOCK_MSG}</div>`); }; }

/* ---------- self-test & non-destructive integrity fixes ---------- */
function selftestRun() {
  const R = []; const add = (grp, title, st, detail, fix) => R.push({ grp, title, st, detail, fix });
  const E = D.employees.map, U = D.orgunits.map;
  // environment
  add('البيئة', 'نوع البيئة', IS_STAGING ? 'warn' : 'ok', IS_STAGING ? 'بيئة اختبار منفصلة' : 'بيئة التشغيل');
  add('البيئة', 'الاتصال بقاعدة البيانات', S.db ? 'ok' : 'bad', S.db ? 'متصل' : 'غير متصل');
  add('البيئة', 'هوية الحساب', S.uid ? 'ok' : 'bad', S.uid ? 'الحساب معروف ومربوط بملف ' + empName(S.meId) : 'تعذر قراءة هوية الحساب');
  add('البيئة', 'مستوى مشاركتك', S.adminLvl ? 'ok' : 'warn', S.adminLvl ? 'محرر/مالك: يرى البيانات المحمية ويعدّل الإعدادات' : 'مساهم: البيانات المالية والإعدادات محمية عنك على الخادم');
  // protection
  add('الحماية على الخادم', 'مجموعات مقيدة القراءة والكتابة', 'ok', [...RESTRICTED].join('، ') + ' — للمحرر فقط');
  add('الحماية على الخادم', 'مجموعات للقراءة فقط لغير المحرر', 'ok', [...ADMIN_WRITE].join('، '));
  add('الحماية على الخادم', 'نقل الأدوار والبيانات الحساسة', SET().accessMigrated ? 'ok' : 'warn', SET().accessMigrated ? 'منقولة منذ ' + fmtD(SET().accessMigratedAt || SET().createdAt) : 'لم يُنفذ بعد — يُنفذ تلقائيًا عند دخول محرر');
  const leftover = RAW.employees.list.filter(e => SET().accessMigrated && [...ACCESS_FIELDS, ...SEC_FIELDS].some(k => e[k] !== undefined && e[k] !== null));
  add('الحماية على الخادم', 'حقول محمية متبقية في الملفات العامة', leftover.length ? 'bad' : 'ok', leftover.length ? leftover.length + ' ملف' : 'لا يوجد', leftover.length ? { kind: 'leftover', ids: leftover.map(e => e.id) } : null);
  add('الحماية على الخادم', 'سجل التدقيق', 'warn', 'لا يُحذف ولا يُعدّل من الواجهة. منصة الاستضافة الحالية لا تمنع ذلك على مستوى قاعدة البيانات لمن صلاحيته «مساهم» فأعلى.');
  // access
  const sys = activeEmpList().filter(e => rolesOf(e).has('sysadmin'));
  add('الحسابات والصلاحيات', 'مدير نظام نشط', sys.length ? 'ok' : 'bad', sys.map(e => e.nameAr).join('، ') || 'لا يوجد');
  add('الحسابات والصلاحيات', 'مدير نظام مربوط بحساب', sys.some(e => e.userId) ? 'ok' : IS_STAGING ? 'warn' : 'bad', sys.some(e => e.userId) ? 'نعم' : 'لا يوجد');
  const unl = activeEmpList().filter(e => !e.userId); add('الحسابات والصلاحيات', 'موظفون غير مربوطين بحساب', unl.length ? 'warn' : 'ok', unl.length + ' من ' + activeEmpList().length + ' (لا يستطيعون الدخول بأنفسهم)');
  const pend = RAW.linkreqs.list.filter(r => r.status === 'pending'); add('الحسابات والصلاحيات', 'طلبات ربط بانتظار القرار', pend.length ? 'warn' : 'ok', String(pend.length));
  const dupUid = Object.entries(D.employees.list.reduce((a, e) => (e.userId && (a[e.userId] = (a[e.userId] || 0) + 1), a), {})).filter(([, n]) => n > 1);
  add('الحسابات والصلاحيات', 'حساب مربوط بأكثر من ملف', dupUid.length ? 'bad' : 'ok', dupUid.length ? dupUid.length + ' حساب' : 'لا يوجد');
  const badRole = activeEmpList().filter(e => (e.roles || []).some(r => !ROLES[r])); add('الحسابات والصلاحيات', 'أدوار غير معرفة مسندة لموظفين', badRole.length ? 'warn' : 'ok', badRole.map(e => e.nameAr).join('، ') || 'لا يوجد');
  // integrity
  const unitMgr = D.orgunits.list.filter(u => u.managerId && !E[u.managerId]); add('سلامة البيانات', 'وحدات تنظيمية مديرها غير موجود', unitMgr.length ? 'bad' : 'ok', unitMgr.map(u => u.name).join('، ') || 'لا يوجد', unitMgr.length ? { kind: 'unitMgr', ids: unitMgr.map(u => u.id) } : null);
  const unitPar = D.orgunits.list.filter(u => u.parentId && !U[u.parentId]); add('سلامة البيانات', 'وحدات تتبع وحدة غير موجودة', unitPar.length ? 'bad' : 'ok', unitPar.map(u => u.name).join('، ') || 'لا يوجد', unitPar.length ? { kind: 'unitPar', ids: unitPar.map(u => u.id) } : null);
  const sample = D.orgunits.list.filter(u => u.sample); add('سلامة البيانات', 'وحدات ما زالت معلّمة «تجريبية»', sample.length ? 'warn' : 'ok', sample.length ? sample.length + ' وحدة (تُزال العلامة فقط، وتبقى الوحدة)' : 'لا يوجد', sample.length ? { kind: 'sample', ids: sample.map(u => u.id) } : null);
  const refK = { managerId: E, deptId: U, sectionId: U, locationId: U, costCenterId: U, shiftId: D.shifts.map };
  const empRef = []; D.employees.list.forEach(e => Object.entries(refK).forEach(([k, m]) => { if (e[k] && !m[e[k]]) empRef.push([e.id, k]); }));
  add('سلامة البيانات', 'مراجع معلقة في ملفات الموظفين', empRef.length ? 'bad' : 'ok', empRef.length ? empRef.map(([id, k]) => empName(id) + ': ' + (FIELD_LABELS[k] || k)).join('، ') : 'لا يوجد', empRef.length ? { kind: 'empRef', pairs: empRef } : null);
  const cyc = activeEmpList().filter(e => { const seen = new Set([e.id]); let m = e.managerId; while (m) { if (seen.has(m)) return true; seen.add(m); m = E[m]?.managerId; } return false; });
  add('سلامة البيانات', 'حلقات في التسلسل الإداري', cyc.length ? 'bad' : 'ok', cyc.map(e => e.nameAr).join('، ') || 'لا يوجد');
  const dupNo = Object.entries(D.employees.list.reduce((a, e) => (a[e.empNo] = (a[e.empNo] || 0) + 1, a), {})).filter(([, n]) => n > 1);
  add('سلامة البيانات', 'أرقام وظيفية مكررة', dupNo.length ? 'bad' : 'ok', dupNo.map(([n]) => n).join('، ') || 'لا يوجد');
  const orph = [['leaveBalances', 'أرصدة إجازات'], ['requests', 'طلبات'], ['attmonths', 'حضور'], ['access', 'صلاحيات'], ['enrollments', 'تسجيل دورات'], ['reviews', 'تقييمات']].map(([c, l]) => [l, RAW[c].list.filter(x => x.empId && !E[x.empId] || (c === 'access' && !RAW.employees.map[x.id])).length]).filter(([, n]) => n);
  add('سلامة البيانات', 'سجلات مرتبطة بموظف غير موجود', orph.length ? 'warn' : 'ok', orph.length ? orph.map(([l, n]) => `${l}: ${n}`).join('، ') + ' — تُترك كما هي للمراجعة، ولا تُحذف تلقائيًا' : 'لا يوجد');
  // workflow
  const types = D.requestTypes.list.filter(t => t.active !== false);
  const noStage = types.filter(t => !(t.stages || []).length); add('الطلبات والاعتمادات', 'أنواع طلبات بلا مراحل اعتماد', noStage.length ? 'warn' : 'ok', noStage.map(t => t.name).join('، ') || 'لا يوجد');
  const noHolder = []; types.forEach(t => (t.stages || []).forEach(st => (st.assignees || []).forEach(a => { if (a.kind === 'role' && !activeEmpList().some(e => rolesOf(e).has(a.role))) noHolder.push(`${t.name} ← ${ROLES[a.role] || a.role}`); if (a.kind === 'employee' && !E[a.empId]) noHolder.push(`${t.name} ← موظف محذوف`); })));
  add('الطلبات والاعتمادات', 'مراحل بلا معتمد متاح (تُحال لمدير الموارد البشرية)', noHolder.length ? 'warn' : 'ok', uniq(noHolder).slice(0, 12).join('، ') + (uniq(noHolder).length > 12 ? ' …' : '') || 'لا يوجد');
  const badTpl = types.filter(t => t.templateId && !D.templates.map[t.templateId]); add('الطلبات والاعتمادات', 'أنواع مرتبطة بقالب خطاب غير موجود', badTpl.length ? 'bad' : 'ok', badTpl.map(t => t.name).join('، ') || 'لا يوجد');
  // capacity & backup
  const total = Object.keys(COLS).reduce((a, k) => a + RAW[k].list.length, 0);
  add('السعة والنسخ الاحتياطي', 'عدد السجلات المحمّلة', total > 20000 ? 'bad' : total > 15000 ? 'warn' : 'ok', fmtN(total) + ' من حد 25,000 سجل للمنصة');
  const lb = SET().lastBackupAt, la = SET().lastAutoBackupAt; const age = d => d ? Math.floor((Date.now() - new Date(d)) / 864e5) : null;
  add('السعة والنسخ الاحتياطي', 'آخر نسخة يدوية', lb ? (age(lb) > 7 ? 'warn' : 'ok') : 'warn', lb ? fmtDT(lb) : 'لم تُنزّل نسخة من الواجهة بعد');
  add('السعة والنسخ الاحتياطي', 'آخر نسخة مجدولة', la ? (age(la) > 2 ? 'bad' : 'ok') : 'warn', la ? fmtDT(la) + (SET().lastAutoBackupNote ? ' — ' + esc(SET().lastAutoBackupNote) : '') : 'لم تُسجل نسخة مجدولة بعد');
  return R;
}
function selftestHtml() {
  const R = S.selftest || selftestRun(); S.selftest = R; const fixable = R.filter(r => r.fix && r.st !== 'ok');
  const cnt = s => R.filter(r => r.st === s).length; const B = { ok: badge('approved', 'سليم'), warn: badge('returned', 'تنبيه'), bad: badge('rejected', 'خلل') };
  const grps = uniq(R.map(r => r.grp));
  return `<div class="grid g4" style="margin-bottom:14px">${kpi('فحوصات', R.length)}${kpi('سليمة', cnt('ok'))}${kpi('تنبيهات', cnt('warn'), '', cnt('warn'))}${kpi('خلل', cnt('bad'), '', cnt('bad'))}</div>
  <div class="toolbar"><button class="btn sm" data-act="selftest-run">${ic('check')} إعادة الفحص</button>${fixable.length ? `<button class="btn sm pri" data-act="selftest-fix">إصلاح آمن (${fixable.length})</button>` : ''}<button class="btn sm" data-act="selftest-export">${ic('down')} تصدير النتيجة</button><span class="small muted">آخر فحص: ${fmtDT(S.selftestAt || nowISO())}</span></div>
  <div class="note small" style="margin-bottom:10px">الإصلاح الآمن يفرّغ المراجع المعلقة ويزيل علامة «تجريبي» فقط. لا يحذف أي سجل، ويُسجل كل تعديل في سجل التدقيق. السجلات المرتبطة بموظف غير موجود تُعرض للمراجعة ولا تُحذف.</div>
  ${grps.map(g => `<section class="card" style="margin-bottom:12px"><h2>${esc(g)}</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الفحص</th><th>النتيجة</th><th>التفاصيل</th></tr></thead><tbody>${R.filter(r => r.grp === g).map(r => `<tr><td>${esc(r.title)}</td><td>${B[r.st]}</td><td class="small">${r.detail}</td></tr>`).join('')}</tbody></table></div></section>`).join('')}`;
}
ACT['selftest-run'] = () => { S.selftest = selftestRun(); S.selftestAt = nowISO(); renderView(); audit('تشغيل الفحص الذاتي', 'system', null, S.selftest.filter(r => r.st !== 'ok').length + ' ملاحظة'); };
ACT['selftest-export'] = () => exportRows(`selftest-${todayISO()}`, [['المجموعة', 'الفحص', 'النتيجة', 'التفاصيل'], ...(S.selftest || selftestRun()).map(r => [r.grp, r.title, { ok: 'سليم', warn: 'تنبيه', bad: 'خلل' }[r.st], String(r.detail).replace(/<[^>]+>/g, '')])]);
ACT['selftest-fix'] = () => {
  const fx = (S.selftest || selftestRun()).filter(r => r.fix && r.st !== 'ok');
  confirmBox(`سيتم تنفيذ الإصلاحات الآمنة التالية:<ul>${fx.map(r => `<li>${esc(r.title)}</li>`).join('')}</ul>لن يُحذف أي سجل.`, async () => {
    let n = 0; const at = nowISO(); const U = {}, EP = {};
    const up = (id, k, v) => { (U[id] = U[id] || {})[k] = v; }; const ep = (id, k) => { (EP[id] = EP[id] || []).push(k); };
    for (const r of fx) {
      const f = r.fix;
      if (f.kind === 'unitMgr') f.ids.forEach(id => up(id, 'managerId', null));
      if (f.kind === 'unitPar') f.ids.forEach(id => up(id, 'parentId', null));
      if (f.kind === 'sample') f.ids.forEach(id => up(id, 'sample', undefined));
      if (f.kind === 'empRef') f.pairs.forEach(([id, k]) => ep(id, k));
      if (f.kind === 'leftover') { S.migrating = false; await rawPut('settings', 'main', { ...strip(RAW.settings.map.main), accessMigrated: false }); n++; }
    }
    for (const [id, ch] of Object.entries(U)) {
      const u = strip(D.orgunits.map[id]); const before = { managerId: u.managerId, parentId: u.parentId, sample: u.sample };
      for (const [k, v] of Object.entries(ch)) { if (v === undefined) delete u[k]; else u[k] = v; }
      await put('orgunits', id, { ...u, updatedAt: at }); n++;
      await audit('إصلاح آمن لوحدة تنظيمية', 'orgunit', id, `${u.name}: ${Object.keys(ch).map(k => k === 'sample' ? 'إزالة علامة تجريبي' : `${k} (كان: ${before[k]})`).join('، ')}`);
    }
    for (const [id, ks] of Object.entries(EP)) {
      const e = D.employees.map[id]; const o = strip(e); ks.forEach(k => o[k] = null); await put('employees', id, { ...o, updatedAt: at }); n++;
      for (const k of ks) await put('emphistory', newId(), { empId: id, kind: 'data', field: k, old: e[k], new: null, reason: 'إصلاح مرجع معلق (الفحص الذاتي)', byId: S.meId, at });
    }
    toast(`نُفذ ${n} إصلاح`); setTimeout(() => { S.selftest = selftestRun(); S.selftestAt = nowISO(); renderView(); }, 600);
  }, 'تنفيذ');
};

/* ---------- backup & restore with a preview of differences (restore never deletes) ---------- */
function backupHtml() {
  const s = SET();
  return `<div class="grid g2"><section class="card"><h2>نسخة احتياطية</h2><p class="small">ملف JSON بكل مجموعات البيانات كما هي في قاعدة البيانات${S.adminLvl ? '' : '. <b>صلاحيتك «مساهم»: لن تشمل النسخة البيانات المالية والحساسة المحمية</b>'}. الملفات المرفوعة محفوظة في مخزن الأصول ولا تدخل في الملف. احفظه في مكان آمن لأنه يحتوي بيانات شخصية.</p>
    <dl class="dl small"><dt>آخر نسخة يدوية</dt><dd>${s.lastBackupAt ? fmtDT(s.lastBackupAt) + ' — ' + esc(s.lastBackupBy || '') : 'لا يوجد'}</dd><dt>آخر نسخة مجدولة</dt><dd>${s.lastAutoBackupAt ? fmtDT(s.lastAutoBackupAt) + (s.lastAutoBackupNote ? ' — ' + esc(s.lastAutoBackupNote) : '') : 'لم تُسجل بعد'}</dd></dl>
    <button class="btn pri" data-act="backup">${ic('down')} تنزيل النسخة الاحتياطية</button></section>
    <section class="card"><h2>الاستعادة</h2><p class="small">اختر ملف نسخة احتياطية لعرض الفروقات أولًا. الاستعادة تضيف السجلات الناقصة وتعيد السجلات المختلفة إلى قيمتها في الملف، ولا تحذف أي سجل غير موجود في الملف.</p>
    <input type="file" id="restore-file" accept=".json,application/json" aria-label="ملف النسخة" data-act-change="restore-pick">${S.restoreData ? `<div class="small" style="margin-top:6px">الملف المختار: <b>${esc(S.restoreData.name)}</b></div>` : ''}<div id="restore-out">${restorePreviewHtml()}</div></section></div>`;
}
ACT.backup = async () => {
  const out = { format: 2, exportedAt: nowISO(), by: empName(S.meId), env: IS_STAGING ? 'staging' : 'production', partial: !S.adminLvl, collections: {} };
  for (const k in COLS) out.collections[k] = RAW[k].list.map(x => ({ ...x }));
  await saveFile(`hr-backup-${IS_STAGING ? 'staging-' : ''}${todayISO()}.json`, JSON.stringify(out, null, 1), 'application/json');
  if (S.adminLvl) try { await patch('settings', 'main', { lastBackupAt: out.exportedAt, lastBackupBy: out.by }); } catch (e) { }
  await audit('تنزيل نسخة احتياطية', 'system', null, `${Object.values(out.collections).reduce((a, r) => a + r.length, 0)} سجل${out.partial ? ' (جزئية)' : ''}`);
};
function restorePlan(data) {
  const plan = []; const C = data.collections || {};
  const add = (col, label, rows, curMap, writer) => { let nw = 0, ch = 0, same = 0; const todo = [];
    for (const r of rows) { const { id, ...rest } = r; if (!id) continue; const cur = curMap[id]; if (!cur) { nw++; todo.push([id, rest]); } else if (stableJ(strip(cur)) !== stableJ(rest)) { ch++; todo.push([id, rest]); } else same++; }
    plan.push({ col, label, nw, ch, same, todo, writer, locked: needsAdmin(col) && !S.adminLvl }); };
  for (const [col, rows] of Object.entries(C)) {
    if (col === 'attendance') { // legacy format: one document per day
      const cur = D.attendance.map; let nw = 0, ch = 0, same = 0; const todo = [];
      for (const r of rows) { const c = cur[r.empId + '_' + r.date]; const { id, ...rest } = r; if (!c) { nw++; todo.push(rest); } else if (stableJ({ ...strip(c), id: undefined }) !== stableJ(rest)) { ch++; todo.push(rest); } else same++; }
      plan.push({ col: 'attmonths', label: 'الحضور (صيغة قديمة)', nw, ch, same, todo, writer: 'att' }); continue;
    }
    if (!COLS[col]) continue;
    if (col === 'employees' && data.format !== 2) add(col, col, rows, D.employees.map, 'emp');
    else add(col, col, rows, RAW[col].map, 'raw');
  }
  return plan;
}
ACT['restore-pick'] = async el => {
  const file = el.files?.[0]; if (!file) return;
  let data; try { data = JSON.parse(await file.text()); } catch (e) { S.restoreData = null; S.restorePlan = null; renderView(); return toast('الملف ليس JSON صالحًا', true); }
  if (!data.collections) { S.restoreData = null; S.restorePlan = null; renderView(); return toast('ملف غير صالح: لا يحتوي مجموعات بيانات', true); }
  S.restoreData = { name: file.name, data }; S.restorePlan = { plan: restorePlan(data), name: file.name, data }; renderView();
};
function restorePreviewHtml() {
  const P = S.restorePlan; if (!P) return ''; const data = P.data; const plan = restorePlan(data); P.plan = plan; const rows = plan.filter(p => p.nw || p.ch);
  return `<div class="small" style="margin-top:12px">نسخة بتاريخ ${fmtDT(data.exportedAt)}${data.env ? ' — ' + (data.env === 'staging' ? 'من بيئة الاختبار' : 'من بيئة التشغيل') : ''}${data.partial ? ' — <b>نسخة جزئية</b>' : ''}</div>
  ${data.env && data.env !== (IS_STAGING ? 'staging' : 'production') ? `<div class="note warn small">تنبيه: هذه النسخة من بيئة مختلفة عن البيئة الحالية.</div>` : ''}
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>المجموعة</th><th>جديد</th><th>مختلف</th><th>مطابق</th></tr></thead><tbody>${plan.map(p => `<tr><td>${esc(p.label)}${p.locked ? ' <span class="badge b-warn">يتطلب محرر</span>' : ''}</td><td class="num">${p.nw}</td><td class="num">${p.ch}</td><td class="num">${p.same}</td></tr>`).join('')}</tbody></table></div>
  ${rows.length ? `<button class="btn pri" data-act="restore-run" style="margin-top:10px">استعادة ${rows.reduce((a, p) => a + p.nw + p.ch, 0)} سجل</button>` : '<div class="note small">لا توجد فروقات — البيانات الحالية مطابقة للنسخة.</div>'}`;
}
ACT['restore-run'] = () => {
  const P = S.restorePlan; if (!P) return; P.plan = restorePlan(P.data); const plan = P.plan.filter(p => (p.nw || p.ch) && !p.locked);
  confirmBox(`سيتم إضافة أو تحديث ${plan.reduce((a, p) => a + p.nw + p.ch, 0)} سجل من «${esc(P.name)}». لن يُحذف أي سجل. متابعة؟`, async () => {
    let n = 0;
    for (const p of plan) {
      if (p.writer === 'att') { await attPutMany(p.todo); n += p.todo.length; continue; }
      for (const [id, rest] of p.todo) { if (p.writer === 'emp') await put('employees', id, rest); else await rawPut(p.col, id, rest); n++; }
    }
    await audit('استعادة نسخة احتياطية', 'system', null, `${P.name}: ${n} سجل (بدون حذف)`); toast(`استُعيد ${n} سجل`); S.restorePlan = null; S.restoreData = null; renderView();
  }, 'استعادة');
};
