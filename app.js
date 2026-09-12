document.addEventListener("DOMContentLoaded",function(){
const KEY="ttcShiftRecordsV4";
let editingId=null,pendingPhotos=[],modalCtx=null,currentWeekStart=null;
const $=id=>document.getElementById(id);

function load(){try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){return[]}}
function save(v){localStorage.setItem(KEY,JSON.stringify(v))}
function today(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function mins(v){const m=String(v||"").match(/^(\d+):([0-5]\d)$/);return m?+m[1]*60 + +m[2]:0}
function hm(n){n=Math.max(0,Math.round(n||0));return Math.floor(n/60)+":"+String(n%60).padStart(2,"0")}
function diff(a,b){const ma=String(a||"").match(/^(\d{1,2}):([0-5]\d)$/),mb=String(b||"").match(/^(\d{1,2}):([0-5]\d)$/);if(!ma||!mb)return 0;let s=+ma[1]*60 + +ma[2],f=+mb[1]*60 + +mb[2],d=f-s;if(d<0)d+=1440;return d}
function sundayOf(s){const d=new Date(s+"T12:00:00");d.setDate(d.getDate()-d.getDay());d.setHours(12,0,0,0);return d}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function iso(d){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function fmt(d){return new Intl.DateTimeFormat("en-CA",{month:"short",day:"numeric",year:"numeric"}).format(d)}

function reclassify(records){
  const groups={};
  records.forEach(r=>{if(r.date)(groups[r.date]??=[]).push(r)});
  Object.values(groups).forEach(day=>{
    const totalActual=day.reduce((s,r)=>s+(r.actualFinish?mins(r.actualOt):0),0);
    day.forEach(r=>{
      if(!r.actualFinish){
        r.actualOt="0:00";r.paidOt="0:00";r.unpaidOt="0:00";
      }else if(totalActual>=10){
        r.paidOt=r.actualOt||"0:00";r.unpaidOt="0:00";
      }else{
        r.paidOt="0:00";r.unpaidOt=r.actualOt||"0:00";
      }
    });
  });
  return records;
}

function recalc(){
  $("paid").value=hm(diff($("scheduledStart").value,$("scheduledFinish").value));
  const sf=$("scheduledFinish").value,af=$("actualFinish").value;
  if(!sf||!af){$("actualOt").value="0:00";$("paidOt").value="0:00";$("unpaidOt").value="0:00";return}
  $("actualOt").value=hm(sf===af?0:diff(sf,af));
  $("paidOt").value="0:00";$("unpaidOt").value="0:00";
}
["scheduledStart","scheduledFinish","actualFinish"].forEach(id=>{$(id).addEventListener("input",recalc);$(id).addEventListener("change",recalc)});
function updateStepbackUI(){
  const off=$("stepbackMissed").value==="No";
  if(off)$("stepbackTime").value="";
  $("stepbackTime").disabled=off;
  $("stepbackTimeWrap").classList.toggle("is-disabled",off);
}
$("stepbackMissed").onchange=updateStepbackUI;

function switchTab(name){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id===name));
  if(name==="history")renderHistory();
  if(name==="summary")renderSummary();
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));

function reset(){
  editingId=null;pendingPhotos=[];$("shiftForm").reset();
  $("date").value=today();$("camera").value="Unknown";$("incident").value="None";$("stepbackMissed").value="No";$("overtimeWork").value="No";
  $("paid").value="";$("actualOt").value=$("paidOt").value=$("unpaidOt").value="0:00";updateStepbackUI();
  $("saveMessage").textContent="";document.querySelector("#shiftForm .primary").textContent="Save Shift";renderPending();
}

