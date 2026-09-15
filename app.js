document.addEventListener("DOMContentLoaded",function(){
document.addEventListener("click",function(e){const b=e.target.closest("[data-route-suffix]");if(!b)return;const el=$("routes");if(!el)return;const s=b.dataset.routeSuffix;if(s==="Clear")el.value=el.value.replace(/[A-Za-z]+$/,"");else el.value=el.value.replace(/[A-Za-z]+$/,"")+s;el.dispatchEvent(new Event("input",{bubbles:true}));el.focus()});

document.addEventListener("gesturestart",function(e){e.preventDefault()},{passive:false});
document.addEventListener("gesturechange",function(e){e.preventDefault()},{passive:false});
document.addEventListener("gestureend",function(e){e.preventDefault()},{passive:false});

const KEY="ttcShiftRecordsV4";
const DRAFT=KEY+"DraftV18", RECOVERY=KEY+"RecoveryV18", TRASH=KEY+"DeletedV18";
let editRecordSnapshot=null, importCorrupt=false;
let draftBaseline="", suppressDraft=false, saving=false, photoBusy=false, importPlan=[], importBase="", exactRecordId=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notifyError(error){const box=$("dataError");box.textContent=error.message||String(error);box.classList.remove("hidden");}
window.addEventListener("error",e=>notifyError(e.error||Error(e.message)));
window.addEventListener("unhandledrejection",e=>notifyError(e.reason||Error("Operation failed. Your records were not replaced.")));
let editingId=null,pendingPhotos=[],modalCtx=null,currentWeekStart=null,lastDeleted=null,undoTimer=null,editSnapshot=null,pendingImport=null;
const $=id=>document.getElementById(id);

function load(){
  const raw=localStorage.getItem(KEY);if(raw===null)return [];
  try{return TTC.validate(JSON.parse(raw));}catch(e){throw Error("Stored data could not be read. No changes were made. Use Download Stored Data in Backup, then restore a valid backup. "+e.message);}
}
function save(v){TTC.validate(v);localStorage.setItem(KEY,JSON.stringify(v));}
function snapshot(){const raw=localStorage.getItem(KEY)||"[]";TTC.validate(JSON.parse(raw));localStorage.setItem(RECOVERY,raw);}
function backupData(records=load()){return {format:"TTC Shift Log",schemaVersion:1,appVersion:18,exportedAt:new Date().toISOString(),records};}
function backupDownload(name="TTC_Shift_Log_Backup_v18"){download(JSON.stringify(backupData(),null,2),name+"_"+today()+".json","application/json");}

function today(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function mins(v){const m=String(v||"").match(/^(\d+):([0-5]\d)$/);return m?+m[1]*60 + +m[2]:0}
function hm(n){n=Math.max(0,Math.round(n||0));return Math.floor(n/60)+":"+String(n%60).padStart(2,"0")}
function diff(a,b){const ma=String(a||"").match(/^(\d{1,2}):([0-5]\d)$/),mb=String(b||"").match(/^(\d{1,2}):([0-5]\d)$/);if(!ma||!mb)return 0;let s=+ma[1]*60 + +ma[2],f=+mb[1]*60 + +mb[2],d=f-s;if(d<0)d+=1440;return d}
function sundayOf(s){const d=new Date(s+"T12:00:00");d.setDate(d.getDate()-d.getDay());d.setHours(12,0,0,0);return d}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function iso(d){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function fmt(d){return new Intl.DateTimeFormat("en-CA",{month:"short",day:"numeric",year:"numeric"}).format(d)}

function reclassify(records){const result=TTC.classify(records);records.splice(0,records.length,...result);return records;}
function recalc(){
  const r={id:editingId||"preview",date:$("date").value,scheduledStart:$("scheduledStart").value,scheduledFinish:$("scheduledFinish").value,actualFinish:$("actualFinish").value,actualFinishDay:Number($("actualFinishDay").value)};
  const same=load().filter(x=>x.date===r.date&&x.id!==editingId);
  const result=TTC.classify([...same,r]).at(-1),d=TTC.day([...same,r]);
  ["paid","actualOt","paidOt","unpaidOt"].forEach(k=>$(k).value=result[k]);
  $("dailyOtPreview").textContent="Day's late OT: "+hm(d.actual)+" · "+(d.actual>=10?"paid at 2×":"unpaid below 0:10");
  const next=$("scheduledStart").value&&$("scheduledFinish").value&&$("scheduledFinish").value<$("scheduledStart").value;
  $("finishDayHelp").textContent=next?"Scheduled finish is the day after the shift date.":"Finish day is relative to the scheduled finish.";
}
["date","scheduledStart","scheduledFinish","actualFinish","actualFinishDay"].forEach(id=>{$(id).addEventListener("input",recalc);$(id).addEventListener("change",recalc)});

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
  suppressDraft=true;localStorage.removeItem(DRAFT);
  editingId=null;editSnapshot=null;editRecordSnapshot=null;pendingPhotos=[];$("shiftForm").reset();$("editDeleteZone").classList.add("hidden");$("cancelEdit").classList.add("hidden");document.querySelector(".save-bar").classList.remove("editing");
  $("date").value=today();$("camera").value="Unknown";$("incident").value="None";$("stepbackMissed").value="No";$("overtimeWork").value="No";
  $("paid").value="";$("actualOt").value=$("paidOt").value=$("unpaidOt").value="0:00";updateStepbackUI();
  $("saveMessage").textContent="";document.querySelector("#shiftForm .primary").textContent="Save Shift";renderPending();
  $("actualFinishDay").value="0";$("draftStatus").textContent="";draftBaseline=getDraftState();suppressDraft=false;recalc();
}

async function compress(file){
  const u=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u});
  let w=img.width,h=img.height,max=1600;if(Math.max(w,h)>max){const s=max/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s)}
  const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);
  return c.toDataURL("image/jpeg",.72);
}
$("photos").onchange=async e=>{
 photoBusy=true;try{for(const f of Array.from(e.target.files||[])){pendingPhotos.push({id:String(Date.now())+Math.random(),data:await compress(f),addedAt:new Date().toISOString(),keep:false});}renderPending();persistDraft();}catch(error){notifyError(Error("Photo could not be added. "+error.message));}finally{photoBusy=false;e.target.value="";}
};
function renderPending(){const b=$("photoPreview");b.innerHTML="";pendingPhotos.forEach((p,i)=>{const w=document.createElement("div");w.className="thumb-wrap";w.innerHTML='<img class="thumb" src="'+p.data+'"><button type="button" style="position:absolute;right:-5px;top:-5px;border:0;background:#7f1d1d;color:white;border-radius:50%;width:24px;height:24px">×</button>';w.querySelector("button").onclick=()=>{pendingPhotos.splice(i,1);renderPending();persistDraft()};b.appendChild(w)})}

