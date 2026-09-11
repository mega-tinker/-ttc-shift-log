document.addEventListener("DOMContentLoaded",function(){
const KEY="ttcShiftRecordsV4",LEGACY=["ttcShiftRecordsV3","ttcShiftRecordsV2","ttcShiftRecordsV1"];let editingId=null,pendingPhotos=[],modalCtx=null,currentWeekStart=null;const $=id=>document.getElementById(id);
function load(){try{let r=localStorage.getItem(KEY);if(r)return JSON.parse(r);for(const k of LEGACY){r=localStorage.getItem(k);if(r){const old=JSON.parse(r),m=old.map(x=>({id:x.id||String(Date.now())+Math.random(),date:x.date||"",routes:x.routes||"",crew:x.crew||"",run:x.run||"",bus:x.bus||"",platformTime:x.platformTime||"",scheduledStart:x.scheduledStart||x.start||"",scheduledFinish:x.scheduledFinish||x.finish||"",actualFinish:x.actualFinish||"",paid:x.paid||"",actualOt:x.actualOt||x.ot||"Pending",paidOt:x.paidOt||"0:00",unpaidOt:x.unpaidOt||"0:00",stepbackMissed:x.stepbackMissed||"No",stepbackTime:x.stepbackTime||"",camera:x.camera||"Unknown",incident:x.incident||"None",notes:x.notes||"",photos:Array.isArray(x.photos)?x.photos:[]}));localStorage.setItem(KEY,JSON.stringify(m));return m}}return[]}catch(e){return[]}}
function save(v){localStorage.setItem(KEY,JSON.stringify(v))}function today(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function initDurationSelects(){const h=$("platformHours"),m=$("platformMinutes");h.innerHTML="";m.innerHTML="";for(let i=0;i<=23;i++){const o=document.createElement("option");o.value=String(i);o.textContent=String(i);h.appendChild(o)}for(let i=0;i<60;i++){const o=document.createElement("option");o.value=String(i);o.textContent=String(i).padStart(2,"0");m.appendChild(o)}}
function platformValue(){return hm((Number($("platformHours").value)||0)*60+(Number($("platformMinutes").value)||0))}function setPlatformValue(v){const n=mins(v)||0;$("platformHours").value=String(Math.floor(n/60));$("platformMinutes").value=String(n%60)}
function sundayOf(dateLike){const d=new Date(dateLike+"T12:00:00");d.setDate(d.getDate()-d.getDay());d.setHours(12,0,0,0);return d}function isoDate(d){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}function fmtDate(d){return new Intl.DateTimeFormat("en-CA",{month:"short",day:"numeric",year:"numeric"}).format(d)}function weekRecords(){if(!currentWeekStart)currentWeekStart=sundayOf(today());const s=isoDate(currentWeekStart),e=isoDate(addDays(currentWeekStart,6));return load().filter(r=>String(r.date||"")>=s&&String(r.date||"")<=e)}
function mins(v){if(!v)return null;const p=String(v).split(":").map(Number);return p.length===2&&!isNaN(p[0])&&!isNaN(p[1])?p[0]*60+p[1]:null}
function diff(a,b){const s=mins(a),f=mins(b);if(s==null||f==null)return null;let d=f-s;if(d<0)d+=1440;return d}
function hm(n){if(n==null)return"";n=Math.max(0,Math.round(n));return Math.floor(n/60)+":"+String(n%60).padStart(2,"0")}
function recalc(){$("paid").value=hm(diff($("scheduledStart").value,$("scheduledFinish").value));const sf=$("scheduledFinish").value,af=$("actualFinish").value;if(!sf||!af){$("actualOt").value=$("paidOt").value=$("unpaidOt").value="Pending";return}const a=sf===af?0:diff(sf,af);$("actualOt").value=hm(a);if(a>=10){$("paidOt").value=hm(a);$("unpaidOt").value="0:00"}else{$("paidOt").value="0:00";$("unpaidOt").value=hm(a)}}
["scheduledStart","scheduledFinish","actualFinish"].forEach(id=>{$(id).addEventListener("input",recalc);$(id).addEventListener("change",recalc)});
$("stepbackMissed").addEventListener("change",function(){if(this.value==="No")$("stepbackTime").value=""});
function switchTab(n){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===n));document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id===n));if(n==="history")renderHistory();if(n==="summary")renderSummary()}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
function reset(){editingId=null;pendingPhotos=[];$("shiftForm").reset();$("date").value=today();setPlatformValue("0:00");$("camera").value="Unknown";$("incident").value="None";$("stepbackMissed").value="No";$("actualOt").value=$("paidOt").value=$("unpaidOt").value="Pending";$("paid").value="";$("saveMessage").textContent="";document.querySelector("#shiftForm .primary").textContent="Save Shift";renderPending()}
async function compress(file){const u=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)}),img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u});let w=img.width,h=img.height;const m=1600;if(Math.max(w,h)>m){const s=m/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s)}const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);return c.toDataURL("image/jpeg",.72)}
$("photos").addEventListener("change",async e=>{for(const f of Array.from(e.target.files||[])){try{pendingPhotos.push({id:String(Date.now())+Math.random(),data:await compress(f),addedAt:new Date().toISOString(),keep:false})}catch{}}e.target.value="";renderPending()});
function renderPending(){const b=$("photoPreview");b.innerHTML="";pendingPhotos.forEach((p,i)=>{const w=document.createElement("div");w.className="thumb-wrap";w.innerHTML='<img class="thumb" src="'+p.data+'"><button type="button" style="position:absolute;right:-5px;top:-5px;border:0;background:#7f1d1d;color:white;border-radius:50%;width:24px;height:24px">×</button>';w.querySelector("button").onclick=()=>{pendingPhotos.splice(i,1);renderPending()};b.appendChild(w)})}
$("shiftForm").addEventListener("submit",e=>{e.preventDefault();recalc();const records=load(),old=editingId?records.find(r=>r.id===editingId):null,r={id:editingId||String(Date.now())+Math.random(),date:$("date").value,routes:$("routes").value.trim(),crew:$("crew").value.trim(),run:$("run").value.trim(),bus:$("bus").value.trim(),platformTime:platformValue(),scheduledStart:$("scheduledStart").value,scheduledFinish:$("scheduledFinish").value,actualFinish:$("actualFinish").value,paid:$("paid").value,actualOt:$("actualOt").value,paidOt:$("paidOt").value,unpaidOt:$("unpaidOt").value,stepbackMissed:$("stepbackMissed").value,stepbackTime:$("stepbackTime").value.trim(),camera:$("camera").value,incident:$("incident").value,notes:$("notes").value.trim(),photos:[...(old?.photos||[]),...pendingPhotos]};const i=records.findIndex(x=>x.id===r.id);if(i>=0)records[i]=r;else records.push(r);try{save(records);$("saveMessage").textContent=editingId?"Shift updated.":"Shift saved.";renderHistory();renderSummary();setTimeout(reset,700)}catch{$("saveMessage").textContent="Storage full. Back up and remove old photos."}});
$("clearForm").addEventListener("click",reset);
$("search").addEventListener("input",renderHistory);

