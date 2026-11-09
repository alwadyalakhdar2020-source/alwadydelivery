'use strict';
/* ============ helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nowISO = () => new Date().toISOString();
const localISO = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const todayISO = () => localISO();
const monthISO = () => todayISO().slice(0, 7);
const fmtD = v => v ? String(v).slice(0, 10).replace(/-/g, '/') : '—';
const fmtDT = v => { if (!v) return '—'; const d = new Date(v); return localISO(d).replace(/-/g, '/') + ' ' + d.toTimeString().slice(0, 5); };
const fmtN = (n, f = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: f, maximumFractionDigits: f });
const fmtSAR = n => (n == null || isNaN(n)) ? '—' : fmtN(n, 2) + ' ر.س';
const addHours = (iso, h) => new Date(new Date(iso).getTime() + (Number(h) || 0) * 3600e3).toISOString();
const addDays = (iso, d) => { const x = new Date(iso + 'T00:00:00'); x.setDate(x.getDate() + d); return localISO(x); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/-/g, '').slice(0, 20);
const initials = n => (n || '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('');
const toMin = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const uniq = a => [...new Set(a)];
const by = (k, dir = 1) => (a, b) => { const x = typeof k === 'function' ? k(a) : a[k], y = typeof k === 'function' ? k(b) : b[k]; return (x > y ? 1 : x < y ? -1 : 0) * dir; };

/* ============ state & data ============ */
const IS_STAGING = (window.HR_ENV || 'production') === 'staging';
const VIEWS = {};
const ACT = {};
const FORM = {};
const S = { stamp: 0, adminLvl: false, attKnown: new Set(), db: null, assets: null, downloads: null, user: null, uid: null, canWrite: true, meId: null, view: 'home', params: {}, tabs: {}, q: {}, sort: {}, f: {}, loaded: new Set(), ready: false, escalated: false, busy: false };
const COLS = {
  settings: {}, orgunits: {}, employees: {}, access: {}, empsecure: {}, salaries: {}, emphistory: { order: ['at', 'desc'], limit: 1000 }, emphistory_s: { order: ['at', 'desc'], limit: 1000 }, requestTypes: {}, requests: {},
  notifications: { order: ['at', 'desc'], limit: 800 }, leaveTypes: {}, leaveBalances: {}, shifts: {}, attmonths: { order: ['month', 'desc'], limit: 1000 },
  assets: {}, handovers: {}, forms: {}, acks: {}, templates: {}, requisitions: {}, candidates: {}, courses: {}, enrollments: {}, reviews: {},
  loans: {}, adjustments: {}, shipments: {}, brokers: {}, records: {}, announcements: { order: ['at', 'desc'], limit: 200 }, tasks: {}, linkreqs: {}, creds: {}, logins: {}, kpiTemplates: {}, kpiPlans: {}, audit: { order: ['at', 'desc'], limit: 600 }
};
/* Server-enforced protection (db access rules, by sharing level). RESTRICTED: read+write need Editor ("admin").
   ADMIN_WRITE: everyone reads, only Editors write. Must match the rules declared at publish. */
const RESTRICTED = new Set(['salaries', 'adjustments', 'loans', 'empsecure', 'emphistory_s']);
const ADMIN_WRITE = new Set(['settings', 'orgunits', 'requestTypes', 'leaveTypes', 'templates', 'access']);
const SEC_FIELDS = ['idNumber', 'passportNo', 'iban', 'birthDate'];          // stored in empsecure
const ACCESS_FIELDS = ['roles', 'userId', 'scopeUnits', 'scopeEmpIds', 'excludeEmpIds']; // stored in access
const VIRTUAL = { attendance: 1 };
const D = {}; for (const k in { ...COLS, ...VIRTUAL }) D[k] = { list: [], map: {} };
const RAW = {}; for (const k in COLS) RAW[k] = { list: [], map: {} };
const SET = () => D.settings.map.main || {};
const DEFAULT_LISTS = {
  contractTypes: ['محدد المدة', 'غير محدد المدة', 'مؤقت', 'تدريب'], idTypes: ['هوية وطنية', 'إقامة'], maritalStatus: ['أعزب', 'متزوج', 'غير ذلك'],
  empDocKinds: ['عقد عمل', 'هوية/إقامة', 'جواز سفر', 'شهادة', 'إقرار', 'تقرير طبي', 'محضر تحقيق', 'أخرى'], exitTypes: ['استقالة', 'انتهاء العقد', 'إنهاء من صاحب العمل', 'تقاعد', 'وفاة', 'أخرى'],
  assetCategories: ['جوال', 'حاسب', 'سيارة', 'مفاتيح', 'أدوات', 'معدات سلامة', 'سكن', 'أخرى'], shipModes: ['بحري', 'جوي', 'بري'], currencies: ['USD', 'EUR', 'CNY', 'SAR', 'AED', 'أخرى'],
  shipCostTypes: ['رسوم جمركية', 'ضريبة القيمة المضافة', 'أتعاب المخلص', 'رسوم الميناء والمناولة', 'أرضيات وغرامات تأخير', 'نقل داخلي', 'أخرى'], commChannels: ['اتصال', 'واتساب', 'بريد إلكتروني', 'زيارة', 'أخرى'],
  candSources: ['موقع الشركة', 'ترشيح داخلي', 'منصة توظيف', 'مكتب استقدام', 'أخرى']
};
const LIST = k => (SET().lists?.[k]?.length ? SET().lists[k] : DEFAULT_LISTS[k]) || [];
const emp = id => D.employees.map[id];
const empName = id => emp(id)?.nameAr || '—';
const unitName = id => D.orgunits.map[id]?.name || '—';
const ME = () => emp(S.meId);

let renderQueued = false;
function scheduleRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; if (window.renderAll) renderAll(); }); }

