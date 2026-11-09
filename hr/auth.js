'use strict';
/* ============ Sign-in accounts: username + password ============
   How identity works on this platform:
   - Every viewer is first signed in to Claude (server identity, S.uid).
   - Strong link: the system administrator binds a Claude account to an employee file (access.userId, server-protected).
   - Password link (this file): an employee signs in once with the username + temporary password issued to them
     (from the employees Excel import, the accounts import or the accounts screen). That binds their Claude account
     to their file in "logins" and they must choose a new password before entering.
     A password-only link always gets employee-level access (assigned roles are ignored); administrative roles
     still need the strong link from Settings → Account links.
   - Password hashes: PBKDF2-SHA256, random 16-byte salt per account, 100,000 iterations. Plain passwords are never stored.
   Enforcement is in the application: the creds/logins collections are writable at the "interact" sharing level. */
const AUTH = { ITER: 100000, LOCK_N: 5, LOCK_MIN: 15 };
const authCfg = () => ({ sessionPw: SET().auth?.sessionPw !== false, minLen: Math.max(6, Number(SET().auth?.minLen || 8)) });
const USER_RE = /^[a-z0-9._-]{3,32}$/;
const normUser = u => String(u ?? '').trim().toLowerCase().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const credOf = empId => RAW.creds.map[empId];
const credByUser = u => { const n = normUser(u); return n ? RAW.creds.list.find(c => c.username === n) : null; };
const toHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => Uint8Array.from((h || '').match(/../g) || [], x => parseInt(x, 16));
async function pwHash(pw, saltHex, iter) {
  if (!crypto?.subtle) throw new Error(LX('المتصفح لا يدعم التشفير الآمن المطلوب لكلمات المرور', 'This browser does not support the secure hashing needed for passwords'));
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16)); const it = iter || AUTH.ITER;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, key, 256);
  return { salt: toHex(salt), hash: toHex(bits), iter: it, algo: 'PBKDF2-SHA256' };
}
function ctEq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function pwVerify(pw, c) { if (!c?.hash || !c?.salt) return false; const h = await pwHash(pw, c.salt, c.iter); return ctEq(h.hash, c.hash); }
function genPw(n = 10) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let s;
  do { s = [...crypto.getRandomValues(new Uint8Array(n * 2))].filter(x => x < 224).slice(0, n).map(x => A[x % A.length]).join(''); } while (s.length < n || !/[0-9]/.test(s) || !/[A-Z]/.test(s) || !/[a-z]/.test(s));
  return s;
}
function pwPolicy(pw, username) {
  const m = authCfg().minLen; pw = String(pw || '');
  if (pw.length < m) return LX(`كلمة المرور ${m} أحرف على الأقل`, `The password must be at least ${m} characters`);
  if (!/[0-9]/.test(pw) || !/[A-Za-z؀-ۿ]/.test(pw)) return LX('كلمة المرور يجب أن تجمع بين حروف وأرقام', 'The password must mix letters and digits');
  if (username && pw.toLowerCase().includes(username)) return LX('كلمة المرور لا يصح أن تحتوي على اسم المستخدم', 'The password must not contain the username');
  return '';
}
const tempPolicy = pw => String(pw || '').length < 6 ? LX('كلمة المرور المؤقتة 6 أحرف على الأقل، أو اتركها فارغة لتوليدها تلقائيًا', 'Temporary password needs 6+ characters, or leave it blank to generate one') : '';
function usernameError(u, exceptEmpId) {
  if (!USER_RE.test(u)) return LX('اسم المستخدم: حروف إنجليزية صغيرة وأرقام و . _ - من 3 إلى 32 حرفًا', 'Username: lowercase English letters, digits and . _ - (3 to 32 characters)');
  const o = credByUser(u); if (o && o.empId !== exceptEmpId) return LX('اسم المستخدم مستخدم لموظف آخر', 'The username belongs to another employee');
  return '';
}
async function setCred(empId, username, pw, o = {}) {
  const cur = credOf(empId); const h = await pwHash(pw); const at = nowISO();
  const doc = { ...(cur ? strip(cur) : {}), empId, username, ...h, mustChange: o.mustChange !== false, active: true, failed: 0, lockedUntil: null, stamp: o.keepStamp && cur?.stamp ? cur.stamp : newId(), setAt: at, setById: S.meId || null, createdAt: cur?.createdAt || at, createdById: cur?.createdById || S.meId || null };
  await rawPut('creds', empId, doc); RAW.creds.map[empId] = { ...doc, id: empId }; if (!RAW.creds.list.some(c => c.id === empId)) RAW.creds.list.push(RAW.creds.map[empId]);
  return doc;
}
/* per-tab session flag: "this tab already entered the password" */
const sessKey = () => 'hr.auth.' + (S.uid || 'x');
function sessGet() { try { return sessionStorage.getItem(sessKey()) || S.authPass || ''; } catch (e) { return S.authPass || ''; } }
function sessSet(v) { S.authPass = v || ''; try { v ? sessionStorage.setItem(sessKey(), v) : sessionStorage.removeItem(sessKey()); } catch (e) { } }
const sessOk = c => !!c && sessGet() === S.meId + ':' + c.stamp;

/* ---------- identity: strong link first, then a valid password link ---------- */
const _resolveIdentityBase = resolveIdentity;
resolveIdentity = function () {
  const strong = S.uid ? D.employees.list.find(e => e.userId === S.uid && e.status !== 'terminated') : null;
  if (strong || !S.uid) { S.weakAuth = false; return _resolveIdentityBase(); }
  const b = RAW.logins.map[S.uid]; const c = b && credOf(b.empId); const e = b && emp(b.empId);
  const ok = !!(b && c && c.active !== false && c.stamp === b.stamp && e && e.status !== 'terminated' && (!e.userId || e.userId === S.uid));
  S.weakAuth = ok; const id = ok ? e.id : null;
  if (id !== S.meId) { S.meId = id; S.escalated = false; }
};

