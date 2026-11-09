/* ===== Platform page permissions (matrix set by the system admin) ===== */
// HR pages the admin can grant: N/A · Viewer · Auditor · Editor. Self-service pages are always available to the employee for his own data.
const WADY_PERM_MAP = {
  'emp.view.all': ['employees', 1], 'team.view': ['employees', 1], 'emp.edit': ['employees', 3], 'emp.view.disciplinary': ['employees', 2], 'letters.issue': ['employees', 3], 'tasks.admin': ['employees', 3], 'req.view.all': ['employees', 2],
  'emp.view.sensitive': ['docs', 1], 'req.view.sensitive': ['docs', 2], 'emp.view.salary': ['payroll', 1], 'pay.view': ['payroll', 1], 'pay.manage': ['payroll', 3], 'pay.approve': ['payroll', 3],
  'admin.services': ['adminaffairs', 3], 'assets.manage': ['adminaffairs', 3], 'customs.view': ['customs', 1], 'customs.manage': ['customs', 3],
  'perf.manage': ['talent', 3], 'rec.manage': ['talent', 3], 'train.manage': ['talent', 3], 'forms.manage': ['forms', 3], 'forms.view.restricted': ['forms', 2], 'forms.approve': ['forms', 3], 'announce.manage': ['forms', 3],
  'att.manage': ['attendance', 3], 'leave.manage': ['attendance', 3], 'reports.hr': ['reports', 1], 'reports.exec': ['reports', 1],
  'settings.workflow': ['settings', 3], 'settings.manage': ['settings', 3], 'audit.view': ['settings', 2], 'backup': ['settings', 3]
};
const WADY_STAFF_PAGES = ['employees', 'directory', 'orgchart', 'calendar', 'attendance', 'docs', 'talent', 'adminaffairs', 'forms', 'customs', 'payroll', 'reports', 'imports', 'settings'];
{ const _canE = canE; canE = function (e, p) {
    if (_canE(e, p)) return true;
    if (!e || e.id !== S.meId) return false;
    if (p === 'export.data') return WADY_STAFF_PAGES.some(x => wadyLvl('hr', x) >= 2);
    const m = WADY_PERM_MAP[p]; return !!m && wadyLvl('hr', m[0]) >= m[1];
  }; }
{ const _pn = portalNavOk; portalNavOk = function (v) {
    if (wadyLvl('hr', v) >= 1) return true;
    const staff = WADY_PERM.admin || (typeof ME === 'function' && ME() && adminRolesOf(ME()).length);
    // an employee sees his own data only: colleague-wide pages need a grant (the calendar also shows a manager's own team)
    if (!staff && (v === 'directory' || v === 'orgchart')) return false;
    if (!staff && v === 'calendar') return D.employees.list.some(e => e.managerId === S.meId) && _pn(v);
    return _pn(v); }; }
// writes to staff data need Editor on the page that owns that data (server rules apply as well)
const WADY_COL_PAGE = { employees: 'employees', emphistory: 'employees', empsecure: 'docs', emphistory_s: 'docs', salaries: 'payroll', loans: 'payroll', adjustments: 'payroll',
  attmonths: 'attendance', leaveBalances: 'attendance', assets: 'adminaffairs', handovers: 'adminaffairs', shipments: 'customs', brokers: 'customs',
  requisitions: 'talent', candidates: 'talent', courses: 'talent', enrollments: 'talent', reviews: 'talent', kpiTemplates: 'talent', forms: 'forms', announcements: 'forms',
  settings: 'settings', orgunits: 'settings', requestTypes: 'settings', leaveTypes: 'settings', templates: 'settings', shifts: 'settings', access: 'settings' };
window.WADY_GUARD = col => {
  if (WADY_PERM.admin) return null; const pg = WADY_COL_PAGE[col]; if (!pg) return null;
  const roles = (typeof ME === 'function' && ME()) ? adminRolesOf(ME()) : []; if (roles.length) return null;   // HR-platform roles keep their own rules
  const l = wadyLvl('hr', pg); return l >= 3 ? null : 'صلاحيتك على هذه الصفحة ' + (l === 2 ? 'تدقيق' : l === 1 ? 'عرض' : 'غير متاحة') + ' فقط — التعديل يحتاج صلاحية محرر';
};