function isSensHist(o) { return !!(o && (o.kind === 'salary' || o.sensitive === true || o.disciplinary || SEC_FIELDS.includes(o.field))); }
function deriveEmployees() {
  const acc = RAW.access.map, sec = RAW.empsecure.map, migrated = !!(RAW.settings.map.main || {}).accessMigrated;
  const list = RAW.employees.list.map(e => {
    const o = { ...e }; if (migrated) for (const k of ACCESS_FIELDS) delete o[k];
    const a = acc[e.id]; if (a) for (const k of ACCESS_FIELDS) if (a[k] !== undefined) o[k] = a[k];
    const x = sec[e.id]; if (x) for (const k of SEC_FIELDS) if (x[k] !== undefined) o[k] = x[k];
    return o;
  });
  const map = {}; list.forEach(x => map[x.id] = x); D.employees = { list, map };
}
function deriveHistory() { const list = [...RAW.emphistory.list, ...RAW.emphistory_s.list].sort(by('at', -1)); const map = {}; list.forEach(x => map[x.id] = x); D.emphistory = { list, map }; }
function deriveAttendance() {
  const list = []; for (const m of RAW.attmonths.list) for (const [date, r] of Object.entries(m.days || {})) if (r) list.push({ ...r, empId: m.empId, date, id: m.empId + '_' + date });
  list.sort(by('date', -1)); const map = {}; list.forEach(x => map[x.id] = x); D.attendance = { list, map };
}
function derive(name) {
  if (['employees', 'access', 'empsecure', 'settings'].includes(name)) deriveEmployees();
  if (name === 'emphistory' || name === 'emphistory_s') deriveHistory();
  else if (name === 'attmonths') deriveAttendance();
  if (!['employees', 'emphistory'].includes(name)) D[name] = RAW[name];
}
function subscribeAll() {
  for (const [name, o] of Object.entries(COLS)) {
    let q = S.db.collection(name);
    if (o.order) q = q.orderBy(o.order[0], o.order[1]);
    if (o.limit) q = q.limit(o.limit);
    q.onSnapshot(snap => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      const map = {}; list.forEach(x => map[x.id] = x);
      RAW[name] = { list, map }; derive(name); S.stamp++; S.loaded.add(name); scheduleRender();
    }, err => { console.warn(name, err); S.loaded.add(name); if (err.code !== 'revoked' && !RESTRICTED.has(name)) toast('تعذر تحميل ' + name + ': ' + err.message, true); scheduleRender(); });
  }
}
const LEVEL_MSG = 'هذا الإجراء محمي على الخادم ويتطلب أن تكون صلاحيتك في مشاركة المنصة «محرر». اطلب من مالك المنصة رفع صلاحيتك.';
function needsAdmin(col) { return RESTRICTED.has(col) || ADMIN_WRITE.has(col); }
async function rawPut(col, id, obj) {
  if (!S.canWrite) throw new Error('صلاحية الكتابة على قاعدة البيانات غير متاحة لحسابك في هذه المشاركة');
  if (needsAdmin(col) && !S.adminLvl) throw new Error(LEVEL_MSG);
  try { await S.db.collection(col).doc(id).set(obj); }
  catch (e) {
    if (e.code === 'unavailable') { await sleep(500 + Math.random() * 700); return S.db.collection(col).doc(id).set(obj); }
    if (e.code === 'invalid_argument' && !S.everWrote && !needsAdmin(col)) { S.canWrite = false; }
    if (e.code === 'quota_exceeded') throw new Error('امتلأت سعة قاعدة البيانات: ' + e.message);
    throw e;
  }
  S.everWrote = true;
}
async function rawUpdate(col, id, obj) {
  if (needsAdmin(col) && !S.adminLvl) throw new Error(LEVEL_MSG);
  try { await S.db.collection(col).doc(id).update(obj); }
  catch (e) { if (e.code === 'unavailable') { await sleep(500 + Math.random() * 700); return S.db.collection(col).doc(id).update(obj); } throw e; }
  S.everWrote = true;
}
const normV = v => (v == null || v === '' || (Array.isArray(v) && !v.length)) ? null : v;
const sameJ = (a, b) => JSON.stringify(normV(a)) === JSON.stringify(normV(b));
async function put(col, id, obj) {
  if (col === 'attendance') return attPutMany([{ ...obj, empId: obj.empId, date: obj.date }]);
  if (col === 'emphistory' && isSensHist(obj)) return rawPut('emphistory_s', id, obj);
  if (col !== 'employees') return rawPut(col, id, obj);
  // employees: split access fields (roles, account link, scope) and sensitive identity fields into protected collections
  const base = { ...obj }; const a = {}, x = {}; const cur = D.employees.map[id] || {};
  for (const k of ACCESS_FIELDS) if (k in base) { a[k] = base[k]; delete base[k]; }
  for (const k of SEC_FIELDS) if (k in base) { x[k] = base[k]; delete base[k]; }
  const aChanged = Object.keys(a).some(k => !sameJ(a[k], cur[k])); const xChanged = Object.keys(x).some(k => !sameJ(x[k], cur[k]));
  if ((aChanged || xChanged) && !S.adminLvl) throw new Error(LEVEL_MSG);
  await rawPut('employees', id, base);
  if (aChanged || (S.adminLvl && Object.keys(a).length && !RAW.access.map[id])) await rawPut('access', id, { ...strip(RAW.access.map[id] || {}), ...a });
  if (xChanged) await rawPut('empsecure', id, { ...strip(RAW.empsecure.map[id] || {}), ...x });
}
async function patch(col, id, obj) { const cur = D[col]?.map[id]; if (!cur) return put(col, id, obj); const o = { ...clone(cur), ...obj }; delete o.id; return put(col, id, o); }
async function remove(col, id) {
  if (col === 'attendance') { const r = D.attendance.map[id]; if (r) await attPutMany([{ empId: r.empId, date: r.date, __del: true }]); return; }
  if (col === 'emphistory' && RAW.emphistory_s.map[id]) col = 'emphistory_s';
  if (needsAdmin(col) && !S.adminLvl) throw new Error(LEVEL_MSG);
  await S.db.collection(col).doc(id).delete();
}
/* attendance: one document per employee per month ({days: {YYYY-MM-DD: {...}}}) to stay far below the database document cap */
async function attPutMany(recs) {
  const groups = {};
  for (const r of recs) { if (!r.empId || !r.date) continue; const mid = r.empId + '_' + r.date.slice(0, 7); const day = { ...r }; const del = day.__del; delete day.__del; delete day.empId; delete day.date; delete day.id; (groups[mid] = groups[mid] || { empId: r.empId, month: r.date.slice(0, 7), days: {} }).days[r.date] = del ? null : day; }
  for (const [mid, g] of Object.entries(groups)) {
    const exists = RAW.attmonths.map[mid] || S.attKnown.has(mid);
    if (exists) { try { await rawUpdate('attmonths', mid, { days: g.days }); continue; } catch (e) { if (e.code !== 'invalid_argument') throw e; } }
    const snap = await S.db.collection('attmonths').doc(mid).get(); const prev = snap.exists ? snap.data() : null;
    await rawPut('attmonths', mid, { empId: g.empId, month: g.month, days: { ...(prev?.days || {}), ...g.days }, updatedAt: nowISO() }); S.attKnown.add(mid);
  }
}
function strip(o) { const c = clone(o); delete c.id; return c; }