["sortOrder","filterFrom","filterTo","filterRoute","filterCrew","filterRun","filterBus","filterOt","filterStepback","filterIncident","filterCamera","filterPhotos"].forEach(id=>{
  const el=$(id);
  if(el){
    el.addEventListener("input",renderHistory);
    el.addEventListener("change",renderHistory);
  }
});

$("clearFilters").addEventListener("click",()=>{
  $("search").value="";
  $("sortOrder").value="newest";
  $("filterFrom").value="";
  $("filterTo").value="";
  $("filterRoute").value="";
  $("filterCrew").value="";
  $("filterRun").value="";
  $("filterBus").value="";
  $("filterOt").value="all";
  $("filterStepback").value="all";
  $("filterIncident").value="all";
  $("filterCamera").value="all";
  $("filterPhotos").value="all";
  renderHistory();
});
function expired(p){if(!p?.addedAt||p.keep)return false;const a=new Date(p.addedAt),c=new Date();c.setMonth(c.getMonth()-6);return a<c}
function renderHistory(){
  const q=$("search").value.trim().toLowerCase();
  const sort=$("sortOrder").value;
  const from=$("filterFrom").value;
  const to=$("filterTo").value;
  const route=$("filterRoute").value.trim().toLowerCase();
  const crew=$("filterCrew").value.trim().toLowerCase();
  const run=$("filterRun").value.trim().toLowerCase();
  const bus=$("filterBus").value.trim().toLowerCase();
  const ot=$("filterOt").value;
  const stepback=$("filterStepback").value;
  const incident=$("filterIncident").value;
  const camera=$("filterCamera").value;
  const photos=$("filterPhotos").value;

  const all=load();
  let records=all.filter(r=>{
    if(q && !Object.values({...r,photos:""}).some(v=>String(v??"").toLowerCase().includes(q))) return false;
    if(from && String(r.date||"")<from) return false;
    if(to && String(r.date||"")>to) return false;
    if(route && !String(r.routes||"").toLowerCase().includes(route)) return false;
    if(crew && !String(r.crew||"").toLowerCase().includes(crew)) return false;
    if(run && !String(r.run||"").toLowerCase().includes(run)) return false;
    if(bus && !String(r.bus||"").toLowerCase().includes(bus)) return false;

    if(ot==="paid" && !(mins(r.paidOt)>0)) return false;
    if(ot==="unpaid" && !(mins(r.unpaidOt)>0)) return false;
    if(ot==="none" && !((mins(r.actualOt)||0)===0 && r.actualOt!=="Pending")) return false;
    if(ot==="pending" && r.actualOt!=="Pending") return false;

    if(stepback==="missed" && r.stepbackMissed!=="Yes") return false;
    if(stepback==="not-missed" && r.stepbackMissed==="Yes") return false;

    if(incident==="any" && (!r.incident || r.incident==="None")) return false;
    if(incident!=="all" && incident!=="any" && r.incident!==incident) return false;

    if(camera!=="all" && r.camera!==camera) return false;

    const hasPhotos=(r.photos||[]).length>0;
    if(photos==="has" && !hasPhotos) return false;
    if(photos==="none" && hasPhotos) return false;

    return true;
  });

  records.sort((a,b)=>{
    const cmp=String(a.date||"").localeCompare(String(b.date||""));
    return sort==="oldest"?cmp:-cmp;
  });

  $("filterCount").textContent=records.length+" of "+all.length+" shift(s)";

  const list=$("historyList");
  list.innerHTML="";
  if(!records.length){
    list.innerHTML='<div class="record-card">No matching records.</div>';
    return;
  }

  records.forEach(r=>{
    const c=document.createElement("article");
    c.className="record-card";
    c.innerHTML=`<div class="card-head"><div><strong>${r.date||""}</strong><span class="card-route">Route(s): ${r.routes||""}</span></div><button class="edit-btn" type="button">Edit</button></div><div class="card-grid"><div><b>Crew:</b> ${r.crew||""}</div><div><b>Run:</b> ${r.run||""}</div><div><b>Bus:</b> ${r.bus||""}</div><div><b>Platform:</b> ${r.platformTime||"—"}</div><div><b>Scheduled Start:</b> ${r.scheduledStart||""}</div><div><b>Scheduled Finish:</b> ${r.scheduledFinish||""}</div><div><b>Actual Finish:</b> ${r.actualFinish||"Pending"}</div><div><b>Paid:</b> ${r.paid||""}</div><div><b>Actual OT:</b> ${r.actualOt||"Pending"}</div><div><b>Paid OT (2×):</b> ${r.paidOt||"Pending"}</div><div><b>Unpaid OT:</b> ${r.unpaidOt||"Pending"}</div><div><b>Step-back:</b> ${r.stepbackMissed||"No"} ${r.stepbackTime||""}</div><div><b>Camera:</b> ${r.camera||""}</div><div><b>Incident:</b> ${r.incident||""}</div></div><div class="history-photos"></div><div class="card-notes"></div><button class="delete-btn" type="button">Delete</button>`;
    c.querySelector(".card-notes").textContent=r.notes||"";
    c.querySelector(".edit-btn").onclick=()=>edit(r.id);
    c.querySelector(".delete-btn").onclick=()=>del(r.id);
    const pb=c.querySelector(".history-photos");
    (r.photos||[]).forEach(p=>{
      const w=document.createElement("div");
      w.className="thumb-wrap";
      w.innerHTML='<img class="thumb" src="'+p.data+'">'+(p.keep?'<span class="keep-badge">Keep</span>':expired(p)?'<span class="expired-badge">6+ mo</span>':'');
      w.querySelector("img").onclick=()=>openPhoto(r.id,p.id);
      pb.appendChild(w);
    });
    list.appendChild(c);
  });
}
function edit(id){const r=load().find(x=>x.id===id);if(!r)return;editingId=id;pendingPhotos=[];["date","routes","crew","run","bus","scheduledStart","scheduledFinish","actualFinish","stepbackTime","camera","incident","notes"].forEach(k=>$(k).value=r[k]||"");setPlatformValue(r.platformTime||"0:00");$("stepbackMissed").value=r.stepbackMissed||"No";recalc();document.querySelector("#shiftForm .primary").textContent="Update Shift";switchTab("new");window.scrollTo(0,0)}
function del(id){if(confirm("Delete this shift record?")){save(load().filter(r=>r.id!==id));renderHistory();renderSummary()}}
function total(records,f){return records.reduce((s,r)=>{const m=String(r[f]||"").match(/^(\d+):(\d{2})$/);return s+(m?+m[1]*60 + +m[2]:0)},0)}
function renderSummary(){const all=load();if(!currentWeekStart)currentWeekStart=sundayOf(today());const end=addDays(currentWeekStart,6);$("weekRange").textContent=fmtDate(currentWeekStart)+" – "+fmtDate(end);const week=weekRecords();const missing=week.filter(r=>!r.platformTime||r.platformTime==="0:00").length;let lt=0,gt=0;week.forEach(r=>{const p=mins(r.platformTime);if(p==null||p===0)return;lt+=Math.min(p,480);gt+=Math.max(0,p-480)});$("weekTotalPaid").textContent=hm(total(week,"paid"));$("weekPlatformLt8").textContent=hm(lt);$("weekPlatformGt8").textContent=hm(gt);$("weekPaidOt").textContent=hm(total(week,"paidOt"));$("weekStepback").textContent=hm(total(week,"stepbackTime"));$("weekActualOt").textContent=hm(total(week,"actualOt"));$("weekPaidOtDetail").textContent=hm(total(week,"paidOt"));$("weekUnpaidOt").textContent=hm(total(week,"unpaidOt"));$("platformMissingNote").textContent=missing?missing+" shift(s) this week have no Platform Time entered.":"";const body=$("dailyBreakdownBody");body.innerHTML="";if(!week.length){body.innerHTML='<tr><td colspan="8">No shifts in this week.</td></tr>'}else{week.slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).forEach(r=>{const p=mins(r.platformTime)||0,l=Math.min(p,480),g=Math.max(0,p-480),tr=document.createElement("tr");tr.innerHTML=`<td>${r.date||""}</td><td>${r.routes||""}</td><td>${r.bus||""}</td><td>${r.platformTime||"—"}</td><td>${p?hm(l):"—"}</td><td>${g?hm(g):"—"}</td><td>${r.paidOt&&r.paidOt!=="Pending"?r.paidOt:"—"}</td><td>${r.stepbackTime||"—"}</td>`;body.appendChild(tr)})}$("allShifts").textContent=all.length;const routes=[];all.forEach(r=>String(r.routes||"").split(/[\/,]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>routes.push(x)));$("allRoutes").textContent=new Set(routes).size;$("allBuses").textContent=new Set(all.map(r=>r.bus).filter(Boolean)).size;$("allIncidents").textContent=all.filter(r=>r.incident&&r.incident!=="None").length;const photos=all.flatMap(r=>r.photos||[]);$("allPhotos").textContent=photos.length;$("allPaid").textContent=hm(total(all,"paid"));const n=photos.filter(expired).length;$("expiredInfo").textContent=n?n+" photo(s) older than 6 months and not marked Keep.":"No expired photos."}
$("cleanupPhotos").onclick=()=>{const r=load(),n=r.flatMap(x=>x.photos||[]).filter(expired).length;if(!n)return alert("No expired photos to clean up.");if(!confirm("Delete "+n+" expired photo(s)? Shift records will stay."))return;r.forEach(x=>x.photos=(x.photos||[]).filter(p=>!expired(p)));save(r);renderHistory();renderSummary()}
function openPhoto(rid,pid){const r=load().find(x=>x.id===rid),p=r?.photos?.find(x=>x.id===pid);if(!p)return;modalCtx={rid,pid};$("modalImage").src=p.data;$("keepPhoto").checked=!!p.keep;$("photoModal").classList.remove("hidden")}
$("closeModal").onclick=()=>$("photoModal").classList.add("hidden");$("keepPhoto").onchange=function(){if(!modalCtx)return;const r=load(),rec=r.find(x=>x.id===modalCtx.rid),p=rec?.photos?.find(x=>x.id===modalCtx.pid);if(p){p.keep=this.checked;save(r);renderHistory();renderSummary()}}
$("deletePhoto").onclick=()=>{if(!modalCtx||!confirm("Delete this photo?"))return;const r=load(),rec=r.find(x=>x.id===modalCtx.rid);if(rec)rec.photos=(rec.photos||[]).filter(p=>p.id!==modalCtx.pid);save(r);$("photoModal").classList.add("hidden");renderHistory();renderSummary()}
function download(content,name,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$("exportCsv").onclick=()=>{const h=["Date","Route(s)","Crew","Run","Bus","Platform Time","Scheduled Start","Scheduled Finish","Actual Finish","Paid","Actual OT","Paid OT 2x","Unpaid OT","Step-back Missed","Step-back Time 1x","Side Camera","Incident","Notes","Photo Count"],rows=load().map(r=>[r.date,r.routes,r.crew,r.run,r.bus,r.platformTime,r.scheduledStart,r.scheduledFinish,r.actualFinish,r.paid,r.actualOt,r.paidOt,r.unpaidOt,r.stepbackMissed,r.stepbackTime,r.camera,r.incident,r.notes,(r.photos||[]).length]),csv=[h,...rows].map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\n");download(csv,"TTC_Shift_Log.csv","text/csv;charset=utf-8")}
$("exportJson").onclick=()=>download(JSON.stringify(load(),null,2),"TTC_Shift_Log_Backup.json","application/json");
$("importJson").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!Array.isArray(d))throw 0;if(confirm("Restore "+d.length+" records? This replaces current records.")){save(d);renderHistory();renderSummary();alert("Backup restored.")}}catch{alert("Could not read backup file.")}e.target.value=""}
$("deleteAll").onclick=()=>{if(confirm("Delete ALL TTC records from this device?")){localStorage.removeItem(KEY);renderHistory();renderSummary()}}
$("prevWeek").addEventListener("click",()=>{currentWeekStart=addDays(currentWeekStart||sundayOf(today()),-7);renderSummary()});$("nextWeek").addEventListener("click",()=>{currentWeekStart=addDays(currentWeekStart||sundayOf(today()),7);renderSummary()});
function openWorkDrill(type){const all=load(),box=$("workDrilldown");box.classList.remove("hidden");let title="",rows=[];if(type==="shifts"){title="All Shifts";rows=all.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(r=>({label:(r.date||"")+" · Route "+(r.routes||""),meta:"Bus "+(r.bus||"")+" · Run "+(r.run||""),action:()=>{$("search").value=r.date||"";switchTab("history");renderHistory()}}))}else if(type==="routes"){title="Routes";const m={};all.forEach(r=>String(r.routes||"").split(/[\/,]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>m[x]=(m[x]||0)+1));rows=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({label:"Route "+k,meta:v+" shift(s)",action:()=>{$("filterRoute").value=k;switchTab("history");renderHistory()}}))}else if(type==="buses"){title="Buses";const m={};all.forEach(r=>{if(r.bus)m[r.bus]=(m[r.bus]||0)+1});rows=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({label:"Bus "+k,meta:v+" shift(s)",action:()=>{$("filterBus").value=k;switchTab("history");renderHistory()}}))}else if(type==="incidents"){title="Incidents";rows=all.filter(r=>r.incident&&r.incident!=="None").sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(r=>({label:(r.date||"")+" · "+r.incident,meta:"Route "+(r.routes||"")+" · Bus "+(r.bus||""),action:()=>{$("search").value=r.date||"";$("filterIncident").value=r.incident;switchTab("history");renderHistory()}}))}else if(type==="photos"){title="Shifts With Photos";rows=all.filter(r=>(r.photos||[]).length).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(r=>({label:(r.date||"")+" · Route "+(r.routes||""),meta:(r.photos||[]).length+" photo(s)",action:()=>{$("search").value=r.date||"";$("filterPhotos").value="has";switchTab("history");renderHistory()}}))}else if(type==="paid"){title="Overall Paid";const m={};all.forEach(r=>{const y=String(r.date||"").slice(0,4)||"Unknown";m[y]=(m[y]||0)+(mins(r.paid)||0)});rows=Object.entries(m).sort((a,b)=>String(b[0]).localeCompare(String(a[0]))).map(([k,v])=>({label:k,meta:hm(v),action:()=>{$("filterFrom").value=k+"-01-01";$("filterTo").value=k+"-12-31";switchTab("history");renderHistory()}}))}box.innerHTML='<div class="drill-title"><h3>'+title+'</h3><button id="closeDrill" class="secondary" type="button">Close</button></div>';if(!rows.length)box.innerHTML+='<div class="drill-meta">No matching records.</div>';rows.slice(0,100).forEach(r=>{const d=document.createElement("div");d.className="drill-row";d.innerHTML='<div><strong>'+r.label+'</strong><div class="drill-meta">'+r.meta+'</div></div><button type="button">View</button>';d.querySelector("button").onclick=r.action;box.appendChild(d)});const c=$("closeDrill");if(c)c.onclick=()=>box.classList.add("hidden")}
document.querySelectorAll(".work-chip").forEach(b=>b.addEventListener("click",()=>openWorkDrill(b.dataset.work)));initDurationSelects();currentWeekStart=sundayOf(today());reset();renderHistory();renderSummary();if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js?v=6").catch(()=>{}))
});