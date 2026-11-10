/* Al-Wady platform: shows notifications sent by the server, even when the app is closed. No caching here. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{ let d={}; try{ d=e.data?e.data.json():{}; }catch(x){ d={title:'الوادي الأخضر',body:e.data?e.data.text():''}; }
  const base=self.registration.scope; const url=new URL(d.url||'index.html#apps',base).href;
  e.waitUntil(self.registration.showNotification(d.title||'الوادي الأخضر',{body:d.body||'',tag:d.tag||undefined,renotify:!!d.tag,dir:'rtl',lang:'ar',icon:new URL('brand/icon-192.png',base).href,badge:new URL('brand/icon-192.png',base).href,data:{url}})); });
self.addEventListener('notificationclick',e=>{ e.notification.close(); const url=(e.notification.data&&e.notification.data.url)||self.registration.scope;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{ const path=new URL(url).pathname; for(const w of ws){ if(new URL(w.url).pathname===path){ w.focus(); return w.navigate?w.navigate(url):null; } } return self.clients.openWindow(url); })); });