function saveCurrentShift(keepForNext=false){
  if(saving||photoBusy){$("saveMessage").textContent="Please wait for photos to finish.";return false;}
  recalc();
  const records=load(),old=editingId?records.find(r=>r.id===editingId):null;
  const r={...old,id:editingId||String(Date.now())+Math.random(),date:$("date").value,routes:$("routes").value.trim(),crew:$("crew").value.trim(),run:$("run").value.trim(),bus:$("bus").value.trim(),scheduledStart:$("scheduledStart").value,scheduledFinish:$("scheduledFinish").value,actualFinish:$("actualFinish").value,actualFinishDay:Number($("actualFinishDay").value),overtimeWork:$("overtimeWork").value,paid:$("paid").value,actualOt:$("actualOt").value,paidOt:$("paidOt").value,unpaidOt:$("unpaidOt").value,stepbackMissed:$("stepbackMissed").value,stepbackTime:$("stepbackTime").value.trim(),camera:$("camera").value,incident:$("incident").value,notes:$("notes").value.trim(),photos:[...(old?.photos||[]),...pendingPhotos]};
  if(TTC.duration(r.scheduledStart,r.scheduledFinish)===0){$("saveMessage").textContent="Start and finish cannot be identical.";return false;}
  if(r.stepbackMissed==="Yes"&&!/^\d+:[0-5]\d$/.test(r.stepbackTime)){ $("saveMessage").textContent="Enter step-back time as hours:minutes, for example 0:15.";return false; }
  if(TTC.late(r)>720&&!confirm("Late OT exceeds 12 hours. Check the finish day. Save anyway?"))return false;
  if(!editingId&&records.some(x=>TTC.fingerprint(x)===TTC.fingerprint(r))){$("saveMessage").textContent="This shift already exists. Open it in History to make corrections.";return false;}
  if(editingId&&old&&editRecordSnapshot&&JSON.stringify(old)!==editRecordSnapshot){$("saveMessage").textContent="This shift changed since you opened it. Reopen it from History to review the latest record.";return false;}
  if(editingId&&!old){$("saveMessage").textContent="This record no longer exists. Review History before saving.";return false;}
  const i=records.findIndex(x=>x.id===r.id);if(i>=0)records[i]=r;else records.push(r);
  reclassify(records);
  try{
    saving=true;if(editingId)snapshot();save(records);
    renderHistory();renderSummary();
    if(keepForNext){
      const keepDate=r.date,keepCrew=r.crew;
      reset();
      $("date").value=keepDate;
      $("crew").value=keepCrew;recalc();persistDraft();
      $("saveMessage").textContent="Saved. Ready for the next piece.";
      $("routes").focus();
    }else{
      const message=editingId?"Shift updated.":"Shift saved.";reset();$("saveMessage").textContent=message;
    }
    return true;
  }catch(error){
    $("saveMessage").textContent="Could not complete save: "+error.message+". Keep this entry open and check your backup/storage.";
    return false;
  }finally{saving=false;}
}
$("shiftForm").onsubmit=e=>{e.preventDefault();saveCurrentShift(false)};
$("saveNextPiece").onclick=()=>{
  if(!$("shiftForm").reportValidity())return;
  saveCurrentShift(true);
};
$("clearForm").onclick=()=>{if(photoBusy)return;if(getDraftState()!==draftBaseline&&!confirm("Discard this unfinished entry?"))return;reset();};
$("noOtButton").onclick=()=>{
  const finish=$("scheduledFinish").value;
  if(!finish){$("saveMessage").textContent="Enter Scheduled Finish first.";return}
  $("actualFinish").value=finish;$("actualFinishDay").value="0";
  recalc();persistDraft();
  $("saveMessage").textContent="Actual Finish set to scheduled finish — no OT.";
  setTimeout(()=>{if($("saveMessage").textContent.includes("no OT"))$("saveMessage").textContent=""},1600);
};