async function compress(file){
  const u=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u});
  let w=img.width,h=img.height,max=1600;if(Math.max(w,h)>max){const s=max/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s)}
  const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);
  return c.toDataURL("image/jpeg",.72);
}
$("photos").onchange=async e=>{for(const f of Array.from(e.target.files||[])){try{pendingPhotos.push({id:String(Date.now())+Math.random(),data:await compress(f),addedAt:new Date().toISOString(),keep:false})}catch{}}e.target.value="";renderPending()};
function renderPending(){const b=$("photoPreview");b.innerHTML="";pendingPhotos.forEach((p,i)=>{const w=document.createElement("div");w.className="thumb-wrap";w.innerHTML='<img class="thumb" src="'+p.data+'"><button type="button" style="position:absolute;right:-5px;top:-5px;border:0;background:#7f1d1d;color:white;border-radius:50%;width:24px;height:24px">×</button>';w.querySelector("button").onclick=()=>{pendingPhotos.splice(i,1);renderPending()};b.appendChild(w)})}

function saveCurrentShift(keepForNext=false){
  recalc();
  const records=load(),old=editingId?records.find(r=>r.id===editingId):null;
  const r={id:editingId||String(Date.now())+Math.random(),date:$("date").value,routes:$("routes").value.trim(),crew:$("crew").value.trim(),run:$("run").value.trim(),bus:$("bus").value.trim(),scheduledStart:$("scheduledStart").value,scheduledFinish:$("scheduledFinish").value,actualFinish:$("actualFinish").value,overtimeWork:$("overtimeWork").value,paid:$("paid").value,actualOt:$("actualOt").value,paidOt:$("paidOt").value,unpaidOt:$("unpaidOt").value,stepbackMissed:$("stepbackMissed").value,stepbackTime:$("stepbackTime").value.trim(),camera:$("camera").value,incident:$("incident").value,notes:$("notes").value.trim(),photos:[...(old?.photos||[]),...pendingPhotos]};
  const i=records.findIndex(x=>x.id===r.id);if(i>=0)records[i]=r;else records.push(r);
  reclassify(records);
  try{
    save(records);
    renderHistory();renderSummary();
    if(keepForNext){
      const keepDate=r.date,keepCrew=r.crew;
      reset();
      $("date").value=keepDate;
      $("crew").value=keepCrew;
      $("saveMessage").textContent="Saved. Ready for the next piece.";
      $("routes").focus();
    }else{
      $("saveMessage").textContent=editingId?"Shift updated.":"Shift saved.";
      setTimeout(reset,600);
    }
    return true;
  }catch{
    $("saveMessage").textContent="Storage full. Back up and remove old photos.";
    return false;
  }
}
$("shiftForm").onsubmit=e=>{e.preventDefault();saveCurrentShift(false)};
$("saveNextPiece").onclick=()=>{
  if(!$("shiftForm").reportValidity())return;
  saveCurrentShift(true);
};
$("clearForm").onclick=reset;
$("noOtButton").onclick=()=>{
  const finish=$("scheduledFinish").value;
  if(!finish){$("saveMessage").textContent="Enter Scheduled Finish first.";return}
  $("actualFinish").value=finish;
  recalc();
  $("saveMessage").textContent="Actual Finish set to scheduled finish — no OT.";
  setTimeout(()=>{if($("saveMessage").textContent.includes("no OT"))$("saveMessage").textContent=""},1600);
};

function expired(p){if(!p?.addedAt||p.keep)return false;const a=new Date(p.addedAt),c=new Date();c.setMonth(c.getMonth()-6);return a<c}

