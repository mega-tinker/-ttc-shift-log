const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const S=require('../spareboard.js'),T=require('../core.js');
const source=n=>fs.readFileSync(require('node:path').join(__dirname,'..',n),'utf8');
(async()=>{
 const legacy=T.validate(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),raw=JSON.stringify(legacy);
 const dom=new JSDOM(source('index.html'),{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;
 await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));const alerts=[];
 w.confirm=()=>true;w.alert=t=>alerts.push(t);w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.localStorage.setItem(S.SHIFT,raw);for(const n of ['core.js','spareboard.js','app.js'])w.eval(source(n));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const $=id=>w.document.getElementById(id),change=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));},rows=()=>JSON.parse(w.localStorage.getItem(S.SHIFT)),meta=()=>JSON.parse(w.localStorage.getItem(S.KEY));
 assert.equal(w.localStorage.getItem(S.SHIFT),raw);assert.equal(w.localStorage.getItem(S.KEY),null);assert.equal($('assignmentType').value,'regular');
 const date=$('date').value;
 change('assignmentType','holiday');change('holidayNotes','Test holiday');$('saveHolidayOnly').click();
 assert.equal(w.localStorage.getItem(S.SHIFT),raw,'pay-only must not write fake work or alter old entries');assert.equal(meta().holidays.length,1);
 assert.equal($('weekPlatformLt8').textContent,'8:00');assert.equal($('weekPlatformGt8').textContent,'0:00');assert.equal($('weekHeroPaid').textContent,'0:00');
 $('saveHolidayOnly').click();assert.equal(meta().holidays.length,1);assert.equal($('weekPlatformLt8').textContent,'8:00');
 function fields(start,finish,actual,route){for(const [k,v]of Object.entries({routes:route,crew:'123',run:'5',bus:'8899',scheduledStart:start,scheduledFinish:finish,actualFinish:actual}))change(k,v);}
 fields('07:00','10:00','10:06','51');$('saveNextPiece').click();assert.equal($('assignmentType').value,'holiday');assert.equal($('date').value,date);assert.equal($('overtimeWork').value,'Yes');
 fields('11:00','17:00','17:05','25');$('shiftForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 assert.equal(rows().length,legacy.length+2,$('saveMessage').textContent);assert.equal(meta().holidays.length,1);assert.equal(meta().holidayLinks.length,2);
 assert.equal($('weekPlatformLt8').textContent,'8:00');assert.equal($('weekPlatformGt8').textContent,'0:00');assert.equal($('weekOvertimeWork').textContent,'9:00');assert.equal($('weekPaidOt').textContent,'0:11');assert.equal($('weekHeroPaid').textContent,'9:00');
 assert.deepEqual(rows().slice(0,legacy.length),legacy);assert.equal($('assignmentType').value,'regular');assert.equal($('overtimeWork').value,'No');assert.equal($('overtimeWork').disabled,false);
 change('filterAssignment','holiday');assert.equal(w.document.querySelectorAll('.rich-shift-card').length,2);assert.equal($('holidayHistoryDays').children.length,1);
 change('filterAssignment','regular');assert.equal(w.document.querySelectorAll('.rich-shift-card').length,legacy.length);$('clearFilters').click();
 const full={format:'TTC Shift Log',schemaVersion:3,records:rows(),spareboard:meta()};
 async function imp(data,replace=false){Object.defineProperty($('importJson'),'files',{configurable:true,value:[{text:async()=>JSON.stringify(data)}]});await $('importJson').onchange({target:$('importJson')});assert.ok(!$('importPreview').classList.contains('hidden'),alerts.at(-1));$(replace?'replaceImport':'mergeImport').click();}
 await imp(full);await imp(full);assert.equal(rows().length,legacy.length+2);assert.equal(meta().holidays.length,1);assert.equal(meta().holidayLinks.length,2);
 await imp({format:'TTC Shift Log',schemaVersion:1,records:legacy});assert.equal(meta().holidays.length,1);assert.equal(meta().holidayLinks.length,2);
 // Removing credit preserves every actual shift and its premium category.
 const before=w.localStorage.getItem(S.SHIFT);$('holidayHistoryDays').querySelectorAll('button')[1].click();assert.equal(w.localStorage.getItem(S.SHIFT),before);assert.equal(meta().holidays.length,0);assert.equal($('weekOvertimeWork').textContent,'9:00');assert.equal($('weekPlatformLt8').textContent,'0:00');
 await imp(full,true);assert.equal(meta().holidays.length,1);assert.equal(meta().holidayLinks.length,2);assert.equal($('weekPlatformLt8').textContent,'8:00');
 // Corrupt/duplicate credits fail validation; old validators still accept all shifts.
 assert.throws(()=>S.validate({...meta(),holidays:[...meta().holidays,...meta().holidays]}));T.validate(rows());
 assert.ok($('dataError').classList.contains('hidden'),$('dataError').textContent);
 console.log('PASS holiday: unchanged old records, pay-only, once per date, multi-piece 1.5x, separate late OT, regular reset, filters, v3/legacy imports, credit deletion and rollback-readable work');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
