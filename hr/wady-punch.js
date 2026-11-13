/* Mobile attendance: check in / out from the phone, accepted only inside a work site's radius; time comes from the server */
const PUNCH={today:null,busy:false,err:''};
async function punchLoad(){try{const {data}=await window.__sb.rpc('hr_punch_today');PUNCH.today=data||{}}catch(e){PUNCH.today={}}renderView()}
function punchCard(){if(!S.meId)return '';if(PUNCH.today==null){PUNCH.today={};setTimeout(punchLoad,0)}const t=PUNCH.today||{};
  const nxt=!t.in?'in':'out';const sites=D.orgunits.list.filter(u=>u.type==='location'&&u.lat&&u.lng).length;
  return `<div class="card punch" style="margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b style="font-size:16px">تسجيل الحضور بالجوال</b>
   <div class="small muted" style="margin-top:4px">${t.in?`حضور <b>${esc(t.in)}</b>`:'ما سجلت حضور اليوم'}${t.out?` · انصراف <b>${esc(t.out)}</b>`:''}${t.inGeo?.loc?` · ${esc(t.inGeo.loc)}`:''}</div>
   ${PUNCH.err?`<div class="small" style="color:var(--bad,#b42318);margin-top:4px">${esc(PUNCH.err)}</div>`:''}${!sites?`<div class="small muted">ما تم تحديد إحداثيات مواقع العمل بعد (الإعدادات ← الهيكل التنظيمي ← الموقع).</div>`:''}</div>
   <button class="btn pri" data-act="punch" ${PUNCH.busy?'disabled':''} style="min-width:150px;font-size:15px;padding:12px 18px">${PUNCH.busy?'جاري تحديد موقعك…':nxt==='in'?'تسجيل حضور':(t.out?'تحديث الانصراف':'تسجيل انصراف')}</button></div>`}
ACT.punch=async()=>{if(PUNCH.busy)return;PUNCH.busy=true;PUNCH.err='';renderView();
  try{const g=await new Promise((res,rej)=>{if(!navigator.geolocation)return rej(new Error('الجهاز ما يدعم تحديد الموقع'));navigator.geolocation.getCurrentPosition(p=>res(p.coords),e=>rej(new Error(e.code===1?'لازم تسمح للموقع بالوصول لموقعك من إعدادات المتصفح':'ما قدرنا نحدد موقعك — تأكد إن GPS شغال')),{enableHighAccuracy:true,timeout:20000,maximumAge:0})});
    const {data,error}=await window.__sb.rpc('hr_punch',{p_lat:g.latitude,p_lng:g.longitude,p_acc:Math.round(g.accuracy||0)});if(error)throw error;
    PUNCH.today={...(PUNCH.today||{}),in:data.in,out:data.out,inGeo:{loc:data.loc}};toast(data.kind==='in'?`تم تسجيل حضورك ${data.time} — ${data.loc}`:`تم تسجيل انصرافك ${data.time}`)}
  catch(e){PUNCH.err=e.message||String(e)}finally{PUNCH.busy=false;renderView()}};
ACT['unit-gps']=()=>{if(!navigator.geolocation)return toast('الجهاز ما يدعم تحديد الموقع',true);navigator.geolocation.getCurrentPosition(p=>{const f=document.getElementById('unf');f.querySelector('[name=lat]').value=p.coords.latitude.toFixed(6);f.querySelector('[name=lng]').value=p.coords.longitude.toFixed(6);toast(`تم — الدقة ± ${Math.round(p.coords.accuracy)} م`)},()=>toast('تعذّر تحديد الموقع',true),{enableHighAccuracy:true,timeout:20000})};
{const _h=VIEWS.home;VIEWS.home=()=>{const h=_h();return S.meId?punchCard()+h:h}}
{const _a=VIEWS.attendance;VIEWS.attendance=()=>{const h=_a();return S.meId&&(S.tabs?.att||'')==='mine'||S.meId&&!(can('att.manage')||can('leave.manage')||can('team.view'))?punchCard()+h:h}}