function filteredRecords(){
  const q=$("search").value.trim().toLowerCase(),from=$("filterFrom").value,to=$("filterTo").value,route=$("filterRoute").value.trim().toLowerCase(),crew=$("filterCrew").value.trim().toLowerCase(),run=$("filterRun").value.trim().toLowerCase(),bus=$("filterBus").value.trim().toLowerCase(),ot=$("filterOt").value,step=$("filterStepback").value,inc=$("filterIncident").value,cam=$("filterCamera").value,ph=$("filterPhotos").value;
  let r=load().filter(x=>{
    if(q&&!Object.values({...x,photos:""}).some(v=>String(v??"").toLowerCase().includes(q)))return false;
    if(from&&x.date<from)return false;if(to&&x.date>to)return false;
    if(route&&!String(x.routes||"").toLowerCase().includes(route))return false;
    if(crew&&!String(x.crew||"").toLowerCase().includes(crew))return false;
    if(run&&!String(x.run||"").toLowerCase().includes(run))return false;
    if(bus&&!String(x.bus||"").toLowerCase().includes(bus))return false;
    if(ot==="paid"&&!(mins(x.paidOt)>0))return false;if(ot==="unpaid"&&!(mins(x.unpaidOt)>0))return false;if(ot==="none"&&mins(x.actualOt)!==0)return false;
    if(step==="missed"&&x.stepbackMissed!=="Yes")return false;if(step==="not-missed"&&x.stepbackMissed==="Yes")return false;
    if(inc==="any"&&(!x.incident||x.incident==="None"))return false;if(inc!=="all"&&inc!=="any"&&x.incident!==inc)return false;
    if(cam!=="all"&&x.camera!==cam)return false;
    const has=(x.photos||[]).length>0;if(ph==="has"&&!has)return false;if(ph==="none"&&has)return false;
    return true;
  });
  r.sort((a,b)=>{
    const dateCmp=String(a.date||"").localeCompare(String(b.date||""));
    if(dateCmp!==0)return $("sortOrder").value==="oldest"?dateCmp:-dateCmp;
    const aStart=diff("00:00",a.scheduledStart||"00:00");
    const bStart=diff("00:00",b.scheduledStart||"00:00");
    return $("sortOrder").value==="oldest" ? aStart-bStart : bStart-aStart;
  });
  return r;
}

function renderHistory(){
  const records=filteredRecords(),all=load(),list=$("historyList");$("filterCount").textContent=records.length+" of "+all.length+" shift(s)";list.innerHTML="";
  if(!records.length){list.innerHTML='<div class="record-card">No matching records.</div>';return}
  records.forEach(r=>{
    const c=document.createElement("article");c.className="record-card";
    c.innerHTML=`<div class="card-head"><div><strong>${r.date||""}</strong><span class="card-route">Route(s): ${r.routes||""}</span></div><button class="edit-btn">Edit</button></div><div class="card-grid"><div><b>Crew:</b> ${r.crew||""}</div><div><b>Run:</b> ${r.run||""}</div><div><b>Bus:</b> ${r.bus||""}</div><div><b>Start:</b> ${r.scheduledStart||""}</div><div><b>Scheduled Finish:</b> ${r.scheduledFinish||""}</div><div><b>Actual Finish:</b> ${r.actualFinish||"—"}</div><div><b>Overtime Work:</b> ${r.overtimeWork==="Yes"?"Yes (1.5×)":"No"}</div><div><b>Paid:</b> ${r.paid||""}</div><div><b>Actual OT:</b> ${r.actualOt||"0:00"}</div><div><b>Paid OT (2×):</b> ${r.paidOt||"0:00"}</div><div><b>Unpaid OT:</b> ${r.unpaidOt||"0:00"}</div><div><b>Step-back:</b> ${r.stepbackMissed||"No"} ${r.stepbackTime||""}</div><div><b>Camera:</b> ${r.camera||""}</div><div><b>Incident:</b> ${r.incident||""}</div></div><div class="history-photos"></div><div class="card-notes"></div><button class="delete-btn">Delete</button>`;
    c.querySelector(".card-notes").textContent=r.notes||"";c.querySelector(".edit-btn").onclick=()=>edit(r.id);c.querySelector(".delete-btn").onclick=()=>del(r.id);
    const pb=c.querySelector(".history-photos");(r.photos||[]).forEach(p=>{const w=document.createElement("div");w.className="thumb-wrap";w.innerHTML='<img class="thumb" src="'+p.data+'">'+(p.keep?'<span class="keep-badge">Keep</span>':expired(p)?'<span class="expired-badge">6+ mo</span>':'');w.querySelector("img").onclick=()=>openPhoto(r.id,p.id);pb.appendChild(w)});
    list.appendChild(c);
  });
}

