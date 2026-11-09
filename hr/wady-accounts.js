/* ===== Employee sign-in = platform account. Created from the employee page / accounts page; the platform does the sign-in ===== */
(function () {
  const SB = () => window.__sb;
  async function call(body) {
    const { data: { session } } = await SB().auth.getSession();
    const r = await fetch('https://kpdvgmioltltshzersyc.supabase.co/functions/v1/hr-account', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status)); return j;
  }
  // HR's own password screen is not used: the platform already signed the user in. Only the first-time password change remains.
  authGate = function () {
    if (!S.meId) { S.authShown = null; return false; }
    const c = credOf(S.meId); if (!c || !c.mustChange || c.active === false) { S.authShown = null; return false; }
    const key = 'pchange:' + (c.setAt || '') + LANG; if (S.authShown === key && $('#auth-card')) return true;
    S.authShown = key; closeModal(); const e = ME();
    $('#root').innerHTML = authShell(`<h1>${LX('اختر كلمة مرور جديدة', 'Choose a new password')}</h1><p class="small muted" style="margin:0 0 10px">${LX(`مرحبًا ${esc((e?.nameAr || '').split(' ')[0])}. كلمة المرور اللي استلمتها مؤقتة، اختر كلمة مرور جديدة لك.`, 'Your password is temporary; choose a new one.')}</p>
      <form class="form" id="wady-pw"><input type="text" name="u" value="${esc(c.username || '')}" autocomplete="username" hidden>${fld('p1', LX('كلمة المرور الجديدة', 'New password'), { type: 'password', required: true, full: true })}${fld('p2', LX('تأكيدها', 'Confirm'), { type: 'password', required: true, full: true })}
      <div class="full"><button class="btn pri" style="width:100%">${LX('حفظ والدخول', 'Save and continue')}</button></div></form>`);
    setTimeout(() => { const f = document.getElementById('wady-pw'); if (!f) return; f.querySelectorAll('input[type=password]').forEach(i => i.autocomplete = 'new-password'); f.onsubmit = async ev => { ev.preventDefault();
      const p1 = f.elements.p1.value, p2 = f.elements.p2.value; const pe = pwPolicy(p1, c.username); if (pe) return toast(pe, true); if (p1 !== p2) return toast(LX('كلمتا المرور غير متطابقتين', 'Passwords do not match'), true);
      const { error } = await SB().auth.updateUser({ password: p1 }); if (error) return toast(error.message, true);
      await rawUpdate('creds', S.meId, { mustChange: false, changedAt: nowISO() }); if (RAW.creds.map[S.meId]) RAW.creds.map[S.meId].mustChange = false;
      await audit('تغيير كلمة المرور المؤقتة', 'creds', S.meId, c.username); S.authShown = null; toast(LX('تم — أهلاً بك', 'Done — welcome')); renderAll(true); }; }, 30);
    return true;
  };
  // create or reset: makes / updates the employee's platform account and links it to the employee
  setCred = async function (empId, username, pw, o = {}) {
    await call({ action: 'set', emp_id: empId, username, password: pw });
    const cur = credOf(empId); const at = nowISO();
    const doc = { empId, username, mustChange: o.mustChange !== false, active: true, platform: true, setAt: at, setById: S.meId || null, createdAt: cur?.createdAt || at, createdById: cur?.createdById || S.meId || null };
    await rawPut('creds', empId, doc); RAW.creds.map[empId] = { ...doc, id: empId }; if (!RAW.creds.list.some(c => c.id === empId)) RAW.creds.list.push(RAW.creds.map[empId]);
    return doc;
  };
  FORM['pw-change'] = async f => {
    const c = credOf(S.meId); const p1 = f.elements.p1.value, p2 = f.elements.p2.value;
    if (p1 !== p2) return toast(LX('كلمتا المرور غير متطابقتين', 'Passwords do not match'), true);
    const pe = pwPolicy(p1, c?.username || ''); if (pe) return toast(pe, true);
    const { error } = await SB().auth.updateUser({ password: p1 }); if (error) return toast(error.message, true);
    if (c) await rawUpdate('creds', S.meId, { mustChange: false, changedAt: nowISO() });
    await audit('تغيير كلمة المرور', 'creds', S.meId, c?.username || ''); closeModal(); toast(LX('تم تغيير كلمة المرور', 'Password changed'));
  };
  const _toggle = ACT['cred-toggle'];
  ACT['cred-toggle'] = el => {
    const e = emp(el.dataset.id), c = credOf(e?.id); if (!c) return; const off = c.active !== false;
    confirmBox(off ? LX(`إيقاف دخول «${esc(e.nameAr)}» للمنصة؟`, `Disable ${esc(e.nameAr)}?`) : LX(`إعادة تفعيل دخول «${esc(e.nameAr)}»؟`, `Enable ${esc(e.nameAr)}?`), async () => {
      try { await call({ action: 'active', emp_id: e.id, active: !off }); } catch (err) { return toast(err.message, true); }
      await rawUpdate('creds', c.id, { active: !off }); await audit(off ? 'إيقاف حساب دخول' : 'تفعيل حساب دخول', 'creds', e.id, `${e.nameAr} (${c.username})`); toast(LX('تم', 'Done'));
    }, off ? LX('إيقاف', 'Disable') : LX('تفعيل', 'Enable'));
  };
  // surface errors from the account service inside the existing forms
  const _cred = FORM.cred; FORM.cred = async f => { try { await _cred(f); } catch (err) { toast(err.message, true); } };
  const _bulk = ACT['cred-bulk']; ACT['cred-bulk'] = el => { try { _bulk(el); } catch (err) { toast(err.message, true); } };
  // employee page: a "sign-in account" button next to "edit details"
  const canManage = () => { try { return (window.WADY_PERM && WADY_PERM.admin) || (typeof wadyLvl === 'function' && (wadyLvl('hr', 'employees') >= 3 || wadyLvl('hr', 'settings') >= 3)); } catch (e) { return false; } };
  function addBtn() {
    if (!canManage()) return;
    document.querySelectorAll('[data-act="emp-edit"]').forEach(b => {
      const id = b.dataset.id; if (!id || b.parentElement.querySelector('[data-wady-cred]')) return; const c = credOf(id);
      const n = document.createElement('button'); n.className = 'btn'; n.dataset.act = 'cred-edit'; n.dataset.id = id; n.dataset.wadyCred = '1';
      n.innerHTML = (typeof ic === 'function' ? ic('key') + ' ' : '') + (c ? LX('حساب الدخول: ', 'Sign-in: ') + esc(c.username) + (c.active === false ? LX(' (موقوف)', ' (disabled)') : '') : LX('إنشاء اسم مستخدم وكلمة مرور', 'Create sign-in'));
      b.after(n);
    });
  }
  new MutationObserver(() => { clearTimeout(window.__wadyCredT); window.__wadyCredT = setTimeout(addBtn, 80); }).observe(document.documentElement, { childList: true, subtree: true });
})();