async function audit(action, entity, entityId, detail) {
  try { await put('audit', newId(), { at: nowISO(), byId: S.meId || null, byName: empName(S.meId), viewer: S.uid || null, action, entity, entityId: entityId || null, detail: detail || '' }); } catch (e) { console.warn('audit', e); }
}
async function notify(ids, title, body, link) {
  const at = nowISO();
  for (const to of uniq(ids || []).filter(Boolean)) {
    try { await put('notifications', newId(), { to, title, body: body || '', link: link || null, at, read: false }); } catch (e) { console.warn(e); }
  }
}
async function nextRef(prefix) {
  const ref = S.db.doc('counters/' + prefix);
  const holder = S.uid || S.session;
  for (let i = 0; i < 25; i++) {
    const r = await ref.acquire({ holder, ttlMs: 6000 });
    if (r.acquired) {
      const s = await ref.get(); const y = new Date().getFullYear(); let seq = 1;
      if (s.exists) { const d = s.data(); seq = d.year === y ? (Number(d.seq) || 0) + 1 : 1; }
      await ref.set({ year: y, seq, updatedAt: nowISO() });
      return `${prefix}-${y}-${String(seq).padStart(5, '0')}`;
    }
    await sleep(250 + Math.random() * 500);
  }
  throw new Error('تعذر توليد الرقم المرجعي حاليًا، أعد المحاولة');
}

/* ============ roles & permissions ============ */
const ROLES = {
  employee: 'الموظف', manager: 'المدير المباشر', deptManager: 'مدير الإدارة أو القسم', personnel: 'مسؤول شؤون العاملين', hrManager: 'مدير الموارد البشرية',
  adminOfficer: 'مسؤول الشؤون الإدارية', payroll: 'مسؤول الرواتب والمالية', recruitment: 'مسؤول التوظيف والتدريب', executive: 'الإدارة العليا', sysadmin: 'مدير النظام', logistics: 'مسؤول المشتريات والتخليص'
};
const ASSIGNABLE_ROLES = ['personnel', 'hrManager', 'adminOfficer', 'payroll', 'recruitment', 'logistics', 'executive', 'sysadmin'];
const PERMS = {
  'team.view': 'عرض فريقي وطلباته', 'emp.view.all': 'عرض كل ملفات الموظفين', 'emp.edit': 'تعديل ملفات الموظفين', 'emp.view.sensitive': 'عرض البيانات النظامية الحساسة',
  'emp.view.salary': 'عرض الرواتب', 'emp.view.disciplinary': 'عرض الإنذارات والجزاءات', 'req.view.all': 'عرض كل الطلبات', 'req.view.sensitive': 'عرض الشكاوى والطلبات الحساسة',
  'att.manage': 'إدارة الحضور والورديات', 'leave.manage': 'إدارة أرصدة الإجازات', 'letters.issue': 'إصدار الخطابات', 'admin.services': 'إدارة طلبات الشؤون الإدارية',
  'assets.manage': 'إدارة العهد والأصول', 'forms.manage': 'إضافة وتعديل النماذج', 'forms.approve': 'اعتماد النماذج', 'forms.view.restricted': 'عرض النماذج المقيدة',
  'rec.manage': 'إدارة التوظيف', 'train.manage': 'إدارة التدريب', 'perf.manage': 'إدارة تقييم الأداء', 'pay.view': 'عرض الرواتب والمسير', 'pay.manage': 'إدارة الرواتب والسلف',
  'pay.approve': 'اعتماد التسويات المالية', 'reports.exec': 'لوحة الإدارة العليا', 'reports.hr': 'لوحة الموارد البشرية', 'export.data': 'تصدير البيانات',
  'settings.workflow': 'إعداد أنواع الطلبات والمسارات', 'settings.manage': 'إعدادات النظام والصلاحيات', 'customs.view': 'عرض الشحنات والتخليص', 'customs.manage': 'إدارة الشحنات والتخليص', 'announce.manage': 'نشر الإعلانات', 'tasks.admin': 'إدارة المهام الإدارية والتذكيرات', 'audit.view': 'عرض سجل التدقيق', 'backup': 'النسخ الاحتياطي والاستعادة'
};
const DEFAULT_MATRIX = {
  employee: [], manager: ['team.view'], deptManager: ['team.view'],
  personnel: ['emp.view.all', 'emp.edit', 'emp.view.sensitive', 'req.view.all', 'att.manage', 'leave.manage', 'letters.issue', 'forms.view.restricted', 'reports.hr', 'export.data', 'announce.manage'],
  hrManager: ['team.view', 'emp.view.all', 'emp.edit', 'emp.view.sensitive', 'emp.view.salary', 'emp.view.disciplinary', 'req.view.all', 'req.view.sensitive', 'att.manage', 'leave.manage', 'letters.issue', 'forms.manage', 'forms.approve', 'forms.view.restricted', 'rec.manage', 'train.manage', 'perf.manage', 'pay.view', 'pay.approve', 'reports.hr', 'reports.exec', 'export.data', 'settings.workflow', 'audit.view', 'announce.manage', 'tasks.admin'],
  adminOfficer: ['admin.services', 'assets.manage', 'forms.view.restricted', 'tasks.admin'],
  payroll: ['emp.view.all', 'emp.view.salary', 'pay.view', 'pay.manage', 'export.data'],
  recruitment: ['rec.manage', 'train.manage', 'perf.manage'],
  executive: ['emp.view.all', 'req.view.all', 'pay.view', 'reports.exec', 'reports.hr', 'customs.view', 'announce.manage'],
  logistics: ['customs.view', 'customs.manage', 'export.data'],
  sysadmin: ['settings.manage', 'settings.workflow', 'audit.view', 'emp.view.all', 'forms.manage', 'export.data', 'backup', 'customs.view', 'customs.manage', 'announce.manage', 'tasks.admin']
};
const LATE_PERMS = ['announce.manage', 'tasks.admin'];
const MATRIX = () => { const st = SET(); if (!st.matrix) return DEFAULT_MATRIX; const known = st.matrixPerms || Object.keys(PERMS).filter(p => !LATE_PERMS.includes(p)); const m = { ...DEFAULT_MATRIX }; for (const [r, ps] of Object.entries(st.matrix)) m[r] = uniq([...(ps || []), ...(DEFAULT_MATRIX[r] || []).filter(p => !known.includes(p))]); return m; };
function rolesOf(e) {
  const r = new Set(['employee']); if (!e) return r;
  if (!(S.weakAuth && e.id === S.meId)) (e.roles || []).forEach(x => r.add(x)); // password-only sessions get employee-level roles only
  if (D.employees.list.some(x => x.managerId === e.id && x.status !== 'terminated')) r.add('manager');
  if (D.orgunits.list.some(u => u.managerId === e.id)) r.add('deptManager');
  return r;
}
function canE(e, p) { const m = MATRIX(); return [...rolesOf(e)].some(r => (m[r] || []).includes(p)); }
const can = p => canE(ME(), p);
const hasRole = r => rolesOf(ME()).has(r);
function teamIds(mgrId, deep = true) {
  const out = new Set(); const walk = id => D.employees.list.filter(e => e.managerId === id).forEach(e => { if (!out.has(e.id)) { out.add(e.id); if (deep) walk(e.id); } });
  walk(mgrId);
  D.orgunits.list.filter(u => u.managerId === mgrId).forEach(u => D.employees.list.filter(e => e.deptId === u.id || e.sectionId === u.id).forEach(e => e.id !== mgrId && out.add(e.id)));
  return out;
}
function canViewEmp(id) { if (id === S.meId) return true; if (can('emp.view.all') && inScope(id)) return true; return can('team.view') && teamIds(S.meId).has(id); }

