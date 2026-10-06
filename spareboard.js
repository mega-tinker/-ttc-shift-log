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
    let pending=null, editBase=null, importData=null, importOriginal=null, importIds=[], importCurrentIds=new Set(), importBase=null,shownDate='';
    const read=()=>{const raw=localStorage.getItem(KEY);return raw?validate(JSON.parse(raw)):empty();};
    function day(date){return read().days.find(d=>d.date===date)||blankDay(date);}
    function linked(r){return read().links.some(l=>l.id===r.id&&l.date===r.date);}
    $('date').closest('.field-date').insertAdjacentHTML('afterend','<label class="sb-assignment">Work assignment<select id="assignmentType"><option value="regular">Regular</option><option value="spareboard">Spareboard</option></select></label>');
    const box=document.createElement('details');box.id='sbDetails';box.className='form-section sb-details hidden';box.open=true;
    box.innerHTML=`<summary>Spareboard day details</summary><p id="sbDayLabel"></p><p>Shared once across this day's Spareboard pieces. Waiting is recorded separately; pay and guarantees are not calculated.</p>
      <div class="quick-grid"><label>Assignment method<select id="sbMethod"><option value="unknown">Unknown</option><option value="preDetailed">Pre-detailed</option><option value="afterReport">Assigned after reporting</option><option value="mixed">Mixed</option></select></label>
      <label>Spareboard position (optional)<input id="sbPosition" type="text" inputmode="numeric"></label><label>Division (optional)<input id="sbDivision" type="text"></label><label>Report location (optional)<input id="sbLocation" type="text"></label></div>
      <label>Scheduled report date/time<input id="sbReportAt" type="datetime-local"></label><label>Actual report date/time (if different)<input id="sbActualReportAt" type="datetime-local"></label><label>Final release date/time (when known)<input id="sbReleaseAt" type="datetime-local"></label>
      <div id="sbPeriods"></div><button id="sbAddPeriod" type="button" class="secondary">Add report / wait / travel period</button>
      <details><summary>Guarantee / pay notes (optional)</summary><label>Eligibility recorded by operator<select id="sbGuarantee"><option value="notAssessed">Not assessed</option><option value="eligible">Operator-confirmed eligible</option><option value="ineligible">Operator-confirmed ineligible</option></select></label><label>Confirmed guarantee (hours:minutes)<input id="sbGuaranteeTime" placeholder="8:00" inputmode="numeric"></label></details>
      <label>Spareboard day notes<textarea id="sbNotes" rows="3"></textarea></label><p id="sbPreview" role="status"></p><button id="sbSaveDay" type="button" class="secondary">Save day details only</button><p id="sbStatus" role="status"></p>`;
    document.querySelector('.optional-section').before(box);
    document.querySelector('.filter-grid').insertAdjacentHTML('beforeend','<label>Work assignment<select id="filterAssignment"><option value="all">All</option><option value="regular">Regular</option><option value="spareboard">Spareboard</option></select></label>');
    $('historyList').insertAdjacentHTML('beforebegin','<div id="sbHistoryDays"></div>');
    document.querySelector('.work-summary').insertAdjacentHTML('afterend','<div class="summary-section hidden" id="sbSummary"><h2>Spareboard Work Summary</h2><p id="sbWeekStats"></p><button type="button" class="secondary" id="sbViewDays">View all Spareboard days</button><p>Recorded waiting and other duty are separate from platform and late OT. Pay assessment is not automated.</p></div>');
    $('importConflicts').insertAdjacentHTML('afterend','<div id="sbImportPreview" class="hidden"><h3>Spareboard backup details</h3><p id="sbImportText"></p><details><summary>Review current / backup details</summary><pre id="sbImportCompare"></pre></details><label>When merging Spareboard metadata<select id="sbImportChoice"><option value="keep">Keep current details where they conflict</option><option value="incoming">Use backup details where they conflict</option></select></label><p>Legacy backups do not remove existing Spareboard information. Replace uses all details from a new-format backup.</p></div>');
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
    function toggle(){box.classList.toggle('hidden',$('assignmentType').value!=='spareboard');}
    function preview(){try{const d=capture();validate({version:1,days:[d],links:[]});const t=totals(d);$('sbPreview').textContent='Recorded waiting: '+hm(t.waiting)+' · other duty: '+hm(t.other)+' · pay not assessed';}catch(e){$('sbPreview').textContent=e.message;}}
    function state(){return {mode:$('assignmentType').value,day:capture(),base:editBase,guaranteeText:$('sbGuaranteeTime').value};}
    function restore(s){$('assignmentType').value=s?.mode||'regular';show(s?.day||day($('date').value),s?.base);if(s?.guaranteeText!==undefined)$('sbGuaranteeTime').value=s.guaranteeText;toggle();preview();}
    function reset(){pending=null;$('assignmentType').value='regular';show(day($('date').value));toggle();}
    function edit(r){$('assignmentType').value=linked(r)?'spareboard':'regular';show(day(r.date));toggle();}
    function stage(r){
      const m=read();m.links=m.links.filter(l=>l.id!==r.id);
      if($('assignmentType').value==='spareboard'){
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
    function save(records){if(pending){transaction(localStorage,records,pending);pending=null;}else localStorage.setItem(SHIFT,JSON.stringify(records));}
    function snapshot(recordsRaw){localStorage.setItem(RECOVERY,JSON.stringify({recordsRaw,metadata:read()}));}
    function recoveryData(){
      const raw=localStorage.getItem(RECOVERY);
      if(!raw){if(read().days.length)throw Error('This older recovery copy has no paired Spareboard details. Export current data and use a full JSON backup.');return empty();}
      const pair=JSON.parse(raw);
      if(pair.recordsRaw!==localStorage.getItem('ttcShiftRecordsV4RecoveryV18'))throw Error('Recovery copies do not match. Current records are unchanged. Use a full JSON backup.');
      return validate(pair.metadata);
    }
    function exportData(records){const m=read(),ids=new Set(records.map(r=>r.id));return {...m,links:m.links.filter(l=>ids.has(l.id))};}
    function matches(r,q){const l=read().links.find(x=>x.id===r.id&&x.date===r.date),d=l&&day(l.date);return !!d&&('spareboard '+JSON.stringify(d)).toLowerCase().includes(q);}
    function filter(r){const v=$('filterAssignment').value;return v==='all'||(v==='spareboard')===linked(r);}
    function openDay(date){if(!api.discard())return;api.reset();$('date').value=date;$('assignmentType').value='spareboard';show(day(date));toggle();api.recalc();api.switchTab('new');api.persistDraft();window.scrollTo(0,0);}
    function renderDays(){
      const m=read(),records=api.load(),host=$('sbHistoryDays');host.replaceChildren();
      if($('filterAssignment').value==='regular'||api.exact())return;
      const q=$('search').value.trim().toLowerCase(),from=$('filterFrom').value,to=$('filterTo').value;
      const filtered=api.filtered();
      const pieceFilters=['filterRoute','filterCrew','filterRun','filterBus'].some(k=>$(k).value)||['filterOt','filterStepback','filterIncident','filterCamera','filterPhotos'].some(k=>$(k).value!=='all');
      for(const d of [...m.days].sort((a,b)=>$('sortOrder').value==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date))){
        const pieces=records.filter(r=>r.date===d.date&&m.links.some(l=>l.id===r.id&&l.date===d.date)),visible=filtered.some(r=>pieces.some(p=>p.id===r.id));
        if(from&&d.date<from||to&&d.date>to||pieceFilters&&!visible||q&&!visible&&!('spareboard '+JSON.stringify(d)).toLowerCase().includes(q))continue;
        const t=totals(d),el=document.createElement('details');el.className='record-card sb-day-card';
        el.innerHTML='<summary>Spareboard · '+esc(d.date)+' · '+pieces.length+' piece(s)</summary><p>Recorded waiting '+hm(t.waiting)+' · other duty '+hm(t.other)+' · pay not assessed</p><p>Report: '+esc(d.reportAt||'Not entered')+' · Actual report: '+esc(d.actualReportAt||'Not entered')+' · Release: '+esc(d.releaseAt||'Not entered')+'</p><p>'+esc([d.division,d.location,d.position?'Position '+d.position:'',d.method].filter(Boolean).join(' · '))+'</p><p>Guarantee: '+esc(d.guarantee)+(d.guaranteeMinutes===null?'':' · operator-entered '+hm(d.guaranteeMinutes))+'</p>'+d.periods.map(p=>'<p>'+esc(labels[p.kind])+': '+esc(p.start)+' → '+esc(p.end)+' ('+hm(elapsed(p.start,p.end))+')'+(p.included?' · included in scheduled time':'')+' '+esc(p.notes)+'</p>').join('')+'<p>'+esc(d.notes)+'</p><button type="button" class="secondary">Edit day details</button>';
        el.querySelector('button').onclick=()=>openDay(d.date);host.appendChild(el);
      }
    }
    function summary(start,end){const m=read(),days=m.days.filter(d=>d.date>=start&&d.date<=end),records=api.load(),pieces=records.filter(r=>r.date>=start&&r.date<=end&&linked(r));$('sbSummary').classList.toggle('hidden',!m.days.length);$('sbWeekStats').textContent='This week: '+days.length+' Spareboard day(s) · '+pieces.length+' piece(s) · '+hm(days.reduce((n,d)=>n+totals(d).waiting,0))+' recorded waiting. All time: '+m.days.length+' day(s).';}
    function prepareImport(data,plan){
      importBase=localStorage.getItem(KEY);importData=null;importOriginal=null;importIds=[];importCurrentIds=new Set(plan.filter(p=>p.current).map(p=>p.current.id));$('sbImportPreview').classList.add('hidden');
      if(!data.spareboard)return;
      importData=copy(validate(data.spareboard));importOriginal=copy(importData);const ids=new Set(plan.map(p=>p.incoming.id));
      if(importData.links.some(l=>!ids.has(l.id)))throw Error('Backup contains a Spareboard link without its shift.');
      const remap=new Map(plan.map(p=>[p.incoming.id,p.current?.id||p.incoming.id]));importIds=[...remap.values()];importData.links.forEach(l=>{const r=plan.find(p=>p.incoming.id===l.id).incoming;if(r.date!==l.date)throw Error('Spareboard day does not match its shift date.');l.id=remap.get(l.id);});
      validate(importData);$('sbImportChoice').value='keep';$('sbImportPreview').classList.remove('hidden');$('sbImportText').textContent=importData.days.length+' day(s), '+importData.links.length+' linked piece(s). Review before applying.';$('sbImportCompare').textContent='CURRENT\n'+JSON.stringify(read(),null,2)+'\nBACKUP\n'+JSON.stringify(importData,null,2);
    }
    function stageImport(replace,records){
      if(localStorage.getItem(KEY)!==importBase)throw Error('Spareboard information changed since preview. Choose the backup again.');
      let m=read();
      if(importData){
        if(replace)m=copy(importOriginal);
        else{m=copy(m);const use=$('sbImportChoice').value==='incoming';if(use)m.links=m.links.filter(l=>!importIds.includes(l.id));for(const d of importData.days){const i=m.days.findIndex(x=>x.date===d.date);if(i<0)m.days.push(d);else if(use)m.days[i]=d;}for(const l of importData.links){const i=m.links.findIndex(x=>x.id===l.id);if(i<0&&(use||!importCurrentIds.has(l.id)))m.links.push(l);else if(i>=0&&use)m.links[i]=l;}}
      }
      const ids=new Map(records.map(r=>[r.id,r.date]));m.links=m.links.filter(l=>ids.get(l.id)===l.date);validate(m);pending=JSON.stringify(m)===JSON.stringify(read())?null:m;
    }
    $('assignmentType').onchange=()=>{if(shownDate!==$('date').value)show(day($('date').value));toggle();api.persistDraft();};
    $('date').addEventListener('change',()=>{if($('assignmentType').value==='spareboard'&&JSON.stringify(capture())!==editBase&&!confirm('Discard unsaved Spareboard day details and switch dates?')){$('date').value=shownDate;api.recalc();return;}show(day($('date').value));api.persistDraft();});
    box.addEventListener('input',preview);box.addEventListener('change',preview);
    $('sbAddPeriod').onclick=()=>{addPeriod({id:crypto.randomUUID(),kind:'onReportWaiting',start:$('date').value+'T06:00',end:$('date').value+'T06:30',included:false,notes:''});preview();api.persistDraft();};
    $('sbSaveDay').onclick=()=>{try{stage({id:null,date:$('date').value});api.snapshot();save(api.load());editBase=JSON.stringify(day($('date').value));$('sbStatus').textContent='Day details saved. Work piece fields have not been saved.';api.persistDraft();api.render();}catch(e){pending=null;$('sbStatus').textContent=e.message;}};
    $('filterAssignment').onchange=()=>{api.clearExact();api.renderHistory();api.updateFilters();};
    $('sbViewDays').onclick=()=>{api.clearFilters();$('filterAssignment').value='spareboard';api.updateFilters();api.switchTab('history');window.scrollTo(0,0);};
    return {read,linked,reset,edit,state,restore,stage,save,snapshot,exportData,matches,filter,renderDays,summary,prepareImport,stageImport,
      cancel:()=>{pending=null;},hasPending:()=>pending!==null,recover:()=>recover(localStorage),
      restoreRecovery:records=>{pending=recoveryData();save(records);},
      recoveryData,
      deleteAll:()=>{pending=empty();}};
  }
  const api={KEY,SHIFT,JOURNAL,RECOVERY,empty,validate,blankDay,totals,elapsed,recover,transaction,create};root.Spareboard=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
