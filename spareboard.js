/* Optional metadata. Existing shift objects and platform/OT calculations are untouched. */
(function(root){
  'use strict';
  const KEY='ttcShiftRecordsV4SpareboardV1', SHIFT='ttcShiftRecordsV4', JOURNAL=KEY+'Transaction', RECOVERY=KEY+'Recovery';
  const empty=()=>({version:1,days:[],links:[]});
  const copy=x=>JSON.parse(JSON.stringify(x));
  const dateOK=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
  const stampOK=x=>typeof x==='string'&&dateOK(x.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(x);
  const elapsed=(a,b)=>(Date.parse(b+'Z')-Date.parse(a+'Z'))/60000;
  const kinds=['onReportWaiting','travel','vehicleWaiting','otherDuty'];
  const labels={onReportWaiting:'On-report waiting',travel:'Travel',vehicleWaiting:'Waiting with vehicle',otherDuty:'Other duty'};
  const holidays=m=>m.holidays||[];
  const DELETED=KEY+'DeletedDaysV1';
  const holidayLinks=m=>m.holidayLinks||[];
  function validate(m){
    if(!m||m.version!==1||!Array.isArray(m.days)||!Array.isArray(m.links))throw Error('Invalid Spareboard metadata.');
    const dates=new Set(),ids=new Set();
    for(const d of m.days){
      if(!dateOK(d.date)||dates.has(d.date))throw Error('Invalid or duplicate Spareboard day.');dates.add(d.date);
      if(!['unknown','preDetailed','afterReport','mixed'].includes(d.method))throw Error('Invalid assignment method.');
      for(const k of ['division','location','position','notes'])if(typeof d[k]!=='string')throw Error('Invalid '+k+'.');
      for(const k of ['reportAt','actualReportAt','releaseAt'])if(d[k]!==''&&!stampOK(d[k]))throw Error('Invalid report/release date and time.');
      if(d.releaseAt&&(d.actualReportAt||d.reportAt)&&elapsed(d.actualReportAt||d.reportAt,d.releaseAt)<0)throw Error('Release must follow report; check the dates.');
      if(!['notAssessed','eligible','ineligible'].includes(d.guarantee))throw Error('Invalid guarantee status.');
      if(d.guaranteeMinutes!==null&&(!Number.isInteger(d.guaranteeMinutes)||d.guaranteeMinutes<0))throw Error('Invalid confirmed guarantee duration.');
      if(!Array.isArray(d.periods))throw Error('Invalid duty periods.');
      const pids=new Set();
      for(const p of d.periods){
        if(typeof p.id!=='string'||!p.id||pids.has(p.id)||!kinds.includes(p.kind)||!stampOK(p.start)||!stampOK(p.end)||elapsed(p.start,p.end)<=0||typeof p.included!=='boolean'||typeof p.notes!=='string')throw Error('Complete each period with a valid type, start and later end (including dates).');pids.add(p.id);
      }
      const periods=[...d.periods].sort((a,b)=>a.start.localeCompare(b.start));
      for(let i=1;i<periods.length;i++)if(periods[i].start<periods[i-1].end)throw Error('Recorded Spareboard periods overlap. Correct them before saving.');
    }
    for(const l of m.links){if(!l||typeof l.id!=='string'||!l.id||ids.has(l.id)||!dates.has(l.date))throw Error('Invalid or duplicate Spareboard piece link.');ids.add(l.id);}
    const holidayDates=new Set(),holidayIds=new Set();
    if(m.holidays!==undefined&&!Array.isArray(m.holidays)||m.holidayLinks!==undefined&&!Array.isArray(m.holidayLinks))throw Error('Invalid holiday information.');
    for(const h of holidays(m)){if(!h||!dateOK(h.date)||h.minutes!==480||typeof h.notes!=='string'||holidayDates.has(h.date))throw Error('Invalid or duplicate holiday credit.');holidayDates.add(h.date);}
    for(const l of holidayLinks(m)){if(!l||typeof l.id!=='string'||!l.id||!dateOK(l.date)||holidayIds.has(l.id)||ids.has(l.id))throw Error('Invalid or duplicate holiday work link.');holidayIds.add(l.id);}
    return m;
  }
  function blankDay(date){return {date,method:'unknown',division:'',location:'',position:'',reportAt:'',actualReportAt:'',releaseAt:'',guarantee:'notAssessed',guaranteeMinutes:null,notes:'',periods:[]};}
  function totals(d){return {waiting:d.periods.filter(p=>p.kind==='onReportWaiting'&&!p.included).reduce((s,p)=>s+elapsed(p.start,p.end),0),other:d.periods.filter(p=>p.kind!=='onReportWaiting'&&!p.included).reduce((s,p)=>s+elapsed(p.start,p.end),0)};}
  function recover(storage){
    const raw=storage.getItem(JOURNAL);if(!raw)return;
    const j=JSON.parse(raw);
    if(!j||!['beforeShift','beforeMeta','afterShift','afterMeta'].every(k=>j[k]===null||typeof j[k]==='string'))throw Error('Unrecognized interrupted save. Export stored data before continuing.');
    const s=storage.getItem(SHIFT),m=storage.getItem(KEY);
    if(s===j.afterShift&&m===j.afterMeta){storage.removeItem(JOURNAL);return;}
    if(![j.beforeShift,j.afterShift].includes(s)||![j.beforeMeta,j.afterMeta].includes(m))throw Error('Data changed after an interrupted save. Export stored data before recovery.');
    for(const [k,v] of [[SHIFT,j.beforeShift],[KEY,j.beforeMeta]])v===null?storage.removeItem(k):storage.setItem(k,v);
    storage.removeItem(JOURNAL);
  }
  function transaction(storage,records,meta){
    validate(meta);
    const j={beforeShift:storage.getItem(SHIFT),beforeMeta:storage.getItem(KEY),afterShift:JSON.stringify(records),afterMeta:JSON.stringify(meta)};
    if(j.beforeShift!==null){try{if(JSON.stringify(JSON.parse(j.beforeShift))===j.afterShift)j.afterShift=j.beforeShift;}catch{}}
    storage.setItem(JOURNAL,JSON.stringify(j));
    try{storage.setItem(KEY,j.afterMeta);storage.setItem(SHIFT,j.afterShift);storage.removeItem(JOURNAL);}
    catch(e){try{recover(storage);}catch{}throw Error('Save did not complete. Keep this entry open. '+e.message);}
  }
  function create(api){
    const $=id=>document.getElementById(id), esc=api.esc, hm=api.hm;
    let pending=null, editBase=null, importData=null, importOriginal=null, importIds=[], importCurrentIds=new Set(), importBase=null,shownDate='',dayEditing=false;
    const read=()=>{const raw=localStorage.getItem(KEY);return raw?validate(JSON.parse(raw)):empty();};
    function day(date){return read().days.find(d=>d.date===date)||blankDay(date);}
    function linked(r){return read().links.some(l=>l.id===r.id&&l.date===r.date);}
    function holidayLinked(r){return holidayLinks(read()).some(l=>l.id===r.id&&l.date===r.date);}
    function holidayCredit(date){return holidays(read()).find(h=>h.date===date)?.minutes||0;}
    function holidayDates(){return holidays(read()).map(h=>h.date);}
    $('date').closest('.field-date').insertAdjacentHTML('afterend','<label class="sb-assignment">Work assignment<select id="assignmentType"><option value="regular">Regular</option><option value="spareboard">Spareboard</option></select></label>');
    $('assignmentType').insertAdjacentHTML('beforeend','<option value="holiday">Holiday</option>');
    $('assignmentType').closest('label').insertAdjacentHTML('afterend','<div id="holidayDetails" class="form-section hidden"><h2>Holiday pay + optional work</h2><p>8:00 holiday credit at 1×, once per date. Work saved as Holiday goes to Overtime Work 1.5×. Late OT stays separate.</p><label>Holiday name / notes (optional)<input id="holidayNotes" type="text"></label><button id="saveHolidayOnly" type="button" class="secondary">Save holiday pay only</button><p>No work? Use this button; route and times are not required. Working? Fill the usual piece fields below, then Save Shift or Save &amp; Next Piece. This button saves only the credit and holiday notes.</p><p id="holidayStatus" role="status"></p></div>');
    $('holidayDetails').insertAdjacentHTML('beforeend','<button id="removeHolidayCredit" type="button" class="danger-outline hidden">Remove holiday credit</button>');
    $('removeHolidayCredit').onclick=()=>{const date=$('date').value;if(!confirm('Remove only the 8:00 holiday credit for '+date+'? Saved work pieces and their 1.5× setting will remain.'))return;try{const m=read();if(holidayBase!==JSON.stringify(holidays(m).find(h=>h.date===date)||null))throw Error('Holiday credit changed elsewhere. Reopen it first.');api.snapshot();m.holidays=holidays(m).filter(h=>h.date!==date);pending=m;save(api.load());api.reset();api.render();api.switchTab('history');}catch(e){pending=null;alert('Could not remove holiday credit: '+e.message);}};
    const box=document.createElement('details');box.id='sbDetails';box.className='form-section sb-details hidden';box.open=true;
    box.innerHTML=`<summary>Spareboard day details</summary><p id="sbDayLabel"></p><p>Shared once across this day's Spareboard pieces. Waiting is recorded separately; pay and guarantees are not calculated.</p>
      <div class="quick-grid"><label>Assignment method<select id="sbMethod"><option value="unknown">Unknown</option><option value="preDetailed">Pre-detailed</option><option value="afterReport">Assigned after reporting</option><option value="mixed">Mixed</option></select></label>
      <label>Spareboard position (optional)<input id="sbPosition" type="text" inputmode="numeric"></label><label>Division (optional)<input id="sbDivision" type="text"></label><label>Report location (optional)<input id="sbLocation" type="text"></label></div>
      <label>Scheduled report date/time<input id="sbReportAt" type="datetime-local"></label><label>Actual report date/time (if different)<input id="sbActualReportAt" type="datetime-local"></label><label>Final release date/time (when known)<input id="sbReleaseAt" type="datetime-local"></label>
      <div id="sbPeriods"></div><button id="sbAddPeriod" type="button" class="secondary">Add report / wait / travel period</button>
      <details><summary>Guarantee / pay notes (optional)</summary><label>Eligibility recorded by operator<select id="sbGuarantee"><option value="notAssessed">Not assessed</option><option value="eligible">Operator-confirmed eligible</option><option value="ineligible">Operator-confirmed ineligible</option></select></label><label>Confirmed guarantee (hours:minutes)<input id="sbGuaranteeTime" type="text" placeholder="8:00" inputmode="text" autocapitalize="off" spellcheck="false"></label></details>
      <label>Spareboard day notes<textarea id="sbNotes" rows="3"></textarea></label><p id="sbPreview" role="status"></p><button id="sbSaveDay" type="button" class="secondary">Save day details only</button><p id="sbStatus" role="status"></p>`;
    document.querySelector('.optional-section').before(box);
    box.insertAdjacentHTML('beforeend','<div id="sbDayEditActions" class="hidden"><div class="edit-delete-zone"><div><strong>Delete Spareboard day</strong><p id="sbDeleteDescription"></p><label id="sbDeleteChoiceLabel">What should be removed?<select id="sbDeleteChoice"><option value="details">Spareboard details only — keep work pieces</option><option value="pieces">Spareboard day and its linked work pieces</option></select></label></div><button id="sbDeleteDay" type="button" class="danger-outline">Delete Spareboard Day</button></div><button id="sbCancelDay" type="button" class="secondary">Cancel Edit</button></div>');
    $('restoreDeleted').insertAdjacentHTML('afterend','<details id="sbDeletedDays" class="hidden"><summary>Recover deleted Spareboard days</summary><p>Recovery stays on this device. Restore any wanted items before exporting your JSON backup.</p><div id="sbDeletedList"></div></details>');
    document.querySelector('.filter-grid').insertAdjacentHTML('beforeend','<label>Work assignment<select id="filterAssignment"><option value="all">All</option><option value="regular">Regular</option><option value="spareboard">Spareboard</option></select></label>');
    $('historyList').insertAdjacentHTML('beforebegin','<div id="sbHistoryDays"></div>');
    $('filterAssignment').insertAdjacentHTML('beforeend','<option value="holiday">Holiday</option>');
    $('sbHistoryDays').insertAdjacentHTML('beforebegin','<div id="holidayHistoryDays"></div>');
    $('weekPlatformLt8').closest('.pay-row').insertAdjacentHTML('afterend','<p id="holidayWeekInfo" class="daily-ot-preview hidden"></p>');
    document.querySelector('.work-summary').insertAdjacentHTML('afterend','<div class="summary-section hidden" id="holidaySummary"><h2>Holidays</h2><p id="holidayAllStats"></p><button type="button" class="secondary" id="holidayViewDays">View holiday entries</button></div>');
    document.querySelector('.work-summary').insertAdjacentHTML('afterend','<div class="summary-section hidden" id="sbSummary"><h2>Spareboard Work Summary</h2><p id="sbWeekStats"></p><button type="button" class="secondary" id="sbViewDays">View all Spareboard days</button><p>Recorded waiting and other duty are separate from platform and late OT. Pay assessment is not automated.</p></div>');
    $('importConflicts').insertAdjacentHTML('afterend','<div id="sbImportPreview" class="hidden"><h3>Spareboard / Holiday backup details</h3><p id="sbImportText"></p><details><summary>Review current / backup details</summary><pre id="sbImportCompare"></pre></details><label>When merging day / assignment details<select id="sbImportChoice"><option value="keep">Keep current details where they conflict</option><option value="incoming">Use backup details where they conflict</option></select></label><p>Legacy backups do not remove existing day information. Replace uses all details from a new-format backup.</p></div>');
    const fields={method:'sbMethod',position:'sbPosition',division:'sbDivision',location:'sbLocation',reportAt:'sbReportAt',actualReportAt:'sbActualReportAt',releaseAt:'sbReleaseAt',guarantee:'sbGuarantee',notes:'sbNotes'};
    function addPeriod(p){
      const el=document.createElement('div');el.className='sb-period';el.dataset.id=p.id;
      el.innerHTML=`<label>Period type<select data-sb="kind">${kinds.map(k=>'<option value="'+k+'">'+labels[k]+'</option>').join('')}</select></label><label>Start date/time<input data-sb="start" type="datetime-local"></label><label>End date/time<input data-sb="end" type="datetime-local"></label><label class="sb-check"><input type="checkbox" data-sb="included"> Already included in a piece's scheduled time</label><label>Period notes<input data-sb="notes" type="text"></label><button type="button" class="secondary">Remove period</button>`;
      for(const k of ['kind','start','end','notes'])el.querySelector('[data-sb="'+k+'"]').value=p[k];el.querySelector('[data-sb="included"]').checked=p.included;
      el.querySelector('button').onclick=()=>{el.remove();preview();api.persistDraft();};$('sbPeriods').appendChild(el);
    }
    function capture(){
      const d=blankDay(shownDate||$('date').value);for(const [k,id] of Object.entries(fields))d[k]=$(id).value;
      const gt=$('sbGuaranteeTime').value.trim();d.guaranteeMinutes=gt?(/^\d+:[0-5]\d$/.test(gt)?Number(gt.split(':')[0])*60+Number(gt.split(':')[1]):-1):null;
      d.periods=[...$('sbPeriods').children].map(el=>{const p={id:el.dataset.id};for(const k of ['kind','start','end','notes'])p[k]=el.querySelector('[data-sb="'+k+'"]').value;p.included=el.querySelector('[data-sb="included"]').checked;return p;});return d;
    }
    function show(d,base){
      shownDate=d.date;
      for(const [k,id] of Object.entries(fields))$(id).value=d[k];$('sbGuaranteeTime').value=d.guaranteeMinutes===null?'':hm(d.guaranteeMinutes);$('sbPeriods').replaceChildren();d.periods.forEach(addPeriod);editBase=base===undefined?JSON.stringify(day(d.date)):base;
      $('sbDayLabel').textContent=d.date+' · linked pieces share these details';$('sbStatus').textContent='';preview();
    }
    let holidayMode=false,priorOvertime='No',holidayBase='null';
    function toggle(){const mode=$('assignmentType').value;box.classList.toggle('hidden',mode!=='spareboard');$('holidayDetails').classList.toggle('hidden',mode!=='holiday');
      if(mode==='holiday'){if(!holidayMode)priorOvertime=$('overtimeWork').value;$('overtimeWork').value='Yes';$('overtimeWork').disabled=true;}
      else{if(holidayMode)$('overtimeWork').value=priorOvertime;$('overtimeWork').disabled=false;}holidayMode=mode==='holiday';
    }
    function showHoliday(date){const h=holidays(read()).find(h=>h.date===date)||null;holidayBase=JSON.stringify(h);$('removeHolidayCredit').classList.toggle('hidden',!h);$('holidayNotes').value=h?.notes||'';$('holidayStatus').textContent=api.load().some(r=>r.date===date&&!holidayLinked(r))?'Existing pieces on this date keep their saved pay categories. Edit each piece and select Holiday if it should be holiday work.':'';}
    function preview(){try{const d=capture();validate({version:1,days:[d],links:[]});const t=totals(d);$('sbPreview').textContent='Recorded waiting: '+hm(t.waiting)+' · other duty: '+hm(t.other)+' · pay not assessed';}catch(e){$('sbPreview').textContent=e.message;}}
    function setDayEditing(active){
      dayEditing=active;box.open=true;$('shiftForm').classList.toggle('sb-day-editing',active);
      $('shiftForm').noValidate=active;
      $('sbDayEditActions').classList.toggle('hidden',!active);$('sbSaveDay').textContent=active?'Update Spareboard Day':'Save day details only';
      $(active?'sbCancelDay':'sbStatus').before($('sbSaveDay'));
      const count=api.load().filter(r=>r.date===shownDate&&linked(r)).length;
      $('sbDeleteDescription').textContent=count?count+' linked work piece(s). Choose what to remove. Other entries on this date are kept.':'No linked work pieces. Only this Spareboard day will be removed.';
      $('sbDeleteChoiceLabel').classList.toggle('hidden',!count);$('sbDeleteChoice').value='details';
    }
    function state(){return {mode:$('assignmentType').value,dayEditing,day:capture(),base:editBase,guaranteeText:$('sbGuaranteeTime').value,holidayNotes:$('holidayNotes').value,holidayBase};}
    function restore(s){$('assignmentType').value=s?.mode||'regular';show(s?.day||day($('date').value),s?.base);if(s?.guaranteeText!==undefined)$('sbGuaranteeTime').value=s.guaranteeText;showHoliday($('date').value);if(s?.holidayNotes!==undefined)$('holidayNotes').value=s.holidayNotes;if(s?.holidayBase!==undefined)holidayBase=s.holidayBase;toggle();preview();setDayEditing(!!s?.dayEditing);}
    function reset(){setDayEditing(false);pending=null;holidayMode=false;$('overtimeWork').disabled=false;$('assignmentType').value='regular';show(day($('date').value));showHoliday($('date').value);toggle();}
    function edit(r){setDayEditing(false);holidayMode=false;$('assignmentType').value=holidayLinked(r)?'holiday':linked(r)?'spareboard':'regular';show(day(r.date));showHoliday(r.date);toggle();}
    function stage(r){
      const m=read();m.links=m.links.filter(l=>l.id!==r.id);
      if(m.holidayLinks)m.holidayLinks=m.holidayLinks.filter(l=>l.id!==r.id);
      if($('assignmentType').value==='holiday'){
        if(holidayBase!==JSON.stringify(holidays(m).find(h=>h.date===r.date)||null))throw Error('Holiday credit changed elsewhere. Reopen the date before saving.');
        if(r.id&&r.overtimeWork!=='Yes')throw Error('Holiday work must use Overtime Work 1.5×.');
        m.holidays=holidays(m).filter(h=>h.date!==r.date).concat({date:r.date,minutes:480,notes:$('holidayNotes').value});
        if(r.id)m.holidayLinks=holidayLinks(m).concat({id:r.id,date:r.date});
      }
      if($('assignmentType').value==='spareboard'){
        if(dayEditing&&!m.days.some(d=>d.date===r.date))throw Error('This Spareboard day was removed elsewhere. Reopen History before saving.');
        if(editBase!==JSON.stringify(day(r.date)))throw Error('Spareboard day changed elsewhere. Reopen the day before saving.');
        const d=capture();validate({version:1,days:[d],links:[]});
        if(d.date!==r.date)throw Error('Select the work date again to load its Spareboard details.');
        // A recorded wait must not silently count the same interval as a work piece.
        const pieces=api.load().filter(x=>x.date===r.date&&x.id!==r.id).concat(r.scheduledStart?[r]:[]);
        for(const p of d.periods.filter(x=>!x.included))for(const x of pieces){
          const start=x.date+'T'+x.scheduledStart;let end=x.date+'T'+x.scheduledFinish;
          if(x.scheduledFinish<x.scheduledStart)end=new Date(Date.parse(x.date+'T00:00Z')+86400000).toISOString().slice(0,10)+'T'+x.scheduledFinish;
          if(p.start<end&&p.end>start)throw Error('A duty period overlaps a scheduled piece. Correct it or mark it already included.');
        }
        m.days=m.days.filter(x=>x.date!==d.date).concat(d);if(r.id)m.links.push({id:r.id,date:r.date});
      }
      validate(m);pending=JSON.stringify(m)===JSON.stringify(read())?null:m;
    }
    function save(records){if(pending){transaction(localStorage,records,pending);pending=null;}else localStorage.setItem(SHIFT,JSON.stringify(records));holidayBase=JSON.stringify(holidays(read()).find(h=>h.date===$('date').value)||null);}
    function snapshot(recordsRaw){localStorage.setItem(RECOVERY,JSON.stringify({recordsRaw,metadata:read()}));}
    function recoveryData(){
      const raw=localStorage.getItem(RECOVERY);
      if(!raw){if(read().days.length)throw Error('This older recovery copy has no paired Spareboard details. Export current data and use a full JSON backup.');return empty();}
      const pair=JSON.parse(raw);
      if(pair.recordsRaw!==localStorage.getItem('ttcShiftRecordsV4RecoveryV18'))throw Error('Recovery copies do not match. Current records are unchanged. Use a full JSON backup.');
      return validate(pair.metadata);
    }
    function exportData(records){const m=read(),ids=new Map(records.map(r=>[r.id,r.date]));return {...m,links:m.links.filter(l=>ids.get(l.id)===l.date),...(m.holidayLinks?{holidayLinks:m.holidayLinks.filter(l=>ids.get(l.id)===l.date)}:{})};}
    function matches(r,q){if(holidayLinked(r)&&('holiday '+JSON.stringify(holidays(read()).find(h=>h.date===r.date)||{})).toLowerCase().includes(q))return true;const l=read().links.find(x=>x.id===r.id&&x.date===r.date),d=l&&day(l.date);return !!d&&('spareboard '+JSON.stringify(d)).toLowerCase().includes(q);}
    function filter(r){const v=$('filterAssignment').value;return v==='all'||v==='holiday'&&holidayLinked(r)||v==='spareboard'&&linked(r)||v==='regular'&&!linked(r)&&!holidayLinked(r);}
    function openDay(date){if(!api.discard())return;api.reset();$('date').value=date;$('assignmentType').value='spareboard';show(day(date));toggle();setDayEditing(true);api.recalc();api.switchTab('new');api.persistDraft();window.scrollTo(0,0);}
    function deletedDays(){const items=JSON.parse(localStorage.getItem(DELETED)||'[]');if(!Array.isArray(items))throw Error('Deleted Spareboard days could not be read.');return items;}
    function classifyDate(records,date){const changed=new Map(TTC.classify(records.filter(r=>r.date===date)).map(r=>[r.id,r]));return records.map(r=>changed.get(r.id)||r);}
    function deleteDay(){
      if(!dayEditing)return;
      try{
        const m=read(),d=m.days.find(x=>x.date===shownDate);
        if(!d||JSON.stringify(d)!==editBase)throw Error('This day changed elsewhere. Reopen it before deleting.');
        const records=api.load(),links=m.links.filter(l=>l.date===d.date),ids=new Set(links.map(l=>l.id));
        const pieces=records.filter(r=>r.date===d.date&&ids.has(r.id)),removePieces=$('sbDeleteChoice').value==='pieces';
        const question='Delete Spareboard details for '+d.date+'?\n\n'+(removePieces?'Also delete '+pieces.length+' linked work piece(s):\n'+pieces.map(r=>'Route '+r.routes+' · '+r.scheduledStart+'–'+r.scheduledFinish).join('\n'):'Keep all '+pieces.length+' work piece(s) with their current times and pay settings.')+'\n\nOther entries are kept. Recovery is available in Backup.';
        if(!confirm(question))return;
        // Write recovery first; a full/quota-limited device must not lose the day.
        const oldTrash=localStorage.getItem(DELETED),items=deletedDays();
        const item={id:crypto.randomUUID(),deletedAt:new Date().toISOString(),day:d,links:links.filter(l=>pieces.some(r=>r.id===l.id)),records:removePieces?pieces:[]};
        api.snapshot();localStorage.setItem(DELETED,JSON.stringify(items.concat(item)));
        m.days=m.days.filter(x=>x.date!==d.date);m.links=m.links.filter(l=>l.date!==d.date);
        const next=removePieces?classifyDate(records.filter(r=>!(r.date===d.date&&ids.has(r.id))),d.date):records;
        try{transaction(localStorage,next,m);}catch(e){if(oldTrash===null)localStorage.removeItem(DELETED);else localStorage.setItem(DELETED,oldTrash);throw e;}
        pending=null;api.reset();api.render();api.switchTab('history');
        alert('Spareboard day deleted. Restore it from Backup → Recover deleted Spareboard days.');
      }catch(e){alert('Deletion stopped. '+e.message);}
    }
    function restoreDay(id){
      try{
        const items=deletedDays(),item=items.find(x=>x.id===id);if(!item)return;
        const m=read(),records=api.load(),date=item.day.date;
        validate({version:1,days:[item.day],links:item.links});TTC.validate(item.records);
        if(m.days.some(d=>d.date===date))throw Error('A Spareboard day already exists on this date. It has not been overwritten.');
        if(item.records.some(r=>records.some(x=>x.id===r.id||TTC.fingerprint(x)===TTC.fingerprint(r))))throw Error('A deleted work piece is already present or matches an existing piece. Resolve that conflict before restoring.');
        const next=records.concat(item.records);
        if(item.links.some(l=>!next.some(r=>r.id===l.id&&r.date===l.date)||m.links.some(x=>x.id===l.id)||holidayLinks(m).some(x=>x.id===l.id)))throw Error('A linked work piece was changed, removed or reassigned. Restore from a full backup or resolve that conflict first.');
        if(!confirm('Restore Spareboard '+date+' and '+item.records.length+' deleted work piece(s)?'))return;
        api.snapshot();m.days.push(item.day);m.links.push(...item.links);
        transaction(localStorage,item.records.length?classifyDate(next,date):next,m);
        localStorage.setItem(DELETED,JSON.stringify(items.filter(x=>x.id!==id)));api.render();
      }catch(e){alert('Restore stopped. '+e.message);}
    }
    function renderDeletedDays(){
      const host=$('sbDeletedList');host.replaceChildren();const items=deletedDays();$('sbDeletedDays').classList.toggle('hidden',!items.length);
      for(const item of [...items].reverse()){
        const row=document.createElement('div'),button=document.createElement('button');button.type='button';button.className='secondary';
        button.textContent='Restore '+item.day.date+' · '+item.records.length+' deleted work piece(s)';button.onclick=()=>restoreDay(item.id);row.append(button);host.append(row);
      }
    }
    $('sbDeleteDay').onclick=deleteDay;
    $('sbCancelDay').onclick=()=>{if(JSON.stringify(capture())!==editBase&&!confirm('Discard your changes to this Spareboard day?'))return;api.reset();api.switchTab('history');};
    function renderDays(){
      const m=read(),records=api.load(),host=$('sbHistoryDays');host.replaceChildren();renderDeletedDays();
      renderHolidays();
      if(['regular','holiday'].includes($('filterAssignment').value)||api.exact())return;
      const q=$('search').value.trim().toLowerCase(),from=$('filterFrom').value,to=$('filterTo').value;
      const filtered=api.filtered();
      const pieceFilters=['filterRoute','filterCrew','filterRun','filterBus'].some(k=>$(k).value)||['filterOt','filterStepback','filterIncident','filterCamera','filterPhotos'].some(k=>$(k).value!=='all');
      for(const d of [...m.days].sort((a,b)=>$('sortOrder').value==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date))){
        const pieces=records.filter(r=>r.date===d.date&&m.links.some(l=>l.id===r.id&&l.date===d.date)),visible=filtered.some(r=>pieces.some(p=>p.id===r.id));
        if(from&&d.date<from||to&&d.date>to||pieceFilters&&!visible||q&&!visible&&!('spareboard '+JSON.stringify(d)).toLowerCase().includes(q))continue;
        const t=totals(d),card=document.createElement('div'),el=document.createElement('details');card.className='record-card sb-day-card';card.dataset.date=d.date;
        el.innerHTML='<summary>Spareboard · '+esc(d.date)+' · '+(pieces.length?pieces.length+' work piece(s)':'No work pieces saved')+'</summary><p>Recorded waiting '+hm(t.waiting)+' · other duty '+hm(t.other)+' · pay not assessed</p><p>Report: '+esc(d.reportAt||'Not entered')+' · Actual report: '+esc(d.actualReportAt||'Not entered')+' · Release: '+esc(d.releaseAt||'Not entered')+'</p><p>'+esc([d.division,d.location,d.position?'Position '+d.position:'',({unknown:'Assignment method: Not selected',preDetailed:'Pre-detailed',afterReport:'Assigned after reporting',mixed:'Mixed'})[d.method]].filter(Boolean).join(' · '))+'</p><p>Guarantee: '+esc(({notAssessed:'Not assessed',eligible:'Operator-confirmed eligible',ineligible:'Operator-confirmed ineligible'})[d.guarantee])+(d.guaranteeMinutes===null?'':' · operator-entered '+hm(d.guaranteeMinutes))+'</p>'+d.periods.map(p=>'<p>'+esc(labels[p.kind])+': '+esc(p.start)+' → '+esc(p.end)+' ('+hm(elapsed(p.start,p.end))+')'+(p.included?' · included in scheduled time':'')+' '+esc(p.notes)+'</p>').join('')+'<p>'+esc(d.notes)+'</p>';
        const editButton=document.createElement('button');editButton.type='button';editButton.className='edit-btn';editButton.textContent='Edit';editButton.setAttribute('aria-label','Edit Spareboard '+d.date);editButton.onclick=()=>openDay(d.date);card.append(el,editButton);host.appendChild(card);
      }
    }
    function renderHolidays(){
      const host=$('holidayHistoryDays');host.replaceChildren();if(['regular','spareboard'].includes($('filterAssignment').value)||api.exact())return;
      const q=$('search').value.trim().toLowerCase(),from=$('filterFrom').value,to=$('filterTo').value;
      const pieceFilters=['filterRoute','filterCrew','filterRun','filterBus'].some(k=>$(k).value)||['filterOt','filterStepback','filterIncident','filterCamera','filterPhotos'].some(k=>$(k).value!=='all');
      const visible=api.filtered();
      for(const h of [...holidays(read())].sort((a,b)=>$('sortOrder').value==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date))){
        if(from&&h.date<from||to&&h.date>to)continue;
        const pieces=visible.filter(r=>r.date===h.date&&holidayLinked(r));
        if(pieceFilters&&!pieces.length||q&&!('holiday '+h.date+' '+h.notes).toLowerCase().includes(q)&&!pieces.length)continue;
        const card=document.createElement('div');card.className='record-card holiday-row';card.dataset.date=h.date;
        card.innerHTML='<strong>Holiday</strong><button type="button" class="edit-btn">Edit</button>';
        card.querySelector('button').setAttribute('aria-label','Edit Holiday '+h.date);
        card.querySelector('button').onclick=()=>{if(!api.discard())return;api.reset();$('date').value=h.date;$('assignmentType').value='holiday';show(day(h.date));showHoliday(h.date);toggle();api.recalc();api.switchTab('new');api.persistDraft();window.scrollTo(0,0);};
        host.appendChild(card);
      }
    }
    function summary(start,end){const m=read(),days=m.days.filter(d=>d.date>=start&&d.date<=end),records=api.load(),pieces=records.filter(r=>r.date>=start&&r.date<=end&&linked(r));$('sbSummary').classList.toggle('hidden',!m.days.length);$('sbWeekStats').textContent='This week: '+days.length+' Spareboard day(s) · '+pieces.length+' piece(s) · '+hm(days.reduce((n,d)=>n+totals(d).waiting,0))+' recorded waiting. All time: '+m.days.length+' day(s).';}
    function orderHistory(){
      const list=$('historyList'),groups=new Map();
      for(const node of [...list.children,...$('holidayHistoryDays').children,...$('sbHistoryDays').children]){
        const date=node.dataset.date;if(!date)continue;if(!groups.has(date))groups.set(date,[]);groups.get(date).push(node);
      }
      list.replaceChildren();
      for(const date of [...groups.keys()].sort((a,b)=>$('sortOrder').value==='oldest'?a.localeCompare(b):b.localeCompare(a))){
        const nodes=groups.get(date);let heading=nodes.find(n=>n.classList.contains('day-heading'));
        if(!heading){heading=document.createElement('div');heading.className='day-heading';heading.dataset.date=date;heading.innerHTML='<div><strong>'+esc(date)+'</strong><span>No work pieces shown</span></div>';}
        list.append(heading,...nodes.filter(n=>n.classList.contains('holiday-row')),...nodes.filter(n=>n.classList.contains('sb-day-card')),...nodes.filter(n=>n!==heading&&!n.classList.contains('holiday-row')&&!n.classList.contains('sb-day-card')));
      }
    }
    function holidaySummary(start,end){
      const m=read(),hs=holidays(m),week=hs.filter(h=>h.date>=start&&h.date<=end),work=api.load().filter(holidayLinked);
      $('holidaySummary').classList.toggle('hidden',!hs.length&&!work.length);
      $('holidayAllStats').textContent='Selected week: '+week.length+' holiday(s) · '+hm(week.length*480)+' credit. All time: '+hs.length+' holiday(s) · '+hm(hs.length*480)+' credit. Holiday credit is already included in Platform Regular ≤ 8. Holiday work: '+work.length+' piece(s) · '+hm(work.reduce((n,r)=>n+TTC.duration(r.scheduledStart,r.scheduledFinish),0))+' at 1.5× (all time).';
    }
    function prepareImport(data,plan){
      importBase=localStorage.getItem(KEY);importData=null;importOriginal=null;importIds=[];importCurrentIds=new Set(plan.filter(p=>p.current).map(p=>p.current.id));$('sbImportPreview').classList.add('hidden');
      if(!data.spareboard)return;
      importData=copy(validate(data.spareboard));importOriginal=copy(importData);const ids=new Set(plan.map(p=>p.incoming.id));
      if([...importData.links,...holidayLinks(importData)].some(l=>!ids.has(l.id)))throw Error('Backup contains an assignment link without its shift.');
      const remap=new Map(plan.map(p=>[p.incoming.id,p.current?.id||p.incoming.id]));importIds=[...remap.values()];importData.links.forEach(l=>{const r=plan.find(p=>p.incoming.id===l.id).incoming;if(r.date!==l.date)throw Error('Spareboard day does not match its shift date.');l.id=remap.get(l.id);});
      holidayLinks(importData).forEach(l=>{const r=plan.find(p=>p.incoming.id===l.id).incoming;if(r.date!==l.date||r.overtimeWork!=='Yes')throw Error('Holiday work must match its date and 1.5× category.');l.id=remap.get(l.id);});
      validate(importData);$('sbImportChoice').value='keep';$('sbImportPreview').classList.remove('hidden');$('sbImportText').textContent=importData.days.length+' day(s), '+importData.links.length+' linked piece(s). Review before applying.';$('sbImportCompare').textContent='CURRENT\n'+JSON.stringify(read(),null,2)+'\nBACKUP\n'+JSON.stringify(importData,null,2);
      $('sbImportText').textContent+=' Holiday: '+holidays(importData).length+' credit(s), '+holidayLinks(importData).length+' work piece(s).';
    }
    function stageImport(replace,records){
      if(localStorage.getItem(KEY)!==importBase)throw Error('Spareboard information changed since preview. Choose the backup again.');
      let m=read();
      if(importData){
        if(replace)m=copy(importOriginal);
        else{m=copy(m);const use=$('sbImportChoice').value==='incoming';if(use)m.links=m.links.filter(l=>!importIds.includes(l.id));for(const d of importData.days){const i=m.days.findIndex(x=>x.date===d.date);if(i<0)m.days.push(d);else if(use)m.days[i]=d;}for(const l of importData.links){const i=m.links.findIndex(x=>x.id===l.id);if(i<0&&(use||!importCurrentIds.has(l.id)))m.links.push(l);else if(i>=0&&use)m.links[i]=l;}}
      }
      if(importData&&!replace){const use=$('sbImportChoice').value==='incoming';
        for(const h of holidays(importData)){const i=holidays(m).findIndex(x=>x.date===h.date);if(i<0)m.holidays=holidays(m).concat(h);else if(use)m.holidays[i]=h;}
        if(use&&m.holidayLinks)m.holidayLinks=m.holidayLinks.filter(l=>!importIds.includes(l.id));
        for(const l of holidayLinks(importData)){const i=holidayLinks(m).findIndex(x=>x.id===l.id);if(i<0&&(use||!importCurrentIds.has(l.id)))m.holidayLinks=holidayLinks(m).concat(l);else if(i>=0&&use)m.holidayLinks[i]=l;}
      }
      const ids=new Map(records.map(r=>[r.id,r.date]));m.links=m.links.filter(l=>ids.get(l.id)===l.date);
      if(m.holidayLinks)m.holidayLinks=m.holidayLinks.filter(l=>ids.get(l.id)===l.date&&records.find(r=>r.id===l.id).overtimeWork==='Yes');
      validate(m);pending=JSON.stringify(m)===JSON.stringify(read())?null:m;
    }
    $('assignmentType').onchange=()=>{if(shownDate!==$('date').value)show(day($('date').value));showHoliday($('date').value);toggle();api.recalc();api.persistDraft();};
    $('date').addEventListener('change',()=>{const mode=$('assignmentType').value,dirty=mode==='spareboard'&&JSON.stringify(capture())!==editBase||mode==='holiday'&&$('holidayNotes').value!==(JSON.parse(holidayBase)?.notes||'');if(dirty&&!confirm('Discard unsaved day details and switch dates?')){$('date').value=shownDate;api.recalc();return;}show(day($('date').value));showHoliday($('date').value);api.persistDraft();});
    $('saveHolidayOnly').onclick=()=>{try{if(!dateOK($('date').value))throw Error('Choose a valid date.');stage({id:null,date:$('date').value});api.snapshot();save(api.load());$('holidayStatus').textContent='Saved 8:00 holiday credit for this date. Work fields have not been saved.';api.render();api.persistDraft();}catch(e){pending=null;$('holidayStatus').textContent=e.message;}};
    box.addEventListener('input',preview);box.addEventListener('change',preview);
    $('sbAddPeriod').onclick=()=>{addPeriod({id:crypto.randomUUID(),kind:'onReportWaiting',start:$('date').value+'T06:00',end:$('date').value+'T06:30',included:false,notes:''});preview();api.persistDraft();};
    $('sbSaveDay').onclick=()=>{try{stage({id:null,date:$('date').value});api.snapshot();save(api.load());editBase=JSON.stringify(day($('date').value));if(dayEditing){api.reset();api.render();api.switchTab('history');return;}$('sbStatus').textContent='Day details saved. Work piece fields have not been saved.';api.persistDraft();api.render();}catch(e){pending=null;$('sbStatus').textContent=e.message;}};
    $('filterAssignment').onchange=()=>{api.clearExact();api.renderHistory();api.updateFilters();};
    $('sbViewDays').onclick=()=>{api.clearFilters();$('filterAssignment').value='spareboard';api.updateFilters();api.switchTab('history');window.scrollTo(0,0);};
    $('holidayViewDays').onclick=()=>{api.clearFilters();$('filterAssignment').value='holiday';api.updateFilters();api.switchTab('history');window.scrollTo(0,0);};
    return {read,linked,holidayLinked,holidayCredit,holidayDates,holidaySummary,reset,edit,state,restore,stage,save,snapshot,exportData,matches,filter,renderDays,orderHistory,summary,prepareImport,stageImport,
      isDayEditing:()=>dayEditing,
      cancel:()=>{pending=null;},hasPending:()=>pending!==null,recover:()=>recover(localStorage),
      restoreRecovery:records=>{pending=recoveryData();save(records);},
      recoveryData,
      deleteAll:()=>{pending=empty();}};
  }
  const api={KEY,SHIFT,JOURNAL,RECOVERY,empty,validate,blankDay,totals,elapsed,recover,transaction,create};root.Spareboard=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
