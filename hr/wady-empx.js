/* ===== Employee photo and the unified contract (24/11) =====
   - Photo: stored in «photos» (id = employee id). The employee changes his own from the home page or his file; HR changes anyone's.
     Everyone signed in sees it wherever the app shows the person (lists, directory, org chart, home).
   - Unified contract: the «tp_contract» template (editable in Settings → letter templates) filled from the employee page.
     Missing data is printed highlighted as [field: not available], never invented. */
(function () {
  const photoOf = id => (D.photos && D.photos.map[id] && D.photos.map[id].img) || '';
  const _av = avatar;
  avatar = function (e, lg) { const p = e && photoOf(e.id); if (!p) return _av(e, lg); return `<div class="av ${lg ? 'lg' : ''}" style="padding:0;overflow:hidden;background:#fff"><img src="${p}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>`; };
  const canPhoto = id => !!id && (id === S.meId || can('emp.edit'));
  const st = document.createElement('style');
  st.textContent = `.av-wrap{position:relative;display:inline-block;flex:none}.av-cam{position:absolute;bottom:-4px;inset-inline-end:-4px;width:30px;height:30px;border-radius:50%;border:2px solid #fff;background:#38AC57;color:#fff;font-size:14px;display:grid;place-items:center;cursor:pointer;padding:0;box-shadow:0 2px 6px rgba(0,0,0,.25)}
   .ct-miss{background:#FDECEC;color:#B42318;border-radius:4px;padding:0 3px}`;
  document.head.appendChild(st);
  // camera button on the big avatar of the home page (me) and of the employee page
  function addCam() {
    const id = S.view === 'home' ? S.meId : S.view === 'employee' ? S.params && S.params.id : null; if (!canPhoto(id)) return;
    const av = document.querySelector('#root .hello .av.lg'); if (!av || av.closest('.av-wrap')) return;
    const w = document.createElement('span'); w.className = 'av-wrap'; av.parentNode.insertBefore(w, av); w.appendChild(av);
    w.insertAdjacentHTML('beforeend', `<button type="button" class="av-cam" data-act="emp-photo" data-id="${esc(id)}" title="${LX('تغيير الصورة', 'Change photo')}" aria-label="${LX('تغيير الصورة', 'Change photo')}">📷</button>`);
  }
  // «العقد الموحد» next to «إصدار خطاب» on the employee page
  function addContractBtn() {
    if (S.view !== 'employee' || !(can('emp.edit') || can('letters.issue'))) return; const id = S.params && S.params.id; if (!id || document.querySelector('[data-act="emp-contract"]')) return;
    const anchor = document.querySelector('#root [data-act="emp-letter"]') || document.querySelector('#root [data-act="emp-edit"]'); if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', `<button class="btn" data-act="emp-contract" data-id="${esc(id)}">📄 ${LX('العقد الموحد', 'Unified contract')}</button>`);
  }
  let q = 0; new MutationObserver(() => { if (q) return; q = requestAnimationFrame(() => { q = 0; try { addCam(); addContractBtn(); } catch (e) { } }); }).observe(document.getElementById('root') || document.body, { childList: true, subtree: true });

  ACT['emp-photo'] = el => {
    const id = el.dataset.id; if (!canPhoto(id)) return;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; if (!/^image\//.test(f.type)) return toast(LX('اختر صورة', 'Choose an image'), true);
      const img = new Image(); const url = URL.createObjectURL(f);
      img.onload = async () => { try { const S2 = 256; const c = document.createElement('canvas'); c.width = S2; c.height = S2; const x = c.getContext('2d');
          const s = Math.min(img.width, img.height); x.fillStyle = '#fff'; x.fillRect(0, 0, S2, S2); x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, S2, S2);
          const data = c.toDataURL('image/jpeg', 0.8); URL.revokeObjectURL(url);
          await rawPut('photos', id, { empId: id, img: data, at: nowISO(), byId: S.meId || null });
          D.photos.map[id] = { id, empId: id, img: data }; if (!D.photos.list.some(p => p.id === id)) D.photos.list.push(D.photos.map[id]); else D.photos.list = D.photos.list.map(p => p.id === id ? D.photos.map[id] : p);
          toast(LX('تم تحديث الصورة', 'Photo updated')); renderAll(true);
        } catch (e) { toast(e.message || String(e), true); } };
      img.onerror = () => toast(LX('تعذّر قراءة الصورة', 'Could not read the image'), true); img.src = url; };
    inp.click();
  };

  const CT_FIELDS = e => { const sal = (D.salaries && D.salaries.map[e.id]) || {}; const s = SET() || {}; const f = v => v ? fmtD(v) : '';
    const hasSal = ['basic', 'housing', 'transport', 'other'].some(k => sal[k] != null && sal[k] !== '');
    return { basic: sal.basic != null && sal.basic !== '' ? fmtN(sal.basic, 2) : '', total: hasSal ? fmtN(['basic', 'housing', 'transport', 'other'].reduce((t, k) => t + Number(sal[k] || 0), 0), 2) : '',
      hireDate: f(e.hireDate), joinDate: f(e.joinDate), idType: e.idType, idNumber: e.idNumber, birthDate: f(e.birthDate), gender: e.gender, maritalStatus: e.maritalStatus, phone: e.phone, email: e.email, address: e.address, grade: e.grade,
      manager: e.managerId ? empName(e.managerId) : '', contractType: e.contractType, contractStart: f(e.contractStart), contractEnd: f(e.contractEnd) || (e.contractType === 'غير محدد المدة' ? 'غير محدد المدة' : ''), probationEnd: f(e.probationEnd),
      housing: sal.housing != null ? fmtN(sal.housing, 2) : '', transport: sal.transport != null ? fmtN(sal.transport, 2) : '', other: sal.other != null ? fmtN(sal.other, 2) : '',
      companyCR: s.companyCR || '', companyAddress: s.companyAddress || '', companySigner: s.companySigner || '', companySignerTitle: s.companySignerTitle || '' }; };
  ACT['emp-contract'] = el => {
    const e = emp(el.dataset.id); if (!e) return; const t = D.templates.map['tp_contract'] || D.templates.list.find(x => x.kind === 'contract');
    if (!t) return toast(LX('قالب العقد غير موجود — أضفه من الإعدادات ← قوالب الخطابات', 'Contract template missing'), true);
    const body = fillTemplate(t.body, e, CT_FIELDS(e)); const miss = (body.match(/\[\w+: غير متوفر\]/g) || []).length;
    const html = esc(body).replace(/\[(\w+): غير متوفر\]/g, '<span class="ct-miss">[$1: غير متوفر]</span>').split('\n').map((l, i) => i === 0 ? `<h2 style="text-align:center;margin:4px 0 10px">${l}</h2>` : /^المادة \(/.test(l) ? `<b style="color:#051D48">${l}</b>` : l).join('<br>');
    const w = window.open('', '_blank'); if (!w) return toast(LX('اسمح بالنوافذ المنبثقة للطباعة', 'Allow pop-ups'), true);
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(t.name || 'عقد عمل')} — ${esc(e.nameAr)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap"><style>@page{size:A4;margin:14mm}body{font-family:Tajawal,Tahoma,sans-serif;color:#0B1B33;font-size:13px;line-height:1.9;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.top{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(120deg,#051D48,#0B2A5E 70%,#123d6e);color:#fff;border-radius:14px;padding:10px 16px;margin-bottom:14px}.top img{height:34px;background:#fff;border-radius:8px;padding:4px 8px}.top h1{margin:0;font-size:20px}
.top span{display:block;font-size:10px;letter-spacing:2px;color:#8FC153;font-weight:700;text-align:left}.ct-miss{background:#FDECEC;color:#B42318;border-radius:4px;padding:0 3px}
.warn{border:1px solid #F39235;background:#FFF3E3;color:#9A5A0B;border-radius:8px;padding:6px 10px;font-size:11px;margin-bottom:10px}.ft{margin-top:18px;border-top:2px solid #38AC57;padding-top:5px;font-size:10px;color:#66738A;display:flex;justify-content:space-between}
@media print{.warn{display:none}}</style></head><body>
<div class="top"><img src="../brand/logo-h.png" alt=""><div><h1>${esc(t.name || 'عقد عمل')}</h1><span>EMPLOYMENT CONTRACT</span></div></div>
${miss ? `<div class="warn">في العقد ${miss} بيان غير مسجل في ملف الموظف أو إعدادات المنشأة (مظلل بالأحمر). كمّله من «تعديل البيانات» أو الإعدادات قبل الطباعة. هذا التنبيه ما ينطبع.</div>` : ''}
${t.note ? `<div class="warn">${esc(t.note)}</div>` : ''}<div>${html}</div>
<div class="ft"><span>${esc(SET().company || '')}</span><span>${esc(e.empNo || '')} · ${fmtD(todayISO())}</span></div>
<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close(); audit('طباعة العقد الموحد', 'employee', e.id, e.empNo || '');
  };
})();