function edit(id){
  const r=load().find(x=>x.id===id);if(!r)return;editingId=id;pendingPhotos=[];
  ["date","routes","crew","run","bus","scheduledStart","scheduledFinish","actualFinish","overtimeWork","stepbackTime","camera","incident","notes"].forEach(k=>$(k).value=r[k]||"");
  $("stepbackMissed").value=r.stepbackMissed||"No";$("overtimeWork").value=r.overtimeWork||"No";updateStepbackUI();recalc();document.querySelector("#shiftForm .primary").textContent="Update Shift";switchTab("new");window.scrollTo(0,0);
}
function del(id){if(confirm("Delete this shift record?")){const r=reclassify(load().filter(x=>x.id!==id));save(r);renderHistory();renderSummary()}}

function activeFilterCount(){
  let n=0;
  if($("search").value.trim())n++;
  if($("sortOrder").value!=="newest")n++;
  ["filterFrom","filterTo","filterRoute","filterCrew","filterRun","filterBus"].forEach(id=>{if($(id).value.trim())n++});
  ["filterOt","filterStepback","filterIncident","filterCamera","filterPhotos"].forEach(id=>{if($(id).value!=="all")n++});
  return n;
}
function updateFilterState(){
  const n=activeFilterCount(),box=document.querySelector(".filter-box");
  box.classList.toggle("filters-active",n>0);
  $("filterBadge").textContent=n?`${n} active`:"None";
  $("clearFilters").classList.toggle("has-filters",n>0);
}
["search","sortOrder","filterFrom","filterTo","filterRoute","filterCrew","filterRun","filterBus","filterOt","filterStepback","filterIncident","filterCamera","filterPhotos"].forEach(id=>{const el=$(id);el.addEventListener("input",()=>{updateFilterState();renderHistory()});el.addEventListener("change",()=>{updateFilterState();renderHistory()})});
$("clearFilters").onclick=()=>{$("search").value="";$("sortOrder").value="newest";["filterFrom","filterTo","filterRoute","filterCrew","filterRun","filterBus"].forEach(id=>$(id).value="");["filterOt","filterStepback","filterIncident","filterCamera","filterPhotos"].forEach(id=>$(id).value="all");updateFilterState();renderHistory()};

