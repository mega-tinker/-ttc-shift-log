const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../spareboard.js'),T=require('../core.js');
const d=S.blankDay('2026-10-06');d.periods=[{id:'p',kind:'onReportWaiting',start:'2026-10-06T06:00',end:'2026-10-06T06:30',included:false,notes:''}];
const m={version:1,days:[d],links:[{id:'piece',date:d.date}]};assert.equal(S.totals(d).waiting,30);assert.deepEqual(S.validate(m),m);
assert.throws(()=>S.validate({...m,links:[{id:'piece',date:'2026-10-07'}]}));
assert.throws(()=>S.validate({...m,days:[{...d,periods:[d.periods[0],{...d.periods[0],id:'p2'}]}]}));
assert.equal(S.elapsed('2026-10-06T23:50','2026-10-07T00:20'),30);
function store(){const map=new Map([[S.SHIFT,'[]']]);return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
const st=store();S.transaction(st,[{id:'piece'}],m);assert.deepEqual(JSON.parse(st.getItem(S.KEY)),m);assert.equal(st.getItem(S.JOURNAL),null);
const failure=store(),set=failure.setItem;let fail=true;failure.setItem=(k,v)=>{if(k===S.SHIFT&&fail){fail=false;throw Error('quota');}set(k,v);};
assert.throws(()=>S.transaction(failure,[{id:'piece'}],m));assert.equal(failure.getItem(S.SHIFT),'[]');assert.equal(failure.getItem(S.KEY),null);
const interrupted=store();interrupted.setItem(S.JOURNAL,JSON.stringify({beforeShift:'[]',beforeMeta:null,afterShift:'[{"id":"piece"}]',afterMeta:JSON.stringify(m)}));interrupted.setItem(S.KEY,JSON.stringify(m));S.recover(interrupted);assert.equal(interrupted.getItem(S.KEY),null);assert.equal(interrupted.getItem(S.SHIFT),'[]');
console.log('PASS: metadata validation, midnight durations, overlap rejection, atomic save and interrupted-save recovery');

async function workflows(){
 const {JSDOM}=require('jsdom');
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const sample={id:'legacy',date:'2026-09-14',routes:'51',crew:'5109',run:'5',bus:'8899',scheduledStart:'08:00',scheduledFinish:'16:00',actualFinish:'',actualFinishDay:0,overtimeWork:'No',paid:'8:00',actualOt:'0:00',paidOt:'0:00',unpaidOt:'0:00',stepbackMissed:'No',stepbackTime:'',camera:'Yes',incident:'None',notes:'legacy note',photos:[]};
 const uploaded=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):null;
 const legacy=uploaded?T.validate(uploaded):[sample],raw=JSON.stringify(legacy);
 async function start(seed){
   const dom=new JSDOM(html,{url:'https://example.test/ttc/',runScripts:'outside-only'}),w=dom.window;await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
   const alerts=[];w.confirm=()=>true;w.alert=x=>alerts.push(x);w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
   for(const [k,v]of Object.entries(seed))w.localStorage.setItem(k,v);
   for(const file of ['core.js','spareboard.js','app.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
   const $=id=>w.document.getElementById(id),change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
   const submit=()=>{$('shiftForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.ok(!$('saveMessage').textContent.includes('Could not'),$('saveMessage').textContent);};
   return {dom,w,$,change,submit,alerts};
 }
 let a=await start({[S.SHIFT]:raw});let {$,w,change,submit}=a;
 assert.equal($('stepbackTime').inputMode,'text','duration keyboard must allow a colon');
 assert.equal($('sbGuaranteeTime').inputMode,'text','guarantee keyboard must allow a colon');
 assert.equal(w.localStorage.getItem(S.SHIFT),raw,'opening must not rewrite legacy data');assert.equal(w.localStorage.getItem(S.KEY),null);assert.equal($('assignmentType').value,'regular');assert.ok($('sbDetails').classList.contains('hidden'));assert.ok($('dataError').classList.contains('hidden'),$('dataError').textContent);
 // Edit old record without silently assigning Spareboard.
 w.document.querySelector('.edit-btn').click();assert.equal($('assignmentType').value,'regular');$('cancelEdit').click();assert.equal(w.localStorage.getItem(S.SHIFT),raw);
 // A no-change legacy merge must not normalize or rewrite any stored fields.
 Object.defineProperty($('importJson'),'files',{configurable:true,value:[{text:async()=>raw}]});
 await $('importJson').onchange({target:$('importJson')});$('mergeImport').click();
 assert.equal(w.localStorage.getItem(S.SHIFT),raw);assert.equal(w.localStorage.getItem(S.KEY),null);
 change('date','2026-10-06');change('assignmentType','spareboard');
 change('sbReportAt','2026-10-06T06:00');$('sbAddPeriod').click();$('sbSaveDay').click();
 assert.equal(w.localStorage.getItem(S.SHIFT),raw,'report-only save must preserve shift bytes');assert.equal(JSON.parse(w.localStorage.getItem(S.KEY)).days.length,1);
 // Fail closed when an interrupted recovery snapshot pairs different versions.
 const recoveryKey='ttcShiftRecordsV4RecoveryV18',recoveryRaw=w.localStorage.getItem(recoveryKey);
 w.localStorage.setItem(recoveryKey,'[]');const beforeFailure=w.localStorage.getItem(S.SHIFT);
 $('restoreRecovery').click();assert.ok(a.alerts.at(-1).includes('Recovery copies do not match'));assert.equal(w.localStorage.getItem(S.SHIFT),beforeFailure);
 w.localStorage.setItem(recoveryKey,recoveryRaw);
 for(const [k,v]of Object.entries({routes:'51',crew:'5109',run:'8',bus:'8899',scheduledStart:'06:30',scheduledFinish:'10:00',actualFinish:'10:06'}))change(k,v);
 $('saveNextPiece').click();assert.equal($('assignmentType').value,'spareboard');assert.equal($('date').value,'2026-10-06');assert.ok($('saveMessage').textContent.includes('Saved'),$('saveMessage').textContent);
 for(const [k,v]of Object.entries({routes:'25',crew:'2501',run:'5',bus:'6602',scheduledStart:'11:00',scheduledFinish:'15:30',actualFinish:'15:35'}))change(k,v);submit();
 const rows=JSON.parse(w.localStorage.getItem(S.SHIFT)),meta=JSON.parse(w.localStorage.getItem(S.KEY)),pieces=rows.filter(r=>r.date==='2026-10-06');assert.equal(pieces.length,2);assert.equal(meta.links.length,2);assert.equal(T.day(pieces).above8,0);assert.equal(T.day(pieces).paidOt,11);assert.equal(S.totals(meta.days[0]).waiting,30);assert.deepEqual(rows.filter(r=>r.date!=='2026-10-06'),T.classify(legacy));
 // Search / exact bus filters and metadata text.
 change('filterAssignment','spareboard');assert.equal(w.document.querySelectorAll('.rich-shift-card').length,2);change('filterBus','6602');assert.equal(w.document.querySelectorAll('.rich-shift-card').length,1);$('clearFilters').click();assert.equal($('filterAssignment').value,'all');
 // Draft recovery and override retain metadata without committing shifts.
 change('date','2026-10-07');change('assignmentType','spareboard');change('sbNotes','unfinished report note');
 const seed={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);seed[k]=w.localStorage.getItem(k);}a.dom.window.close();
 a=await start(seed);({$,w,change,submit}=a);assert.equal($('assignmentType').value,'spareboard');assert.equal($('sbNotes').value,'unfinished report note');assert.equal(w.localStorage.getItem(S.SHIFT),seed[S.SHIFT]);
 async function importBackup(data,replace=false){Object.defineProperty($('importJson'),'files',{configurable:true,value:[{text:async()=>JSON.stringify(data)}]});await $('importJson').onchange({target:$('importJson')});assert.ok(!$('importPreview').classList.contains('hidden'),a.alerts.at(-1));$(replace?'replaceImport':'mergeImport').click();}
 const full={format:'TTC Shift Log',schemaVersion:2,records:rows,spareboard:meta};await importBackup(full);assert.equal(JSON.parse(w.localStorage.getItem(S.SHIFT)).length,rows.length);assert.equal(JSON.parse(w.localStorage.getItem(S.KEY)).days.length,1);
 await importBackup({format:'TTC Shift Log',schemaVersion:1,records:rows});assert.equal(JSON.parse(w.localStorage.getItem(S.KEY)).links.length,2,'legacy merge must retain links');
 // Replace must keep original imported IDs, even when fingerprint matched another ID.
 const renamed=JSON.parse(JSON.stringify(full));const old=renamed.records.find(r=>r.date==='2026-10-06').id;renamed.records.find(r=>r.id===old).id='import-renamed';renamed.spareboard.links.find(l=>l.id===old).id='import-renamed';await importBackup(renamed,true);assert.ok(JSON.parse(w.localStorage.getItem(S.KEY)).links.some(l=>l.id==='import-renamed'));
 // New code keeps records usable by the untouched legacy validator / calculator.
 T.validate(JSON.parse(w.localStorage.getItem(S.SHIFT)));assert.equal(T.day(JSON.parse(w.localStorage.getItem(S.SHIFT)).filter(r=>r.date==='2026-10-06')).paidOt,11);
 // Old v18.4 UI must still render all new and old work pieces on code rollback.
 const cp=require('node:child_process');
 const oldFile=name=>cp.execFileSync('git',['show','cfe554654c52b580ae2fc61753d0590c9bc6f523:'+name],{cwd:root,encoding:'utf8'});
 const rollback=new JSDOM(oldFile('index.html'),{url:'https://example.test/ttc/',runScripts:'outside-only'}),rw=rollback.window;
 await new Promise(r=>rw.document.addEventListener('DOMContentLoaded',r,{once:true}));rw.confirm=()=>false;rw.alert=()=>{};rw.scrollTo=()=>{};
 const rollbackRaw=w.localStorage.getItem(S.SHIFT);rw.localStorage.setItem(S.SHIFT,rollbackRaw);rw.localStorage.setItem(S.KEY,w.localStorage.getItem(S.KEY));
 rw.eval(oldFile('core.js'));rw.eval(oldFile('app.js'));rw.document.dispatchEvent(new rw.Event('DOMContentLoaded'));
 assert.equal(rw.localStorage.getItem(S.SHIFT),rollbackRaw);assert.equal(rw.document.querySelectorAll('.rich-shift-card').length,rows.length);assert.ok(rw.document.getElementById('dataError').classList.contains('hidden'));
 rollback.window.close();
 assert.ok($('dataError').classList.contains('hidden'),$('dataError').textContent);a.dom.window.close();
 console.log('PASS: legacy '+legacy.length+' records, no load writes, report-only day, multi-piece save, unchanged platform/OT, filters, draft recovery, new/legacy merge, replace ID mapping and rollback-readable shifts');
}
workflows().catch(e=>{console.error(e);process.exitCode=1;});