/* ============ workflow engine ============ */
const STATUS = {
  pending: ['بانتظار الاعتماد', 'b-info'], returned: ['معاد للاستكمال', 'b-warn'], approved: ['مكتمل', 'b-ok'], rejected: ['مرفوض', 'b-bad'], cancelled: ['ملغى', ''],
  draft: ['مسودة', ''], review: ['بانتظار الاعتماد', 'b-info'], published: ['معتمد وساري', 'b-ok'], retired: ['ملغى', 'b-bad'],
  active: ['على رأس العمل', 'b-ok'], probation: ['فترة تجربة', 'b-info'], terminating: ['إجراءات إنهاء خدمة', 'b-warn'], terminated: ['منتهية خدمته', 'b-bad'],
  available: ['متاح', 'b-ok'], assigned: ['مسلّم لموظف', 'b-info'], maintenance: ['صيانة', 'b-warn'], disposed: ['مستبعد', ''],
  open: ['مفتوح', 'b-info'], closed: ['مغلق', ''], approvedReq: ['معتمد', 'b-ok']
};
const badge = (s, label) => { const [l, c] = STATUS[s] || [s, '']; return `<span class="badge ${c}">${esc(label || l)}</span>`; };
const PRIORITY = { low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة' };
const ASSIGNEE_KINDS = { manager: 'المدير المباشر', deptManager: 'مدير الإدارة', role: 'دور', employee: 'موظف محدد' };

function specLabel(a) { if (a.kind === 'role') return ROLES[a.role] || a.role; if (a.kind === 'employee') return empName(a.empId); return ASSIGNEE_KINDS[a.kind] || a.kind; }
function eligibleFor(spec, req) {
  const r = emp(req.empId); let ids = [];
  if (spec.kind === 'manager') ids = r?.managerId ? [r.managerId] : [];
  else if (spec.kind === 'deptManager') { const u = D.orgunits.map[r?.deptId]; ids = u?.managerId ? [u.managerId] : []; }
  else if (spec.kind === 'role') ids = D.employees.list.filter(e => e.status !== 'terminated' && rolesOf(e).has(spec.role)).map(e => e.id);
  else if (spec.kind === 'employee') ids = [spec.empId];
  const T0 = todayISO(); (SET().delegations || []).forEach(d => { if (d.from <= T0 && d.to >= T0 && ids.includes(d.fromId) && !ids.includes(d.toId)) ids.push(d.toId); });
  ids = ids.filter(id => id && id !== req.empId && emp(id) && emp(id).status !== 'terminated'); // فصل الصلاحيات: لا يعتمد صاحب الطلب طلبه
  if (!ids.length) ids = D.employees.list.filter(e => e.status !== 'terminated' && rolesOf(e).has('hrManager') && e.id !== req.empId).map(e => e.id);
  return ids;
}
function approvedIdx(st, i) { return st.decisions.some(d => d.specIdx === i && d.action === 'approve'); }
function myOpenSpecs(req, eid = S.meId) {
  if (req.status !== 'pending') return [];
  const st = req.stages?.[req.current]; if (!st || eid === req.empId) return [];
  return st.assignees.map((a, i) => i).filter(i => !approvedIdx(st, i) && eligibleFor(st.assignees[i], req).includes(eid));
}
const canAct = (req, eid) => myOpenSpecs(req, eid).length > 0;
function currentApprovers(req) { const st = req.stages?.[req.current]; if (!st || req.status !== 'pending') return []; return uniq(st.assignees.flatMap((a, i) => approvedIdx(st, i) ? [] : eligibleFor(a, req))); }
function isOverdue(req) { const st = req.stages?.[req.current]; return req.status === 'pending' && st?.dueAt && new Date(st.dueAt) < new Date(); }
function canViewReq(req) {
  if (!req) return false;
  const type = D.requestTypes.map[req.typeId];
  if (req.empId === S.meId) return true;
  if ((req.stages || []).some(st => st.assignees.some(a => eligibleFor(a, req).includes(S.meId)))) return true;
  if (type?.sensitive) return can('req.view.sensitive') && inScope(req.empId);
  if (can('req.view.all') && inScope(req.empId)) return true;
  if (type?.category === 'admin' && can('admin.services') && inScope(req.empId)) return true;
  if (type?.category === 'finance' && can('pay.view') && inScope(req.empId)) return true;
  return can('team.view') && teamIds(S.meId).has(req.empId);
}
function buildStages(type) {
  return (type.stages || []).map((s, i) => ({ name: s.name, mode: s.mode || 'any', actionLabel: s.actionLabel || 'اعتماد', slaHours: Number(s.slaHours) || Number(SET().defaultSla) || 48, assignees: clone(s.assignees || [{ kind: 'manager' }]), decisions: [], status: i === 0 ? 'active' : 'waiting' }));
}
function leaveDays(from, to) {
  if (!from || !to || to < from) return 0;
  const mode = SET().leaveCountMode || 'calendar'; const wk = SET().weekend || [5, 6]; let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00').getDay(); if (mode === 'calendar' || (!wk.includes(wd) && !(window.isHoliday && isHoliday(d)))) n++; }
  return n;
}
function balanceOf(empId, typeId) {
  const b = D.leaveBalances.map[empId + '_' + typeId]; const lt = D.leaveTypes.map[typeId];
  const entitled = b ? Number(b.entitled) : Number(lt?.annualDays || 0); const carried = Number(b?.carried || 0); const adj = Number(b?.adjust || 0);
  const used = D.requests.list.filter(r => r.empId === empId && r.effect === 'leave' && r.status === 'approved' && r.data?.leaveTypeId === typeId && String(r.data?.from || '').slice(0, 4) === String(new Date().getFullYear())).reduce((s, r) => s + Number(r.data?.days || 0), 0);
  const pending = D.requests.list.filter(r => r.empId === empId && r.effect === 'leave' && (r.status === 'pending' || r.status === 'returned') && r.data?.leaveTypeId === typeId).reduce((s, r) => s + Number(r.data?.days || 0), 0);
  return { entitled, carried, adj, used, pending, available: entitled + carried + adj - used - pending };
}
function validateRequest(type, data, empId, ignoreReqId) {
  const errs = [];
  errs.push(...validateFields(type.fields, data));
  if (type.needsAttachment && !(data._files || []).length) errs.push('هذا الطلب يتطلب إرفاق مستند');
  if (type.effect === 'leave') {
    if (data.from && data.to && data.to < data.from) errs.push('تاريخ نهاية الإجازة قبل تاريخ بدايتها');
    const days = leaveDays(data.from, data.to); data.days = days;
    const lt = D.leaveTypes.map[data.leaveTypeId];
    if (lt?.tracked !== false && lt) { const b = balanceOf(empId, data.leaveTypeId); const prev = ignoreReqId ? Number(D.requests.map[ignoreReqId]?.data?.days || 0) : 0; if (days > b.available + prev) errs.push(`الرصيد المتاح (${b.available + prev} يوم) لا يغطي ${days} يوم`); }
    const overlap = D.requests.list.find(r => r.id !== ignoreReqId && r.empId === empId && r.effect === 'leave' && ['pending', 'approved', 'returned'].includes(r.status) && r.data?.from <= data.to && r.data?.to >= data.from);
    if (overlap) errs.push('يوجد طلب إجازة آخر متداخل مع نفس الفترة: ' + overlap.ref);
  }
  if (type.effect === 'permission' && data.fromTime && data.toTime && toMin(data.toTime) <= toMin(data.fromTime)) errs.push('وقت نهاية الإذن قبل وقت بدايته');
  return errs;
}
async function createRequest(type, data, extra = {}) {
  const me = ME(); const at = nowISO(); const id = newId();
  const ref = await nextRef('REQ');
  const req = { ref, typeId: type.id, typeName: type.name, category: type.category, effect: type.effect || null, sensitive: !!type.sensitive, empId: extra.forEmpId || me.id, createdById: me.id, data, status: 'pending', current: 0, stages: buildStages(type), priority: extra.priority || type.defaultPriority || 'normal', assignedTo: null, targetDate: null, createdAt: at, updatedAt: at, history: [{ byId: me.id, action: 'submit', at, comment: '' }] };
  if (!req.stages.length) { req.status = 'approved'; req.closedAt = at; }
  else { req.stages[0].startedAt = at; req.stages[0].dueAt = addHours(at, req.stages[0].slaHours); }
  if (type.category === 'admin' && req.stages.length) req.targetDate = localISO(new Date(req.stages.reduce((s, x) => s + x.slaHours, 0) * 3600e3 + Date.now()));
  await put('requests', id, req);
  await audit('إنشاء طلب', 'request', id, `${ref} — ${type.name}`);
  if (req.status === 'approved') await applyEffects({ ...req, id });
  else await notify(currentApprovers({ ...req, id }), 'طلب جديد بانتظار إجرائك', `${type.name} — ${empName(req.empId)} (${ref})`, { view: 'request', id });
  return { id, ref };
}
async function actOnRequest(reqId, action, comment) {
  if (S.busy) return; S.busy = true;
  try {
    const req = clone(D.requests.map[reqId]); req.id = reqId;
    const idxs = myOpenSpecs(req);
    if (!idxs.length) throw new Error('لا تملك إجراءً على هذا الطلب في مرحلته الحالية');
    if ((action === 'reject' || action === 'return') && !comment?.trim()) throw new Error('اكتب سبب الرفض أو المطلوب استكماله');
    const st = req.stages[req.current]; const at = nowISO(); const meId = S.meId;
    const label = { approve: st.actionLabel || 'اعتماد', reject: 'رفض', return: 'إرجاع للاستكمال' }[action];
    if (action === 'approve') {
      (st.mode === 'any' ? [idxs[0]] : idxs).forEach(i => st.decisions.push({ byId: meId, specIdx: i, action, at, comment: comment || '' }));
      const done = st.mode === 'any' ? true : st.assignees.every((a, i) => approvedIdx(st, i));
      if (done) {
        st.status = 'done'; st.doneAt = at;
        if (req.current + 1 < req.stages.length) { req.current++; const n = req.stages[req.current]; n.status = 'active'; n.startedAt = at; n.dueAt = addHours(at, n.slaHours); }
        else { req.status = 'approved'; req.closedAt = at; }
      }
    } else if (action === 'reject') { st.decisions.push({ byId: meId, specIdx: idxs[0], action, at, comment }); st.status = 'done'; req.status = 'rejected'; req.closedAt = at; }
    else if (action === 'return') { st.decisions.push({ byId: meId, specIdx: idxs[0], action, at, comment }); req.status = 'returned'; }
    req.history.push({ byId: meId, action, at, comment: comment || '', stage: st.name, label });
    req.updatedAt = at;
    if (req.status === 'approved') { const out = await applyEffects(req, true); if (out) Object.assign(req, out); }
    await put('requests', reqId, strip(req));
    await audit(label, 'request', reqId, `${req.ref} — ${req.typeName}${comment ? ' — ' + comment : ''}`);
    if (req.status === 'pending' && st.status === 'done') await notify(currentApprovers(req), 'طلب جديد بانتظار إجرائك', `${req.typeName} — ${empName(req.empId)} (${req.ref})`, { view: 'request', id: reqId });
    const msg = { approved: 'تم إكمال طلبك', rejected: 'تم رفض طلبك', returned: 'طلبك يحتاج استكمال' }[req.status];
    if (msg) await notify([req.empId], msg, `${req.typeName} (${req.ref})${comment ? ' — ' + comment : ''}`, { view: 'request', id: reqId });
    else if (action === 'approve') await notify([req.empId], 'تقدم طلبك مرحلة', `${req.typeName} (${req.ref}) — ${st.name}: ${label}`, { view: 'request', id: reqId });
  } finally { S.busy = false; }
}
async function resubmitRequest(reqId, data) {
  const req = clone(D.requests.map[reqId]); const type = D.requestTypes.map[req.typeId];
  if (req.empId !== S.meId && req.createdById !== S.meId) throw new Error('فقط مقدم الطلب يستطيع إعادة إرساله');
  const errs = validateRequest(type || { fields: [] }, data, req.empId, reqId); if (errs.length) throw new Error(errs.join('\n'));
  const at = nowISO(); const st = req.stages[req.current];
  st.decisions = st.decisions.filter(d => d.action === 'approve'); st.status = 'active'; st.startedAt = at; st.dueAt = addHours(at, st.slaHours); st.escalated = false;
  req.data = data; req.status = 'pending'; req.updatedAt = at; req.history.push({ byId: S.meId, action: 'resubmit', at, comment: '' });
  await put('requests', reqId, strip(req)); await audit('إعادة إرسال طلب', 'request', reqId, req.ref);
  await notify(currentApprovers({ ...req, id: reqId }), 'طلب معاد بعد الاستكمال', `${req.typeName} — ${empName(req.empId)} (${req.ref})`, { view: 'request', id: reqId });
}
async function cancelRequest(reqId) {
  const req = clone(D.requests.map[reqId]);
  if (req.empId !== S.meId && req.createdById !== S.meId) throw new Error('فقط مقدم الطلب يستطيع إلغاءه');
  if (!['pending', 'returned'].includes(req.status)) throw new Error('لا يمكن إلغاء طلب مغلق');
  const at = nowISO(); req.status = 'cancelled'; req.closedAt = at; req.updatedAt = at; req.history.push({ byId: S.meId, action: 'cancel', at, comment: '' });
  await put('requests', reqId, strip(req)); await audit('إلغاء طلب', 'request', reqId, req.ref);
}
function fillTemplate(body, e, extra = {}) {
  const sal = D.salaries.map[e.id] || {}; const total = ['basic', 'housing', 'transport', 'other'].reduce((s, k) => s + Number(sal[k] || 0), 0);
  const vals = { name: e.nameAr, nameEn: e.nameEn, empNo: e.empNo, title: e.title, dept: unitName(e.deptId), location: unitName(e.locationId), nationality: e.nationality, hireDate: fmtD(e.hireDate), joinDate: fmtD(e.joinDate), basic: fmtN(sal.basic, 2), total: fmtN(total, 2), date: fmtD(todayISO()), company: SET().company || '', ...extra };
  return String(body || '').replace(/\{\{(\w+)\}\}/g, (m, k) => vals[k] != null && vals[k] !== '' ? vals[k] : `[${k}: غير متوفر]`);
}
async function applyEffects(req, inline) {
  const e = emp(req.empId); const d = req.data || {}; const at = nowISO(); const out = {};
  try {
    if (req.effect === 'attendanceFix' && d.date) {
      const id = req.empId + '_' + d.date; const cur = D.attendance.map[id] || {};
      await put('attendance', id, { ...strip(cur), empId: req.empId, date: d.date, in: d.in || cur.in || '', out: d.out || cur.out || '', shiftId: cur.shiftId || e?.shiftId || null, source: 'تصحيح معتمد ' + req.ref, updatedAt: at });
    }
    if (req.effect === 'letter') {
      const tpl = D.templates.map[D.requestTypes.map[req.typeId]?.templateId] || D.templates.list.find(t => t.kind === d.letterKind) || D.templates.list[0];
      if (tpl && e) out.output = { title: tpl.name, body: fillTemplate(tpl.body, e, { ref: req.ref, addressee: d.addressee || 'من يهمه الأمر', purpose: d.purpose || '' }), at };
      else out.output = { title: 'تعذر إصدار الخطاب', body: 'لا يوجد قالب معتمد مرتبط بهذا النوع. يرجى ربط قالب من الإعدادات.', at };
    }
    if (req.effect === 'finChange' && d.targetEmpId && d.element) {
      const cur = D.salaries.map[d.targetEmpId] || {}; const old = cur[d.element];
      await put('salaries', d.targetEmpId, { ...strip(cur), [d.element]: Number(d.newValue), effectiveDate: d.effectiveDate || todayISO(), updatedAt: at, lastRef: req.ref });
      await put('emphistory', newId(), { empId: d.targetEmpId, kind: 'salary', field: d.element, old: old ?? null, new: Number(d.newValue), reason: d.reason || '', ref: req.ref, byId: S.meId, at, sensitive: true });
    }
    if (req.effect === 'personalUpdate' && d.field && e) {
      const allowed = ['phone', 'email', 'address', 'emergencyName', 'emergencyPhone', 'maritalStatus', 'iban'];
      if (allowed.includes(d.field)) {
        await put('employees', e.id, { ...strip(e), [d.field]: d.value, updatedAt: at });
        await put('emphistory', newId(), { empId: e.id, kind: 'data', field: d.field, old: e[d.field] ?? '', new: d.value, reason: 'طلب تحديث بيانات ' + req.ref, ref: req.ref, byId: S.meId, at });
      }
    }
    if (req.effect === 'loan' && d.amount) {
      const inst = Math.max(1, Number(d.installments || 1));
      await put('loans', req.id, { empId: req.empId, ref: req.ref, amount: Number(d.amount), installments: inst, monthly: Math.round(Number(d.amount) / inst * 100) / 100, startMonth: d.startMonth || monthISO(), paid: [], status: 'open', createdAt: at });
    }
    if (req.effect === 'resignation' && e) {
      await put('employees', e.id, { ...strip(e), status: 'terminating', lastDay: d.lastDay || null, exitReason: 'استقالة — ' + req.ref, updatedAt: at });
      await put('emphistory', newId(), { empId: e.id, kind: 'action', field: 'status', old: e.status, new: 'terminating', reason: 'اعتماد استقالة ' + req.ref, ref: req.ref, byId: S.meId, at });
    }
    if (req.effect === 'training' && d.courseId) {
      await put('enrollments', req.empId + '_' + d.courseId, { empId: req.empId, courseId: d.courseId, status: 'enrolled', ref: req.ref, at });
    }
  } catch (err) { console.warn('effects', err); toast('اكتمل الطلب لكن تعذر تطبيق أثره تلقائيًا: ' + err.message, true); out.effectError = err.message; }
  if (!inline && Object.keys(out).length) await patch('requests', req.id, out);
  return out;
}
async function runEscalations() {
  if (S.escalated || !(hasRole('hrManager') || hasRole('sysadmin'))) return; S.escalated = true;
  for (const r of D.requests.list.filter(isOverdue)) {
    const st = r.stages[r.current]; if (st.escalated) continue;
    const req = clone(r); req.stages[req.current].escalated = nowISO();
    const type = D.requestTypes.map[r.typeId]; const role = type?.escalateRole || 'hrManager';
    try {
      await put('requests', r.id, strip(req));
      await notify([...currentApprovers(r), ...D.employees.list.filter(e => rolesOf(e).has(role) && e.id !== r.empId).map(e => e.id)], 'تصعيد: معاملة متجاوزة للمدة', `${r.typeName} (${r.ref}) — المرحلة: ${st.name}`, { view: 'request', id: r.id });
      await audit('تصعيد تلقائي', 'request', r.id, r.ref);
    } catch (e) { console.warn(e); }
  }
}
function computedAlerts() {
  const out = []; const days = Number(SET().contractAlertDays || 60); const t = todayISO(); const lim = addDays(t, days);
  if (!(can('emp.view.all') && (hasRole('personnel') || hasRole('hrManager')))) return out;
  D.employees.list.filter(e => e.status !== 'terminated' && inScope(e.id)).forEach(e => {
    if (e.contractEnd && e.contractEnd <= lim) out.push({ title: e.contractEnd < t ? 'عقد منتهٍ' : 'عقد قريب الانتهاء', body: `${e.nameAr} — ينتهي ${fmtD(e.contractEnd)}`, link: { view: 'employee', id: e.id }, bad: e.contractEnd < t });
    if (e.idExpiry && e.idExpiry <= lim) out.push({ title: e.idExpiry < t ? 'هوية/إقامة منتهية' : 'هوية/إقامة قريبة الانتهاء', body: `${e.nameAr} — ${fmtD(e.idExpiry)}`, link: { view: 'employee', id: e.id }, bad: e.idExpiry < t });
    if (e.probationEnd && e.probationEnd >= t && e.probationEnd <= addDays(t, 14)) out.push({ title: 'نهاية فترة التجربة', body: `${e.nameAr} — ${fmtD(e.probationEnd)}`, link: { view: 'employee', id: e.id } });
    (e.docs || []).forEach(d => { if (d.expiry && d.expiry <= lim) out.push({ title: 'مستند قريب الانتهاء', body: `${e.nameAr} — ${d.name} — ${fmtD(d.expiry)}`, link: { view: 'employee', id: e.id }, bad: d.expiry < t }); });
  });
  return out;
}

/* ============ UI primitives ============ */
function toast(msg, err) { const t = document.createElement('div'); if (err) t.className = 'err'; t.textContent = msg; $('#toast').appendChild(t); setTimeout(() => t.remove(), err ? 6500 : 3200); }
async function guard(fn) { try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), true); } }
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', plus: 'M12 5v14M5 12h14', inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  building: 'M3 21h18M5 21V5l7-3 7 3v16M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1', file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6',
  star: 'M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z', money: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01', chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', menu: 'M3 6h18M3 12h18M3 18h18', x: 'M18 6L6 18M6 6l12 12', calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM15.5 7.5l3 3L22 7l-3-3', box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', mail: 'M4 4h16v16H4zM4 6l8 7 8-7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', swap: 'M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4', check: 'M20 6L9 17l-5-5', alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  grad: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5', door: 'M3 21h18M6 21V3h12v18M14 12h.01', down: 'M12 3v12M7 10l5 5 5-5M5 21h14', au: 'M12 19V5M5 12l7-7 7 7', ad: 'M12 5v14M19 12l-7 7-7-7', up: 'M12 21V9M7 14l5-5 5 5M5 3h14'
};
const ic = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[n] || ICONS.file}"/></svg>`;