function total(records,f){return records.reduce((s,r)=>s+mins(r[f]),0)}
function renderSummary(){
  const all=reclassify(load());save(all);
  if(!currentWeekStart)currentWeekStart=sundayOf(today());
  const end=addDays(currentWeekStart,6),startISO=iso(currentWeekStart),endISO=iso(end);
  $("weekRange").textContent=fmt(currentWeekStart)+" – "+fmt(end);
  const week=all.filter(r=>r.date>=startISO&&r.date<=endISO),days={};
  week.forEach(r=>(days[r.date]??=[]).push(r));

  let lt8=0,gt8=0,overtimeWork=0,actual=0,paidOt=0,unpaidOt=0,stepback=0;
  const body=$("dailyBreakdownBody");body.innerHTML="";
  const keys=Object.keys(days).sort();
  if(!keys.length)body.innerHTML='<tr><td colspan="9">No shifts in this week.</td></tr>';

  keys.forEach(date=>{
    const entries=days[date];
    const normalPlatform=entries.filter(r=>r.overtimeWork!=="Yes").reduce((s,r)=>s+diff(r.scheduledStart,r.scheduledFinish),0);
    const dOvertimeWork=entries.filter(r=>r.overtimeWork==="Yes").reduce((s,r)=>s+diff(r.scheduledStart,r.scheduledFinish),0);
    const platform=normalPlatform+dOvertimeWork;
    const dlt=Math.min(normalPlatform,480),dgt=Math.max(0,normalPlatform-480);
    const dactual=entries.reduce((s,r)=>s+(r.actualFinish?mins(r.actualOt):0),0);
    const dpaid=dactual>=10?dactual:0,dunpaid=dactual<10?dactual:0;
    const dstep=entries.reduce((s,r)=>s+mins(r.stepbackTime),0);

    lt8+=dlt;gt8+=dgt;overtimeWork+=dOvertimeWork;actual+=dactual;paidOt+=dpaid;unpaidOt+=dunpaid;stepback+=dstep;

    const routes=[...new Set(entries.flatMap(r=>String(r.routes||"").split(/[\\/,]+/).map(x=>x.trim()).filter(Boolean)))].join(" / ");
    const buses=[...new Set(entries.map(r=>r.bus).filter(Boolean))].join(" / ");
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${date}</td><td>${routes||"—"}</td><td>${buses||"—"}</td><td>${hm(platform)}</td><td>${hm(dlt)}</td><td>${dgt?hm(dgt):"—"}</td><td>${dpaid?hm(dpaid):"—"}</td><td>${dunpaid?hm(dunpaid):"—"}</td><td>${dstep?hm(dstep):"—"}</td>`;
    body.appendChild(tr);
  });

  $("weekTotalPaid").textContent=hm(total(week,"paid"));
  $("weekPlatformLt8").textContent=hm(lt8);
  $("weekPlatformGt8").textContent=hm(gt8);$("weekOvertimeWork").textContent=hm(overtimeWork);
  $("weekPaidOt").textContent=hm(paidOt);
  $("weekStepback").textContent=hm(stepback);
  $("weekActualOt").textContent=hm(actual);
  $("weekPaidOtDetail").textContent=hm(paidOt);
  $("weekUnpaidOt").textContent=hm(unpaidOt);

  $("allShifts").textContent=all.length;
  const routes=[];all.forEach(r=>String(r.routes||"").split(/[\\/,]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>routes.push(x)));
  $("allRoutes").textContent=new Set(routes).size;
  $("allBuses").textContent=new Set(all.map(r=>r.bus).filter(Boolean)).size;
  $("allIncidents").textContent=all.filter(r=>r.incident&&r.incident!=="None").length;
  const photos=all.flatMap(r=>r.photos||[]);
  $("allPhotos").textContent=photos.length;
  $("allPaid").textContent=hm(total(all,"paid"));
  const ex=photos.filter(expired).length;$("expiredInfo").textContent=ex?ex+" photo(s) older than 6 months and not marked Keep.":"No expired photos.";
}

$("prevWeek").onclick=()=>{currentWeekStart=addDays(currentWeekStart,-7);renderSummary()};
$("nextWeek").onclick=()=>{currentWeekStart=addDays(currentWeekStart,7);renderSummary()};

function openWork(type){
  const all=load(),box=$("workDrilldown");box.classList.remove("hidden");let title="",rows=[];
  if(type==="shifts"){title="All Shifts";rows=all.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>[r.date+" · Route "+r.routes,"Bus "+r.bus+" · Run "+r.run,()=>{$("search").value=r.date;switchTab("history")}])}
  if(type==="routes"){title="Routes";const m={};all.forEach(r=>String(r.routes||"").split(/[\\/,]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>m[x]=(m[x]||0)+1));rows=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>["Route "+k,v+" shift(s)",()=>{$("filterRoute").value=k;switchTab("history")}])}
  if(type==="buses"){title="Buses";const m={};all.forEach(r=>{if(r.bus)m[r.bus]=(m[r.bus]||0)+1});rows=Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>["Bus "+k,v+" shift(s)",()=>{$("filterBus").value=k;switchTab("history")}])}
  if(type==="incidents"){title="Incidents";rows=all.filter(r=>r.incident&&r.incident!=="None").sort((a,b)=>b.date.localeCompare(a.date)).map(r=>[r.date+" · "+r.incident,"Route "+r.routes+" · Bus "+r.bus,()=>{$("search").value=r.date;$("filterIncident").value=r.incident;switchTab("history")}])}
  if(type==="photos"){title="Shifts With Photos";rows=all.filter(r=>(r.photos||[]).length).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>[r.date+" · Route "+r.routes,(r.photos||[]).length+" photo(s)",()=>{$("search").value=r.date;$("filterPhotos").value="has";switchTab("history")}])}
  if(type==="paid"){title="Overall Paid";const m={};all.forEach(r=>{const y=(r.date||"").slice(0,4);m[y]=(m[y]||0)+mins(r.paid)});rows=Object.entries(m).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,v])=>[k,hm(v),()=>{$("filterFrom").value=k+"-01-01";$("filterTo").value=k+"-12-31";switchTab("history")}])}

  box.innerHTML='<div class="drill-title"><h3>'+title+'</h3><button id="closeDrill" class="secondary">Close</button></div>';
  rows.slice(0,100).forEach(r=>{const d=document.createElement("div");d.className="drill-row";d.innerHTML='<div><strong>'+r[0]+'</strong><div class="drill-meta">'+r[1]+'</div></div><button>View</button>';d.querySelector("button").onclick=r[2];box.appendChild(d)});
  $("closeDrill").onclick=()=>box.classList.add("hidden");
}
document.querySelectorAll(".work-chip").forEach(b=>b.onclick=()=>openWork(b.dataset.work));

$("cleanupPhotos").onclick=()=>{const r=load(),n=r.flatMap(x=>x.photos||[]).filter(expired).length;if(!n)return alert("No expired photos to clean up.");if(!confirm("Delete "+n+" expired photo(s)? Shift records stay."))return;r.forEach(x=>x.photos=(x.photos||[]).filter(p=>!expired(p)));save(r);renderHistory();renderSummary()};

function openPhoto(rid,pid){const r=load().find(x=>x.id===rid),p=r?.photos?.find(x=>x.id===pid);if(!p)return;modalCtx={rid,pid};$("modalImage").src=p.data;$("keepPhoto").checked=!!p.keep;$("photoModal").classList.remove("hidden")}
$("closeModal").onclick=()=>$("photoModal").classList.add("hidden");
$("keepPhoto").onchange=function(){const r=load(),rec=r.find(x=>x.id===modalCtx?.rid),p=rec?.photos?.find(x=>x.id===modalCtx?.pid);if(p){p.keep=this.checked;save(r);renderHistory();renderSummary()}};
$("deletePhoto").onclick=()=>{if(!modalCtx||!confirm("Delete this photo?"))return;const r=load(),rec=r.find(x=>x.id===modalCtx.rid);if(rec)rec.photos=(rec.photos||[]).filter(p=>p.id!==modalCtx.pid);save(r);$("photoModal").classList.add("hidden");renderHistory();renderSummary()};

function download(content,name,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$("exportCsv").onclick=()=>{const h=["Date","Route(s)","Crew","Run","Bus","Scheduled Start","Scheduled Finish","Actual Finish","Overtime Work 1.5x","Paid","Actual OT","Paid OT 2x","Unpaid OT","Step-back Missed","Step-back Time 1x","Side Camera","Incident","Notes","Photo Count"],rows=load().map(r=>[r.date,r.routes,r.crew,r.run,r.bus,r.scheduledStart,r.scheduledFinish,r.actualFinish,r.overtimeWork||"No",r.paid,r.actualOt,r.paidOt,r.unpaidOt,r.stepbackMissed,r.stepbackTime,r.camera,r.incident,r.notes,(r.photos||[]).length]),csv=[h,...rows].map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\\n");download(csv,"TTC_Shift_Log.csv","text/csv;charset=utf-8")};
$("exportJson").onclick=()=>download(JSON.stringify(load(),null,2),"TTC_Shift_Log_Backup.json","application/json");
$("importJson").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!Array.isArray(d))throw 0;reclassify(d);if(confirm("Restore "+d.length+" records? This replaces current records.")){save(d);renderHistory();renderSummary();alert("Backup restored.")}}catch{alert("Could not read backup file.")}e.target.value=""};
$("deleteAll").onclick=()=>{if(confirm("Delete ALL TTC records from this device?")){localStorage.removeItem(KEY);renderHistory();renderSummary()}};

currentWeekStart=sundayOf(today());
reclassify(load());reset();updateFilterState();renderHistory();renderSummary();

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js?v=10").catch(()=>{}));
});