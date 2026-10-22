const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const S=require('../spareboard.js'),T=require('../core.js');
const source=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const legacy=T.validate(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
async function boot(storage){
 const dom=new JSDOM(source('index.html'),{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;
 await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
 const alerts=[];w.confirm=()=>true;w.alert=t=>alerts.push(t);w.scrollTo=()=>{};
 for(const [k,v]of Object.entries(storage))w.localStorage.setItem(k,v);
 for(const n of ['core.js','spareboard.js','app.js'])w.eval(source(n));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const $=id=>w.document.getElementById(id);
 return {dom,w,$,alerts,rows:()=>JSON.parse(w.localStorage.getItem(S.SHIFT)),meta:()=>JSON.parse(w.localStorage.getItem(S.KEY)),open:date=>w.document.querySelector('[aria-label="Edit Spareboard '+date+'"]').click()};
}
(async()=>{
 const date='2026-10-21',day=S.blankDay(date),emptyDate='2026-10-22';day.notes='Original shared note';
 const regular={...legacy[0],id:'regular',date,scheduledStart:'06:00',scheduledFinish:'08:00',actualFinish:''};
 const piece={...regular,id:'spare',scheduledStart:'09:00',scheduledFinish:'11:00'};
 const holiday={...regular,id:'holiday',scheduledStart:'12:00',scheduledFinish:'14:00',overtimeWork:'Yes'};
 const records=legacy.concat(T.classify([regular,piece,holiday]));
 const metadata={version:1,days:[day,S.blankDay(emptyDate)],links:[{id:'spare',date}],holidays:[{date,minutes:480,notes:'Keep'}],holidayLinks:[{id:'holiday',date}]};
 let b=await boot({[S.SHIFT]:JSON.stringify(records),[S.KEY]:JSON.stringify(metadata)}),{$,w}=b;
 const raw=w.localStorage.getItem(S.SHIFT);
 assert.equal(w.localStorage.getItem(S.KEY),JSON.stringify(metadata),'opening must not migrate metadata');
 b.open(date);assert.equal($('sbNotes').value,day.notes);assert.ok($('shiftForm').classList.contains('sb-day-editing'));
 assert.equal($('sbSaveDay').textContent,'Update Spareboard Day');
 $('sbNotes').value='Updated';$('sbSaveDay').click();assert.equal(b.meta().days.find(d=>d.date===date).notes,'Updated');assert.equal(w.localStorage.getItem(S.SHIFT),raw);
 b.open(date);$('sbNotes').value='Unsaved';w.confirm=()=>false;$('sbCancelDay').click();assert.ok($('shiftForm').classList.contains('sb-day-editing'));w.confirm=()=>true;$('sbCancelDay').click();assert.equal(b.meta().days.find(d=>d.date===date).notes,'Updated');
 // Edit remains reachable while the history details are collapsed.
 const edit=w.document.querySelector('[aria-label="Edit Spareboard '+date+'"]');assert.equal(edit.closest('details'),null);
 b.open(emptyDate);$('sbDeleteDay').click();assert.ok(!b.meta().days.some(d=>d.date===emptyDate));assert.equal(w.localStorage.getItem(S.SHIFT),raw);
 // Recovery is durable after a complete page reload.
 const storage=Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));b.dom.window.close();
 b=await boot(storage);({$,w}=b);$('sbDeletedList').querySelector('button').click();assert.ok(b.meta().days.some(d=>d.date===emptyDate));
 // Details-only removes assignment links while preserving every shift byte.
 b.open(date);$('sbDeleteDay').click();assert.equal(w.localStorage.getItem(S.SHIFT),raw);assert.equal(b.meta().links.length,0);assert.deepEqual(b.meta().holidays,metadata.holidays);
 $('sbDeletedList').querySelector('button').click();assert.deepEqual(b.meta().links,metadata.links);assert.equal(w.localStorage.getItem(S.SHIFT),raw);
 // Full deletion removes only linked pieces, never all records on that date.
 b.open(date);$('sbDeleteChoice').value='pieces';$('sbDeleteDay').click();assert.equal(b.rows().length,records.length-1);assert.ok(!b.rows().some(r=>r.id==='spare'));assert.deepEqual(b.rows().find(r=>r.id==='regular'),records.find(r=>r.id==='regular'));assert.deepEqual(b.rows().find(r=>r.id==='holiday'),records.find(r=>r.id==='holiday'));assert.deepEqual(b.rows().slice(0,legacy.length),legacy);
 $('sbDeletedList').querySelector('button').click();assert.deepEqual(b.rows().find(r=>r.id==='spare'),records.find(r=>r.id==='spare'));
 // Another tab's changes must not be deleted using an old editor.
 b.open(date);const changed=b.meta();changed.days.find(d=>d.date===date).notes='Other tab';w.localStorage.setItem(S.KEY,JSON.stringify(changed));$('sbDeleteDay').click();assert.ok(b.meta().days.some(d=>d.date===date));assert.match(b.alerts.at(-1),/changed elsewhere/);
 // If durable recovery cannot be written, deletion must stop before touching records.
 b.open(date);const beforeMeta=w.localStorage.getItem(S.KEY),beforeRows=w.localStorage.getItem(S.SHIFT),set=w.Storage.prototype.setItem;
 w.Storage.prototype.setItem=function(k,v){if(k===S.KEY+'DeletedDaysV1')throw Error('Storage full');return set.call(this,k,v);};
 $('sbDeleteDay').click();assert.equal(w.localStorage.getItem(S.KEY),beforeMeta);assert.equal(w.localStorage.getItem(S.SHIFT),beforeRows);w.Storage.prototype.setItem=set;
 assert.ok($('dataError').classList.contains('hidden'),$('dataError').textContent);
 b.dom.window.close();console.log('PASS Spareboard edit, cancel, delete scopes, reload recovery, stale-edit protection, storage failure and legacy preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