function pageHead(title, sub, actions = '') { return `<div class="ph"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`; }
function tabs(group, items, def) {
  const cur = S.tabs[group] && items.some(i => i[0] === S.tabs[group]) ? S.tabs[group] : (def || items[0]?.[0]);
  S.tabs[group] = cur;
  return { cur, html: `<div class="tabs" role="tablist">${items.map(([k, l]) => `<button role="tab" aria-selected="${k === cur}" data-act="tab" data-g="${group}" data-k="${k}">${esc(l)}</button>`).join('')}</div>` };
}
function kpi(label, val, note, alert) { return `<div class="kpi ${alert ? 'alert' : ''}"><span>${esc(label)}</span><b>${val}</b>${note ? `<i title="${esc(note)}">${esc(note)}</i>` : ''}</div>`; }
function bars(rows, total) { const max = Math.max(1, ...rows.map(r => r[1])); return rows.length ? `<div class="bars">${rows.map(([l, v]) => `<div class="bar"><span>${esc(l)}</span><div class="t"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><b class="num">${fmtN(v)}</b></div>`).join('')}</div>` : `<div class="empty">لا توجد بيانات بعد</div>`; }
function empty(t) { return `<div class="empty">${t}</div>`; }
function avatar(e, lg) { return `<div class="av ${lg ? 'lg' : ''}">${esc(initials(e?.nameAr))}</div>`; }