/* ---------- screens ---------- */
const pwInput = (name, label, o = {}) => `<div class="fld ${o.full === false ? '' : 'full'}"><label for="f-${name}">${esc(label)}${o.required !== false ? ' <span class="req">*</span>' : ''}</label><div class="pw-wrap"><input id="f-${name}" name="${name}" type="password" autocomplete="${o.ac || 'current-password'}" ${o.required !== false ? 'required' : ''} dir="ltr" style="width:100%"><button type="button" class="pw-eye" data-act="pw-eye" data-for="f-${name}">${LX('إظهار', 'Show')}</button></div>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
ACT['pw-eye'] = el => { const i = document.getElementById(el.dataset.for); if (!i) return; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.textContent = show ? LX('إخفاء', 'Hide') : LX('إظهار', 'Show'); };
function authShell(inner) {
  return `<div class="login"><div class="card auth-card" id="auth-card"><div class="row" style="justify-content:flex-end;margin-bottom:-8px">${langBtn()}</div><div class="brand" style="border:0;padding:0;margin:0">${brandMark()}<div><b>${esc(SET().company || 'منصة الموارد البشرية')}</b><span class="muted">${LX('الموارد البشرية والشؤون الإدارية', 'HR & Administrative Affairs')}</span></div></div>${inner}</div></div>`;
}
const loginForm = () => `<form class="form" data-form="pw-login" id="pw-login" autocomplete="on">${fld('username', LX('اسم المستخدم', 'Username'), { required: true, full: true })}${pwInput('password', LX('كلمة المرور', 'Password'))}<div class="fld full"><button class="btn pri">${LX('دخول', 'Sign in')}</button></div></form>`;

const _renderUnlinkedBase = renderUnlinked;
renderUnlinked = function () {
  if (!S.uid || !RAW.creds.list.length) { S.authShown = null; return _renderUnlinkedBase(); }
  const r = RAW.linkreqs.map[S.uid]; const key = 'login:' + (r ? r.status + r.at : '') + ':' + D.employees.list.some(e => e.userId) + LANG;
  if (S.authShown === key && $('#auth-card')) return; // keep what the user typed across live database updates
  _renderUnlinkedBase(); S.authShown = key;
  const card = $('#root .login .card'); const h1 = card?.querySelector('h1'); if (!card || !h1) return;
  card.classList.add('auth-card'); card.id = 'auth-card';
  const rest = []; let n = h1.nextSibling; while (n) { rest.push(n); n = n.nextSibling; }
  const intro = document.createElement('div');
  intro.innerHTML = `<p class="small muted" style="margin:0 0 10px">${LX('ادخل باسم المستخدم وكلمة المرور التي استلمتها من الموارد البشرية. عند أول دخول يُطلب منك اختيار كلمة مرور جديدة.', 'Sign in with the username and password you received from HR. On your first sign-in you will choose a new password.')}</p>${loginForm()}<div class="auth-or">${LX('أو', 'or')}</div>`;
  const det = document.createElement('details'); det.className = 'small';
  det.innerHTML = `<summary style="cursor:pointer">${LX('ليس لدي اسم مستخدم — اطلب ربط حسابي برقمي الوظيفي', 'I have no username — request a link by employee number')}</summary>`;
  const box = document.createElement('div'); box.style.marginTop = '10px'; rest.forEach(x => box.appendChild(x)); det.appendChild(box);
  if (RAW.linkreqs.map[S.uid]) det.open = true;
  h1.after(intro, det);
};

function authGate() {
  if (IS_STAGING || !S.meId) { S.authShown = null; return false; }
  const c = credOf(S.meId);
  if (!c || c.active === false) { S.authShown = null; return false; }
  const passed = sessOk(c); const e = ME();
  if (c.mustChange) {
    const key = 'change:' + passed + ':' + c.stamp + LANG; if (S.authShown === key && $('#auth-card')) return true;
    S.authShown = key; closeModal();
    $('#root').innerHTML = authShell(`<h1>${LX('اختر كلمة مرور جديدة', 'Choose a new password')}</h1><p class="small muted" style="margin:0 0 10px">${LX(`مرحبًا ${esc((e?.nameAr || '').split(' ')[0])}. كلمة المرور الحالية مؤقتة، ولا يمكن الدخول قبل تغييرها.`, `Welcome ${esc(e?.nameEn || e?.nameAr || '')}. Your current password is temporary; change it to continue.`)}</p>${changeForm(!passed, c)}<div class="row" style="margin-top:12px"><button class="btn ghost sm" data-act="auth-logout">${LX('خروج', 'Sign out')}</button></div>`);
    return true;
  }
  if (authCfg().sessionPw && !passed) {
    const locked = c.lockedUntil && c.lockedUntil > nowISO(); const key = 'unlock:' + c.stamp + ':' + !!locked + LANG;
    if (S.authShown === key && $('#auth-card')) return true;
    S.authShown = key; closeModal();
    $('#root').innerHTML = authShell(`<h1>${LX('تسجيل الدخول', 'Sign in')}</h1><div class="row" style="margin:6px 0 12px">${avatar(e)}<div><b>${esc(e?.nameAr)}</b><div class="small muted" dir="ltr" style="text-align:start">${esc(c.username)}</div></div></div>${locked ? `<div class="note bad small" style="margin-bottom:10px">${lockMsg(c)}</div>` : ''}<form class="form" data-form="pw-unlock" id="pw-unlock">${pwInput('password', LX('كلمة المرور', 'Password'))}<div class="fld full"><button class="btn pri">${LX('دخول', 'Sign in')}</button></div></form><div class="row" style="margin-top:12px;justify-content:space-between"><span class="small muted">${LX('نسيت كلمة المرور؟ اطلب إعادة تعيينها من مدير النظام.', 'Forgot it? Ask the system administrator to reset it.')}</span>${S.weakAuth ? `<button class="btn ghost sm" data-act="auth-logout">${LX('الدخول بمستخدم آخر', 'Use another account')}</button>` : ''}</div>`);
    setTimeout(() => $('#f-password')?.focus(), 30);
    return true;
  }
  S.authShown = null; return false;
}
const lockMsg = c => LX(`الحساب مقفل مؤقتًا بعد ${AUTH.LOCK_N} محاولات خاطئة. حاول بعد ${Math.max(1, Math.ceil((new Date(c.lockedUntil) - Date.now()) / 60000))} دقيقة أو اطلب فتحه من مدير النظام.`, `Account locked after ${AUTH.LOCK_N} wrong attempts. Try again in ${Math.max(1, Math.ceil((new Date(c.lockedUntil) - Date.now()) / 60000))} min or ask the administrator to unlock it.`);
function changeForm(needCur, c) {
  return `<form class="form" data-form="pw-change" id="pw-change" ${needCur ? 'data-needcur="1"' : ''}><input type="text" name="u" value="${esc(c?.username || '')}" autocomplete="username" hidden>${needCur ? pwInput('cur', c?.mustChange ? LX('كلمة المرور المؤقتة', 'Temporary password') : LX('كلمة المرور الحالية', 'Current password')) : ''}${pwInput('p1', LX('كلمة المرور الجديدة', 'New password'), { ac: 'new-password', hint: LX(`${authCfg().minLen} أحرف على الأقل، تجمع بين حروف وأرقام، ولا تحتوي اسم المستخدم`, `At least ${authCfg().minLen} characters, letters and digits, without the username`) })}${pwInput('p2', LX('تأكيد كلمة المرور الجديدة', 'Confirm new password'), { ac: 'new-password' })}<div class="fld full"><button class="btn pri">${LX('حفظ كلمة المرور', 'Save password')}</button></div></form>`;
}

/* ---------- sign-in handlers ---------- */
async function failAttempt(c, why) {
  const failed = (c.failed || 0) + 1; const lock = failed >= AUTH.LOCK_N ? new Date(Date.now() + AUTH.LOCK_MIN * 60000).toISOString() : null;
  try { await rawUpdate('creds', c.id, { failed: lock ? 0 : failed, lockedUntil: lock, lastFailAt: nowISO() }); } catch (e) { console.warn(e); }
  await audit(lock ? 'قفل حساب دخول بعد محاولات خاطئة' : 'محاولة دخول فاشلة', 'creds', c.empId, `${c.username} — ${why}`);
  return lock;
}
FORM['pw-login'] = async f => {
  const v = readForm(f); const pw = f.elements.password.value; const c = credByUser(v.username);
  const bad = LX('اسم المستخدم أو كلمة المرور غير صحيحة', 'Wrong username or password');
  if (!c) { await audit('محاولة دخول فاشلة', 'creds', null, 'اسم مستخدم غير معروف: ' + normUser(v.username).slice(0, 40)); return toast(bad, true); }
  if (c.lockedUntil && c.lockedUntil > nowISO()) return toast(lockMsg(c), true);
  if (!(await pwVerify(pw, c))) { const l = await failAttempt(c, 'كلمة مرور خاطئة'); return toast(l ? lockMsg({ lockedUntil: l }) : bad, true); }
  const e = emp(c.empId);
  if (c.active === false || !e || e.status === 'terminated') return toast(LX('الحساب موقوف. تواصل مع الموارد البشرية.', 'This account is disabled. Contact HR.'), true);
  if (e.userId && e.userId !== S.uid) return toast(LX('هذا الملف مربوط بحساب Claude آخر. تواصل مع مدير النظام لإعادة الربط.', 'This employee file is linked to another Claude account. Ask the administrator to re-link it.'), true);
  const at = nowISO();
  for (const x of RAW.logins.list.filter(x => x.empId === c.empId && x.id !== S.uid)) { try { await remove('logins', x.id); } catch (err) { } } // one Claude account per employee
  await rawPut('logins', S.uid, { uid: S.uid, empId: c.empId, stamp: c.stamp, at });
  RAW.logins.map[S.uid] = { uid: S.uid, empId: c.empId, stamp: c.stamp, at, id: S.uid };
  try { await rawUpdate('creds', c.id, { failed: 0, lockedUntil: null, lastLoginAt: at }); } catch (err) { }
  sessSet(c.empId + ':' + c.stamp); S.meId = c.empId; S.weakAuth = true; S.loginLogged = true; S.authShown = null;
  await audit('تسجيل دخول باسم المستخدم', 'session', c.empId, `${e.nameAr} (${c.username})`);
  renderAll(true);
};
FORM['pw-unlock'] = async f => {
  const c = credOf(S.meId); if (!c) return renderAll(true);
  if (c.lockedUntil && c.lockedUntil > nowISO()) return toast(lockMsg(c), true);
  if (!(await pwVerify(f.elements.password.value, c))) { const l = await failAttempt(c, 'كلمة مرور خاطئة عند فتح الجلسة'); f.elements.password.value = ''; return toast(l ? lockMsg({ lockedUntil: l }) : LX('كلمة المرور غير صحيحة', 'Wrong password'), true); }
  try { await rawUpdate('creds', c.id, { failed: 0, lockedUntil: null, lastLoginAt: nowISO() }); } catch (err) { }
  sessSet(S.meId + ':' + c.stamp); S.authShown = null;
  await audit('تسجيل دخول بكلمة المرور', 'session', S.meId, `${empName(S.meId)} (${c.username})`);
  renderAll(true);
};
FORM['pw-change'] = async f => {
  const c = credOf(S.meId); if (!c) return;
  const cur = f.elements.cur?.value, p1 = f.elements.p1.value, p2 = f.elements.p2.value;
  if (f.dataset.needcur) {
    if (c.lockedUntil && c.lockedUntil > nowISO()) return toast(lockMsg(c), true);
    if (!(await pwVerify(cur, c))) { const l = await failAttempt(c, 'كلمة مرور حالية خاطئة عند التغيير'); return toast(l ? lockMsg({ lockedUntil: l }) : LX('كلمة المرور الحالية غير صحيحة', 'The current password is wrong'), true); }
  }
  if (p1 !== p2) return toast(LX('كلمتا المرور غير متطابقتين', 'The new passwords do not match'), true);
  const err = pwPolicy(p1, c.username); if (err) return toast(err, true);
  if (await pwVerify(p1, c)) return toast(LX('اختر كلمة مرور مختلفة عن الحالية', 'Choose a password different from the current one'), true);
  const h = await pwHash(p1);
  await rawPut('creds', c.id, { ...strip(c), ...h, mustChange: false, failed: 0, lockedUntil: null, changedAt: nowISO() });
  RAW.creds.map[c.id] = { ...RAW.creds.map[c.id], ...h, mustChange: false };
  sessSet(S.meId + ':' + c.stamp); S.authShown = null;
  await audit('تغيير كلمة المرور', 'creds', S.meId, c.username);
  closeModal(); toast(LX('تم تغيير كلمة المرور', 'Password changed')); renderAll(true);
};
ACT['auth-logout'] = async () => {
  const id = S.meId; sessSet('');
  if (S.weakAuth && S.uid) { try { await remove('logins', S.uid); } catch (e) { } delete RAW.logins.map[S.uid]; }
  if (id) await audit('تسجيل خروج', 'session', id, empName(id));
  S.meId = null; S.weakAuth = false; S.loginLogged = false; S.authShown = null; closeModal(); renderAll(true);
};
ACT['pw-change-open'] = () => { const c = credOf(S.meId); if (!c) return; openModal(LX('تغيير كلمة المرور', 'Change password'), `<div class="small muted" dir="ltr" style="text-align:start">${esc(c.username)}</div>${changeForm(true, c)}`); };
function authSelfButtons() {
  const c = credOf(S.meId); if (!c) return '';
  return `<button class="btn" data-act="pw-change-open">${ic('key')} ${LX('تغيير كلمة المرور', 'Change password')}</button><button class="btn ghost" data-act="auth-logout">${LX('تسجيل الخروج', 'Sign out')}</button>`;
}

/* ---------- issued credentials (shown once) ---------- */
function showIssued(list, title) {
  S.lastIssued = list;
  const one = list.length === 1 ? list[0] : null;
  openModal(title || LX('بيانات الدخول', 'Sign-in details'), one ? `<div class="cred-box"><span>${LX('الموظف', 'Employee')}</span><span>${esc(one.name)} — <span class="num">${esc(one.empNo)}</span></span><span>${LX('اسم المستخدم', 'Username')}</span><b>${esc(one.username)}</b><span>${LX('كلمة المرور المؤقتة', 'Temporary password')}</span><b>${esc(one.pw)}</b></div><div class="note warn small">${LX('تظهر كلمة المرور مرة واحدة فقط ولا تُحفظ في النظام. سلّمها للموظف بطريقة آمنة؛ سيُطلب منه تغييرها عند أول دخول.', 'The password is shown only once and is not stored. Hand it to the employee securely; they must change it at first sign-in.')}</div>`
    : `<p>${LX(`أُنشئ ${list.length} حساب دخول. كلمات المرور المؤقتة تظهر الآن فقط ولا تُحفظ في النظام.`, `${list.length} sign-in accounts were created. Temporary passwords are shown only now and are not stored.`)}</p><div class="tablewrap" style="max-height:300px;overflow:auto"><table><thead><tr><th>${LX('الرقم الوظيفي', 'No.')}</th><th>${LX('الاسم', 'Name')}</th><th>${LX('اسم المستخدم', 'Username')}</th><th>${LX('كلمة المرور المؤقتة', 'Temporary password')}</th></tr></thead><tbody>${list.map(x => `<tr><td class="num">${esc(x.empNo)}</td><td>${esc(x.name)}</td><td dir="ltr" style="text-align:start">${esc(x.username)}</td><td dir="ltr" style="text-align:start;font-family:ui-monospace,monospace">${esc(x.pw)}</td></tr>`).join('')}</tbody></table></div><div class="note warn small">${LX('نزّل الملف الآن ووزّعه بطريقة آمنة ثم احذفه. سيُطلب من كل موظف تغيير كلمة المرور عند أول دخول.', 'Download the file now, distribute it securely, then delete it. Every employee must change the password at first sign-in.')}</div>`,
    `<button class="btn pri" data-act="issued-dl">${ic('down')} ${LX('تنزيل بيانات الدخول (Excel)', 'Download sign-in details (Excel)')}</button><button class="btn" data-act="close-modal">${LX('تم', 'Done')}</button>`, list.length > 1);
}
ACT['issued-dl'] = () => { const l = S.lastIssued || []; if (!l.length) return; exportRows(`${LX('بيانات-الدخول', 'sign-in-details')}-${todayISO()}`, [[LX('الرقم الوظيفي', 'Employee no.'), LX('الاسم', 'Name'), LX('اسم المستخدم', 'Username'), LX('كلمة المرور المؤقتة', 'Temporary password'), LX('ملاحظة', 'Note')], ...l.map(x => [x.empNo, x.name, x.username, x.pw, LX('يجب تغييرها عند أول دخول', 'Must be changed at first sign-in')])], LX('بيانات الدخول', 'Sign-in')); };
const issuedRow = (e, username, pw) => ({ empNo: e.empNo, name: e.nameAr, username, pw });

/* ---------- Excel: employees import gets two optional columns; a separate accounts import ---------- */
function credRowCheck(r, seen) {
  if (!r.username) return r.password ? LX('كلمة مرور بدون اسم مستخدم', 'Password without a username') : '';
  const u = normUser(r.username); const ue = usernameError(u); if (ue) return ue;
  if (seen.has('u:' + u)) return LX('اسم المستخدم مكرر في الملف', 'Username repeated in the file');
  if (r.password) { const pe = tempPolicy(r.password); if (pe) return pe; }
  seen.add('u:' + u); return '';
}
async function waitEmp(no) { for (let i = 0; i < 20; i++) { const e = empByNo(no); if (e) return e; await sleep(150); } return null; }
async function issueFromRows(rows, file) {
  const out = [];
  for (const r of rows) { if (!r.username) continue; const e = await waitEmp(r.empNo); if (!e) continue; const u = normUser(r.username); const pw = r.password ? String(r.password) : genPw(); await setCred(e.id, u, pw, { mustChange: true }); out.push(issuedRow(e, u, pw)); }
  if (out.length) await audit('إنشاء حسابات دخول من Excel', 'creds', null, `${out.length} حساب — ${file || ''}`);
  S.credIssued = out;
}
(function extendImports() {
  const E = IMPORTS.employees;
  if (!E.cols.some(c => c[0] === 'username')) E.cols.push(['username', 'اسم المستخدم'], ['password', 'كلمة المرور المؤقتة']);
  E.note += ' عمودا «اسم المستخدم» و«كلمة المرور المؤقتة» اختياريان: إذا كُتب اسم المستخدم يُنشأ للموظف حساب دخول، وإذا تُركت كلمة المرور فارغة تُولَّد تلقائيًا. يُطلب من الموظف تغييرها عند أول دخول.';
  const chk = E.check, cm = E.commit;
  E.check = function (r, seen) { return chk.call(this, r, seen) || credRowCheck(r, seen) || undefined; };
  E.commit = async function (rows, file) { await cm.call(this, rows, file); await sleep(300); await issueFromRows(rows, file); };
  IMPORTS.accounts = {
    title: 'استيراد حسابات الدخول (اسم المستخدم وكلمة المرور)', perm: 'emp.edit',
    note: 'للموظفين المسجلين مسبقًا. كل صف ينشئ حساب دخول لموظف ليس له حساب. اترك كلمة المرور فارغة لتوليد كلمة قوية تلقائيًا. يُطلب من كل موظف تغييرها عند أول دخول.',
    cols: [['empNo', 'الرقم الوظيفي', 1], ['username', 'اسم المستخدم', 1], ['password', 'كلمة المرور المؤقتة']],
    check(r, seen) { const e = empByNo(r.empNo); if (!e) return 'رقم وظيفي غير موجود'; if (e.status === 'terminated') return 'منتهية خدمته'; if (credOf(e.id)) return 'له حساب دخول مسبقًا — أعد تعيينه من الإعدادات ← أسماء المستخدمين وكلمات المرور'; if (seen.has(r.empNo)) return 'الرقم الوظيفي مكرر في الملف'; seen.add(r.empNo); return credRowCheck(r, seen) || undefined; },
    async commit(rows, file) { await issueFromRows(rows, file); }
  };
  IMPORT_ROLES.accounts = 'مسؤول شؤون العاملين أو مدير الموارد البشرية';
})();
const _colSpecBase = colSpec;
colSpec = function (kind, c) {
  const s = _colSpecBase(kind, c);
  if (c[0] === 'username') { s.fmt = 'اسم مستخدم'; s.ex = 'حروف إنجليزية صغيرة وأرقام و . _ - (من 3 إلى 32)، فريد لكل موظف. مثال: t1001 أو ahmed.ali' + (kind === 'employees' ? '. اتركه فارغًا إن لم ترد إنشاء حساب دخول' : ''); }
  if (c[0] === 'password') { s.fmt = 'نص (6 أحرف على الأقل)'; s.ex = 'اتركها فارغة ليولّد النظام كلمة مرور قوية تلقائيًا (موصى به). يُطلب تغييرها عند أول دخول، ولا تُحفظ إلا مشفّرة'; }
  if (kind === 'accounts' && c[0] === 'empNo') { s.fmt = 'رقم وظيفي'; s.ex = 'رقم موجود في النظام'; }
  return s;
};
const _impCommitBase = ACT['imp-commit'];
ACT['imp-commit'] = async el => { S.credIssued = null; await _impCommitBase(el); if (S.credIssued?.length && !$('#modal-root').innerHTML) showIssued(S.credIssued, LX('حسابات الدخول التي أُنشئت', 'Sign-in accounts created')); };

/* ---------- Settings → usernames & passwords ---------- */
function credStatus(c) {
  if (!c) return badge('', LX('بدون حساب', 'No account'));
  if (c.active === false) return badge('rejected', LX('موقوف', 'Disabled'));
  if (c.lockedUntil && c.lockedUntil > nowISO()) return badge('rejected', LX('مقفل مؤقتًا', 'Locked'));
  if (c.mustChange) return badge('returned', LX('بانتظار أول دخول', 'Awaiting first sign-in'));
  return badge('approved', LX('نشط', 'Active'));
}
function accountsHtml() {
  const a = SET().auth || {}; const emps = activeEmpList(); const cs = emps.map(e => credOf(e.id)).filter(Boolean);
  const T = nowISO(); const locked = cs.filter(c => c.lockedUntil && c.lockedUntil > T).length;
  const sess = RAW.logins.list.filter(b => emp(b.empId)); ensureNames(sess.map(b => b.uid));
  const rows = emps.map(e => ({ ...e, _c: credOf(e.id) }));
  return `<div class="note" style="margin-bottom:12px">${LX('يدخل الموظف باسم المستخدم وكلمة المرور، وعند أول دخول يختار كلمة مرور جديدة إلزاميًا. تُحفظ كلمات المرور مشفّرة (PBKDF2) ولا يمكن لأحد الاطلاع عليها؛ عند النسيان تُعاد تعيينها فقط. الدخول بكلمة المرور وحدها يمنح صلاحيات الموظف العادي؛ أصحاب الأدوار الإدارية يحتاجون أيضًا ربط حساب Claude الرسمي من «ربط الحسابات بالموظفين».', 'Employees sign in with a username and password and must choose a new password at first sign-in. Passwords are stored only as PBKDF2 hashes; nobody can read them, only reset them. A password-only sign-in gives employee-level access; administrative roles also need the official Claude account link.')}</div>
  <div class="grid g4" style="margin-bottom:14px">${kpi(LX('لديهم حساب دخول', 'With an account'), `${fmtN(cs.length)} / ${fmtN(emps.length)}`)}${kpi(LX('بانتظار أول دخول', 'Awaiting first sign-in'), fmtN(cs.filter(c => c.mustChange && c.active !== false).length))}${kpi(LX('مقفلة مؤقتًا', 'Locked'), fmtN(locked), '', locked)}${kpi(LX('موقوفة', 'Disabled'), fmtN(cs.filter(c => c.active === false).length))}</div>
  <form class="form card" data-form="auth-cfg" style="margin-bottom:14px">${fld('sessionPw', LX('طلب كلمة المرور', 'Ask for the password'), { type: 'checkbox', value: a.sessionPw !== false, cbLabel: LX('عند كل فتح جديد للمنصة (لكل من لديه حساب دخول)', 'Every time the platform is opened (for everyone with an account)') })}${fld('minLen', LX('أقل طول لكلمة المرور', 'Minimum password length'), { type: 'number', value: authCfg().minLen, min: 6, max: 32 })}<div class="fld" style="justify-content:flex-end"><button class="btn pri" style="align-self:flex-start">${LX('حفظ', 'Save')}</button></div></form>
  ${dataTable('creds', [
    { k: 'empNo', l: LX('الرقم الوظيفي', 'No.'), v: e => `<span class="num">${esc(e.empNo)}</span>` },
    { k: 'nameAr', l: LX('الموظف', 'Employee'), v: e => `<b>${esc(e.nameAr)}</b><div class="small muted">${esc(e.title || '')}${(e.roles || []).length ? ' · ' + e.roles.map(r => esc(ROLES[r] || r)).join('، ') : ''}</div>` },
    { k: 'u', l: LX('اسم المستخدم', 'Username'), s: e => e._c?.username || '', txt: e => e._c?.username || '', v: e => e._c ? `<span dir="ltr">${esc(e._c.username)}</span>` : '—' },
    { k: 'st', l: LX('الحالة', 'Status'), s: e => !e._c ? 0 : e._c.active === false ? 1 : e._c.mustChange ? 2 : 3, v: e => credStatus(e._c) },
    { k: 'last', l: LX('آخر دخول', 'Last sign-in'), s: e => e._c?.lastLoginAt || '', v: e => e._c?.lastLoginAt ? `<span class="num small">${fmtDT(e._c.lastLoginAt)}</span>` : '—' },
    { k: 'x', l: '', nosort: true, v: e => { const c = e._c; return `<div class="row" style="gap:4px;flex-wrap:nowrap">${c ? `<button class="btn sm" data-act="cred-edit" data-id="${e.id}">${LX('إعادة تعيين', 'Reset')}</button>${c.lockedUntil && c.lockedUntil > T ? `<button class="btn sm" data-act="cred-unlock" data-id="${e.id}">${LX('فتح القفل', 'Unlock')}</button>` : ''}<button class="btn sm ghost ${c.active === false ? '' : 'danger'}" data-act="cred-toggle" data-id="${e.id}">${c.active === false ? LX('تفعيل', 'Enable') : LX('إيقاف', 'Disable')}</button>` : `<button class="btn sm pri" data-act="cred-edit" data-id="${e.id}">${ic('plus')} ${LX('إنشاء حساب', 'Create')}</button>`}</div>`; } }
  ], rows.sort(by('empNo')), { tools: `<button class="btn sm pri" data-act="cred-bulk">${ic('users')} ${LX('إنشاء حسابات لكل من ليس له حساب', 'Create accounts for everyone without one')}</button>${can('emp.edit') ? `<button class="btn sm" data-act="import" data-k="accounts">${ic('up')} ${LX('استيراد من Excel', 'Import from Excel')}</button>` : ''}<button class="btn sm" data-act="cred-export">${ic('down')} ${LX('تصدير القائمة', 'Export list')}</button>` })}
  <section class="card" style="margin-top:14px"><h2>${LX('الأجهزة والحسابات التي دخلت بكلمة المرور', 'Claude accounts signed in by password')} <small>${fmtN(sess.length)}</small></h2>${sess.length ? `<div class="tablewrap"><table><thead><tr><th>${LX('حساب Claude', 'Claude account')}</th><th>${LX('الموظف', 'Employee')}</th><th>${LX('منذ', 'Since')}</th><th>${LX('الحالة', 'Status')}</th><th></th></tr></thead><tbody>${sess.map(b => { const e = emp(b.empId), c = credOf(b.empId); const valid = c && c.active !== false && c.stamp === b.stamp; return `<tr><td>${esc(pname(b.uid) || LX('حساب', 'Account'))}</td><td>${esc(e.nameAr)} <span class="num small muted">${esc(e.empNo)}</span></td><td class="num small">${fmtDT(b.at)}</td><td>${valid ? badge('approved', LX('صالح', 'Valid')) : badge('cancelled', LX('منتهٍ (أُعيد التعيين)', 'Expired (reset)'))}</td><td><div class="row" style="gap:4px;flex-wrap:nowrap">${valid && !e.userId ? `<button class="btn sm" data-act="cred-promote" data-uid="${esc(b.uid)}" title="${LX('يمنح أدواره الإدارية', 'Grants their administrative roles')}">${LX('ربط رسمي', 'Official link')}</button>` : ''}<button class="btn sm ghost danger" data-act="cred-kill" data-uid="${esc(b.uid)}">${LX('إنهاء', 'End')}</button></div></td></tr>`; }).join('')}</tbody></table></div>` : empty(LX('لم يدخل أحد بكلمة المرور بعد', 'Nobody has signed in with a password yet'))}<p class="small muted" style="margin:8px 0 0">${LX('«ربط رسمي» يحوّل الدخول إلى ربط دائم بحساب Claude ويمنح الموظف أدواره الإدارية (يتطلب صلاحية «محرر»). إعادة تعيين كلمة المرور تُنهي كل جلسات الموظف.', '"Official link" makes the link permanent and grants administrative roles (needs Editor access). Resetting a password ends all of the employee\'s sessions.')}</p></section>`;
}
FORM['auth-cfg'] = async f => {
  const v = readForm(f); const minLen = Math.min(32, Math.max(6, Number(v.minLen) || 8));
  await patch('settings', 'main', { auth: { ...(SET().auth || {}), sessionPw: !!v.sessionPw, minLen } });
  await audit('تعديل إعدادات كلمات المرور', 'settings', 'auth', `طلب كلمة المرور كل جلسة: ${v.sessionPw ? 'نعم' : 'لا'}، أقل طول ${minLen}`); toast(LX('تم الحفظ', 'Saved'));
};
ACT['cred-edit'] = el => {
  const e = emp(el.dataset.id); if (!e) return; const c = credOf(e.id);
  openModal(c ? LX('إعادة تعيين كلمة المرور', 'Reset password') + ' — ' + e.nameAr : LX('إنشاء حساب دخول', 'Create sign-in account') + ' — ' + e.nameAr,
    `<form class="form" id="credf" data-form="cred" data-id="${e.id}">${fld('username', LX('اسم المستخدم', 'Username'), { value: c?.username || normUser(e.empNo), required: true, full: true, hint: LX('حروف إنجليزية صغيرة وأرقام و . _ - ، فريد لكل موظف', 'Lowercase English letters, digits and . _ -, unique') })}
    ${fld('mode', LX('كلمة المرور المؤقتة', 'Temporary password'), { type: 'radio', value: 'gen', options: [['gen', LX('توليد كلمة قوية تلقائيًا (موصى به)', 'Generate a strong one (recommended)')], ['manual', LX('أكتبها بنفسي', 'I will type it')]], full: true })}
    ${fld('pw', LX('كلمة المرور (عند اختيار الكتابة اليدوية)', 'Password (when typing it yourself)'), { full: true, ph: '••••••' })}
    <div class="note small full">${LX('سيُطلب من الموظف تغيير كلمة المرور عند أول دخول. ' + (c ? 'إعادة التعيين تُنهي كل جلساته الحالية.' : ''), 'The employee must change it at first sign-in.' + (c ? ' Resetting ends all current sessions.' : ''))}</div></form>`,
    `<button class="btn pri" form="credf">${c ? LX('إعادة التعيين', 'Reset') : LX('إنشاء', 'Create')}</button><button class="btn" data-act="close-modal">${LX('إلغاء', 'Cancel')}</button>`);
};
FORM.cred = async f => {
  const e = emp(f.dataset.id); const v = readForm(f); const u = normUser(v.username); const had = !!credOf(e.id);
  const ue = usernameError(u, e.id); if (ue) return toast(ue, true);
  let pw = genPw(); if (v.mode === 'manual') { pw = String(f.elements.pw.value || ''); const pe = tempPolicy(pw); if (pe) return toast(pe, true); }
  await setCred(e.id, u, pw, { mustChange: true });
  await audit(had ? 'إعادة تعيين كلمة مرور' : 'إنشاء حساب دخول', 'creds', e.id, `${e.nameAr} (${u})`);
  showIssued([issuedRow(e, u, pw)], had ? LX('تمت إعادة التعيين', 'Password reset') : LX('أُنشئ حساب الدخول', 'Account created'));
};
ACT['cred-toggle'] = el => {
  const e = emp(el.dataset.id), c = credOf(e?.id); if (!c) return; const off = c.active !== false;
  confirmBox(off ? LX(`إيقاف حساب دخول «${esc(e.nameAr)}»؟ لن يتمكن من الدخول بكلمة المرور حتى يُعاد تفعيله.`, `Disable ${esc(e.nameAr)}'s account?`) : LX(`إعادة تفعيل حساب «${esc(e.nameAr)}»؟`, `Enable ${esc(e.nameAr)}'s account?`), async () => {
    await rawUpdate('creds', c.id, { active: !off, ...(off ? { stamp: newId() } : {}) }); await audit(off ? 'إيقاف حساب دخول' : 'تفعيل حساب دخول', 'creds', e.id, `${e.nameAr} (${c.username})`); toast(LX('تم', 'Done'));
  }, off ? LX('إيقاف', 'Disable') : LX('تفعيل', 'Enable'));
};
ACT['cred-unlock'] = async el => { const e = emp(el.dataset.id), c = credOf(e?.id); if (!c) return; await rawUpdate('creds', c.id, { failed: 0, lockedUntil: null }); await audit('فتح قفل حساب دخول', 'creds', e.id, c.username); toast(LX('فُتح الحساب', 'Unlocked')); };
ACT['cred-bulk'] = el => {
  const todo = activeEmpList().filter(e => !credOf(e.id)).sort(by('empNo')); if (!todo.length) return toast(LX('كل الموظفين لديهم حسابات دخول', 'Everyone already has an account'));
  confirmBox(LX(`إنشاء ${todo.length} حساب دخول؟ اسم المستخدم = الرقم الوظيفي، وكلمة مرور مؤقتة قوية لكل موظف. ستظهر كلمات المرور مرة واحدة لتنزيلها وتوزيعها.`, `Create ${todo.length} accounts? Username = employee number, with a strong temporary password each. Passwords are shown once for download.`), async () => {
    const out = [], skip = []; const used = new Set(RAW.creds.list.map(c => c.username)); let i = 0;
    for (const e of todo) {
      i++; if (i % 10 === 0) toast(LX(`جارٍ الإنشاء… ${i} من ${todo.length}`, `Creating… ${i} of ${todo.length}`));
      const u = normUser(e.empNo); if (!USER_RE.test(u) || used.has(u)) { skip.push(e.empNo); continue; }
      const pw = genPw(); await setCred(e.id, u, pw, { mustChange: true }); used.add(u); out.push(issuedRow(e, u, pw));
    }
    await audit('إنشاء حسابات دخول جماعي', 'creds', null, `${out.length} حساب${skip.length ? '، تُخطي ' + skip.length : ''}`);
    if (out.length) showIssued(out, LX('حسابات الدخول التي أُنشئت', 'Sign-in accounts created'));
    if (skip.length) toast(LX(`تُخطي ${skip.length} موظف لأن رقمه الوظيفي لا يصلح اسم مستخدم أو مستخدم: ${skip.slice(0, 8).join('، ')}. أنشئ لهم حسابات يدويًا.`, `Skipped ${skip.length}: employee number not usable as a username.`), true);
  }, LX('إنشاء', 'Create'));
};
ACT['cred-export'] = () => exportRows(`${LX('حسابات-الدخول', 'sign-in-accounts')}-${todayISO()}`, [[LX('الرقم الوظيفي', 'No.'), LX('الاسم', 'Name'), LX('اسم المستخدم', 'Username'), LX('الحالة', 'Status'), LX('آخر دخول', 'Last sign-in')], ...activeEmpList().sort(by('empNo')).map(e => { const c = credOf(e.id); return [e.empNo, e.nameAr, c?.username || '', !c ? LX('بدون حساب', 'None') : c.active === false ? LX('موقوف', 'Disabled') : c.mustChange ? LX('بانتظار أول دخول', 'Awaiting first sign-in') : LX('نشط', 'Active'), c?.lastLoginAt ? fmtDT(c.lastLoginAt) : '']; })], LX('الحسابات', 'Accounts'));
ACT['cred-kill'] = el => { const uid = el.dataset.uid; const b = RAW.logins.map[uid]; if (!b) return; confirmBox(LX('إنهاء دخول هذا الحساب؟ سيحتاج إلى الدخول باسم المستخدم وكلمة المرور من جديد.', 'End this sign-in? They will need to sign in again.'), async () => { await remove('logins', uid); await audit('إنهاء جلسة دخول بكلمة المرور', 'session', b.empId, empName(b.empId)); toast(LX('تم', 'Done')); }, LX('إنهاء', 'End')); };
ACT['cred-promote'] = el => {
  const uid = el.dataset.uid; const b = RAW.logins.map[uid]; const e = emp(b?.empId); if (!e) return;
  if (!S.adminLvl) return toast(LEVEL_MSG, true);
  confirmBox(LX(`ربط حساب Claude هذا رسميًا بملف «${esc(e.nameAr)}»؟ سيحصل على أدواره الإدارية المسجلة.`, `Officially link this Claude account to ${esc(e.nameAr)}? They get their administrative roles.`), async () => {
    for (const x of D.employees.list.filter(x => x.userId === uid && x.id !== e.id)) await put('employees', x.id, { ...strip(x), userId: null, updatedAt: nowISO() });
    await put('employees', e.id, { ...strip(e), userId: uid, updatedAt: nowISO() }); await audit('ربط رسمي لحساب دخل بكلمة المرور', 'employee', e.id, e.nameAr); toast(LX('تم الربط', 'Linked'));
  }, LX('ربط', 'Link'));
};
