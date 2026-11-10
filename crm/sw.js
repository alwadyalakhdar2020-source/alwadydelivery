/* Al-Wady rep app: keeps the app shell available on weak or no connection. Data goes through the app's own offline queue. */
const CACHE='wady-crm-v2';
const SHELL=['index.html','wady-back.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(/supabase\.co$/.test(u.hostname))return; // live data is never cached here
  const lib=/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname);
  if(u.origin===location.origin||lib){
    // network first for the app page so updates arrive; cached copy when offline
    e.respondWith(fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r,{ignoreSearch:u.origin===location.origin}).then(m=>m||caches.match('index.html'))));
  }
});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'index.html?m=1';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{for(const w of ws){if(w.url.includes('/crm/')){w.focus();return w.navigate?w.navigate(url):null}}return self.clients.openWindow(url)}))});

// server notifications (visits, delivery, HR) — shown even when the app is closed
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){d={title:'الوادي الأخضر',body:e.data?e.data.text():''}}
  const root=new URL('../',self.registration.scope).href;const url=new URL(d.url||'crm/index.html?m=1',root).href;
  e.waitUntil(self.registration.showNotification(d.title||'الوادي الأخضر',{body:d.body||'',tag:d.tag||undefined,renotify:!!d.tag,dir:'rtl',lang:'ar',icon:'icon-192.png',badge:'icon-192.png',data:{url}}))});