function expired(p){if(!p?.addedAt||p.keep)return false;const a=new Date(p.addedAt),c=new Date();c.setMonth(c.getMonth()-6);return a<c}

function filteredRecords(){
  const q=$("search").value.trim().toLowerCase(),from=$("filterFrom").value,to=$("filterTo").value,route=$("filterRoute").value.trim().toLowerCase(),crew=$("filterCrew").value.trim().toLowerCase(),run=$("filterRun").value.trim().toLowerCase(),bus=$("filterBus").value.trim().toLowerCase(),ot=$("filterOt").value,step=$("filterStepback").value,inc=$("filterIncident").value,cam=$("filterCamera").value,ph=$("filterPhotos").value;
  let r=reclassify(load()).filter(x=>{
    if(exactRecordId&&x.id!==exactRecordId)return false;
    if(q&&!Object.values({...x,photos:""}).some(v=>String(v??"").toLowerCase().includes(q)))return false;
    if(from&&x.date<from)return false;if(to&&x.date>to)return false;
    if(route&&!String(x.routes||"").toLowerCase().split(/[\/,]+/).map(v=>v.trim()).includes(route))return false;
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
  const records=filteredRecords(),all=reclassify(load()),list=$("historyList");$("filterCount").textContent=records.length+" of "+all.length+" shift(s)";list.innerHTML="";
  if(!records.length){list.innerHTML='<div class="record-card empty-state"><strong>No matching records</strong><span>Try changing your search or filters.</span></div>';return}
  let lastDate=null;
  records.forEach(r=>{
    if(lastDate!==r.date){lastDate=r.date;const entries=all.filter(x=>x.date===r.date),d=TTC.day(entries),h=document.createElement("div");h.className="day-heading";
      h.innerHTML='<div><strong>'+esc(r.date)+'</strong><span>'+entries.length+' piece(s) for this date</span></div><div><b>'+hm(d.platform)+'</b><span>Paid scheduled</span></div><div><b>'+hm(d.paidOt)+'</b><span>Late OT 2×</span></div>';
      list.appendChild(h);
    }
    const paid=mins(r.paid),aot=mins(r.actualOt),pot=mins(r.paidOt),uot=mins(r.unpaidOt),sb=mins(r.stepbackTime);
    const completed=!!r.actualFinish,inc=r.incident&&r.incident!=="None",photos=(r.photos||[]).length,note=String(r.notes||"").trim();
    const flags=[];
    if(r.overtimeWork==="Yes")flags.push('<span class="status-pill purple">OT Work · 1.5×</span>');
    if(pot>0)flags.push('<span class="status-pill red">Paid OT · '+hm(pot)+' · 2×</span>');
    else if(uot>0)flags.push('<span class="status-pill amber">Unpaid OT · '+hm(uot)+'</span>');
    if(r.stepbackMissed==="Yes")flags.push('<span class="status-pill blue">Missed Step-back'+(sb?' · '+hm(sb):'')+'</span>');
    if(inc)flags.push('<span class="status-pill danger">Incident · '+esc(r.incident)+'</span>');
    if(photos)flags.push('<span class="status-pill neutral">📷 '+photos+'</span>');
    if(note)flags.push('<span class="status-pill neutral">Note</span>');
    const c=document.createElement("article");c.dataset.recordId=r.id;c.className="record-card rich-shift-card";
    c.innerHTML=`<div class="shift-accent ${inc?'has-incident':pot?'has-ot':''}"></div>
      <div class="card-head rich-head">
        <div class="route-block"><span class="date-line">${esc(r.date||"")}</span><strong class="route-number">Route ${esc(r.routes||"—")}</strong><span class="crew-line">Crew ${esc(r.crew||"—")} · Run ${esc(r.run||"—")} · Bus ${esc(r.bus||"—")}</span></div>
        <button class="edit-btn">Edit</button>
      </div>
      <div class="shift-time-story">
        <div><span>START</span><strong>${esc(r.scheduledStart||"—")}</strong></div><div class="time-arrow">→</div>
        <div><span>SCHEDULED</span><strong>${esc(r.scheduledFinish||"—")}</strong></div><div class="time-arrow">→</div>
        <div class="${completed?'actual-done':'actual-pending'}"><span>ACTUAL</span><strong>${esc(r.actualFinish||"Not entered")}</strong>${r.actualFinishDay===1?'<small class="finish-day-badge">Next day</small>':""}</div>
      </div>
      <div class="shift-pay-story">
        <div class="metric-main"><span>PAID</span><strong>${esc(r.paid||"0:00")}</strong><small>scheduled platform</small></div>
        <div><span>ACTUAL OT</span><strong>${esc(r.actualOt||"0:00")}</strong></div>
        <div class="${pot?'metric-hot':''}"><span>PAID OT 2×</span><strong>${esc(r.paidOt||"0:00")}</strong></div>
        <div><span>UNPAID OT</span><strong>${esc(r.unpaidOt||"0:00")}</strong></div>
      </div>
      <div class="status-strip">${flags.join("")||'<span class="status-pill good">Normal shift</span>'}</div>
      <div class="detail-band">
        <span><b>Side Camera</b> ${esc(r.camera||"Unknown")}</span>
        <span><b>Step-back</b> ${esc(r.stepbackMissed==="Yes"?"Missed "+(r.stepbackTime||""):"No")}</span>
        <span><b>Incident</b> ${esc(r.incident||"None")}</span>
      </div>
      <div class="history-photos"></div><div class="card-notes"></div>`;
    c.querySelector(".card-notes").textContent=note?("“"+note+"”"):"";
    c.querySelector(".edit-btn").onclick=()=>edit(r.id);
    const pb=c.querySelector(".history-photos");(r.photos||[]).forEach(p=>{const w=document.createElement("div");w.className="thumb-wrap";w.innerHTML='<img class="thumb" src="'+p.data+'">'+(p.keep?'<span class="keep-badge">Keep</span>':expired(p)?'<span class="expired-badge">6+ mo</span>':'');w.querySelector("img").onclick=()=>openPhoto(r.id,p.id);pb.appendChild(w)});
    list.appendChild(c);
  });
}

function getEditState(){
  return JSON.stringify({
    date:$("date").value,routes:$("routes").value,crew:$("crew").value,run:$("run").value,bus:$("bus").value,
    scheduledStart:$("scheduledStart").value,scheduledFinish:$("scheduledFinish").value,actualFinish:$("actualFinish").value,
    actualFinishDay:Number($("actualFinishDay").value),overtimeWork:$("overtimeWork").value,stepbackMissed:$("stepbackMissed").value,stepbackTime:$("stepbackTime").value,
    camera:$("camera").value,incident:$("incident").value,notes:$("notes").value
  });
}
function cancelEditing(){
  if(photoBusy)return;
  if(!editingId){switchTab("history");return}
  const changed=editSnapshot!==null && (getEditState()!==editSnapshot||pendingPhotos.length>0);
  if(changed && !confirm("Discard your changes?"))return;
  reset();
  switchTab("history");
  window.scrollTo(0,0);
}
$("cancelEdit").onclick=cancelEditing;

function edit(id){
  if(photoBusy)return;
  if(getDraftState()!==draftBaseline&&!confirm("Discard the unfinished entry and edit this shift?"))return;
  localStorage.removeItem(DRAFT);
  const r=load().find(x=>x.id===id);if(!r)return;editingId=id;pendingPhotos=[];
  ["date","routes","crew","run","bus","scheduledStart","scheduledFinish","actualFinish","overtimeWork","stepbackTime","camera","incident","notes"].forEach(k=>$(k).value=r[k]||"");
  $("actualFinishDay").value=String(r.actualFinishDay??(mins(r.actualFinish)<mins(r.scheduledFinish)&&mins(r.actualOt)>0?1:0));
  $("stepbackMissed").value=r.stepbackMissed||"No";$("overtimeWork").value=r.overtimeWork||"No";updateStepbackUI();recalc();document.querySelector("#shiftForm .primary").textContent="Update Shift";
  $("editDeleteZone").classList.remove("hidden");
  $("cancelEdit").classList.remove("hidden");
  document.querySelector(".save-bar").classList.add("editing");
  editSnapshot=getEditState();editRecordSnapshot=JSON.stringify(r);draftBaseline=getDraftState();
  switchTab("new");window.scrollTo(0,0);
}
function showUndoToast(){
  $("undoToast").classList.remove("hidden");
  clearTimeout(undoTimer);
  undoTimer=setTimeout(()=>{$("undoToast").classList.add("hidden");lastDeleted=null},7000);
}
function deleteEditedShift(){
  if(!editingId)return;
  const records=load(),idx=records.findIndex(x=>x.id===editingId);
  if(idx<0)return;
  const rec=records[idx];
  if(!confirm(`Delete this shift permanently?\n\n${rec.date||""} · Route ${rec.routes||"—"} · Run ${rec.run||"—"}\n\nYou will have 7 seconds to Undo.`))return;
  snapshot();lastDeleted={record:rec,index:idx};localStorage.setItem(TRASH,JSON.stringify(lastDeleted));
  records.splice(idx,1);
  reclassify(records);save(records);
  reset();renderHistory();renderSummary();switchTab("history");showUndoToast();
}
$("deleteEditingShift").onclick=deleteEditedShift;
$("undoDelete").onclick=()=>{
  if(!lastDeleted)return;
  const records=load(),i=Math.min(Math.max(lastDeleted.index,0),records.length);
  records.splice(i,0,lastDeleted.record);
  reclassify(records);save(records);
  lastDeleted=null;localStorage.removeItem(TRASH);clearTimeout(undoTimer);$("undoToast").classList.add("hidden");
  renderHistory();renderSummary();
};

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
["search","sortOrder","filterFrom","filterTo","filterRoute","filterCrew","filterRun","filterBus","filterOt","filterStepback","filterIncident","filterCamera","filterPhotos"].forEach(id=>{const el=$(id);el.addEventListener("input",()=>{exactRecordId=null;updateFilterState();renderHistory()});el.addEventListener("change",()=>{exactRecordId=null;updateFilterState();renderHistory()})});
$("clearFilters").onclick=()=>{$("search").value="";$("sortOrder").value="newest";["filterFrom","filterTo","filterRoute","filterCrew","filterRun","filterBus"].forEach(id=>$(id).value="");["filterOt","filterStepback","filterIncident","filterCamera","filterPhotos"].forEach(id=>$(id).value="all");updateFilterState();renderHistory()};

function total(records,f){return records.reduce((s,r)=>s+mins(r[f]),0)}
function renderSummary(){
  const all=reclassify(load());
  if(!currentWeekStart)currentWeekStart=sundayOf(today());
  const end=addDays(currentWeekStart,6),startISO=iso(currentWeekStart),endISO=iso(end);
  $("weekRange").textContent=fmt(currentWeekStart)+" – "+fmt(end);
  const week=all.filter(r=>r.date>=startISO&&r.date<=endISO),days={};const heroPaid=total(week,"paid");
  $("weekHeroPaid").textContent=hm(heroPaid);
  $("weekHeroShifts").textContent=week.length+" shift"+(week.length===1?"":"s");
  const heroRoutes=new Set();week.forEach(r=>String(r.routes||"").split(/[\/,]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>heroRoutes.add(x)));
  $("weekHeroRoutes").textContent=heroRoutes.size+" route"+(heroRoutes.size===1?"":"s");
  week.forEach(r=>(days[r.date]??=[]).push(r));

  let lt8=0,gt8=0,overtimeWork=0,actual=0,paidOt=0,unpaidOt=0,stepback=0;
  const body=$("dailyBreakdownBody");body.innerHTML="";
  const keys=Object.keys(days).sort();
  if(!keys.length)body.innerHTML='<tr><td colspan="9">No shifts in this week.</td></tr>';

  keys.forEach(date=>{
    const entries=days[date];
    const d=TTC.day(entries),dOvertimeWork=d.overtime,platform=d.platform,dlt=d.regular,dgt=d.above8,dactual=d.actual,dpaid=d.paidOt,dunpaid=d.unpaidOt,dstep=d.stepback;

    lt8+=dlt;gt8+=dgt;overtimeWork+=dOvertimeWork;actual+=dactual;paidOt+=dpaid;unpaidOt+=dunpaid;stepback+=dstep;

    const routes=[...new Set(entries.flatMap(r=>String(r.routes||"").split(/[\\/,]+/).map(x=>x.trim()).filter(Boolean)))].join(" / ");
    const buses=[...new Set(entries.map(r=>r.bus).filter(Boolean))].join(" / ");
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${esc(date)}</td><td>${esc(routes||"—")}</td><td>${esc(buses||"—")}</td><td>${hm(platform)}</td><td>${hm(dlt)}</td><td>${dgt?hm(dgt):"—"}</td><td>${dpaid?hm(dpaid):"—"}</td><td>${dunpaid?hm(dunpaid):"—"}</td><td>${dstep?hm(dstep):"—"}</td>`;
    body.appendChild(tr);
  });


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
  $("allPhotos").textContent=photos.length;$("allNotes").textContent=all.filter(r=>String(r.notes||"").trim()).length;
  $("allPaid").textContent=hm(total(all,"paid"));
  const ex=photos.filter(expired).length;$("expiredInfo").textContent=ex?ex+" photo(s) older than 6 months and not marked Keep.":"No expired photos.";
}

$("prevWeek").onclick=()=>{currentWeekStart=addDays(currentWeekStart,-7);renderSummary()};
$("nextWeek").onclick=()=>{currentWeekStart=addDays(currentWeekStart,7);renderSummary()};

function clearFilters(){exactRecordId=null;$("search").value="";$("sortOrder").value="newest";["filterFrom","filterTo","filterRoute","filterCrew","filterRun","filterBus"].forEach(id=>$(id).value="");["filterOt","filterStepback","filterIncident","filterCamera","filterPhotos"].forEach(id=>$(id).value="all");updateFilterState();}
function openRecord(id){clearFilters();exactRecordId=id;switchTab("history");$("filterBadge").textContent="Selected shift";$("clearFilters").classList.add("has-filters");document.querySelector(".filter-box").classList.add("filters-active");window.scrollTo(0,0);}
function openWork(type){
 const all=reclassify(load()),box=$("workDrilldown");box.classList.remove("hidden");box.replaceChildren();
 const title=document.createElement("h3");title.textContent={shifts:"All Shifts",routes:"Routes",buses:"Buses",incidents:"Incidents",photos:"Shifts With Photos",notes:"Notes",paid:"Overall Paid"}[type];box.appendChild(title);
 const close=document.createElement("button");close.className="secondary";close.textContent="Close";close.onclick=()=>box.classList.add("hidden");box.appendChild(close);
 const row=(heading,detail,action)=>{const el=document.createElement("div");el.className="drill-row";const text=document.createElement("div"),strong=document.createElement("strong"),meta=document.createElement("div"),button=document.createElement("button");strong.textContent=heading;meta.textContent=detail;meta.className="drill-meta";text.append(strong,meta);button.textContent="View";button.onclick=action;el.append(text,button);box.appendChild(el);};
 if(["routes","buses","paid"].includes(type)){
  const groups=new Map();all.forEach(r=>{const values=type==="routes"?String(r.routes).split(/[\/,]+/).map(x=>x.trim()).filter(Boolean):[type==="buses"?r.bus:r.date.slice(0,4)];values.forEach(k=>groups.set(k,(groups.get(k)||0)+(type==="paid"?mins(r.paid):1)));});
  [...groups].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).forEach(([k,v])=>row(k,type==="paid"?hm(v)+" scheduled hours":v+" shift(s)",()=>{clearFilters();if(type==="paid"){$("filterFrom").value=k+"-01-01";$("filterTo").value=k+"-12-31";}else $(type==="routes"?"filterRoute":"filterBus").value=k;updateFilterState();switchTab("history");}));
 }else{
  const records=all.filter(r=>type==="incidents"?r.incident&&r.incident!=="None":type==="notes"?String(r.notes||"").trim():type==="photos"?(r.photos||[]).length:true).sort((a,b)=>b.date.localeCompare(a.date)||b.scheduledStart.localeCompare(a.scheduledStart));
  records.forEach(r=>row(r.date+" · Route "+r.routes,"Run "+r.run+" · Bus "+r.bus+(type==="notes"?"\n"+r.notes:type==="incidents"?" · "+r.incident:type==="photos"?" · "+r.photos.length+" photo(s)":""),()=>openRecord(r.id)));
  if(!records.length){const empty=document.createElement("p");empty.textContent="No matching records.";box.appendChild(empty);}
 }
}
document.querySelectorAll(".work-chip").forEach(b=>b.onclick=()=>openWork(b.dataset.work));
$("clearFilters").onclick=()=>{clearFilters();renderHistory();};

$("cleanupPhotos").onclick=()=>{const r=load(),n=r.flatMap(x=>x.photos||[]).filter(expired).length;if(!n)return alert("No expired photos to clean up.");if(!confirm("Delete "+n+" expired photo(s)? Shift records stay."))return;snapshot();r.forEach(x=>x.photos=(x.photos||[]).filter(p=>!expired(p)));save(r);renderHistory();renderSummary()};

function openPhoto(rid,pid){const r=load().find(x=>x.id===rid),p=r?.photos?.find(x=>x.id===pid);if(!p)return;modalCtx={rid,pid};$("modalImage").src=p.data;$("keepPhoto").checked=!!p.keep;$("photoModal").classList.remove("hidden")}
$("closeModal").onclick=()=>$("photoModal").classList.add("hidden");
$("keepPhoto").onchange=function(){const r=load(),rec=r.find(x=>x.id===modalCtx?.rid),p=rec?.photos?.find(x=>x.id===modalCtx?.pid);if(p){p.keep=this.checked;save(r);renderHistory();renderSummary()}};
$("deletePhoto").onclick=()=>{if(!modalCtx||!confirm("Delete this photo?"))return;snapshot();const r=load(),rec=r.find(x=>x.id===modalCtx.rid);if(rec)rec.photos=(rec.photos||[]).filter(p=>p.id!==modalCtx.pid);save(r);$("photoModal").classList.add("hidden");renderHistory();renderSummary()};

function download(content,name,type){const b=new Blob([content],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$("exportCsv").onclick=()=>{const h=["Date","Route(s)","Crew","Run","Bus","Scheduled Start","Scheduled Finish","Actual Finish","Actual Finish Next Day","Overtime Work 1.5x","Paid","Actual OT","Paid OT 2x","Unpaid OT","Step-back Missed","Step-back Time 1x","Side Camera","Incident","Notes","Photo Count"],rows=reclassify(load()).map(r=>[r.date,r.routes,r.crew,r.run,r.bus,r.scheduledStart,r.scheduledFinish,r.actualFinish,(r.actualFinishDay??(mins(r.actualFinish)<mins(r.scheduledFinish)&&mins(r.actualOt)>0?1:0)),r.overtimeWork||"No",r.paid,r.actualOt,r.paidOt,r.unpaidOt,r.stepbackMissed,r.stepbackTime,r.camera,r.incident,r.notes,(r.photos||[]).length]),csv=[h,...rows].map(row=>row.map(v=>'"'+String(v??"").replace(/^[=+@-]/,"'"+String(v??"")[0]).replace(/"/g,'""')+'"').join(",")).join("\r\n");download(csv,"TTC_Shift_Log.csv","text/csv;charset=utf-8")};
$("exportJson").onclick=()=>{backupDownload();$("backupStatus").textContent="Download requested. Check Files to confirm the backup was saved.";};
function clearImportPreview(){pendingImport=null;importPlan=[];$("importJson").value="";$("importPreview").classList.add("hidden");}
$("importJson").onchange=async e=>{
 const f=e.target.files?.[0];if(!f)return;
 try{
  const incoming=TTC.validate(JSON.parse(await f.text()));let cur=[];importCorrupt=false;try{cur=load();}catch{importCorrupt=true;}importBase=localStorage.getItem(KEY);$("mergeImport").disabled=importCorrupt;importPlan=TTC.importPlan(cur,incoming);pendingImport=incoming;
  const dates=incoming.map(r=>r.date).sort();$("previewRange").textContent=dates.length?dates[0]+" – "+dates.at(-1):"Empty backup";
  $("previewShifts").textContent=incoming.length;$("previewNew").textContent=importPlan.filter(x=>x.kind==="new").length;$("previewDuplicates").textContent=importPlan.filter(x=>x.kind==="identical").length;$("previewChanged").textContent=importPlan.filter(x=>x.kind==="changed").length;
  $("previewNotes").textContent=incoming.filter(r=>r.notes).length;$("previewPhotos").textContent=incoming.reduce((s,r)=>s+(r.photos||[]).length,0);
  $("importConflicts").replaceChildren();
  importPlan.forEach((item,i)=>{if(item.kind!=="changed")return;const el=document.createElement("div");el.className="import-conflict";const h=document.createElement("strong");h.textContent=item.incoming.date+" · Route "+item.incoming.routes+" · Run "+item.incoming.run;el.appendChild(h);
    const details=document.createElement("div");details.className="conflict-details";
    for(const [label,r] of [["Current",item.current],["Backup",item.incoming]]){const block=document.createElement("div"),heading=document.createElement("b"),pre=document.createElement("pre");heading.textContent=label;
    const fields=[["Date",r.date],["Route",r.routes],["Crew",r.crew],["Run",r.run],["Bus",r.bus],["Start",r.scheduledStart],["Scheduled finish",r.scheduledFinish],["Actual finish",r.actualFinish||"Not entered"],["Finish day",(r.actualFinishDay??(mins(r.actualFinish)<mins(r.scheduledFinish)&&mins(r.actualOt)>0?1:0))===1?"Next day":"Same as scheduled"],["Overtime work",r.overtimeWork||"No"],["Missed step-back",r.stepbackMissed||"No"],["Step-back time",r.stepbackTime||"0:00"],["Side camera",r.camera||"Unknown"],["Incident",r.incident||"None"],["Notes",r.notes||"None"],["Photos",(r.photos||[]).length]];
    pre.textContent=fields.map(([name,value])=>name+": "+value).join("\n");block.append(heading,pre);(r.photos||[]).forEach(photo=>{const img=document.createElement("img");img.src=photo.data;img.alt=photo.keep?"Photo marked Keep":"Shift photo";img.title=img.alt;img.className="thumb";block.appendChild(img);});details.appendChild(block);}el.appendChild(details);
    const label=document.createElement("label");label.textContent="For this shift";const select=document.createElement("select");select.id="conflict-"+i;select.innerHTML='<option value="keep">Keep current record</option><option value="incoming">Use backup record, including its photos</option>';label.appendChild(select);el.appendChild(label);$("importConflicts").appendChild(el);
  });$("importPreview").classList.remove("hidden");
 }catch(error){clearImportPreview();alert("Backup was not imported. "+error.message);}
};
$("cancelImport").onclick=clearImportPreview;
function checkImport(){if(localStorage.getItem(KEY)!==importBase)throw Error("Records changed since the preview. Choose the backup again to refresh it.");}
$("mergeImport").onclick=()=>{
 if(!pendingImport||importCorrupt)return;try{checkImport();const merged=load();let added=0,changed=0;
 importPlan.forEach((item,i)=>{if(item.kind==="new"){merged.push(item.incoming);added++;}else if(item.kind==="changed"&&$("conflict-"+i).value==="incoming"){merged[merged.findIndex(r=>r.id===item.current.id)]={...item.incoming,id:item.current.id};changed++;}});
 if(added||changed){snapshot();save(reclassify(merged));}clearImportPreview();renderHistory();renderSummary();alert(added+" added; "+changed+" updated. A local recovery copy is available for any changes.");
 }catch(error){alert("Import stopped. "+error.message);}
};
$("replaceImport").onclick=()=>{
 if(!pendingImport||!confirm("Replace all records with this backup? Download a current backup first. A local recovery copy will also be kept."))return;
 try{checkImport();if(importCorrupt){localStorage.setItem(RECOVERY,localStorage.getItem(KEY)||"[]");download(localStorage.getItem(KEY)||"[]","TTC_Unreadable_Data.json","application/json");}else{snapshot();backupDownload("TTC_Shift_Log_Pre_Restore");}save(reclassify([...pendingImport]));$("dataError").classList.add("hidden");clearImportPreview();renderHistory();renderSummary();alert("Backup restored. Check Files for your downloaded backup; a local recovery copy is also available.");}catch(error){alert("Restore stopped. "+error.message);}
};

$("openDeleteAll").onclick=()=>{$("deleteAllConfirm").classList.remove("hidden");$("deleteConfirmText").value="";$("confirmDeleteAll").disabled=true;$("deleteConfirmText").focus()};
$("cancelDeleteAll").onclick=()=>{$("deleteAllConfirm").classList.add("hidden");$("deleteConfirmText").value="";$("confirmDeleteAll").disabled=true};
$("deleteConfirmText").oninput=()=>{$("confirmDeleteAll").disabled=$("deleteConfirmText").value.trim()!=="DELETE"};
$("confirmDeleteAll").onclick=()=>{if($("deleteConfirmText").value.trim()!=="DELETE")return;if(!confirm("Final confirmation: delete all active TTC shift records? A local recovery copy will remain."))return;snapshot();backupDownload("TTC_Shift_Log_Last_Chance");save([]);$("deleteAllConfirm").classList.add("hidden");$("deleteConfirmText").value="";renderHistory();renderSummary();alert("Shift records deleted. A local recovery copy remains. Check Files for the requested backup download.")};
function getDraftState(){return JSON.stringify({fields:JSON.parse(getEditState()),photos:pendingPhotos,editingId});}
function persistDraft(){
 if(suppressDraft)return;
 try{if(getDraftState()===draftBaseline){localStorage.removeItem(DRAFT);$("draftStatus").textContent="";return;}
 localStorage.setItem(DRAFT,JSON.stringify({state:JSON.parse(getDraftState()),editSnapshot,editRecordSnapshot,savedAt:new Date().toISOString()}));$("draftStatus").textContent="Draft saved on this device";
 }catch{ $("draftStatus").textContent="Draft could not be saved. Keep this page open and save the shift.";}
}
$("shiftForm").addEventListener("input",persistDraft);$("shiftForm").addEventListener("change",persistDraft);
window.addEventListener("beforeunload",e=>{if(photoBusy){e.preventDefault();e.returnValue="";}});
$("downloadRecovery").onclick=()=>{const raw=localStorage.getItem(RECOVERY);if(raw===null)return alert("No local recovery copy yet.");download(raw,"TTC_Local_Recovery_"+today()+".json","application/json");};
$("downloadRaw").onclick=()=>download(localStorage.getItem(KEY)||"[]","TTC_Stored_Data_"+today()+".json","application/json");
$("restoreRecovery").onclick=()=>{try{const raw=localStorage.getItem(RECOVERY);if(!raw)return alert("No local recovery copy yet.");const records=TTC.validate(JSON.parse(raw));if(!confirm("Restore the local recovery copy containing "+records.length+" shifts? Export your current data first."))return;download(localStorage.getItem(KEY)||"[]","TTC_Before_Recovery.json","application/json");save(records);location.reload();}catch(e){alert("Recovery stopped. "+e.message);}};
$("restoreDeleted").onclick=()=>{try{const item=JSON.parse(localStorage.getItem(TRASH)||"null");if(!item)return alert("No deleted shift available.");const cur=load();if(cur.some(r=>r.id===item.record.id))return alert("That shift is already present.");if(!confirm("Restore "+item.record.date+" · Route "+item.record.routes+"?"))return;cur.push(item.record);save(reclassify(cur));localStorage.removeItem(TRASH);renderHistory();renderSummary();}catch(e){alert("Restore stopped. "+e.message);}};
currentWeekStart=sundayOf(today());
try{
 const savedDraft=localStorage.getItem(DRAFT);load();reset();updateFilterState();renderHistory();renderSummary();
 if(savedDraft){
  localStorage.setItem(DRAFT,savedDraft);
  try{const draft=JSON.parse(savedDraft);if(confirm("Restore your unfinished shift entry?")){
    const state=draft.state;editingId=state.editingId;pendingPhotos=state.photos||[];
    Object.entries(state.fields).forEach(([k,v])=>{if($(k))$(k).value=v;});editSnapshot=draft.editSnapshot;editRecordSnapshot=draft.editRecordSnapshot||null;
    if(editingId){$("cancelEdit").classList.remove("hidden");$("editDeleteZone").classList.remove("hidden");document.querySelector(".save-bar").classList.add("editing");document.querySelector("#shiftForm .primary").textContent="Update Shift";}
    updateStepbackUI();recalc();renderPending();$("draftStatus").textContent="Draft restored — review and save";
  }else localStorage.removeItem(DRAFT);}catch(e){notifyError(Error("Draft could not be restored. Saved shift records are unchanged."));}
 }
}catch(error){notifyError(error);switchTab("backup");}

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js?v=18").catch(()=>{}));
});