/* generic table: cols [{k,l,v:(row)=>html, s:(row)=>sortval, txt:(row)=>searchtext}] */
function dataTable(id, cols, rows, o = {}) {
  const q = (S.q[id] || '').trim().toLowerCase();
  let r = rows;
  if (q) r = r.filter(x => cols.map(c => c.txt ? c.txt(x) : (c.s ? c.s(x) : x[c.k])).join(' ').toLowerCase().includes(q));
  const so = S.sort[id];
  if (so) { const c = cols.find(c => c.k === so.k); if (c) r = [...r].sort(by(x => { const v = c.s ? c.s(x) : x[c.k]; return v == null ? '' : v; }, so.d)); }
  const head = cols.map(c => `<th class="${c.nosort ? '' : 's'}" ${c.nosort ? '' : `data-act="sort" data-t="${id}" data-k="${c.k}"`}>${esc(c.l)}${so?.k === c.k ? (so.d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const body = r.length ? r.map(x => `<tr ${o.rowAct ? `class="click" data-act="${o.rowAct}" data-id="${esc(x.id)}" tabindex="0"` : ''}>${cols.map(c => `<td>${c.v ? c.v(x) : esc(x[c.k] ?? '—')}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}">${empty(o.empty || 'لا توجد سجلات')}</td></tr>`;
  return `<div class="toolbar">${o.search === false ? '' : `<input class="q" id="q-${id}" data-q="${id}" placeholder="بحث…" value="${esc(S.q[id] || '')}" aria-label="بحث في الجدول">`}${o.tools || ''}<span class="count">${fmtN(r.length)} سجل</span></div><div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* form fields */
function fld(name, label, o = {}) {
  const v = o.value ?? ''; const req = o.required ? ' required' : ''; const lab = `<label for="f-${name}">${esc(label)}${o.required ? ' <span class="req">*</span>' : ''}</label>`;
  let input;
  if (o.type === 'select') input = `<select id="f-${name}" name="${name}"${req}>${o.blank === false ? '' : `<option value="">— اختر —</option>`}${(o.options || []).map(op => { const [k, l] = Array.isArray(op) ? op : [op, op]; return `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  else if (o.type === 'textarea') input = `<textarea id="f-${name}" name="${name}"${req}>${esc(v)}</textarea>`;
  else if (o.type === 'checks') input = `<div class="checks">${(o.options || []).map(op => { const [k, l] = Array.isArray(op) ? op : [op, op]; return `<label><input type="checkbox" name="${name}[]" value="${esc(k)}" ${(v || []).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`; }).join('')}</div>`;
  else if (o.type === 'checkbox') input = `<div class="checks"><label><input type="checkbox" id="f-${name}" name="${name}" ${v ? 'checked' : ''}${req}> ${esc(o.cbLabel || 'نعم')}</label></div>`;
  else if (o.type === 'radio') input = `<div class="checks" role="radiogroup">${(o.options || []).map((op, i) => { const [k, l] = Array.isArray(op) ? op : [op, op]; return `<label><input type="radio" ${i === 0 ? `id="f-${name}"` : ''} name="${name}" value="${esc(k)}" ${String(k) === String(v) ? 'checked' : ''}${req}> ${esc(l)}</label>`; }).join('')}</div>`;
  else if (o.type === 'file') input = `<input type="file" id="f-${name}" name="${name}" ${o.multiple ? 'multiple' : ''} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv,.txt">`;
  else input = `<input id="f-${name}" name="${name}" type="${o.type || 'text'}" value="${esc(v)}"${req}${o.min != null ? ` min="${o.min}"` : ''}${o.max != null ? ` max="${o.max}"` : ''}${o.step ? ` step="${o.step}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>`;
  return `<div class="fld ${o.full ? 'full' : ''}">${lab}${input}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
}
function readForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'file' || el.type === 'submit' || el.tagName === 'BUTTON') continue;
    if (el.name.endsWith('[]')) { const k = el.name.slice(0, -2); o[k] = o[k] || []; if (el.checked) o[k].push(el.value); continue; }
    if (el.type === 'checkbox') { o[el.name] = el.checked; continue; }
    if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; else if (!(el.name in o)) o[el.name] = ''; continue; }
    o[el.name] = el.value.trim();
  }
  for (const k of Object.keys(o)) if (k.startsWith('cf_')) { o.custom = o.custom || {}; o.custom[k.slice(3)] = o[k]; delete o[k]; }
  return o;
}
async function uploadFiles(input) {
  const files = [...(input?.files || [])]; if (!files.length) return [];
  if (!S.assets) throw new Error('رفع الملفات غير متاح لحسابك في هذه المشاركة (يتطلب صلاحية مساهم أو محرر)');
  const out = [];
  for (const f of files) { if (f.size > 20 * 1024 * 1024) throw new Error(`الملف ${f.name} أكبر من 20 ميجابايت`); const r = await S.assets.upload(f); out.push({ id: r.id, name: f.name, size: f.size, type: f.type, at: nowISO(), byId: S.meId }); }
  return out;
}
const fileLink = f => `<a href="/_blob/${esc(f.id)}" target="_blank" rel="noopener">${ic('file', 'ic')} ${esc(f.name)}</a>`;
async function saveFile(filename, data, mime) {
  if (!S.downloads) { toast('التنزيل غير متاح في هذا العرض', true); return; }
  try { await S.downloads.save({ filename, data: new Blob([data], { type: mime || 'text/plain;charset=utf-8' }) }); await audit('تصدير', 'export', null, filename); }
  catch (e) { if (e?.code !== 'cancelled' && e?.code !== 'declined') toast('لم يتم التنزيل: ' + (e.message || e.code), true); }
}
function toCSV(rows) { return '﻿' + rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n'); }
function parseCSV(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(x => x.replace(/^﻿/, '').trim())).filter(r => r.some(Boolean));
}

/* modal */
function openModal(title, body, footer = '', wide) {
  $('#modal-root').innerHTML = `<div class="modal-bg" data-act="modal-bg"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="icon-btn" data-act="close-modal" aria-label="إغلاق">${ic('x')}</button></header><div class="mb">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</div></div>`;
  const f = $('#modal-root input:not([type=hidden]),#modal-root select,#modal-root textarea'); if (f) f.focus();
}
function closeModal() { $('#modal-root').innerHTML = ''; }
function confirmBox(text, onYes, yesLabel = 'تأكيد') {
  openModal('تأكيد الإجراء', `<p>${text}</p>`, `<button class="btn danger" data-act="confirm-yes">${esc(yesLabel)}</button><button class="btn" data-act="close-modal">تراجع</button>`);
  S.confirmFn = onYes;
}
