/* ===== Al-Wady platform — HR runtime adapter =====
   The HR platform was built on a document database (collections of JSON documents).
   This adapter gives it the same interface on top of the company's Supabase project:
   documents live in public.hr_store (one row per document), files in the private "hr-files" bucket,
   and identity comes from the platform sign-in. Access rules are enforced on the server (RLS). */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://kpdvgmioltltshzersyc.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZHZnbWlvbHRsdHNoemVyc3ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMzg4NjAsImV4cCI6MjEwODkxNDg2MH0.8tGbvz3dZT2TVLWEUuCg5_o-hD4rSb7iWZwd14nKpeU';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  window.__sb = sb;
  window.__wadySession = () => session;
  const CFG = Object.assign({ table: 'hr_store', bucket: 'hr-files', app: 'hr', teamView: null }, window.WADY_STORE || {});
  const BUCKET = CFG.bucket, TABLE = CFG.table;
  const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

  const E = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  function mapErr(e) {
    if (!e) return e; const m = String(e.message || e);
    if (/row-level security|permission denied|violates row-level|42501/i.test(m) || e.code === '42501') return E('invalid_argument', 'ما عندك صلاحية لهذا الإجراء');
    if (e.code === 'P0002' || /not_found/.test(m)) return E('not_found', m);
    if (/Failed to fetch|NetworkError|network|timeout/i.test(m)) return E('unavailable', 'تعذّر الاتصال بالخادم');
    if (/JWT|expired|session/i.test(m)) return E('revoked', 'انتهت الجلسة — سجّل الدخول من جديد');
    return E(e.code || 'unknown', m);
  }
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

  /* ---------- session ---------- */
  let session = null;
  const LV = { view: 1, audit: 2, edit: 3 };
  window.WADY_PERM = { admin: false, pages: {} };
  window.wadyLvl = (app, page) => window.WADY_PERM.admin ? 3 : (LV[(window.WADY_PERM.pages[app] || {})[page]] || 0);
  window.wadyAppLvl = app => window.WADY_PERM.admin ? 3 : Math.max(0, ...Object.values(window.WADY_PERM.pages[app] || {}).map(v => LV[v] || 0));
  const ready = sb.auth.getSession().then(async ({ data }) => {
    session = data.session || null;
    if (session) { try { const { data: p } = await sb.rpc('my_pages'); if (p) window.WADY_PERM = { admin: !!p.admin, pages: p.pages || {} }; } catch (e) { } }
    try { document.documentElement.dataset.wadyAppLvl = String(window.wadyAppLvl(CFG.app)); } catch (e) { }
    return session;
  });
  window.__wadyReady = ready;
  const guard = col => { try { return window.WADY_GUARD ? window.WADY_GUARD(col) : null; } catch (e) { return null; } };
  sb.auth.onAuthStateChange((ev, s) => { session = s || null; if (ev === 'SIGNED_OUT') toLogin(); });
  function toLogin() { try { localStorage.setItem('wady.app', CFG.app); } catch (e) { } location.href = '../index.html#' + CFG.app; }

  /* ---------- documents ---------- */
  class DocSnap { constructor(id, data) { this.id = id; this.exists = data != null; this._d = data; } data() { return this._d == null ? undefined : clone(this._d); } }
  const cache = {};        // col -> Map(id -> data)
  const listeners = {};    // col -> Set(fn)
  const loading = {};      // col -> Promise
  async function fetchCol(col) {
    const out = new Map(); let from = 0; const step = 1000;
    for (let g = 0; g < 200; g++) {
      const { data, error } = await sb.from(TABLE).select('id,data').eq('col', col).range(from, from + step - 1);
      if (error) throw mapErr(error);
      (data || []).forEach(r => out.set(r.id, r.data));
      if (!data || data.length < step) break; from += step;
    }
    if (CFG.teamView && col === 'team') {
      const { data, error } = await sb.from(CFG.teamView).select('id,data');
      if (error) throw mapErr(error);
      (data || []).forEach(r => out.set(r.id, { ...(out.get(r.id) || {}), ...r.data }));
    }
    cache[col] = out; return out;
  }
  const accountMember = (col, id) => CFG.teamView && col === 'team' && isUuid(id);
  const emitT = {}; function emitSoon(col) { clearTimeout(emitT[col]); emitT[col] = setTimeout(() => emit(col), 120); }
  function emit(col) { (listeners[col] || new Set()).forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }
  const refetchT = {};
  function refetch(col, delay = 250) {
    clearTimeout(refetchT[col]);
    refetchT[col] = setTimeout(async () => { try { await fetchCol(col); emit(col); } catch (e) { console.warn('refetch', col, e); } }, delay);
  }
  function localSet(col, id, data) { (cache[col] = cache[col] || new Map()); if (data == null) cache[col].delete(id); else cache[col].set(id, clone(data)); emit(col); }
  function deepMerge(a, b) {
    if (!a || typeof a !== 'object' || Array.isArray(a) || !b || typeof b !== 'object' || Array.isArray(b)) return clone(b);
    const o = clone(a); for (const k of Object.keys(b)) o[k] = (k in o) ? deepMerge(o[k], b[k]) : clone(b[k]); return o;
  }

  function docRef(col, id) {
    return {
      id,
      async get() { await ready; const { data, error } = await sb.from(TABLE).select('data').eq('col', col).eq('id', id).maybeSingle(); if (error) throw mapErr(error); return new DocSnap(id, data ? data.data : null); },
      async set(obj) { await ready; { const g = guard(col); if (g) throw E('invalid_argument', g); }
        if (accountMember(col, id)) { const { error } = await sb.rpc('crm_team_update', { p_id: id, p: obj || {} }); if (error) throw mapErr(error); localSet(col, id, { ...(cache[col]?.get(id) || {}), ...obj }); return; }
        const { error } = await sb.from(TABLE).upsert({ col, id, data: obj || {}, updated_at: new Date().toISOString(), updated_by: session?.user?.id || null }, { onConflict: 'col,id' }); if (error) throw mapErr(error); localSet(col, id, obj || {}); },
      async update(obj) { await ready; { const g = guard(col); if (g) throw E('invalid_argument', g); }
        if (accountMember(col, id)) return this.set({ ...(cache[col]?.get(id) || {}), ...obj });
        const { error } = await sb.rpc('hr_merge', { p_col: col, p_id: id, p_patch: obj || {} }); if (error) throw mapErr(error); const cur = cache[col]?.get(id); if (cur) localSet(col, id, deepMerge(cur, obj)); else refetch(col, 0); },
      async delete() { await ready; { const g = guard(col); if (g) throw E('invalid_argument', g); }
        if (accountMember(col, id)) throw E('invalid_argument', 'المستخدمون أصحاب الحسابات يُدارون من «المستخدمون والصلاحيات» في المنصة');
        const { error } = await sb.from(TABLE).delete().eq('col', col).eq('id', id); if (error) throw mapErr(error); localSet(col, id, null); },
      async acquire() { return { acquired: true }; }, async release() { return true; }
    };
  }
  function query(col, opts = {}) {
    const q = {
      orderBy(f, dir) { return query(col, { ...opts, order: [f, dir || 'asc'] }); },
      limit(n) { return query(col, { ...opts, limit: n }); },
      where(f, op, v) { return query(col, { ...opts, where: [...(opts.where || []), [f, op, v]] }); },
      doc(id) { return docRef(col, id); },
      async get() { await ready; await (loading[col] = loading[col] || fetchCol(col)); return { docs: snapList(col, opts), size: snapList(col, opts).length }; },
      onSnapshot(next, onErr) {
        const fn = () => next({ docs: snapList(col, opts) });
        (listeners[col] = listeners[col] || new Set()).add(fn);
        ready.then(() => (loading[col] = loading[col] || fetchCol(col))).then(fn).catch(e => { const m = mapErr(e); if (onErr) onErr(m); else console.warn(col, m); });
        return () => listeners[col].delete(fn);
      }
    };
    return q;
  }
  const OPS = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, in: (a, b) => (b || []).includes(a), 'array-contains': (a, b) => Array.isArray(a) && a.includes(b) };
  function snapList(col, opts) {
    let rows = [...(cache[col] || new Map()).entries()].map(([id, d]) => ({ id, d }));
    (opts.where || []).forEach(([f, op, v]) => { const t = OPS[op] || OPS['==']; rows = rows.filter(r => t(r.d?.[f], v)); });
    if (opts.order) { const [f, dir] = opts.order; const s = dir === 'desc' ? -1 : 1; rows.sort((a, b) => { const x = a.d?.[f], y = b.d?.[f]; return (x > y ? 1 : x < y ? -1 : 0) * s; }); }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return rows.map(r => new DocSnap(r.id, r.d));
  }
  const db = {
    collection: name => query(name),
    doc: path => { const i = path.indexOf('/'); return docRef(path.slice(0, i), path.slice(i + 1)); }
  };
  // live updates from other users (server pushes changes; RLS applies). Polling is the fallback.
  ready.then(() => {
    try { sb.channel(TABLE + '_live').on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, p => { const col = (p.new && p.new.col) || (p.old && p.old.col); if (!col || !listeners[col]?.size) return;
      // apply the changed row directly; only fall back to a full reload when the payload is incomplete
      if (p.eventType === 'DELETE' && p.old && p.old.id && cache[col]) { cache[col].delete(p.old.id); emitSoon(col); }
      else if (p.new && p.new.id && p.new.data && cache[col] && !(CFG.teamView && col === 'team')) { cache[col].set(p.new.id, p.new.data); emitSoon(col); }
      else refetch(col, 400); }).subscribe(); } catch (e) { console.warn('realtime', e); }
    // safety net in case a live update was missed: small collections every 90 s, large ones every 15 min
    let tick = 0; setInterval(() => { if (document.hidden) return; tick++; Object.keys(listeners).forEach(c => { if (!listeners[c].size) return; const big = (cache[c]?.size || 0) > 3000; if (!big || tick % 10 === 0) refetch(c, Math.random() * 3000); }); }, 90000);
  });

  /* ---------- identity ---------- */
  let dirCache = null;
  async function userDir() { if (dirCache) return dirCache; const { data } = await sb.from('user_directory').select('*'); dirCache = data || []; setTimeout(() => dirCache = null, 60000); return dirCache; }
  const user = {
    async id() { await ready; return session?.user?.id || null; },
    async isOwner() { const { data } = await sb.rpc('is_admin'); return !!data; },
    async canEdit() { await ready; const { data, error } = await sb.rpc('hr_admin_lvl'); if (error) return false; return !!data; },
    async can() { await ready; return !!session; },
    async me() { await ready; const u = session?.user; const d = (await userDir()).find(x => x.id === u?.id); return { id: u?.id, name: d?.full_name || u?.email || '', email: u?.email || '' }; },
    async profiles(ids) { const d = await userDir(); const me = session?.user?.id; const o = {}; (ids || []).forEach(i => { const x = d.find(p => p.id === i); o[i] = { name: x?.full_name || '', isMe: i === me }; }); return o; }
  };

  /* ---------- files ---------- */
  const assets = {
    async upload(file) {
      await ready; const ext = (String(file.name || '').match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
      const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)) + ext;
      const { error } = await sb.storage.from(BUCKET).upload(id, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (error) throw mapErr(error); return { id, url: '/_blob/' + id };
    }
  };
  const signed = {};
  async function signedUrl(id) {
    const c = signed[id]; if (c && c.exp > Date.now()) return c.url;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(id, 3600); if (error) throw error;
    signed[id] = { url: data.signedUrl, exp: Date.now() + 3300e3 }; return data.signedUrl;
  }
  const blobId = v => (String(v || '').match(/\/_blob\/([^?#"']+)/) || [])[1] || null;
  function fixNode(el) {
    if (el.tagName === 'IMG') { const id = blobId(el.getAttribute('src')); if (id && !el.dataset.blobOk) { el.dataset.blobOk = '1'; el.removeAttribute('src'); signedUrl(id).then(u => el.src = u).catch(() => { }); } }
  }
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; fixNode(n); n.querySelectorAll && n.querySelectorAll('img[src*="/_blob/"]').forEach(fixNode); }))).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href*="/_blob/"]'); if (!a) return; e.preventDefault();
    const id = blobId(a.getAttribute('href')); const w = window.open('', '_blank');
    signedUrl(id).then(u => { if (w) w.location = u; else location.href = u; }).catch(() => { if (w) w.close(); alert('تعذّر فتح الملف'); });
  }, true);

  const downloads = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = document.createElement('a'); a.href = url; a.download = filename || 'file'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); return true;
    }
  };

  window.claude = Object.assign(window.claude || {}, {
    async use(name) {
      await ready;
      if (!session) { toLogin(); throw E('unauthenticated', 'سجّل الدخول أولاً'); }
      if (name === 'db') return db; if (name === 'user') return user; if (name === 'assets') return assets; if (name === 'downloads') return downloads;
      throw E('unavailable', name);
    }
  });
})();
